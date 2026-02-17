# ml/server.py
import os
import subprocess
import time
import threading
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.linear_model import SGDClassifier
import numpy as np
import httpx

try:
    import uvicorn
except Exception:  # pragma: no cover
    uvicorn = None

try:
    from floating_chat_ml_agent import FloatingChatMLAgent
except Exception:
    FloatingChatMLAgent = None


app = FastAPI(title="NeuroEdge ML Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FED_URL = os.getenv("NEUROEDGE_FED_URL", "http://localhost:7070")
FED_KEY = os.getenv("NEUROEDGE_FED_KEY", "")
NODE_ID = os.getenv("NEUROEDGE_NODE_ID", "node-local-1")
FED_SYNC_INTERVAL = float(os.getenv("NEUROEDGE_FED_SYNC_INTERVAL", "20"))

_labels = [
    "gather_context",
    "analyze_logs",
    "run_tests",
    "run_build_checks",
    "prepare_deploy_plan",
]
_label_to_idx = {k: i for i, k in enumerate(_labels)}

_clf = SGDClassifier(loss="log_loss", max_iter=1, learning_rate="optimal")
_clf.partial_fit(np.zeros((1, 3)), [0], classes=list(range(len(_labels))))
_local_samples = 0
_global_version = 0


def _featurize(text: str) -> np.ndarray:
    text = text.lower()
    return np.array([
        len(text),
        sum(1 for c in text if c.isdigit()),
        sum(1 for c in text if c in "aeiou"),
    ], dtype=np.float32).reshape(1, -1)


def _sign_payload(payload: Dict[str, Any]) -> Optional[str]:
    if not FED_KEY:
        return None
    try:
        resp = httpx.post(f"{FED_URL}/fed/sign", json={"payload": payload}, timeout=10.0)
        return resp.json().get("sig")
    except Exception:
        return None


def _apply_global_model(model: Dict[str, Any]) -> None:
    global _global_version
    coef = model.get("coef")
    intercept = model.get("intercept")
    classes = model.get("classes")
    n_features = int(model.get("n_features", 3))
    version = int(model.get("version", 0))
    if not coef or not intercept or not classes:
        return
    if version <= _global_version:
        return
    _clf.classes_ = np.array(list(range(len(classes))))
    _clf.coef_ = np.array(coef, dtype=np.float64)
    _clf.intercept_ = np.array(intercept, dtype=np.float64)
    _clf.n_features_in_ = n_features
    _global_version = version


def _push_local_update() -> None:
    global _local_samples
    if _local_samples <= 0:
        return
    update = {
        "id": NODE_ID,
        "ts": time.time(),
        "n_features": 3,
        "classes": _labels,
        "coef": _clf.coef_.tolist(),
        "intercept": _clf.intercept_.tolist(),
        "samples": _local_samples,
    }
    sig = _sign_payload(update)
    if not sig:
        return
    try:
        httpx.post(f"{FED_URL}/fed/update", json={"update": update, "sig": sig}, timeout=10.0)
        _local_samples = 0
    except Exception:
        pass


def _pull_global_update() -> None:
    try:
        resp = httpx.get(f"{FED_URL}/fed/model", timeout=10.0)
        model = (resp.json() or {}).get("model")
        if model:
            _apply_global_model(model)
    except Exception:
        pass


def _federated_loop() -> None:
    while True:
        _push_local_update()
        _pull_global_update()
        time.sleep(FED_SYNC_INTERVAL)


@app.on_event("startup")
def _startup_fed() -> None:
    t = threading.Thread(target=_federated_loop, daemon=True)
    t.start()


class CommandRequest(BaseModel):
    command: str
    args: List[str] = Field(default_factory=list)


class InferRequest(BaseModel):
    text: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)


class PredictRequest(BaseModel):
    text: str = ""


def _load_agent() -> Optional[Any]:
    if FloatingChatMLAgent is None:
        return None
    try:
        return FloatingChatMLAgent()
    except Exception:
        return None


ml_agent = _load_agent()


def _extract_text(req: InferRequest) -> str:
    if req.text:
        return req.text

    payload = req.payload or {}
    if isinstance(payload.get("text"), str):
        return payload.get("text", "")
    if isinstance(payload.get("input"), str):
        return payload.get("input", "")
    if isinstance(payload.get("message"), str):
        return payload.get("message", "")
    return str(payload) if payload else ""


def _coerce_infer_request(raw: Any) -> InferRequest:
    if isinstance(raw, InferRequest):
        return raw

    if raw is None:
        return InferRequest()

    if isinstance(raw, str):
        return InferRequest(text=raw)

    if isinstance(raw, dict):
        text = raw.get("text") if isinstance(raw.get("text"), str) else ""
        payload = raw.get("payload")
        context = raw.get("context")

        if not isinstance(payload, dict):
            payload = {}
        if not isinstance(context, dict):
            context = {}

        if not text:
            for key in ("input", "message", "command"):
                if isinstance(raw.get(key), str):
                    text = raw[key]
                    break

        if not payload:
            payload = {k: v for k, v in raw.items() if k not in ("text", "payload", "context")}

        return InferRequest(text=text, payload=payload, context=context)

    return InferRequest(text=str(raw))


def _fallback_action(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ["error", "fail", "exception", "traceback"]):
        return "analyze_logs"
    if any(k in lower for k in ["test", "pytest", "go test", "unit test"]):
        return "run_tests"
    if any(k in lower for k in ["build", "compile", "tsc", "lint"]):
        return "run_build_checks"
    if any(k in lower for k in ["deploy", "release", "prod"]):
        return "prepare_deploy_plan"
    return "gather_context"


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "ml",
        "mode": os.getenv("NEUROEDGE_MODE", "sovereign"),
    }


@app.get("/ready")
@app.get("/readyz")
def ready() -> Dict[str, Any]:
    return {
        "status": "ready",
        "service": "ml",
        "model_loaded": ml_agent is not None,
        "mode": os.getenv("NEUROEDGE_MODE", "sovereign"),
        "fed_version": _global_version,
    }


@app.get("/federated/status")
def federated_status() -> Dict[str, Any]:
    return {
        "node_id": NODE_ID,
        "fed_url": FED_URL,
        "fed_enabled": bool(FED_KEY),
        "fed_version": _global_version,
        "pending_local_samples": _local_samples,
        "sync_interval_sec": FED_SYNC_INTERVAL,
    }


@app.post("/federated/flush")
def federated_flush() -> Dict[str, Any]:
    before = _local_samples
    _push_local_update()
    _pull_global_update()
    return {"status": "ok", "pushed_samples": before, "fed_version": _global_version}


@app.post("/infer")
def infer(req: Any = Body(default=None)) -> Dict[str, Any]:
    parsed_req = _coerce_infer_request(req)
    text = _extract_text(parsed_req).strip()
    if not text:
        text = "empty_input"

    action = None
    if ml_agent is not None:
        try:
            action = ml_agent.predict_action(text)
        except Exception:
            action = None

    if not action:
        action = _fallback_action(text)

    # local online training signal (weak label)
    try:
        global _local_samples
        x = _featurize(text)
        y = _label_to_idx.get(action, 0)
        _clf.partial_fit(x, [y])
        _local_samples += 1
    except Exception:
        pass

    return {
        "status": "ok",
        "action": action,
        "input": text,
        "source": "model" if ml_agent is not None else "fallback",
        "fed_version": _global_version,
    }


@app.post("/predict")
def predict(req: PredictRequest) -> Dict[str, Any]:
    """
    Compatibility endpoint used by some orchestrator agents.
    Mirrors /infer action output so older clients don't fail.
    """
    text = (req.text or "").strip() or "empty_input"

    action = None
    if ml_agent is not None:
        try:
            action = ml_agent.predict_action(text)
        except Exception:
            action = None

    if not action:
        action = _fallback_action(text)

    return {
        "status": "ok",
        "action": action,
        "input": text,
        "source": "model" if ml_agent is not None else "fallback",
    }


@app.post("/propose")
def propose_command(req: CommandRequest) -> Dict[str, Any]:
    explanation = f"ML suggests executing '{req.command}' with args {req.args}"
    return {"explanation": explanation}


@app.post("/execute")
def execute_command(req: CommandRequest) -> Dict[str, Any]:
    if os.getenv("ML_ENABLE_EXECUTE", "false").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=403, detail="execute endpoint disabled")

    try:
        result = subprocess.run(
            [req.command, *req.args],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "success": result.returncode == 0,
            "exit_code": result.returncode,
        }
    except Exception as exc:
        return {"stdout": "", "stderr": str(exc), "success": False, "exit_code": -1}


if __name__ == "__main__":
    if uvicorn is None:
        raise RuntimeError("uvicorn is required. Install with: pip install uvicorn fastapi")

    host = os.getenv("ML_HOST", "0.0.0.0")
    port = int(os.getenv("ML_PORT", "8090"))
    uvicorn.run(app, host=host, port=port)
