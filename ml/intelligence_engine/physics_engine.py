from typing import Any, Dict
from .unit_converter import convert_units


def identify_formula(problem_text: str) -> Dict[str, Any]:
    q = (problem_text or "").lower()
    if "ohm" in q or ("voltage" in q and "current" in q):
        return {"formula": "V = I * R", "topic": "electricity"}
    if "kinematic" in q or "velocity" in q or "acceleration" in q:
        return {"formula": "v = u + at", "topic": "kinematics"}
    if "force" in q and "mass" in q and "acceleration" in q:
        return {"formula": "F = m * a", "topic": "newton_second_law"}
    if "work" in q and "distance" in q and "force" in q:
        return {"formula": "W = F * d", "topic": "work_energy"}
    return {"formula": "general_physics_reasoning", "topic": "general"}


def solve_physics_problem(problem_text: str) -> Dict[str, Any]:
    meta = identify_formula(problem_text)
    topic = meta["topic"]
    q = (problem_text or "").lower()
    if topic == "electricity":
        # very lightweight parser: expects numbers tagged like i=2 r=5
        try:
            i = _extract_value(q, "i", default=2.0)
            r = _extract_value(q, "r", default=5.0)
            v = i * r
            return _resp(meta, f"Using {meta['formula']}: V = {i} * {r} = {v} V", v, "V")
        except Exception as ex:
            return {"ok": False, "error": str(ex), "meta": meta}
    if topic == "newton_second_law":
        try:
            m = _extract_value(q, "m", default=1.0)
            a = _extract_value(q, "a", default=9.8)
            f = m * a
            return _resp(meta, f"Using {meta['formula']}: F = {m} * {a} = {f} N", f, "N")
        except Exception as ex:
            return {"ok": False, "error": str(ex), "meta": meta}
    if topic == "kinematics":
        try:
            u = _extract_value(q, "u", default=0.0)
            a = _extract_value(q, "a", default=1.0)
            t = _extract_value(q, "t", default=1.0)
            v = u + a * t
            return _resp(meta, f"Using {meta['formula']}: v = {u} + {a}*{t} = {v} m/s", v, "m/s")
        except Exception as ex:
            return {"ok": False, "error": str(ex), "meta": meta}
    return {
        "ok": True,
        "meta": meta,
        "steps": [
            "1. Identify known values and target quantity.",
            "2. Select matching formula from topic classification.",
            "3. Substitute values and compute result with units.",
        ],
        "final_answer": "Provide numeric values (e.g., m=2 a=3) for direct calculation.",
        "unit": "",
    }


def _extract_value(text: str, key: str, default: float = 0.0) -> float:
    import re
    m = re.search(rf"\b{key}\s*=\s*([-+]?\d*\.?\d+)\b", text)
    return float(m.group(1)) if m else float(default)


def _resp(meta: Dict[str, Any], final_line: str, val: float, unit: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "meta": meta,
        "steps": [
            "1. Detect physics topic and formula.",
            "2. Extract known values from problem statement.",
            f"3. Compute result: {final_line}",
        ],
        "final_answer": f"{val} {unit}",
        "unit": unit,
    }


def convert(value: float, from_unit: str, to_unit: str) -> Dict[str, Any]:
    return convert_units(value, from_unit, to_unit)

