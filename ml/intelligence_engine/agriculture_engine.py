from typing import Any, Dict, List


def agriculture_intelligence(query: str, mode: str = "farm") -> Dict[str, Any]:
    q = (query or "").strip()
    lower = q.lower()

    crop_focus: List[str] = []
    for c in ["maize", "wheat", "rice", "soybean", "coffee", "tea", "sugarcane", "cotton", "tomato", "potato"]:
        if c in lower:
            crop_focus.append(c)
    forestry_focus = any(k in lower for k in ["forest", "timber", "tree", "silviculture", "reforestation"])

    disease_signals = []
    if any(k in lower for k in ["yellow leaf", "wilting", "blight", "rot", "spots", "pest"]):
        disease_signals.append("potential plant disease or pest pressure")
    if any(k in lower for k in ["drought", "water stress", "heat stress"]):
        disease_signals.append("climate stress")

    actions = [
        "Run field scouting protocol (sample plots + geotagged observations).",
        "Validate soil profile (pH, organic matter, NPK, moisture).",
        "Apply integrated pest management and rotate chemistry modes-of-action.",
        "Use localized weather forecast and irrigation scheduling.",
    ]
    if forestry_focus:
        actions.extend(
            [
                "Assess stand density and thinning schedule.",
                "Track fire risk index and establish prevention zones.",
                "Monitor pests/pathogens and plan reforestation mix.",
            ]
        )

    market = [
        "Track commodity trend windows (spot vs forward).",
        "Diversify crop portfolio and hedge weather exposure where possible.",
        "Use storage timing strategy to reduce post-harvest losses.",
    ]

    return {
        "ok": True,
        "domain": "agriculture_forestry",
        "mode": mode,
        "query": q,
        "crop_focus": crop_focus,
        "forestry_focus": forestry_focus,
        "signals": disease_signals,
        "recommended_actions": actions[:12],
        "yield_strategy": [
            "Seed selection by zone",
            "Precision fertilization by stage",
            "Disease scouting calendar",
            "Harvest and storage optimization",
        ],
        "market_strategy": market,
        "confidence": 0.66 if crop_focus or forestry_focus else 0.52,
    }

