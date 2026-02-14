//kernel/agents/exported_legacy_adapters.go
package agents

import "neuroedge/kernel/types"

type legacyRunnable interface {
	Name() string
	Start()
	Stop()
}

type legacyAdapter struct {
	displayName string
	inner       legacyRunnable
}

func (a *legacyAdapter) Name() string {
	if a.displayName != "" {
		return a.displayName
	}
	return a.inner.Name()
}

func (a *legacyAdapter) Start()                    { a.inner.Start() }
func (a *legacyAdapter) Stop()                     { a.inner.Stop() }
func (a *legacyAdapter) EvaluatePerformance() bool { return true }
func (a *legacyAdapter) Learn()                    {}

func wrapLegacy(name string, inner legacyRunnable) Agent {
	return &legacyAdapter{displayName: name, inner: inner}
}

// Missing exported constructors (mapped to existing legacy constructors)

func NewAntiTheftSentinelAgent(bus *types.EventBus) Agent {
	return wrapLegacy("AntiTheftSentinelAgent", Newanti_theft_agent(bus))
}

func NewGovernmentAdvisorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("GovernmentAdvisorAgent", Newgovernment_agent(bus))
}

func NewMedicalDoctorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("MedicalDoctorAgent", Newmedical_doctor_agent(bus))
}

func NewLawEnforcementAgent(bus *types.EventBus) Agent {
	return wrapLegacy("LawEnforcementAgent", Newpolice_command_agent(bus))
}

func NewCyberSecurityShieldAgent(bus *types.EventBus) Agent {
	return wrapLegacy("CyberSecurityShieldAgent", Newsecurity_agent(bus))
}

func NewEducationMentorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("EducationMentorAgent", Newchild_tutor_agent(bus))
}

func NewBusinessConsultantAgent(bus *types.EventBus) Agent {
	return wrapLegacy("BusinessConsultantAgent", Newmanager(bus))
}

func NewCodingPartnerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("CodingPartnerAgent", Newdeveloperops_agent(bus))
}

func NewIdentityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("IdentityAgent", Newidentity_agent(bus))
}

func NewWDCWalletAgent(bus *types.EventBus) Agent {
	return wrapLegacy("WDCWalletAgent", Newwdc_wallet_agent(bus))
}

func NewNeuroChainValidatorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("NeuroChainValidatorAgent", Newneurochain_validator_agent(bus))
}

func NewEmergencyResponseAgent(bus *types.EventBus) Agent {
	return wrapLegacy("EmergencyResponseAgent", Newemergency_response_agent(bus))
}

func NewDroneControllerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DroneControllerAgent", Newdrone_controller_agent(bus))
}

func NewSmartCityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("SmartCityAgent", Newsmart_city_agent(bus))
}

func NewBankingAgent(bus *types.EventBus) Agent {
	return wrapLegacy("BankingAgent", Newbanking_agent(bus))
}

func NewTaxAgent(bus *types.EventBus) Agent {
	return wrapLegacy("TaxAgent", Newtax_agent(bus))
}

func NewAgricultureAgent(bus *types.EventBus) Agent {
	return wrapLegacy("AgricultureAgent", Newagriculture_agent(bus))
}

func NewLogisticsAgent(bus *types.EventBus) Agent {
	return wrapLegacy("LogisticsAgent", Newlogistics_agent(bus))
}

func NewBorderControlAgent(bus *types.EventBus) Agent {
	return wrapLegacy("BorderControlAgent", Newborder_control_agent(bus))
}

func NewClimateAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ClimateAgent", Newclimate_agent(bus))
}

func NewManufacturingAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ManufacturingAgent", Newmanufacturing_agent(bus))
}

func NewLawyerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("LawyerAgent", Newlawyer_agent(bus))
}

func NewJobRecruiterAgent(bus *types.EventBus) Agent {
	return wrapLegacy("JobRecruiterAgent", Newjob_recruiter_agent(bus))
}

func NewTherapistAgent(bus *types.EventBus) Agent {
	return wrapLegacy("TherapistAgent", Newtherapist_agent(bus))
}

func NewChildTutorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ChildTutorAgent", Newchild_tutor_agent(bus))
}

func NewResearchAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ResearchAgent", Newresearch_agent(bus))
}

func NewMathSolverAgent(bus *types.EventBus) Agent {
	return wrapLegacy("MathSolverAgent", Newmath_solver_agent(bus))
}

func NewScienceAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ScienceAgent", Newscience_agent(bus))
}

func NewMedicalImagingAgent(bus *types.EventBus) Agent {
	return wrapLegacy("MedicalImagingAgent", Newmedical_imaging_agent(bus))
}

func NewHospitalWorkflowAgent(bus *types.EventBus) Agent {
	return wrapLegacy("HospitalWorkflowAgent", Newhospital_workflow_agent(bus))
}

func NewPoliceCommandAgent(bus *types.EventBus) Agent {
	return wrapLegacy("PoliceCommandAgent", Newpolice_command_agent(bus))
}

func NewFraudDetectionAgent(bus *types.EventBus) Agent {
	return wrapLegacy("FraudDetectionAgent", Newfraud_detection_agent(bus))
}

func NewDeviceFingerprintAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DeviceFingerprintAgent", Newdevice_fingerprint_agent(bus))
}

func NewWDCTraderAgent(bus *types.EventBus) Agent {
	return wrapLegacy("WDCTraderAgent", Newwdc_trader_agent(bus))
}

func NewDeveloperOpsAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DeveloperOpsAgent", Newdeveloperops_agent(bus))
}

func NewAPIGeneratorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("APIGeneratorAgent", Newapi_generator_agent(bus))
}

func NewAppBuilderAgent(bus *types.EventBus) Agent {
	return wrapLegacy("AppBuilderAgent", Newapp_builder_agent(bus))
}

func NewMemoryAgent(bus *types.EventBus) Agent {
	return wrapLegacy("MemoryAgent", Newmemory_agent(bus))
}

func NewDigitalTwinAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DigitalTwinAgent", Newdigital_twin_agent(bus))
}

func NewSatelliteLinkAgent(bus *types.EventBus) Agent {
	return wrapLegacy("SatelliteLinkAgent", Newsatellite_link_agent(bus))
}

func NewRouterMeshAgent(bus *types.EventBus) Agent {
	return wrapLegacy("RouterMeshAgent", Newrouter_mesh_agent(bus))
}

func NewTelecomAgent(bus *types.EventBus) Agent {
	return wrapLegacy("TelecomAgent", Newtelecom_agent(bus))
}

func NewHardwareNodeAgent(bus *types.EventBus) Agent {
	return wrapLegacy("HardwareNodeAgent", Newhardware_node_agent(bus))
}

func NewOfflineIdentityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("OfflineIdentityAgent", Newoffline_identity_agent(bus))
}

func NewDecentralizedAIAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DecentralizedAIAgent", Newdecentralized_ai_agent(bus))
}

func NewHomeAssistantAgent(bus *types.EventBus) Agent {
	return wrapLegacy("HomeAssistantAgent", Newhome_assistant_agent(bus))
}

func NewVehicleControllerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("VehicleControllerAgent", Newvehicle_controller_agent(bus))
}

func NewCityInfrastructureAgent(bus *types.EventBus) Agent {
	return wrapLegacy("CityInfrastructureAgent", Newcity_infrastructure_agent(bus))
}

func NewFraudSentinelAgent(bus *types.EventBus) Agent {
	return wrapLegacy("FraudSentinelAgent", Newfraud_sentinel_agent(bus))
}

func NewTravelAgent(bus *types.EventBus) Agent {
	return wrapLegacy("TravelAgent", Newtravel_agent(bus))
}

func NewVotingAgent(bus *types.EventBus) Agent {
	return wrapLegacy("VotingAgent", Newvoting_agent(bus))
}

func NewVerificationOfficerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("VerificationOfficerAgent", Newverification_officer_agent(bus))
}

func NewPersonalWDCAssistantAgent(bus *types.EventBus) Agent {
	return wrapLegacy("PersonalWDCAssistantAgent", Newpersonal_wdc_assistant_agent(bus))
}

func NewProductivityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("ProductivityAgent", Newproductivity_agent(bus))
}

func NewHealthMonitoringAgent(bus *types.EventBus) Agent {
	return wrapLegacy("HealthMonitoringAgent", Newhealth_monitoring_agent(bus))
}

func NewPrivacyGuardianAgent(bus *types.EventBus) Agent {
	return wrapLegacy("PrivacyGuardianAgent", Newprivacy_guardian_agent(bus))
}

func NewMiningControllerAgent(bus *types.EventBus) Agent {
	return wrapLegacy("MiningControllerAgent", Newmining_controller_agent(bus))
}

func NewDeviceGuardianAgent(bus *types.EventBus) Agent {
	return wrapLegacy("DeviceGuardianAgent", Newdevice_guardian_agent(bus))
}

func NewRobotAssistantAgent(bus *types.EventBus) Agent {
	return wrapLegacy("RobotAssistantAgent", Newrobot_assistant_agent(bus))
}

func NewFinancialMonitoringAgent(bus *types.EventBus) Agent {
	return wrapLegacy("FinancialMonitoringAgent", Newfinancial_monitoring_agent(bus))
}

func NewCodeQualityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("CodeQualityAgent", Newcode_quality_agent(bus))
}

func NewGameDeveloperAgent(bus *types.EventBus) Agent {
	return wrapLegacy("GameDeveloperAgent", Newgame_developer_agent(bus))
}

func NewWorldKnowledgeAgent(bus *types.EventBus) Agent {
	return wrapLegacy("WorldKnowledgeAgent", Newworld_knowledge_agent(bus))
}

func NewUniversalTranslatorAgent(bus *types.EventBus) Agent {
	return wrapLegacy("UniversalTranslatorAgent", Newuniversal_translator_agent(bus))
}

func NewNegotiationAgent(bus *types.EventBus) Agent {
	return wrapLegacy("NegotiationAgent", Newnegotiation_agent(bus))
}

func NewNewsIntelligenceAgent(bus *types.EventBus) Agent {
	return wrapLegacy("NewsIntelligenceAgent", Newnews_intelligence_agent(bus))
}

func NewPoliticalStabilityAgent(bus *types.EventBus) Agent {
	return wrapLegacy("PoliticalStabilityAgent", Newpolitical_stability_agent(bus))
}

func NewSocialMediaAgent(bus *types.EventBus) Agent {
	return wrapLegacy("SocialMediaAgent", Newsocial_media_agent(bus))
}
