# NeuroEdge Mesh Node (Inference-Only)

This node runs on **laptops, desktops, or mobile devices** and proxies inference to the local ML service.
It registers itself with the orchestrator and sends heartbeats.

## Run
```
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Start the local ML service:
```
python server.py
```

Start the mesh node:
```
NEUROEDGE_NODE_ID=node-laptop-01 \\
NEUROEDGE_NODE_KIND=laptop \\
NEUROEDGE_NODE_PORT=8095 \\
NEUROEDGE_ORCHESTRATOR_URL=http://localhost:7070 \\
NEUROEDGE_LOCAL_ML_URL=http://localhost:8090 \\
uvicorn edge_node:app --host 0.0.0.0 --port 8095
```

## Orchestrator endpoints
- `POST /mesh/register`
- `POST /mesh/heartbeat`
- `GET /mesh/nodes`
- `POST /mesh/infer`

## Notes
This is inference‑only. Federated training will be added later.
