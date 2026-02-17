from typing import Dict


FORBIDDEN_AUTONOMY = [
    "sign contract",
    "send money",
    "wire transfer",
    "commit funds",
    "impersonate",
    "send email automatically",
]


def enforce_human_twin_guardrails(text: str) -> Dict[str, object]:
    lower = (text or "").lower()
    violations = [rule for rule in FORBIDDEN_AUTONOMY if rule in lower]
    if violations:
        return {
            "allowed": False,
            "violations": violations,
            "message": "Blocked by NeuroTwin guardrails. Human confirmation and disclosure are mandatory.",
        }
    return {
        "allowed": True,
        "violations": [],
        "message": "Allowed with disclosure: this assistant is AI and cannot represent legal identity.",
    }
