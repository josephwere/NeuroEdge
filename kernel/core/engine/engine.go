//kernel/core/engine/engine.go
package engines

import (
	"neuroedge/kernel/types"
)

// Import all individual engines
import (
	"neuroedge/kernel/engines"
)

// Loader initializes all NeuroEdge engines
func InitAllEngines(eventBus *types.EventBus) []interface{} {
	var allEngines []interface{}

	// Core engines
	allEngines = append(allEngines,
		engines.NewNeuroAgentsCoreEngine(eventBus),
		engines.NewNeuroAPIEngine(eventBus),
		engines.NewNeuroAudioEngine(eventBus),
		engines.NewNeuroCEOEngine(eventBus),
		engines.NewNeuroChainValidatorEngine(eventBus),
		engines.NewNeuroCloudEngine(eventBus),
		engines.NewNeuroCodeEngine(eventBus),
		engines.NewNeuroComputeEngine(eventBus),
		engines.NewNeuroComputeOptimizer(eventBus),
		engines.NewNeuroCreatorEngine(eventBus),
		engines.NewNeuroDataEngine(eventBus),
		engines.NewNeuroDefenseEngine(eventBus),
		engines.NewNeuroEdgeAntiTheftEngine(eventBus),
		engines.NewNeuroEdgeMeshEngine(eventBus),
		engines.NewNeuroEmotionsEngine(eventBus),
		engines.NewNeuroFinanceEngine(eventBus),
		engines.NewNeuroFusionEngine(eventBus),
		engines.NewNeuroGeoEngine(eventBus),
		engines.NewNeuroGovEngine(eventBus),
		engines.NewNeuroGPTEngine(eventBus),
		engines.NewNeuroHREngine(eventBus),
		engines.NewNeuroHumanEngine(eventBus),
		engines.NewNeuroIdentityEngine(eventBus),
		engines.NewNeuroLegalEngine(eventBus),
		engines.NewNeuroLogicEngine(eventBus),
		engines.NewNeuroMathEngine(eventBus),
		engines.NewNeuroMedicalEngine(eventBus),
		engines.NewNeuroMemoryEngine(eventBus),
		engines.NewNeuroOfflineEngine(eventBus),
		engines.NewNeuroOpsEngine(eventBus),
		engines.NewNeuroQuantumEngine(eventBus),
		engines.NewNeuroResearchEngine(eventBus),
		engines.NewNeuroRobotEngine(eventBus),
		engines.NewNeuroSearchEngine(eventBus),
		engines.NewNeuroSecurityEngine(eventBus),
		engines.NewNeuroSensorsEngine(eventBus),
		engines.NewNeuroTeacherEngine(eventBus),
		engines.NewNeuroTradeEngine(eventBus),
		engines.NewNeuroTranslateEngine(eventBus),
		engines.NewNeuroVisionEngine(eventBus),
		engines.NewNeuroWDCWalletEngine(eventBus),
		engines.NewTaskEmissionEngine(eventBus), // finalized last engine
	)

	// Start all engines
	for _, eng := range allEngines {
		switch e := eng.(type) {
		case interface{ Start() }:
			e.Start()
		}
	}

	return allEngines
}
