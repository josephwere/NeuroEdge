package config

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

var (
	instance *KernelConfig
	once     sync.Once
)

// LoadConfig loads the configuration from a JSON file
func LoadConfig(filePath string) *KernelConfig {
	once.Do(func() {
		instance = &KernelConfig{
			Environment:    "prod",
			LogLevel:       "info",
			LogFilePath:    "neuroedge.log",
			MaxAgents:      100,
			MaxEngines:     50,
			EnableMesh:     true,
			EnableTelemetry: false,
			DatabaseURL:    "sqlite://neuroedge.db",
			WalletEnabled:  true,
			OfflineMode:    false,
		}

		if filePath != "" {
			data, err := os.ReadFile(filePath)
			if err != nil {
				fmt.Printf("⚠️ Config file not found, using defaults: %v\n", err)
				return
			}

			err = json.Unmarshal(data, instance)
			if err != nil {
				fmt.Printf("⚠️ Failed to parse config, using defaults: %v\n", err)
			} else {
				fmt.Println("✅ Config loaded from file")
			}
		} else {
			fmt.Println("✅ Using default configuration")
		}
	})
	return instance
}

// GetConfig returns the singleton instance
func GetConfig() *KernelConfig {
	if instance == nil {
		panic("Config not loaded. Call LoadConfig first.")
	}
	return instance
}

// UpdateConfig allows runtime updates of config (optional)
func UpdateConfig(updateFunc func(cfg *KernelConfig)) {
	cfg := GetConfig()
	updateFunc(cfg)
	fmt.Println("✅ Configuration updated at runtime")
}
