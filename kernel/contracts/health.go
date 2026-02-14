package contracts

// HealthCheck must be implemented by any component
// that wants to be monitored by the HealthManager
type HealthCheck interface {
	Name() string
	CheckHealth() error
}
