from fastapi import FastAPI
from pydantic import BaseModel
import subprocess, json

app = FastAPI()

class PredictionRequest(BaseModel):
    text: str

class PredictionResponse(BaseModel):
    action: str
    confidence: float

@app.post("/predict", response_model=PredictionResponse)
def predict(req: PredictionRequest):
    # Analyze input text
    # Generate recommended command/fix
    action = "npm install"  # Example
    confidence = 0.95
    return {"action": action, "confidence": confidence}

@app.post("/feedback")
def feedback(result: dict):
    # Feedback from execution to improve ML
    # Save logs, success/failure, user approval
    return {"status": "received"}
