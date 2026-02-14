package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type app_builder_agent struct {
EventBus *types.EventBus
}

func Newapp_builder_agent(bus *types.EventBus) *app_builder_agent {
return &app_builder_agent{
EventBus: bus,
}
}

func (a *app_builder_agent) Start() {
fmt.Println("?? app_builder_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("app_builder_agent:update", func(event types.Event) {
fmt.Println("[app_builder_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *app_builder_agent) Stop() {
fmt.Println("?? app_builder_agent stopped")
}

func (a *app_builder_agent) Name() string {
return "app_builder_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *app_builder_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[app_builder_agent] Handling event data:", data)
}
