package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type offline_identity_agent struct {
EventBus *types.EventBus
}

func Newoffline_identity_agent(bus *types.EventBus) *offline_identity_agent {
return &offline_identity_agent{
EventBus: bus,
}
}

func (a *offline_identity_agent) Start() {
fmt.Println("?? offline_identity_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("offline_identity_agent:update", func(event types.Event) {
fmt.Println("[offline_identity_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *offline_identity_agent) Stop() {
fmt.Println("?? offline_identity_agent stopped")
}

func (a *offline_identity_agent) Name() string {
return "offline_identity_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *offline_identity_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[offline_identity_agent] Handling event data:", data)
}
