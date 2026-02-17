# Federated Training (Active)

This implementation is active in production code:

- Nodes locally fine-tune a lightweight classifier in `ml/server.py`.
- Nodes periodically push signed model-weight updates (`/fed/update`).
- Orchestrator verifies signatures and performs secure weighted aggregation in `fed_aggregator.ts`.
- Orchestrator publishes the global model (`/fed/model`).
- Nodes pull and apply the global model version in the background.

No raw training text leaves the node. Only model parameters and metadata are shared.
