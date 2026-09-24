"""
Generates report-ready visualizations for the Isolation Forest anomaly
detector: a scatter plot of scan behavior colored by suspicious/normal,
and a histogram showing the anomaly score distribution.

Uses the already-trained model (models/saved_models/isolation_forest.pkl)
and regenerates the same synthetic dataset it was trained on (same seed),
so the plots match what's actually deployed.

Run from inside the ai/ folder: python generate_isolation_forest_report.py
Outputs land in ai/report_assets/
"""
import os
import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT_DIR = "report_assets"
MODEL_PATH = "models/saved_models/isolation_forest.pkl"
os.makedirs(OUT_DIR, exist_ok=True)

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

model = joblib.load(MODEL_PATH)
data["anomaly_score"] = model.decision_function(data[FEATURES])
data["is_suspicious"] = model.predict(data[FEATURES]) == -1

# ---------- Scatter: scan_count vs avg_time_between_scans_hr ----------
fig, ax = plt.subplots(figsize=(7, 5))
normal_pts = data[~data["is_suspicious"]]
suspicious_pts = data[data["is_suspicious"]]

ax.scatter(normal_pts["scan_count"], normal_pts["avg_time_between_scans_hr"],
           c="#1D9E75", label="normal", alpha=0.6, s=25)
ax.scatter(suspicious_pts["scan_count"], suspicious_pts["avg_time_between_scans_hr"],
           c="#E24B4A", label="suspicious", alpha=0.8, s=30, marker="x")

ax.set_xlabel("Scan count")
ax.set_ylabel("Avg. time between scans (hours)")
ax.set_title("Isolation Forest: scan behavior classification")
ax.legend()
fig.tight_layout()
fig.savefig(os.path.join(OUT_DIR, "isolation_forest_scatter.png"), dpi=150)
plt.close(fig)
print("Saved isolation_forest_scatter.png")

# ---------- Histogram of anomaly scores ----------
fig, ax = plt.subplots(figsize=(7, 4))
ax.hist(normal_pts["anomaly_score"], bins=30, alpha=0.7, label="normal", color="#1D9E75")
ax.hist(suspicious_pts["anomaly_score"], bins=30, alpha=0.7, label="suspicious", color="#E24B4A")
ax.axvline(0, color="gray", linestyle="--", label="decision boundary")
ax.set_xlabel("Anomaly score (negative = abnormal)")
ax.set_ylabel("Count")
ax.set_title("Isolation Forest: anomaly score distribution")
ax.legend()
fig.tight_layout()
fig.savefig(os.path.join(OUT_DIR, "isolation_forest_scores.png"), dpi=150)
plt.close(fig)
print("Saved isolation_forest_scores.png")

print(f"\nFlagged {data['is_suspicious'].sum()} / {len(data)} as suspicious.")
print("All Isolation Forest report assets saved in ai/report_assets/")
