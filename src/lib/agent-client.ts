export type AgentEvent = { agent: string; status: string; detail?: string };
export type FinalPayload = { answer: string; ppt_url?: string; ppt_filename?: string };

export type StreamHandlers = {
  onThread?: (id: string) => void;
  onAgent?: (e: AgentEvent) => void;
  onClarify?: (q: string) => void;
  onFinal?: (p: FinalPayload) => void;
  onError?: (msg: string) => void;
};

export function getBackendUrl(): string {
  const u = (import.meta as any).env?.VITE_AGENT_BACKEND_URL as string | undefined;
  // Default to same-origin so the in-app TanStack server routes handle it.
  return (u || "").replace(/\/$/, "");
}

export async function streamChat(
  body: { thread_id?: string | null; message: string; client?: string; topic?: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${getBackendUrl()}/api/chat/stream`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    handlers.onError?.(`Cannot reach backend at ${getBackendUrl()}. Set VITE_AGENT_BACKEND_URL.`);
    return;
  }
  if (!res.ok || !res.body) {
    handlers.onError?.(`Backend error ${res.status}`);
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
