import os
from ml.utils.inference import load_model, run_inference

class NeuroCodeEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path or "ml/models/neuro_code/model.onnx"
        self.model = load_model(self.model_path)
        print(f"[NeuroCode] Loaded model from {self.model_path}")

    def generate_code(self, prompt, language="python"):
        code = run_inference(self.model, f"{language} code: {prompt}", max_tokens=256)
        print(f"[NeuroCode] Generated code for prompt: {prompt}")
        return code

if __name__ == "__main__":
    engine = NeuroCodeEngine()
    print(engine.generate_code("Build a REST API for a todo app"))
