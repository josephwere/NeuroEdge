from typing import Dict, List

POSITIVE = {"great", "good", "calm", "confident", "win", "progress", "clear"}
NEGATIVE = {"angry", "frustrated", "stress", "stressed", "panic", "conflict", "fail", "risk"}
HESITATION = {"maybe", "not sure", "unsure", "perhaps", "possibly"}


def analyze_emotion(text: str) -> Dict[str, object]:
    lower = (text or "").lower()
    pos = sum(1 for w in POSITIVE if w in lower)
    neg = sum(1 for w in NEGATIVE if w in lower)
    hes = sum(1 for w in HESITATION if w in lower)

    tone = "neutral"
    stress = 0.2
    if neg > pos:
        tone = "tense"
        stress = min(0.95, 0.35 + 0.15 * neg)
    elif pos > neg:
        tone = "confident"
        stress = max(0.05, 0.2 - 0.05 * pos)

    confidence = max(0.1, min(0.95, 0.6 + 0.1 * pos - 0.1 * hes - 0.05 * neg))

    suggestions: List[str] = []
    if tone == "tense":
        suggestions.append("Use calmer wording and separate facts from assumptions.")
    if hes > 0:
        suggestions.append("State one clear recommendation and one fallback option.")
    if not suggestions:
        suggestions.append("Proceed with direct, strategic phrasing.")

    return {
        "tone": tone,
        "stress": round(stress, 3),
        "confidence": round(confidence, 3),
        "suggestions": suggestions,
    }
