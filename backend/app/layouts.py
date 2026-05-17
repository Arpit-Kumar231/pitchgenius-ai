"""JSON-schema-ish summary of the TSX layouts the planner can emit.

Must stay in sync with src/components/slides/registry.ts. The planner's
system prompt embeds this catalogue so the LLM only emits valid layoutId
+ props combinations.
"""
from __future__ import annotations

LAYOUTS: dict[str, dict] = {
    "cover": {
        "name": "Cover",
        "description": "Title slide. Use as slide #1.",
        "props_shape": {
            "title": "string (required)",
            "subtitle": "string (optional, 1-2 lines)",
            "client": "string (required)",
            "date": "string (optional, e.g. 'May 2026')",
            "bank": "string (optional, defaults to 'Confidential')",
        },
    },
    "section_divider": {
        "name": "Section Divider",
        "description": "Big section break between major parts of the deck.",
        "props_shape": {
            "sectionNumber": "string (optional, e.g. '01' or 'I')",
            "title": "string (required)",
            "subtitle": "string (optional)",
        },
    },
    "bullet_list": {
        "name": "Numbered Bullets",
        "description": "Title + 3-6 numbered points each with heading and optional body.",
        "props_shape": {
            "eyebrow": "string (optional, short uppercase tag)",
            "title": "string (required)",
            "bullets": "array of {heading: string, body?: string} (1-8 items)",
            "footnote": "string (optional, sources)",
        },
    },
    "metric_grid": {
        "name": "Metric Grid",
        "description": "2-6 large KPI cards. Use for market sizing, financials.",
        "props_shape": {
            "eyebrow": "string (optional)",
            "title": "string (required)",
            "metrics": "array of {label: string, value: string, sublabel?: string} (2-6)",
            "commentary": "string (optional, 1-2 sentence takeaway)",
            "footnote": "string (optional, sources)",
        },
    },
    "peer_table": {
        "name": "Peer Table",
        "description": "Comparison table. First column = name; rest = metrics/notes.",
        "props_shape": {
            "eyebrow": "string (optional)",
            "title": "string (required)",
            "columns": "array of strings (2-5, header labels)",
            "rows": "array of array of strings (each row's length must match columns)",
            "footnote": "string (optional)",
        },
    },
    "two_column": {
        "name": "Two Columns",
        "description": "Side-by-side bullet columns (opportunities vs risks, strengths vs gaps).",
        "props_shape": {
            "eyebrow": "string (optional)",
            "title": "string (required)",
            "left": "{heading: string, bullets: string[] (1-6)}",
            "right": "{heading: string, bullets: string[] (1-6)}",
            "footnote": "string (optional)",
        },
    },
    "closing": {
        "name": "Closing",
        "description": "Last slide. Thank-you + contacts.",
        "props_shape": {
            "title": "string (optional, defaults to 'Thank you')",
            "contacts": "array of {name: string, role: string, email?: string} (1-4)",
            "bank": "string (optional)",
        },
    },
    "custom_html": {
        "name": "Custom AI-designed slide",
        "description": (
            "ESCAPE HATCH for bespoke, Gamma-style slides whose structure does NOT fit any "
            "other layout above. You author the entire slide as HTML+CSS on a 1920x1080 canvas. "
            "Prefer this whenever the user asks for a unique visual treatment, an unusual layout, "
            "a diagram, a hero/banner, a quote slide, a process flow, a timeline, a stat hero, etc."
        ),
        "props_shape": {
            "html": (
                "string (required) — a single self-contained HTML fragment that fills the "
                "1920x1080 canvas. Rules: use ONLY inline styles or one top-level <style> block "
                "whose selectors are all prefixed with `.ai-slide-root ` to avoid leaking. "
                "Absolute positioning is fine. NO <script>, NO event handlers, NO external "
                "stylesheets, NO <link>/<iframe>. You MAY use inline <svg> for shapes/icons. "
                "Use Google-style web-safe fonts (Inter, Georgia, system-ui). Use rich typography, "
                "generous whitespace, accent colors, gradients, and grid/flex layouts. Think like "
                "a senior pitch designer at McKinsey/Goldman — not a basic bullet slide."
            ),
            "background": "string (optional) — CSS background for the slide root, e.g. linear-gradient(...) or #0a1628",
            "notes": "string (optional) — short note describing the slide intent (for the editor agent later)",
        },
    },
    "dynamic_tsx": {
        "name": "Dynamic Template Layout",
        "description": (
            "Renders a reusable layout previously generated from an uploaded PPTX "
            "template. Use ONLY when an active template is provided in context and "
            "its structure matches the slide's intent. Refer to layouts by id "
            "exactly as listed in the active template catalogue."
        ),
        "props_shape": {
            "templateId": "string (required) — id of the uploaded template",
            "layoutId": "string (required) — id of the layout within that template",
            "data": "object (required) — must match the layout's Zod schema (see template catalogue)",
        },
    },
}


def catalogue_for_prompt() -> str:
    """Render the layout catalogue as compact text for system prompts."""
    lines = []
    for lid, meta in LAYOUTS.items():
        lines.append(f"- {lid} ({meta['name']}): {meta['description']}")
        for k, v in meta["props_shape"].items():
            lines.append(f"    {k}: {v}")
    return "\n".join(lines)


def validate_slide(layout_id: str, props: dict) -> tuple[bool, str]:
    """Lightweight validation. The browser does full Zod validation."""
    if layout_id not in LAYOUTS:
        return False, f"unknown layoutId '{layout_id}'"
    if not isinstance(props, dict):
        return False, "props must be an object"
    # required field checks per layout
    required = {
        "cover": ["title", "client"],
        "section_divider": ["title"],
        "bullet_list": ["title", "bullets"],
        "metric_grid": ["title", "metrics"],
        "peer_table": ["title", "columns", "rows"],
        "two_column": ["title", "left", "right"],
        "closing": ["contacts"],
        "custom_html": ["html"],
        "dynamic_tsx": ["templateId", "layoutId", "data"],
    }[layout_id]
    for k in required:
        if k not in props:
            return False, f"{layout_id} missing required prop '{k}'"
    return True, ""