//kernel/swarm/swarm_manager.go
package swarm

import (
	"neuroedge/kernel/swarm/agent_factory"
	"neuroedge/kernel/swarm/coordinator"
)

type SwarmManager struct {
	Coordinator *coordinator.SwarmCoordinator
	Factory     *agent_factory.AgentFactory
}

func NewSwarmManager() *SwarmManager {
	return &SwarmManager{
		Coordinator: coordinator.NewSwarmCoordinator(),
		Factory:     agent_factory.NewAgentFactory(),
	}
}

func (s *SwarmManager) Start() {
	s.Coordinator.Start()
}
