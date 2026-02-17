import os
from typing import Dict, List
from .storage import OUTPUTS_DIR, ensure_dirs, new_id, write_json


def enhance_prompt(prompt: str) -> str:
    p = (prompt or "").strip()
    if not p:
        return "minimal clean abstract illustration"
    return f"{p}, high quality, balanced composition, creator-ready render"


def generate_image(prompt: str, style: str, resolution: str, aspect_ratio: str, batch: int = 1) -> Dict[str, object]:
    ensure_dirs()
    job_key = new_id("img")
    outputs: List[Dict[str, str]] = []
    for i in range(max(1, min(batch, 8))):
        name = f"{job_key}_{i+1}.svg"
        path = os.path.join(OUTPUTS_DIR, name)
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>"
            "<defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>"
            "<stop offset='0%' stop-color='#111827'/>"
            "<stop offset='100%' stop-color='#2563eb'/>"
            "</linearGradient></defs>"
            "<rect width='100%' height='100%' fill='url(#g)'/>"
            "<text x='50%' y='48%' fill='#f8fafc' font-size='28' text-anchor='middle'>NeuroEdge VisionForge</text>"
            f"<text x='50%' y='54%' fill='#cbd5e1' font-size='18' text-anchor='middle'>{prompt[:120]}</text>"
            f"<text x='50%' y='59%' fill='#94a3b8' font-size='14' text-anchor='middle'>style={style} resolution={resolution} ratio={aspect_ratio}</text>"
            "</svg>"
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        outputs.append({"type": "image/svg+xml", "path": path, "name": name})
    meta = {
        "prompt": prompt,
        "style": style,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "batch": len(outputs),
        "outputs": outputs,
    }
    write_json(os.path.join(OUTPUTS_DIR, f"{job_key}.json"), meta)
    return meta

