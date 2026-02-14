package contracts

// Agent defines the contract every NeuroEdge agent must implement
type Agent interface {
	// Name returns the unique name of the agent
	Name() string

	// Start launches the agent's main loop or routine
	Start() error

	// Stop gracefully shuts down the agent
	Stop() error

	// HandleEvent processes events published to the agent
	HandleEvent(event string, payload interface{}) error
}
