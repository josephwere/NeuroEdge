package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type government_agent struct {
EventBus *types.EventBus
}

func Newgovernment_agent(bus *types.EventBus) *government_agent {
return &government_agent{
EventBus: bus,
}
}

func (a *government_agent) Start() {
fmt.Println("?? government_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("government_agent:update", func(event types.Event) {
fmt.Println("[government_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *government_agent) Stop() {
fmt.Println("?? government_agent stopped")
}

func (a *government_agent) Name() string {
return "government_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *government_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[government_agent] Handling event data:", data)
}
