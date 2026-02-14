package types

import "time"

type KernelHealth struct {
	Component string    `json:"component"`
	Healthy   bool      `json:"healthy"`
	LastCheck time.Time `json:"last_check"`
	Error     string    `json:"error,omitempty"`
}

type KernelNode struct {
	ID        string `json:"id"`
	Role      string `json:"role"` // kernel | agent | engine
	Name      string `json:"name"`
}

type KernelCapabilities struct {
	Agents  []string `json:"agents"`
	Engines []string `json:"engines"`
}
