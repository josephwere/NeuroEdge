import queue
import threading
import time
import grpc
from concurrent import futures
import ml_models  # your internal models library
import proto.neuroedge_pb2 as pb2
import proto.neuroedge_pb2_grpc as pb2_grpc

# =========================
# Task Queue
# =========================
task_queue = queue.Queue()

# =========================
# Model Registry
# =========================
class ModelRegistry:
    def __init__(self):
        self.models = {}  # engine_name -> model instance

    def load_model(self, engine_name, model_path):
        model = ml_models.load(model_path)
        self.models[engine_name] = model
        print(f"✅ Loaded model for {engine_name}")

    def run(self, engine_name, input_data):
        model = self.models.get(engine_name)
        if not model:
            raise Exception(f"Model {engine_name} not loaded")
        return model.predict(input_data)

model_registry = ModelRegistry()

# =========================
# Worker Thread
# =========================
def worker():
    while True:
        task = task_queue.get()
        if task is None:
            break
        try:
            engine_name = task["engine"]
            task_id = task["id"]
            input_data = task["input"]
            print(f"🧠 Running task {task_id} on {engine_name}")
            result = model_registry.run(engine_name, input_data)
            print(f"✅ Task {task_id} completed: {result}")
            # TODO: send result back to Go kernel via gRPC callback
        except Exception as e:
            print(f"❌ Task {task_id} failed: {e}")
        finally:
            task_queue.task_done()

threading.Thread(target=worker, daemon=True).start()

# =========================
# gRPC Server
# =========================
class NeuroEdgeMLServicer(pb2_grpc.NeuroEdgeMLServicer):
    def SubmitTask(self, request, context):
        task = {
            "engine": request.engine,
            "id": request.task_id,
            "input": request.input_data,
        }
        task_queue.put(task)
        return pb2.TaskResponse(status="queued", task_id=request.task_id)

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_NeuroEdgeMLServicer_to_server(NeuroEdgeMLServicer(), server)
    server.add_insecure_port('[::]:50051')
    print("🚀 Python ML Orchestrator running on port 50051")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    # Example: Load default models
    model_registry.load_model("NeuroGPT", "models/neurogpt.pt")
    model_registry.load_model("NeuroVision", "models/neurovision.pt")
    serve()
