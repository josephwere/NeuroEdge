import os
from ml.utils.inference import load_model, run_inference

class NeuroMedicalEngine:
    def __init__(self, model_path=None):
        self.model_path = model_path or "ml/models/neuro_medical/model.onnx"
        self.model = load_model(self.model_path)
        print(f"[NeuroMedical] Loaded model from {self.model_path}")

    def diagnose(self, patient_data: str):
        diagnosis = run_inference(self.model, f"Medical analysis: {patient_data}", max_tokens=128)
        print(f"[NeuroMedical] Diagnosis completed for patient data")
        return diagnosis

if __name__ == "__main__":
    engine = NeuroMedicalEngine()
    print(engine.diagnose("Patient has fever, cough, and fatigue."))
