package core

import (
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"neuroedge/kernel/contracts"
)

// HealthStatus represents the health state of a component
type HealthStatus struct {
	Name       string
	Healthy    bool
	LastCheck  time.Time
	LastError  error
	Additional string
}

// HealthManager monitors and checks the health of components
type HealthManager struct {
	components []contracts.HealthCheck
	statuses   map[string]*HealthStatus
	mu         sync.Mutex
	ticker     *time.Ticker
	stopChan   chan bool
}

// NewHealthManager creates a new health manager
func NewHealthManager() *HealthManager {
	return &HealthManager{
		components: make([]contracts.HealthCheck, 0),
		statuses:   make(map[string]*HealthStatus),
		ticker:     time.NewTicker(10 * time.Second),
		stopChan:   make(chan bool),
	}
}

// RegisterComponent adds a component for health monitoring
func (hm *HealthManager) RegisterComponent(c contracts.HealthCheck) {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	hm.components = append(hm.components, c)
	hm.statuses[c.Name()] = &HealthStatus{
		Name:      c.Name(),
		Healthy:   false,
		LastCheck: time.Now(),
	}
}

// StartMonitoring begins periodic health checks
func (hm *HealthManager) StartMonitoring() {
	fmt.Println("🩺 Health Monitoring Started")

	go func() {
		for {
			select {
			case <-hm.ticker.C:
				hm.runChecks()
			case <-hm.stopChan:
				fmt.Println("🛑 Health Monitoring Stopped")
				return
			}
		}
	}()
}

// StopMonitoring stops the periodic health checks
func (hm *HealthManager) StopMonitoring() {
	hm.stopChan <- true
	hm.ticker.Stop()
}

// StatusesSnapshot returns a thread-safe copy of all statuses
func (hm *HealthManager) StatusesSnapshot() map[string]*HealthStatus {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	copyMap := make(map[string]*HealthStatus)
	for k, v := range hm.statuses {
		tmp := *v
		copyMap[k] = &tmp
	}
	return copyMap
}

// Global instance for API
var GlobalHealthManager = NewHealthManager()

// runChecks performs health checks on all registered components
func (hm *HealthManager) runChecks() {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	for _, comp := range hm.components {
		func(c contracts.HealthCheck) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("⚠️ Panic recovered from component %s: %v", c.Name(), r)
					hm.statuses[c.Name()].Healthy = false
					hm.statuses[c.Name()].LastError = fmt.Errorf("panic: %v", r)
				}
			}()

			err := c.CheckHealth()
			status := hm.statuses[c.Name()]
			status.LastCheck = time.Now()

			if err != nil {
				status.Healthy = false
				status.LastError = err
				log.Printf("⚠️ Component %s unhealthy: %v", c.Name(), err)
			} else {
				status.Healthy = true
				status.LastError = nil
			}
		}(comp)
	}

	hm.printSummary()
}

// printSummary outputs a structured health report
func (hm *HealthManager) printSummary() {
	fmt.Println("📊 Kernel Health Summary:")

	for _, status := range hm.statuses {
		healthStr := "✅ Healthy"
		if !status.Healthy {
			healthStr = fmt.Sprintf("⚠️ Unhealthy (last error: %v)", status.LastError)
		}

		fmt.Printf(
			"[%s] %s (Last checked: %s)\n",
			status.Name,
			healthStr,
			status.LastCheck.Format(time.RFC3339),
		)
	}
}

// CheckKernelResources performs lightweight system-level diagnostics
func CheckKernelResources() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	fmt.Printf(
		"💾 Memory Usage: Alloc=%vKB TotalAlloc=%vKB Sys=%vKB NumGC=%v\n",
		m.Alloc/1024,
		m.TotalAlloc/1024,
		m.Sys/1024,
		m.NumGC,
	)
}
