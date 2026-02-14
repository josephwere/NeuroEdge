package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type job_recruiter_agent struct {
EventBus *types.EventBus
}

func Newjob_recruiter_agent(bus *types.EventBus) *job_recruiter_agent {
return &job_recruiter_agent{
EventBus: bus,
}
}

func (a *job_recruiter_agent) Start() {
fmt.Println("?? job_recruiter_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("job_recruiter_agent:update", func(event types.Event) {
fmt.Println("[job_recruiter_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *job_recruiter_agent) Stop() {
fmt.Println("?? job_recruiter_agent stopped")
}

func (a *job_recruiter_agent) Name() string {
return "job_recruiter_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *job_recruiter_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[job_recruiter_agent] Handling event data:", data)
}
