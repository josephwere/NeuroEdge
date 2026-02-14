package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type policy_ethics_agent struct {
EventBus *types.EventBus
}

func Newpolicy_ethics_agent(bus *types.EventBus) *policy_ethics_agent {
return &policy_ethics_agent{
EventBus: bus,
}
}

func (a *policy_ethics_agent) Start() {
fmt.Println("?? policy_ethics_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("policy_ethics_agent:update", func(event types.Event) {
fmt.Println("[policy_ethics_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *policy_ethics_agent) Stop() {
fmt.Println("?? policy_ethics_agent stopped")
}

func (a *policy_ethics_agent) Name() string {
return "policy_ethics_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *policy_ethics_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[policy_ethics_agent] Handling event data:", data)
}
