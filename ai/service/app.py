"""
AI microservice for the Anti-Counterfeit project.
Exposes:
    POST /predict  - upload a product image, get back genuine/fake + confidence
    POST /score    - send scan-behavior stats, get back an anomaly/suspicious score
"""
import io

import joblib
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, UploadFile
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="Anti-Counterfeit AI Service")

IMG_SIZE = (128, 128)
CNN_MODEL_PATH = "../models/saved_models/cnn_fake_detector.h5"
ISO_FOREST_PATH = "../models/saved_models/isolation_forest.pkl"

cnn_model = None
iso_forest = None


@app.on_event("startup")
def load_models():
    global cnn_model, iso_forest
    try:
        cnn_model = tf.keras.models.load_model(CNN_MODEL_PATH)
    except Exception as e:
        print(f"[warning] CNN model not loaded yet ({e}). Train it first with train_cnn.py.")
    try:
        iso_forest = joblib.load(ISO_FOREST_PATH)
    except Exception as e:
        print(f"[warning] Isolation Forest not loaded yet ({e}).")


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if cnn_model is None:
        return {"error": "CNN model not trained/loaded yet"}

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB").resize(IMG_SIZE)
    arr = np.array(image) / 255.0
    arr = np.expand_dims(arr, axis=0)

    prob_genuine = float(cnn_model.predict(arr, verbose=0)[0][0])
    prediction = "genuine" if prob_genuine > 0.5 else "fake"
    confidence = prob_genuine if prediction == "genuine" else 1 - prob_genuine

    return {"prediction": prediction, "confidence": round(confidence, 4)}


class ScanEvent(BaseModel):
    scan_count: int
    distinct_locations: int
    avg_time_between_scans_hr: float


@app.post("/score")
async def score(event: ScanEvent):
    if iso_forest is None:
        return {"error": "Isolation Forest not trained/loaded yet"}

    features = np.array([[
        event.scan_count,
        event.distinct_locations,
        event.avg_time_between_scans_hr,
    ]])
    anomaly_score = float(iso_forest.decision_function(features)[0])
    is_suspicious = bool(iso_forest.predict(features)[0] == -1)

    return {"anomaly_score": round(anomaly_score, 4), "is_suspicious": is_suspicious}