import React, { useState } from "react";
import "./ConsumerScanner.css";

function ConsumerScanner({ onBack }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");
  const [image, setImage] = useState(null);
  const [location, setLocation] = useState("");

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
    setResult(
      "Product is verified successfully. This product is genuine."
    );
    setScanning(false);
  };

  // =========================
  // SCAN AGAIN
  // =========================
  const scanAgain = () => {
    setResult("");
    setScanning(true);
  };

  // =========================
  // IMAGE UPLOAD
  // =========================
  const handleImageUpload = (e) => {
    const file = e.target.files[0];

    if (file) {
      setImage(URL.createObjectURL(file));
    }
  };

  // =========================
  // SHARE LOCATION
  // =========================
  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert("Location is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        setLocation(
          `Latitude: ${latitude.toFixed(
            6
          )}, Longitude: ${longitude.toFixed(6)}`
        );

        alert("Location shared successfully!");
      },
      () => {
        alert("Unable to access your location.");
      }
    );
  };

  return (
    <div className="consumer-scanner-page">

      {/* =========================
          HEADER
      ========================= */}
      <div className="consumer-scanner-header">

        <button
          className="consumer-back-button"
          onClick={onBack}
        >
          ← Back to Consumer Dashboard
        </button>

        <div className="consumer-scanner-title">
          <h1>Product Verification</h1>

          <p>
            Scan a product QR code to verify whether the product is genuine.
          </p>
        </div>

      </div>


      {/* =========================
          MAIN CARD
      ========================= */}
      <div className="consumer-scanner-card">

        <div className="consumer-scanner-icon">
          ▦
        </div>

        <h2>Scan Product QR Code</h2>

        <p className="consumer-scanner-description">
          Position the product QR code inside the scanner frame.
        </p>


        {/* =========================
            QR SCANNER
        ========================= */}
        <div className="consumer-camera-box">

          {!scanning && !result && (
            <div className="consumer-camera-placeholder">

              <div className="consumer-camera-symbol">
                📷
              </div>

              <h3>Ready to Scan</h3>

              <p>
                Click the button below to start scanning.
              </p>

              <button
                className="consumer-start-button"
                onClick={startScanner}
              >
                Start Scanner
              </button>

            </div>
          )}


          {/* ACTIVE SCANNER */}
          {scanning && (
            <div className="consumer-active-scanner">

              <div className="consumer-scanner-frame">

                <div className="consumer-corner consumer-top-left"></div>

                <div className="consumer-corner consumer-top-right"></div>

                <div className="consumer-corner consumer-bottom-left"></div>

                <div className="consumer-corner consumer-bottom-right"></div>

                <div className="consumer-scan-line"></div>

              </div>

              <p>
                Scanning for QR code...
              </p>

              <button
                className="consumer-demo-button"
                onClick={simulateScan}
              >
                Simulate QR Scan
              </button>

              <button
                className="consumer-stop-button"
                onClick={stopScanner}
              >
                Stop Scanner
              </button>

            </div>
          )}


          {/* =========================
              VERIFICATION RESULT
          ========================= */}
          {result && (
            <div className="consumer-result">

              <div className="consumer-result-icon">
                ✓
              </div>

              <h3>
                Product Verified
              </h3>

              <p>
                {result}
              </p>

              <div className="consumer-result-details">

                <div>
                  <strong>Status</strong>
                  <span className="verified">
                    Genuine
                  </span>
                </div>

                <div>
                  <strong>Verification</strong>
                  <span>
                    Blockchain Verified
                  </span>
                </div>

              </div>

              <button
                className="consumer-scan-again-button"
                onClick={scanAgain}
              >
                Scan Another Product
              </button>

            </div>
          )}

        </div>


        {/* =========================
            UPLOAD PRODUCT IMAGE
        ========================= */}
        <div className="consumer-feature">

          <div className="consumer-feature-icon">
            🖼️
          </div>

          <div className="consumer-feature-content">

            <h3>
              Upload Product Image
            </h3>

            <p>
              Upload an image of the product for additional verification.
            </p>

            <label className="consumer-upload-button">

              Choose Product Image

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />

            </label>

            {image && (
              <div className="consumer-image-preview">

                <img
                  src={image}
                  alt="Product preview"
                />

                <p>
                  Product image uploaded successfully.
                </p>

              </div>
            )}

          </div>

        </div>


        {/* =========================
            SHARE LOCATION
        ========================= */}
        <div className="consumer-feature">

          <div className="consumer-feature-icon">
            📍
          </div>

          <div className="consumer-feature-content">

            <h3>
              Share Location
            </h3>

            <p>
              Share your current location to help identify counterfeit
              product activity.
            </p>

            <button
              className="consumer-location-button"
              onClick={shareLocation}
            >
              Share My Location
            </button>

            {location && (
              <div className="consumer-location-result">
                {location}
              </div>
            )}

          </div>

        </div>


        {/* =========================
            INFORMATION
        ========================= */}
        <div className="consumer-scanner-info">

          <div className="consumer-info-item">
            <span>✓</span>
            <p>Secure Verification</p>
          </div>

          <div className="consumer-info-item">
            <span>✓</span>
            <p>Product Authenticity</p>
          </div>

          <div className="consumer-info-item">
            <span>✓</span>
            <p>Blockchain Protected</p>
          </div>

        </div>

      </div>

    </div>
  );
}

export default ConsumerScanner;