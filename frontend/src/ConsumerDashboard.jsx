import React, { useState } from "react";
import "./ConsumerDashboard.css";

function ConsumerDashboard({ onLogout, onScanner }) {
  const [activePage, setActivePage] = useState("dashboard");
  const [productImage, setProductImage] = useState(null);
  const [location, setLocation] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);

  // =========================
  // SCAN QR
  // =========================
  const handleScanQR = () => {
    if (onScanner) {
      onScanner();
    } else {
      setActivePage("scan");
    }
  };

  // =========================
  // UPLOAD IMAGE
  // =========================
  const handleImageUpload = (e) => {
    const file = e.target.files[0];

    if (file) {
      setProductImage(URL.createObjectURL(file));
      alert("Product image uploaded successfully.");
    }
  };

  // =========================
  // SHARE LOCATION
  // =========================
  const handleLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        setLocation(
          `Latitude: ${latitude.toFixed(5)}, Longitude: ${longitude.toFixed(5)}`
        );

        alert("Location shared successfully.");
      },
      () => {
        alert("Unable to access your location.");
      }
    );
  };

  // =========================
  // PRODUCT VERIFICATION
  // =========================
  const handleVerification = () => {
    setVerificationResult({
      status: "Genuine Product",
      message:
        "This product appears to be genuine based on the available verification information.",
      product: "SmartWatch X1",
      manufacturer: "TechNova Industries",
      verifiedDate: new Date().toLocaleDateString(),
    });

    setActivePage("verification");
  };

  // =========================
  // DASHBOARD
  // =========================
  const renderDashboard = () => {
    return (
      <>
        <div className="consumer-header">
          <div>
            <h1>Consumer Dashboard</h1>
            <p>
              Verify products and protect yourself from counterfeit products.
            </p>
          </div>

          <div className="consumer-profile">
            <div className="consumer-avatar">C</div>
            <div>
              <strong>Consumer</strong>
              <span>Product Verifier</span>
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="consumer-stats">
          <div className="consumer-stat-card">
            <div className="stat-icon blue">⌕</div>
            <div>
              <span>Total Scans</span>
              <strong>24</strong>
            </div>
          </div>

          <div className="consumer-stat-card">
            <div className="stat-icon green">✓</div>
            <div>
              <span>Genuine Products</span>
              <strong>21</strong>
            </div>
          </div>

          <div className="consumer-stat-card">
            <div className="stat-icon red">!</div>
            <div>
              <span>Counterfeit Found</span>
              <strong>3</strong>
            </div>
          </div>
        </div>

        {/* MAIN ACTIONS */}
        <div className="consumer-section-title">
          <h2>Product Verification</h2>
          <p>Choose an option to verify your product.</p>
        </div>

        <div className="consumer-actions">

          {/* SCAN QR */}
          <div className="consumer-action-card">
            <div className="action-icon">▦</div>

            <h3>Scan QR</h3>

            <p>
              Scan the QR code on your product to verify its authenticity.
            </p>

            <button
              className="consumer-primary-button"
              onClick={handleScanQR}
            >
              Scan QR Code →
            </button>
          </div>

          {/* PRODUCT VERIFICATION */}
          <div className="consumer-action-card">
            <div className="action-icon green-icon">✓</div>

            <h3>Product Verification</h3>

            <p>
              Check product details and verify whether the product is genuine.
            </p>

            <button
              className="consumer-primary-button"
              onClick={handleVerification}
            >
              Verify Product →
            </button>
          </div>

          {/* UPLOAD IMAGE */}
          <div className="consumer-action-card">
            <div className="action-icon purple-icon">▣</div>

            <h3>Upload Product Image</h3>

            <p>
              Upload an image of your product for visual verification.
            </p>

            <label className="consumer-primary-button upload-button">
              Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                hidden
              />
            </label>
          </div>

          {/* LOCATION */}
          <div className="consumer-action-card">
            <div className="action-icon orange-icon">⌖</div>

            <h3>Share Location</h3>

            <p>
              Share your current location to help identify suspicious activity.
            </p>

            <button
              className="consumer-primary-button"
              onClick={handleLocation}
            >
              Share Location
            </button>

            {location && (
              <div className="location-result">
                {location}
              </div>
            )}
          </div>

        </div>

        {/* UPLOADED IMAGE */}
        {productImage && (
          <div className="consumer-upload-preview">
            <h2>Uploaded Product Image</h2>

            <img
              src={productImage}
              alt="Uploaded Product"
            />

            <p>
              Image uploaded successfully. Product image is ready for
              verification.
            </p>
          </div>
        )}

        {/* VERIFICATION RESULT */}
        {verificationResult && (
          <div className="verification-result-card">

            <div className="verification-success-icon">
              ✓
            </div>

            <div className="verification-content">

              <span className="verified-label">
                VERIFICATION RESULT
              </span>

              <h2>{verificationResult.status}</h2>

              <p>{verificationResult.message}</p>

              <div className="verification-details">

                <div>
                  <span>Product</span>
                  <strong>{verificationResult.product}</strong>
                </div>

                <div>
                  <span>Manufacturer</span>
                  <strong>{verificationResult.manufacturer}</strong>
                </div>

                <div>
                  <span>Verified On</span>
                  <strong>{verificationResult.verifiedDate}</strong>
                </div>

              </div>

            </div>
          </div>
        )}
      </>
    );
  };

  // =========================
  // RENDER
  // =========================
  return (
    <div className="consumer-page">

      {/* SIDEBAR */}
      <aside className="consumer-sidebar">

        <div className="consumer-logo">

          <img
            src="/logo.png"
            alt="Anti-Counterfeit"
          />

          <div>
            <h2>
              Anti-<span>Counterfeit</span>
            </h2>

            <p>
              AI-Powered Blockchain
              <br />
              Product Verification
            </p>
          </div>

        </div>

        {/* NAVIGATION */}
        <nav className="consumer-nav">

          <button
            className={
              activePage === "dashboard"
                ? "consumer-nav-item active"
                : "consumer-nav-item"
            }
            onClick={() => setActivePage("dashboard")}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className="consumer-nav-item"
            onClick={handleScanQR}
          >
            <span>▦</span>
            Scan QR
          </button>

          <button
            className="consumer-nav-item"
            onClick={handleVerification}
          >
            <span>✓</span>
            Product Verification
          </button>

          <label className="consumer-nav-item">
            <span>▣</span>
            Upload Product Image

            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              hidden
            />
          </label>

          <button
            className="consumer-nav-item"
            onClick={handleLocation}
          >
            <span>⌖</span>
            Share Location
          </button>

          <button
            className={
              activePage === "verification"
                ? "consumer-nav-item active"
                : "consumer-nav-item"
            }
            onClick={() => setActivePage("verification")}
          >
            <span>◉</span>
            Verification Result
          </button>

        </nav>

        {/* LOGOUT */}
        <button
          className="consumer-logout"
          onClick={onLogout}
        >
          ⇥
          <span>Logout</span>
        </button>

      </aside>

      {/* MAIN CONTENT */}
      <main className="consumer-main">

        {/* TOP BAR */}
        <div className="consumer-topbar">

          <div className="consumer-search">
            <span>⌕</span>

            <input
              type="text"
              placeholder="Search products..."
            />
          </div>

          <div className="consumer-top-actions">

            <button className="top-icon">
              ♧
            </button>

            <button className="top-icon">
              ⚙
            </button>

          </div>

        </div>

        {/* CONTENT */}
        <div className="consumer-content">

          {activePage === "dashboard" && renderDashboard()}

          {activePage === "verification" && (
            <>
              <div className="consumer-header">
                <div>
                  <h1>Verification Result</h1>
                  <p>
                    View the latest product verification result.
                  </p>
                </div>
              </div>

              {verificationResult ? (
                <div className="verification-result-card">

                  <div className="verification-success-icon">
                    ✓
                  </div>

                  <div className="verification-content">

                    <span className="verified-label">
                      PRODUCT VERIFIED
                    </span>

                    <h2>{verificationResult.status}</h2>

                    <p>{verificationResult.message}</p>

                    <div className="verification-details">

                      <div>
                        <span>Product</span>
                        <strong>
                          {verificationResult.product}
                        </strong>
                      </div>

                      <div>
                        <span>Manufacturer</span>
                        <strong>
                          {verificationResult.manufacturer}
                        </strong>
                      </div>

                      <div>
                        <span>Date</span>
                        <strong>
                          {verificationResult.verifiedDate}
                        </strong>
                      </div>

                    </div>

                  </div>

                </div>
              ) : (
                <div className="empty-verification">
                  <div>✓</div>
                  <h2>No Verification Result</h2>
                  <p>
                    Scan or verify a product to see the result here.
                  </p>

                  <button
                    className="consumer-primary-button"
                    onClick={handleScanQR}
                  >
                    Scan Product
                  </button>
                </div>
              )}
            </>
          )}

        </div>

      </main>

    </div>
  );
}

export default ConsumerDashboard;