package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type health_monitoring_agent struct {
EventBus *types.EventBus
}

func Newhealth_monitoring_agent(bus *types.EventBus) *health_monitoring_agent {
return &health_monitoring_agent{
EventBus: bus,
}
}

func (a *health_monitoring_agent) Start() {
fmt.Println("?? health_monitoring_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("health_monitoring_agent:update", func(event types.Event) {
fmt.Println("[health_monitoring_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *health_monitoring_agent) Stop() {
fmt.Println("?? health_monitoring_agent stopped")
}

func (a *health_monitoring_agent) Name() string {
return "health_monitoring_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *health_monitoring_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[health_monitoring_agent] Handling event data:", data)
}
