// kernel/core/python_client.go
package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	pb "neuroedge/kernel/ml/orchestrator/generated"
)

// PythonClient implements pb.OrchestratorClient
type PythonClient struct {
	conn       *grpc.ClientConn
	httpClient *http.Client
	address    string
}

// NewPythonClient connects to the Python orchestrator service
func NewPythonClient(address string) (*PythonClient, error) {
	pc := &PythonClient{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		address:    strings.TrimSpace(address),
	}
	if strings.HasPrefix(pc.address, "http://") || strings.HasPrefix(pc.address, "https://") {
		return pc, nil
	}
	conn, err := grpc.Dial(address, grpc.WithInsecure(), grpc.WithBlock())
	if err == nil {
		pc.conn = conn
		return pc, nil
	}
	// Graceful fallback to local HTTP ML service path when gRPC endpoint is unavailable.
	pc.address = "http://localhost:8090"
	return &PythonClient{
		conn:       conn,
		httpClient: &http.Client{Timeout: 12 * time.Second},
		address:    pc.address,
	}, nil
}

// SubmitTask implements pb.OrchestratorClient interface
func (pc *PythonClient) SubmitTask(ctx context.Context, req *pb.TaskRequest) (*pb.TaskResponse, error) {
	if req == nil {
		return nil, errors.New("nil task request")
	}
	base := strings.TrimRight(pc.address, "/")
	url := fmt.Sprintf("%s/infer", base)
	payload := map[string]interface{}{
		"text": req.InputData,
		"payload": map[string]interface{}{
			"engine": req.EngineName,
			"taskId": req.TaskId,
		},
	}
	body, _ := json.Marshal(payload)
	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	httpReq.Header.Set("Content-Type", "application/json")
	httpResp, err := pc.httpClient.Do(httpReq)
	if err != nil {
		return &pb.TaskResponse{
			TaskId:     req.TaskId,
			Status:     "failed",
			OutputData: fmt.Sprintf(`{"error":"%s"}`, err.Error()),
		}, nil
	}
	defer httpResp.Body.Close()
	respBody, _ := io.ReadAll(httpResp.Body)
	status := "success"
	if httpResp.StatusCode >= 400 {
		status = "failed"
	}
	return &pb.TaskResponse{
		TaskId:     req.TaskId,
		Status:     status,
		OutputData: string(respBody),
	}, nil
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
	if pc.conn != nil {
		pc.conn.Close()
	}
}
