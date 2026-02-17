import json
import os
import time
from typing import Any, Dict, List

ROOT = os.getenv("NEUROEDGE_TWINCORE_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data", "twin_memory"))
SNAPSHOTS = os.path.join(ROOT, "snapshots.jsonl")
UPGRADES = os.path.join(ROOT, "upgrades.jsonl")
REJECTIONS = os.path.join(ROOT, "rejections.jsonl")


def _ensure() -> None:
    os.makedirs(ROOT, exist_ok=True)


def _append(path: str, payload: Dict[str, Any]) -> None:
    _ensure()
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), **payload}) + "\n")


def _read(path: str, limit: int = 100) -> List[Dict[str, Any]]:
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


def store_snapshot(snapshot: Dict[str, Any]) -> None:
    _append(SNAPSHOTS, snapshot)


def retrieve_snapshot(limit: int = 20) -> List[Dict[str, Any]]:
    return _read(SNAPSHOTS, limit)


def store_upgrade_log(entry: Dict[str, Any]) -> None:
    _append(UPGRADES, entry)


def store_rejection(entry: Dict[str, Any]) -> None:
    _append(REJECTIONS, entry)


def list_upgrade_logs(limit: int = 50) -> List[Dict[str, Any]]:
    return _read(UPGRADES, limit)


def list_rejections(limit: int = 50) -> List[Dict[str, Any]]:
    return _read(REJECTIONS, limit)


def vectorize_structure(structure: Dict[str, Any]) -> Dict[str, float]:
    files = structure.get("files", [])
    text = "\n".join(files) if isinstance(files, list) else str(files)
    return {
        "files_count": float(len(files) if isinstance(files, list) else 0),
        "avg_path_len": float(sum(len(x) for x in files) / max(1, len(files))) if isinstance(files, list) else 0.0,
        "entropy_hint": float(len(set(text)) / max(1, len(text))),
    }
