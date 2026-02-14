import json
import time
import pickle
from typing import Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

class FloatingChatMLAgent:
    """
    ML agent that learns from build logs, code issues, and developer feedback.
    Provides recommended actions for fixes.
    """

    def __init__(self, model_path="fc_ml_model.pkl", vectorizer_path="fc_vectorizer.pkl"):
        self.model_path = model_path
        self.vectorizer_path = vectorizer_path
        self.vectorizer = TfidfVectorizer()
        self.model = LogisticRegression()
        self.load_model()

    def load_model(self):
        try:
            with open(self.model_path, "rb") as f:
                self.model = pickle.load(f)
            with open(self.vectorizer_path, "rb") as f:
                self.vectorizer = pickle.load(f)
            print("✅ ML model loaded")
        except:
            print("⚠️ No existing model found, initializing new model")

    def save_model(self):
        with open(self.model_path, "wb") as f:
            pickle.dump(self.model, f)
        with open(self.vectorizer_path, "wb") as f:
            pickle.dump(self.vectorizer, f)
        print("💾 ML model saved")

    def train(self, data: Dict[str, str], actions: Dict[str, str]):
        """
        Train model based on logs/code (data) and corresponding actions (labels)
        data: {id: text_of_log_or_code}
        actions: {id: recommended_command_or_fix}
        """
        texts = [v for v in data.values()]
        labels = [actions[k] for k in data.keys()]
        X = self.vectorizer.fit_transform(texts)
        self.model.fit(X, labels)
        self.save_model()
        print("✅ ML training completed")

    def predict_action(self, text: str) -> str:
        X = self.vectorizer.transform([text])
        action = self.model.predict(X)[0]
        return action

    def feedback_loop(self, text: str, executed_command: str):
        """
        Learn from the result of execution
        text: input log/code snippet
        executed_command: actual command executed (approved by user)
        """
        # For simplicity, incremental learning
        self.train({str(time.time()): text}, {str(time.time()): executed_command})
        print(f"🧠 Learning from executed command: {executed_command}")
