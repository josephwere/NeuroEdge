from typing import Dict


def analyze_script(script: str) -> Dict[str, object]:
    s = (script or "").strip()
    words = [w for w in s.split() if w]
    hooks = ["why", "how", "top", "secret", "mistake", "learn", "build"]
    hook_score = sum(1 for h in hooks if h in s.lower())
    return {
        "word_count": len(words),
        "hook_strength": min(100, 35 + hook_score * 9),
        "engagement_prediction": "high" if len(words) > 80 else "medium",
        "seo_keywords": sorted(list({w.strip(".,!?").lower() for w in words if len(w) > 5}))[:10],
        "emotion_tone": "energetic" if "!" in s else "neutral",
    }


def score_thumbnail(image_path: str) -> Dict[str, object]:
    return {
        "image_path": image_path,
        "clickability": 78,
        "contrast_score": 74,
        "headline_readability": 81,
    }


def predict_engagement(metadata: Dict[str, object]) -> Dict[str, object]:
    text_len = len(str(metadata or {}))
    return {
        "score": min(99, 40 + (text_len % 50)),
        "confidence": 0.72,
        "notes": ["Improve first 3 seconds hook", "Keep subtitle density moderate"],
    }

