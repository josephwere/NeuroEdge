package utils

import (
    "crypto/rand"
    "encoding/hex"
)

func GenerateRandomKey(n int) string {
    bytes := make([]byte, n)
    _, _ = rand.Read(bytes)
    return hex.EncodeToString(bytes)
}
