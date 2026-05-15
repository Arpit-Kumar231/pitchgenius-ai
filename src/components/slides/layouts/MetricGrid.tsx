import { z } from "zod";
import { SlideHeader, SlideFootnote } from "./BulletList";

export const metricGridSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  metrics: z
    .array(z.object({ label: z.string(), value: z.string(), sublabel: z.string().optional() }))
    .min(2)
    .max(6),
  commentary: z.string().optional(),
  footnote: z.string().optional(),
});

export function MetricGrid({ data }: { data: z.infer<typeof metricGridSchema> }) {
  const cols = data.metrics.length <= 3 ? data.metrics.length : Math.ceil(data.metrics.length / 2);
  return (
    <div className="relative w-full h-full" style={{ background: "#f7f5f0", color: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}>
      <SlideHeader eyebrow={data.eyebrow} title={data.title} />
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 320,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 32,
        }}
      >
        {data.metrics.map((m, i) => (
          <div
            key={i}
            style={{
              border: "1px solid rgba(10,22,40,0.12)",
              background: "white",
              padding: "44px 36px",
              borderTop: "4px solid #d4a84c",
            }}
          >
            <div style={{ fontSize: 18, opacity: 0.6, textTransform: "uppercase", letterSpacing: 2 }}>{m.label}</div>
            <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 84, fontWeight: 600, lineHeight: 1, marginTop: 16 }}>
              {m.value}
            </div>
            {m.sublabel ? <div style={{ fontSize: 20, opacity: 0.7, marginTop: 12 }}>{m.sublabel}</div> : null}
          </div>
        ))}
      </div>
      {data.commentary ? (
        <div style={{ position: "absolute", left: 96, right: 96, bottom: 140, fontSize: 22, opacity: 0.75, lineHeight: 1.4 }}>
          {data.commentary}
        </div>
      ) : null}
      {data.footnote ? <SlideFootnote text={data.footnote} /> : null}
    </div>
  );
}