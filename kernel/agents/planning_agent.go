package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type planning_agent struct {
EventBus *types.EventBus
}

func Newplanning_agent(bus *types.EventBus) *planning_agent {
return &planning_agent{
EventBus: bus,
}
}

func (a *planning_agent) Start() {
fmt.Println("?? planning_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("planning_agent:update", func(event types.Event) {
fmt.Println("[planning_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *planning_agent) Stop() {
fmt.Println("?? planning_agent stopped")
}

func (a *planning_agent) Name() string {
return "planning_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *planning_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[planning_agent] Handling event data:", data)
}
