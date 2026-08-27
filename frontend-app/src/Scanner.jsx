import React, { useState } from "react";
import "./Scanner.css";

function Scanner({ onBack, backText = "Back to Dashboard" }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");

  // =========================
  // START SCANNER
  // =========================
  const startScanner = () => {
    setScanning(true);
    setResult("");
  };

  // =========================
  // STOP SCANNER
  // =========================
  const stopScanner = () => {
    setScanning(false);
  };

  // =========================
  // SIMULATE QR SCAN
  // =========================
  const simulateScan = () => {
    setResult("Product QR Code detected successfully!");
    setScanning(false);
  };

  // =========================
  // SCAN AGAIN
  // =========================
  const scanAgain = () => {
    setResult("");
    setScanning(true);
  };

  return (
    <div className="scanner-page">

      {/* =========================
          HEADER
      ========================= */}
      <div className="scanner-header">

        <button
          className="scanner-back-button"
          onClick={onBack}
        >
          ← {backText}
        </button>

        <div className="scanner-title">
          <h1>QR Code Scanner</h1>

          <p>
            Scan a product QR code to verify product information.
          </p>
        </div>

      </div>


      {/* =========================
          MAIN CARD
      ========================= */}
      <div className="scanner-card">

        {/* ICON */}
        <div className="scanner-icon">
          ▦
        </div>


        {/* TITLE */}
        <h2>
          Scan Product QR Code
        </h2>

        <p className="scanner-description">
          Position the QR code inside the scanner frame.
        </p>


        {/* =========================
            CAMERA AREA
        ========================= */}
        <div className="camera-box">

          {/* =========================
              READY TO SCAN
          ========================= */}
          {!scanning && !result && (

            <div className="camera-placeholder">

              <div className="camera-symbol">
                📷
              </div>

              <h3>
                Ready to Scan
              </h3>

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


          {/* =========================
              ACTIVE SCANNER
          ========================= */}
          {scanning && (

            <div className="active-scanner">

              <div className="scanner-frame">

                {/* TOP LEFT */}
                <div className="corner top-left"></div>

                {/* TOP RIGHT */}
                <div className="corner top-right"></div>

                {/* BOTTOM LEFT */}
                <div className="corner bottom-left"></div>

                {/* BOTTOM RIGHT */}
                <div className="corner bottom-right"></div>

                {/* SCANNING LINE */}
                <div className="scan-line"></div>

              </div>


              <p>
                Scanning for QR code...
              </p>


              {/* DEMO SCAN */}
              <button
                className="scan-demo-button"
                onClick={simulateScan}
              >
                Simulate QR Scan
              </button>


              {/* STOP */}
              <button
                className="stop-scan-button"
                onClick={stopScanner}
              >
                Stop Scanner
              </button>

            </div>

          )}


          {/* =========================
              RESULT
          ========================= */}
          {result && (

            <div className="scanner-result">

              <h3>
                ✓ QR Code Detected
              </h3>


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


        {/* =========================
            INFORMATION
        ========================= */}
        <div className="scanner-info">

          <div className="info-item">

            <span>✓</span>

            <p>
              Secure scanning
            </p>

          </div>


          <div className="info-item">

            <span>✓</span>

            <p>
              Product verification
            </p>

          </div>


          <div className="info-item">

            <span>✓</span>

            <p>
              Blockchain protected
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Scanner;