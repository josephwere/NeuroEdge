import os
from typing import Any, Dict

from .twin_scanner import TwinScanner
from .twin_analyzer import TwinAnalyzer
from .twin_evolution import TwinEvolution
from .twin_validator import TwinValidator
from .twin_memory import (
    store_snapshot,
    retrieve_snapshot,
    store_upgrade_log,
    store_rejection,
    list_upgrade_logs,
    list_rejections,
    vectorize_structure,
)


class TwinCore:
    def __init__(self, root: str) -> None:
        self.root = os.path.abspath(root)
        self.validator = TwinValidator()

    def scan_system(self) -> Dict[str, Any]:
        scanner = TwinScanner(self.root)
        structure = scanner.generate_structure_map()
        missing = scanner.detect_missing_components()
        snapshot = {
            "type": "scan",
            "root": self.root,
            "structure_summary": {
                "total_files": structure.get("total_files", 0),
                "missing_groups": list((missing.get("missing") or {}).keys()),
            },
            "embedding": vectorize_structure(structure),
        }
        store_snapshot(snapshot)
        return {
            "ok": True,
            "structure": structure,
            "missing": missing,
            "snapshot": snapshot,
        }

    def analyze_system(self) -> Dict[str, Any]:
        scanned = self.scan_system()
        analyzer = TwinAnalyzer(scanned["structure"])
        report = {
            "architecture": analyzer.analyze_architecture(),
            "security": analyzer.analyze_security(),
            "performance": analyzer.analyze_performance(),
            "agents": analyzer.analyze_agents(),
        }
        return {"ok": True, "report": report}

    def simulate_evolution(self, current_version: str = "1.0") -> Dict[str, Any]:
        scanned = self.scan_system()
        evo = TwinEvolution(scanned["structure"])
        proposal = {
            "compare": evo.compare_versions(current_version),
            "upgrades": evo.suggest_upgrades(),
            "migration": evo.generate_migration_script(),
            "simulation": evo.simulate_upgrade(),
        }
        store_upgrade_log({"type": "proposal", "proposal": proposal})
        return {"ok": True, "proposal": proposal}

    def validate_proposal(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        code_validation = self.validator.validate_code(str(payload.get("code", "")), str(payload.get("language", "python")))
        schema_validation = self.validator.validate_schema(payload.get("schema", {}))
        security_validation = self.validator.validate_security(payload)
        doctrine_validation = self.validator.validate_doctrine(payload)
        valid = all([
            code_validation.get("valid"),
            schema_validation.get("valid"),
            security_validation.get("valid"),
            doctrine_validation.get("valid"),
        ])
        if not valid:
            store_rejection({
                "type": "validation_reject",
                "payload": payload,
                "results": {
                    "code": code_validation,
                    "schema": schema_validation,
                    "security": security_validation,
                    "doctrine": doctrine_validation,
                },
            })
        return {
            "ok": True,
            "valid": valid,
            "results": {
                "code": code_validation,
                "schema": schema_validation,
                "security": security_validation,
                "doctrine": doctrine_validation,
            },
        }

    def generate_full_report(self) -> Dict[str, Any]:
        analysis = self.analyze_system()
        history = retrieve_snapshot(20)
        upgrades = list_upgrade_logs(20)
        rejected = list_rejections(20)
        return {
            "ok": True,
            "analysis": analysis.get("report", {}),
            "history": history,
            "upgrades": upgrades,
            "rejections": rejected,
            "contract": {
                "human_confirmation_required": True,
                "auto_overwrite_disabled": True,
                "auto_deploy_disabled": True,
            },
        }

    def analyze_zip(self, zip_path: str) -> Dict[str, Any]:
        scanner = TwinScanner(self.root)
        return scanner.analyze_zip_project(zip_path)
