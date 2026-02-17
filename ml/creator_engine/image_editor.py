import os
from typing import Dict
from .storage import OUTPUTS_DIR, ensure_dirs, new_id, write_json


def edit_image(image_path: str, instructions: str) -> Dict[str, object]:
    ensure_dirs()
    out_id = new_id("imgedit")
    out_path = os.path.join(OUTPUTS_DIR, f"{out_id}.json")
    result = {
        "source": image_path,
        "instructions": instructions,
        "edited_asset": os.path.join(OUTPUTS_DIR, f"{out_id}.svg"),
    }
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>"
        "<rect width='100%' height='100%' fill='#0f172a'/>"
        "<text x='50%' y='50%' fill='#f8fafc' font-size='20' text-anchor='middle'>Edited Image Artifact</text>"
        f"<text x='50%' y='56%' fill='#cbd5e1' font-size='14' text-anchor='middle'>{instructions[:120]}</text>"
        "</svg>"
    )
    with open(result["edited_asset"], "w", encoding="utf-8") as f:
        f.write(svg)
    write_json(out_path, result)
    return result


def remove_object(image_path: str, mask: str) -> Dict[str, object]:
    return edit_image(image_path, f"Remove object using mask={mask}")


def upscale_image(image_path: str, scale: int = 2) -> Dict[str, object]:
    return edit_image(image_path, f"Upscale image x{max(1, min(scale, 8))}")

