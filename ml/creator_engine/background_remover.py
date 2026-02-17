import base64
import os
from typing import Dict
from .storage import OUTPUTS_DIR, ensure_dirs, new_id

_ONE_PIXEL_TRANSPARENT_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAAHLx3sAAAAASUVORK5CYII="
)


def remove_background(image_path: str) -> Dict[str, object]:
    ensure_dirs()
    out_id = new_id("bg")
    out_path = os.path.join(OUTPUTS_DIR, f"{out_id}.png")
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(_ONE_PIXEL_TRANSPARENT_PNG))
    return {
        "source": image_path,
        "output_path": out_path,
        "format": "image/png",
        "transparent": True,
    }

