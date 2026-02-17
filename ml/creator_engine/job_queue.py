import queue
import threading
import time
from typing import Any, Callable, Dict, Optional
from .storage import JOBS_DIR, append_history, ensure_dirs, new_id, read_json, write_json
import os


class CreatorJobQueue:
    def __init__(self) -> None:
        ensure_dirs()
        self._q: "queue.Queue[Dict[str, Any]]" = queue.Queue()
        self._started = False
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            t = threading.Thread(target=self._worker, daemon=True)
            t.start()
            self._started = True

    def submit(self, kind: str, payload: Dict[str, Any], handler: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
        self.start()
        job_id = new_id("creator_job")
        job = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "progress": 0,
            "created_at": int(time.time()),
            "started_at": 0,
            "finished_at": 0,
            "error": "",
            "payload": payload,
            "result": {},
        }
        self._save_job(job_id, job)
        self._q.put({"id": job_id, "handler": handler})
        append_history({"type": "creator.job.queued", "job_id": job_id, "kind": kind})
        return job

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._load_job(job_id)

    def _job_file(self, job_id: str) -> str:
        return os.path.join(JOBS_DIR, f"{job_id}.json")

    def _save_job(self, job_id: str, payload: Dict[str, Any]) -> None:
        write_json(self._job_file(job_id), payload)

    def _load_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        data = read_json(self._job_file(job_id), None)
        return data if isinstance(data, dict) else None

    def _worker(self) -> None:
        while True:
            item = self._q.get()
            job_id = str(item.get("id"))
            handler = item.get("handler")
            job = self._load_job(job_id) or {}
            try:
                job["status"] = "running"
                job["progress"] = 15
                job["started_at"] = int(time.time())
                self._save_job(job_id, job)
                if callable(handler):
                    result = handler(job.get("payload") or {})
                else:
                    result = {"ok": False, "error": "Invalid handler"}
                job["result"] = result
                job["status"] = "completed"
                job["progress"] = 100
                job["finished_at"] = int(time.time())
                self._save_job(job_id, job)
                append_history({"type": "creator.job.completed", "job_id": job_id, "kind": job.get("kind"), "result_keys": list((result or {}).keys())})
            except Exception as ex:
                job["status"] = "failed"
                job["error"] = str(ex)
                job["progress"] = 100
                job["finished_at"] = int(time.time())
                self._save_job(job_id, job)
                append_history({"type": "creator.job.failed", "job_id": job_id, "kind": job.get("kind"), "error": str(ex)})
            finally:
                self._q.task_done()

