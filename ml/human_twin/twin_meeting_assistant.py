import re
from typing import Dict, List

from .twin_emotion_engine import analyze_emotion

ACTION_HINTS = ["action", "todo", "follow up", "next step", "deadline", "owner"]
RISK_HINTS = ["risk", "blocked", "delay", "conflict", "issue", "concern"]


def _sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def summarize_meeting(transcript: str) -> Dict[str, object]:
    sentences = _sentences(transcript)
    summary = " ".join(sentences[:4]) if sentences else "No transcript provided."

    actions = [s for s in sentences if any(h in s.lower() for h in ACTION_HINTS)][:8]
    risks = [s for s in sentences if any(h in s.lower() for h in RISK_HINTS)][:8]

    emotion = analyze_emotion(transcript)
    followup = []
    if actions:
        followup.append("Draft follow-up email with owners and deadlines.")
    if risks:
        followup.append("Escalate top risks and request mitigation plan.")
    if not followup:
        followup.append("Share concise summary and ask for explicit action owners.")

    return {
        "summary": summary,
        "action_items": actions,
        "risk_map": risks,
        "room_emotion": emotion,
        "followup_suggestions": followup,
        "disclosure": "AI-generated assistant output. Human approval required before sending.",
    }
