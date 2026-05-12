import PptxGenJS from "pptxgenjs";

const NAVY = "0B1F3A";
const GOLD = "C8A25B";
const LIGHT = "F4F1EA";
const DARK = "1A1A1A";
const MUTED = "6B6B6B";
const WHITE = "FFFFFF";

type Dict = Record<string, any>;

function sectionHeader(slide: PptxGenJS.Slide, title: string) {
  slide.addShape("rect", { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: NAVY }, line: { color: NAVY } });
  slide.addShape("rect", { x: 0, y: 0.9, w: 13.333, h: 0.05, fill: { color: GOLD }, line: { color: GOLD } });
  slide.addText(title, { x: 0.5, y: 0.18, w: 12, h: 0.6, fontSize: 24, bold: true, color: WHITE, fontFace: "Calibri" });
}

function bullets(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, items: string[], size = 16) {
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: true, fontSize: size, color: DARK, fontFace: "Calibri", paraSpaceAfter: 6 } })),
    { x, y, w, h, valign: "top" },
  );
}

export async function buildPitchbook(opts: {
  topic: string;
  client: string;
  research: Dict;
  crm: Dict;
  competitors: Dict;
  financials: Dict;
}): Promise<{ filename: string; data: Uint8Array }> {
  const { topic, client, research, crm, competitors, financials } = opts;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pres.layout = "WIDE";

  // 1 Cover
  let s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape("rect", { x: 0.5, y: 3.2, w: 1.2, h: 0.08, fill: { color: GOLD }, line: { color: GOLD } });
  s.addText(topic, { x: 0.5, y: 3.4, w: 12, h: 1.0, fontSize: 40, bold: true, color: WHITE, fontFace: "Calibri" });
  s.addText(`Prepared for ${client}`, { x: 0.5, y: 4.4, w: 12, h: 0.6, fontSize: 22, color: LIGHT, fontFace: "Calibri" });
  s.addText("Strictly private & confidential", { x: 0.5, y: 6.7, w: 12, h: 0.4, fontSize: 12, color: GOLD, fontFace: "Calibri" });

  // 2 Executive summary
  s = pres.addSlide();
  sectionHeader(s, "Executive Summary");
  bullets(s, 0.6, 1.3, 12, 5.5, [
    `${client} is positioned to capitalize on a $${research.market_size_usd_bn ?? "—"}B market growing at ${research.cagr_pct ?? "—"}% CAGR.`,
    `Current relationship: ${crm.tier ?? "—"} tier, ${crm.wallet_share_pct ?? "—"}% wallet share.`,
    `Financial profile: ${financials.ebitda_margin_pct ?? "—"}% EBITDA margin, ${financials.net_leverage_x ?? "—"}x net leverage.`,
    "Recommended next step: explore a strategic financing / advisory mandate.",
  ], 18);

  // 3 Situation
  s = pres.addSlide();
  sectionHeader(s, "Situation Overview");
  s.addText(`Topic: ${topic}`, { x: 0.6, y: 1.3, w: 12, h: 0.5, fontSize: 18, bold: true, color: NAVY, fontFace: "Calibri" });
  bullets(s, 0.6, 2.0, 12, 4.5, (research.insights ?? []).slice(0, 4));

  // 4 Market
  s = pres.addSlide();
  sectionHeader(s, "Market & Industry");
  s.addShape("rect", { x: 0.6, y: 1.4, w: 5.8, h: 2.2, fill: { color: LIGHT }, line: { color: LIGHT } });
  s.addText("Market size", { x: 0.8, y: 1.6, w: 5.4, h: 0.5, fontSize: 14, color: MUTED, fontFace: "Calibri" });
  s.addText(`$${research.market_size_usd_bn ?? "—"}B`, { x: 0.8, y: 2.1, w: 5.4, h: 1.2, fontSize: 40, bold: true, color: NAVY, fontFace: "Calibri" });
  s.addShape("rect", { x: 6.8, y: 1.4, w: 5.8, h: 2.2, fill: { color: LIGHT }, line: { color: LIGHT } });
  s.addText("CAGR (5Y)", { x: 7.0, y: 1.6, w: 5.4, h: 0.5, fontSize: 14, color: MUTED, fontFace: "Calibri" });
  s.addText(`${research.cagr_pct ?? "—"}%`, { x: 7.0, y: 2.1, w: 5.4, h: 1.2, fontSize: 40, bold: true, color: GOLD, fontFace: "Calibri" });
  s.addText("Key insights", { x: 0.6, y: 4.0, w: 12, h: 0.5, fontSize: 16, bold: true, color: NAVY, fontFace: "Calibri" });
  bullets(s, 0.6, 4.5, 12, 2.5, (research.insights ?? []).slice(0, 4), 14);

  // 5 Client snapshot
  s = pres.addSlide();
  sectionHeader(s, `Client Snapshot — ${crm.client ?? client}`);
  const rows: [string, string][] = [
    ["Tier", String(crm.tier ?? "—")],
    ["RM Owner", String(crm.rm_owner ?? "—")],
    ["Wallet share", `${crm.wallet_share_pct ?? "—"}%`],
    ["Last meeting", String(crm.last_meeting ?? "—")],
    ["Open mandates", (crm.open_mandates ?? ["—"]).join(", ")],
    ["Products used", (crm.products_used ?? ["—"]).join(", ")],
  ];
  let y = 1.4;
  for (const [k, v] of rows) {
    s.addText(k, { x: 0.6, y, w: 3.2, h: 0.4, fontSize: 13, color: MUTED, fontFace: "Calibri" });
    s.addText(v, { x: 3.9, y, w: 9, h: 0.4, fontSize: 15, bold: true, color: DARK, fontFace: "Calibri" });
    y += 0.55;
  }
  s.addText("Key contacts", { x: 0.6, y: y + 0.2, w: 12, h: 0.4, fontSize: 14, bold: true, color: NAVY, fontFace: "Calibri" });
  bullets(s, 0.6, y + 0.7, 12, 2, (crm.key_contacts ?? []).map((c: Dict) => `${c.name} — ${c.role}`));

  // 6 Competitors
  s = pres.addSlide();
  sectionHeader(s, "Competitor Landscape");
  const peers: Dict[] = competitors.peers ?? [];
  const colW = 12 / Math.max(peers.length, 1);
  peers.forEach((p, i) => {
    const x = 0.6 + i * colW;
    s.addShape("rect", { x, y: 1.4, w: colW - 0.2, h: 4.8, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addShape("rect", { x, y: 1.4, w: colW - 0.2, h: 0.5, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText(p.name ?? "", { x: x + 0.15, y: 1.45, w: colW - 0.4, h: 0.5, fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri" });
    s.addText("Recent deal", { x: x + 0.15, y: 2.1, w: colW - 0.4, h: 0.4, fontSize: 11, color: MUTED, fontFace: "Calibri" });
    s.addText(p.recent_deal ?? "", { x: x + 0.15, y: 2.5, w: colW - 0.4, h: 1.5, fontSize: 12, color: DARK, fontFace: "Calibri" });
    s.addText("Strength", { x: x + 0.15, y: 4.4, w: colW - 0.4, h: 0.4, fontSize: 11, color: MUTED, fontFace: "Calibri" });
    s.addText(p.strength ?? "", { x: x + 0.15, y: 4.8, w: colW - 0.4, h: 1.2, fontSize: 12, color: DARK, fontFace: "Calibri" });
  });
  s.addText(`Our edge: ${competitors.our_edge ?? "—"}`, { x: 0.6, y: 6.4, w: 12, h: 0.5, fontSize: 14, bold: true, color: GOLD, fontFace: "Calibri" });

  // 7 Financial
  s = pres.addSlide();
  sectionHeader(s, "Financial Profile & Comps");
  const metrics: [string, string][] = [
    ["Revenue ($M)", String(financials.revenue_usd_m ?? "—")],
    ["EBITDA margin", `${financials.ebitda_margin_pct ?? "—"}%`],
    ["Net leverage", `${financials.net_leverage_x ?? "—"}x`],
    ["EV / EBITDA", `${financials.ev_ebitda_x ?? "—"}x`],
  ];
  metrics.forEach(([k, v], i) => {
    const x = 0.6 + i * 3.1;
    s.addShape("rect", { x, y: 1.4, w: 2.9, h: 1.6, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addText(k, { x: x + 0.2, y: 1.5, w: 2.6, h: 0.4, fontSize: 12, color: MUTED, fontFace: "Calibri" });
    s.addText(v, { x: x + 0.2, y: 1.95, w: 2.6, h: 1.0, fontSize: 22, bold: true, color: NAVY, fontFace: "Calibri" });
  });
  s.addText("Selected precedent transactions", { x: 0.6, y: 3.4, w: 12, h: 0.5, fontSize: 14, bold: true, color: NAVY, fontFace: "Calibri" });
  let yc = 3.95;
  s.addText("Target", { x: 0.6, y: yc, w: 5, h: 0.4, fontSize: 12, bold: true, color: MUTED, fontFace: "Calibri" });
  s.addText("EV ($M)", { x: 6.0, y: yc, w: 3, h: 0.4, fontSize: 12, bold: true, color: MUTED, fontFace: "Calibri" });
  s.addText("EV / EBITDA", { x: 9.5, y: yc, w: 3, h: 0.4, fontSize: 12, bold: true, color: MUTED, fontFace: "Calibri" });
  for (const d of (financials.deal_comps ?? []) as Dict[]) {
    yc += 0.5;
    s.addText(String(d.target ?? "—"), { x: 0.6, y: yc, w: 5, h: 0.4, fontSize: 13, color: DARK, fontFace: "Calibri" });
    s.addText(String(d.ev_usd_m ?? "—"), { x: 6.0, y: yc, w: 3, h: 0.4, fontSize: 13, color: DARK, fontFace: "Calibri" });
    s.addText(`${d.ev_ebitda_x ?? "—"}x`, { x: 9.5, y: yc, w: 3, h: 0.4, fontSize: 13, color: DARK, fontFace: "Calibri" });
  }

  // 8 Strategic alternatives
  s = pres.addSlide();
  sectionHeader(s, "Strategic Alternatives");
  bullets(s, 0.6, 1.4, 12, 5.5, [
    "Status quo — optimize working capital and refinance 2027 maturities.",
    "Bolt-on M&A — 2-3 targets identified in adjacent segments.",
    "Strategic sale / partial monetization to a sponsor or strategic.",
    "IPO readiness pathway over 18-24 months.",
  ], 18);

  // 9 Why us
  s = pres.addSlide();
  sectionHeader(s, "Why Us");
  bullets(s, 0.6, 1.4, 12, 5.5, [
    "Top-3 league table position in sector YTD.",
    `${crm.wallet_share_pct ?? "—"}% wallet share — long-standing trusted advisor.`,
    "Integrated coverage: M&A, ECM, DCM, derivatives under one roof.",
    "Global distribution with deep sponsor relationships.",
  ], 18);

  // 10 Next steps
  s = pres.addSlide();
  sectionHeader(s, "Proposed Next Steps");
  bullets(s, 0.6, 1.4, 12, 5.5, [
    "Working session with CFO & Treasurer to align on priorities.",
    "Deep-dive financial diagnostic (2 weeks).",
    "Refined strategic options memo & process timeline.",
    "Decision gate — mandate kickoff target end of quarter.",
  ], 18);

  // Closing
  s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape("rect", { x: 0.5, y: 3.5, w: 1.2, h: 0.08, fill: { color: GOLD }, line: { color: GOLD } });
  s.addText("Thank you", { x: 0.5, y: 3.7, w: 12, h: 0.8, fontSize: 40, bold: true, color: WHITE, fontFace: "Calibri" });
  s.addText("Confidential — for discussion purposes only", { x: 0.5, y: 4.6, w: 12, h: 0.5, fontSize: 14, color: LIGHT, fontFace: "Calibri" });

  const buf = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  const filename = `pitchbook_${Math.random().toString(36).slice(2, 12)}.pptx`;
  return { filename, data: buf };
}