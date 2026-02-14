# ml/floating_chat_ml_api.py
from fastapi import FastAPI
from pydantic import BaseModel
from floating_chat_ml_agent import FloatingChatMLAgent

app = FastAPI()
ml_agent = FloatingChatMLAgent()

class PredictRequest(BaseModel):
    text: str

class PredictResponse(BaseModel):
    action: str

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    action = ml_agent.predict_action(req.text)
    return PredictResponse(action=action)
