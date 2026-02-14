package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type api_generator_agent struct {
EventBus *types.EventBus
}

func Newapi_generator_agent(bus *types.EventBus) *api_generator_agent {
return &api_generator_agent{
EventBus: bus,
}
}

func (a *api_generator_agent) Start() {
fmt.Println("?? api_generator_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("api_generator_agent:update", func(event types.Event) {
fmt.Println("[api_generator_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *api_generator_agent) Stop() {
fmt.Println("?? api_generator_agent stopped")
}

func (a *api_generator_agent) Name() string {
return "api_generator_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *api_generator_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[api_generator_agent] Handling event data:", data)
}
