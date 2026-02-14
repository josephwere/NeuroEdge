import os
from ml.utils.inference import load_model, run_image_inference
from PIL import Image

class NeuroVisionEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path or "ml/models/neuro_vision/model.onnx"
        self.model = load_model(self.model_path)
        print(f"[NeuroVision] Loaded model from {self.model_path}")

    def analyze_image(self, image_path):
        img = Image.open(image_path)
        result = run_image_inference(self.model, img)
        print(f"[NeuroVision] Analyzed image {image_path}")
        return result

if __name__ == "__main__":
    engine = NeuroVisionEngine()
    print(engine.analyze_image("sample_image.jpg"))
