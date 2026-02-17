from typing import Dict

_UNITS: Dict[str, float] = {
    "m": 1.0,
    "km": 1000.0,
    "cm": 0.01,
    "mm": 0.001,
    "s": 1.0,
    "min": 60.0,
    "h": 3600.0,
    "kg": 1.0,
    "g": 0.001,
    "n": 1.0,
    "j": 1.0,
    "w": 1.0,
    "v": 1.0,
    "a": 1.0,
    "ohm": 1.0,
}


def convert_units(value: float, from_unit: str, to_unit: str):
    f = (from_unit or "").strip().lower()
    t = (to_unit or "").strip().lower()
    if f not in _UNITS or t not in _UNITS:
        return {"ok": False, "error": f"Unsupported unit conversion: {from_unit} -> {to_unit}"}
    base = float(value) * _UNITS[f]
    out = base / _UNITS[t]
    return {"ok": True, "value": out, "from_unit": from_unit, "to_unit": to_unit}

