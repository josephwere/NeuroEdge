from typing import Dict, List


NON_OVERRIDABLE_RULES = [
    "No automatic production overwrite",
    "No silent schema migration",
    "No security module rewrite without explicit confirmation",
    "No doctrine override",
    "Human confirmation required for structural changes",
]


def check_contract(proposal: Dict[str, object]) -> Dict[str, object]:
    text = str(proposal).lower()
    violations: List[str] = []
    dangerous = [
        "auto deploy",
        "overwrite production",
        "rewrite security",
        "disable doctrine",
        "silent migration",
    ]
    for item in dangerous:
        if item in text:
            violations.append(item)

    return {
        "allowed": len(violations) == 0,
        "violations": violations,
        "rules": NON_OVERRIDABLE_RULES,
    }
