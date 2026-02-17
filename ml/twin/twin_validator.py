import ast
import re
from typing import Any, Dict, List

from .twin_contract import check_contract


class TwinValidator:
    SECRET_PATTERNS = [r"AKIA[0-9A-Z]{16}", r"-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----", r"sk-[A-Za-z0-9]{20,}"]

    def validate_code(self, code: str, language: str = "python") -> Dict[str, Any]:
        issues: List[str] = []
        if language == "python":
            try:
                ast.parse(code)
            except SyntaxError as e:
                issues.append(f"python syntax error: {e}")

        for pat in self.SECRET_PATTERNS:
            if re.search(pat, code or ""):
                issues.append("potential secret leak detected")

        return {"valid": len(issues) == 0, "issues": issues}

    def validate_schema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        required = ["users", "chats", "system_logs"]
        missing = [k for k in required if k not in schema]
        return {"valid": len(missing) == 0, "missing": missing}

    def validate_security(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        serialized = str(proposal).lower()
        blocked = []
        for bad in ["disable auth", "bypass scope", "skip doctrine", "force deploy"]:
            if bad in serialized:
                blocked.append(bad)
        return {"valid": len(blocked) == 0, "blocked": blocked}

    def validate_doctrine(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        contract = check_contract(proposal)
        return {
            "valid": contract.get("allowed", False),
            "violations": contract.get("violations", []),
            "rules": contract.get("rules", []),
        }
