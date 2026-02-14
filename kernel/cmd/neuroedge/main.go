//kernel/cmd/neuroedge/main.go
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"neuroedge/kernel/core"
	"neuroedge/kernel/discovery"
	"neuroedge/kernel/types"
)

func main() {
	fmt.Println("Starting NeuroEdge Kernel")

	eventBus := types.NewEventBus()
	core.InitializeAllAgents()

	engineRegistry := core.NewEngineRegistry(eventBus)
	engineRegistry.RegisterAllEngines()
	discovery.RegisterEngineSnapshot(engineRegistry)

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	fmt.Println("Stopping NeuroEdge Kernel")
	engineRegistry.StopAllEngines()
	core.StopAllAgents()
}
