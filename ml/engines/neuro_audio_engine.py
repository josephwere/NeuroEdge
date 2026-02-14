import os
from ml.utils.inference import load_model, run_audio_inference
import numpy as np

class NeuroAudioEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path or "ml/models/neuro_audio/model.onnx"
        self.model = load_model(self.model_path)
        print(f"[NeuroAudio] Loaded model from {self.model_path}")

    def transcribe(self, audio_array: np.ndarray):
        transcript = run_audio_inference(self.model, audio_array)
        print(f"[NeuroAudio] Transcribed audio of length {len(audio_array)}")
        return transcript

if __name__ == "__main__":
    import numpy as np
    engine = NeuroAudioEngine()
    fake_audio = np.zeros(16000)
    print(engine.transcribe(fake_audio))
