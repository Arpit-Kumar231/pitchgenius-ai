
# Plan: Dynamic TSX templates + smarter editor

Big rewrite of the slide generation pipeline. I'll ship it in 4 phases so each phase is independently usable. Stack stays the same: Python+LangGraph backend, React+TanStack Start frontend, local filesystem storage in `backend/templates_store/`.

---

## Phase 1 — PPTX upload → reusable TSX layouts (Presenton-style)

**New backend module `backend/app/templates.py`**
- `POST /templates/upload` — multipart PPTX upload. Renders each slide to PNG using PyMuPDF (`pip install pymupdf python-pptx`). PPTX→PDF via `python-pptx`+`pdf2image` is heavy; instead we go PPTX → render via `aspose-slides` free-tier OR just send the slide PNG screenshots if user pre-renders. **Decision (matches your "screenshot-only" answer): user uploads a PPTX, we extract slide images with `pdf2image` after a one-shot LibreOffice conversion if available, else we accept a ZIP of PNGs.** To keep deps minimal we'll accept either: PPTX (try `aspose-slides`) OR a ZIP of slide images.
- For each slide image, call the AI gateway with the Presenton `SLIDE_LAYOUT_CREATION_SYSTEM_PROMPT` (adapted). LLM returns TSX+Zod source.
- Persist to `backend/templates_store/{template_id}/layouts/{layout_id}.tsx` plus `meta.json` (id, name, list of layouts, fonts).
- `GET /templates` → list. `GET /templates/{id}` → layouts (raw TSX strings). `DELETE /templates/{id}`.

**Frontend dynamic TSX renderer `src/components/slides/DynamicTsxSlide.tsx`**
- Loads `@babel/standalone` (via CDN script tag, kept out of main bundle) on first use.
- Compiles TSX → JS with `presets: ['typescript', 'react']`.
- Renders inside an iframe with a whitelisted `window` providing `React`, `Recharts`, `motion`, `Logo`, `Chart` globals. Iframe srcdoc bootstraps a small React root and listens for `postMessage({ type: 'render', code, data })`.
- Exposes `<DynamicTsxSlide code={...} data={...} />` to the rest of the app.

**Registry integration**
- New layout id `dynamic_tsx`: `{ layoutId: "dynamic_tsx", props: { templateId, layoutId, data } }`.
- `registry.ts` resolves it via DynamicTsxSlide and a fetched cache of template TSX (`/templates/{id}/layouts/{lid}/code`).

**UI: template picker**
- Add a "Templates" panel in `EditorView` to upload a PPTX, see thumbnails (rendered from the LLM-generated TSX), and "Use this template" — sets `deckStore.activeTemplateId`.
- Planner agent receives the active template's layout catalog (id, name, description, schema shape) and biases toward those layouts when generating slides.

---

## Phase 2 — Beautiful custom_html + edit memory

**Prompt overhaul (`backend/app/agents.py`)**
- Rewrite `CUSTOM_HTML_DESIGN_RULES` system fragment: mandates palette commitment (pick one of 6 curated palettes per deck), dominance (60/30/10), a single visual motif repeated across slides, decorative inline SVG, no centered body text, font pair from a curated list, large headline (96px+), accent gradients, content-driven imagery cues.
- Pass `deck.designBrief` (palette + motif + font pair, chosen by the planner once per deck) into every custom_html generation so slides look coherent rather than random.

**Edit chat memory**
- `backend/app/state.py`: extend `PitchbookState` with `edit_history: list[{slide_id, user_msg, assistant_summary, prev_props, new_props, error?}]`.
- `edit_agent` system prompt now includes the last 6 turns of edit_history for the target slide AND a "lessons learned" section auto-built from any turns where the user said "no", "undo", or asked for the same fix twice.
- Persist per-deck in-memory (keyed by `thread_id`) on the backend.

---

## Phase 3 — Logos + real charts as tools

**Frontend components**
- `src/components/slides/primitives/Logo.tsx`: `<Logo company="MUFG" size={64} />`. Resolves via `https://img.logo.dev/{domain}?token=...` with Clearbit fallback `https://logo.clearbit.com/{domain}`. Caches in a Zustand slice.
- `src/components/slides/primitives/Chart.tsx`: thin Recharts wrapper. Accepts `{ type: 'bar'|'line'|'pie', categories, series }`. Themed via CSS vars.

**Exposed to dynamic TSX sandbox** as `window.Logo` / `window.Chart` so generated TSX can do `<Chart data={...} />` without imports.

**Backend prompt**
- Catalogue the two primitives in the template generation prompt + custom_html prompt. LLM is told: "for KPI/comp slides emit a `<Chart>`; for company refs emit `<Logo company="..." />`".

**Secret**: ask user for `LOGO_DEV_TOKEN` if they want logo.dev (Clearbit needs none).

---

## Phase 4 — Autonomous sub-agent calls during edit

**`edit_agent` becomes a small agent loop** instead of a one-shot LLM call:
- Tools exposed via LangGraph `ToolNode`:
  - `fetch_from_competitor_agent(query)`
  - `fetch_from_financial_agent(ticker)`
  - `fetch_from_crm_agent(company)`
  - `rewrite_slide(layoutId, props)` (terminal)
- Each fetch tool re-uses the existing classifier sub-agents directly (no re-classification).
- `stopWhen = stepCountIs(8)`. After data is gathered the agent calls `rewrite_slide` and we stream `slide.update`.

---

## Technical details

**Backend files touched / added**
```
backend/app/templates.py            (new — upload/list/get layouts)
backend/app/agents.py               (edit_history, design brief, edit tool loop)
backend/app/state.py                (extend PitchbookState)
backend/app/server.py               (mount /templates routes, pass template catalog)
backend/app/prompts/                (split big prompts out: planner, custom_html, layout_creation, layout_edit)
backend/requirements.txt            (+pymupdf, +pdf2image, +Pillow)
backend/templates_store/            (filesystem JSON+TSX storage)
```

**Frontend files touched / added**
```
src/components/slides/DynamicTsxSlide.tsx           (Babel + iframe sandbox)
src/components/slides/primitives/Logo.tsx
src/components/slides/primitives/Chart.tsx
src/components/slides/registry.ts                   (+dynamic_tsx)
src/components/chat/TemplatesPanel.tsx              (upload + list)
src/lib/templates-client.ts                         (fetch template catalog + TSX)
src/lib/deck-store.ts                               (activeTemplateId, designBrief, editHistory cache)
src/components/chat/EditorView.tsx                  (mount TemplatesPanel)
package.json                                         (+@babel/standalone, +recharts already present? add if not)
```

**Sandbox security**
- Iframe is `sandbox="allow-scripts"` (no allow-same-origin → no cookies, no parent DOM).
- Only `React`, `Recharts`, `motion`, `Logo`, `Chart` injected as globals. No `fetch`, `XMLHttpRequest` removed via `delete window.fetch` inside the iframe.
- TSX code is compiled inside the iframe so it can never touch parent scope.

**Export to .pptx**
- `html-to-image` already captures DOM. For iframes we use `iframe.contentDocument.body` directly with `htmlToPng`. Verified pattern.

---

## Shipping order

1. Phase 1 (biggest, ~3 files backend + 4 frontend). Without this the rest doesn't matter.
2. Phase 3 (logos+charts) — small, unlocks visible quality wins.
3. Phase 2 (prompt rewrite + edit memory) — pure prompt work.
4. Phase 4 (agent tool loop) — last, requires Phases 1-3 to be stable.

After approval I'll start with Phase 1.
