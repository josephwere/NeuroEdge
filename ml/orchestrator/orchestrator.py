from ml.orchestrator.engine_proxy import EngineProxy
from ml.orchestrator.task_queue import TaskQueue
from PIL import Image
import numpy as np

class NeuroEdgeOrchestrator:
    """
    Core Python orchestrator for NeuroEdge.
    """

    def __init__(self):
        self.engines = {}
        self.queue = TaskQueue()

    def register_engine(self, engine: EngineProxy):
        self.engines[engine.name] = engine
        engine.load()
        print(f"🧩 Engine registered: {engine.name}")

    def submit_task(self, engine_name: str, input_data):
        if engine_name not in self.engines:
            raise ValueError(f"Engine {engine_name} not registered")
        engine = self.engines[engine_name]
        self.queue.add_task(engine.run, input_data)

    def run_all(self):
        self.queue.run()
