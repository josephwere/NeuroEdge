package discovery

import (
	"neuroedge/kernel/core"
	"neuroedge/kernel/types"
)

func GetCapabilities() types.KernelCapabilities {
	agents := []string{}
	for _, a := range core.GetAllAgents() {
		agents = append(agents, a.Name())
	}

	engines := []string{}
	// EngineRegistry is owned by main; we inject it later
	for name := range EngineRegistrySnapshot() {
		engines = append(engines, name)
	}

	return types.KernelCapabilities{
		Agents:  agents,
		Engines: engines,
	}
}
