package config

// KernelConfig holds all core configuration for NeuroEdge
type KernelConfig struct {
	Environment   string `json:"environment"`   // dev / staging / prod
	LogLevel      string `json:"log_level"`     // debug, info, warn, error
	LogFilePath   string `json:"log_file_path"` // path to store logs
	MaxAgents     int    `json:"max_agents"`    // maximum registered agents
	MaxEngines    int    `json:"max_engines"`   // maximum registered engines
	EnableMesh    bool   `json:"enable_mesh"`   // enable mesh networking
	EnableTelemetry bool `json:"enable_telemetry"` // send logs to remote
	DatabaseURL   string `json:"database_url"`  // for any storage
	WalletEnabled bool   `json:"wallet_enabled"`// WDC wallet
	OfflineMode   bool   `json:"offline_mode"`  // fallback offline
}
