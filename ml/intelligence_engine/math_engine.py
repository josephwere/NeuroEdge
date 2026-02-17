from typing import Any, Dict, List
import math
import statistics

from .symbolic_solver import has_sympy, safe_sympify, solve_symbolic_equation


SAFE_GLOBALS = {"__builtins__": {}}
SAFE_FUNCS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "pi": math.pi,
    "e": math.e,
}


def solve_expression(expression: str) -> Dict[str, Any]:
    expr = (expression or "").strip()
    if not expr:
        return {"ok": False, "error": "Missing expression"}
    try:
        value = eval(expr, SAFE_GLOBALS, SAFE_FUNCS)
        return {"ok": True, "result": value}
    except Exception as ex:
        if has_sympy():
            try:
                obj = safe_sympify(expr)
                return {"ok": True, "result": str(obj.evalf())}
            except Exception:
                pass
        return {"ok": False, "error": str(ex)}


def solve_equation(equation: str) -> Dict[str, Any]:
    return solve_symbolic_equation(equation)


def differentiate(expression: str) -> Dict[str, Any]:
    if not has_sympy():
        return {"ok": False, "error": "sympy unavailable for symbolic differentiation"}
    try:
        import sympy as sp
        x = sp.Symbol("x")
        d = sp.diff(sp.sympify(expression), x)
        return {"ok": True, "derivative": str(d)}
    except Exception as ex:
        return {"ok": False, "error": str(ex)}


def integrate(expression: str) -> Dict[str, Any]:
    if not has_sympy():
        return {"ok": False, "error": "sympy unavailable for symbolic integration"}
    try:
        import sympy as sp
        x = sp.Symbol("x")
        i = sp.integrate(sp.sympify(expression), x)
        return {"ok": True, "integral": str(i)}
    except Exception as ex:
        return {"ok": False, "error": str(ex)}


def solve_matrix(matrix_input: List[List[float]]) -> Dict[str, Any]:
    if not matrix_input:
        return {"ok": False, "error": "Empty matrix"}
    rows = len(matrix_input)
    cols = len(matrix_input[0])
    if any(len(r) != cols for r in matrix_input):
        return {"ok": False, "error": "Invalid matrix shape"}
    out: Dict[str, Any] = {"ok": True, "shape": [rows, cols]}
    if rows == cols:
        if has_sympy():
            try:
                import sympy as sp
                m = sp.Matrix(matrix_input)
                out["determinant"] = float(m.det())
                out["rank"] = int(m.rank())
                if m.det() != 0:
                    out["inverse"] = [[float(v) for v in row] for row in m.inv().tolist()]
                return out
            except Exception:
                pass
    out["note"] = "Basic matrix metadata only (non-square or symbolic backend unavailable)."
    return out


def explain_solution(problem: str) -> Dict[str, Any]:
    text = (problem or "").strip()
    solved = solve_expression(text)
    steps = [
        "1. Parse the mathematical expression and identify operators.",
        "2. Apply precedence rules or symbolic simplification.",
        "3. Compute numeric value and verify consistency.",
    ]
    if solved.get("ok"):
        steps.append(f"4. Final result = {solved.get('result')}")
    return {"ok": solved.get("ok", False), "steps": steps, "result": solved.get("result"), "error": solved.get("error", "")}


def stats_summary(values: List[float]) -> Dict[str, Any]:
    if not values:
        return {"ok": False, "error": "No values"}
    return {
        "ok": True,
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "variance": statistics.pvariance(values),
        "stdev": statistics.pstdev(values),
    }

