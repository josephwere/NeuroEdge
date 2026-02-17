# ml/server.py
import os
import subprocess
import time
import threading
import re
import base64
import tempfile
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

try:
    from twin import TwinCore
    from human_twin import (
        TwinProfileStore,
        set_mode as twin_set_mode,
        get_mode as twin_get_mode,
        summarize_meeting,
        analyze_emotion,
        simulate_decision,
        enforce_human_twin_guardrails,
        log_meeting,
        list_meetings,
        log_decision,
        list_decisions,
    )
except Exception:
    TwinCore = None
    TwinProfileStore = None
    twin_set_mode = None
    twin_get_mode = None
    summarize_meeting = None
    analyze_emotion = None
    simulate_decision = None
    enforce_human_twin_guardrails = None
    log_meeting = None
    list_meetings = None
    log_decision = None
    list_decisions = None


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


class TwinCalibrateRequest(BaseModel):
    owner: str = "founder"
    goals: List[str] = Field(default_factory=list)
    tone: str = "direct"
    communication_style: str = "strategic"
    risk_appetite: str = "medium"
    writing_samples: List[str] = Field(default_factory=list)
    calibration_answers: Dict[str, Any] = Field(default_factory=dict)


class TwinMeetingRequest(BaseModel):
    transcript: str = ""
    title: str = "Untitled meeting"
    participants: List[str] = Field(default_factory=list)


class TwinDecisionRequest(BaseModel):
    prompt: str
    context: Dict[str, Any] = Field(default_factory=dict)


class TwinModeRequest(BaseModel):
    mode: str


class TwinValidateRequest(BaseModel):
    code: str = ""
    language: str = "python"
    schema: Dict[str, Any] = Field(default_factory=dict)
    proposal: Dict[str, Any] = Field(default_factory=dict)


class TwinProjectAnalyzeRequest(BaseModel):
    zip_path: str = ""


class TwinUploadedFile(BaseModel):
    name: str
    type: str = ""
    size: int = 0
    text_sample: str = ""


class TwinUploadedZip(BaseModel):
    name: str
    data_base64: str


class TwinAskRequest(BaseModel):
    question: str
    uploaded_files: List[TwinUploadedFile] = Field(default_factory=list)
    uploaded_zips: List[TwinUploadedZip] = Field(default_factory=list)
    zip_path: str = ""
    include_scan: bool = True
    include_analyze: bool = True
    include_report: bool = True


def _load_agent() -> Optional[Any]:
    if FloatingChatMLAgent is None:
        return None
    try:
        return FloatingChatMLAgent()
    except Exception:
        return None


ml_agent = _load_agent()
twin_core = TwinCore(os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))) if TwinCore is not None else None
twin_profile_store = TwinProfileStore() if TwinProfileStore is not None else None


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


@app.post("/neurotwin/calibrate")
def neurotwin_calibrate(req: TwinCalibrateRequest) -> Dict[str, Any]:
    if twin_profile_store is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")

    writing = " ".join(req.writing_samples).strip().lower()
    avg_sentence = 0
    vocab = []
    if writing:
        words = [w.strip(".,!?;:()[]{}\"'") for w in writing.split() if w.strip()]
        vocab = sorted(list(set(words)))[:200]
        avg_sentence = max(1, len(words) // max(1, writing.count(".") + writing.count("!") + writing.count("?")))

    profile = twin_profile_store.save_profile(
        {
            "owner": req.owner,
            "goals": req.goals,
            "tone": req.tone,
            "communication_style": req.communication_style,
            "risk_appetite": req.risk_appetite,
            "calibration_answers": req.calibration_answers,
            "disclosure_required": True,
        }
    )
    comm = twin_profile_store.save_communication_patterns(
        {
            "vocabulary": vocab,
            "sentence_length_avg": avg_sentence,
            "tone_vectors": {"directness": 0.8 if req.tone == "direct" else 0.5},
        }
    )
    return {
        "status": "ok",
        "profile": profile,
        "communication_patterns": comm,
        "message": "NeuroTwin calibrated. AI disclosure remains mandatory.",
    }


@app.post("/neurotwin/update-profile")
def neurotwin_update_profile(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    if twin_profile_store is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    updated = twin_profile_store.save_profile(payload or {})
    return {"status": "ok", "profile": updated}


@app.post("/neurotwin/analyze-meeting")
def neurotwin_analyze_meeting(req: TwinMeetingRequest) -> Dict[str, Any]:
    if summarize_meeting is None or log_meeting is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Missing transcript")
    analysis = summarize_meeting(req.transcript)
    emotion = analyze_emotion(req.transcript) if analyze_emotion is not None else {}
    guardrails = enforce_human_twin_guardrails(req.transcript) if enforce_human_twin_guardrails is not None else {"allowed": True}
    payload = {
        "title": req.title,
        "participants": req.participants,
        "analysis": analysis,
        "emotion": emotion,
        "guardrails": guardrails,
    }
    log_meeting(payload)
    return {"status": "ok", **payload}


@app.post("/neurotwin/decision-simulate")
def neurotwin_decision_simulate(req: TwinDecisionRequest) -> Dict[str, Any]:
    if twin_profile_store is None or simulate_decision is None or log_decision is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    profile = twin_profile_store.get_profile()
    framework = twin_profile_store.get_decision_framework()
    result = simulate_decision(req.prompt, profile, framework)
    log_decision({"prompt": req.prompt, "result": result, "context": req.context})
    return {"status": "ok", "result": result}


@app.post("/neurotwin/set-mode")
def neurotwin_set_mode(req: TwinModeRequest) -> Dict[str, Any]:
    if twin_set_mode is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    allowed = {"public", "investor", "developer", "private_reflection", "aggressive_negotiation", "calm_mediator"}
    mode = req.mode.strip().lower()
    if mode not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Allowed: {sorted(list(allowed))}")
    data = twin_set_mode(mode)
    return {"status": "ok", "mode": data}


@app.get("/neurotwin/profile")
def neurotwin_profile() -> Dict[str, Any]:
    if twin_profile_store is None or twin_get_mode is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    return {
        "status": "ok",
        "profile": twin_profile_store.get_profile(),
        "communication_patterns": twin_profile_store.get_communication_patterns(),
        "decision_framework": twin_profile_store.get_decision_framework(),
        "mode": twin_get_mode(),
        "disclosure": "This is an AI digital twin assistant, not a human identity replacement.",
    }


@app.get("/neurotwin/report")
def neurotwin_report() -> Dict[str, Any]:
    if twin_profile_store is None:
        raise HTTPException(status_code=503, detail="NeuroTwin unavailable")
    meetings = list_meetings(20) if list_meetings is not None else []
    decisions = list_decisions(20) if list_decisions is not None else []
    return {
        "status": "ok",
        "profile": twin_profile_store.get_profile(),
        "recent_meetings": meetings,
        "recent_decisions": decisions,
    }


@app.post("/twin/scan")
def twincore_scan() -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    return twin_core.scan_system()


@app.post("/twin/analyze")
def twincore_analyze() -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    return twin_core.analyze_system()


@app.post("/twin/evolve")
def twincore_evolve(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    current_version = str((payload or {}).get("current_version", "1.0"))
    return twin_core.simulate_evolution(current_version)


@app.post("/twin/validate")
def twincore_validate(req: TwinValidateRequest) -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    return twin_core.validate_proposal(
        {
            "code": req.code,
            "language": req.language,
            "schema": req.schema,
            **(req.proposal or {}),
        }
    )


@app.get("/twin/report")
def twincore_report() -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    return twin_core.generate_full_report()


@app.post("/twin/project/analyze")
def twincore_project_analyze(req: TwinProjectAnalyzeRequest) -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")
    if not req.zip_path.strip():
        raise HTTPException(status_code=400, detail="Missing zip_path")
    return twin_core.analyze_zip(req.zip_path.strip())


@app.post("/twin/ask")
def twincore_ask(req: TwinAskRequest) -> Dict[str, Any]:
    if twin_core is None:
        raise HTTPException(status_code=503, detail="TwinCore unavailable")

    q = (req.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Missing question")

    scan = twin_core.scan_system() if req.include_scan else {"structure": {"files": []}}
    structure = (scan or {}).get("structure", {}) or {}
    files = structure.get("files", []) or []
    q_lower = q.lower()
    q_tokens = [t for t in re.split(r"[^a-z0-9_./-]+", q_lower) if len(t) >= 2]

    evidence: List[Dict[str, Any]] = []

    def score_path(path: str) -> int:
        p = path.lower()
        score = 0
        for t in q_tokens:
            if t in p:
                score += 2
        if "floating" in q_lower and "floating" in p:
            score += 3
        if "image" in q_lower and p.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif")):
            score += 2
        if "logo" in q_lower and "logo" in p:
            score += 2
        return score

    ranked = sorted(
        ((score_path(p), p) for p in files),
        key=lambda x: x[0],
        reverse=True,
    )
    top = [p for s, p in ranked if s > 0][:12]
    for p in top:
        evidence.append({"type": "repo_path", "path": p})

    uploaded_summary: List[Dict[str, Any]] = []
    for f in req.uploaded_files[:50]:
        entry = {
            "name": f.name,
            "type": f.type,
            "size": f.size,
            "text_sample_size": len(f.text_sample or ""),
        }
        uploaded_summary.append(entry)
        if q_tokens and any(t in (f.name or "").lower() for t in q_tokens):
            evidence.append({"type": "uploaded_file", **entry})

    zip_analysis: Optional[Dict[str, Any]] = None
    if req.zip_path.strip():
        try:
            zip_analysis = twin_core.analyze_zip(req.zip_path.strip())
            evidence.append({
                "type": "zip_analysis",
                "ok": bool((zip_analysis or {}).get("ok")),
                "zip_path": req.zip_path.strip(),
            })
        except Exception as ex:
            zip_analysis = {"ok": False, "error": str(ex)}

    uploaded_zip_analyses: List[Dict[str, Any]] = []
    for z in req.uploaded_zips[:5]:
        try:
            raw = base64.b64decode(z.data_base64)
            with tempfile.NamedTemporaryFile(prefix="neuroedge_twin_", suffix=".zip", delete=True) as tf:
                tf.write(raw)
                tf.flush()
                analysis = twin_core.analyze_zip(tf.name)
            uploaded_zip_analyses.append({"name": z.name, "analysis": analysis})
            evidence.append({
                "type": "uploaded_zip",
                "name": z.name,
                "ok": bool((analysis or {}).get("ok")),
                "files": (analysis or {}).get("structure", {}).get("total_files", 0),
            })
        except Exception as ex:
            uploaded_zip_analyses.append({"name": z.name, "analysis": {"ok": False, "error": str(ex)}})

    answer_lines: List[str] = []
    if "floating" in q_lower and ("image" in q_lower or "icon" in q_lower or "logo" in q_lower):
        floating_images = [
            p
            for p in files
            if ("floating" in p.lower() or "logo" in p.lower())
            and p.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"))
        ][:8]
        if floating_images:
            answer_lines.append("Likely floating-chat image assets:")
            answer_lines.extend([f"- {p}" for p in floating_images])
        else:
            answer_lines.append("No explicit floating image file matched; check `frontend/public/` and component imports.")

    if not answer_lines:
        if top:
            answer_lines.append("Top matching repository paths:")
            answer_lines.extend([f"- {p}" for p in top[:8]])
        else:
            answer_lines.append("No strong direct path match found in repository scan.")
            answer_lines.append("Try a more specific question including filename, feature name, or folder.")

    if uploaded_summary:
        answer_lines.append("")
        answer_lines.append(f"Uploaded artifacts received: {len(uploaded_summary)}")
        for item in uploaded_summary[:8]:
            answer_lines.append(f"- {item['name']} ({item['type'] or 'unknown'}, {item['size']} bytes)")

    if zip_analysis:
        answer_lines.append("")
        if zip_analysis.get("ok"):
            answer_lines.append(
                f"Zip analysis complete for: {req.zip_path.strip()} (files: {zip_analysis.get('structure', {}).get('total_files', 0)})"
            )
        else:
            answer_lines.append(f"Zip analysis failed: {zip_analysis.get('error', 'unknown error')}")

    analysis_summary: Dict[str, Any] = {}
    if req.include_analyze:
        try:
            analysis_summary["analyze"] = twin_core.analyze_system()
        except Exception as ex:
            analysis_summary["analyze_error"] = str(ex)
    if req.include_report:
        try:
            analysis_summary["report"] = twin_core.generate_full_report()
        except Exception as ex:
            analysis_summary["report_error"] = str(ex)

    answer = "\n".join(answer_lines)
    return {
        "ok": True,
        "question": q,
        "answer": answer,
        "evidence": evidence[:30],
        "uploaded": uploaded_summary,
        "zip_analysis": zip_analysis,
        "uploaded_zip_analyses": uploaded_zip_analyses,
        "analysis_summary": analysis_summary,
    }

if __name__ == "__main__":
    if uvicorn is None:
        raise RuntimeError("uvicorn is required. Install with: pip install uvicorn fastapi")

    host = os.getenv("ML_HOST", "0.0.0.0")
    port = int(os.getenv("ML_PORT", "8090"))
    uvicorn.run(app, host=host, port=port)
