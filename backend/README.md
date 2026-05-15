# Pitchbook Agent Backend (Python + LangGraph + FastAPI)

Multi-agent system: a **Supervisor** routes work between specialized sub-agents
(`clarifier`, `market_research`, `crm`, `competitor`, `financials`, `planner`).
The graph is built with LangGraph and streams **slide JSON** over SSE — the
frontend renders slides as TSX components in real time. A separate `/edit/stream`
endpoint applies chat-driven edits to an existing deck.

## Run locally

### macOS / Linux
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini      # optional
uvicorn app.server:app --reload --port 8000
```

### Windows (PowerShell)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:OPENAI_API_KEY = "sk-..."
uvicorn app.server:app --reload --port 8000
```

Health check: `curl http://localhost:8000/health`

## Endpoints

- `GET  /health` — liveness.
- `POST /chat/stream` — body `{thread_id?, message, client?, topic?}`. SSE events:
    - `thread`        `{thread_id}`
    - `agent`         `{agent, status, detail}` per agent step
    - `clarify`       `{question}` if more info is needed
    - `deck.meta`     `{title, client}` once the planner runs
    - `slide.add`     `{index, slide: {id, layoutId, props}}` for each slide
    - `final`         `{answer}`
    - `error`         `{message}`
- `POST /edit/stream` — body `{instruction, deck, activeSlideIndex?}`. SSE events:
    - `agent`, `slide.replace {index, slide}`, `final`, `error`.

The frontend ships a hand-authored library of TSX layouts in
`src/components/slides/layouts/` (Cover, SectionDivider, BulletList,
MetricGrid, PeerTable, TwoColumn, Closing). The planner picks a `layoutId`
per slide and fills `props`; layout metadata is mirrored in
`backend/app/layouts.py` and embedded in the planner's system prompt.

`.pptx` export happens entirely in the browser: each slide DOM is captured
to a 1920×1080 PNG (`html-to-image`) and embedded full-bleed via `pptxgenjs`.

## Frontend wiring

Set `VITE_AGENT_BACKEND_URL=http://localhost:8000` in the project root `.env`
so the chat UI knows where to reach this service. CORS is open by default.

## Logging

Every agent logs entry/exit and errors include full tracebacks. Override level via
`LOG_LEVEL=DEBUG`. Sample log line:
```
2026-05-13 10:11:12 [INFO] pitchbook.agents: supervisor: next=market_research reason=...
```

## Notes

- CRM, market data, competitor & financial sub-agents return **dummy data** for v1.
  Swap the bodies in `app/tools.py` for real integrations.
- Thread state lives in-memory (`THREADS` dict). For production, back it with
  Redis or Postgres.
- To add a new layout: create `src/components/slides/layouts/MyLayout.tsx` with a
  Zod schema + component, register it in `registry.ts`, and mirror the shape in
  `backend/app/layouts.py`.
