package agents

// Agent is the base interface for all NeuroEdge agents
type Agent interface {
	Name() string
	Start()
	Stop()

	EvaluatePerformance() bool
	Learn()
}
