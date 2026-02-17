from typing import Dict, List

SUPPORTED_LANGUAGES: List[Dict[str, str]] = [
    {"code": "en", "name": "English"},
    {"code": "sw", "name": "Swahili"},
    {"code": "fr", "name": "French"},
    {"code": "es", "name": "Spanish"},
    {"code": "de", "name": "German"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "it", "name": "Italian"},
    {"code": "ar", "name": "Arabic"},
    {"code": "zh", "name": "Chinese"},
    {"code": "ja", "name": "Japanese"},
    {"code": "ko", "name": "Korean"},
    {"code": "hi", "name": "Hindi"},
    {"code": "ru", "name": "Russian"},
]


def detect_language(text: str) -> str:
    src = (text or "").strip()
    if not src:
        return "en"
    if any("\u4e00" <= ch <= "\u9fff" for ch in src):
        return "zh"
    if any("\u0600" <= ch <= "\u06ff" for ch in src):
        return "ar"
    low = src.lower()
    if any(w in low for w in [" habari ", " asante", " tafadhali", " leo "]):
        return "sw"
    if any(w in low for w in [" bonjour", " merci", " aujourd"]):
        return "fr"
    if any(w in low for w in [" hola", " gracias", " hoy "]):
        return "es"
    if any(w in low for w in ["hallo", "danke", "heute"]):
        return "de"
    if any(w in low for w in ["olá", "obrigado", "hoje"]):
        return "pt"
    if any(w in low for w in ["ciao", "grazie", "oggi"]):
        return "it"
    return "en"


def language_label(code: str) -> str:
    c = (code or "").lower()
    for item in SUPPORTED_LANGUAGES:
        if item["code"] == c:
            return item["name"]
    return "Unknown"


def localize_text(base: str, lang: str) -> str:
    c = (lang or "en").lower()
    if c == "sw":
        return f"(Kiswahili) {base}"
    if c == "fr":
        return f"(Français) {base}"
    if c == "es":
        return f"(Español) {base}"
    if c == "ar":
        return f"(العربية) {base}"
    if c == "zh":
        return f"(中文) {base}"
    return base

