from typing import Any, Dict, List


def market_intelligence(query: str, mode: str = "analysis") -> Dict[str, Any]:
    q = (query or "").strip()
    lower = q.lower()

    asset_classes: List[str] = []
    checks = {
        "equities": ["stock", "equity", "nasdaq", "nyse", "share"],
        "crypto": ["crypto", "bitcoin", "btc", "eth", "token", "defi"],
        "fx": ["forex", "usd", "eur", "gbp", "jpy"],
        "commodities": ["gold", "silver", "oil", "gas", "copper", "wheat", "maize", "rice", "coffee"],
        "bonds": ["bond", "yield", "treasury", "coupon"],
        "real_estate": ["real estate", "property", "reit"],
    }
    for cls, words in checks.items():
        if any(w in lower for w in words):
            asset_classes.append(cls)

    risk = "medium"
    if any(w in lower for w in ["leveraged", "margin", "high risk", "aggressive"]):
        risk = "high"
    if any(w in lower for w in ["capital preservation", "low risk", "conservative"]):
        risk = "low"

    framework = [
        "Define thesis and invalidation level.",
        "Assess macro + sector regime.",
        "Check liquidity, spread, and volatility profile.",
        "Set position sizing and stop-loss policy.",
        "Monitor event calendar and rebalance rules.",
    ]

    return {
        "ok": True,
        "domain": "market_business",
        "mode": mode,
        "query": q,
        "asset_classes_detected": asset_classes or ["multi_asset"],
        "risk_profile": risk,
        "analysis_framework": framework,
        "portfolio_notes": [
            "Diversification across uncorrelated assets reduces concentration risk.",
            "Use scenario analysis for rate shocks, liquidity events, and drawdown limits.",
            "Document trade rationale and post-trade review loop.",
        ],
        "compliance_notice": "Educational market analysis only. Not financial advice.",
        "confidence": 0.64 if asset_classes else 0.51,
    }

