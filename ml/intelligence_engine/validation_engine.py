from typing import Any, Dict


def validate_math(answer: Dict[str, Any]) -> Dict[str, Any]:
    ok = bool(answer.get("ok")) and ("result" in answer or "solutions" in answer or "derivative" in answer or "integral" in answer)
    return {"ok": ok, "checks": ["math_output_present"], "issues": [] if ok else ["Math output missing"]}


def validate_physics(answer: Dict[str, Any]) -> Dict[str, Any]:
    ok = bool(answer.get("ok")) and ("final_answer" in answer or "unit" in answer)
    return {"ok": ok, "checks": ["physics_answer_units"], "issues": [] if ok else ["Missing final answer with units"]}


def validate_code(code: str) -> Dict[str, Any]:
    src = (code or "")
    issues = []
    if "os.system(" in src or "subprocess." in src:
        issues.append("Potential unsafe execution call detected.")
    if "eval(" in src:
        issues.append("Use of eval detected.")
    return {"ok": len(issues) == 0, "issues": issues}


def validate_consistency(text: str) -> Dict[str, Any]:
    src = (text or "").lower()
    contradictions = []
    if "always" in src and "never" in src:
        contradictions.append("Contains absolute contradictory qualifiers.")
    return {"ok": len(contradictions) == 0, "issues": contradictions}

