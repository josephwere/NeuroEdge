package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type voting_agent struct {
EventBus *types.EventBus
}

func Newvoting_agent(bus *types.EventBus) *voting_agent {
return &voting_agent{
EventBus: bus,
}
}

func (a *voting_agent) Start() {
fmt.Println("?? voting_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("voting_agent:update", func(event types.Event) {
fmt.Println("[voting_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *voting_agent) Stop() {
fmt.Println("?? voting_agent stopped")
}

func (a *voting_agent) Name() string {
return "voting_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *voting_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[voting_agent] Handling event data:", data)
}
