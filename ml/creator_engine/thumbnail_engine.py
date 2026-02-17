import os
from typing import Dict
from .storage import OUTPUTS_DIR, ensure_dirs, new_id


def create_thumbnail(topic: str, text: str = "") -> Dict[str, object]:
    ensure_dirs()
    out_id = new_id("thumb")
    path = os.path.join(OUTPUTS_DIR, f"{out_id}.svg")
    label = (text or topic or "NeuroEdge").strip()[:72]
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'>"
        "<rect width='100%' height='100%' fill='#111827'/>"
        "<rect x='40' y='40' width='1200' height='640' fill='none' stroke='#38bdf8' stroke-width='6'/>"
        f"<text x='50%' y='48%' fill='#f8fafc' font-size='72' font-weight='700' text-anchor='middle'>{label}</text>"
        f"<text x='50%' y='58%' fill='#93c5fd' font-size='30' text-anchor='middle'>{topic[:64]}</text>"
        "</svg>"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    return {"thumbnail_path": path, "label": label}

