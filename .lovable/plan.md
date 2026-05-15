
# Pitchbook v2: TSX Layouts + Live Editor

Replace the python-pptx path with a Gamma-style architecture: slides are React/TSX components defined by Zod schemas. The Python+LangGraph backend stops generating files and instead returns structured slide JSON. The frontend renders slides live in a split view, and chat edits patch the JSON in real time. A separate export step turns the rendered TSX into an editable .pptx.

## Architecture

```text
┌─────────────── Frontend (TanStack) ────────────────┐
│  ┌─────────────┐   ┌──────────────────────────┐   │
│  │   Chat      │   │   Deck Preview           │   │
│  │  (left)     │   │   - thumbnail strip      │   │
│  │  SSE events │   │   - active slide canvas  │   │
│  │  edit ops   │◄─►│   - renders <SlideX/>    │   │
│  └─────────────┘   └──────────────────────────┘   │
│         ▲                    ▲                    │
│         │ slide JSON (deck state in Zustand)      │
└─────────┼────────────────────┼────────────────────┘
          │ SSE                │ POST /export
          ▼                    ▼
┌──────── Python + LangGraph ──────────┐   ┌─ TS export route ─┐
│  supervisor → research/crm/...       │   │ headless render   │
│  → planner: picks layout IDs +       │   │ each slide → PNG  │
│    fills props (validated by JSON    │   │ → embed in .pptx  │
│    schemas mirroring Zod)            │   │ via pptxgenjs     │
│  emits: slide.add / slide.patch      │   └───────────────────┘
└──────────────────────────────────────┘
```

## Phase 1 — Hand-authored TSX layout library

Create `src/components/slides/`:
- `types.ts` — `SlideSpec = { id, layoutId, props }`, `Deck = { slides: SlideSpec[] }`.
- `registry.ts` — `LAYOUTS: Record<layoutId, { schema: ZodSchema, component: FC, name, description }>`.
- `SlideFrame.tsx` — fixed 1920×1080 canvas, scaled via `transform: scale()` to fit any container (per slides-app pattern).
- `layouts/` — 10 layouts: `Cover`, `AgendaTOC`, `ExecSummary`, `MarketOverview`, `CompetitiveLandscape`, `PeerComps`, `Financials`, `ValuationFootball`, `Timeline`, `Closing`. Each exports `{ schema, Component, meta }`.
- Each layout uses semantic tokens from `src/styles.css` (navy/gold pitchbook palette already added).

## Phase 2 — Backend returns slide JSON, not files

Rewrite `backend/app/`:
- Delete `ppt.py` (python-pptx builder).
- `layouts.py` — JSON-schema mirror of each TSX layout's Zod schema. Loaded into the planner's system prompt so the LLM only emits valid props.
- `agents.py` — supervisor + sub-agents unchanged for data gathering; new `planner` agent that picks `layoutId` per slide and fills props from gathered data. Validates each slide against its JSON schema before emitting.
- `server.py` — `/chat/stream` SSE events become:
  - `agent.start` / `agent.done` (existing)
  - `slide.add { index, slide: SlideSpec }`
  - `slide.patch { index, jsonPatch }` (for chat-driven edits)
  - `deck.complete`
- New `/edit` SSE endpoint: takes `{ deck, instruction }`, returns `slide.patch` events.
- Drop `/files/*` and `/templates/*` (template ingestion deferred to phase 3).

## Phase 3 — Live split-view editor

Replace `ChatView.tsx` with `EditorView.tsx`:
- Resizable 2-pane layout (`react-resizable-panels`, already installed).
- Left: chat (existing UI, agent badges, streaming text).
- Right: `<DeckPreview>` — vertical thumbnail strip + active `<SlideFrame>` rendering `LAYOUTS[slide.layoutId].component` with `slide.props`.
- Deck state in Zustand store; SSE events apply mutations live so the user watches slides materialize.
- Chat input has two modes: "Generate" (initial run) and "Edit" (sends `{deck, instruction}` to `/edit`). Active slide click scopes future edits to that slide only.

## Phase 4 — .pptx export

New TS server route `src/routes/api/export.pptx.ts`:
- Receives `Deck` JSON from client.
- For each slide: render the TSX layout to a 1920×1080 PNG using `satori` + `@resvg/resvg-js` (Worker-compatible, no headless Chrome — Cloudflare runtime can't spawn browsers).
- Embed each PNG as a full-bleed image into a pptxgenjs deck. Result: bankers can open in PowerPoint; layout pixel-perfect matches the preview. Editability is image-level, not text-level (acceptable tradeoff for v1; documented).
- Returns `.pptx` as download.

## Phase 5 (deferred) — Image-to-layout generator

Stub UI + endpoint only. Upload MUFG slide image → LLM generates Zod schema + TSX → user reviews → added to `registry.ts`. Requires sandboxed compile (esbuild-wasm) before merging — flagged as v2 work, not built now.

## Files to create / modify

**Frontend**
- create `src/components/slides/types.ts`, `registry.ts`, `SlideFrame.tsx`, `DeckPreview.tsx`
- create `src/components/slides/layouts/{Cover,AgendaTOC,ExecSummary,MarketOverview,CompetitiveLandscape,PeerComps,Financials,ValuationFootball,Timeline,Closing}.tsx`
- create `src/lib/deck-store.ts` (Zustand)
- create `src/components/chat/EditorView.tsx` (replaces ChatView in `routes/index.tsx`)
- modify `src/lib/agent-client.ts` — handle new SSE event types, add `streamEdit()`
- create `src/routes/api/export.pptx.ts`
- delete `src/components/chat/TemplateManager.tsx` (defer to phase 5)

**Backend**
- create `backend/app/layouts.py` (JSON schemas mirroring Zod)
- rewrite `backend/app/agents.py` (planner emits slide JSON)
- rewrite `backend/app/server.py` (`/chat/stream` + `/edit`, drop `/files`, `/templates`)
- delete `backend/app/ppt.py`, `backend/app/templates.py`
- update `backend/requirements.txt` (drop python-pptx)

## Out of scope (v1)

- Per-slide editable text in exported .pptx (slides export as images).
- Image-to-layout ingestion of MUFG decks (phase 5 stub only).
- Multi-user collab / persistence across sessions (in-memory store).
- Real data sources (still uses dummy `tools.py`).

## Open question

The export-as-images tradeoff matters: bankers can open the .pptx but can't edit individual text boxes in PowerPoint. If they need true text-level editability, phase 4 needs to map each TSX layout to a parallel python-pptx builder — roughly doubles layout authoring cost. I'll proceed with image export unless you say otherwise.
