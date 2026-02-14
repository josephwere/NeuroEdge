package core

import (
	"fmt"
)

// PreExecutionCheck ensures task is safe
func PreExecutionCheck(agentName string, task string) bool {
	fmt.Printf("[AgentGuard] Checking task for agent %s: %s\n", agentName, task)
	// TODO: integrate SecurityAgent & PolicyEthicsAgent
	// Return false if any violation detected
	return true
}

// ExecuteWithGuard wraps agent execution
func ExecuteWithGuard(agentName string, task string, fn func(string)) {
	if PreExecutionCheck(agentName, task) {
		fn(task)
	} else {
		fmt.Printf("[AgentGuard] Task blocked for agent %s: %s\n", agentName, task)
	}
}
