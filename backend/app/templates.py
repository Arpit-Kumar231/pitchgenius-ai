"""Presenton-style template ingestion.

User uploads slide screenshots (PNG/JPG); LLM converts each into a reusable
TSX+Zod layout component. Layouts are stored on the local filesystem under
`backend/templates_store/{template_id}/`.

Storage layout:
  templates_store/
    <tid>/
      meta.json                 # {id, name, created_at, layouts: [{id,name,description}]}
      layouts/
        <layoutId>.tsx          # generated component source
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

logger = logging.getLogger("pitchbook.templates")

STORE = Path(__file__).resolve().parent.parent / "templates_store"
STORE.mkdir(parents=True, exist_ok=True)

MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")

router = APIRouter(prefix="/templates", tags=["templates"])


LAYOUT_GEN_SYSTEM = """You convert a slide screenshot into a REUSABLE React/TSX layout
component that can be re-skinned with different content while preserving the visual
language of the original.

# Output contract (STRICT)
Output a JSON object only, no markdown:
{
  "layoutId":   "kebab-case-id-describing-structure",
  "layoutName": "Short Title",
  "layoutDescription": "One sentence describing structure (not the original content).",
  "zodSchemaSource": "<TS source for `export const schema = z.object({...})`>",
  "componentSource": "<TS source for `export default function Layout({ data }) { ... }`>"
}

# Rules for the TSX component
- 1920x1080 fixed canvas at the root: <div style={{width:1920,height:1080,...}}>.
- NO imports. `React`, `z`, `Logo`, `Chart`, `motion` are available as globals
  inside the sandbox.
- All styling inline (style={{...}}) — Tailwind classes won't work.
- Use flex / grid / padding for positioning (NO absolute unless decorative).
- Decorative elements (background gradients, shapes, brand bars) are hard-coded
  exactly as seen in the screenshot — do NOT make them props.
- Content elements (titles, bullets, metrics, tables, charts, logos) ARE props
  driven by the Zod schema with sensible `.default(...)` values.
- For company logos, emit <Logo company="..." size={...} />.
- For charts, emit <Chart type="bar|line|pie" categories={...} series={...} />.
- Every Zod field has `.default(...)` and `.describe(...)`. Strings/arrays use
  generic names: title, eyebrow, bullets, metrics, items, columns, rows, logos.
- NEVER use content-specific words (no "revenue", "MUFG", "Q3" in field names).
- Component must be a default export named anything; do NOT use `export` keyword,
  return just `function Layout({data}) {...}` as the LAST statement evaluated.

The runtime will wrap your code as:
  const { schema, default: Layout } = (() => {
    <zodSchemaSource>
    <componentSource>
    return { schema, default: Layout };
  })();
So your zodSchemaSource must assign `const schema = z.object({...})` and your
componentSource must assign `const Layout = (props) => ...`. Use `const`, not
`export`. Do not wrap in an IIFE yourself.

Think hard, then emit JSON only.
"""


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s or "template"


def _meta_path(tid: str) -> Path:
    return STORE / tid / "meta.json"


def _layout_path(tid: str, lid: str) -> Path:
    return STORE / tid / "layouts" / f"{lid}.tsx"


def _read_meta(tid: str) -> dict[str, Any]:
    p = _meta_path(tid)
    if not p.exists():
        raise HTTPException(404, f"template {tid} not found")
    return json.loads(p.read_text())


def _write_meta(tid: str, meta: dict[str, Any]) -> None:
    _meta_path(tid).write_text(json.dumps(meta, indent=2))


async def _gen_layout_from_image(image_bytes: bytes, mime: str, idx: int) -> dict[str, Any]:
    b64 = base64.b64encode(image_bytes).decode()
    llm = ChatOpenAI(model=MODEL, temperature=0.2)
    msg = await llm.ainvoke([
        SystemMessage(content=LAYOUT_GEN_SYSTEM),
        HumanMessage(content=[
            {"type": "text", "text": f"Convert slide #{idx + 1} into a reusable layout."},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ]),
    ])
    raw = (msg.content or "").strip()
    # Strip ``` fences if any
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip("\n")
    try:
        return json.loads(raw)
    except Exception:
        # Try to extract JSON braces
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def _compose_tsx(parsed: dict[str, Any]) -> str:
    """Combine the schema + component source into one file we can serve."""
    schema_src = parsed.get("zodSchemaSource", "").strip()
    comp_src = parsed.get("componentSource", "").strip()
    return f"// AI-generated layout — {parsed.get('layoutName')}\n{schema_src}\n\n{comp_src}\n"


@router.post("")
async def create_template(
    name: str = Form(...),
    images: list[UploadFile] = File(...),
):
    if not images:
        raise HTTPException(400, "at least one slide image required")
    tid = uuid.uuid4().hex[:12]
    base = STORE / tid / "layouts"
    base.mkdir(parents=True, exist_ok=True)

    layouts: list[dict[str, Any]] = []
    for i, up in enumerate(images):
        data = await up.read()
        mime = up.content_type or "image/png"
        try:
            parsed = await _gen_layout_from_image(data, mime, i)
        except Exception as e:
            logger.exception("layout gen failed for slide %d", i)
            continue
        lid_raw = parsed.get("layoutId") or f"slide-{i+1}"
        lid = f"{_slugify(lid_raw)}-{i+1:02d}"
        tsx = _compose_tsx(parsed)
        _layout_path(tid, lid).write_text(tsx)
        layouts.append({
            "id": lid,
            "name": parsed.get("layoutName") or f"Slide {i+1}",
            "description": parsed.get("layoutDescription") or "",
        })

    if not layouts:
        raise HTTPException(500, "no layouts could be generated from uploaded images")

    meta = {
        "id": tid,
        "name": name,
        "created_at": datetime.utcnow().isoformat(),
        "layouts": layouts,
    }
    _write_meta(tid, meta)
    return meta


@router.get("")
async def list_templates():
    out = []
    for d in sorted(STORE.iterdir()):
        if d.is_dir() and (d / "meta.json").exists():
            out.append(json.loads((d / "meta.json").read_text()))
    return {"templates": out}


@router.get("/{tid}")
async def get_template(tid: str):
    return _read_meta(tid)


@router.get("/{tid}/layouts/{lid}/code")
async def get_layout_code(tid: str, lid: str):
    p = _layout_path(tid, lid)
    if not p.exists():
        raise HTTPException(404, "layout not found")
    return {"code": p.read_text()}


@router.delete("/{tid}")
async def delete_template(tid: str):
    import shutil
    d = STORE / tid
    if d.exists():
        shutil.rmtree(d)
    return {"ok": True}


def template_catalogue_for_prompt(tid: str) -> str:
    """Compact list of a template's layouts for embedding in the planner prompt."""
    try:
        meta = _read_meta(tid)
    except Exception:
        return ""
    lines = [f"# Active template: {meta['name']}",
             "Prefer these layouts when their structure matches:"]
    for L in meta["layouts"]:
        lines.append(f"- dynamic_tsx[{tid}/{L['id']}]: {L['name']} — {L['description']}")
    return "\n".join(lines)