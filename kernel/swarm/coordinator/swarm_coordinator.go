package coordinator

import "fmt"

type SwarmCoordinator struct {
	ActiveAgents []string
}

func NewSwarmCoordinator() *SwarmCoordinator {
	return &SwarmCoordinator{
		ActiveAgents: []string{},
	}
}

func (s *SwarmCoordinator) RegisterAgent(agentID string) {
	s.ActiveAgents = append(s.ActiveAgents, agentID)
	fmt.Println("Agent joined swarm:", agentID)
}

func (s *SwarmCoordinator) Start() {
	fmt.Println("🧠 Swarm coordination online")
}
