# NeuroEdge Architecture Diagrams

## 1) System Topology
```mermaid
flowchart LR
  U[Users/Founder/Admin] --> F[Frontend]
  F --> O[Orchestrator :7070]
  F --> W[WebSocket :7071]
  O --> K[Kernel :8080]
  O --> M[ML Service :8090]
  O --> S[(Hybrid DB)]
  M --> R[(RAG Index + Docs)]
  O --> E[(Events JSONL)]
```

## 2) Intelligence Request Path
```mermaid
sequenceDiagram
  participant User
  participant FE as Frontend
  participant OR as Orchestrator
  participant ML as ML/Cortex
  participant RAG as RAG Engine

  User->>FE: Ask question
  FE->>OR: POST /ai
  OR->>ML: POST /infer (intent)
  alt medicine/agriculture/market
    OR->>RAG: POST /rag/answer
    RAG-->>OR: answer + citations
  else other domain
    OR->>ML: POST /intelligence/ask
    ML-->>OR: structured answer
  end
  OR-->>FE: response
```

## 3) Training + Bootstrap + Nightly Refresh
```mermaid
flowchart TD
  A[Founder/Admin Dashboard] --> B[Training Studio]
  B --> C[Ingest Text/Files/URLs/Research]
  C --> D[Orchestrator training.sample events]
  D --> E[RAG Bootstrap from samples]
  E --> F[RAG ingest + reindex]
  F --> G[RAG answer with citations]

  H[Nightly Scheduler] --> I[Stale Check: age + source metadata]
  I -->|stale/changed| F
  I -->|fresh| J[Skip refresh]
```

## 4) Auto-Refresh Config Runtime
```mermaid
stateDiagram-v2
  [*] --> LoadConfig
  LoadConfig --> TickLoop
  TickLoop --> CheckTime
  CheckTime --> CheckStale
  CheckStale --> RunRefresh: stale or source changed
  CheckStale --> TickLoop: fresh
  RunRefresh --> SaveSummary
  SaveSummary --> TickLoop
```

## 5) Security/Role Control (Extensions example)
```mermaid
flowchart LR
  FE[ExtensionsPanel] --> H[Auth headers]
  H --> OR[Orchestrator Route]
  OR --> R{Role check}
  R -->|founder/admin/developer| OK[Allow manage]
  R -->|user/guest| RO[Read-only]
```
