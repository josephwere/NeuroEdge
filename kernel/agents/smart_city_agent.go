package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type smart_city_agent struct {
EventBus *types.EventBus
}

func Newsmart_city_agent(bus *types.EventBus) *smart_city_agent {
return &smart_city_agent{
EventBus: bus,
}
}

func (a *smart_city_agent) Start() {
fmt.Println("?? smart_city_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("smart_city_agent:update", func(event types.Event) {
fmt.Println("[smart_city_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *smart_city_agent) Stop() {
fmt.Println("?? smart_city_agent stopped")
}

func (a *smart_city_agent) Name() string {
return "smart_city_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *smart_city_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[smart_city_agent] Handling event data:", data)
}
