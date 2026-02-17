import json
import os
import time
import threading
import hashlib
import tempfile
import urllib.request
import subprocess
from typing import Any, Dict, Optional

import httpx
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from cryptography.fernet import Fernet, InvalidToken


NODE_ID = os.getenv("NEUROEDGE_NODE_ID", "node-local-1")
NODE_KIND = os.getenv("NEUROEDGE_NODE_KIND", "laptop")
NODE_PORT = int(os.getenv("NEUROEDGE_NODE_PORT", "8095"))
ORCHESTRATOR_URL = os.getenv("NEUROEDGE_ORCHESTRATOR_URL", "http://localhost:7070")
LOCAL_ML_URL = os.getenv("NEUROEDGE_LOCAL_ML_URL", "http://localhost:8090")
CACHE_PATH = os.getenv("NEUROEDGE_NODE_CACHE", ".neuroedge_cache.enc")
CACHE_KEY = os.getenv("NEUROEDGE_NODE_KEY", "")
MAX_CACHE = int(os.getenv("NEUROEDGE_NODE_CACHE_MAX", "200"))
NODE_UPDATE_TOKEN = os.getenv("NEUROEDGE_NODE_UPDATE_TOKEN", "")

app = FastAPI(title="NeuroEdge Mesh Node", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: Dict[str, Any] = {}
_fernet: Optional[Fernet] = None
_last_latency_ms: Optional[float] = None
_inflight = 0


def _init_crypto() -> None:
    global _fernet
    if not CACHE_KEY:
        _fernet = None
        return
    # Expect a 32-byte urlsafe base64 key
    try:
        _fernet = Fernet(CACHE_KEY.encode())
    except Exception:
        _fernet = None


def _load_cache() -> None:
    global _cache
    if not os.path.exists(CACHE_PATH):
        _cache = {}
        return
    try:
        data = open(CACHE_PATH, "rb").read()
        if _fernet:
            try:
                data = _fernet.decrypt(data)
            except InvalidToken:
                _cache = {}
                return
        _cache = json.loads(data.decode("utf-8"))
    except Exception:
        _cache = {}


def _save_cache() -> None:
    try:
        raw = json.dumps(_cache).encode("utf-8")
        if _fernet:
            raw = _fernet.encrypt(raw)
        with open(CACHE_PATH, "wb") as f:
            f.write(raw)
    except Exception:
        pass


def _cache_get(key: str) -> Optional[Any]:
    return _cache.get(key)


def _cache_set(key: str, value: Any) -> None:
    if len(_cache) >= MAX_CACHE:
        # naive eviction: drop oldest key
        _cache.pop(next(iter(_cache)), None)
    _cache[key] = value
    _save_cache()


def _register_node() -> None:
    payload = {
        "id": NODE_ID,
        "baseUrl": f"http://localhost:{NODE_PORT}",
        "kind": NODE_KIND,
        "capabilities": ["infer", "cache", "encrypted-storage"],
    }
    try:
        httpx.post(f"{ORCHESTRATOR_URL}/mesh/register", json=payload, timeout=5.0)
    except Exception:
        pass


def _heartbeat_loop() -> None:
    while True:
        try:
            httpx.post(
                f"{ORCHESTRATOR_URL}/mesh/heartbeat",
                json={"id": NODE_ID},
                timeout=5.0,
            )
            httpx.post(
                f"{ORCHESTRATOR_URL}/mesh/metrics",
                json={
                    "id": NODE_ID,
                    "kind": NODE_KIND,
                    "cache_size": len(_cache),
                    "latency_ms": _last_latency_ms,
                    "load": _inflight,
                    "ts": time.time(),
                },
                timeout=5.0,
            )
        except Exception:
            pass
        time.sleep(10)


@app.on_event("startup")
def _on_startup() -> None:
    _init_crypto()
    _load_cache()
    _register_node()
    t = threading.Thread(target=_heartbeat_loop, daemon=True)
    t.start()


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "node": NODE_ID, "kind": NODE_KIND}


@app.post("/infer")
def infer(payload: Any = Body(default=None)) -> Dict[str, Any]:
    """
    Proxy inference to the local ML service on this node.
    """
    try:
        global _last_latency_ms, _inflight
        _inflight += 1
        cache_key = json.dumps(payload, sort_keys=True)
        cached = _cache_get(cache_key)
        if cached is not None:
            _inflight -= 1
            return {"status": "ok", "cached": True, "result": cached}
        start = time.time()
        resp = httpx.post(f"{LOCAL_ML_URL}/infer", json=payload, timeout=30.0)
        _last_latency_ms = round((time.time() - start) * 1000, 2)
        data = resp.json()
        _cache_set(cache_key, data)
        _inflight -= 1
        return {"status": "ok", "cached": False, "result": data}
    except Exception as exc:
        _inflight = max(0, _inflight - 1)
        return {"status": "error", "error": str(exc)}


@app.post("/update")
def update(payload: Dict[str, Any] = Body(default=None)) -> Dict[str, Any]:
    token = payload.get("token") if payload else None
    if NODE_UPDATE_TOKEN and token != NODE_UPDATE_TOKEN:
        return {"status": "error", "error": "unauthorized"}
    if not payload:
        return {"status": "error", "error": "missing payload"}
    try:
        download_url = payload.get("download_url")
        sha256_hex = payload.get("sha256")
        apply_command = payload.get("apply_command")

        if download_url and sha256_hex:
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                urllib.request.urlretrieve(download_url, tmp.name)
                data = open(tmp.name, "rb").read()
                digest = hashlib.sha256(data).hexdigest()
                if digest != sha256_hex:
                    return {"status": "error", "error": "checksum mismatch"}

        if apply_command:
            # allowlist safe update commands only
            allowed_prefixes = ("pip install", "pnpm install", "npm install", "uv pip install")
            if not any(str(apply_command).startswith(p) for p in allowed_prefixes):
                return {"status": "error", "error": "apply_command not allowed"}
            proc = subprocess.run(
                str(apply_command),
                shell=True,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0:
                return {"status": "error", "error": proc.stderr or "apply failed"}

        with open("update_manifest.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {"status": "ok", "applied": bool(apply_command)}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
