import { z } from "zod";

export const sectionDividerSchema = z.object({
  sectionNumber: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export function SectionDivider({ data }: { data: z.infer<typeof sectionDividerSchema> }) {
  return (
    <div
      className="relative w-full h-full text-white"
      style={{ background: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: 160,
          paddingRight: 160,
        }}
      >
        {data.sectionNumber ? (
          <div style={{ fontSize: 32, color: "#d4a84c", letterSpacing: 6, marginBottom: 32 }}>
            {data.sectionNumber}
          </div>
        ) : null}
        <div style={{ width: 80, height: 4, background: "#d4a84c", marginBottom: 32 }} />
        <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 120, lineHeight: 1, fontWeight: 600 }}>
          {data.title}
        </h1>
        {data.subtitle ? (
          <div style={{ fontSize: 32, opacity: 0.7, marginTop: 32, maxWidth: 1200 }}>
            {data.subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}