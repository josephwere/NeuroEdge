// kernel/ml/orchestrator/generated/client.go
package generated

import "context"

// OrchestratorClient defines the interface for submitting tasks
type OrchestratorClient interface {
	SubmitTask(ctx context.Context, req *TaskRequest) (*TaskResponse, error)
}
