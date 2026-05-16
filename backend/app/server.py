"""FastAPI server exposing the LangGraph pitchbook agent.

Endpoints:
  GET  /health                     - liveness + model name
  POST /chat/stream                - SSE stream of agent activity
  POST /templates/upload           - ingest a .pptx template (style/structure only)
  GET  /templates                  - list ingested templates
  GET  /files/{name}               - download a generated .pptx
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import traceback
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .agents import GRAPH, run_editor

# ---- Logging --------------------------------------------------------------
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pitchbook.server")

app = FastAPI(title="Pitchbook Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": exc.__class__.__name__},
    )


# Simple in-memory thread state so the RM can answer clarifying questions.
THREADS: dict[str, dict[str, Any]] = {}


class ChatRequest(BaseModel):
    thread_id: str | None = None
    message: str
    client: str | None = None
    topic: str | None = None


def _initial_state(req: ChatRequest, prior: dict[str, Any] | None) -> dict[str, Any]:
    state: dict[str, Any] = {
        "rm_query": req.message,
        "client": req.client or (prior or {}).get("client") or "",
        "topic": req.topic or (prior or {}).get("topic") or "",
        "completed": [],
        "events": [],
    }
    if not prior:
        return state

    # Carry forward any data agents already ran in a prior turn.
    for k in ("research", "crm", "competitors", "financials"):
        if prior.get(k):
            state[k] = prior[k]

    prior_plan = prior.get("agent_plan")
    prev_ask = prior.get("ask_user_about") or []

    if prior.get("needs_clarification"):
        # Clarifier asked a free-text question (e.g. "which client?"). Resume.
        state["rm_query"] = f"{prior.get('rm_query','')} || RM reply: {req.message}"
        state["resume_from_clarifier"] = True
        if prior_plan:
            state["prior_agent_plan"] = prior_plan
    elif prev_ask and prior_plan:
        # Classifier was ambiguous and asked the user. Resolve from this reply.
        state["prior_agent_plan"] = prior_plan
        state["ask_user_about_prev"] = prev_ask
        state["rm_query"] = f"{prior.get('rm_query','')} || RM reply: {req.message}"
    return state


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        logger.error("OPENAI_API_KEY missing")
        raise HTTPException(500, "OPENAI_API_KEY not configured on the backend")

    thread_id = req.thread_id or uuid.uuid4().hex
    prior = THREADS.get(thread_id)
    state = _initial_state(req, prior)
    logger.info("chat/stream thread=%s msg=%r", thread_id, req.message[:120])

    async def gen():
        yield _sse("thread", {"thread_id": thread_id})
        last_event_count = 0
        final_state: dict[str, Any] = {}
        try:
            async for chunk in GRAPH.astream(state, {"recursion_limit": 25}):
                for node, partial in chunk.items():
                    final_state.update(partial or {})
                    events = final_state.get("events", []) or []
                    new = events[last_event_count:]
                    last_event_count = len(events)
                    for ev in new:
                        yield _sse("agent", ev)
                await asyncio.sleep(0)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("Graph execution failed thread=%s\n%s", thread_id, tb)
            yield _sse("error", {"message": f"{e.__class__.__name__}: {e}"})
            return

        THREADS[thread_id] = final_state

        if final_state.get("needs_clarification"):
            yield _sse(
                "clarify",
                {"question": final_state.get("clarifying_question", "Could you share more details?")},
            )
        elif final_state.get("ask_user_about"):
            agents = final_state.get("ask_user_about", [])
            pretty = ", ".join(agents)
            yield _sse(
                "clarify",
                {"question": f"Should I include these agents? ({pretty}) — reply yes/no or list the ones you want."},
            )
        else:
            meta = final_state.get("deck_meta") or {}
            if meta:
                yield _sse("deck.meta", meta)
            slides = final_state.get("slides") or []
            for i, s in enumerate(slides):
                yield _sse("slide.add", {"index": i, "slide": s})
            yield _sse("final", {"answer": final_state.get("final_answer", "Done.")})
            logger.info("chat/stream done thread=%s slides=%d", thread_id, len(slides))

    return StreamingResponse(gen(), media_type="text/event-stream")


class EditRequest(BaseModel):
    instruction: str
    deck: dict[str, Any]
    activeSlideIndex: int | None = None


@app.post("/edit/stream")
async def edit_stream(req: EditRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(500, "OPENAI_API_KEY not configured on the backend")
    logger.info("edit/stream slides=%d active=%s instr=%r",
                len(req.deck.get("slides", []) or []), req.activeSlideIndex, req.instruction[:160])

    async def gen():
        yield _sse("agent", {"agent": "editor", "status": "running", "detail": "interpreting edit"})
        try:
            result = run_editor(req.deck, req.instruction, req.activeSlideIndex)
        except Exception as e:
            logger.exception("editor failed")
            yield _sse("error", {"message": f"{e.__class__.__name__}: {e}"})
            return
        patches = result.get("patches", [])
        for p in patches:
            yield _sse("slide.replace", p)
        yield _sse("agent", {"agent": "editor", "status": "done",
                             "detail": f"{len(patches)} slide{'s' if len(patches) != 1 else ''} updated"})
        yield _sse("final", {"answer": result.get("summary", "Updated.")})

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "openai_key": bool(os.environ.get("OPENAI_API_KEY")),
    }
