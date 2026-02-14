package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type identity_agent struct {
EventBus *types.EventBus
}

func Newidentity_agent(bus *types.EventBus) *identity_agent {
return &identity_agent{
EventBus: bus,
}
}

func (a *identity_agent) Start() {
fmt.Println("?? identity_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("identity_agent:update", func(event types.Event) {
fmt.Println("[identity_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *identity_agent) Stop() {
fmt.Println("?? identity_agent stopped")
}

func (a *identity_agent) Name() string {
return "identity_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *identity_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[identity_agent] Handling event data:", data)
}
