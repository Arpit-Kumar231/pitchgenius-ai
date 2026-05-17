"""Multi-agent pitchbook system built with LangGraph.

Supervisor coordinates specialized sub-agents:
  - clarifier: decides whether more info is needed from the RM
  - market_research: pulls public/market data (stubbed)
  - crm: pulls relationship/account data (stubbed)
  - competitor: comparative intel (stubbed)
  - financials: deal/financial data (stubbed)
  - ppt_builder: assembles the final pitchbook
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .layouts import catalogue_for_prompt, validate_slide
from .tools import (
    fetch_competitor_landscape,
    fetch_crm_account,
    fetch_financial_metrics,
    fetch_market_research,
)

logger = logging.getLogger("pitchbook.agents")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")


def llm(temperature: float = 0.2) -> ChatOpenAI:
    return ChatOpenAI(model=MODEL, temperature=temperature)


class PitchbookState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    topic: str
    client: str
    rm_query: str
    needs_clarification: bool
    clarifying_question: str
    completed: list[str]
    research: dict[str, Any]
    crm: dict[str, Any]
    competitors: dict[str, Any]
    financials: dict[str, Any]
    slides: list[dict[str, Any]]
    deck_meta: dict[str, str]
    final_answer: str
    next_agent: str
    events: list[dict[str, Any]]
    agent_plan: dict[str, bool | None]
    ask_user_about: list[str]
    prior_agent_plan: dict[str, bool | None]
    ask_user_about_prev: list[str]
    resume_from_clarifier: bool
    user_reply: str
    active_template_id: str
    active_template_catalogue: str
    design_brief: dict[str, Any]


def _emit(events: list[dict[str, Any]] | None, agent: str, status: str, detail: str = "") -> list[dict[str, Any]]:
    ev = list(events or [])
    ev.append({"agent": agent, "status": status, "detail": detail})
    return ev


def _parse_json(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:].lstrip("\n")
    try:
        return json.loads(t)
    except Exception:
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(t[start : end + 1])
            except Exception:
                return {}
        return {}


SUPERVISOR_SYSTEM = """You are the Supervisor Agent for an investment-banking pitchbook generator.
A Relationship Manager (RM) at a bank gives you a query. You orchestrate sub-agents.

Available sub-agents:
- clarifier: ask the RM follow-up questions if the request is ambiguous (only call ONCE, early)
- market_research: industry/market data and public company info
- crm: internal CRM/account & relationship data for the target client
- competitor: comparative analysis vs peers (use when RM asks "how are others doing")
- financials: financial metrics, valuation, deal comps
- planner: assemble slide deck from gathered data (call ONLY after data gathering, exactly once)
- done: finish

Decide the SINGLE next agent to invoke. Do not repeat agents already in completed_agents.
Once planner has run, choose "done". Respond as strict JSON:
{"next": "<agent>", "reason": "<short reason>"}
"""


def supervisor_node(state: PitchbookState) -> PitchbookState:
    logger.info("supervisor: enter completed=%s agent_plan=%s", state.get("completed", []), state.get("agent_plan"))
    completed = state.get("completed", [])
    if "planner" in completed:
        return {"next_agent": "done", "events": _emit(state.get("events"), "supervisor", "done", "pitchbook ready")}

    agent_plan = state.get("agent_plan", {})

    needed_agents = [
        agent for agent, should_run in agent_plan.items()
        if should_run is True and agent not in completed
    ]

    if not needed_agents:
        logger.info("supervisor: no more agents needed, proceeding to planner")
        events = _emit(state.get("events"), "supervisor", "decided", "next=planner — all planned agents done")
        return {"next_agent": "planner", "events": events}

    nxt = needed_agents[0]
    logger.info("supervisor: next=%s (from plan)", nxt)
    events = _emit(state.get("events"), "supervisor", "decided", f"next={nxt} — from agent_plan")
    return {"next_agent": nxt, "events": events}


def supervisor_router(state: PitchbookState) -> str:
    nxt = state.get("next_agent", "done")
    routes = {
        "clarifier": "clarifier",
        "market_research": "market_research",
        "crm": "crm_agent",
        "competitor": "competitor_agent",
        "financials": "financials_agent",
        "planner": "planner",
        "done": END,
    }
    return routes.get(nxt, "done")


CLASSIFIER_SYSTEM = """You are the Query Classifier Agent. Analyze the RM's pitchbook request and determine which data agents are needed.

The RM may ask for:
- Market/industry insights → market_research agent
- Account/relationship/client info → crm agent
- Competitor/peer analysis → competitor agent
- Financial metrics/valuation/comps → financials agent

For each agent, decide:
- true: clearly needed based on the query
- false: clearly not needed
- null: ambiguous—ask the user to confirm

Example queries:
- "Create a market opportunity deck" → {"market_research": true, "crm": false, "competitor": false, "financials": false}
- "Show our relationship strength vs competitors" → {"market_research": false, "crm": true, "competitor": true, "financials": false}
- "Financial deep-dive" → {"market_research": false, "crm": false, "competitor": false, "financials": true}
- Ambiguous → use null for unclear agents, include clarify_question

Respond as strict JSON:
{
  "market_research": true|false|null,
  "crm": true|false|null,
  "competitor": true|false|null,
  "financials": true|false|null,
  "clarify_question": "<only if any field is null, else empty string>"
}
"""


PLAN_RESOLVER_SYSTEM = """You are resolving an ambiguous agent plan based on the RM's reply.
You will receive: (a) the current agent plan (some values may be null/ambiguous),
(b) the list of agents we asked the user about, (c) the user's reply.
Update ONLY the ambiguous entries to true/false based on the reply. Be permissive:
if the user mentions an agent (e.g. "use competitor and financials"), mark those true
and mark the other ambiguous ones false. If the reply is unrelated, default the
remaining ambiguous entries to false so we can proceed.

Respond as strict JSON: {"market_research": bool, "crm": bool, "competitor": bool, "financials": bool}
"""


CLARIFIER_SYSTEM = """You are the Clarifier Agent. Decide if the RM's query needs ONE clarifying question
to produce a high-quality pitchbook (e.g. missing client name, missing topic focus, missing geography).
If the query already includes a clear topic AND a client (or is generic enough to proceed), return needs_clarification=false.
Reply strict JSON:
{"needs_clarification": bool, "question": "<one short question or empty>"}
"""


DESIGN_BRIEF_SYSTEM = """You are the Art Director. Pick a cohesive design brief for an
investment-banking pitchbook. Choose a palette that fits the topic (NOT generic blue),
a font pairing with personality, and ONE distinctive visual motif to repeat across every
slide so the deck feels designed, not generated. Respond as strict JSON, no prose:
{
  "palette": {"bg":"#hex (dominant 60%)","ink":"#hex (text)","accent":"#hex (10% pop)","muted":"#hex"},
  "fontPair": {"display":"<CSS font-family for headings>","body":"<CSS font-family for body>"},
  "motif": "<one sentence describing a repeating visual element>",
  "vibe": "<one word: editorial | brutalist | minimal | luxe | technical>"
}
"""


def query_classifier_node(state: PitchbookState) -> PitchbookState:
    logger.info("query_classifier: enter resume=%s prev_ask=%s",
                state.get("resume_from_clarifier"), state.get("ask_user_about_prev"))

    # Resume path A: previous turn paused at clarifier for free-text info.
    # Keep the prior agent_plan, skip re-classification.
    if state.get("resume_from_clarifier") and state.get("prior_agent_plan"):
        plan = state["prior_agent_plan"]
        agent_plan = {k: (True if v is None else v) for k, v in plan.items()}
        events = _emit(state.get("events"), "query_classifier", "done",
                       "resuming with existing plan after clarifier reply")
        completed = state.get("completed", []) + ["query_classifier"]
        return {"agent_plan": agent_plan, "ask_user_about": [],
                "completed": completed, "events": events}

    # Resume path B: previous turn paused because classifier was ambiguous.
    # Use the user's reply to resolve only the ambiguous entries.
    if state.get("ask_user_about_prev") and state.get("prior_agent_plan"):
        events = _emit(state.get("events"), "query_classifier", "running",
                       "resolving ambiguous agents from your reply")
        prior = state["prior_agent_plan"]
        try:
            payload = {
                "current_plan": prior,
                "ambiguous_agents": state["ask_user_about_prev"],
                "user_reply": state.get("rm_query", ""),
            }
            msg = llm(0).invoke([
                SystemMessage(content=PLAN_RESOLVER_SYSTEM),
                HumanMessage(content=json.dumps(payload)),
            ])
            resolved = _parse_json(msg.content) or {}
        except Exception:
            logger.exception("query_classifier: resolver LLM failed")
            resolved = {}
        agent_plan = {}
        for k, v in prior.items():
            if v is None:
                rv = resolved.get(k)
                agent_plan[k] = bool(rv) if isinstance(rv, bool) else False
            else:
                agent_plan[k] = v
        detail = "resolved plan: {" + ", ".join(f"{k}={v}" for k, v in agent_plan.items()) + "}"
        events = _emit(events, "query_classifier", "done", detail)
        completed = state.get("completed", []) + ["query_classifier"]
        return {"agent_plan": agent_plan, "ask_user_about": [],
                "completed": completed, "events": events}

    events = _emit(state.get("events"), "query_classifier", "running", "analyzing query to determine needed agents")
    try:
        msg = llm(0).invoke(
            [SystemMessage(content=CLASSIFIER_SYSTEM), HumanMessage(content=state.get("rm_query", ""))]
        )
        plan = _parse_json(msg.content) or {}
    except Exception:
        logger.exception("query_classifier: LLM call failed")
        raise

    agent_plan = {
        "market_research": plan.get("market_research", True),
        "crm": plan.get("crm", True),
        "competitor": plan.get("competitor", True),
        "financials": plan.get("financials", True),
    }

    # Check for ambiguous agents (None values)
    ask_about = [k for k, v in agent_plan.items() if v is None]

    detail = f"plan: {{{', '.join(f'{k}={v}' for k, v in agent_plan.items() if v is not None)}}}"
    if ask_about:
        detail += f"; asking user about {ask_about}"

    completed = state.get("completed", []) + ["query_classifier"]
    events = _emit(events, "query_classifier", "done", detail)

    return {
        "agent_plan": agent_plan,
        "ask_user_about": ask_about,
        "completed": completed,
        "events": events,
    }


def query_classifier_router(state: PitchbookState) -> str:
    """Route after classifier: ask user if ambiguous, else go to clarifier."""
    ask_about = state.get("ask_user_about", [])
    if ask_about:
        return "ask_user_for_plan"
    return "clarifier"


def clarifier_node(state: PitchbookState) -> PitchbookState:
    logger.info("clarifier: enter")
    events = _emit(state.get("events"), "clarifier", "running", "evaluating query completeness")
    try:
        msg = llm(0).invoke(
            [SystemMessage(content=CLARIFIER_SYSTEM), HumanMessage(content=state.get("rm_query", ""))]
        )
        out = _parse_json(msg.content) or {"needs_clarification": False, "question": ""}
    except Exception:
        logger.exception("clarifier: LLM call failed")
        raise
    completed = state.get("completed", []) + ["clarifier"]
    events = _emit(events, "clarifier", "done", "needs more info" if out.get("needs_clarification") else "query is clear")
    return {
        "needs_clarification": bool(out.get("needs_clarification", False)),
        "clarifying_question": out.get("question", ""),
        "completed": completed,
        "events": events,
    }


def market_research_node(state: PitchbookState) -> PitchbookState:
    logger.info("market_research: enter")
    events = _emit(state.get("events"), "market_research", "running", "fetching market & industry data")
    data = fetch_market_research(state.get("topic") or state.get("rm_query", ""))
    completed = state.get("completed", []) + ["market_research"]
    events = _emit(events, "market_research", "done", f"{len(data.get('insights', []))} insights")
    return {"research": data, "completed": completed, "events": events}


def crm_node(state: PitchbookState) -> PitchbookState:
    logger.info("crm: enter")
    events = _emit(state.get("events"), "crm", "running", "querying internal CRM")
    data = fetch_crm_account(state.get("client") or "Prospective Client")
    completed = state.get("completed", []) + ["crm"]
    events = _emit(events, "crm", "done", f"account tier {data.get('tier')}")
    return {"crm": data, "completed": completed, "events": events}


def competitor_node(state: PitchbookState) -> PitchbookState:
    logger.info("competitor: enter")
    events = _emit(state.get("events"), "competitor", "running", "scanning peer landscape")
    data = fetch_competitor_landscape(state.get("topic") or state.get("rm_query", ""))
    completed = state.get("completed", []) + ["competitor"]
    events = _emit(events, "competitor", "done", f"{len(data.get('peers', []))} peers")
    return {"competitors": data, "completed": completed, "events": events}


def financials_node(state: PitchbookState) -> PitchbookState:
    logger.info("financials: enter")
    events = _emit(state.get("events"), "financials", "running", "computing financial metrics")
    data = fetch_financial_metrics(state.get("client") or state.get("topic", ""))
    completed = state.get("completed", []) + ["financials"]
    events = _emit(events, "financials", "done", "metrics ready")
    return {"financials": data, "completed": completed, "events": events}


PLANNER_SYSTEM = f"""You are the Slide Planner Agent. Given gathered data, design a 6–10 slide
investment-banking pitchbook by emitting a JSON list of slides. You think like a senior
pitch designer at Goldman Sachs / McKinsey: each slide should feel intentional, on-brand,
and visually distinct — NOT a uniform stack of bullets.

You will receive a `design_brief` (palette + fontPair + motif). You MUST honor it on
every slide — same palette, same display/body fonts, and the motif appears on every
`custom_html` slide. This is what makes the deck feel designed.

You may also receive an `active_template` with reusable dynamic_tsx layouts the user
uploaded. When their structure matches the slide's purpose, prefer them over
custom_html. Reference them as: {{"layoutId":"dynamic_tsx","props":{{"templateId":"<tid>","layoutId":"<lid>","data":{{...}}}}}}.

You have two modes for each slide:
  (A) Pick a curated layout from the catalogue and fill its props. Fast and consistent.
  (B) Use `custom_html` to author a fully bespoke slide (HTML + inline CSS on a 1920x1080
      canvas). Use this whenever the user's request implies a unique visual treatment, an
      unusual structure, a diagram, a quote, a stat hero, a process flow, a timeline, an
      org chart, a roadmap, or anything the curated layouts don't capture cleanly.

Aim for a mix: ~30-60% custom_html for visual variety, the rest curated layouts for
structured content (metrics, peer tables, bullets) where consistency matters.

Available layouts:
{catalogue_for_prompt()}

Rules:
- First slide MUST be a `cover` (or `custom_html` styled as a cover if the brief is very
  brand-specific). Last slide MUST be a `closing`.
- Insert 1–2 `section_divider` slides between major sections.
- Use `metric_grid` for KPIs (market size, financials).
- Use `peer_table` for competitive comps.
- Use `bullet_list` or `two_column` for narrative slides.
- Use `custom_html` for hero stats, quote slides, diagrams, timelines, opening visuals,
  or anything the curated set would render awkwardly.
- Be specific — pull real numbers and names from the gathered data.
- Keep text tight: bullet bodies ≤ 18 words, headings ≤ 8 words.
- All `props` keys/values must match the shape exactly. No extra keys.
- For `custom_html`: the `html` MUST be a single fragment that visually fills 1920x1080.
  Use absolute positioning, flex, or grid. Scope any <style> block selectors to
  `.ai-slide-root` to prevent style leakage. NO <script>, NO event handlers, NO external
  stylesheets, NO <link>/<iframe>. Inline <svg> is encouraged for shapes/icons.
- For `custom_html` design quality (this is what separates AI slop from real decks):
    * Use the design_brief palette EXACTLY. Background = palette.bg. Accent = palette.accent.
    * 60/30/10 dominance — one color does 60%, secondary 30%, accent 10%. Never equal weight.
    * Display headings 96-160px in palette.fontPair.display. Body 28-40px.
    * The motif from design_brief appears on every custom_html slide.
    * NEVER center body text. Left-align paragraphs and lists.
    * Include at least one decorative inline <svg> per slide (shape, line, blob, grid).
    * For numbers/KPIs use a 96px+ stat with a small label underneath.
    * Add generous whitespace: minimum 96px page padding.
    * Vary layout across slides — never two identical custom_html structures in a row.

Respond with strict JSON, no prose, no markdown fences:
{{"title": "<deck title>", "slides": [{{"layoutId": "...", "props": {{...}}}}, ...]}}
"""


def planner_node(state: PitchbookState) -> PitchbookState:
    logger.info("planner: enter")
    events = _emit(state.get("events"), "planner", "running", "designing deck structure")

    # ---- 1. Pick a design brief once per deck (palette + motif + typography) ----
    brief_msg = llm(0.7).invoke([
        SystemMessage(content=DESIGN_BRIEF_SYSTEM),
        HumanMessage(content=f"RM brief: {state.get('rm_query','')}\nClient: {state.get('client','')}\nTopic: {state.get('topic','')}"),
    ])
    design_brief = _parse_json(brief_msg.content) or {
        "palette": {"bg": "#0a1628", "ink": "#f5f3ee", "accent": "#c9a84c", "muted": "#4a5568"},
        "fontPair": {"display": "Georgia, serif", "body": "Inter, system-ui"},
        "motif": "thin gold rule beneath every title",
    }
    logger.info("planner: design_brief=%s", design_brief)

    context = {
        "rm_query": state.get("rm_query"),
        "client": state.get("client"),
        "topic": state.get("topic"),
        "research": state.get("research"),
        "crm": state.get("crm"),
        "competitors": state.get("competitors"),
        "financials": state.get("financials"),
        "design_brief": design_brief,
        "active_template": state.get("active_template_catalogue", ""),
    }

    try:
        msg = llm(0.3).invoke(
            [
                SystemMessage(content=PLANNER_SYSTEM),
                HumanMessage(
                    content=(
                        "Build the pitchbook deck. Gathered data:\n```json\n"
                        + json.dumps(context, default=str, indent=2)
                        + "\n```"
                    )
                ),
            ]
        )
        plan = _parse_json(msg.content) or {}
    except Exception:
        logger.exception("planner: LLM call failed")
        raise

    raw_slides = plan.get("slides", []) or []
    valid_slides: list[dict[str, Any]] = []
    for i, s in enumerate(raw_slides):
        layout_id = s.get("layoutId")
        props = s.get("props") or {}
        ok, err = validate_slide(layout_id, props)
        if not ok:
            logger.warning("planner: dropping invalid slide #%d: %s", i, err)
            continue
        valid_slides.append({"id": f"s{i}", "layoutId": layout_id, "props": props})

    if not valid_slides:
        # Fallback: emit a minimal cover so the UI isn't empty.
        valid_slides = [{
            "id": "s0",
            "layoutId": "cover",
            "props": {
                "title": state.get("topic") or "Pitchbook",
                "client": state.get("client") or "Prospective Client",
                "subtitle": "Draft — planner could not generate slides; please refine the prompt.",
            },
        }]

    completed = state.get("completed", []) + ["planner"]
    events = _emit(events, "planner", "done", f"{len(valid_slides)} slides")
    deck_meta = {
        "title": plan.get("title") or (state.get("topic") or "Pitchbook"),
        "client": state.get("client") or "",
    }
    final = (
        f"Drafted **{len(valid_slides)} slides** for "
        f"**{state.get('client') or 'the client'}** on "
        f"**{state.get('topic') or state.get('rm_query','')}**. "
        f"Click any slide and tell me what to refine."
    )
    return {
        "slides": valid_slides,
        "deck_meta": deck_meta,
        "completed": completed,
        "events": events,
        "final_answer": final,
        "design_brief": design_brief,
    }


def build_graph():
    g = StateGraph(PitchbookState)
    g.add_node("query_classifier", query_classifier_node)
    g.add_node("supervisor", supervisor_node)
    g.add_node("clarifier", clarifier_node)
    g.add_node("market_research", market_research_node)
    g.add_node("crm_agent", crm_node)
    g.add_node("competitor_agent", competitor_node)
    g.add_node("financials_agent", financials_node)
    g.add_node("planner", planner_node)

    g.set_entry_point("query_classifier")

    g.add_conditional_edges(
        "query_classifier",
        query_classifier_router,
        {"ask_user_for_plan": END, "clarifier": "clarifier"},
    )

    def after_clarifier(state: PitchbookState) -> str:
        return "ask_user" if state.get("needs_clarification") else "supervisor"

    g.add_conditional_edges("clarifier", after_clarifier, {"ask_user": END, "supervisor": "supervisor"})

    g.add_conditional_edges(
        "supervisor",
        supervisor_router,
        {
            "clarifier": "clarifier",
            "market_research": "market_research",
            "crm_agent": "crm_agent",
            "competitor_agent": "competitor_agent",
            "financials_agent": "financials_agent",
            "planner": "planner",
            END: END,
        },
    )

    for n in ["market_research", "crm_agent", "competitor_agent", "financials_agent"]:
        g.add_edge(n, "supervisor")

    g.add_edge("planner", END)
    return g.compile()


GRAPH = build_graph()


# ---- Edit agent (single-shot, separate from main graph) -------------------

EDITOR_SYSTEM = f"""You are the Slide Editor Agent. The user wants to refine an existing
pitchbook. You receive the current deck (list of slides with layoutId and props)
and an instruction. Decide which slides to change, replace, or add. Emit a JSON list of patches.

Available layouts:
{catalogue_for_prompt()}

Rules:
- REPLACE patch: Changes an existing slide entirely. Output the FULL new slide, not a diff.
- ADD patch: Inserts a NEW slide at a given index. Pushes existing slides after it forward.
- If the user asks for "more slides", "add another slide", "add a section", "add X more",
  emit ADD patches to insert new slides.
- If the user asks to change/edit/refine an existing slide, use REPLACE patch.
- You may change the layoutId if the new layout fits better. In particular, if the user
  asks for a redesign, a new visual treatment, a custom diagram, or "make this look more
  like X", switch to `custom_html` and author the slide as full HTML+inline CSS.
- If the current slide is already `custom_html` and the user asks for an HTML/CSS tweak
  (colors, layout, copy, add a chart, change the background), edit the `html` string
  directly and keep `custom_html` as the layoutId.
- Keep `props` shape valid for the chosen layoutId. No extra keys.
- If the user says "this slide" or "the current slide", target activeSlideIndex.
- If unclear, prefer minimal targeted edits over rewriting the whole deck.
- For `custom_html`: same canvas rules apply — 1920x1080, inline styles or a single
  `.ai-slide-root`-scoped <style>, no scripts/handlers/external resources.

Respond with strict JSON, no prose, no fences:
{{"patches": [{{"action": "replace|add", "index": <int>, "slide": {{"layoutId": "...", "props": {{...}}}}}}, ...],
 "summary": "<one sentence about what you changed>"}}
"""


def run_editor(
    deck: dict[str, Any],
    instruction: str,
    active_index: int | None,
    edit_history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Returns {"patches": [...], "summary": "..."} with validated slides only.
    Patches can be either "replace" (modify existing) or "add" (insert new) operations."""
    history = edit_history or []
    # Build a "lessons learned" hint: if the user asked twice for the same kind
    # of change, surface it so the model doesn't repeat the mistake.
    lessons = ""
    if history:
        recent = history[-6:]
        lessons = "\n# Prior edit attempts in this thread (avoid repeating the same mistake):\n"
        for h in recent:
            lessons += f"- '{h.get('instruction','')[:140]}' → {h.get('summary','')[:140]}\n"
    user = {
        "instruction": instruction,
        "activeSlideIndex": active_index,
        "deck": deck,
    }
    msg = llm(0.3).invoke([
        SystemMessage(content=EDITOR_SYSTEM + lessons),
        HumanMessage(content=json.dumps(user, default=str, indent=2)),
    ])
    out = _parse_json(msg.content) or {}
    patches = out.get("patches") or []
    valid = []
    for p in patches:
        action = p.get("action", "replace")  # default to replace for backwards compat
        idx = p.get("index")
        slide = p.get("slide") or {}
        layout_id = slide.get("layoutId")
        props = slide.get("props") or {}
        ok, err = validate_slide(layout_id, props)
        if not isinstance(idx, int) or not ok:
            logger.warning("editor: dropped invalid patch idx=%s action=%s err=%s", idx, action, err)
            continue
        
        # For add patches, generate a new ID. For replace, preserve existing ID.
        if action == "add":
            sid = f"s{idx}_{uuid.uuid4().hex[:8]}"
        else:
            existing = (deck.get("slides") or [])
            sid = existing[idx]["id"] if 0 <= idx < len(existing) and "id" in existing[idx] else f"s{idx}"
        
        valid.append({
            "action": action,
            "index": idx,
            "slide": {"id": sid, "layoutId": layout_id, "props": props}
        })
    return {"patches": valid, "summary": out.get("summary") or "Updated deck."}
