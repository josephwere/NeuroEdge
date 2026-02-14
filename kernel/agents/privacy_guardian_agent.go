package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type privacy_guardian_agent struct {
EventBus *types.EventBus
}

func Newprivacy_guardian_agent(bus *types.EventBus) *privacy_guardian_agent {
return &privacy_guardian_agent{
EventBus: bus,
}
}

func (a *privacy_guardian_agent) Start() {
fmt.Println("?? privacy_guardian_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("privacy_guardian_agent:update", func(event types.Event) {
fmt.Println("[privacy_guardian_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *privacy_guardian_agent) Stop() {
fmt.Println("?? privacy_guardian_agent stopped")
}

func (a *privacy_guardian_agent) Name() string {
return "privacy_guardian_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *privacy_guardian_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[privacy_guardian_agent] Handling event data:", data)
}
