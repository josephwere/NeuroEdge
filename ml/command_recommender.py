from ml_core import MLReasoner
from log_analyzer import LogAnalyzer

class CommandRecommender:
    def __init__(self):
        self.ml = MLReasoner()
        self.analyzer = LogAnalyzer()

    def generate_proposal(self, logs: str) -> dict:
        analysis = self.analyzer.parse_logs(logs)
        proposal = self.ml.propose_command(analysis)
        return proposal
