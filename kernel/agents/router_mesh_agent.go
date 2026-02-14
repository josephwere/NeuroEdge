package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type router_mesh_agent struct {
EventBus *types.EventBus
}

func Newrouter_mesh_agent(bus *types.EventBus) *router_mesh_agent {
return &router_mesh_agent{
EventBus: bus,
}
}

func (a *router_mesh_agent) Start() {
fmt.Println("?? router_mesh_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("router_mesh_agent:update", func(event types.Event) {
fmt.Println("[router_mesh_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *router_mesh_agent) Stop() {
fmt.Println("?? router_mesh_agent stopped")
}

func (a *router_mesh_agent) Name() string {
return "router_mesh_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *router_mesh_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[router_mesh_agent] Handling event data:", data)
}
