import { useEffect, useRef, useState } from "react";
import { Download, Send, User, Sparkles, AlertCircle } from "lucide-react";
import { AgentBadge } from "./AgentBadge";
import { TemplateManager } from "./TemplateManager";
import { getBackendUrl, streamChat, type AgentEvent, type FinalPayload } from "@/lib/agent-client";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  events?: AgentEvent[];
  ppt?: { url: string; filename: string };
  error?: string;
};

const SUGGESTIONS = [
  "Build a pitchbook for Helios Energy on a potential cross-border acquisition in EMEA",
  "Compare how peer banks are positioning in private credit for mid-market sponsors",
  "Pitchbook for ACME Robotics — refinancing options & sponsor sale alternatives",
];

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    const asstId = crypto.randomUUID();
    const asst: Message = { id: asstId, role: "assistant", events: [] };
    setMessages((m) => [...m, userMsg, asst]);
    setInput("");
    setBusy(true);

    const update = (patch: Partial<Message>) =>
      setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, ...patch, events: patch.events ?? x.events } : x)));

    const events: AgentEvent[] = [];
    await streamChat(
      { thread_id: threadId, message: text, template_id: templateId },
      {
        onThread: (id) => setThreadId(id),
        onAgent: (e) => {
          events.push(e);
          update({ events: [...events] });
        },
        onClarify: (q) => update({ text: q }),
        onFinal: (p: FinalPayload) =>
          update({
            text: p.answer,
            ppt: p.ppt_url ? { url: `${getBackendUrl()}${p.ppt_url}`, filename: p.ppt_filename ?? "pitchbook.pptx" } : undefined,
          }),
        onError: (msg) => update({ error: msg }),
      },
    );
    setBusy(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl leading-tight">Pitchbook Studio</h1>
            <p className="text-xs text-muted-foreground">Multi-agent pitchbook generator for Relationship Managers</p>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            backend: <span className="text-foreground/80">{getBackendUrl()}</span>
          </div>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto mb-6 max-w-3xl">
          <TemplateManager selectedId={templateId} onSelect={setTemplateId} />
        </div>
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 h-px w-24 gold-rule" />
            <h2 className="font-display text-3xl leading-tight">What pitchbook are we building today?</h2>
            <p className="mt-3 text-muted-foreground">
              Ask the supervisor for a deck. It will route to research, CRM, competitor and financial sub-agents,
              then assemble the slides.
            </p>
            <div className="mt-8 grid gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="glass rounded-md px-4 py-3 text-sm hover:border-primary/60 transition-colors text-foreground/90"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            {busy ? <div className="text-xs text-muted-foreground pl-12">Agents are working…</div> : null}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-border/60 px-6 py-4"
      >
        <div className="mx-auto max-w-3xl">
          <div className="glass flex items-end gap-2 rounded-lg p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              rows={2}
              placeholder="Describe the pitchbook you need…"
              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            v1 uses dummy CRM & market data. Swap real sources in <code>backend/app/tools.py</code>.
          </p>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="rounded-lg bg-accent/30 border border-accent/40 px-4 py-3 text-sm max-w-[80%]">
          {msg.text}
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {msg.events && msg.events.length > 0 ? (
          <div className="space-y-1.5">
            {msg.events.map((e, i) => <AgentBadge key={i} agent={e.agent} status={e.status} detail={e.detail} />)}
          </div>
        ) : null}
        {msg.text ? (
          <div className="rounded-lg glass px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {renderMarkdown(msg.text)}
          </div>
        ) : null}
        {msg.ppt ? (
          <a
            href={msg.ppt.url}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" /> Download {msg.ppt.filename}
          </a>
        ) : null}
        {msg.error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{msg.error}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Lightweight markdown: bold + line breaks (avoids extra dependency)
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="text-primary">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}
