package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type manufacturing_agent struct {
EventBus *types.EventBus
}

func Newmanufacturing_agent(bus *types.EventBus) *manufacturing_agent {
return &manufacturing_agent{
EventBus: bus,
}
}

func (a *manufacturing_agent) Start() {
fmt.Println("?? manufacturing_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("manufacturing_agent:update", func(event types.Event) {
fmt.Println("[manufacturing_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *manufacturing_agent) Stop() {
fmt.Println("?? manufacturing_agent stopped")
}

func (a *manufacturing_agent) Name() string {
return "manufacturing_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *manufacturing_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[manufacturing_agent] Handling event data:", data)
}
