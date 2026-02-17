from typing import Dict
from .image_editor import edit_image


def apply_style_transfer(image_path: str, style: str) -> Dict[str, object]:
    return edit_image(image_path, f"Apply style transfer preset={style}")

