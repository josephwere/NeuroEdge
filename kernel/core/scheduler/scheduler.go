package scheduler

import (
    "fmt"
    "time"
    "neuroedge/kernel/events"
)

type Scheduler struct {
    EventBus *events.EventBus
}

func NewScheduler(bus *events.EventBus) *Scheduler {
    return &Scheduler{
        EventBus: bus,
    }
}

// ScheduleRecurring runs a function every n seconds
func (s *Scheduler) ScheduleRecurring(name string, task func(), intervalSeconds int) {
    go func() {
        ticker := time.NewTicker(time.Duration(intervalSeconds) * time.Second)
        defer ticker.Stop()
        for {
            select {
            case <-ticker.C:
                fmt.Printf("⏱ Running scheduled task: %s\n", name)
                task()
                // ✅ Correct map type
                s.EventBus.Publish(name, map[string]interface{}{"status": "ok"})
            }
        }
    }()
}
