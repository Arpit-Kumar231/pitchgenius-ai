export type AgentEvent = { agent: string; status: string; detail?: string };
export type FinalPayload = { answer: string };

export type SlideAddEvent = {
  index: number;
  slide: { id: string; layoutId: string; props: unknown };
};
export type SlideReplaceEvent = SlideAddEvent;
export type DeckMetaEvent = { title?: string; client?: string };

export type StreamHandlers = {
  onThread?: (id: string) => void;
  onAgent?: (e: AgentEvent) => void;
  onClarify?: (q: string) => void;
  onFinal?: (p: FinalPayload) => void;
  onError?: (msg: string) => void;
  onSlideAdd?: (e: SlideAddEvent) => void;
  onSlideReplace?: (e: SlideReplaceEvent) => void;
  onDeckMeta?: (e: DeckMetaEvent) => void;
};

export function getBackendUrl(): string {
  const u = (import.meta as any).env?.VITE_AGENT_BACKEND_URL as string | undefined;
  return (u || "http://localhost:8000").replace(/\/$/, "");
}

async function streamSse(
  url: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
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
      else if (event === "slide.add") handlers.onSlideAdd?.(parsed);
      else if (event === "slide.replace") handlers.onSlideReplace?.(parsed);
      else if (event === "deck.meta") handlers.onDeckMeta?.(parsed);
    }
  }
}

export function streamChat(
  body: { thread_id?: string | null; message: string; client?: string; topic?: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
) {
  return streamSse(`${getBackendUrl()}/chat/stream`, body, handlers, signal);
}

export function streamEdit(
  body: { instruction: string; deck: unknown; activeSlideIndex?: number | null },
  handlers: StreamHandlers,
  signal?: AbortSignal,
) {
  return streamSse(`${getBackendUrl()}/edit/stream`, body, handlers, signal);
}
