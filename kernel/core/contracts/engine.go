package contracts

// Engine defines the contract every NeuroEdge engine must implement
type Engine interface {
	// Name returns the unique name of the engine
	Name() string

	// Init prepares the engine with necessary dependencies
	Init() error

	// Start launches the engine's processes
	Start() error

	// Stop gracefully shuts down the engine
	Stop() error
}
