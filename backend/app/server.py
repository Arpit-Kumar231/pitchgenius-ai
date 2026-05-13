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

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from .agents import GRAPH
from .templates import get_template_path, list_templates, save_template

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
    template_id: str | None = None


def _initial_state(req: ChatRequest, prior: dict[str, Any] | None) -> dict[str, Any]:
    template_path = get_template_path(req.template_id) if req.template_id else None
    if req.template_id and not template_path:
        logger.warning("Unknown template_id=%s, falling back to default deck", req.template_id)

    state: dict[str, Any] = {
        "rm_query": req.message,
        "client": req.client or (prior or {}).get("client") or "",
        "topic": req.topic or (prior or {}).get("topic") or "",
        "completed": (prior or {}).get("completed", []) if prior and prior.get("needs_clarification") else [],
        "events": [],
        "template_path": template_path or (prior or {}).get("template_path"),
    }
    if prior and prior.get("needs_clarification"):
        for k in ("research", "crm", "competitors", "financials"):
            if prior.get(k):
                state[k] = prior[k]
        state["rm_query"] = f"{prior.get('rm_query','')} || RM follow-up: {req.message}"
        state["completed"] = []
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
    logger.info("chat/stream thread=%s template=%s msg=%r",
                thread_id, state.get("template_path") or "<none>", req.message[:120])

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
        else:
            payload: dict[str, Any] = {"answer": final_state.get("final_answer", "Done.")}
            if final_state.get("ppt_path"):
                payload["ppt_url"] = f"/files/{os.path.basename(final_state['ppt_path'])}"
                payload["ppt_filename"] = os.path.basename(final_state["ppt_path"])
            yield _sse("final", payload)
            logger.info("chat/stream done thread=%s ppt=%s", thread_id, payload.get("ppt_filename"))

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/templates/upload")
async def upload_template(file: UploadFile = File(...)):
    try:
        data = await file.read()
        if len(data) > 50 * 1024 * 1024:
            raise HTTPException(413, "Template too large (>50MB)")
        record = save_template(file.filename or "template.pptx", data)
        return record
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    except Exception as e:
        logger.exception("upload_template failed")
        raise HTTPException(500, f"Failed to ingest template: {e}")


@app.get("/templates")
async def get_templates():
    return {"templates": list_templates()}


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
    return {
        "ok": True,
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "openai_key": bool(os.environ.get("OPENAI_API_KEY")),
        "templates_loaded": len(list_templates()),
    }
