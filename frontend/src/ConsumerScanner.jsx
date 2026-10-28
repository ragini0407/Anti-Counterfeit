import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiUrl } from "./api";
import "./ConsumerScanner.css";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function ConsumerScanner({ onBack }) {
const [scanning, setScanning] = useState(false);
const [result, setResult] = useState("");
const [image, setImage] = useState(null);
const [imageFile, setImageFile] = useState(null);
const [imageError, setImageError] = useState("");
const [location, setLocation] = useState("");
const [locationConsentChoice, setLocationConsentChoice] = useState("NOT_REQUESTED");
const [productCode, setProductCode] = useState("");
const [manualProductCode, setManualProductCode] = useState("");
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

  const collectLocationForScan = async (consentChoice) => {
    if (consentChoice !== "GRANTED") {
      setLocation(consentChoice === "DENIED"
        ? "Location was not shared for this verification."
        : "Location was not requested for this scan.");
      return { locationConsentStatus: consentChoice };
    }

    try {
      const { latitude, longitude } = await getCurrentLocation();
      if (
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      ) {
        throw new Error("The browser returned invalid coordinates.");
      }
      setLocation("Location shared for this verification only.");
      return { locationConsentStatus: "GRANTED", latitude, longitude };
    } catch (error) {
      const denied = error?.code === 1;
      setLocation(denied
        ? "Location permission was denied; verification continued without coordinates."
        : "Location is unavailable; verification continued without coordinates.");
      return { locationConsentStatus: denied ? "DENIED" : "GRANTED" };
    } finally {
      setLocationConsentChoice("NOT_REQUESTED");
    }
  };

  // =========================
  // VERIFY PRODUCT
  // =========================
  const verifyProduct = async (productCode, qrPayload) => {
    setLoading(true);
    setVerificationResult(null);

    try {
      const locationConsent = await collectLocationForScan(locationConsentChoice);
      const response = await fetch(
        apiUrl(`/products/verify/${encodeURIComponent(productCode)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID()
          },
          body: JSON.stringify({
            ...locationConsent,
            qrPayload
          })
        }
      );

      const data = await response.json();

      console.log("Verification response:", data);

      if (!response.ok) {
        setVerificationResult({
          mode: "QR",
          status: data.status || "VERIFICATION FAILED",
          message: data.message || "Unable to verify this product.",
          product: data.product?.productName || productCode,
          manufacturer: data.product?.brandName || "Unknown",
          authenticityStatus: data.authenticityStatus || data.status || "NOT_VERIFIED",
          blockchain: data.blockchain || null,
          scanBehavior: data.scanBehavior || null,
          verifiedDate: new Date().toLocaleDateString()
        });

        setResult(data.message || "Product verification failed.");
        return;
      }

      setVerificationResult({
        mode: "QR",
        status: data.status || "Verification Result",

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

        authenticityStatus: data.authenticityStatus || "NOT_VERIFIED",
        blockchain: data.blockchain || null,
        scanBehavior: data.scanBehavior || null,

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
        mode: "QR",
        status: "VERIFICATION FAILED",
        message:
          "Unable to verify the product. Check your network connection and make sure the backend is running.",
        product: productCode,
        manufacturer: "Unknown",
        authenticityStatus: "NOT_VERIFIED",
        blockchain: null,
        scanBehavior: { scoringStatus: "UNAVAILABLE" },
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

setProductCode(productCode);

setResult(`Product code detected: ${productCode}`);

await verifyProduct(productCode, decodedText);
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
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const extensionTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    const type = file.type || extensionTypes[extension];
    if (!ALLOWED_IMAGE_TYPES.has(type)) {
      setImageError("Choose a JPG, JPEG, PNG, or WEBP image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Image must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    setImageError("");
    setImageFile(file);
    setImage(URL.createObjectURL(file));
  };

  const lookupManualProductCode = async (event) => {
    event.preventDefault();
    const code = manualProductCode.trim();
    if (!code || code.length > 64) {
      setResult("Enter a product code up to 64 characters.");
      return;
    }
    setProductCode(code);
    setLoading(true);
    setVerificationResult(null);
    setResult("Checking the saved product record and its blockchain registry...");
    try {
      const locationConsent = await collectLocationForScan(locationConsentChoice);
      const response = await fetch(apiUrl(`/products/verify-code/${encodeURIComponent(code)}`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify(locationConsent)
      });
      const data = await response.json();
      setVerificationResult({
        mode: "MANUAL_CODE",
        status: data.status || "VERIFICATION FAILED",
        message: data.message || "Unable to verify this product code.",
        product: data.product?.productName || code,
        manufacturer: data.product?.brandName || "Unknown",
        productCode: data.product?.productCode || code,
        authenticityStatus: data.authenticityStatus || data.status || "NOT_VERIFIED",
        blockchain: data.blockchain || null,
        scanBehavior: data.scanBehavior || null,
        verifiedDate: new Date().toLocaleDateString()
      });
      setResult(data.message || "Product code verification completed.");
    } catch {
      setVerificationResult({
        mode: "MANUAL_CODE",
        status: "VERIFICATION_UNAVAILABLE",
        message: "Product code verification is unavailable. No authenticity result was established.",
        product: code,
        manufacturer: "Unknown",
        authenticityStatus: "NOT_VERIFIED",
        blockchain: null,
        verifiedDate: new Date().toLocaleDateString()
      });
      setResult("Product code verification is unavailable.");
    } finally {
      setLoading(false);
    }
  };
const verifyUploadedImage = async () => {
  if (!productCode) {
    setResult("Scan a product QR code or verify a product code before uploading an image.");
    return;
  }

  if (!imageFile) {
    setResult("Please upload a product image first.");
    return;
  }

  setLoading(true);
  setResult("");
  setVerificationResult(null);

  try {
    const locationConsent = await collectLocationForScan(locationConsentChoice);

    const formData = new FormData();

    formData.append("productImage", imageFile);
    formData.append("locationConsentStatus", locationConsent.locationConsentStatus);
    if (locationConsent.latitude !== undefined) {
      formData.append("latitude", locationConsent.latitude);
      formData.append("longitude", locationConsent.longitude);
    }

    const response = await fetch(
      apiUrl(`/products/verify-image/${encodeURIComponent(productCode)}`),
      {
        method: "POST",
        body: formData
      }
    );

    const data = await response.json();

    console.log("Image verification response:", data);

    if (!response.ok) {
      setVerificationResult({
        mode: "IMAGE",
        status: data.status || "VERIFICATION FAILED",
        message:
          data.message || "Unable to verify this product image.",
        product:
          data.product?.productName ||
          productCode,
        manufacturer:
          data.product?.brandName ||
          "Unknown",
        verifiedDate: new Date().toLocaleDateString(),
        aiPrediction: data.aiPrediction,
        aiConfidence: data.aiConfidence,
        authenticityStatus: data.authenticityStatus || "NOT_VERIFIED",
        imageAnalysis: data.imageAnalysis || { status: "UNAVAILABLE", prediction: null, confidence: null },
        authenticity: data.authenticity || null,
        blockchain: data.blockchain || null
      });

      setResult(
        data.message ||
          "Product image verification failed."
      );

      return;
    }

    setVerificationResult({
      mode: "IMAGE",
      status: data.status || "Verification Result",

      message:
        data.message ||
        "Product image verification completed.",

      product:
        data.product?.productName ||
        productCode,

      manufacturer:
        data.product?.brandName ||
        "Unknown",

      verifiedDate:
        new Date().toLocaleDateString(),

      productCode:
        data.product?.productCode ||
        productCode,

      aiPrediction:
        data.aiPrediction,

      aiConfidence:
        data.aiConfidence,

      authenticityStatus: data.authenticityStatus || "NOT_VERIFIED",
      imageAnalysis: data.imageAnalysis || { status: "UNAVAILABLE", prediction: null, confidence: null },
      authenticity: data.authenticity || null,
      blockchain: data.blockchain || null
    });

    setResult(
      data.message ||
        `Image verification completed: ${data.status}`
    );

  } catch (error) {
    console.error(
      "Image verification error:",
      error
    );

    setVerificationResult({
      mode: "IMAGE",
      status: "VERIFICATION FAILED",
      message:
        "Unable to verify the product image. Please make sure the backend and AI service are running.",
      product: productCode,
      manufacturer: "Unknown",
      authenticityStatus: "NOT_VERIFIED",
      imageAnalysis: { status: "UNAVAILABLE", prediction: null, confidence: null },
      authenticity: null,
      blockchain: null,
      verifiedDate:
        new Date().toLocaleDateString()
    });

    setResult(
      "Product image verification failed."
    );

  } finally {
    setLoading(false);
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

        <fieldset className="consumer-location-consent" disabled={loading}>
          <legend>Location sharing (optional)</legend>
          <p>Location helps administrators identify possible counterfeit activity. It is collected only for this verification after you choose to share. QR and image verification work without it.</p>
          <label>
            <input type="radio" name="locationConsent" value="NOT_REQUESTED" checked={locationConsentChoice === "NOT_REQUESTED"} onChange={() => setLocationConsentChoice("NOT_REQUESTED")} />
            <span>Not requested</span>
          </label>
          <label>
            <input type="radio" name="locationConsent" value="GRANTED" checked={locationConsentChoice === "GRANTED"} onChange={() => setLocationConsentChoice("GRANTED")} />
            <span>Share location for this verification</span>
          </label>
          <label>
            <input type="radio" name="locationConsent" value="DENIED" checked={locationConsentChoice === "DENIED"} onChange={() => setLocationConsentChoice("DENIED")} />
            <span>Do not share location</span>
          </label>
        </fieldset>

        <form className="consumer-manual-lookup" onSubmit={lookupManualProductCode}>
          <label htmlFor="consumer-manual-product-code">Enter product code instead</label>
          <div className="consumer-manual-lookup-controls">
            <input
              id="consumer-manual-product-code"
              type="text"
              value={manualProductCode}
              maxLength={64}
              autoComplete="off"
              placeholder="Product code"
              onChange={(event) => setManualProductCode(event.target.value)}
              disabled={loading}
            />
            <button type="submit" className="consumer-start-button" disabled={loading}>
              Verify Code
            </button>
          </div>
          <p>Code lookup checks the saved product record against its blockchain registry. It does not claim that a QR code was scanned.</p>
        </form>


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
                {verificationResult?.blockchain?.checked && verificationResult?.blockchain?.exists && verificationResult?.blockchain?.active && !verificationResult?.blockchain?.flagged
                  || verificationResult?.authenticity?.blockchainVerified
                  ? "✓"
                  : "!"}
              </div>

              <h3>
                {loading
                  ? "Verifying Product..."
                  : verificationResult?.mode === "IMAGE"
                    ? "Product Record and Image Analysis"
                    : verificationResult?.mode === "MANUAL_CODE"
                      ? "Product Code Lookup"
                      : "QR Verification Result"}
              </h3>

              <p>
                {loading
                  ? "Checking blockchain and product information..."
                  : result}
              </p>

              {verificationResult && !loading && (
                <div className="consumer-result-details">

                  <div>
                    <strong>Product authenticity</strong>

                    <span
                      className={verificationResult.authenticityStatus === "GENUINE" || verificationResult.authenticityStatus === "REGISTERED_ACTIVE" ? "verified" : ""}
                    >
                      {verificationResult.authenticityStatus || "NOT_VERIFIED"}
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
                    <strong>Blockchain check</strong>

                    <span>
                      {verificationResult.mode === "IMAGE"
                        ? verificationResult.authenticity?.blockchainVerified ? "Saved product record matched active registry" : "Not verified"
                        : verificationResult.blockchain?.checked && verificationResult.blockchain?.exists && verificationResult.blockchain?.active && !verificationResult.blockchain?.flagged
                          ? verificationResult.mode === "MANUAL_CODE" ? "Saved record matched registry" : verificationResult.blockchain?.qrMatched ? "QR and registry matched" : "Registry record matched"
                          : "Not verified"}
                    </span>
                  </div>

                  {verificationResult.mode === "IMAGE" && (
                    <div>
                      <strong>AI image analysis</strong>
                      <span>
                        {verificationResult.imageAnalysis?.status === "SCORED"
                          ? `${String(verificationResult.imageAnalysis.prediction).toUpperCase()} classification (${Math.round(verificationResult.imageAnalysis.confidence * 100)}% confidence)`
                          : verificationResult.imageAnalysis?.status === "NOT_RUN"
                            ? "NOT RUN — product registry check did not pass"
                            : "UNAVAILABLE — the uploaded image was not classified"}
                      </span>
                    </div>
                  )}

                  {verificationResult.mode === "QR" && (
                    <div>
                      <strong>Scan-risk assessment</strong>
                      <span>
                        {verificationResult.scanBehavior?.scoringStatus === "SCORED"
                          ? `SCORED — ${verificationResult.scanBehavior.isSuspicious === true ? "suspicious pattern detected" : "no suspicious pattern detected by the model"}`
                          : verificationResult.scanBehavior?.scoringStatus || "UNAVAILABLE"}
                      </span>
                    </div>
                  )}

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
              Select a product code first, then choose a photo from your gallery or take a new picture. Maximum size: 5 MB. Image classification is an AI assessment and is separate from the blockchain registry check.
            </p>

            <div className="consumer-image-actions">
              <label className="consumer-upload-button">
                Choose from gallery
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  disabled={loading}
                />
              </label>
              <label className="consumer-upload-button">
                Take a photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleImageUpload}
                  disabled={loading}
                />
              </label>
            </div>

            {imageError && <p className="consumer-image-error" role="alert">{imageError}</p>}

            {!productCode && <p>Scan a QR code or verify a product code before image analysis.</p>}

            {image && (
              <div className="consumer-image-preview">
                <img src={image} alt="Selected product photo preview" />
                <p>Photo selected. The upload does not itself prove registration or authenticity.</p>
                <button
                  type="button"
                  className="consumer-upload-button consumer-upload-submit"
                  onClick={verifyUploadedImage}
                  disabled={loading || !productCode}
                >
                  {loading ? "Checking image…" : "Check image and registry"}
                </button>
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
