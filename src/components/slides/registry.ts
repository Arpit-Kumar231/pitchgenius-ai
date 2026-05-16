import type { LayoutDef } from "./types";
import { Cover, coverSchema } from "./layouts/Cover";
import { SectionDivider, sectionDividerSchema } from "./layouts/SectionDivider";
import { BulletList, bulletListSchema } from "./layouts/BulletList";
import { MetricGrid, metricGridSchema } from "./layouts/MetricGrid";
import { PeerTable, peerTableSchema } from "./layouts/PeerTable";
import { TwoColumn, twoColumnSchema } from "./layouts/TwoColumn";
import { Closing, closingSchema } from "./layouts/Closing";
import { CustomHtml, customHtmlSchema } from "./layouts/CustomHtml";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LAYOUTS: Record<string, LayoutDef<any>> = {
  cover: {
    id: "cover",
    name: "Cover",
    description: "Title slide with client name and date",
    schema: coverSchema,
    Component: Cover,
  },
  section_divider: {
    id: "section_divider",
    name: "Section Divider",
    description: "Section break with number and title",
    schema: sectionDividerSchema,
    Component: SectionDivider,
  },
  bullet_list: {
    id: "bullet_list",
    name: "Numbered Bullets",
    description: "Title + numbered list with optional sub-text per item",
    schema: bulletListSchema,
    Component: BulletList,
  },
  metric_grid: {
    id: "metric_grid",
    name: "Metric Grid",
    description: "2-6 large KPI cards with optional commentary",
    schema: metricGridSchema,
    Component: MetricGrid,
  },
  peer_table: {
    id: "peer_table",
    name: "Peer Table",
    description: "Comparison table for peers/comps",
    schema: peerTableSchema,
    Component: PeerTable,
  },
  two_column: {
    id: "two_column",
    name: "Two Columns",
    description: "Side-by-side bullet columns (e.g. opportunities vs risks)",
    schema: twoColumnSchema,
    Component: TwoColumn,
  },
  closing: {
    id: "closing",
    name: "Closing",
    description: "Thank-you slide with contacts",
    schema: closingSchema,
    Component: Closing,
  },
  custom_html: {
    id: "custom_html",
    name: "Custom (AI-generated)",
    description: "Fully AI-designed slide. HTML + inline CSS on a 1920x1080 canvas.",
    schema: customHtmlSchema,
    Component: CustomHtml,
  },
};

export function renderSlideSafely(layoutId: string, props: unknown):
  | { ok: true; layout: LayoutDef; data: unknown }
  | { ok: false; error: string } {
  const layout = LAYOUTS[layoutId];
  if (!layout) return { ok: false, error: `Unknown layout: ${layoutId}` };
  const parsed = (layout.schema as z.ZodTypeAny).safeParse(props);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, layout, data: parsed.data };
}

export function layoutCatalogue(): { id: string; name: string; description: string; schema: object }[] {
  return Object.values(LAYOUTS).map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    // best-effort JSON Schema-ish dump for prompts
    schema: zodShapeSummary(l.schema),
  }));
}

function zodShapeSummary(s: z.ZodTypeAny): object {
  // Walk top level for prompt readability — full JSON Schema would be heavy.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def: any = (s as any)._def;
    if (def?.typeName === "ZodObject") {
      const out: Record<string, string> = {};
      const shape = def.shape();
      for (const k of Object.keys(shape)) out[k] = describe(shape[k]);
      return out;
    }
  } catch {
    // ignore
  }
  return { type: "unknown" };
}

function describe(s: z.ZodTypeAny): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def: any = (s as any)._def;
  switch (def?.typeName) {
    case "ZodString": return "string";
    case "ZodNumber": return "number";
    case "ZodBoolean": return "boolean";
    case "ZodArray": return `array<${describe(def.type)}>`;
    case "ZodObject": return "object";
    case "ZodOptional": return `optional<${describe(def.innerType)}>`;
    case "ZodDefault": return `default<${describe(def.innerType)}>`;
    default: return def?.typeName || "any";
  }
}