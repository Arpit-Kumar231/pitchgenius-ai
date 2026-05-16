import { useEffect, useRef, useState } from "react";
import { Send, User, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { AgentBadge } from "./AgentBadge";
import { DeckPreview } from "@/components/slides/DeckPreview";
import { useDeck } from "@/lib/deck-store";
import {
  getBackendUrl,
  streamChat,
  streamEdit,
  type AgentEvent,
  type FinalPayload,
} from "@/lib/agent-client";

type Message = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  events?: AgentEvent[];
  error?: string;
};

const SUGGESTIONS = [
  "Build a pitchbook for Helios Energy on a cross-border acquisition in EMEA",
  "Pitchbook for ACME Robotics — refinancing and sponsor sale alternatives",
  "Compare how peer banks are positioning in mid-market private credit",
];

export function EditorView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const deck = useDeck((s) => s.deck);
  const activeIndex = useDeck((s) => s.activeIndex);
  const setDeckMeta = useDeck((s) => s.setMeta);
  const upsertSlide = useDeck((s) => s.upsertSlide);
  const replaceSlide = useDeck((s) => s.replaceSlide);
  const addSlide = useDeck((s) => s.addSlide);
  const resetDeck = useDeck((s) => s.reset);

  const hasDeck = deck.slides.length > 0;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const isEdit = hasDeck;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    const asstId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: asstId, role: "assistant", events: [] }]);
    setInput("");
    setBusy(true);

    const update = (patch: Partial<Message>) =>
      setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, ...patch } : x)));

    const events: AgentEvent[] = [];
    const handlers = {
      onThread: (id: string) => setThreadId(id),
      onAgent: (e: AgentEvent) => { events.push(e); update({ events: [...events] }); },
      onClarify: (q: string) => update({ text: q }),
      onFinal: (p: FinalPayload) => update({ text: p.answer }),
      onError: (msg: string) => update({ error: msg }),
      onDeckMeta: (m: { title?: string; client?: string }) => setDeckMeta(m),
      onSlideAdd: (e: { index: number; slide: { id: string; layoutId: string; props: unknown } }) =>
        addSlide(e.index, e.slide as never),
      onSlideReplace: (e: { index: number; slide: { id: string; layoutId: string; props: unknown } }) =>
        replaceSlide(e.index, e.slide as never),
    };

    if (isEdit) {
      await streamEdit({ instruction: text, deck, activeSlideIndex: activeIndex }, handlers);
    } else {
      await streamChat({ thread_id: threadId, message: text }, handlers);
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  function newDeck() {
    resetDeck();
    setMessages([]);
    setThreadId(null);
    inputRef.current?.focus();
  }

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: "minmax(380px, 38%) 1fr" }}>
      {/* LEFT: Chat */}
      <div className="flex h-full flex-col border-r border-border/60">
        <header className="border-b border-border/60 px-5 py-3 flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base leading-tight truncate">Pitchbook Studio</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              backend: {getBackendUrl()}
            </p>
          </div>
          <button
            onClick={newDeck}
            disabled={busy || (!hasDeck && messages.length === 0)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
          >
            <RefreshCw className="h-3 w-3" /> New
          </button>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <div className="text-center mt-6">
              <div className="mx-auto mb-3 h-px w-16 gold-rule" />
              <h2 className="font-display text-2xl leading-tight">What pitchbook are we building?</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Slides materialize on the right as agents work.
              </p>
              <div className="mt-6 grid gap-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glass rounded-md px-3 py-2 text-xs hover:border-primary/60 transition-colors text-foreground/90"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
              {busy ? <div className="text-xs text-muted-foreground pl-10">Agents working…</div> : null}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="border-t border-border/60 px-4 py-3"
        >
          <div className="glass flex items-end gap-2 rounded-lg p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              rows={2}
              placeholder={hasDeck
                ? `Edit slide #${activeIndex + 1} or the whole deck…`
                : "Describe the pitchbook you need…"}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {hasDeck
              ? `Edit mode — changes apply to slide #${activeIndex + 1} (active) or the whole deck.`
              : "Generate mode — agents will plan, gather data, and build the deck."}
          </p>
        </form>
      </div>

      {/* RIGHT: Deck preview */}
      <DeckPreview />
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex items-start gap-2 justify-end">
        <div className="rounded-lg bg-accent/30 border border-accent/40 px-3 py-2 text-sm max-w-[85%]">
          {msg.text}
        </div>
        <div className="grid h-7 w-7 place-items-center rounded-md bg-muted text-muted-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {msg.events && msg.events.length > 0 ? (
          <div className="space-y-1">
            {msg.events.map((e, i) => <AgentBadge key={i} agent={e.agent} status={e.status} detail={e.detail} />)}
          </div>
        ) : null}
        {msg.text ? (
          <div className="rounded-lg glass px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </div>
        ) : null}
        {msg.error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>{msg.error}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}