"""
AI microservice for the Anti-Counterfeit project.

Exposes:
    POST /predict  - upload a product image, get back genuine/fake + confidence
    POST /score    - send scan-behavior stats, get back an anomaly/suspicious score
"""

import io
import hmac
import os
from pathlib import Path

import joblib
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, Header, UploadFile, HTTPException
from PIL import Image
from pydantic import BaseModel, Field, model_validator


app = FastAPI(title="Anti-Counterfeit AI Service")


def require_service_token(authorization: str | None = Header(default=None)):
    """Fail closed unless the caller presents the configured backend token."""
    expected_token = os.environ.get("AI_SERVICE_TOKEN", "")
    if len(expected_token) < 32:
        raise HTTPException(status_code=503, detail="AI service is disabled")
    expected_header = f"Bearer {expected_token}"
    if not authorization or not hmac.compare_digest(authorization, expected_header):
        raise HTTPException(status_code=401, detail="AI service authentication required")


@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    try:
        require_service_token(authorization)
        authorized = True
    except HTTPException:
        authorized = False
    cnn_loaded = cnn_model is not None
    scan_model_loaded = iso_forest is not None
    return {
        "status": "ok" if cnn_loaded and scan_model_loaded and authorized else "degraded",
        "cnn_model_loaded": cnn_loaded,
        "isolation_forest_model_loaded": scan_model_loaded,
        "scan_scoring_model_loaded": scan_model_loaded,
        "authenticated_calls_enabled": authorized,
    }


# --------------------------------------------------
# Paths
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

IMG_SIZE = (128, 128)

CNN_MODEL_PATH = BASE_DIR / "models" / "saved_models" / "clean_cnn_fake_detector.keras"
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
async def predict(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):

    require_service_token(authorization)

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
    scan_count: int = Field(ge=2)
    distinct_locations: int = Field(ge=1)
    avg_time_between_scans_hr: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def locations_cannot_exceed_scans(self):
        if self.distinct_locations > self.scan_count:
            raise ValueError("distinct_locations cannot exceed scan_count")
        return self


@app.post("/score")
async def score(event: ScanEvent, authorization: str | None = Header(default=None)):

    require_service_token(authorization)

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
