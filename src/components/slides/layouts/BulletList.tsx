import { z } from "zod";

export const bulletListSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  bullets: z.array(z.object({ heading: z.string(), body: z.string().optional() })).min(1).max(8),
  footnote: z.string().optional(),
});

export function BulletList({ data }: { data: z.infer<typeof bulletListSchema> }) {
  return (
    <div
      className="relative w-full h-full"
      style={{ background: "#f7f5f0", color: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <SlideHeader eyebrow={data.eyebrow} title={data.title} />
      <div style={{ position: "absolute", left: 96, right: 96, top: 320, bottom: 120, display: "grid", gap: 28 }}>
        {data.bullets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <div
              style={{
                minWidth: 56,
                height: 56,
                borderRadius: 28,
                background: "#0a1628",
                color: "#d4a84c",
                display: "grid",
                placeItems: "center",
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>{b.heading}</div>
              {b.body ? <div style={{ fontSize: 22, opacity: 0.7, marginTop: 8, lineHeight: 1.4 }}>{b.body}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {data.footnote ? <SlideFootnote text={data.footnote} /> : null}
    </div>
  );
}

export function SlideHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div style={{ position: "absolute", left: 96, top: 96, right: 96 }}>
      {eyebrow ? (
        <div style={{ fontSize: 18, color: "#a07c2a", letterSpacing: 4, textTransform: "uppercase", marginBottom: 16 }}>
          {eyebrow}
        </div>
      ) : null}
      <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 64, lineHeight: 1.1, fontWeight: 600, margin: 0 }}>
        {title}
      </h2>
      <div style={{ marginTop: 28, height: 3, width: 96, background: "#d4a84c" }} />
    </div>
  );
}

export function SlideFootnote({ text }: { text: string }) {
  return (
    <div style={{ position: "absolute", left: 96, right: 96, bottom: 56, fontSize: 16, opacity: 0.55 }}>
      {text}
    </div>
  );
}