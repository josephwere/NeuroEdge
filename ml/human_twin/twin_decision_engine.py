from typing import Dict, List


RISK_WORDS = {
    "high": ["irreversible", "legal", "contract", "security", "financial"],
    "medium": ["timeline", "resource", "dependency", "migration"],
    "low": ["ui", "copy", "refactor", "minor"],
}


def _risk_level(text: str) -> str:
    lower = (text or "").lower()
    for level in ["high", "medium", "low"]:
        if any(w in lower for w in RISK_WORDS[level]):
            return level
    return "medium"


def simulate_decision(prompt: str, profile: Dict[str, object], framework: Dict[str, object]) -> Dict[str, object]:
    risk = _risk_level(prompt)
    goals = profile.get("goals") or []
    horizon = int(profile.get("strategic_horizon_years") or 5)
    appetite = str(profile.get("risk_appetite") or "medium")

    likely = "proceed_with_guardrails"
    if risk == "high" and appetite in ("low", "medium"):
        likely = "defer_and_collect_evidence"
    elif risk == "low":
        likely = "execute_iteratively"

    alignment = "high" if goals else "medium"
    recommendations: List[str] = [
        "State objective, constraints, and fallback plan.",
        "Record rationale in decision log for future audits.",
    ]
    if risk == "high":
        recommendations.append("Require explicit human approval before commitment.")

    return {
        "likely_decision": likely,
        "risk_level": risk,
        "risk_appetite": appetite,
        "alignment_with_vision": alignment,
        "horizon_years": horizon,
        "values": framework.get("values", []),
        "recommendations": recommendations,
        "disclosure": "Decision simulation only. Final authority remains human.",
    }
