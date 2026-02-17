from typing import Dict, List
from .video_generator import generate_video
from .subtitle_generator import generate_subtitles


def _scene_split(script: str) -> List[str]:
    parts = [p.strip() for p in (script or "").split("\n") if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in (script or "").split(".") if p.strip()]
    return parts[:20] or ["Scene 1"]


def script_to_video(script: str, voice_style: str, aspect_ratio: str) -> Dict[str, object]:
    scenes = _scene_split(script)
    duration = min(30, max(5, len(scenes) * 3))
    base = generate_video(script[:200], duration, "1080p", aspect_ratio)
    subtitles = generate_subtitles(script)
    return {
        "script": script,
        "voice_style": voice_style,
        "aspect_ratio": aspect_ratio,
        "scene_count": len(scenes),
        "scenes": scenes,
        "video": base,
        "subtitles": subtitles,
    }

