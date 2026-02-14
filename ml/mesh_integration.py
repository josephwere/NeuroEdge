import requests
from typing import Dict, Any

class MeshIntegration:
    def __init__(self, nodes: list):
        self.nodes = nodes

    def suggest_remote_execution(self, command: str) -> Dict[str, Any]:
        """
        Decide if a command can be executed on remote nodes.
        """
        # Simple round-robin suggestion
        if not self.nodes:
            return {"node": None, "command": command}
        node = self.nodes[0]
        self.nodes = self.nodes[1:] + [node]  # rotate
        return {"node": node, "command": command}
