from typing import Dict, List, Tuple
import math


def _polyline_points(expr: str, x_min: float = -10.0, x_max: float = 10.0, n: int = 200) -> List[Tuple[float, float]]:
    points: List[Tuple[float, float]] = []
    if n < 2:
        n = 2
    step = (x_max - x_min) / (n - 1)
    safe = {"__builtins__": {}, "sin": math.sin, "cos": math.cos, "tan": math.tan, "log": math.log, "sqrt": math.sqrt, "pi": math.pi, "e": math.e}
    for i in range(n):
        x = x_min + i * step
        try:
            y = eval(expr, safe, {"x": x})
            y = float(y)
            if math.isfinite(y):
                points.append((x, y))
        except Exception:
            continue
    return points


def _to_svg(points: List[Tuple[float, float]], title: str = "Graph") -> str:
    width, height = 900, 500
    if not points:
        return (
            "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500'>"
            "<rect width='100%' height='100%' fill='#0f172a'/>"
            f"<text x='50%' y='50%' fill='#e2e8f0' text-anchor='middle'>{title}: no plottable points</text>"
            "</svg>"
        )
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    if y0 == y1:
        y0 -= 1
        y1 += 1

    def sx(x: float) -> float:
        return 40 + (x - x0) / (x1 - x0) * (width - 80)

    def sy(y: float) -> float:
        return 30 + (y1 - y) / (y1 - y0) * (height - 60)

    poly = " ".join([f"{sx(x):.2f},{sy(y):.2f}" for x, y in points])
    x_axis = sy(0) if y0 <= 0 <= y1 else sy(y0)
    y_axis = sx(0) if x0 <= 0 <= x1 else sx(x0)
    return (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>"
        "<rect width='100%' height='100%' fill='#0f172a'/>"
        f"<text x='24' y='22' fill='#e2e8f0' font-size='16'>{title}</text>"
        f"<line x1='40' y1='{x_axis:.2f}' x2='{width-40}' y2='{x_axis:.2f}' stroke='#334155'/>"
        f"<line x1='{y_axis:.2f}' y1='30' x2='{y_axis:.2f}' y2='{height-30}' stroke='#334155'/>"
        f"<polyline fill='none' stroke='#38bdf8' stroke-width='2' points='{poly}'/>"
        "</svg>"
    )


def visualize_equation(equation: str) -> Dict[str, str]:
    eq = (equation or "").strip()
    return {
        "ok": "true",
        "equation": eq,
        "latex_like": eq.replace("*", " \\cdot ").replace("**", "^"),
        "note": "Rendered as symbolic text preview.",
    }


def visualize_graph(expression: str, x_min: float = -10.0, x_max: float = 10.0) -> Dict[str, str]:
    expr = (expression or "").strip()
    pts = _polyline_points(expr, x_min=x_min, x_max=x_max, n=240)
    svg = _to_svg(pts, title=f"y = {expr}")
    return {"ok": "true", "expression": expr, "svg": svg}

