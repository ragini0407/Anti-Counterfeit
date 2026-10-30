import asyncio
import io
import json
import os
import unittest
from pathlib import Path

import joblib
import numpy as np
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError

from service import app as ai_app


TEST_AI_TOKEN = "test-only-service-token-with-enough-length-12345"


async def asgi_post(path, payload, include_token=True):
    body = json.dumps(payload).encode("utf-8")
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [
            (b"host", b"testserver"),
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
        ] + ([(b"authorization", f"Bearer {TEST_AI_TOKEN}".encode("ascii"))] if include_token else []),
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "state": {},
    }
    messages = []
    request_sent = False

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    await ai_app.app(scope, receive, send)
    response_start = next(message for message in messages if message["type"] == "http.response.start")
    response_body = next(message for message in messages if message["type"] == "http.response.body")
    return response_start["status"], json.loads(response_body.get("body", b"{}"))


class SpyIsolationForest:
    def __init__(self):
        self.calls = []

    def decision_function(self, features):
        self.calls.append(("decision_function", features.tolist()))
        return [0.1255]

    def predict(self, features):
        self.calls.append(("predict", features.tolist()))
        return [-1]


class ScanScoringTests(unittest.TestCase):
    def setUp(self):
        self.previous_model = ai_app.iso_forest
        self.previous_token = os.environ.get("AI_SERVICE_TOKEN")
        os.environ["AI_SERVICE_TOKEN"] = TEST_AI_TOKEN
        self.model = SpyIsolationForest()
        ai_app.iso_forest = self.model

    def tearDown(self):
        ai_app.iso_forest = self.previous_model
        if self.previous_token is None:
            os.environ.pop("AI_SERVICE_TOKEN", None)
        else:
            os.environ["AI_SERVICE_TOKEN"] = self.previous_token

    def test_first_scan_and_zero_interval_are_rejected_before_model_scoring(self):
        for payload in (
            {"scan_count": 1, "distinct_locations": 1, "avg_time_between_scans_hr": 0},
            {"scan_count": 2, "distinct_locations": 0, "avg_time_between_scans_hr": 4},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                ai_app.ScanEvent(**payload)

    def test_impossible_location_count_returns_http_422_without_calling_model(self):
        status, response = asyncio.run(asgi_post("/score", {
            "scan_count": 3,
            "distinct_locations": 5,
            "avg_time_between_scans_hr": 24,
        }))
        self.assertEqual(status, 422)
        self.assertEqual(self.model.calls, [])
        self.assertTrue(response.get("detail"))

    def test_non_finite_and_non_positive_intervals_return_http_422_without_model_call(self):
        for interval in ("Infinity", "-Infinity", "NaN", 0.0):
            with self.subTest(interval=repr(interval)):
                self.model.calls.clear()
                status, response = asyncio.run(asgi_post("/score", {
                    "scan_count": 3,
                    "distinct_locations": 2,
                    "avg_time_between_scans_hr": interval,
                }))
                self.assertEqual(status, 422)
                self.assertTrue(response.get("detail"))
                self.assertEqual(self.model.calls, [])

    def test_non_finite_python_values_fail_request_model_validation(self):
        for interval in (float("inf"), float("-inf"), float("nan")):
            with self.subTest(interval=repr(interval)), self.assertRaises(ValidationError):
                ai_app.ScanEvent(
                    scan_count=3,
                    distinct_locations=2,
                    avg_time_between_scans_hr=interval,
                )

    def test_valid_location_count_is_accepted_and_passed_to_model(self):
        status, response = asyncio.run(asgi_post("/score", {
            "scan_count": 3,
            "distinct_locations": 2,
            "avg_time_between_scans_hr": 24,
        }))
        self.assertEqual(status, 200)
        self.assertEqual(response, {"anomaly_score": 0.1255, "is_suspicious": True})
        self.assertEqual(self.model.calls, [
            ("decision_function", [[3.0, 2.0, 24.0]]),
            ("predict", [[3.0, 2.0, 24.0]]),
        ])

    def test_health_reports_cnn_and_scan_model_readiness_separately(self):
        previous_cnn = ai_app.cnn_model
        previous_scan = ai_app.iso_forest
        try:
            ai_app.cnn_model = None
            ai_app.iso_forest = object()
            self.assertEqual(ai_app.health(f"Bearer {TEST_AI_TOKEN}"), {
                "status": "degraded",
                "cnn_model_loaded": False,
                "isolation_forest_model_loaded": True,
                "scan_scoring_model_loaded": True,
                "authenticated_calls_enabled": True,
            })
            ai_app.cnn_model = object()
            ai_app.iso_forest = None
            self.assertEqual(ai_app.health(f"Bearer {TEST_AI_TOKEN}"), {
                "status": "degraded",
                "cnn_model_loaded": True,
                "scan_scoring_model_loaded": False,
                "isolation_forest_model_loaded": False,
                "authenticated_calls_enabled": True,
            })
            ai_app.iso_forest = object()
            self.assertEqual(ai_app.health(f"Bearer {TEST_AI_TOKEN}"), {
                "status": "ok",
                "cnn_model_loaded": True,
                "scan_scoring_model_loaded": True,
                "isolation_forest_model_loaded": True,
                "authenticated_calls_enabled": True,
            })
        finally:
            ai_app.cnn_model = previous_cnn
            ai_app.iso_forest = previous_scan

    def test_predict_contract_uses_multipart_file_and_returns_valid_classification(self):
        operation = ai_app.app.openapi()["paths"]["/predict"]["post"]
        content = operation["requestBody"]["content"]
        self.assertIn("multipart/form-data", content)
        request_schema = content["multipart/form-data"]["schema"]
        if "$ref" in request_schema:
            schema_name = request_schema["$ref"].rsplit("/", 1)[-1]
            request_schema = ai_app.app.openapi()["components"]["schemas"][schema_name]
        self.assertIn("file", request_schema["properties"])
        self.assertIn("authorization", [parameter["name"] for parameter in operation["parameters"]])

        class SpyCNN:
            def predict(self, batch, verbose=0):
                self.batch = batch
                return np.array([[0.75]], dtype="float32")

        previous_model = ai_app.cnn_model
        model = SpyCNN()
        ai_app.cnn_model = model
        image_bytes = io.BytesIO()
        Image.new("RGB", (4, 4), color="white").save(image_bytes, format="PNG")
        image = UploadFile(filename="test.png", file=io.BytesIO(image_bytes.getvalue()))
        try:
            response = asyncio.run(ai_app.predict(image, f"Bearer {TEST_AI_TOKEN}"))
            self.assertEqual(response, {"prediction": "genuine", "confidence": 0.75})
            self.assertEqual(model.batch.shape, (1, 128, 128, 3))

            with self.assertRaises(HTTPException) as raised:
                asyncio.run(ai_app.predict(image, "Bearer invalid-test-token"))
            self.assertEqual(raised.exception.status_code, 401)
        finally:
            ai_app.cnn_model = previous_model

    def test_score_requires_configured_service_token(self):
        status, _ = asyncio.run(asgi_post("/score", {
            "scan_count": 3,
            "distinct_locations": 2,
            "avg_time_between_scans_hr": 24,
        }, include_token=False))
        self.assertEqual(status, 401)
        self.assertEqual(self.model.calls, [])

    def test_saved_isolation_forest_loads_and_accepts_the_declared_features(self):
        model_path = Path(ai_app.ISO_FOREST_PATH)
        self.assertTrue(model_path.is_file())
        model = joblib.load(model_path)
        self.assertEqual(model.n_features_in_, 3)
        features = [[2, 1, 12.0]]
        self.assertEqual(len(model.decision_function(features)), 1)
        self.assertIn(int(model.predict(features)[0]), (-1, 1))


if __name__ == "__main__":
    unittest.main()
