//kernel/agents/basic_agents.go
package agents

import "neuroedge/kernel/types"

// ---- Base agent ----

type baseAgent struct {
	name string
	bus  *types.EventBus
}

func (a *baseAgent) Name() string { return a.name }
func (a *baseAgent) Start()       {}
func (a *baseAgent) Stop()        {}
func (a *baseAgent) Learn()       {}

func (a *baseAgent) EvaluatePerformance() bool {
	return true // placeholder
}

// ---- Concrete agents ----

type PlanningAgent struct{ baseAgent }
type SecurityAgent struct{ baseAgent }
type TaskAgent struct{ baseAgent }
type PolicyEthicsAgent struct{ baseAgent }
type GlobalMeshAgent struct{ baseAgent }
type ReasoningAgent struct{ baseAgent }

// ---- Constructors ----

func NewPlanningAgent(bus *types.EventBus) Agent {
	return &PlanningAgent{baseAgent{name: "PlanningAgent", bus: bus}}
}

func NewSecurityAgent(bus *types.EventBus) Agent {
	return &SecurityAgent{baseAgent{name: "SecurityAgent", bus: bus}}
}

func NewTaskAgent(bus *types.EventBus) Agent {
	return &TaskAgent{baseAgent{name: "TaskAgent", bus: bus}}
}

func NewPolicyEthicsAgent(bus *types.EventBus) Agent {
	return &PolicyEthicsAgent{baseAgent{name: "PolicyEthicsAgent", bus: bus}}
}

func NewGlobalMeshAgent(bus *types.EventBus) Agent {
	return &GlobalMeshAgent{baseAgent{name: "GlobalMeshAgent", bus: bus}}
}

func NewReasoningAgent(bus *types.EventBus) Agent {
	return &ReasoningAgent{baseAgent{name: "ReasoningAgent", bus: bus}}
}
