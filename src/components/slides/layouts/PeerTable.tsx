import { z } from "zod";
import { SlideHeader, SlideFootnote } from "./BulletList";

export const peerTableSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  columns: z.array(z.string()).min(2).max(5),
  rows: z.array(z.array(z.string())).min(1).max(8),
  footnote: z.string().optional(),
});

export function PeerTable({ data }: { data: z.infer<typeof peerTableSchema> }) {
  return (
    <div className="relative w-full h-full" style={{ background: "#f7f5f0", color: "#0a1628", fontFamily: "Inter, system-ui, sans-serif" }}>
      <SlideHeader eyebrow={data.eyebrow} title={data.title} />
      <div style={{ position: "absolute", left: 96, right: 96, top: 320, bottom: 120 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 22 }}>
          <thead>
            <tr style={{ background: "#0a1628", color: "white" }}>
              {data.columns.map((c, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 0 ? "left" : "right",
                    padding: "20px 28px",
                    fontSize: 18,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : "rgba(10,22,40,0.04)" }}>
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "22px 28px",
                      textAlign: ci === 0 ? "left" : "right",
                      fontWeight: ci === 0 ? 600 : 400,
                      borderBottom: "1px solid rgba(10,22,40,0.08)",
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.footnote ? <SlideFootnote text={data.footnote} /> : null}
    </div>
  );
}