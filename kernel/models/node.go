package models

type Node struct {
    NodeID      string
    OwnerID     string
    Status      string
    LastSeen    int64
    TrustScore  float64
    MeshReputation float64
}
