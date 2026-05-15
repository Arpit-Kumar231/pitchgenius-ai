import { useRef } from "react";
import { Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import PptxGenJS from "pptxgenjs";
import { SlideFrame } from "./SlideFrame";
import { LAYOUTS, renderSlideSafely } from "./registry";
import { useDeck } from "@/lib/deck-store";
import { useState } from "react";

export function DeckPreview() {
  const { deck, activeIndex, setActive } = useDeck();
  const activeRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const active = deck.slides[activeIndex];

  async function exportPptx() {
    if (!deck.slides.length) return;
    setExporting(true);
    try {
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5"
      // Render each slide off-screen at full 1920x1080, capture to PNG, embed as full-bleed.
      const stage = document.getElementById("export-stage")!;
      for (let i = 0; i < deck.slides.length; i++) {
        const s = deck.slides[i];
        const r = renderSlideSafely(s.layoutId, s.props);
        if (!r.ok) continue;
        // Mount the slide synchronously by switching active and waiting a tick.
        setActive(i);
        await new Promise((res) => setTimeout(res, 50));
        const node = stage.querySelector<HTMLElement>(`[data-export-slide="${i}"]`);
        if (!node) continue;
        const dataUrl = await toPng(node, { width: 1920, height: 1080, pixelRatio: 1, cacheBust: true });
        const slide = pptx.addSlide();
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: 13.333, h: 7.5 });
      }
      await pptx.writeFile({ fileName: `${(deck.title || "pitchbook").replace(/\s+/g, "_")}.pptx` });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-medium">{deck.title || "Pitchbook"}</div>
          <div className="text-xs text-muted-foreground">
            {deck.slides.length} slide{deck.slides.length === 1 ? "" : "s"}
            {deck.client ? ` • ${deck.client}` : ""}
          </div>
        </div>
        <button
          onClick={exportPptx}
          disabled={exporting || deck.slides.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export .pptx
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Thumbnails */}
        <div className="w-44 shrink-0 overflow-y-auto border-r border-border/60 p-2 space-y-2">
          {deck.slides.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3">Slides will appear as agents build them.</div>
          ) : null}
          {deck.slides.map((s, i) => {
            const r = renderSlideSafely(s.layoutId, s.props);
            return (
              <button
                key={s.id}
                onClick={() => setActive(i)}
                className={`group block w-full overflow-hidden rounded border ${
                  i === activeIndex ? "border-primary" : "border-border/60"
                }`}
              >
                <div className="relative aspect-video w-full bg-card">
                  <SlideFrame>
                    {r.ok ? <r.layout.Component data={r.data as never} /> : <ErrorSlide message={r.error} />}
                  </SlideFrame>
                </div>
                <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
                  <span>#{i + 1}</span>
                  <span className="truncate">{LAYOUTS[s.layoutId]?.name ?? s.layoutId}</span>
                </div>
              </button>
            );
          })}
        </div>
        {/* Active slide */}
        <div ref={activeRef} className="flex-1 p-6">
          <div className="mx-auto h-full max-h-full w-full overflow-hidden rounded-lg border border-border/60 bg-card">
            {active ? (
              <SlideFrame>
                <ActiveSlide />
              </SlideFrame>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No slides yet.
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Hidden full-resolution stage used only during export */}
      <div id="export-stage" style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }}>
        {deck.slides.map((s, i) => {
          const r = renderSlideSafely(s.layoutId, s.props);
          if (!r.ok) return null;
          return (
            <div key={s.id} data-export-slide={i} style={{ width: 1920, height: 1080 }}>
              <r.layout.Component data={r.data as never} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveSlide() {
  const { deck, activeIndex } = useDeck();
  const s = deck.slides[activeIndex];
  if (!s) return null;
  const r = renderSlideSafely(s.layoutId, s.props);
  if (!r.ok) return <ErrorSlide message={r.error} />;
  return <r.layout.Component data={r.data as never} />;
}

function ErrorSlide({ message }: { message: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-destructive/10 text-destructive p-12 text-2xl">
      Layout error: {message}
    </div>
  );
}