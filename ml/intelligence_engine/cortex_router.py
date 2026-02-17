from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .math_engine import solve_expression, solve_equation, differentiate, integrate, solve_matrix, explain_solution
from .physics_engine import solve_physics_problem, convert as convert_units, identify_formula
from .science_engine import explain_science
from .code_engine import generate_code, debug_code, refactor_code, explain_code, generate_unit_tests
from .research_engine import generate_research, compare_topics, summarize_text, generate_outline
from .reasoning_engine import analyze_problem, generate_solution_plan, estimate_confidence
from .validation_engine import validate_math, validate_physics, validate_code, validate_consistency
from .visualization_engine import visualize_graph, visualize_equation
from .academic_suite import export_academic
from .subjects_catalog import SUBJECT_CATALOG, flatten_subjects
from .language_engine import SUPPORTED_LANGUAGES, detect_language, language_label, localize_text
from .platform_engine import (
    website_architecture,
    database_architecture,
    api_architecture,
    framework_recommendation,
    distributed_systems_plan,
    security_architecture,
    cloud_architecture,
    mesh_offline_intelligence,
    full_stack_blueprint,
)
from .medicine_engine import medical_intelligence
from .agriculture_engine import agriculture_intelligence
from .market_engine import market_intelligence

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


class IntelligenceRequest(BaseModel):
    question: str = ""
    mode: str = "step_by_step"
    payload: Dict[str, Any] = Field(default_factory=dict)


ACADEMIC_MODES = {
    "step_by_step": "detailed reasoning with intermediate steps",
    "fast": "concise direct answer",
    "deep_research": "expanded research structure with gaps and hypotheses",
    "beginner": "simple explanations and examples",
    "advanced": "technical explanation with domain terms",
    "exam": "short and exam-ready response",
    "student": "learning-oriented instructional response",
    "academic": "formal scholarly structure",
    "technical": "engineering-grade precision",
    "executive": "decision-oriented summary",
}


def _subject_detector(question: str) -> str:
    q = (question or "").lower()
    if any(k in q for k in ["integrate", "differentiate", "equation", "matrix", "probability", "statistics"]):
        return "math"
    if any(k in q for k in ["force", "velocity", "acceleration", "ohm", "voltage", "current"]):
        return "physics"
    if any(k in q for k in ["chemistry", "biology", "mole", "photosynthesis", "cell"]):
        return "science"
    if any(k in q for k in ["code", "debug", "refactor", "unit test", "compile"]):
        return "code"
    if any(k in q for k in ["research", "compare", "outline", "summary", "paper"]):
        return "research"
    if any(k in q for k in ["disease", "symptom", "diagnosis", "virus", "surgery", "medical", "medicine", "doctor"]):
        return "medicine"
    if any(k in q for k in ["agriculture", "farm", "crop", "forestry", "plant disease", "soil", "yield", "timber"]):
        return "agriculture"
    if any(k in q for k in ["market", "business", "stock", "crypto", "gold", "asset", "portfolio", "trading", "commodity"]):
        return "market"
    if any(
        k in q
        for k in [
            "website",
            "web app",
            "database",
            "api",
            "framework",
            "distributed",
            "security",
            "cloud",
            "github",
            "devops",
            "offline",
            "mesh",
            "full stack",
        ]
    ):
        return "platform"
    return "reasoning"


def _unsafe(question: str) -> bool:
    q = (question or "").lower()
    bad = ["harmful chemical", "build bomb", "weapon synthesis", "execute arbitrary code"]
    return any(b in q for b in bad)


@router.post("/math")
def intelligence_math(req: IntelligenceRequest) -> Dict[str, Any]:
    q = req.question or str(req.payload.get("expression", ""))
    if "=" in q:
        out = solve_equation(q)
        val = validate_math(out)
    elif req.payload.get("op") == "differentiate":
        out = differentiate(q)
        val = validate_math(out)
    elif req.payload.get("op") == "integrate":
        out = integrate(q)
        val = validate_math(out)
    elif req.payload.get("matrix"):
        out = solve_matrix(req.payload.get("matrix"))
        val = validate_math(out)
    else:
        out = solve_expression(q)
        val = validate_math(out)
    out["validation"] = val
    out["explanation"] = explain_solution(q)
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/physics")
def intelligence_physics(req: IntelligenceRequest) -> Dict[str, Any]:
    if req.payload.get("convert"):
        c = req.payload.get("convert")
        out = convert_units(float(c.get("value", 0)), str(c.get("from_unit", "")), str(c.get("to_unit", "")))
        out["validation"] = validate_physics({"ok": out.get("ok"), "final_answer": out.get("value"), "unit": c.get("to_unit", "")})
        out["confidence"] = estimate_confidence(out)["confidence"]
        return out
    out = solve_physics_problem(req.question)
    out["formula"] = identify_formula(req.question)
    out["validation"] = validate_physics(out)
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/science")
def intelligence_science(req: IntelligenceRequest) -> Dict[str, Any]:
    mode = req.mode if req.mode in {"beginner", "advanced"} else "advanced"
    out = explain_science(req.question, mode=mode)
    out["validation"] = validate_consistency(str(out.get("explanation", "")))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/code")
def intelligence_code(req: IntelligenceRequest) -> Dict[str, Any]:
    action = str(req.payload.get("action", "generate"))
    language = str(req.payload.get("language", "python"))
    if action == "debug":
        out = debug_code(str(req.payload.get("code", req.question)))
    elif action == "refactor":
        out = refactor_code(str(req.payload.get("code", req.question)))
    elif action == "explain":
        out = explain_code(str(req.payload.get("code", req.question)))
    elif action == "tests":
        out = generate_unit_tests(str(req.payload.get("code", "")), language=language)
    else:
        out = generate_code(req.question, language=language)
    out["validation"] = validate_code(str(req.payload.get("code", out.get("code", ""))))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/research")
def intelligence_research(req: IntelligenceRequest) -> Dict[str, Any]:
    action = str(req.payload.get("action", "generate"))
    mode = req.mode or "technical"
    if action == "compare":
        out = compare_topics(str(req.payload.get("topic_a", "")), str(req.payload.get("topic_b", "")))
    elif action == "summarize":
        out = summarize_text(str(req.payload.get("text", req.question)))
    elif action == "outline":
        out = generate_outline(req.question)
    else:
        depth = str(req.payload.get("depth_level", "technical"))
        out = generate_research(req.question, depth_level=depth, mode=mode)
    out["validation"] = validate_consistency(str(out))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/solve")
def intelligence_solve(req: IntelligenceRequest) -> Dict[str, Any]:
    if _unsafe(req.question):
        raise HTTPException(status_code=400, detail="Unsafe request blocked by CortexCore policy.")
    subject = _subject_detector(req.question)
    if subject == "math":
        return intelligence_math(req)
    if subject == "physics":
        return intelligence_physics(req)
    if subject == "science":
        return intelligence_science(req)
    if subject == "code":
        return intelligence_code(req)
    if subject == "research":
        return intelligence_research(req)
    if subject == "medicine":
        return intelligence_medicine(req)
    if subject == "agriculture":
        return intelligence_agriculture(req)
    if subject == "market":
        return intelligence_market(req)
    if subject == "platform":
        return intelligence_platform(req)
    plan = generate_solution_plan(req.question)
    return {
        "ok": True,
        "subject": "reasoning",
        "analysis": analyze_problem(req.question),
        "plan": plan,
        "final_answer": "I need either a specific math/physics/code/research target to compute directly.",
        "confidence": estimate_confidence(plan)["confidence"],
    }


@router.post("/platform")
def intelligence_platform(req: IntelligenceRequest) -> Dict[str, Any]:
    q = (req.question or "").lower()
    payload = req.payload or {}
    if "database" in q:
        out = database_architecture(req.question)
    elif "api" in q:
        out = api_architecture(req.question)
    elif "framework" in q:
        out = framework_recommendation(req.question)
    elif "distributed" in q:
        out = distributed_systems_plan(req.question)
    elif "security" in q:
        out = security_architecture("high")
    elif "cloud" in q:
        out = cloud_architecture(req.question)
    elif "mesh" in q or "offline" in q:
        out = mesh_offline_intelligence(payload.get("node_types", ["laptop", "desktop", "mobile"]))
    elif "full stack" in q or "internet" in q:
        out = full_stack_blueprint(req.question, include_mesh=True)
    else:
        out = website_architecture(req.question)
    out["confidence"] = estimate_confidence(out)["confidence"]
    out["validation"] = validate_consistency(str(out))
    return out


@router.post("/fullstack")
def intelligence_fullstack(req: IntelligenceRequest) -> Dict[str, Any]:
    include_mesh = bool((req.payload or {}).get("include_mesh", True))
    out = full_stack_blueprint(req.question, include_mesh=include_mesh)
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/medicine")
def intelligence_medicine(req: IntelligenceRequest) -> Dict[str, Any]:
    mode = req.mode or "clinical"
    out = medical_intelligence(req.question, mode=mode)
    out["validation"] = validate_consistency(str(out))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/agriculture")
def intelligence_agriculture(req: IntelligenceRequest) -> Dict[str, Any]:
    mode = req.mode or "farm"
    out = agriculture_intelligence(req.question, mode=mode)
    out["validation"] = validate_consistency(str(out))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/market")
def intelligence_market(req: IntelligenceRequest) -> Dict[str, Any]:
    mode = req.mode or "analysis"
    out = market_intelligence(req.question, mode=mode)
    out["validation"] = validate_consistency(str(out))
    out["confidence"] = estimate_confidence(out)["confidence"]
    return out


@router.post("/validate")
def intelligence_validate(req: IntelligenceRequest) -> Dict[str, Any]:
    payload = req.payload or {}
    return {
        "ok": True,
        "math": validate_math(payload.get("math", {})),
        "physics": validate_physics(payload.get("physics", {})),
        "code": validate_code(str(payload.get("code", ""))),
        "consistency": validate_consistency(str(payload.get("text", req.question))),
    }


@router.post("/ask")
def intelligence_ask(req: IntelligenceRequest) -> Dict[str, Any]:
    if _unsafe(req.question):
        raise HTTPException(status_code=400, detail="Unsafe request blocked by CortexCore policy.")
    subject = _subject_detector(req.question)
    answer = intelligence_solve(req)
    in_lang = str((req.payload or {}).get("language", "")).strip().lower() or detect_language(req.question)
    out_lang = str((req.payload or {}).get("target_language", "")).strip().lower() or in_lang
    mode = req.mode if req.mode in ACADEMIC_MODES else "step_by_step"
    final_text = str(answer.get("final_answer") or answer.get("result") or answer.get("solutions") or "")
    localized_final = localize_text(final_text, out_lang)
    response = {
        "ok": True,
        "subject": subject,
        "mode": mode,
        "mode_profile": ACADEMIC_MODES.get(mode, ACADEMIC_MODES["step_by_step"]),
        "language": {
            "input": in_lang,
            "input_label": language_label(in_lang),
            "output": out_lang,
            "output_label": language_label(out_lang),
        },
        "reasoning": analyze_problem(req.question),
        "answer": answer,
        "final": localized_final,
        "confidence": answer.get("confidence", estimate_confidence(answer).get("confidence")),
        "subject_catalog_hint": [s for s in flatten_subjects() if s in req.question.lower()][:8],
        "safety": {
            "plagiarism": "disallowed",
            "fabricated_citations": "disallowed",
            "unsafe_science": "blocked",
            "arbitrary_code_execution": "blocked",
        },
    }
    export_format = str((req.payload or {}).get("export_format", "")).strip().lower()
    if export_format in {"pdf", "word", "docx", "zip"}:
        title = f"CortexCore {subject.title()} Report"
        content = str(response.get("answer", ""))
        response["export"] = export_academic(title, content, "docx" if export_format in {"word", "docx"} else export_format)
    return response


@router.post("/visualize")
def intelligence_visualize(req: IntelligenceRequest) -> Dict[str, Any]:
    mode = str((req.payload or {}).get("type", "graph")).lower()
    if mode == "equation":
        return {"ok": True, "visualization": visualize_equation(req.question)}
    x_min = float((req.payload or {}).get("x_min", -10))
    x_max = float((req.payload or {}).get("x_max", 10))
    return {"ok": True, "visualization": visualize_graph(req.question, x_min=x_min, x_max=x_max)}


@router.post("/export")
def intelligence_export(req: IntelligenceRequest) -> Dict[str, Any]:
    fmt = str((req.payload or {}).get("format", "pdf")).lower()
    title = str((req.payload or {}).get("title", "CortexCore Academic Report"))
    content = str((req.payload or {}).get("content", req.question))
    out = export_academic(title, content, "docx" if fmt in {"word", "docx"} else fmt)
    if out.get("ok") != "true":
        raise HTTPException(status_code=400, detail=out.get("error"))
    return {"ok": True, "export": out}


@router.get("/languages")
def intelligence_languages() -> Dict[str, Any]:
    return {"ok": True, "languages": SUPPORTED_LANGUAGES}


@router.get("/subjects")
def intelligence_subjects() -> Dict[str, Any]:
    return {"ok": True, "subjects": SUBJECT_CATALOG, "total_subject_nodes": len(flatten_subjects())}
