package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type wdc_wallet_agent struct {
EventBus *types.EventBus
}

func Newwdc_wallet_agent(bus *types.EventBus) *wdc_wallet_agent {
return &wdc_wallet_agent{
EventBus: bus,
}
}

func (a *wdc_wallet_agent) Start() {
fmt.Println("?? wdc_wallet_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("wdc_wallet_agent:update", func(event types.Event) {
fmt.Println("[wdc_wallet_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *wdc_wallet_agent) Stop() {
fmt.Println("?? wdc_wallet_agent stopped")
}

func (a *wdc_wallet_agent) Name() string {
return "wdc_wallet_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *wdc_wallet_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[wdc_wallet_agent] Handling event data:", data)
}
