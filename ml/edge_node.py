import os
import time
import threading
from typing import Any, Dict

import httpx
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware


NODE_ID = os.getenv("NEUROEDGE_NODE_ID", "node-local-1")
NODE_KIND = os.getenv("NEUROEDGE_NODE_KIND", "laptop")
NODE_PORT = int(os.getenv("NEUROEDGE_NODE_PORT", "8095"))
ORCHESTRATOR_URL = os.getenv("NEUROEDGE_ORCHESTRATOR_URL", "http://localhost:7070")
LOCAL_ML_URL = os.getenv("NEUROEDGE_LOCAL_ML_URL", "http://localhost:8090")

app = FastAPI(title="NeuroEdge Mesh Node", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _register_node() -> None:
    payload = {
        "id": NODE_ID,
        "baseUrl": f"http://localhost:{NODE_PORT}",
        "kind": NODE_KIND,
        "capabilities": ["infer"],
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
        except Exception:
            pass
        time.sleep(10)


@app.on_event("startup")
def _on_startup() -> None:
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
        resp = httpx.post(f"{LOCAL_ML_URL}/infer", json=payload, timeout=30.0)
        return resp.json()
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
