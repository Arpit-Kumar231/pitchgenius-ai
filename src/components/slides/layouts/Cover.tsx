import { z } from "zod";

export const coverSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  client: z.string(),
  date: z.string().optional(),
  bank: z.string().default("Confidential"),
});

export function Cover({ data }: { data: z.infer<typeof coverSchema> }) {
  return (
    <div
      className="relative w-full h-full text-white"
      style={{
        background:
          "radial-gradient(ellipse at 20% 0%, #1e3a5f 0%, #0a1628 60%), #0a1628",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* gold accent bar */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 220,
          width: 80,
          height: 6,
          background: "linear-gradient(90deg,#d4a84c,#f0d78c)",
        }}
      />
      <div style={{ position: "absolute", left: 96, top: 280, right: 96 }}>
        <div style={{ fontSize: 24, opacity: 0.7, letterSpacing: 4, textTransform: "uppercase" }}>
          {data.bank}
        </div>
        <h1
          style={{
            fontFamily: "Fraunces, Georgia, serif",
            fontSize: 96,
            lineHeight: 1.05,
            marginTop: 36,
            fontWeight: 600,
          }}
        >
          {data.title}
        </h1>
        {data.subtitle ? (
          <div style={{ fontSize: 36, opacity: 0.85, marginTop: 32, maxWidth: 1400 }}>
            {data.subtitle}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 96,
          right: 96,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          fontSize: 22,
          opacity: 0.85,
        }}
      >
        <div>
          <div style={{ opacity: 0.55, fontSize: 16, textTransform: "uppercase", letterSpacing: 2 }}>
            Prepared for
          </div>
          <div style={{ fontSize: 32, marginTop: 8 }}>{data.client}</div>
        </div>
        {data.date ? <div>{data.date}</div> : null}
      </div>
    </div>
  );
}