// Stub data sources for v1 — swap with real APIs later.
export function fetchMarketResearch(topic: string) {
  return {
    market_size_usd_bn: 248,
    cagr_pct: 11.4,
    insights: [
      `${topic}: secular tailwinds from policy + capex cycles in EMEA & APAC.`,
      "Strategic consolidation accelerating among top-10 players.",
      "Sponsor dry powder at record levels supporting multiples.",
      "ESG-linked financing structures gaining institutional adoption.",
    ],
  };
}
export function fetchCrmAccount(client: string) {
  return {
    client,
    tier: "Platinum",
    rm_owner: "A. Müller",
    wallet_share_pct: 32,
    last_meeting: "2026-04-22",
    open_mandates: ["Revolver upsize", "Hedging review"],
    products_used: ["DCM", "Treasury", "FX", "M&A advisory"],
    key_contacts: [
      { name: "Elena Rossi", role: "CFO" },
      { name: "Marcus Chen", role: "Group Treasurer" },
      { name: "Sara Okafor", role: "Head of Strategy" },
    ],
  };
}
export function fetchCompetitorLandscape(_topic: string) {
  return {
    peers: [
      { name: "JPM", recent_deal: "$2.4B EMEA renewables M&A", strength: "Sector league table #1 YTD" },
      { name: "GS", recent_deal: "$1.8B sponsor-led carve-out", strength: "Sponsor coverage depth" },
      { name: "MS", recent_deal: "€900M green bond", strength: "ECM & ESG structuring" },
      { name: "BAML", recent_deal: "$1.2B cross-border acquisition financing", strength: "Balance sheet" },
    ],
    our_edge: "Integrated coverage + sector specialists with on-the-ground EMEA presence.",
  };
}
export function fetchFinancialMetrics(_client: string) {
  return {
    revenue_usd_m: 1840,
    ebitda_margin_pct: 22.5,
    net_leverage_x: 2.1,
    ev_ebitda_x: 11.8,
    deal_comps: [
      { target: "Vento Renewables", ev_usd_m: 2200, ev_ebitda_x: 12.4 },
      { target: "AlpenGrid", ev_usd_m: 1650, ev_ebitda_x: 10.9 },
      { target: "NorSolar", ev_usd_m: 980, ev_ebitda_x: 13.1 },
    ],
  };
}