import {
  fetchCompetitorLandscape,
  fetchCrmAccount,
  fetchFinancialMetrics,
  fetchMarketResearch,
} from "./tools.server";
import { buildPitchbook } from "./ppt.server";
import { putFile } from "./store.server";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Dict = Record<string, any>;

export type AgentEvent =
  | { type: "thread"; thread_id: string }
  | { type: "agent"; agent: string; status: string; detail?: string }
  | { type: "clarify"; question: string }
  | { type: "final"; answer: string; ppt_url?: string; ppt_filename?: string }
  | { type: "error"; message: string };

export type ThreadState = {
  rm_query: string;
  client: string;
  topic: string;
  completed: string[];
  research?: Dict;
  crm?: Dict;
  competitors?: Dict;
  financials?: Dict;
  clarifier_done?: boolean;
};

const THREADS = new Map<string, ThreadState>();

export function getThread(id: string): ThreadState | undefined {
  return THREADS.get(id);
}
export function setThread(id: string, s: ThreadState): void {
  THREADS.set(id, s);
}

async function callOpenAI(system: string, user: string, temperature = 0): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await res.json();
  return j?.choices?.[0]?.message?.content ?? "{}";
}

function parseJSON(s: string): Dict {
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {}
    }
    return {};
  }
}

const SUPERVISOR_SYSTEM = `You are the Supervisor Agent for an investment-banking pitchbook generator.
A Relationship Manager (RM) at a bank gives you a query. You orchestrate sub-agents.

Available sub-agents:
- market_research: industry/market data and public company info
- crm: internal CRM/account & relationship data for the target client
- competitor: comparative analysis vs peers
- financials: financial metrics, valuation, deal comps
- ppt_builder: assemble final pitchbook (call ONLY after data gathering, exactly once)
- done: finish

Decide the SINGLE next agent to invoke. Do not repeat agents already in completed_agents.
Once ppt_builder has run, choose "done". Respond as strict JSON:
{"next": "<agent>", "reason": "<short reason>"}`;

const CLARIFIER_SYSTEM = `You are the Clarifier Agent. Decide if the RM's query needs ONE clarifying question
to produce a high-quality pitchbook (e.g. missing client name, missing topic focus, missing geography).
If the query already includes a clear topic AND a client, return needs_clarification=false.
Reply strict JSON:
{"needs_clarification": bool, "question": "<one short question or empty>", "client": "<inferred client or empty>", "topic": "<inferred topic or empty>"}`;

export async function* runPitchbook(opts: {
  thread_id?: string | null;
  message: string;
  client?: string;
  topic?: string;
}): AsyncGenerator<AgentEvent> {
  const threadId = opts.thread_id || crypto.randomUUID();
  yield { type: "thread", thread_id: threadId };

  let state = THREADS.get(threadId);
  if (!state) {
    state = {
      rm_query: opts.message,
      client: opts.client || "",
      topic: opts.topic || "",
      completed: [],
    };

    // ---- clarifier ----
    yield { type: "agent", agent: "clarifier", status: "running", detail: "evaluating query completeness" };
    try {
      const out = parseJSON(await callOpenAI(CLARIFIER_SYSTEM, opts.message));
      if (out.client && !state.client) state.client = String(out.client);
      if (out.topic && !state.topic) state.topic = String(out.topic);
      state.completed.push("clarifier");
      state.clarifier_done = true;
      if (out.needs_clarification && out.question) {
        yield { type: "agent", agent: "clarifier", status: "done", detail: "needs more info" };
        THREADS.set(threadId, state);
        yield { type: "clarify", question: String(out.question) };
        yield { type: "final", answer: String(out.question) };
        return;
      }
      yield { type: "agent", agent: "clarifier", status: "done", detail: "query is clear" };
    } catch (e: any) {
      yield { type: "error", message: e?.message || "clarifier failed" };
      return;
    }
  } else {
    // follow-up answer to the clarifier — merge it into the query
    state.rm_query = `${state.rm_query}\nRM follow-up: ${opts.message}`;
    if (!state.topic) state.topic = state.rm_query;
  }

  if (!state.client) state.client = "Prospective Client";
  if (!state.topic) state.topic = state.rm_query;

  // ---- supervisor loop ----
  for (let i = 0; i < 8; i++) {
    const summary = {
      rm_query: state.rm_query,
      completed_agents: state.completed,
      has_research: !!state.research,
      has_crm: !!state.crm,
      has_competitors: !!state.competitors,
      has_financials: !!state.financials,
    };
    let next = "ppt_builder";
    let reason = "";
    try {
      const decision = parseJSON(await callOpenAI(SUPERVISOR_SYSTEM, JSON.stringify(summary)));
      next = String(decision.next || "ppt_builder");
      reason = String(decision.reason || "");
    } catch (e: any) {
      yield { type: "error", message: e?.message || "supervisor failed" };
      return;
    }
    if (state.completed.includes(next) && next !== "ppt_builder" && next !== "done") {
      next = "ppt_builder";
    }
    yield { type: "agent", agent: "supervisor", status: "decided", detail: `next=${next} — ${reason}` };

    if (next === "done") break;

    if (next === "market_research") {
      yield { type: "agent", agent: "market_research", status: "running", detail: "fetching market & industry data" };
      state.research = fetchMarketResearch(state.topic);
      state.completed.push("market_research");
      yield { type: "agent", agent: "market_research", status: "done", detail: `${state.research.insights.length} insights` };
    } else if (next === "crm") {
      yield { type: "agent", agent: "crm", status: "running", detail: "querying internal CRM" };
      state.crm = fetchCrmAccount(state.client);
      state.completed.push("crm");
      yield { type: "agent", agent: "crm", status: "done", detail: `account tier ${state.crm.tier}` };
    } else if (next === "competitor") {
      yield { type: "agent", agent: "competitor", status: "running", detail: "scanning peer landscape" };
      state.competitors = fetchCompetitorLandscape(state.topic);
      state.completed.push("competitor");
      yield { type: "agent", agent: "competitor", status: "done", detail: `${state.competitors.peers.length} peers` };
    } else if (next === "financials") {
      yield { type: "agent", agent: "financials", status: "running", detail: "computing financial metrics" };
      state.financials = fetchFinancialMetrics(state.client);
      state.completed.push("financials");
      yield { type: "agent", agent: "financials", status: "done", detail: "metrics ready" };
    } else if (next === "ppt_builder") {
      yield { type: "agent", agent: "ppt_builder", status: "running", detail: "assembling slides" };
      // ensure we have at least the basic data
      if (!state.research) state.research = fetchMarketResearch(state.topic);
      if (!state.crm) state.crm = fetchCrmAccount(state.client);
      if (!state.competitors) state.competitors = fetchCompetitorLandscape(state.topic);
      if (!state.financials) state.financials = fetchFinancialMetrics(state.client);
      try {
        const { filename, data } = await buildPitchbook({
          topic: state.topic,
          client: state.client,
          research: state.research,
          crm: state.crm,
          competitors: state.competitors,
          financials: state.financials,
        });
        putFile(filename, data);
        state.completed.push("ppt_builder");
        yield { type: "agent", agent: "ppt_builder", status: "done", detail: filename };
        const answer =
          `Pitchbook draft ready for **${state.client}** on **${state.topic}**. ` +
          `Download the deck below and tell me what to refine.`;
        THREADS.set(threadId, state);
        yield { type: "final", answer, ppt_url: `/api/files/${filename}`, ppt_filename: filename };
        return;
      } catch (e: any) {
        yield { type: "error", message: `ppt builder failed: ${e?.message ?? e}` };
        return;
      }
    } else {
      // unknown agent — bail to ppt builder
      continue;
    }
    THREADS.set(threadId, state);
  }

  yield { type: "final", answer: "Supervisor stopped without producing a pitchbook." };
}