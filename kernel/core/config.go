package core

import (
	"os"
)

type Config struct {
	Env       string
	LogLevel  string
	MeshPort  int
	WDCNode   string
	KernelID  string
}

func LoadConfig() *Config {
	return &Config{
		Env:      getEnv("NEUROEDGE_ENV", "production"),
		LogLevel: getEnv("NEUROEDGE_LOGLEVEL", "INFO"),
		MeshPort: 8000,
		WDCNode:  getEnv("NEUROEDGE_WDC_NODE", "https://wdc.node"),
		KernelID: getEnv("NEUROEDGE_KERNEL_ID", "neuroedge-001"),
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
