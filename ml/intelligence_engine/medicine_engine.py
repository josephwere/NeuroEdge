from typing import Any, Dict, List


_RED_FLAGS = [
    "chest pain",
    "shortness of breath",
    "stroke",
    "seizure",
    "unconscious",
    "severe bleeding",
    "high fever infant",
]


def _match_red_flags(text: str) -> List[str]:
    t = (text or "").lower()
    return [f for f in _RED_FLAGS if f in t]


def medical_intelligence(query: str, mode: str = "clinical") -> Dict[str, Any]:
    q = (query or "").strip()
    flags = _match_red_flags(q)
    lower = q.lower()

    symptom_clusters = []
    if any(k in lower for k in ["cough", "fever", "sore throat", "runny nose"]):
        symptom_clusters.append("respiratory infection pattern")
    if any(k in lower for k in ["headache", "nausea", "light sensitivity"]):
        symptom_clusters.append("neurologic-headache pattern")
    if any(k in lower for k in ["abdominal pain", "vomit", "diarrhea"]):
        symptom_clusters.append("gastrointestinal pattern")
    if any(k in lower for k in ["rash", "itch", "hives"]):
        symptom_clusters.append("dermatologic-allergic pattern")

    likely = []
    if "respiratory infection pattern" in symptom_clusters:
        likely.extend(["viral upper respiratory infection", "influenza-like illness", "allergic rhinitis (differential)"])
    if "neurologic-headache pattern" in symptom_clusters:
        likely.extend(["migraine pattern", "tension headache pattern"])
    if "gastrointestinal pattern" in symptom_clusters:
        likely.extend(["acute gastroenteritis pattern", "food intolerance pattern"])
    if "dermatologic-allergic pattern" in symptom_clusters:
        likely.extend(["allergic dermatitis pattern", "urticaria pattern"])

    tests = []
    if symptom_clusters:
        tests.extend(["vital signs", "focused physical exam", "targeted lab panel based on red flags"])
    if "respiratory infection pattern" in symptom_clusters:
        tests.extend(["COVID/flu antigen or PCR as locally indicated", "chest exam +/- imaging if severe"])
    if "gastrointestinal pattern" in symptom_clusters:
        tests.extend(["hydration assessment", "stool/lab tests if persistent or severe"])

    treatment = [
        "Supportive care framework (hydration, rest, symptom control).",
        "Escalate to licensed clinician for definitive diagnosis and prescriptions.",
        "Emergency care immediately if red-flag symptoms are present.",
    ]

    return {
        "ok": True,
        "domain": "medicine",
        "mode": mode,
        "query": q,
        "symptom_clusters": symptom_clusters,
        "differential_considerations": likely[:8],
        "recommended_diagnostics": tests[:10],
        "care_pathway": treatment,
        "red_flags_detected": flags,
        "confidence": 0.61 if symptom_clusters else 0.42,
        "safety": {
            "medical_disclaimer": "Clinical decision support only. Not a diagnosis. Consult a licensed clinician.",
            "emergency_instruction": "If severe or life-threatening symptoms are present, seek emergency care now.",
            "no_prescription_automation": True,
        },
    }

