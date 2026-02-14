package security

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

type Identity struct {
	ID        string
	PublicKey []byte
	CreatedAt time.Time
}

func NewIdentity(publicKey []byte) *Identity {
	hash := sha256.Sum256(publicKey)
	return &Identity{
		ID:        hex.EncodeToString(hash[:]),
		PublicKey: publicKey,
		CreatedAt: time.Now(),
	}
}
