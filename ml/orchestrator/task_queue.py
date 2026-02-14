import asyncio
from typing import Callable, Any

class TaskQueue:
    """
    Async task queue for executing agents & engines.
    """
    def __init__(self):
        self.loop = asyncio.get_event_loop()
        self.tasks = []

    def add_task(self, coro: Callable[..., Any], *args, **kwargs):
        task = self.loop.create_task(coro(*args, **kwargs))
        self.tasks.append(task)

    def run(self):
        print("🚀 Starting Python orchestration task queue")
        self.loop.run_until_complete(asyncio.gather(*self.tasks))
        print("✅ All tasks completed")
