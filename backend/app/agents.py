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
from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .ppt import build_pitchbook
from .tools import (
    fetch_competitor_landscape,
    fetch_crm_account,
    fetch_financial_metrics,
    fetch_market_research,
)

logger = logging.getLogger("pitchbook.agents")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


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
    ppt_path: str
    template_path: str
    final_answer: str
    next_agent: str
    events: list[dict[str, Any]]


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
- ppt_builder: assemble final pitchbook (call ONLY after data gathering, exactly once)
- done: finish

Decide the SINGLE next agent to invoke. Do not repeat agents already in completed_agents.
Once ppt_builder has run, choose "done". Respond as strict JSON:
{"next": "<agent>", "reason": "<short reason>"}
"""


def supervisor_node(state: PitchbookState) -> PitchbookState:
    logger.info("supervisor: enter completed=%s", state.get("completed", []))
    completed = state.get("completed", [])
    if "ppt_builder" in completed:
        return {"next_agent": "done", "events": _emit(state.get("events"), "supervisor", "done", "pitchbook ready")}

    summary = {
        "rm_query": state.get("rm_query", ""),
        "completed_agents": completed,
        "has_research": bool(state.get("research")),
        "has_crm": bool(state.get("crm")),
        "has_competitors": bool(state.get("competitors")),
        "has_financials": bool(state.get("financials")),
    }
    try:
        msg = llm(0).invoke(
            [SystemMessage(content=SUPERVISOR_SYSTEM), HumanMessage(content=json.dumps(summary))]
        )
        decision = _parse_json(msg.content) or {"next": "ppt_builder"}
    except Exception:
        logger.exception("supervisor: LLM call failed")
        raise
    nxt = decision.get("next", "ppt_builder")
    if nxt in completed and nxt != "ppt_builder":
        # avoid infinite loops
        nxt = "ppt_builder"
    logger.info("supervisor: next=%s reason=%s", nxt, decision.get("reason", ""))
    events = _emit(state.get("events"), "supervisor", "decided", f"next={nxt} — {decision.get('reason','')}")
    return {"next_agent": nxt, "events": events}


def supervisor_router(state: PitchbookState) -> str:
    nxt = state.get("next_agent", "done")
    if nxt not in {"clarifier", "market_research", "crm", "competitor", "financials", "ppt_builder", "done"}:
        return "done"
    return nxt


CLARIFIER_SYSTEM = """You are the Clarifier Agent. Decide if the RM's query needs ONE clarifying question
to produce a high-quality pitchbook (e.g. missing client name, missing topic focus, missing geography).
If the query already includes a clear topic AND a client (or is generic enough to proceed), return needs_clarification=false.
Reply strict JSON:
{"needs_clarification": bool, "question": "<one short question or empty>"}
"""


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


def ppt_builder_node(state: PitchbookState) -> PitchbookState:
    logger.info("ppt_builder: enter template=%s", state.get("template_path") or "<none>")
    events = _emit(state.get("events"), "ppt_builder", "running", "assembling slides from template")
    try:
        path = build_pitchbook(
            topic=state.get("topic") or state.get("rm_query", "Pitchbook"),
            client=state.get("client") or "Prospective Client",
            research=state.get("research") or {},
            crm=state.get("crm") or {},
            competitors=state.get("competitors") or {},
            financials=state.get("financials") or {},
            template_path=state.get("template_path"),
        )
    except Exception:
        logger.exception("ppt_builder: failed to build deck")
        raise
    completed = state.get("completed", []) + ["ppt_builder"]
    logger.info("ppt_builder: done -> %s", path)
    events = _emit(events, "ppt_builder", "done", os.path.basename(path))
    final = (
        f"Pitchbook draft ready for **{state.get('client') or 'the client'}** on "
        f"**{state.get('topic') or state.get('rm_query','')}**. "
        f"Download the deck below and tell me what to refine."
    )
    return {"ppt_path": path, "completed": completed, "events": events, "final_answer": final}


def build_graph():
    g = StateGraph(PitchbookState)
    g.add_node("supervisor", supervisor_node)
    g.add_node("clarifier", clarifier_node)
    g.add_node("market_research", market_research_node)
    g.add_node("crm_agent", crm_node)
    g.add_node("competitor_agent", competitor_node)
    g.add_node("financials_agent", financials_node)
    g.add_node("ppt_builder", ppt_builder_node)

    g.set_entry_point("supervisor")
    g.add_conditional_edges(
        "supervisor",
        supervisor_router,
        {
            "clarifier": "clarifier",
            "market_research": "market_research",
            "crm": "crm_agent",
            "competitor": "competitor_agent",
            "financials": "financials_agent",
            "ppt_builder": "ppt_builder",
            "done": END,
        },
    )

    def after_clarifier(state: PitchbookState) -> str:
        return "ask_user" if state.get("needs_clarification") else "supervisor"

    g.add_conditional_edges("clarifier", after_clarifier, {"ask_user": END, "supervisor": "supervisor"})
    for n in ["market_research", "crm_agent", "competitor_agent", "financials_agent"]:
        g.add_edge(n, "supervisor")
    g.add_edge("ppt_builder", END)
    return g.compile()


GRAPH = build_graph()
