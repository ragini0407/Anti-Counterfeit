# AI Service Integration Guide
## For Backend Developer (Team Member 1)

## Running the AI service
From the `ai/` folder:
```
python -m venv venv
venv\Scripts\activate          (Windows)   or   source venv/bin/activate   (Mac/Linux)
pip install -r requirements.txt
cd service
uvicorn app:app --reload --port 8000
```
Runs at: http://127.0.0.1:8000 (interactive test page at /docs)

## Required backend packages
```
npm install axios form-data
```

## backend .env variable required
```
AI_SERVICE_URL=http://127.0.0.1:8000
```

## Endpoint 1: POST /predict
Consumer-uploaded image -> genuine/fake classification via CNN.

**Input:** multipart/form-data, field name `file`, an image file (jpg/png).

**Output:**
```json
{ "prediction": "genuine", "confidence": 0.9718 }
```
`prediction` is `"genuine"` or `"fake"`. `confidence` is 0-1 (probability of the predicted class).

**Model:** trained on the "Fake vs Real Medicine Dataset" (Kaggle), 866 real medicine-packaging images.
Test accuracy: 96.66%. Model file: `ai/models/saved_models/cnn_fake_detector.h5`.

**Limitation:** trained on one product category (medicine packaging) for this prototype. Retraining on a
different dataset (same folder structure: `dataset/train/{genuine,fake}`, `dataset/val/{genuine,fake}`)
is enough to extend it to other product types later.

## Endpoint 2: POST /score
Scan-behavior stats -> suspicious-activity flag via Isolation Forest.

**Input (application/json):**
```json
{ "scan_count": 25, "distinct_locations": 10, "avg_time_between_scans_hr": 1.5 }
```
- `scan_count`: total number of times this product code has been scanned/verified so far
- `distinct_locations`: number of distinct locations it's been scanned from
- `avg_time_between_scans_hr`: average hours between consecutive scans

**Output:**
```json
{ "anomaly_score": -0.0015, "is_suspicious": true }
```
`anomaly_score` is negative for abnormal-looking behavior, positive for normal. `is_suspicious` is the
ready-to-use true/false flag.

**Limitation:** trained on synthetic scan-log data (950 normal / 50 suspicious records), since real scan
history doesn't exist yet. Behaves correctly on realistic input patterns; will improve once trained on
real `Verification` records later in the project.

## Node.js / axios example
```javascript
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

const predictImage = async (imagePath) => {
    const form = new FormData();
    form.append("file", fs.createReadStream(imagePath));

    const response = await axios.post(`${AI_SERVICE_URL}/predict`, form, {
        headers: form.getHeaders(),
        timeout: 15000
    });

    return response.data; // { prediction, confidence }
};

const scoreScanBehavior = async ({ scan_count, distinct_locations, avg_time_between_scans_hr }) => {
    const response = await axios.post(`${AI_SERVICE_URL}/score`, {
        scan_count,
        distinct_locations,
        avg_time_between_scans_hr
    }, { timeout: 10000 });

    return response.data; // { anomaly_score, is_suspicious }
};

module.exports = { predictImage, scoreScanBehavior };
```

## Suggested combination logic
Any one signal saying "confidently fake" should win over the others (a strong fake signal shouldn't be
overruled by a weaker check passing):
```
CNN says fake with >= 70% confidence          -> FAKE
else reference-image similarity < 70%          -> FAKE
else scan behavior flagged as suspicious       -> SUSPICIOUS
else similarity >= 90% AND CNN says genuine    -> GENUINE
else (mixed/ambiguous signals)                 -> SUSPICIOUS
```

## Notes
- The AI service must be running (`uvicorn`, above) before the backend calls it.
- Both endpoints return an `{"error": "..."}` body if their model hasn't loaded (e.g. server just
  started, model file missing) - handle that case rather than assuming the fields are always present.
