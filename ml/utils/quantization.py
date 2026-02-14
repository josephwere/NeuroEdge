import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType

def quantize_model(model_path: str, output_path: str):
    """
    Perform dynamic INT8 quantization on an ONNX model
    """
    print(f"⚡ Quantizing model: {model_path} -> {output_path}")
    quantize_dynamic(model_path, output_path, weight_type=QuantType.QInt8)
    print("✅ Quantization complete")
