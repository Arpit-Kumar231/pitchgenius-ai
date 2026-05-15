import { z } from "zod";
import { SlideHeader, SlideFootnote } from "./BulletList";

export const twoColumnSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  left: z.object({ heading: z.string(), bullets: z.array(z.string()).min(1).max(6) }),
  right: z.object({ heading: z.string(), bullets: z.array(z.string()).min(1).max(6) }),
  footnote: z.string().optional(),
});

export function TwoColumn({ data }: { data: z.infer<typeof twoColumnSchema> }) {
  return (
    <div className="relative w-full h-full" style={{ background: "#f7f5f0", color: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}>
      <SlideHeader eyebrow={data.eyebrow} title={data.title} />
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 320,
          bottom: 120,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
        }}
      >
        {[data.left, data.right].map((col, i) => (
          <div key={i} style={{ background: "white", padding: 48, borderLeft: "4px solid #d4a84c" }}>
            <div style={{ fontSize: 32, fontWeight: 600, fontFamily: "Fraunces, Georgia, serif" }}>{col.heading}</div>
            <ul style={{ marginTop: 28, padding: 0, listStyle: "none" }}>
              {col.bullets.map((b, j) => (
                <li key={j} style={{ display: "flex", gap: 16, marginBottom: 18, fontSize: 22, lineHeight: 1.4 }}>
                  <span style={{ color: "#d4a84c", fontWeight: 700 }}>•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data.footnote ? <SlideFootnote text={data.footnote} /> : null}
    </div>
  );
}