from typing import Any, Dict, List


class TwinAnalyzer:
    def __init__(self, structure_map: Dict[str, Any]) -> None:
        self.structure_map = structure_map
        self.files = structure_map.get("files", [])

    def _has(self, needle: str) -> bool:
        return any(needle in f for f in self.files)

    def analyze_architecture(self) -> Dict[str, Any]:
        risks: List[str] = []
        suggestions: List[str] = []
        if not self._has("frontend/src/components/Dashboard"):
            risks.append("Dashboard UI components not detected in expected path.")
        if not self._has("orchestrator/src/server/index.ts"):
            risks.append("Orchestrator server entrypoint missing.")
        if not self._has("kernel/api/router.go"):
            risks.append("Kernel router missing; API surface may be incomplete.")
        if not self._has("ml/server.py"):
            risks.append("ML service entrypoint missing.")

        if risks:
            suggestions.append("Restore missing core paths before feature expansion.")
        suggestions.append("Keep strict separation: frontend UI, orchestrator policy, kernel execution, ml inference.")
        suggestions.append("Add integration tests for cross-service auth and startup dependencies.")

        return {
            "risk_level": "high" if len(risks) > 2 else "medium" if risks else "low",
            "risks": risks,
            "suggestions": suggestions,
        }

    def analyze_security(self) -> Dict[str, Any]:
        findings: List[str] = []
        if not self._has("security/auth"):
            findings.append("No explicit auth module detected in scanned files.")
        if not self._has("doctrine"):
            findings.append("Doctrine guardrail modules not detected.")
        recommendations = [
            "Enforce role + scope checks on all privileged dashboard actions.",
            "Require human approval for restart/evolution operations.",
            "Log all admin actions to immutable event stream.",
        ]
        return {
            "status": "attention" if findings else "ok",
            "findings": findings,
            "recommendations": recommendations,
        }

    def analyze_performance(self) -> Dict[str, Any]:
        bundle_risk = any("dist/assets/index-" in f for f in self.files)
        return {
            "notes": [
                "Enable code splitting for large frontend bundles.",
                "Cache research/tool outputs in orchestrator.",
                "Use async retries and circuit-breakers for ML/kernel calls.",
            ],
            "bundle_risk_detected": bundle_risk,
        }

    def analyze_agents(self) -> Dict[str, Any]:
        agent_files = [f for f in self.files if "agent" in f.lower()]
        return {
            "agent_files_detected": len(agent_files),
            "sample": agent_files[:20],
            "recommendations": [
                "Track per-agent health and SLA in dashboard.",
                "Disable dormant agents by policy, not by hard delete.",
            ],
        }
