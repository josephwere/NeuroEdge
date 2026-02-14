package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type therapist_agent struct {
EventBus *types.EventBus
}

func Newtherapist_agent(bus *types.EventBus) *therapist_agent {
return &therapist_agent{
EventBus: bus,
}
}

func (a *therapist_agent) Start() {
fmt.Println("?? therapist_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("therapist_agent:update", func(event types.Event) {
fmt.Println("[therapist_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *therapist_agent) Stop() {
fmt.Println("?? therapist_agent stopped")
}

func (a *therapist_agent) Name() string {
return "therapist_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *therapist_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[therapist_agent] Handling event data:", data)
}
