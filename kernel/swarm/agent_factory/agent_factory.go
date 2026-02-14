package agent_factory

import "fmt"

type AgentProfile struct {
	Type   string
	Goal   string
	Skills []string
}

type AgentFactory struct{}

func NewAgentFactory() *AgentFactory {
	return &AgentFactory{}
}

func (f *AgentFactory) CreateAgent(profile AgentProfile) string {
	id := "agent_" + profile.Type
	fmt.Println("Spawned agent:", id)
	return id
}
