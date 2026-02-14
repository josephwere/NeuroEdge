package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type global_mesh_agent struct {
EventBus *types.EventBus
}

func Newglobal_mesh_agent(bus *types.EventBus) *global_mesh_agent {
return &global_mesh_agent{
EventBus: bus,
}
}

func (a *global_mesh_agent) Start() {
fmt.Println("?? global_mesh_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("global_mesh_agent:update", func(event types.Event) {
fmt.Println("[global_mesh_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *global_mesh_agent) Stop() {
fmt.Println("?? global_mesh_agent stopped")
}

func (a *global_mesh_agent) Name() string {
return "global_mesh_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *global_mesh_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[global_mesh_agent] Handling event data:", data)
}
