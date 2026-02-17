import uuid
from typing import Dict, Any

class MLReasoner:
    def __init__(self):
        self.context = {}

    def propose_command(self, description: str) -> Dict[str, Any]:
        """
        Generate a reasoned command proposal based on context.
        """
        command_id = str(uuid.uuid4())
        text = (description or "").lower()
        if "test" in text:
            command = "pnpm test -- --runInBand"
            reason = "Detected testing issue; run focused tests first."
        elif "build" in text or "compile" in text:
            command = "pnpm run build"
            reason = "Detected build/compile issue; verify build output."
        elif "go" in text and ("error" in text or "fail" in text):
            command = "go test ./..."
            reason = "Detected Go failure context; run Go tests for precise diagnostics."
        elif "python" in text and ("error" in text or "fail" in text):
            command = "python3 -m pytest"
            reason = "Detected Python failure context; run test suite for traceback."
        else:
            command = "pnpm run build && pnpm run lint"
            reason = "Default remediation pipeline for project health checks."
        return {
            "id": command_id,
            "command": command,
            "reason": reason
        }

    def update_context(self, logs: str):
        """
        Update ML internal context for better proposals
        """
        # Example: store last log snippet
        self.context["last_log"] = logs
