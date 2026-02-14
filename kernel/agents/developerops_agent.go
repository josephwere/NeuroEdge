package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type developerops_agent struct {
EventBus *types.EventBus
}

func Newdeveloperops_agent(bus *types.EventBus) *developerops_agent {
return &developerops_agent{
EventBus: bus,
}
}

func (a *developerops_agent) Start() {
fmt.Println("?? developerops_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("developerops_agent:update", func(event types.Event) {
fmt.Println("[developerops_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *developerops_agent) Stop() {
fmt.Println("?? developerops_agent stopped")
}

func (a *developerops_agent) Name() string {
return "developerops_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *developerops_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[developerops_agent] Handling event data:", data)
}
