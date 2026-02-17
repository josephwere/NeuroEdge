import os
import zipfile
import tempfile
from typing import Any, Dict, List, Optional

REQUIRED_COMPONENTS = {
    "frontend": ["frontend/src", "frontend/package.json"],
    "orchestrator": ["orchestrator/src", "orchestrator/package.json"],
    "kernel": ["kernel/cmd", "kernel/go.mod"],
    "ml": ["ml/server.py", "ml/requirements.txt"],
}


class TwinScanner:
    def __init__(self, root: str) -> None:
        self.root = os.path.abspath(root)

    def _walk(self, root: str) -> List[str]:
        out: List[str] = []
        for base, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "dist", "__pycache__", ".venv"}]
            for f in files:
                rel = os.path.relpath(os.path.join(base, f), root)
                out.append(rel)
        return out

    def scan_frontend(self) -> Dict[str, Any]:
        path = os.path.join(self.root, "frontend")
        return {"exists": os.path.isdir(path), "files": self._walk(path)[:2000] if os.path.isdir(path) else []}

    def scan_backend(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {}
        for name in ["orchestrator", "kernel", "ml"]:
            path = os.path.join(self.root, name)
            data[name] = {"exists": os.path.isdir(path), "files": self._walk(path)[:2000] if os.path.isdir(path) else []}
        return data

    def scan_database(self) -> Dict[str, Any]:
        db_dir = os.path.join(self.root, "database")
        possible = []
        if os.path.isdir(db_dir):
            possible.extend(self._walk(db_dir))
        for extra in ["orchestrator/data", "kernel/data", "ml/data"]:
            p = os.path.join(self.root, extra)
            if os.path.isdir(p):
                possible.extend([f"{extra}/{x}" for x in self._walk(p)])
        return {"artifacts": possible[:4000], "count": len(possible)}

    def generate_structure_map(self) -> Dict[str, Any]:
        files = self._walk(self.root)
        return {
            "root": self.root,
            "files": files,
            "total_files": len(files),
            "frontend": self.scan_frontend(),
            "backend": self.scan_backend(),
            "database": self.scan_database(),
        }

    def detect_missing_components(self) -> Dict[str, Any]:
        missing: Dict[str, List[str]] = {}
        for group, comps in REQUIRED_COMPONENTS.items():
            group_missing: List[str] = []
            for rel in comps:
                if not os.path.exists(os.path.join(self.root, rel)):
                    group_missing.append(rel)
            if group_missing:
                missing[group] = group_missing
        return {"missing": missing, "ok": len(missing) == 0}

    def analyze_zip_project(self, zip_path: str) -> Dict[str, Any]:
        if not zipfile.is_zipfile(zip_path):
            return {"ok": False, "error": "Invalid zip file"}
        with tempfile.TemporaryDirectory(prefix="neuroedge_twin_zip_") as td:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(td)
            tmp_scanner = TwinScanner(td)
            structure = tmp_scanner.generate_structure_map()
            missing = tmp_scanner.detect_missing_components()
            return {
                "ok": True,
                "zip_path": zip_path,
                "structure": structure,
                "missing": missing,
            }
