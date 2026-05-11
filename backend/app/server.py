"""FastAPI server exposing the LangGraph pitchbook agent."""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .agents import GRAPH

app = FastAPI(title="Pitchbook Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
        "completed": (prior or {}).get("completed", []) if prior and prior.get("needs_clarification") else [],
        "events": [],
    }
    # Carry forward prior data if the RM is answering a clarifier question
    if prior and prior.get("needs_clarification"):
        for k in ("research", "crm", "competitors", "financials"):
            if prior.get(k):
                state[k] = prior[k]
        # combine queries
        state["rm_query"] = f"{prior.get('rm_query','')} || RM follow-up: {req.message}"
        state["completed"] = []  # let supervisor re-plan with new info
    return state


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(500, "OPENAI_API_KEY not configured on the backend")

    thread_id = req.thread_id or uuid.uuid4().hex
    prior = THREADS.get(thread_id)
    state = _initial_state(req, prior)

    async def gen():
        yield _sse("thread", {"thread_id": thread_id})
        last_event_count = 0
        final_state: dict[str, Any] = {}
        try:
            # astream emits state updates per node
            async for chunk in GRAPH.astream(state, {"recursion_limit": 25}):
                # chunk = {node_name: partial_state}
                for node, partial in chunk.items():
                    final_state.update(partial or {})
                    events = final_state.get("events", []) or []
                    new = events[last_event_count:]
                    last_event_count = len(events)
                    for ev in new:
                        yield _sse("agent", ev)
                await asyncio.sleep(0)  # cooperative
        except Exception as e:
            yield _sse("error", {"message": str(e)})
            return

        THREADS[thread_id] = final_state

        if final_state.get("needs_clarification"):
            yield _sse(
                "clarify",
                {"question": final_state.get("clarifying_question", "Could you share more details?")},
            )
        else:
            payload: dict[str, Any] = {
                "answer": final_state.get("final_answer", "Done."),
            }
            if final_state.get("ppt_path"):
                payload["ppt_url"] = f"/files/{os.path.basename(final_state['ppt_path'])}"
                payload["ppt_filename"] = os.path.basename(final_state["ppt_path"])
            yield _sse("final", payload)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/files/{name}")
async def get_file(name: str):
    out_dir = os.environ.get("PPT_OUT_DIR", "/tmp/pitchbooks")
    path = os.path.join(out_dir, name)
    if not os.path.isfile(path) or ".." in name:
        raise HTTPException(404, "Not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=name,
    )


@app.get("/health")
async def health():
    return {"ok": True, "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini")}
