package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type security_agent struct {
EventBus *types.EventBus
}

func Newsecurity_agent(bus *types.EventBus) *security_agent {
return &security_agent{
EventBus: bus,
}
}

func (a *security_agent) Start() {
fmt.Println("?? security_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("security_agent:update", func(event types.Event) {
fmt.Println("[security_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *security_agent) Stop() {
fmt.Println("?? security_agent stopped")
}

func (a *security_agent) Name() string {
return "security_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *security_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[security_agent] Handling event data:", data)
}
