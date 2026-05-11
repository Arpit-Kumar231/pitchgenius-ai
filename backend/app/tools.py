"""Stubbed data sources for sub-agents.

Replace these with real CRM / market-data / web-search integrations later.
The shape of the return values is what the PPT builder relies on.
"""
from __future__ import annotations

import random
from typing import Any


def fetch_market_research(topic: str) -> dict[str, Any]:
    return {
        "topic": topic,
        "market_size_usd_bn": round(random.uniform(50, 800), 1),
        "cagr_pct": round(random.uniform(4, 18), 1),
        "insights": [
            f"{topic} demand is being reshaped by AI-driven workflows.",
            "Regulatory tailwinds in EU and APAC are accelerating M&A.",
            "Mid-market consolidation is creating cross-border opportunities.",
            "Capex cycles are extending; sponsors hunting recurring-revenue assets.",
        ],
        "sources": [
            "Bloomberg Intelligence (sample)",
            "S&P Capital IQ (sample)",
            "Internal research desk note 24-Q4",
        ],
    }


def fetch_crm_account(client: str) -> dict[str, Any]:
    tiers = ["Platinum", "Gold", "Silver"]
    return {
        "client": client,
        "tier": random.choice(tiers),
        "rm_owner": "J. Patel",
        "wallet_share_pct": round(random.uniform(8, 35), 1),
        "last_meeting": "2026-03-12",
        "open_mandates": ["Refinancing review", "FX hedging RFP"],
        "products_used": ["Cash management", "DCM", "Trade finance"],
        "key_contacts": [
            {"name": "A. Müller", "role": "CFO"},
            {"name": "S. Romano", "role": "Group Treasurer"},
        ],
    }


def fetch_competitor_landscape(topic: str) -> dict[str, Any]:
    peers = ["NorthBay Capital", "Helios Partners", "Meridian Securities", "Atlas IB"]
    return {
        "topic": topic,
        "peers": [
            {
                "name": p,
                "recent_deal": f"Advised on ${random.randint(200, 4500)}M transaction",
                "strength": random.choice(["Sector depth", "Cross-border reach", "Sponsor coverage"]),
            }
            for p in peers
        ],
        "our_edge": "Integrated coverage + balance sheet, top-3 in sector league tables YTD.",
    }


def fetch_financial_metrics(entity: str) -> dict[str, Any]:
    return {
        "entity": entity,
        "revenue_usd_m": round(random.uniform(400, 6000), 1),
        "ebitda_margin_pct": round(random.uniform(12, 34), 1),
        "net_leverage_x": round(random.uniform(0.5, 4.5), 2),
        "ev_ebitda_x": round(random.uniform(7, 18), 1),
        "deal_comps": [
            {"target": "Acme Co", "ev_usd_m": 1450, "ev_ebitda_x": 11.2},
            {"target": "Belmont Industries", "ev_usd_m": 980, "ev_ebitda_x": 9.8},
            {"target": "Cobalt Group", "ev_usd_m": 2300, "ev_ebitda_x": 12.6},
        ],
    }
