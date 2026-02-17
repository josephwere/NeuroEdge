import os
from typing import Dict
from .storage import OUTPUTS_DIR, ensure_dirs, new_id, write_json


def generate_video(prompt: str, duration: int, resolution: str, aspect_ratio: str) -> Dict[str, object]:
    ensure_dirs()
    out_id = new_id("vid")
    manifest = {
        "id": out_id,
        "prompt": prompt,
        "duration_sec": max(5, min(int(duration or 5), 60)),
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "engine": "visionforge-baseline-video",
        "scenes": [
            {"t0": 0, "t1": 2, "caption": "Opening scene"},
            {"t0": 2, "t1": 4, "caption": "Context scene"},
            {"t0": 4, "t1": max(5, min(int(duration or 5), 60)), "caption": "Closing scene"},
        ],
    }
    path = os.path.join(OUTPUTS_DIR, f"{out_id}.video.json")
    write_json(path, manifest)
    return {"manifest_path": path, "preview_asset": "", **manifest}

