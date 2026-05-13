export type AgentEvent = { agent: string; status: string; detail?: string };
export type FinalPayload = { answer: string; ppt_url?: string; ppt_filename?: string };

export type StreamHandlers = {
  onThread?: (id: string) => void;
  onAgent?: (e: AgentEvent) => void;
  onClarify?: (q: string) => void;
  onFinal?: (p: FinalPayload) => void;
  onError?: (msg: string) => void;
};

export type TemplateInfo = {
  id: string;
  name: string;
  slide_count: number;
  layouts: string[];
  fonts: string[];
};

export function getBackendUrl(): string {
  const u = (import.meta as any).env?.VITE_AGENT_BACKEND_URL as string | undefined;
  return (u || "http://localhost:8000").replace(/\/$/, "");
}

export async function streamChat(
  body: {
    thread_id?: string | null;
    message: string;
    client?: string;
    topic?: string;
    template_id?: string | null;
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${getBackendUrl()}/chat/stream`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    handlers.onError?.(
      `Cannot reach backend at ${getBackendUrl()}. Is the Python server running? ` +
      `Set VITE_AGENT_BACKEND_URL in .env if it's not on http://localhost:8000.`,
    );
    return;
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    handlers.onError?.(`Backend error ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed: any;
      try { parsed = JSON.parse(data); } catch { continue; }
      if (event === "thread") handlers.onThread?.(parsed.thread_id);
      else if (event === "agent") handlers.onAgent?.(parsed);
      else if (event === "clarify") handlers.onClarify?.(parsed.question);
      else if (event === "final") handlers.onFinal?.(parsed);
      else if (event === "error") handlers.onError?.(parsed.message);
    }
  }
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  const r = await fetch(`${getBackendUrl()}/templates`);
  if (!r.ok) throw new Error(`templates list failed: ${r.status}`);
  const j = await r.json();
  return j.templates ?? [];
}

export async function uploadTemplate(file: File): Promise<TemplateInfo> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${getBackendUrl()}/templates/upload`, { method: "POST", body: fd });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`upload failed (${r.status}): ${t.slice(0, 300)}`);
  }
  return r.json();
}
