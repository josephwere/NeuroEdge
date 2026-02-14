package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type game_developer_agent struct {
EventBus *types.EventBus
}

func Newgame_developer_agent(bus *types.EventBus) *game_developer_agent {
return &game_developer_agent{
EventBus: bus,
}
}

func (a *game_developer_agent) Start() {
fmt.Println("?? game_developer_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("game_developer_agent:update", func(event types.Event) {
fmt.Println("[game_developer_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *game_developer_agent) Stop() {
fmt.Println("?? game_developer_agent stopped")
}

func (a *game_developer_agent) Name() string {
return "game_developer_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *game_developer_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[game_developer_agent] Handling event data:", data)
}
