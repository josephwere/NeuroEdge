package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type universal_translator_agent struct {
EventBus *types.EventBus
}

func Newuniversal_translator_agent(bus *types.EventBus) *universal_translator_agent {
return &universal_translator_agent{
EventBus: bus,
}
}

func (a *universal_translator_agent) Start() {
fmt.Println("?? universal_translator_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("universal_translator_agent:update", func(event types.Event) {
fmt.Println("[universal_translator_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *universal_translator_agent) Stop() {
fmt.Println("?? universal_translator_agent stopped")
}

func (a *universal_translator_agent) Name() string {
return "universal_translator_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *universal_translator_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[universal_translator_agent] Handling event data:", data)
}
