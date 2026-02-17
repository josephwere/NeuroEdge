import json
import os
from dataclasses import dataclass, asdict
from typing import Any, Dict, List

DATA_DIR = os.getenv("NEUROEDGE_TWIN_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data", "twin_profile"))
PROFILE_FILE = os.path.join(DATA_DIR, "personality.json")
COMM_FILE = os.path.join(DATA_DIR, "communication_patterns.json")
DECISION_FILE = os.path.join(DATA_DIR, "decision_framework.json")


def _ensure_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def _safe_load(path: str, default: Dict[str, Any]) -> Dict[str, Any]:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _safe_save(path: str, payload: Dict[str, Any]) -> None:
    _ensure_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


@dataclass
class TwinProfile:
    owner: str = "founder"
    tone: str = "direct"
    communication_style: str = "strategic"
    risk_appetite: str = "medium"
    strategic_horizon_years: int = 5
    goals: List[str] = None
    disclosure_required: bool = True

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        if data.get("goals") is None:
            data["goals"] = []
        return data


class TwinProfileStore:
    def __init__(self) -> None:
        _ensure_dir()

    def get_profile(self) -> Dict[str, Any]:
        defaults = TwinProfile(goals=[]).to_dict()
        return _safe_load(PROFILE_FILE, defaults)

    def save_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_profile()
        merged = {**current, **profile}
        _safe_save(PROFILE_FILE, merged)
        return merged

    def get_communication_patterns(self) -> Dict[str, Any]:
        defaults = {
            "vocabulary": [],
            "sentence_length_avg": 0,
            "preferred_openings": [],
            "preferred_closings": [],
            "tone_vectors": {},
        }
        return _safe_load(COMM_FILE, defaults)

    def save_communication_patterns(self, patterns: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_communication_patterns()
        merged = {**current, **patterns}
        _safe_save(COMM_FILE, merged)
        return merged

    def get_decision_framework(self) -> Dict[str, Any]:
        defaults = {
            "values": ["integrity", "long_term_value", "safety"],
            "risk_threshold": "medium",
            "decision_rules": [
                "prefer reversible decisions in uncertainty",
                "require evidence for high-impact actions",
                "align with long-term doctrine",
            ],
        }
        return _safe_load(DECISION_FILE, defaults)

    def save_decision_framework(self, framework: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_decision_framework()
        merged = {**current, **framework}
        _safe_save(DECISION_FILE, merged)
        return merged
