import json
import os
import time
import uuid
from typing import Any, Dict, List

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "creator_engine")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
JOBS_DIR = os.path.join(BASE_DIR, "jobs")
HISTORY_FILE = os.path.join(BASE_DIR, "creator_history.jsonl")


def ensure_dirs() -> None:
    os.makedirs(OUTPUTS_DIR, exist_ok=True)
    os.makedirs(JOBS_DIR, exist_ok=True)


def new_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time())}_{uuid.uuid4().hex[:10]}"


def write_json(path: str, payload: Dict[str, Any]) -> None:
    ensure_dirs()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def read_json(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def append_history(entry: Dict[str, Any]) -> None:
    ensure_dirs()
    record = {"timestamp": int(time.time()), **entry}
    with open(HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def list_history(limit: int = 100) -> List[Dict[str, Any]]:
    ensure_dirs()
    if not os.path.exists(HISTORY_FILE):
        return []
    lines: List[str] = []
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    lines = lines[-max(1, min(limit, 2000)) :]
    out: List[Dict[str, Any]] = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return list(reversed(out))

