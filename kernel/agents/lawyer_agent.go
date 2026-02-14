package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type lawyer_agent struct {
EventBus *types.EventBus
}

func Newlawyer_agent(bus *types.EventBus) *lawyer_agent {
return &lawyer_agent{
EventBus: bus,
}
}

func (a *lawyer_agent) Start() {
fmt.Println("?? lawyer_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("lawyer_agent:update", func(event types.Event) {
fmt.Println("[lawyer_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *lawyer_agent) Stop() {
fmt.Println("?? lawyer_agent stopped")
}

func (a *lawyer_agent) Name() string {
return "lawyer_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *lawyer_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[lawyer_agent] Handling event data:", data)
}
