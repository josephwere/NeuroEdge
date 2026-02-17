from typing import Any, Dict

try:
    import sympy as sp
except Exception:
    sp = None


def has_sympy() -> bool:
    return sp is not None


def safe_sympify(expr: str):
    if sp is None:
        raise RuntimeError("sympy unavailable")
    return sp.sympify(expr)


def solve_symbolic_equation(equation: str) -> Dict[str, Any]:
    if sp is None:
        return {"ok": False, "error": "sympy unavailable"}
    try:
        if "=" in equation:
            left, right = equation.split("=", 1)
            eq = sp.Eq(sp.sympify(left), sp.sympify(right))
        else:
            eq = sp.Eq(sp.sympify(equation), 0)
        vars_ = sorted(list(eq.free_symbols), key=lambda s: str(s))
        if not vars_:
            return {"ok": True, "solutions": [bool(eq)]}
        sol = sp.solve(eq, vars_[0])
        return {"ok": True, "variable": str(vars_[0]), "solutions": [str(s) for s in sol]}
    except Exception as ex:
        return {"ok": False, "error": str(ex)}

