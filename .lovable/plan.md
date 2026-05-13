# Plan

## 1. Fix local dev server error (Windows)

The error is a Node ESM/CJS interop crash inside `@lovable.dev/vite-tanstack-config`. The project is locked to **bun** (`bun.lock`), not npm — running `npm install` + `npm run dev` produces this incompatibility on Windows.

Fix: tell you to use bun locally.

```powershell
npm i -g bun
bun install
bun run dev
```

No code change needed for this — it's an install-tool mismatch. (If you want to stay on npm, we'd need to downgrade or replace `lovable-tagger`, which fights the template.)

## 2. Replace TS backend with Python + LangGraph

Today the chat hits same-origin `/api/chat/stream` (TS). You want a real Python service. The `backend/` folder already has a scaffold — I'll harden it and wire the frontend to it.

### Backend changes (`backend/`)
- **`app/server.py`** — FastAPI app, CORS open, structured logging (JSON-ish lines with level/agent/thread_id), `/health`, `/chat/stream` (SSE), `/files/{name}`, plus new `/templates/upload` and `/templates` endpoints. Global exception handler returns `event: error` with the real traceback in logs and a clean message to the client.
- **`app/agents.py`** — LangGraph `StateGraph` with a supervisor node that routes to sub-agents (`clarifier`, `market_research`, `crm`, `competitor`, `financials`, `ppt_builder`). Same behavior as the TS version: clarifier may pause; supervisor decides next agent; ppt_builder produces the deck. Each node logs entry/exit and errors with `logger.exception`.
- **`app/tools.py`** — same dummy data sources as TS (`fetch_market_research`, `fetch_crm_account`, `fetch_competitor_landscape`, `fetch_financial_metrics`).
- **`app/ppt.py`** — `python-pptx` builder. If a template is selected/available, load it with `Presentation(template_path)` and reuse its slide masters/layouts, theme colors and fonts. Otherwise fall back to the procedural 11-slide deck (Cover → Closing) matching the current TS output.
- **`app/templates.py`** — new. Saves uploaded `.pptx` files to `backend/storage/templates/<id>.pptx`, extracts only **style/structure metadata** (theme colors, master/layout names, default fonts, slide count) using `python-pptx`. **No data extraction** from the source decks.
- **`app/store.py`** — in-memory store for generated `.pptx` bytes (keyed by filename), plus a small JSON index of uploaded templates.
- **`requirements.txt`** — already lists fastapi, uvicorn, langgraph, langchain-openai, python-pptx, sse-starlette. Confirmed.
- **Logging** — `logging.basicConfig(level=INFO)` + a `logger = logging.getLogger("pitchbook")` per module; every agent logs `start`, `done`, and `error` with thread_id. Errors include `logger.exception(...)` so the stack trace shows in the terminal.

### Run locally
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # (or source .venv/bin/activate)
pip install -r requirements.txt
set OPENAI_API_KEY=sk-...
uvicorn app.server:app --reload --port 8000
```

### Frontend wiring
- Set `VITE_AGENT_BACKEND_URL=http://localhost:8000` in a local `.env` (documented in `.env.example`).
- `src/lib/agent-client.ts` already reads `VITE_AGENT_BACKEND_URL`; no change needed beyond removing the same-origin fallback assumption.
- Delete (or leave dormant) the now-unused TS server routes: `src/routes/api/chat.stream.ts`, `src/routes/api/files.$name.ts`, `src/lib/pitchbook/*.server.ts`. I'll **remove** them so there's a single source of truth (Python).
- `streamChat` body gains `template_id?: string` so the user can pick which uploaded template to use.

## 3. PPT template ingestion (frontend → Python)

### Frontend
- New `TemplateManager` panel in `ChatView` (collapsible, top of chat):
  - File input (accepts `.pptx`, multi-file).
  - Lists uploaded templates with name, slide count, and a "Use" radio.
  - Selected `template_id` is sent with each chat request.
- New helpers in `agent-client.ts`: `uploadTemplate(file)`, `listTemplates()`.

### Backend
- `POST /templates/upload` (multipart) → saves file, parses style/structure with `python-pptx`, returns `{id, name, slide_count, theme_colors, fonts}`.
- `GET /templates` → list.
- Generation flow: when `template_id` is provided, `ppt.py` opens that file as the base `Presentation`, clones its first content layout per slide, and writes our agent-gathered text/charts into new slides using the template's masters. **No content** from the source deck is read or copied.

## Out of scope (call out explicitly)
- No persistence (templates + generated files live in-process; restart wipes them). Easy to swap to disk/S3 later.
- No auth on the Python service — fine for local dev, add before exposing publicly.
- Layout fidelity is "good enough": we inherit theme/fonts/masters from your MUFG decks, but the slide compositions are still chosen by our builder.

## Files touched
**Add/modify (Python):** `backend/app/server.py`, `agents.py`, `tools.py`, `ppt.py`, `templates.py`, `store.py`, `requirements.txt`, `README.md`.
**Modify (frontend):** `src/lib/agent-client.ts`, `src/components/chat/ChatView.tsx`, new `src/components/chat/TemplateManager.tsx`, `.env.example`.
**Delete (frontend):** `src/routes/api/chat.stream.ts`, `src/routes/api/files.$name.ts`, `src/lib/pitchbook/agents.server.ts`, `ppt.server.ts`, `tools.server.ts`, `store.server.ts`.
