from typing import Any, Dict, List


def analyze_problem(problem: str) -> Dict[str, Any]:
    p = (problem or "").strip()
    kind = "general"
    lower = p.lower()
    if any(k in lower for k in ["integrate", "differentiate", "equation", "matrix", "+", "-", "*", "/"]):
        kind = "math"
    elif any(k in lower for k in ["force", "velocity", "current", "voltage", "ohm"]):
        kind = "physics"
    elif any(k in lower for k in ["code", "bug", "function", "compile", "test"]):
        kind = "code"
    elif any(k in lower for k in ["research", "compare", "paper", "topic"]):
        kind = "research"
    return {"ok": True, "kind": kind, "problem": p}


def generate_solution_plan(problem: str) -> Dict[str, Any]:
    base = analyze_problem(problem)
    steps: List[str] = [
        "Parse the request and identify the target output.",
        "Choose the appropriate specialized engine.",
        "Compute draft answer and intermediate checks.",
        "Validate consistency and confidence.",
        "Return concise final response with optional explanation mode.",
    ]
    return {"ok": True, "kind": base.get("kind"), "steps": steps}


def estimate_confidence(answer: Dict[str, Any]) -> Dict[str, Any]:
    score = 0.55
    if answer.get("ok"):
        score += 0.2
    if answer.get("error"):
        score -= 0.25
    if answer.get("validation", {}).get("ok") is True:
        score += 0.15
    score = max(0.05, min(0.98, score))
    return {"ok": True, "confidence": round(score, 3)}

