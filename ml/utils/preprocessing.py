from PIL import Image
import numpy as np
import librosa

# -------------------------------
# Image preprocessing
# -------------------------------
def preprocess_image(img: Image.Image, target_size=(224, 224)) -> np.ndarray:
    """
    Resize and normalize an image for model input.
    """
    img = img.resize(target_size)
    img_array = np.array(img).astype("float32") / 255.0
    # Add batch dimension
    return np.expand_dims(img_array, axis=0)

# -------------------------------
# Audio preprocessing
# -------------------------------
def preprocess_audio(audio_path: str, sr=16000) -> np.ndarray:
    """
    Load audio file and convert to fixed length waveform
    """
    y, _ = librosa.load(audio_path, sr=sr)
    if len(y) > sr:
        y = y[:sr]  # truncate
    else:
        y = np.pad(y, (0, sr - len(y)))  # pad
    return np.expand_dims(y, axis=0)
