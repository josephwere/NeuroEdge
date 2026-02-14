// kernel/ml/orchestrator/generated/generated.go
package generated

// TaskRequest represents a task sent to orchestrator
type TaskRequest struct {
	EngineName string
	TaskId     string
	InputData  string
}

// TaskResponse represents orchestrator task response
type TaskResponse struct {
	TaskId     string
	Status     string
	OutputData string
}
