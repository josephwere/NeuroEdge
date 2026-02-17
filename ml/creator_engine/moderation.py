import re
from typing import Dict, List

BANNED_PATTERNS = [
    r"\bchild sexual\b",
    r"\bcsam\b",
    r"\bterrorist manifesto\b",
    r"\bhow to build (a )?bomb\b",
    r"\bdeepfake (without|of)\b",
    r"\bmalware source code\b",
]


def moderate_text(text: str) -> Dict[str, object]:
    src = (text or "").strip().lower()
    hits: List[str] = []
    for pattern in BANNED_PATTERNS:
        try:
            if re.search(pattern, src):
                hits.append(pattern)
        except re.error:
            continue
    return {"allowed": len(hits) == 0, "hits": hits, "reason": "policy_violation" if hits else ""}

