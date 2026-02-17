package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroComputeOptimizer struct {
	EventBus *types.EventBus
}

func NewNeuroComputeOptimizer(bus *types.EventBus) *NeuroComputeOptimizer {
	return &NeuroComputeOptimizer{
		EventBus: bus,
	}
}

func (n *NeuroComputeOptimizer) Start() {
	fmt.Println("🚀 NeuroComputeOptimizer started")

	n.EventBus.Subscribe("compute:optimize", func(evt types.Event) {
		fmt.Println("[NeuroComputeOptimizer] Optimization Event:", evt.Data)
		n.OptimizeCompute(evt.Data)
	})
}

func (n *NeuroComputeOptimizer) Stop() {
	fmt.Println("🛑 NeuroComputeOptimizer stopped")
}

func (n *NeuroComputeOptimizer) Name() string {
	return "NeuroComputeOptimizer"
}

func (n *NeuroComputeOptimizer) OptimizeCompute(data interface{}) {
	fmt.Println("[NeuroComputeOptimizer] Running compute optimization...")
	recommendation := map[string]interface{}{
		"action":          "none",
		"priority":        "low",
		"reason":          "insufficient metrics",
		"scale_factor":    1.0,
		"target_queue_ms": 200,
	}
	if metrics, ok := data.(map[string]interface{}); ok {
		cpu, _ := metrics["cpu_load"].(float64)
		queue, _ := metrics["queue_ms"].(float64)
		mem, _ := metrics["memory_load"].(float64)
		if cpu > 0.85 || queue > 800 {
			recommendation["action"] = "scale_up"
			recommendation["priority"] = "high"
			recommendation["reason"] = "high cpu/queue pressure"
			recommendation["scale_factor"] = 1.5
		} else if cpu < 0.2 && mem < 0.4 && queue < 100 {
			recommendation["action"] = "scale_down"
			recommendation["priority"] = "medium"
			recommendation["reason"] = "sustained under-utilization"
			recommendation["scale_factor"] = 0.8
		} else {
			recommendation["action"] = "rebalance"
			recommendation["priority"] = "medium"
			recommendation["reason"] = "maintain throughput with balanced load"
		}
	}
	fmt.Println("[NeuroComputeOptimizer] Optimization complete:", recommendation)
	if n.EventBus != nil {
		n.EventBus.Publish(types.Event{
			Name:   "compute:optimized",
			Data:   recommendation,
			Source: n.Name(),
		})
	}
}
