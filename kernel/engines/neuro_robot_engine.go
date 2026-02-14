package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroRobotEngine struct {
	EventBus *types.EventBus
}

func NewNeuroRobotEngine(bus *types.EventBus) *NeuroRobotEngine {
	return &NeuroRobotEngine{
		EventBus: bus,
	}
}

func (n *NeuroRobotEngine) Start() {
	fmt.Println("🚀 NeuroRobotEngine started")

	n.EventBus.Subscribe("robot:control", func(evt types.Event) {
		fmt.Println("[NeuroRobotEngine] Robot Control Event:", evt.Data)
		n.ControlRobot(evt.Data)
	})
}

func (n *NeuroRobotEngine) Stop() {
	fmt.Println("🛑 NeuroRobotEngine stopped")
}

func (n *NeuroRobotEngine) Name() string {
	return "NeuroRobotEngine"
}

func (n *NeuroRobotEngine) ControlRobot(data interface{}) {
	fmt.Println("[NeuroRobotEngine] Robot action executed:", data)
}
