import React, { useEffect, useState } from "react";
import "./ConsumerDashboard.css";

function ConsumerDashboard({ onLogout, onScanner }) {
  // ============================================================
  // STATE
  // ============================================================

  const [activePage, setActivePage] = useState("dashboard");

  const [location, setLocation] = useState("");

  const [verificationResult, setVerificationResult] =
    useState(null);

  const [stats, setStats] = useState({
    totalScans: 0,
    genuineScans: 0,
    suspiciousScans: 0,
    fakeScans: 0,
  });

  const [statsLoading, setStatsLoading] =
    useState(true);


  // ============================================================
  // LOAD CONSUMER DASHBOARD STATISTICS
  // ============================================================

  useEffect(() => {
    const loadStats = async () => {
      try {
        setStatsLoading(true);

        const response = await fetch(
          "http://localhost:5000/api/products/consumer-stats"
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Failed to load consumer statistics"
          );
        }

        setStats(
          data.stats || {
            totalScans: 0,
            genuineScans: 0,
            suspiciousScans: 0,
            fakeScans: 0,
          }
        );
      } catch (error) {
        console.error(
          "Consumer statistics error:",
          error
        );

        // Keep dashboard usable even if the API is unavailable
        setStats({
          totalScans: 0,
          genuineScans: 0,
          suspiciousScans: 0,
          fakeScans: 0,
        });
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, []);


  // ============================================================
  // SCAN QR
  // ============================================================

  const handleScanQR = () => {
    if (onScanner) {
      onScanner();
    } else {
      setActivePage("scan");
    }
  };


  // ============================================================
  // SHARE LOCATION
  // ============================================================

  const handleLocation = () => {
    if (!navigator.geolocation) {
      alert(
        "Geolocation is not supported by your browser."
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        setLocation(
          `Latitude: ${latitude.toFixed(
            5
          )}, Longitude: ${longitude.toFixed(5)}`
        );

        alert("Location shared successfully.");
      },
      () => {
        alert(
          "Unable to access your location."
        );
      }
    );
  };


  // ============================================================
  // DASHBOARD
  // ============================================================

  const renderDashboard = () => {
    return (
      <>
        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="consumer-header">
          <div>
            <h1>Consumer Dashboard</h1>

            <p>
              Verify products and protect yourself
              from counterfeit products.
            </p>
          </div>

          <div className="consumer-profile">
            <div className="consumer-avatar">
              C
            </div>

            <div>
              <strong>Consumer</strong>
              <span>Product Verifier</span>
            </div>
          </div>
        </div>


        {/* ======================================================
            STAT CARDS
        ====================================================== */}

        <div className="consumer-stats">

          {/* TOTAL SCANS */}
          <div className="consumer-stat-card">
            <div className="stat-icon blue">
              ⌕
            </div>

            <div>
              <span>Total Scans</span>

              <strong>
                {statsLoading
                  ? "..."
                  : stats.totalScans}
              </strong>
            </div>
          </div>


          {/* GENUINE */}
          <div className="consumer-stat-card">
            <div className="stat-icon green">
              ✓
            </div>

            <div>
              <span>Genuine Products</span>

              <strong>
                {statsLoading
                  ? "..."
                  : stats.genuineScans}
              </strong>
            </div>
          </div>


          {/* COUNTERFEIT */}
          <div className="consumer-stat-card">
            <div className="stat-icon red">
              !
            </div>

            <div>
              <span>Counterfeit Found</span>

              <strong>
                {statsLoading
                  ? "..."
                  : stats.fakeScans}
              </strong>
            </div>
          </div>

        </div>


        {/* ======================================================
            MAIN ACTIONS
        ====================================================== */}

        <div className="consumer-actions">

          {/* SCAN QR */}
          <div className="consumer-action-card">

            <div className="action-icon">
              ▦
            </div>

            <h3>Scan QR</h3>

            <p>
              Scan the QR code on your product
              to verify its authenticity.
            </p>

            <button
              className="consumer-primary-button"
              onClick={handleScanQR}
            >
              Scan QR Code →
            </button>

          </div>


          {/* SHARE LOCATION */}
          <div className="consumer-action-card">

            <div className="action-icon orange-icon">
              ⌖
            </div>

            <h3>Share Location</h3>

            <p>
              Share your current location to help
              identify suspicious activity.
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


        {/* ======================================================
            VERIFICATION RESULT
        ====================================================== */}

        {verificationResult && (
          <div className="verification-result-card">

            <div className="verification-success-icon">
              ✓
            </div>

            <div className="verification-content">

              <span className="verified-label">
                VERIFICATION RESULT
              </span>

              <h2>
                {verificationResult.status}
              </h2>

              <p>
                {verificationResult.message}
              </p>

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
                  <span>Verified On</span>

                  <strong>
                    {verificationResult.verifiedDate}
                  </strong>
                </div>

              </div>

            </div>

          </div>
        )}

      </>
    );
  };


  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="consumer-page">

      {/* ========================================================
          SIDEBAR
      ======================================================== */}

      <aside className="consumer-sidebar">

        {/* LOGO */}

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


        {/* ======================================================
            NAVIGATION
        ====================================================== */}

        <nav className="consumer-nav">

          {/* DASHBOARD */}

          <button
            className={
              activePage === "dashboard"
                ? "consumer-nav-item active"
                : "consumer-nav-item"
            }
            onClick={() =>
              setActivePage("dashboard")
            }
          >
            <span>⌂</span>
            Dashboard
          </button>


          {/* SCAN QR */}

          <button
            className="consumer-nav-item"
            onClick={handleScanQR}
          >
            <span>▦</span>
            Scan QR
          </button>


          {/* SHARE LOCATION */}

          <button
            className="consumer-nav-item"
            onClick={handleLocation}
          >
            <span>⌖</span>
            Share Location
          </button>


          {/* VERIFICATION RESULT */}

          <button
            className={
              activePage === "verification"
                ? "consumer-nav-item active"
                : "consumer-nav-item"
            }
            onClick={() =>
              setActivePage("verification")
            }
          >
            <span>◉</span>
            Verification Result
          </button>

        </nav>


        {/* ======================================================
            LOGOUT
        ====================================================== */}

        <button
          className="consumer-logout"
          onClick={onLogout}
        >
          ⇥
          <span>Logout</span>
        </button>

      </aside>


      {/* ========================================================
          MAIN CONTENT
      ======================================================== */}

      <main className="consumer-main">

        {/* ======================================================
            TOP BAR
        ====================================================== */}

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


        {/* ======================================================
            CONTENT
        ====================================================== */}

        <div className="consumer-content">

          {/* DASHBOARD PAGE */}

          {activePage === "dashboard" &&
            renderDashboard()}


          {/* ====================================================
              VERIFICATION RESULT PAGE
          ==================================================== */}

          {activePage === "verification" && (
            <>

              <div className="consumer-header">

                <div>

                  <h1>
                    Verification Result
                  </h1>

                  <p>
                    View the latest product
                    verification result.
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

                    <h2>
                      {verificationResult.status}
                    </h2>

                    <p>
                      {verificationResult.message}
                    </p>

                    <div className="verification-details">

                      <div>
                        <span>Product</span>

                        <strong>
                          {
                            verificationResult.product
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Manufacturer</span>

                        <strong>
                          {
                            verificationResult.manufacturer
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Date</span>

                        <strong>
                          {
                            verificationResult.verifiedDate
                          }
                        </strong>
                      </div>

                    </div>

                  </div>

                </div>

              ) : (

                <div className="empty-verification">

                  <div>✓</div>

                  <h2>
                    No Verification Result
                  </h2>

                  <p>
                    Scan or verify a product
                    to see the result here.
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