//kernel/core/agent_registry.go
package core

import (
	"fmt"
	"sync"

	"neuroedge/kernel/agents"
	"neuroedge/kernel/types"
)

type AgentInterface interface {
	Name() string
	Start()
	Stop()
	EvaluatePerformance() bool
	Learn()
}

var AgentRegistry = struct {
	sync.RWMutex
	agents map[string]AgentInterface
}{
	agents: make(map[string]AgentInterface),
}

func RegisterAgent(agent AgentInterface) {
	AgentRegistry.Lock()
	defer AgentRegistry.Unlock()

	name := agent.Name()
	if _, exists := AgentRegistry.agents[name]; exists {
		fmt.Printf("[AgentRegistry] Agent %s already registered\n", name)
		return
	}

	AgentRegistry.agents[name] = agent
	fmt.Printf("[AgentRegistry] Registered agent: %s\n", name)
	agent.Start()
}

func GetAgent(name string) (AgentInterface, bool) {
	AgentRegistry.RLock()
	defer AgentRegistry.RUnlock()
	agent, exists := AgentRegistry.agents[name]
	return agent, exists
}

func StopAllAgents() {
	AgentRegistry.Lock()
	defer AgentRegistry.Unlock()

	for name, agent := range AgentRegistry.agents {
		agent.Stop()
		fmt.Printf("[AgentRegistry] Stopped agent: %s\n", name)
	}
}

func GetAllAgents() []AgentInterface {
	AgentRegistry.RLock()
	defer AgentRegistry.RUnlock()
	all := make([]AgentInterface, 0, len(AgentRegistry.agents))
	for _, a := range AgentRegistry.agents {
		all = append(all, a)
	}
	return all
}

func InitializeAllAgents() {
	bus := types.NewEventBus()

	RegisterAgent(agents.NewGlobalMeshAgent(bus))
	RegisterAgent(agents.NewReasoningAgent(bus))
	RegisterAgent(agents.NewTaskAgent(bus))
	RegisterAgent(agents.NewSecurityAgent(bus))
	RegisterAgent(agents.NewPolicyEthicsAgent(bus))
	RegisterAgent(agents.NewAntiTheftSentinelAgent(bus))
	RegisterAgent(agents.NewGovernmentAdvisorAgent(bus))
	RegisterAgent(agents.NewMedicalDoctorAgent(bus))
	RegisterAgent(agents.NewLawEnforcementAgent(bus))
	RegisterAgent(agents.NewCyberSecurityShieldAgent(bus))
	RegisterAgent(agents.NewEducationMentorAgent(bus))
	RegisterAgent(agents.NewBusinessConsultantAgent(bus))
	RegisterAgent(agents.NewCodingPartnerAgent(bus))
	RegisterAgent(agents.NewIdentityAgent(bus))
	RegisterAgent(agents.NewWDCWalletAgent(bus))
	RegisterAgent(agents.NewNeuroChainValidatorAgent(bus))
	RegisterAgent(agents.NewEmergencyResponseAgent(bus))
	RegisterAgent(agents.NewDroneControllerAgent(bus))
	RegisterAgent(agents.NewSmartCityAgent(bus))
	RegisterAgent(agents.NewBankingAgent(bus))
	RegisterAgent(agents.NewTaxAgent(bus))
	RegisterAgent(agents.NewAgricultureAgent(bus))
	RegisterAgent(agents.NewLogisticsAgent(bus))
	RegisterAgent(agents.NewBorderControlAgent(bus))
	RegisterAgent(agents.NewClimateAgent(bus))
	RegisterAgent(agents.NewManufacturingAgent(bus))
	RegisterAgent(agents.NewLawyerAgent(bus))
	RegisterAgent(agents.NewJobRecruiterAgent(bus))
	RegisterAgent(agents.NewTherapistAgent(bus))
	RegisterAgent(agents.NewChildTutorAgent(bus))
	RegisterAgent(agents.NewResearchAgent(bus))
	RegisterAgent(agents.NewMathSolverAgent(bus))
	RegisterAgent(agents.NewScienceAgent(bus))
	RegisterAgent(agents.NewMedicalImagingAgent(bus))
	RegisterAgent(agents.NewHospitalWorkflowAgent(bus))
	RegisterAgent(agents.NewPoliceCommandAgent(bus))
	RegisterAgent(agents.NewFraudDetectionAgent(bus))
	RegisterAgent(agents.NewDeviceFingerprintAgent(bus))
	RegisterAgent(agents.NewWDCTraderAgent(bus))
	RegisterAgent(agents.NewDeveloperOpsAgent(bus))
	RegisterAgent(agents.NewAPIGeneratorAgent(bus))
	RegisterAgent(agents.NewAppBuilderAgent(bus))
	RegisterAgent(agents.NewMemoryAgent(bus))
	RegisterAgent(agents.NewPlanningAgent(bus))
	RegisterAgent(agents.NewDigitalTwinAgent(bus))
	RegisterAgent(agents.NewSatelliteLinkAgent(bus))
	RegisterAgent(agents.NewRouterMeshAgent(bus))
	RegisterAgent(agents.NewTelecomAgent(bus))
	RegisterAgent(agents.NewHardwareNodeAgent(bus))
	RegisterAgent(agents.NewOfflineIdentityAgent(bus))
	RegisterAgent(agents.NewDecentralizedAIAgent(bus))
	RegisterAgent(agents.NewHomeAssistantAgent(bus))
	RegisterAgent(agents.NewVehicleControllerAgent(bus))
	RegisterAgent(agents.NewCityInfrastructureAgent(bus))
	RegisterAgent(agents.NewFraudSentinelAgent(bus))
	RegisterAgent(agents.NewTravelAgent(bus))
	RegisterAgent(agents.NewVotingAgent(bus))
	RegisterAgent(agents.NewVerificationOfficerAgent(bus))
	RegisterAgent(agents.NewPersonalWDCAssistantAgent(bus))
	RegisterAgent(agents.NewProductivityAgent(bus))
	RegisterAgent(agents.NewHealthMonitoringAgent(bus))
	RegisterAgent(agents.NewPrivacyGuardianAgent(bus))
	RegisterAgent(agents.NewMiningControllerAgent(bus))
	RegisterAgent(agents.NewDeviceGuardianAgent(bus))
	RegisterAgent(agents.NewRobotAssistantAgent(bus))
	RegisterAgent(agents.NewFinancialMonitoringAgent(bus))
	RegisterAgent(agents.NewCodeQualityAgent(bus))
	RegisterAgent(agents.NewGameDeveloperAgent(bus))
	RegisterAgent(agents.NewWorldKnowledgeAgent(bus))
	RegisterAgent(agents.NewUniversalTranslatorAgent(bus))
	RegisterAgent(agents.NewNegotiationAgent(bus))
	RegisterAgent(agents.NewNewsIntelligenceAgent(bus))
	RegisterAgent(agents.NewPoliticalStabilityAgent(bus))
	RegisterAgent(agents.NewSocialMediaAgent(bus))

	fmt.Println("[AgentRegistry] All agents initialized and started ✅")
}
