package config

// KernelConfig holds kernel-level configuration
type KernelConfig struct {
	Name            string
	Version         string
	SelfLearnPeriod int // seconds
}
