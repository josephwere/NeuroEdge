import math
import os
import struct
import wave
from typing import Dict

from .storage import OUTPUTS_DIR, ensure_dirs, new_id, write_json


def generate_music(
    prompt: str,
    style: str = "cinematic",
    duration: int = 20,
    bpm: int = 120,
    mood: str = "uplifting",
) -> Dict[str, object]:
    ensure_dirs()
    out_id = new_id("music")
    duration_sec = max(5, min(int(duration or 20), 180))
    bpm_value = max(60, min(int(bpm or 120), 220))
    sample_rate = 16000
    base_freq = 220.0
    mood_map = {
        "uplifting": [0, 4, 7, 12],
        "calm": [0, 3, 7, 10],
        "dramatic": [0, 1, 5, 8],
        "dark": [0, 2, 6, 9],
    }
    intervals = mood_map.get(str(mood or "uplifting").lower(), mood_map["uplifting"])
    beat_seconds = 60.0 / float(bpm_value)
    note_seconds = max(0.12, beat_seconds / 2.0)
    total_samples = int(duration_sec * sample_rate)
    wav_path = os.path.join(OUTPUTS_DIR, f"{out_id}.wav")

    with wave.open(wav_path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(total_samples):
            t = i / float(sample_rate)
            note_idx = int(t / note_seconds) % len(intervals)
            freq = base_freq * (2.0 ** (intervals[note_idx] / 12.0))
            env = max(0.0, 1.0 - ((t % note_seconds) / note_seconds))
            sample = 0.32 * env * math.sin(2.0 * math.pi * freq * t)
            wf.writeframesraw(struct.pack("<h", int(sample * 32767.0)))

    manifest = {
        "id": out_id,
        "prompt": prompt,
        "style": style,
        "duration_sec": duration_sec,
        "bpm": bpm_value,
        "mood": mood,
        "engine": "visionforge-baseline-music",
        "outputs": [{"type": "audio/wav", "path": wav_path, "name": os.path.basename(wav_path)}],
    }
    write_json(os.path.join(OUTPUTS_DIR, f"{out_id}.music.json"), manifest)
    return manifest

