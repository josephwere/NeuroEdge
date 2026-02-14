package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type verification_officer_agent struct {
EventBus *types.EventBus
}

func Newverification_officer_agent(bus *types.EventBus) *verification_officer_agent {
return &verification_officer_agent{
EventBus: bus,
}
}

func (a *verification_officer_agent) Start() {
fmt.Println("?? verification_officer_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("verification_officer_agent:update", func(event types.Event) {
fmt.Println("[verification_officer_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *verification_officer_agent) Stop() {
fmt.Println("?? verification_officer_agent stopped")
}

func (a *verification_officer_agent) Name() string {
return "verification_officer_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *verification_officer_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[verification_officer_agent] Handling event data:", data)
}
