import { z } from "zod";

export const closingSchema = z.object({
  title: z.string().default("Thank you"),
  contacts: z.array(z.object({ name: z.string(), role: z.string(), email: z.string().optional() })).min(1).max(4),
  bank: z.string().default("Confidential"),
});

export function Closing({ data }: { data: z.infer<typeof closingSchema> }) {
  return (
    <div
      className="relative w-full h-full text-white"
      style={{ background: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div style={{ position: "absolute", left: 96, top: 240, right: 96 }}>
        <div style={{ width: 80, height: 4, background: "#d4a84c" }} />
        <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 140, fontWeight: 600, lineHeight: 1, marginTop: 32 }}>
          {data.title}
        </h1>
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 160,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(data.contacts.length, 4)}, 1fr)`,
          gap: 48,
        }}
      >
        {data.contacts.map((c, i) => (
          <div key={i} style={{ borderTop: "2px solid #d4a84c", paddingTop: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 20, opacity: 0.7, marginTop: 6 }}>{c.role}</div>
            {c.email ? <div style={{ fontSize: 18, opacity: 0.6, marginTop: 12 }}>{c.email}</div> : null}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 56, fontSize: 14, opacity: 0.4, letterSpacing: 4, textTransform: "uppercase" }}>
        {data.bank}
      </div>
    </div>
  );
}