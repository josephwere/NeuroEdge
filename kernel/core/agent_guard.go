package core

import (
	"fmt"

	"neuroedge/kernel/core/cognition"
	"neuroedge/kernel/core/ethics"
)

// PreExecutionCheck ensures task is safe
func PreExecutionCheck(agentName string, task string) bool {
	fmt.Printf("[AgentGuard] Checking task for agent %s: %s\n", agentName, task)
	eth := ethics.NewEthics()
	if !eth.Evaluate(task) {
		fmt.Printf("[AgentGuard] Ethics blocked task for %s\n", agentName)
		return false
	}
	cog := cognition.NewCognition()
	decision := cog.Decide(task, map[string]interface{}{})
	if decision != "approved" {
		fmt.Printf("[AgentGuard] Cognition decision=%s for %s\n", decision, agentName)
		return false
	}
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
