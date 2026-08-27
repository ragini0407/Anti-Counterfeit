import React, { useState } from "react";
import "./Scanner.css";

function Scanner({ onBack }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");

  const startScanner = () => {
    setScanning(true);
    setResult("");
  };

  const stopScanner = () => {
    setScanning(false);
  };

  const simulateScan = () => {
    setResult("Product QR Code detected successfully!");
    setScanning(false);
  };

  const scanAgain = () => {
    setResult("");
    setScanning(true);
  };

  return (
    <div className="scanner-page">

      <div className="scanner-header">

        <button
          className="scanner-back-button"
          onClick={onBack}
        >
          ← Back to Manufacturer Dashboard
        </button>

        <div className="scanner-title">
          <h1>QR Code Scanner</h1>
          <p>
            Scan a product QR code to verify product information.
          </p>
        </div>

      </div>

      <div className="scanner-card">

        <div className="scanner-icon">
          ▦
        </div>

        <h2>Scan Product QR Code</h2>

        <p className="scanner-description">
          Position the QR code inside the scanner frame.
        </p>

        <div className="camera-box">

          {!scanning && !result && (
            <div className="camera-placeholder">

              <div className="camera-symbol">
                📷
              </div>

              <h3>Ready to Scan</h3>

              <p>
                Click the button below to start scanning.
              </p>

              <button
                className="start-scan-button"
                onClick={startScanner}
              >
                Start Scanner
              </button>

            </div>
          )}

          {scanning && (
            <div className="active-scanner">

              <div className="scanner-frame">

                <div className="corner top-left"></div>
                <div className="corner top-right"></div>
                <div className="corner bottom-left"></div>
                <div className="corner bottom-right"></div>

                <div className="scan-line"></div>

              </div>

              <p>
                Scanning for QR code...
              </p>

              <button
                className="scan-demo-button"
                onClick={simulateScan}
              >
                Simulate QR Scan
              </button>

              <button
                className="stop-scan-button"
                onClick={stopScanner}
              >
                Stop Scanner
              </button>

            </div>
          )}

          {result && (
            <div className="scanner-result">

              <h3>✓ QR Code Detected</h3>

              <div className="result-value">
                {result}
              </div>

              <button
                className="scan-again-button"
                onClick={scanAgain}
              >
                Scan Again
              </button>

            </div>
          )}

        </div>

        <div className="scanner-info">

          <div className="info-item">
            <span>✓</span>
            <p>Secure scanning</p>
          </div>

          <div className="info-item">
            <span>✓</span>
            <p>Product verification</p>
          </div>

          <div className="info-item">
            <span>✓</span>
            <p>Blockchain protected</p>
          </div>

        </div>

      </div>

    </div>
  );
}

export default Scanner;