import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./ConsumerScanner.css";

function ConsumerScanner({ onBack }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");
  const [image, setImage] = useState(null);
  const [location, setLocation] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const scannerRef = useRef(null);

  // =========================
  // STOP CAMERA
  // =========================
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        console.log("Scanner already stopped.");
      }

      scannerRef.current = null;
    }

    setScanning(false);
  };

  // =========================
  // GET LOCATION
  // =========================
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  };

  // =========================
  // VERIFY PRODUCT
  // =========================
  const verifyProduct = async (productCode) => {
    setLoading(true);
    setVerificationResult(null);

    try {
      // Get consumer's location
      const position = await getCurrentLocation();

      const latitude = position.latitude;
      const longitude = position.longitude;

      setLocation(
        `Latitude: ${latitude.toFixed(
          5
        )}, Longitude: ${longitude.toFixed(5)}`
      );

      console.log("Consumer location:", latitude, longitude);
      console.log("Product code:", productCode);

      // Backend expects POST because location is sent in request body
      const response = await fetch(
        `http://localhost:5000/api/products/verify/${encodeURIComponent(
          productCode
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            latitude,
            longitude
          })
        }
      );

      const data = await response.json();

      console.log("Verification response:", data);

      if (!response.ok) {
        setVerificationResult({
          status: data.status || "VERIFICATION FAILED",
          message: data.message || "Unable to verify this product.",
          product: data.product?.productName || productCode,
          manufacturer: data.product?.brandName || "Unknown",
          verifiedDate: new Date().toLocaleDateString()
        });

        setResult(data.message || "Product verification failed.");
        return;
      }

      setVerificationResult({
        status:
          data.status === "GENUINE"
            ? "Genuine Product"
            : data.status || "Verification Result",

        message:
          data.message ||
          "Product verification completed successfully.",

        product:
          data.product?.productName ||
          data.product?.productCode ||
          productCode,

        manufacturer:
          data.product?.brandName ||
          "Unknown",

        verifiedDate: new Date().toLocaleDateString(),

        productCode:
          data.product?.productCode || productCode,

        totalScans:
          data.product?.totalScans
      });

      if (data.verified) {
        setResult("Product verified successfully.");
      } else {
        setResult(data.message || "Product verification failed.");
      }
    } catch (error) {
      console.error("Product verification error:", error);

      setVerificationResult({
        status: "VERIFICATION FAILED",
        message:
          "Unable to verify the product. Please check your location permission and make sure the backend is running.",
        product: productCode,
        manufacturer: "Unknown",
        verifiedDate: new Date().toLocaleDateString()
      });

      setResult("Product verification failed.");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // START REAL QR SCANNER
  // =========================
  const startScanner = async () => {
    setResult("");
    setVerificationResult(null);
    setScanning(true);

    setTimeout(async () => {
      const scanner = new Html5Qrcode("consumer-qr-reader");

      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: {
              width: 250,
              height: 250
            }
          },
          async (decodedText) => {
            console.log("QR detected:", decodedText);

            try {
              await scanner.stop();
              scanner.clear();
            } catch (error) {
              console.log("Scanner cleanup:", error);
            }

            scannerRef.current = null;
            setScanning(false);

          let productCode = decodedText.trim();

try {
  const scannedData = JSON.parse(decodedText);

  // New QR format
  if (scannedData.productCode) {
    productCode = scannedData.productCode;
  }

  // Old QR format
  else if (scannedData.productId) {
    productCode = scannedData.productId;
  }

} catch (error) {

  // QR may contain a URL or plain product code

  try {
    const url = new URL(decodedText);

    const parts = url.pathname
      .split("/")
      .filter(Boolean);

    if (parts.length > 0) {
      productCode = parts[parts.length - 1];
    }

  } catch {
    // Plain product code
    productCode = decodedText.trim();
  }
}

console.log("Extracted product code:", productCode);

setResult(`Product code detected: ${productCode}`);

await verifyProduct(productCode);
          },
          () => {
            // Normal QR scanning failures are ignored.
          }
        );
      } catch (error) {
        console.error("Camera error:", error);

        scannerRef.current = null;
        setScanning(false);

        setResult(
          "Could not access the camera. Please allow camera permission and try again."
        );
      }
    }, 100);
  };

  // =========================
  // SCAN AGAIN
  // =========================
  const scanAgain = () => {
    setResult("");
    setVerificationResult(null);
    setLocation("");
    startScanner();
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
  const shareLocation = async () => {
    try {
      const position = await getCurrentLocation();

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      setLocation(
        `Latitude: ${latitude.toFixed(
          6
        )}, Longitude: ${longitude.toFixed(6)}`
      );

      alert("Location shared successfully!");
    } catch (error) {
      console.error("Location error:", error);
      alert("Unable to access your location.");
    }
  };

  // =========================
  // CLEANUP CAMERA
  // =========================
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current = null;
          });
      }
    };
  }, []);

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

              {/* REAL CAMERA */}
              <div
                id="consumer-qr-reader"
                style={{
                  width: "100%",
                  maxWidth: "500px",
                  margin: "0 auto"
                }}
              ></div>

              <p>
                Scanning for QR code...
              </p>

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
                {verificationResult?.status === "Genuine Product"
                  ? "✓"
                  : "!"}
              </div>

              <h3>
                {loading
                  ? "Verifying Product..."
                  : verificationResult?.status === "Genuine Product"
                  ? "Product Verified"
                  : "Verification Result"}
              </h3>

              <p>
                {loading
                  ? "Checking blockchain and product information..."
                  : result}
              </p>

              {verificationResult && !loading && (
                <div className="consumer-result-details">

                  <div>
                    <strong>Status</strong>

                    <span
                      className={
                        verificationResult.status === "Genuine Product"
                          ? "verified"
                          : ""
                      }
                    >
                      {verificationResult.status}
                    </span>
                  </div>

                  <div>
                    <strong>Product</strong>

                    <span>
                      {verificationResult.product}
                    </span>
                  </div>

                  <div>
                    <strong>Brand</strong>

                    <span>
                      {verificationResult.manufacturer}
                    </span>
                  </div>

                  <div>
                    <strong>Verification</strong>

                    <span>
                      Blockchain Verified
                    </span>
                  </div>

                  {location && (
                    <div>
                      <strong>Location</strong>

                      <span>
                        {location}
                      </span>
                    </div>
                  )}

                </div>
              )}

              {!loading && (
                <button
                  className="consumer-scan-again-button"
                  onClick={scanAgain}
                >
                  Scan Another Product
                </button>
              )}

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