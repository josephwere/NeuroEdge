package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type news_intelligence_agent struct {
EventBus *types.EventBus
}

func Newnews_intelligence_agent(bus *types.EventBus) *news_intelligence_agent {
return &news_intelligence_agent{
EventBus: bus,
}
}

func (a *news_intelligence_agent) Start() {
fmt.Println("?? news_intelligence_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("news_intelligence_agent:update", func(event types.Event) {
fmt.Println("[news_intelligence_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *news_intelligence_agent) Stop() {
fmt.Println("?? news_intelligence_agent stopped")
}

func (a *news_intelligence_agent) Name() string {
return "news_intelligence_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *news_intelligence_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[news_intelligence_agent] Handling event data:", data)
}
