import json
import os
import time
from typing import Any, Dict, List

MEM_DIR = os.getenv("NEUROEDGE_TWIN_MEMORY_DIR", os.path.join(os.path.dirname(__file__), "..", "data", "twin_memory"))
MODE_FILE = os.path.join(MEM_DIR, "mode.json")
MEETING_LOG = os.path.join(MEM_DIR, "meetings.jsonl")
DECISION_LOG = os.path.join(MEM_DIR, "decisions.jsonl")


def _ensure_dir() -> None:
    os.makedirs(MEM_DIR, exist_ok=True)


def _append_jsonl(path: str, payload: Dict[str, Any]) -> None:
    _ensure_dir()
    record = {"timestamp": int(time.time()), **payload}
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def _tail_jsonl(path: str, limit: int = 50) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f.readlines() if ln.strip()]
    out: List[Dict[str, Any]] = []
    for ln in lines[-limit:]:
        try:
            out.append(json.loads(ln))
        except Exception:
            continue
    return out


def get_mode() -> Dict[str, Any]:
    _ensure_dir()
    if not os.path.exists(MODE_FILE):
        mode = {"mode": "public", "updated_at": int(time.time())}
        with open(MODE_FILE, "w", encoding="utf-8") as f:
            json.dump(mode, f, indent=2)
        return mode
    with open(MODE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def set_mode(mode: str) -> Dict[str, Any]:
    payload = {"mode": mode, "updated_at": int(time.time())}
    _ensure_dir()
    with open(MODE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return payload


def log_meeting(payload: Dict[str, Any]) -> None:
    _append_jsonl(MEETING_LOG, payload)


def list_meetings(limit: int = 20) -> List[Dict[str, Any]]:
    return _tail_jsonl(MEETING_LOG, limit)


def log_decision(payload: Dict[str, Any]) -> None:
    _append_jsonl(DECISION_LOG, payload)


def list_decisions(limit: int = 20) -> List[Dict[str, Any]]:
    return _tail_jsonl(DECISION_LOG, limit)
