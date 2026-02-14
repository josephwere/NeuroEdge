# ml/server.py
import os
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import uvicorn
except Exception:  # pragma: no cover
    uvicorn = None

try:
    from floating_chat_ml_agent import FloatingChatMLAgent
except Exception:
    FloatingChatMLAgent = None


app = FastAPI(title="NeuroEdge ML Service", version="1.0.0")


class CommandRequest(BaseModel):
    command: str
    args: List[str] = Field(default_factory=list)


class InferRequest(BaseModel):
    text: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)


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
    return {"status": "ok", "service": "ml"}


@app.get("/ready")
@app.get("/readyz")
def ready() -> Dict[str, Any]:
    return {
        "status": "ready",
        "service": "ml",
        "model_loaded": ml_agent is not None,
    }


@app.post("/infer")
def infer(req: InferRequest) -> Dict[str, Any]:
    text = _extract_text(req).strip()
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
