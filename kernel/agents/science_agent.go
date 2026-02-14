package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type science_agent struct {
EventBus *types.EventBus
}

func Newscience_agent(bus *types.EventBus) *science_agent {
return &science_agent{
EventBus: bus,
}
}

func (a *science_agent) Start() {
fmt.Println("?? science_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("science_agent:update", func(event types.Event) {
fmt.Println("[science_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *science_agent) Stop() {
fmt.Println("?? science_agent stopped")
}

func (a *science_agent) Name() string {
return "science_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *science_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[science_agent] Handling event data:", data)
}
