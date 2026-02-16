# NeuroEdge Database Architecture (Best-of-Breed, Local-First)

This design balances reliability, speed, and AI-native retrieval while staying locally deployable.

## 1) Core Relational (PostgreSQL + pgvector)
**Purpose:** Users, projects, chats, system configs, audit logs, doctrine.

**Why:** ACID guarantees + structured queries + vectors in the same DB when needed.

## 2) Vector Search (Qdrant)
**Purpose:** Embeddings, semantic search, long-term memory.

**Why:** Open-source, fast, easy to self-host.

## 3) Cache / KV (Redis or Dragonfly)
**Purpose:** Session cache, agent context, rate limits.

**Why:** Ultra-low latency and TTL support.

## 4) Object Storage (MinIO)
**Purpose:** Files, zips, models, artifacts.

**Why:** S3-compatible, local-first, production-ready.

## Folder Layout
```
database/
├── prisma/
│   └── schema.prisma
├── vector/
│   └── qdrant.collections.json
├── cache/
│   └── redis.init.md
├── storage/
│   └── minio.init.md
├── seeds/
│   ├── doctrine.seed.json
│   └── users.seed.json
└── docker-compose.yml
```

## Quick Start (Local)
```
cd database
cp .env.example .env
docker compose up -d
```

## Notes
- Keep secrets out of git.
- Use Postgres as the single source of truth.
- Store embeddings in Qdrant and join to relational IDs.
