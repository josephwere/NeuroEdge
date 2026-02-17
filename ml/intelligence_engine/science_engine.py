from typing import Any, Dict

UNSAFE_CHEM_PATTERNS = [
    "make bomb",
    "sarin",
    "weaponized",
    "synthesize meth",
    "poison gas",
]


def _unsafe(text: str) -> bool:
    q = (text or "").lower()
    return any(p in q for p in UNSAFE_CHEM_PATTERNS)


def explain_science(topic: str, mode: str = "advanced") -> Dict[str, Any]:
    q = (topic or "").strip()
    if _unsafe(q):
        return {
            "ok": False,
            "error": "Unsafe scientific request blocked by policy.",
            "safe_alternative": "I can provide safety, ethics, and lawful educational background instead.",
        }
    lower = q.lower()
    if "mole" in lower:
        detail = "Use n = m/M where n is moles, m mass (g), and M molar mass (g/mol)."
    elif "photosynthesis" in lower:
        detail = "Photosynthesis converts light energy into chemical energy in chloroplasts."
    elif "cell" in lower:
        detail = "Cellular processes include transcription, translation, and regulated metabolism."
    else:
        detail = "General science explanation with structured concepts, mechanisms, and examples."
    if mode == "beginner":
        detail = f"Beginner mode: {detail}"
    return {
        "ok": True,
        "topic": q,
        "mode": mode,
        "explanation": detail,
        "sections": ["Concept", "How it works", "Example", "Common mistakes"],
    }

