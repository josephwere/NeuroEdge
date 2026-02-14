import os
from ml.utils.inference import load_model, run_inference

class NeuroGPTEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path or "ml/models/neuro_gpt/model.onnx"
        self.model = load_model(self.model_path)
        print(f"[NeuroGPT] Loaded model from {self.model_path}")

    def generate(self, prompt, max_tokens=128):
        output = run_inference(self.model, prompt, max_tokens)
        print(f"[NeuroGPT] Generated output for prompt: {prompt}")
        return output

if __name__ == "__main__":
    engine = NeuroGPTEngine()
    result = engine.generate("Hello NeuroEdge, describe the future of AI:")
    print(result)
