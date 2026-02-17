from typing import Any, Dict, List


def website_architecture(product: str) -> Dict[str, Any]:
    p = (product or "web platform").strip()
    return {
        "ok": True,
        "target": p,
        "frontend": {
            "framework": "React + Vite",
            "patterns": ["component-driven UI", "role-aware routing", "accessibility-first", "i18n-ready"],
        },
        "backend": {
            "gateway": "Orchestrator API",
            "services": ["auth", "intelligence", "creator", "governance", "audit"],
        },
        "delivery": ["cdn", "edge cache", "observability", "progressive enhancement"],
    }


def database_architecture(use_case: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "use_case": use_case or "general",
        "layers": [
            {"name": "Relational", "choice": "PostgreSQL", "purpose": "transactions, users, billing, governance"},
            {"name": "Document/KV", "choice": "Redis/Dragonfly", "purpose": "sessions, cache, hot state"},
            {"name": "Vector", "choice": "Milvus/Weaviate", "purpose": "semantic retrieval and memory"},
            {"name": "Object Storage", "choice": "S3/MinIO", "purpose": "media, artifacts, exports, backups"},
        ],
        "hardening": ["migrations", "PITR backups", "encryption", "row-level access controls"],
    }


def api_architecture(domain: str) -> Dict[str, Any]:
    d = (domain or "platform").strip()
    return {
        "ok": True,
        "domain": d,
        "design": ["REST + WebSocket", "versioned contracts", "rate limiting", "idempotency keys", "signed audit"],
        "security": ["JWT + API keys", "scope enforcement", "workspace isolation", "zero-trust service auth"],
        "docs": ["OpenAPI", "SDK generation", "integration examples"],
    }


def framework_recommendation(goal: str) -> Dict[str, Any]:
    g = (goal or "").lower()
    frontend = "React + TypeScript" if "web" in g or "dashboard" in g else "React + TypeScript"
    backend = "Node.js/TypeScript orchestrator + Python ML services"
    return {"ok": True, "goal": goal, "frontend": frontend, "backend": backend, "notes": ["modular monorepo", "strict typing", "test coverage gates"]}


def distributed_systems_plan(scope: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "scope": scope or "global platform",
        "topology": ["control plane", "service mesh", "event bus", "multi-region storage"],
        "reliability": ["retry policies", "circuit breakers", "dead-letter queues", "graceful degradation"],
        "consistency": ["transaction boundaries", "saga patterns", "eventual consistency where acceptable"],
    }


def security_architecture(level: str = "high") -> Dict[str, Any]:
    return {
        "ok": True,
        "level": level,
        "controls": [
            "threat modeling",
            "static + dynamic security tests",
            "dependency scanning",
            "secrets management",
            "least privilege IAM",
            "tamper detection",
            "signed immutable audit",
        ],
        "incident_response": ["safe mode", "snapshot rollback", "forensics export", "post-incident review"],
    }


def cloud_architecture(target: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "target": target or "hybrid cloud",
        "compute": ["kubernetes services", "gpu workers for ML", "autoscaling worker pools"],
        "network": ["api gateway", "private service network", "WAF + DDoS mitigation"],
        "ops": ["prometheus/grafana", "distributed tracing", "slo/error budget policies"],
    }


def mesh_offline_intelligence(node_types: List[str]) -> Dict[str, Any]:
    nodes = node_types or ["laptop", "desktop", "mobile"]
    return {
        "ok": True,
        "node_types": nodes,
        "mode": "inference-first mesh",
        "capabilities": [
            "local inference with signed model bundles",
            "health heartbeat + capability ads",
            "best-node routing by latency/load",
            "offline queue and eventual sync",
            "federated training signals (opt-in) for later rounds",
        ],
        "safety": ["consent-based data policy", "no raw private data exfiltration", "signed updates"],
    }


def full_stack_blueprint(product: str, include_mesh: bool = True) -> Dict[str, Any]:
    base = {
        "ok": True,
        "product": product or "NeuroEdge platform",
        "website": website_architecture(product),
        "database": database_architecture("ai platform"),
        "api": api_architecture("platform"),
        "frameworks": framework_recommendation("web + ai + dashboard"),
        "distributed": distributed_systems_plan("internet scale"),
        "security": security_architecture("high"),
        "cloud": cloud_architecture("hybrid"),
    }
    if include_mesh:
        base["mesh"] = mesh_offline_intelligence(["laptop", "desktop", "mobile"])
    return base

