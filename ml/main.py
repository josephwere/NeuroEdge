import asyncio
import json
import websockets

from command_recommender import CommandRecommender
from mesh_integration import MeshIntegration

recommender = CommandRecommender()
mesh = MeshIntegration(nodes=["node1.local", "node2.local"])

async def handler(websocket, path):
    async for message in websocket:
        msg = json.loads(message)
        if msg["type"] == "ml:request":
            logs_or_task = msg["payload"]
            proposal = recommender.generate_proposal(logs_or_task)
            remote = mesh.suggest_remote_execution(proposal["command"])
            payload = {
                "proposal": proposal,
                "remote": remote
            }
            await websocket.send(json.dumps({"type": "ml:proposal", "payload": payload}))

start_server = websockets.serve(handler, "localhost", 8765)

print("🧠 ML Orchestrator WebSocket running at ws://localhost:8765")
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
