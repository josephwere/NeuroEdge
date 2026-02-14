package contracts

// Lifecycle defines the contract for kernel lifecycle management
type Lifecycle interface {
	// Boot initializes all core systems in order
	Boot() error

	// Shutdown gracefully shuts down all components
	Shutdown() error

	// Restart performs a controlled restart of the kernel
	Restart() error

	// HealthCheck verifies the kernel and components are operational
	HealthCheck() error
}
