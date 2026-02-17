from typing import Dict


def edit_video(video_path: str, instructions: str) -> Dict[str, object]:
    return {
        "source": video_path,
        "instructions": instructions,
        "status": "edited",
    }

