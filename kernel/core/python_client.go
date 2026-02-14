// kernel/core/python_client.go
package core

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	pb "neuroedge/kernel/ml/orchestrator/generated"
	"google.golang.org/grpc"
)

// PythonClient implements pb.OrchestratorClient
type PythonClient struct {
	conn *grpc.ClientConn
}

// NewPythonClient connects to the Python orchestrator service
func NewPythonClient(address string) (*PythonClient, error) {
	conn, err := grpc.Dial(address, grpc.WithInsecure(), grpc.WithBlock())
	if err != nil {
		return nil, err
	}
	return &PythonClient{
		conn: conn,
	}, nil
}

// SubmitTask implements pb.OrchestratorClient interface
func (pc *PythonClient) SubmitTask(ctx context.Context, req *pb.TaskRequest) (*pb.TaskResponse, error) {
	// Simulate task execution (replace with actual gRPC call if needed)
	fmt.Printf("[PythonClient] Executing task: %s for engine: %s with input: %s\n",
		req.TaskId, req.EngineName, req.InputData)

	// Mock response
	resp := &pb.TaskResponse{
		TaskId:     req.TaskId,
		Status:     "success",
		OutputData: `{"result": "ok"}`,
	}
	return resp, nil
}

// SubmitTaskWithInput is a helper to call SubmitTask with raw input
func (pc *PythonClient) SubmitTaskWithInput(engineName, taskID string, input interface{}) {
	inputJSON, _ := json.Marshal(input)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &pb.TaskRequest{
		EngineName: engineName,
		TaskId:     taskID,
		InputData:  string(inputJSON),
	}

	resp, err := pc.SubmitTask(ctx, req)
	if err != nil {
		log.Printf("⚠️ Failed to submit task: %v", err)
		return
	}

	var output interface{}
	json.Unmarshal([]byte(resp.OutputData), &output)
	fmt.Printf("✅ Task %s completed with status %s, output: %+v\n", resp.TaskId, resp.Status, output)
}

// Close closes the gRPC connection
func (pc *PythonClient) Close() {
	pc.conn.Close()
}
