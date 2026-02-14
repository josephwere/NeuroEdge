package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type memory_agent struct {
EventBus *types.EventBus
}

func Newmemory_agent(bus *types.EventBus) *memory_agent {
return &memory_agent{
EventBus: bus,
}
}

func (a *memory_agent) Start() {
fmt.Println("?? memory_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("memory_agent:update", func(event types.Event) {
fmt.Println("[memory_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *memory_agent) Stop() {
fmt.Println("?? memory_agent stopped")
}

func (a *memory_agent) Name() string {
return "memory_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *memory_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[memory_agent] Handling event data:", data)
}
