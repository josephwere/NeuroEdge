package utils

import "fmt"

func LogInfo(msg string) {
    fmt.Println("ℹ️", msg)
}

func LogWarn(msg string) {
    fmt.Println("⚠️", msg)
}

func LogError(msg string) {
    fmt.Println("❌", msg)
}
