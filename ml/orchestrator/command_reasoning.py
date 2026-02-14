# ml/orchestrator/command_reasoning.py
import uuid
from typing import Dict, Any, List
from ml.models import MLModel
from orchestrator_event_client import EventBusClient

class CommandProposal:
    def __init__(self, command: str, context: str, reason: str):
        self.id = str(uuid.uuid4())
        self.command = command
        self.context = context
        self.reason = reason

class MLExecutionReasoningLoop:
    def __init__(self, event_client: EventBusClient):
        self.model = MLModel.load("neuroedge-execution-model")
        self.event_client = event_client

    def propose_command(self, task_description: str, context: str) -> CommandProposal:
        """
        Generate a proposed command with reasoning from ML model
        """
        prediction = self.model.predict(task_description)
        reason = f"ML suggests running '{prediction}' because task='{task_description}'"
        return CommandProposal(command=prediction, context=context, reason=reason)

    def handle_task(self, task_description: str, context: str):
        proposal = self.propose_command(task_description, context)
        self.event_client.emit("ml:proposal", {
            "id": proposal.id,
            "command": proposal.command,
            "context": proposal.context,
            "reason": proposal.reason
        })
