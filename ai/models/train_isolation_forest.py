"""
Trains an Isolation Forest to flag suspicious product-scan behavior.
Uses synthetic scan-log data for now -- swap in real ProductScan records
from the backend/MongoDB once they exist.
"""
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

np.random.seed(42)

N_NORMAL = 950
N_SUSPICIOUS = 50

normal = pd.DataFrame({
    "scan_count": np.random.poisson(3, N_NORMAL) + 1,
    "distinct_locations": np.random.poisson(1, N_NORMAL) + 1,
    "avg_time_between_scans_hr": np.random.normal(48, 15, N_NORMAL).clip(1, None),
})

suspicious = pd.DataFrame({
    "scan_count": np.random.poisson(20, N_SUSPICIOUS) + 5,
    "distinct_locations": np.random.poisson(8, N_SUSPICIOUS) + 2,
    "avg_time_between_scans_hr": np.random.normal(2, 1, N_SUSPICIOUS).clip(0.01, None),
})

data = pd.concat([normal, suspicious], ignore_index=True)

FEATURES = ["scan_count", "distinct_locations", "avg_time_between_scans_hr"]
model = IsolationForest(contamination=0.05, random_state=42)
model.fit(data[FEATURES])

os.makedirs("models/saved_models", exist_ok=True)
joblib.dump(model, "models/saved_models/isolation_forest.pkl")
print("Saved model to models/saved_models/isolation_forest.pkl")

data["anomaly_score"] = model.decision_function(data[FEATURES])
data["is_suspicious"] = model.predict(data[FEATURES]) == -1
print("\nMost suspicious-looking rows (lowest score = most anomalous):")
print(data.sort_values("anomaly_score").head())
print(f"\nFlagged {data['is_suspicious'].sum()} / {len(data)} as suspicious.")