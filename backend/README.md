# Pitchbook Agent Backend (LangGraph + FastAPI)

Multi-agent system: a **Supervisor** routes work between specialized sub-agents
(`clarifier`, `market_research`, `crm`, `competitor`, `financials`, `ppt_builder`).
The graph is built with LangGraph and streams agent activity over SSE.

## Run locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini      # optional
uvicorn app.server:app --reload --port 8000
```

Health check: `curl http://localhost:8000/health`

## Endpoints

- `POST /chat/stream` — body `{thread_id?, message, client?, topic?}`. Returns
  `text/event-stream` with events:
    - `thread` `{thread_id}` — first event
    - `agent` `{agent, status, detail}` — every agent step
    - `clarify` `{question}` — supervisor wants more info from the RM
    - `final` `{answer, ppt_url?, ppt_filename?}` — done; PPT downloadable from `/files/<name>`
- `GET /files/{name}` — download a generated `.pptx`

## Frontend wiring

Set `VITE_AGENT_BACKEND_URL` (e.g. `https://your-host.example.com`) in the Lovable
project so the chat UI knows where to reach this service. CORS is open by default.

## Notes

- CRM, market data, competitor & financial sub-agents return **dummy data** for v1.
  Swap the bodies in `app/tools.py` for real integrations.
- The PPT template is built procedurally in `app/ppt.py`. To ingest your own
  `.pptx` templates later, load them with `Presentation("template.pptx")` and
  reuse the slide layouts instead of `_blank_deck()`.
- Thread state lives in-memory (`THREADS` dict). For production, back it with
  Redis or Postgres.
