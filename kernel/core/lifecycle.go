package core

import (
	"fmt"
	"log"
	"sync"
	"time"

	"neuroedge/kernel/core/contracts"
)

// LifecycleController manages the kernel boot, shutdown, and restart
type LifecycleController struct {
	components []contracts.Lifecycle
	mu         sync.Mutex
	running    bool
}

// NewLifecycleController creates a new lifecycle controller
func NewLifecycleController() *LifecycleController {
	return &LifecycleController{
		components: make([]contracts.Lifecycle, 0),
		running:    false,
	}
}

// RegisterComponent adds a component implementing Lifecycle to the controller
func (lc *LifecycleController) RegisterComponent(c contracts.Lifecycle) {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	lc.components = append(lc.components, c)
}

// Boot starts all registered components in order
func (lc *LifecycleController) Boot() error {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	fmt.Println("🚀 Kernel Boot Sequence Initiated")
	for _, comp := range lc.components {
		if err := comp.Boot(); err != nil {
			log.Printf("⚠️ Failed to boot component: %v\n", err)
			// Attempt recovery if boot fails
			if recErr := lc.RecoverComponent(comp); recErr != nil {
				return fmt.Errorf("component recovery failed: %v", recErr)
			}
		}
	}
	lc.running = true
	fmt.Println("✅ Kernel Boot Completed")
	return nil
}

// Shutdown gracefully stops all components in reverse order
func (lc *LifecycleController) Shutdown() error {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	fmt.Println("🛑 Kernel Shutdown Initiated")
	for i := len(lc.components) - 1; i >= 0; i-- {
		if err := lc.components[i].Shutdown(); err != nil {
			log.Printf("⚠️ Failed to shutdown component: %v\n", err)
		}
	}
	lc.running = false
	fmt.Println("✅ Kernel Shutdown Completed")
	return nil
}

// Restart performs a controlled shutdown and boot
func (lc *LifecycleController) Restart() error {
	fmt.Println("🔄 Kernel Restart Initiated")
	if err := lc.Shutdown(); err != nil {
		return fmt.Errorf("shutdown failed: %v", err)
	}
	time.Sleep(2 * time.Second) // brief pause before boot
	if err := lc.Boot(); err != nil {
		return fmt.Errorf("boot failed: %v", err)
	}
	fmt.Println("✅ Kernel Restart Completed")
	return nil
}

// HealthCheck runs health checks for all components
func (lc *LifecycleController) HealthCheck() error {
	fmt.Println("🩺 Running Kernel Health Check")
	for _, comp := range lc.components {
		if err := comp.HealthCheck(); err != nil {
			log.Printf("⚠️ Component health check failed: %v\n", err)
			return err
		}
	}
	fmt.Println("✅ Kernel Health Check Passed")
	return nil
}

// RecoverComponent attempts to restart a single failed component
func (lc *LifecycleController) RecoverComponent(comp contracts.Lifecycle) error {
	fmt.Printf("🔧 Attempting recovery for component: %T\n", comp)
	if err := comp.Shutdown(); err != nil {
		log.Printf("⚠️ Recovery shutdown failed: %v\n", err)
	}
	time.Sleep(1 * time.Second)
	if err := comp.Boot(); err != nil {
		return fmt.Errorf("recovery boot failed: %v", err)
	}
	fmt.Printf("✅ Component %T recovered successfully\n", comp)
	return nil
}
