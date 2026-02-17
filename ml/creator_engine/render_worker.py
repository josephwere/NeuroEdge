from typing import Any, Callable, Dict
from .job_queue import CreatorJobQueue


class RenderWorker:
    def __init__(self) -> None:
        self.queue = CreatorJobQueue()

    def enqueue(self, kind: str, payload: Dict[str, Any], handler: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
        return self.queue.submit(kind, payload, handler)

    def status(self, job_id: str):
        return self.queue.get(job_id)

