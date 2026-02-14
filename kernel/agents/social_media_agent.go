package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type social_media_agent struct {
EventBus *types.EventBus
}

func Newsocial_media_agent(bus *types.EventBus) *social_media_agent {
return &social_media_agent{
EventBus: bus,
}
}

func (a *social_media_agent) Start() {
fmt.Println("?? social_media_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("social_media_agent:update", func(event types.Event) {
fmt.Println("[social_media_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *social_media_agent) Stop() {
fmt.Println("?? social_media_agent stopped")
}

func (a *social_media_agent) Name() string {
return "social_media_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *social_media_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[social_media_agent] Handling event data:", data)
}
