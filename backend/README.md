# Pitchbook Agent Backend (Python + LangGraph + FastAPI)

Multi-agent system: a **Supervisor** routes work between specialized sub-agents
(`clarifier`, `market_research`, `crm`, `competitor`, `financials`, `ppt_builder`).
The graph is built with LangGraph and streams agent activity over SSE.

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

- `GET  /health` — liveness; reports model, whether the OpenAI key is set, and template count.
- `POST /chat/stream` — body `{thread_id?, message, client?, topic?, template_id?}`. Returns
  `text/event-stream` with events:
    - `thread`  `{thread_id}` — first event
    - `agent`   `{agent, status, detail}` — every agent step
    - `clarify` `{question}` — supervisor wants more info from the RM
    - `final`   `{answer, ppt_url?, ppt_filename?}` — done; PPT downloadable from `/files/<name>`
    - `error`   `{message}` — agent run failed (full stack trace in server logs)
- `POST /templates/upload` — multipart `file=<your.pptx>`. Returns `{id, name, slide_count, layouts, fonts}`.
- `GET  /templates` — list ingested templates.
- `GET  /files/{name}` — download a generated `.pptx`.

## Frontend wiring

Set `VITE_AGENT_BACKEND_URL=http://localhost:8000` in the project root `.env`
so the chat UI knows where to reach this service. CORS is open by default.

## Logging

Every agent logs entry/exit and errors include full tracebacks. Override level via
`LOG_LEVEL=DEBUG`. Sample log line:
```
2026-05-13 10:11:12 [INFO] pitchbook.agents: supervisor: next=market_research reason=...
```

## Template ingestion

Uploading a `.pptx` extracts ONLY style/structure (slide masters, layouts, theme
colors, default fonts). **No content is read from the source decks.** When you
pass `template_id` to `/chat/stream`, the generated deck inherits those masters
and fonts; agent-gathered data fills new slides built on top of them.

## Notes

- CRM, market data, competitor & financial sub-agents return **dummy data** for v1.
  Swap the bodies in `app/tools.py` for real integrations.
- Templates and generated `.pptx` files live on disk under `/tmp/pitchbook_templates`
  and `/tmp/pitchbooks` respectively (override with `TEMPLATES_DIR` / `PPT_OUT_DIR`).
- Thread state lives in-memory (`THREADS` dict). For production, back it with
  Redis or Postgres.
