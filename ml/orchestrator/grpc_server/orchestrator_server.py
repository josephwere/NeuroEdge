from concurrent import futures
import grpc
import json
import time

from ml.orchestrator import orchestrator
from generated import orchestrator_pb2, orchestrator_pb2_grpc

class OrchestratorServicer(orchestrator_pb2_grpc.OrchestratorServicer):
    def __init__(self, orchestrator_instance):
        self.orch = orchestrator_instance

    def SubmitTask(self, request, context):
        engine_name = request.engine_name
        task_id = request.task_id
        input_data = json.loads(request.input_data)

        try:
            # Run task synchronously in Python orchestrator
            result = self.orch.engines[engine_name].run(input_data)
            response = orchestrator_pb2.TaskResponse(
                task_id=task_id,
                output_data=json.dumps(result),
                status="success"
            )
        except Exception as e:
            response = orchestrator_pb2.TaskResponse(
                task_id=task_id,
                output_data=json.dumps({"error": str(e)}),
                status="error"
            )
        return response

def serve():
    orch_instance = orchestrator.NeuroEdgeOrchestrator()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    orchestrator_pb2_grpc.add_OrchestratorServicer_to_server(
        OrchestratorServicer(orch_instance), server
    )
    server.add_insecure_port('[::]:50051')
    print("🚀 Python Orchestrator gRPC Server running on port 50051")
    server.start()
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == "__main__":
    serve()
