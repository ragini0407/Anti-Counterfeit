"""
AI microservice for the Anti-Counterfeit project.

Exposes:
    POST /predict  - upload a product image, get back genuine/fake + confidence
    POST /score    - send scan-behavior stats, get back an anomaly/suspicious score
"""

import io
from pathlib import Path

import joblib
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
from pydantic import BaseModel


app = FastAPI(title="Anti-Counterfeit AI Service")


# --------------------------------------------------
# Paths
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

IMG_SIZE = (128, 128)

CNN_MODEL_PATH = BASE_DIR / "models" / "saved_models" / "cnn_fake_detector.h5"
ISO_FOREST_PATH = BASE_DIR / "models" / "saved_models" / "isolation_forest.pkl"


# --------------------------------------------------
# Models
# --------------------------------------------------

cnn_model = None
iso_forest = None


@app.on_event("startup")
def load_models():
    global cnn_model, iso_forest

    # Load CNN
    try:
        cnn_model = tf.keras.models.load_model(CNN_MODEL_PATH)
        print("[success] CNN model loaded.")
    except Exception as e:
        print(f"[warning] CNN model not loaded: {e}")

    # Load Isolation Forest
    try:
        iso_forest = joblib.load(ISO_FOREST_PATH)
        print("[success] Isolation Forest loaded.")
    except Exception as e:
        print(f"[warning] Isolation Forest not loaded: {e}")


# --------------------------------------------------
# CNN Prediction
# --------------------------------------------------

@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    if cnn_model is None:
        raise HTTPException(
            status_code=503,
            detail="CNN model not loaded."
        )

    try:
        # Read uploaded image
        contents = await file.read()

        # Convert image to RGB and resize
        image = (
            Image.open(io.BytesIO(contents))
            .convert("RGB")
            .resize(IMG_SIZE)
        )

        # Convert image to NumPy array
        arr = np.array(image).astype("float32") / 255.0

        # Add batch dimension
        arr = np.expand_dims(arr, axis=0)

        # CNN prediction
        prob_genuine = float(
            cnn_model.predict(arr, verbose=0)[0][0]
        )

        # Class decision
        prediction = (
            "genuine"
            if prob_genuine >= 0.5
            else "fake"
        )

        # Confidence
        confidence = (
            prob_genuine
            if prediction == "genuine"
            else 1 - prob_genuine
        )

        return {
            "prediction": prediction,
            "confidence": round(confidence, 4)
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not process image: {str(e)}"
        )


# --------------------------------------------------
# Isolation Forest
# --------------------------------------------------

class ScanEvent(BaseModel):
    scan_count: int
    distinct_locations: int
    avg_time_between_scans_hr: float


@app.post("/score")
async def score(event: ScanEvent):

    if iso_forest is None:
        raise HTTPException(
            status_code=503,
            detail="Isolation Forest not loaded."
        )

    features = np.array([[
        event.scan_count,
        event.distinct_locations,
        event.avg_time_between_scans_hr,
    ]])

    anomaly_score = float(
        iso_forest.decision_function(features)[0]
    )

    is_suspicious = bool(
        iso_forest.predict(features)[0] == -1
    )

    return {
        "anomaly_score": round(anomaly_score, 4),
        "is_suspicious": is_suspicious
    }