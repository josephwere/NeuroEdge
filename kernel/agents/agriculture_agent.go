package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type agriculture_agent struct {
EventBus *types.EventBus
}

func Newagriculture_agent(bus *types.EventBus) *agriculture_agent {
return &agriculture_agent{
EventBus: bus,
}
}

func (a *agriculture_agent) Start() {
fmt.Println("?? agriculture_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("agriculture_agent:update", func(event types.Event) {
fmt.Println("[agriculture_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *agriculture_agent) Stop() {
fmt.Println("?? agriculture_agent stopped")
}

func (a *agriculture_agent) Name() string {
return "agriculture_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *agriculture_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[agriculture_agent] Handling event data:", data)
}
