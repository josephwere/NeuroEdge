# ml/orchestrator/orchestrator_event_client.py
import json
import websocket

class EventBusClient:
    def __init__(self, url="ws://localhost:8080"):
        self.ws = websocket.create_connection(url)

    def emit(self, event_name: str, payload: dict):
        message = json.dumps({"event": event_name, "payload": payload})
        self.ws.send(message)

    def listen(self, callback):
        while True:
            msg = self.ws.recv()
            data = json.loads(msg)
            callback(data["event"], data["payload"])
