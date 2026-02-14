package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type climate_agent struct {
EventBus *types.EventBus
}

func Newclimate_agent(bus *types.EventBus) *climate_agent {
return &climate_agent{
EventBus: bus,
}
}

func (a *climate_agent) Start() {
fmt.Println("?? climate_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("climate_agent:update", func(event types.Event) {
fmt.Println("[climate_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *climate_agent) Stop() {
fmt.Println("?? climate_agent stopped")
}

func (a *climate_agent) Name() string {
return "climate_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *climate_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[climate_agent] Handling event data:", data)
}
