package utils

import (
    "os"
)

type Config struct {
    Env  string
    Port string
}

func LoadConfig() Config {
    env := os.Getenv("NEUROEDGE_ENV")
    if env == "" {
        env = "development"
    }
    port := os.Getenv("NEUROEDGE_PORT")
    if port == "" {
        port = "8080"
    }
    return Config{
        Env:  env,
        Port: port,
    }
}
