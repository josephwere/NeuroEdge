package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type productivity_agent struct {
EventBus *types.EventBus
}

func Newproductivity_agent(bus *types.EventBus) *productivity_agent {
return &productivity_agent{
EventBus: bus,
}
}

func (a *productivity_agent) Start() {
fmt.Println("?? productivity_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("productivity_agent:update", func(event types.Event) {
fmt.Println("[productivity_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *productivity_agent) Stop() {
fmt.Println("?? productivity_agent stopped")
}

func (a *productivity_agent) Name() string {
return "productivity_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *productivity_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[productivity_agent] Handling event data:", data)
}
