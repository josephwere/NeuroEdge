from typing import Any
from PIL import Image
import numpy as np
from ml.utils import inference

class EngineProxy:
    """
    Wraps any ML engine for standardized access.
    """

    def __init__(self, name: str, model_path: str, engine_type: str):
        self.name = name
        self.model_path = model_path
        self.engine_type = engine_type  # 'text', 'image', 'audio', 'multi'
        self.session = None

    def load(self):
        from ml.utils.inference import load_model
        self.session = load_model(self.model_path)
        print(f"✅ Engine {self.name} loaded")

    def run(self, input_data: Any) -> Any:
        if self.engine_type == "text":
            return inference.run_inference(self.session, input_data)
        elif self.engine_type == "image":
            return inference.run_image_inference(self.session, input_data)
        elif self.engine_type == "audio":
            return inference.run_audio_inference(self.session, input_data)
        else:
            raise ValueError(f"Unknown engine type: {self.engine_type}")
