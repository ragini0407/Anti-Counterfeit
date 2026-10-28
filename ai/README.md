# AI service

The backend uses the `AI_SERVICE_URL` setting for `/predict`, `/score`, and the
health check. In this repository the fallback is loopback on port 8000. The
backend currently has an explicit loopback setting for that port, so start this
service locally when running the backend.

From the project root, activate the existing AI virtual environment, then run:

```powershell
python -m uvicorn service.app:app --app-dir ai --host 127.0.0.1 --port 8000
```

The service loads its CNN and Isolation Forest artifacts during startup. Check
`GET /health`; scan scoring is ready only when `scan_scoring_model_loaded` is
`true`. Do not expose this development service publicly.

Run the AI unit tests from the `ai` directory after activating the existing
virtual environment:

```powershell
python -B -m unittest discover -s tests -v
```

`-B` prevents Python from writing bytecode caches during this test run. The
tests replace the scoring model with a spy for API validation checks and load
the checked-in model artifact for the feature-compatibility test. No service,
database, or public blockchain is required.

The backend scores a product only after at least two QR scan records have
numeric coordinates and valid timestamps, and their mean interval is greater
than zero. The current scan is included in those records. Missing coordinates,
a first scan, invalid history, or a zero interval yields `INSUFFICIENT_DATA`;
the backend does not send fabricated location or interval values to the model.

## Model training and inputs

### CNN image classifier (`/predict`)

The historical `ai/INTEGRATION.md` records that the CNN was trained with the
Kaggle “Fake vs Real Medicine Dataset” and describes 866 medicine-packaging
images. The dataset itself is absent from this checkout, so that provenance
cannot be independently reproduced here. The checked-in training script expects
images in `dataset/train/{genuine,fake}` and `dataset/val/{genuine,fake}`, resizes
them to 128 × 128, and scales pixel values to 0–1 before fitting the classifier.

The historical integration guide reports 96.66% accuracy, while the historical
`ai/report_assets/classification_report.txt` committed in `ac0cebe` reports 94%
accuracy over 449 test examples. These results have not been reconciled;
neither figure should be presented as the single verified accuracy for the
current model artifact.

### Isolation Forest scan-behavior scorer (`/score`)

The checked-in `ai/models/train_isolation_forest.py` creates synthetic
scan-behavior rows with NumPy (950 normal-pattern and 50 suspicious-pattern
rows). It fits on `scan_count`, `distinct_locations`, and
`avg_time_between_scans_hr`. It does not load the medicine image dataset or
derive these fields from medicine images or CNN predictions. The backend
supplies these same three features from QR scan history.

No alternate medicine-dataset trainer was found in the current checkout or
reachable Git history. The saved pickle records its feature names, but not its
original training rows; therefore the artifact’s training data cannot be
independently recovered from its metadata. This describes the checked-in
training path; an external or uncommitted training run cannot be ruled out.

The Isolation Forest has not been validated on suitable real scan-history data.
Treat its output as experimental scan-risk information, not reliable real-world
fraud or counterfeit detection. Do not interpret unavailable or insufficient
scoring as evidence that a product is safe or suspicious.
