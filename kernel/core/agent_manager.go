//kernel/core/agent_manager.go
package core

import (
	"fmt"
	"neuroedge/kernel/agents"
	"neuroedge/kernel/events"
)

// AgentManager coordinates all agents
type AgentManager struct {
	agents   map[string]interface{}
	eventBus *events.EventBus
}

// NewAgentManager creates a new manager
func NewAgentManager() *AgentManager {
	return &AgentManager{
		agents:   make(map[string]interface{}),
		eventBus: events.NewEventBus(),
	}
}

// RegisterAgent adds an agent to the manager
func (m *AgentManager) RegisterAgent(name string, agent interface{}) {
	m.agents[name] = agent
	fmt.Printf("[AgentManager] Registered agent: %s\n", name)
}

// StartAllAgents initializes all agents
func (m *AgentManager) StartAllAgents() {
	for name, agent := range m.agents {
		fmt.Printf("[AgentManager] Starting agent: %s\n", name)
		switch a := agent.(type) {
		case *agents.PlanningAgent:
			a.Start()
		case *agents.SecurityAgent:
			a.Start()
		case *agents.TaskAgent:
			a.Start()
		case *agents.PolicyEthicsAgent:
			a.Start()
		// Add more agent types here as needed
		default:
			fmt.Printf("[AgentManager] Unknown agent type for %s\n", name)
		}
	}
}

// TriggerTask sends a task to the PlanningAgent
func (m *AgentManager) TriggerTask(task string) {
	fmt.Printf("[AgentManager] Triggering task: %s\n", task)
	m.eventBus.Publish("task:new", map[string]interface{}{"task": task})
}
