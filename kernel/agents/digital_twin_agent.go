package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type digital_twin_agent struct {
EventBus *types.EventBus
}

func Newdigital_twin_agent(bus *types.EventBus) *digital_twin_agent {
return &digital_twin_agent{
EventBus: bus,
}
}

func (a *digital_twin_agent) Start() {
fmt.Println("?? digital_twin_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("digital_twin_agent:update", func(event types.Event) {
fmt.Println("[digital_twin_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *digital_twin_agent) Stop() {
fmt.Println("?? digital_twin_agent stopped")
}

func (a *digital_twin_agent) Name() string {
return "digital_twin_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *digital_twin_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[digital_twin_agent] Handling event data:", data)
}
