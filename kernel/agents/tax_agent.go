package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type tax_agent struct {
EventBus *types.EventBus
}

func Newtax_agent(bus *types.EventBus) *tax_agent {
return &tax_agent{
EventBus: bus,
}
}

func (a *tax_agent) Start() {
fmt.Println("?? tax_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("tax_agent:update", func(event types.Event) {
fmt.Println("[tax_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *tax_agent) Stop() {
fmt.Println("?? tax_agent stopped")
}

func (a *tax_agent) Name() string {
return "tax_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *tax_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[tax_agent] Handling event data:", data)
}
