import React, { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "./AdminDashboard.css";


// =========================================================
// LEAFLET MARKER FIX
// =========================================================

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",

  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",

  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
});


// =========================================================
// ICON COMPONENT
// =========================================================

function Icon({ type, size = 20 }) {

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  const icons = {

    home: (
      <svg {...common}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),

    users: (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M18 14c1.8.7 2.8 2.3 3 5" />
      </svg>
    ),

    box: (
      <svg {...common}>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4 7.5 8 4.5 8-4.5" />
        <path d="M12 12v9" />
      </svg>
    ),

    shield: (
      <svg {...common}>
        <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),

    alert: (
      <svg {...common}>
        <path d="M12 3 22 20H2L12 3Z" />
        <path d="M12 9v4" />
        <circle
          cx="12"
          cy="16.5"
          r=".5"
          fill="currentColor"
        />
      </svg>
    ),

    location: (
      <svg {...common}>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),

    blockchain: (
      <svg {...common}>
        <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
        <path d="m12 7 4 2.3v5.4l-4 2.3-4-2.3V9.3L12 7Z" />
      </svg>
    ),

    bell: (
      <svg {...common}>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    ),

    settings: (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.6-1H6v-2.4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L7.3 8.6 9 6.9l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19 8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v2.4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
      </svg>
    ),

    search: (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 5 5" />
      </svg>
    ),

    logout: (
      <svg {...common}>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M14 4h6v16h-6" />
      </svg>
    ),

    calendar: (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4M8 2v4M3 9h18" />
      </svg>
    ),

    chevron: (
      <svg {...common}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    ),

    arrow: (
      <svg {...common}>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    ),

    check: (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    ),

    menu: (
      <svg {...common}>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    )
  };

  return icons[type] || null;
}


// =========================================================
// MAP CONTROLLER
// =========================================================

function MapController({ selectedLocation }) {

  const map = useMap();

  useEffect(() => {

    if (!selectedLocation) {
      return;
    }

    map.flyTo(
      [
        selectedLocation.latitude,
        selectedLocation.longitude
      ],
      12,
      {
        duration: 1.2
      }
    );

  }, [selectedLocation, map]);

  return null;
}


// =========================================================
// MAIN ADMIN DASHBOARD
// =========================================================

function AdminDashboard({ onLogout }) {

  const [activePage, setActivePage] =
    useState(
      localStorage.getItem(
        "adminActivePage"
      ) || "dashboard"
    );

  const [searchText, setSearchText] =
    useState("");

  const [showNotifications, setShowNotifications] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);

  const [showDatePicker, setShowDatePicker] =
    useState(false);

  const [selectedLocation, setSelectedLocation] =
    useState(null);

  const [toast, setToast] =
    useState("");

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [dashboardData, setDashboardData] =
    useState({

      stats: {
        totalProducts: 0,
        totalScans: 0,
        genuineScans: 0,
        suspiciousScans: 0,
        fakeScans: 0,
        totalManufacturers: 0,
        pendingManufacturers: 0,
        verifiedManufacturers: 0,
        rejectedManufacturers: 0,
        suspendedManufacturers: 0
      },

      manufacturers: [],
      products: [],
      recentVerifications: [],
      alerts: [],
      locations: [],
      verificationActivity: [],
      blockchainRecords: []
    });


  // =====================================================
  // LOAD REAL ADMIN DATA
  // =====================================================

  const loadDashboardData = async () => {

    try {

      setLoading(true);
      setError("");

      const token =
        localStorage.getItem("token");

      if (!token) {
        throw new Error(
          "Admin login session not found. Please login again."
        );
      }

      const response =
        await fetch(
          "http://localhost:5000/api/admin/dashboard",
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");

          throw new Error(
            "Admin session expired or unauthorized. Please login again."
          );
        }

        throw new Error(
          data.message ||
          "Failed to load admin dashboard"
        );
      }

      setDashboardData(data);

    } catch (err) {

      console.error(
        "Admin dashboard error:",
        err
      );

      setError(
        err.message ||
        "Unable to load dashboard data."
      );

    } finally {

      setLoading(false);
    }
  };


  // =====================================================
  // LOAD DATA ON DASHBOARD OPEN
  // =====================================================

  useEffect(() => {

    loadDashboardData();

  }, []);


  // =====================================================
  // SAVE ACTIVE PAGE ONLY
  // =====================================================

  useEffect(() => {

    localStorage.setItem(
      "adminActivePage",
      activePage
    );

  }, [activePage]);


  // =====================================================
  // TOAST
  // =====================================================

  const showToast = (message) => {

    setToast(message);

    setTimeout(() => {
      setToast("");
    }, 2500);
  };


  // =====================================================
  // NAVIGATION
  // =====================================================

  const navigate = (page) => {

    setActivePage(page);
    setSidebarOpen(false);
    setSearchText("");

  };


  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout = () => {

    const confirmed =
      window.confirm(
        "Are you sure you want to logout?"
      );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    localStorage.removeItem(
      "adminActivePage"
    );

    localStorage.removeItem(
      "adminAlerts"
    );

    localStorage.removeItem(
      "adminManufacturers"
    );

    localStorage.removeItem(
      "adminLocations"
    );

    localStorage.removeItem(
      "adminBlocks"
    );

    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/";
    }
  };


  // =====================================================
  // DATA SHORTCUTS
  // =====================================================

  const {
    stats,
    manufacturers,
    products,
    recentVerifications,
    alerts,
    locations,
    verificationActivity,
    blockchainRecords
  } = dashboardData;


  // =====================================================
  // SEARCH
  // =====================================================

  const searchResults =
    useMemo(() => {

      if (!searchText.trim()) {
        return [];
      }

      const text =
        searchText
          .toLowerCase()
          .trim();

      const results = [];

      const pages = [
        {
          name: "Dashboard",
          key: "dashboard"
        },
        {
          name: "Manufacturer Management",
          key: "manufacturers"
        },
        {
          name: "Product Monitoring",
          key: "products"
        },
        {
          name: "Counterfeit Activity",
          key: "counterfeit"
        },
        {
          name: "Fraud Alerts",
          key: "alerts"
        },
        {
          name: "Scan Locations",
          key: "locations"
        },
        {
          name: "Blockchain Records",
          key: "blockchain"
        }
      ];

      pages.forEach((page) => {

        if (
          page.name
            .toLowerCase()
            .includes(text)
        ) {
          results.push({
            type: "page",
            ...page
          });
        }

      });


      manufacturers.forEach(
        (manufacturer) => {

          const company =
            manufacturer.companyName ||
            "";

          const userName =
            manufacturer.userId?.name ||
            "";

          if (
            company
              .toLowerCase()
              .includes(text) ||
            userName
              .toLowerCase()
              .includes(text)
          ) {

            results.push({
              type: "manufacturer",
              ...manufacturer
            });

          }

        }
      );


      products.forEach(
        (product) => {

          if (
            product.productCode
              ?.toLowerCase()
              .includes(text) ||
            product.productName
              ?.toLowerCase()
              .includes(text) ||
            product.brandName
              ?.toLowerCase()
              .includes(text)
          ) {

            results.push({
              type: "product",
              ...product
            });

          }

        }
      );


      alerts.forEach(
        (alert) => {

          const productName =
            alert.productId?.productName ||
            "";

          if (
            productName
              .toLowerCase()
              .includes(text) ||
            alert.productCode
              ?.toLowerCase()
              .includes(text) ||
            alert.status
              ?.toLowerCase()
              .includes(text)
          ) {

            results.push({
              type: "alert",
              ...alert
            });

          }

        }
      );


      return results.slice(0, 10);

    }, [
      searchText,
      manufacturers,
      products,
      alerts
    ]);


  // =====================================================
  // SEARCH RESULT CLICK
  // =====================================================

  const handleSearchResult =
    (result) => {

      if (
        result.type === "page"
      ) {
        navigate(result.key);
      }

      if (
        result.type === "manufacturer"
      ) {
        navigate("manufacturers");
      }

      if (
        result.type === "product"
      ) {
        navigate("products");
      }

      if (
        result.type === "alert"
      ) {
        navigate("alerts");
      }

      setSearchText("");
    };


  // =====================================================
  // MANUFACTURER ACTIONS
  // =====================================================

  const updateManufacturer =
    async (id, action) => {

      try {

        const token =
          localStorage.getItem("token");

        const response =
          await fetch(
            `http://localhost:5000/api/admin/manufacturers/${id}/${action}`,
            {
              method: "PUT",

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            `Unable to ${action} manufacturer`
          );
        }

        showToast(
          data.message ||
          `Manufacturer ${action}d successfully.`
        );

        await loadDashboardData();

      } catch (err) {

        console.error(
          "Manufacturer action error:",
          err
        );

        showToast(
          err.message ||
          "Manufacturer action failed."
        );
      }
    };


  // =====================================================
  // CALCULATE MANUFACTURER DISPLAY DATA
  // =====================================================

  const manufacturerDisplayData =
    useMemo(() => {

      return manufacturers.map(
        (manufacturer) => {

          const manufacturerId =
            manufacturer._id;

          const manufacturerProducts =
            products.filter(
              (product) => {

                const productManufacturer =
                  product.manufacturerId;

                if (
                  typeof productManufacturer ===
                  "object"
                ) {
                  return (
                    productManufacturer?._id ===
                    manufacturerId
                  );
                }

                return (
                  productManufacturer ===
                  manufacturerId
                );
              }
            );


          const manufacturerVerifications =
            recentVerifications.filter(
              (verification) => {

                const product =
                  verification.productId;

                return (
                  product?.manufacturerId ===
                  manufacturerId
                );
              }
            );


          const genuine =
            manufacturerVerifications.filter(
              (item) =>
                item.status ===
                "GENUINE"
            ).length;


          const counterfeit =
            manufacturerVerifications.filter(
              (item) =>
                item.status ===
                  "FAKE" ||
                item.status ===
                  "SUSPICIOUS"
            ).length;


          return {

            ...manufacturer,

            displayName:
              manufacturer.companyName ||
              manufacturer.userId?.name ||
              "Unknown Manufacturer",

            productCount:
              manufacturerProducts.length,

            genuine,

            counterfeit
          };

        }
      );

    }, [
      manufacturers,
      products,
      recentVerifications
    ]);


  // =====================================================
  // VERIFICATION CHART DATA
  // =====================================================

  const chartData =
    useMemo(() => {

      const grouped = {};

      verificationActivity.forEach(
        (item) => {

          const date =
            item._id?.date;

          const status =
            item._id?.status;

          if (!date) {
            return;
          }

          if (!grouped[date]) {

            grouped[date] = {
              date,
              genuine: 0,
              counterfeit: 0
            };

          }

          if (
            status === "GENUINE"
          ) {

            grouped[date].genuine +=
              item.count;

          }

          if (
            status === "FAKE" ||
            status === "SUSPICIOUS"
          ) {

            grouped[date].counterfeit +=
              item.count;

          }

        }
      );


      return Object.values(grouped)
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        )
        .slice(-7);

    }, [
      verificationActivity
    ]);


  // =====================================================
  // FORMAT DATE
  // =====================================================

  const formatDate = (date) => {

    if (!date) {
      return "Unknown";
    }

    return new Date(date)
      .toLocaleString(
        "en-IN",
        {
          dateStyle: "medium",
          timeStyle: "short"
        }
      );
  };


  // =====================================================
  // STATUS LABEL
  // =====================================================

  const statusLabel = (status) => {

    if (!status) {
      return "UNKNOWN";
    }

    return status
      .charAt(0)
      .toUpperCase() +
      status
        .slice(1)
        .toLowerCase();
  };


  // =====================================================
  // DASHBOARD
  // =====================================================

  const renderDashboard = () => {

    const genuinePercentage =
      stats.totalScans > 0
        ? (
            (stats.genuineScans /
              stats.totalScans) *
            100
          ).toFixed(1)
        : 0;


    const counterfeitTotal =
      stats.fakeScans +
      stats.suspiciousScans;


    const counterfeitPercentage =
      stats.totalScans > 0
        ? (
            (counterfeitTotal /
              stats.totalScans) *
            100
          ).toFixed(1)
        : 0;


    return (
      <>

        <div className="page-heading-row">

          <div>

            <h1>
              Admin Dashboard
            </h1>

            <p>
              Live platform overview from
              MongoDB verification data.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Refresh Data
          </button>

        </div>


        {/* STAT CARDS */}

        <div className="stats-grid">

          <StatCard
            icon="box"
            iconClass="blue"
            title="Total Products"
            value={stats.totalProducts.toLocaleString()}
            change="Live"
            subtitle="from database"
          />

          <StatCard
            icon="blockchain"
            iconClass="blue"
            title="Total Scans"
            value={stats.totalScans.toLocaleString()}
            change="Live"
            subtitle="verification records"
          />

          <StatCard
            icon="shield"
            iconClass="green"
            title="Genuine Scans"
            value={stats.genuineScans.toLocaleString()}
            change={`${genuinePercentage}%`}
            subtitle="of verification scans"
            green
          />

          <StatCard
            icon="alert"
            iconClass="red"
            title="Counterfeit Detected"
            value={counterfeitTotal.toLocaleString()}
            change={`${counterfeitPercentage}%`}
            subtitle="fake + suspicious"
            red
          />

          <StatCard
            icon="users"
            iconClass="purple"
            title="Manufacturers"
            value={stats.totalManufacturers.toLocaleString()}
            change={`${stats.pendingManufacturers} pending`}
            subtitle={`${stats.verifiedManufacturers} verified`}
          />

        </div>


        {/* MIDDLE ROW */}

        <div className="dashboard-middle-grid">

          {/* SCAN OVERVIEW */}

          <div className="dashboard-card scan-overview-card">

            <div className="card-header">

              <div>

                <h2>
                  Scan Overview
                </h2>

                <p className="card-subtitle">
                  Real verification activity
                </p>

              </div>

            </div>


            <div className="chart-legend">

              <span>
                <i className="legend-blue"></i>
                Genuine Scans
              </span>

              <span>
                <i className="legend-red"></i>
                Counterfeit Scans
              </span>

            </div>


            {chartData.length === 0 ? (

              <div className="empty-state">

                <div className="empty-icon">
                  <Icon
                    type="blockchain"
                    size={35}
                  />
                </div>

                <h2>
                  No verification activity yet
                </h2>

                <p>
                  The chart will populate after
                  products are scanned.
                </p>

              </div>

            ) : (

              <LiveChart
                data={chartData}
              />

            )}

          </div>


          {/* PRODUCT DISTRIBUTION */}

          <div className="dashboard-card">

            <div className="card-header">

              <div>

                <h2>
                  Verification Distribution
                </h2>

                <p className="card-subtitle">
                  Current verification results
                </p>

              </div>

            </div>


            <div className="distribution-list">

              <DistributionItem
                color="green"
                title="Genuine"
                percentage={`${genuinePercentage}%`}
                count={stats.genuineScans}
              />

              <DistributionItem
                color="red"
                title="Fake"
                percentage={
                  stats.totalScans > 0
                    ? `${(
                        (stats.fakeScans /
                          stats.totalScans) *
                        100
                      ).toFixed(1)}%`
                    : "0%"
                }
                count={stats.fakeScans}
              />

              <DistributionItem
                color="orange"
                title="Suspicious"
                percentage={
                  stats.totalScans > 0
                    ? `${(
                        (stats.suspiciousScans /
                          stats.totalScans) *
                        100
                      ).toFixed(1)}%`
                    : "0%"
                }
                count={stats.suspiciousScans}
              />

            </div>

          </div>

        </div>


        {/* RECENT VERIFICATIONS */}

        <div className="dashboard-card full-card">

          <div className="card-header">

            <div>

              <h2>
                Recent Verification Activity
              </h2>

              <p className="card-subtitle">
                Latest product verification records
              </p>

            </div>

            <button
              className="view-link"
              onClick={() =>
                navigate("products")
              }
            >
              View Products
            </button>

          </div>


          {recentVerifications.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Icon
                  type="shield"
                  size={35}
                />
              </div>

              <h2>
                No verification records yet
              </h2>

              <p>
                Scan a registered product to
                create the first verification record.
              </p>

            </div>

          ) : (

            <div className="activity-list">

              {recentVerifications
                .slice(0, 8)
                .map((verification) => (

                  <div
                    className="activity-row"
                    key={verification._id}
                  >

                    <div className="activity-alert-icon">

                      <Icon
                        type={
                          verification.status ===
                          "GENUINE"
                            ? "shield"
                            : "alert"
                        }
                        size={20}
                      />

                    </div>


                    <div className="activity-details">

                      <strong>
                        {verification.productId
                          ?.productName ||
                          "Unknown Product"}
                      </strong>

                      <span>
                        {verification.productCode}
                        {" • "}
                        {verification.verificationType}
                      </span>

                      <small>
                        {formatDate(
                          verification.createdAt
                        )}
                      </small>

                    </div>


                    <span
                      className={
                        verification.status ===
                        "GENUINE"
                          ? "green-text"
                          : "danger-text"
                      }
                    >
                      {statusLabel(
                        verification.status
                      )}
                    </span>

                  </div>

                ))}

            </div>

          )}

        </div>

      </>
    );
  };


  // =====================================================
  // MANUFACTURERS
  // =====================================================

  const renderManufacturers = () => {

    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Manufacturer Management
            </h1>

            <p>
              Manage real manufacturer accounts
              registered on the platform.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Refresh Data
          </button>

        </div>


        <div className="dashboard-card full-card">

          <div className="management-summary">

            <div>
              <span>
                Total Manufacturers
              </span>

              <strong>
                {stats.totalManufacturers}
              </strong>
            </div>


            <div>
              <span>
                Verified
              </span>

              <strong>
                {stats.verifiedManufacturers}
              </strong>
            </div>


            <div>
              <span>
                Pending
              </span>

              <strong>
                {stats.pendingManufacturers}
              </strong>
            </div>

          </div>


          {manufacturers.length === 0 ? (

            <div className="empty-state">

              <h2>
                No manufacturers found
              </h2>

            </div>

          ) : (

            <div className="management-table">

              <table>

                <thead>

                  <tr>

                    <th>
                      Manufacturer
                    </th>

                    <th>
                      Products
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Contact
                    </th>

                    <th>
                      Actions
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {manufacturerDisplayData.map(
                    (manufacturer) => (

                      <tr
                        key={
                          manufacturer._id
                        }
                      >

                        <td>

                          <div className="manufacturer-name">

                            <div className="manufacturer-avatar">

                              {manufacturer.displayName
                                .charAt(0)
                                .toUpperCase()}

                            </div>

                            <div>

                              <strong>
                                {
                                  manufacturer.displayName
                                }
                              </strong>

                              <small>
                                {
                                  manufacturer.userId
                                    ?.email ||
                                  "No email"
                                }
                              </small>

                            </div>

                          </div>

                        </td>


                        <td>
                          {
                            manufacturer.productCount
                          }
                        </td>


                        <td>

                          <span
                            className={
                              manufacturer.verificationStatus ===
                              "VERIFIED"
                                ? "green-text"
                                : manufacturer.verificationStatus ===
                                  "REJECTED"
                                ? "danger-text"
                                : ""
                            }
                          >
                            {statusLabel(
                              manufacturer.verificationStatus
                            )}
                          </span>

                        </td>


                        <td>
                          {
                            manufacturer.contactNumber ||
                            "N/A"
                          }
                        </td>


                        <td>

                          {manufacturer.verificationStatus ===
                            "PENDING" && (

                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap"
                              }}
                            >

                              <button
                                className="primary-button"
                                onClick={() =>
                                  updateManufacturer(
                                    manufacturer._id,
                                    "approve"
                                  )
                                }
                              >
                                Approve
                              </button>

                              <button
                                className="delete-button"
                                onClick={() =>
                                  updateManufacturer(
                                    manufacturer._id,
                                    "reject"
                                  )
                                }
                              >
                                Reject
                              </button>

                            </div>

                          )}

                          {manufacturer.verificationStatus !==
                            "PENDING" && (
                            <span>
                              No action
                            </span>
                          )}

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // PRODUCTS
  // =====================================================

  const renderProducts = () => {

    const genuineProducts =
      products.filter(
        (product) =>
          product.verificationStatus ===
          "GENUINE"
      ).length;

    const suspiciousProducts =
      products.filter(
        (product) =>
          product.verificationStatus ===
          "SUSPICIOUS"
      ).length;

    const fakeProducts =
      products.filter(
        (product) =>
          product.verificationStatus ===
          "FAKE"
      ).length;


    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Product Monitoring
            </h1>

            <p>
              Monitor real products registered
              in the platform.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Refresh Data
          </button>

        </div>


        <div className="monitor-grid">

          <MonitorCard
            title="Total Products"
            value={products.length}
            change="Live"
            icon="box"
          />

          <MonitorCard
            title="Genuine Products"
            value={genuineProducts}
            change="Registered"
            icon="shield"
            green
          />

          <MonitorCard
            title="Suspicious Products"
            value={suspiciousProducts}
            change="Flagged"
            icon="alert"
          />

          <MonitorCard
            title="Fake Products"
            value={fakeProducts}
            change="Flagged"
            icon="alert"
            danger
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <div>

              <h2>
                Registered Products
              </h2>

              <p className="card-subtitle">
                Products currently stored in MongoDB
              </p>

            </div>

          </div>


          {products.length === 0 ? (

            <div className="empty-state">

              <h2>
                No products registered
              </h2>

            </div>

          ) : (

            <div className="management-table">

              <table>

                <thead>

                  <tr>

                    <th>
                      Product
                    </th>

                    <th>
                      Code
                    </th>

                    <th>
                      Brand
                    </th>

                    <th>
                      Category
                    </th>

                    <th>
                      Manufacturer
                    </th>

                    <th>
                      Scans
                    </th>

                    <th>
                      Status
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {products.map(
                    (product) => (

                      <tr
                        key={
                          product._id
                        }
                      >

                        <td>
                          <strong>
                            {
                              product.productName
                            }
                          </strong>
                        </td>

                        <td>
                          {
                            product.productCode
                          }
                        </td>

                        <td>
                          {
                            product.brandName
                          }
                        </td>

                        <td>
                          {
                            product.category
                          }
                        </td>

                        <td>
                          {
                            product.manufacturerId
                              ?.companyName ||
                            "Unknown"
                          }
                        </td>

                        <td>
                          {
                            product.totalScans ||
                            0
                          }
                        </td>

                        <td>

                          <span
                            className={
                              product.verificationStatus ===
                              "GENUINE"
                                ? "green-text"
                                : "danger-text"
                            }
                          >
                            {statusLabel(
                              product.verificationStatus
                            )}
                          </span>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // COUNTERFEIT ACTIVITY
  // =====================================================

  const renderCounterfeit = () => {

    const counterfeit =
      alerts;


    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Counterfeit Activity
            </h1>

            <p>
              Real suspicious and counterfeit
              verification activity.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Refresh
          </button>

        </div>


        <div className="monitor-grid">

          <MonitorCard
            title="Total Detected"
            value={
              stats.fakeScans +
              stats.suspiciousScans
            }
            change="Live"
            icon="alert"
            danger
          />

          <MonitorCard
            title="Fake"
            value={stats.fakeScans}
            change="Verification records"
            icon="alert"
            danger
          />

          <MonitorCard
            title="Suspicious"
            value={stats.suspiciousScans}
            change="Verification records"
            icon="shield"
          />

          <MonitorCard
            title="Image Checks"
            value={
              recentVerifications.filter(
                (item) =>
                  item.verificationType ===
                  "IMAGE"
              ).length
            }
            change="Recent records"
            icon="box"
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Recent Counterfeit Activity
            </h2>

            <span className="danger-badge">
              {counterfeit.length} Records
            </span>

          </div>


          {counterfeit.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Icon
                  type="shield"
                  size={35}
                />
              </div>

              <h2>
                No Counterfeit Activity
              </h2>

              <p>
                No fake or suspicious verification
                records have been detected.
              </p>

            </div>

          ) : (

            <div className="activity-list">

              {counterfeit.map(
                (verification) => (

                  <div
                    className="activity-row"
                    key={
                      verification._id
                    }
                  >

                    <div className="activity-alert-icon">

                      <Icon
                        type="alert"
                        size={20}
                      />

                    </div>


                    <div className="activity-details">

                      <strong>

                        {verification.productId
                          ?.productName ||
                          "Unknown Product"}

                      </strong>

                      <span>

                        {verification.productCode}
                        {" • "}
                        {verification.verificationType}

                      </span>

                      <small>

                        {formatDate(
                          verification.createdAt
                        )}

                      </small>

                    </div>


                    <span className="danger-text">

                      {statusLabel(
                        verification.status
                      )}

                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // ALERTS
  // =====================================================

  const renderAlerts = () => {

    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Fraud Alerts
            </h1>

            <p>
              Alerts generated from actual
              suspicious and fake verifications.
            </p>

          </div>

          <div className="alert-count">
            {alerts.length} Active Alerts
          </div>

        </div>


        <div className="dashboard-card full-card">

          {alerts.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Icon
                  type="shield"
                  size={35}
                />
              </div>

              <h2>
                No Active Alerts
              </h2>

              <p>
                No suspicious or fake verification
                activity has been recorded.
              </p>

            </div>

          ) : (

            <div className="full-alert-list">

              {alerts.map(
                (alert) => (

                  <div
                    className="full-alert-row"
                    key={alert._id}
                  >

                    <div className="full-alert-icon">

                      <Icon
                        type="alert"
                        size={22}
                      />

                    </div>


                    <div className="full-alert-info">

                      <h3>
                        {alert.status ===
                        "FAKE"
                          ? "Counterfeit Product Detected"
                          : "Suspicious Product Detected"}
                      </h3>

                      <p>
                        Product:{" "}
                        {alert.productId
                          ?.productName ||
                          "Unknown Product"}
                      </p>

                      <p>
                        Code:{" "}
                        {alert.productCode}
                      </p>

                      <p>
                        Type:{" "}
                        {alert.verificationType}
                      </p>

                    </div>


                    <span>
                      {formatDate(
                        alert.createdAt
                      )}
                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // LOCATIONS
  // =====================================================

  const renderLocations = () => {

    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Scan Locations
            </h1>

            <p>
              View actual product verification
              activity by GPS location.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={() => {
              setSelectedLocation(null);
              loadDashboardData();
            }}
          >
            Refresh Map
          </button>

        </div>


        <div className="dashboard-card map-card-large">

          <MapContainer
            center={[
              20.5937,
              78.9629
            ]}
            zoom={5}
            scrollWheelZoom={true}
            className="admin-map"
          >

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            <MapController
              selectedLocation={
                selectedLocation
              }
            />


            {locations.map(
              (location, index) => (

                <Marker
                  key={`${location.latitude}-${location.longitude}-${index}`}
                  position={[
                    location.latitude,
                    location.longitude
                  ]}
                >

                  <Popup>

                    <div className="map-popup">

                      <h3>
                        Verification Location
                      </h3>

                      <p>
                        Latitude:{" "}
                        {Number(
                          location.latitude
                        ).toFixed(6)}
                      </p>

                      <p>
                        Longitude:{" "}
                        {Number(
                          location.longitude
                        ).toFixed(6)}
                      </p>

                      <strong>
                        {location.scans.toLocaleString()}
                        {" "}
                        scans
                      </strong>

                      <span>
                        Genuine:{" "}
                        {location.genuine}
                        {" | "}
                        Suspicious:{" "}
                        {location.suspicious}
                        {" | "}
                        Fake:{" "}
                        {location.fake}
                      </span>

                    </div>

                  </Popup>

                </Marker>

              )
            )}

          </MapContainer>

        </div>


        <div className="dashboard-card location-full-list">

          <div className="card-header">

            <div>

              <h2>
                Top Scan Locations
              </h2>

              <p className="card-subtitle">
                These locations come directly
                from verification records.
              </p>

            </div>

            <span className="total-activity">
              {locations.length} Locations
            </span>

          </div>


          {locations.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Icon
                  type="location"
                  size={35}
                />
              </div>

              <h2>
                No Scan Locations Yet
              </h2>

              <p>
                The map will show a location after
                a product is actually verified.
              </p>

            </div>

          ) : (

            <div className="location-cards">

              {locations.map(
                (location, index) => (

                  <button
                    className={`location-select-card ${
                      selectedLocation ===
                      location
                        ? "selected"
                        : ""
                    }`}
                    key={`${location.latitude}-${location.longitude}-${index}`}
                    onClick={() =>
                      setSelectedLocation(
                        location
                      )
                    }
                  >

                    <div className="location-number">
                      {index + 1}
                    </div>


                    <div className="location-card-info">

                      <strong>
                        Verification Location
                      </strong>

                      <span>
                        {Number(
                          location.latitude
                        ).toFixed(6)}
                        {" , "}
                        {Number(
                          location.longitude
                        ).toFixed(6)}
                      </span>

                    </div>


                    <div className="location-card-count">

                      <strong>
                        {location.scans.toLocaleString()}
                      </strong>

                      <span>
                        scans
                      </span>

                    </div>

                  </button>

                )
              )}

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // BLOCKCHAIN
  // =====================================================

  const renderBlockchain = () => {

    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Blockchain Records
            </h1>

            <p>
              View blockchain hashes recorded
              for registered products.
            </p>

          </div>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Refresh
          </button>

        </div>


        <div className="monitor-grid">

          <MonitorCard
            title="Registered On Blockchain"
            value={
              blockchainRecords.length
            }
            change="Live"
            icon="blockchain"
          />

          <MonitorCard
            title="Products"
            value={
              products.length
            }
            change="MongoDB"
            icon="box"
          />

          <MonitorCard
            title="Verification Records"
            value={
              recentVerifications.length
            }
            change="Recent records"
            icon="shield"
          />

          <MonitorCard
            title="Network Status"
            value="Connected"
            change="Application online"
            icon="check"
            green
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Product Blockchain Records
            </h2>

            <span className="secure-badge">
              Blockchain Data
            </span>

          </div>


          {blockchainRecords.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Icon
                  type="blockchain"
                  size={35}
                />
              </div>

              <h2>
                No Blockchain Records Found
              </h2>

              <p>
                Registered products with a stored
                blockchain hash will appear here.
              </p>

            </div>

          ) : (

            <div className="block-full-list">

              {blockchainRecords.map(
                (record, index) => (

                  <div
                    className="block-full-row"
                    key={`${record.productCode}-${index}`}
                  >

                    <div className="block-icon large">

                      <Icon
                        type="blockchain"
                        size={22}
                      />

                    </div>


                    <div className="block-full-info">

                      <strong>
                        {record.productCode}
                      </strong>

                      <span>
                        {record.productName}
                      </span>

                      <small>
                        {record.manufacturer}
                      </small>

                    </div>


                    <div className="block-full-transactions">

                      <strong>
                        {record.blockchainHash
                          ? `${record.blockchainHash.slice(
                              0,
                              12
                            )}...`
                          : "N/A"}
                      </strong>

                      <span>
                        Blockchain Hash
                      </span>

                    </div>


                    <button
                      className="block-view"
                      onClick={() => {

                        if (
                          record.blockchainHash
                        ) {

                          navigator.clipboard
                            ?.writeText(
                              record.blockchainHash
                            );

                          showToast(
                            "Blockchain hash copied."
                          );

                        }

                      }}
                    >
                      Copy
                    </button>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </div>
    );
  };


  // =====================================================
  // NAVIGATION ITEMS
  // =====================================================

  const navigationItems = [

    {
      key: "dashboard",
      label: "Dashboard",
      icon: "home"
    },

    {
      key: "manufacturers",
      label: "Manufacturer Management",
      icon: "users"
    },

    {
      key: "products",
      label: "Product Monitoring",
      icon: "box"
    },

    {
      key: "counterfeit",
      label: "Counterfeit Activity",
      icon: "shield"
    },

    {
      key: "alerts",
      label: "Fraud Alerts",
      icon: "bell"
    },

    {
      key: "locations",
      label: "Scan Locations",
      icon: "location"
    },

    {
      key: "blockchain",
      label: "Blockchain Records",
      icon: "blockchain"
    }

  ];


  // =====================================================
  // RENDER PAGE
  // =====================================================

  const renderPage = () => {

    if (loading) {

      return (
        <div className="empty-state">

          <div className="empty-icon">
            <Icon
              type="blockchain"
              size={35}
            />
          </div>

          <h2>
            Loading Admin Dashboard...
          </h2>

          <p>
            Fetching live data from the backend.
          </p>

        </div>
      );
    }


    if (error) {

      return (
        <div className="empty-state">

          <div className="empty-icon">
            <Icon
              type="alert"
              size={35}
            />
          </div>

          <h2>
            Unable to Load Dashboard
          </h2>

          <p>
            {error}
          </p>

          <button
            className="primary-button"
            onClick={loadDashboardData}
          >
            Try Again
          </button>

        </div>
      );
    }


    switch (activePage) {

      case "manufacturers":
        return renderManufacturers();

      case "products":
        return renderProducts();

      case "counterfeit":
        return renderCounterfeit();

      case "alerts":
        return renderAlerts();

      case "locations":
        return renderLocations();

      case "blockchain":
        return renderBlockchain();

      default:
        return renderDashboard();
    }
  };


  // =====================================================
  // MAIN RETURN
  // =====================================================

  return (

    <div className="admin-layout">

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (

        <div
          className="sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
        />

      )}


      {/* SIDEBAR */}

      <aside
        className={`admin-sidebar ${
          sidebarOpen
            ? "sidebar-open"
            : ""
        }`}
      >

        {/* LOGO */}

        <div className="admin-brand">

          <div className="brand-logo">

            <img
              src="/logo.png"
              alt="Anti-Counterfeit"
            />

          </div>

          <div className="brand-text">

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

        <nav className="admin-nav">

          {navigationItems.map(
            (item) => (

              <button
                key={item.key}
                className={`nav-item ${
                  activePage ===
                  item.key
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  navigate(item.key)
                }
              >

                <Icon
                  type={item.icon}
                  size={22}
                />

                <span>
                  {item.label}
                </span>

              </button>

            )
          )}

        </nav>


        {/* SIDEBAR ILLUSTRATION */}

        <div className="sidebar-illustration">

          <div className="illustration-circle">

            <Icon
              type="shield"
              size={75}
            />

          </div>

          <div className="illustration-check">

            <Icon
              type="check"
              size={17}
            />

          </div>

        </div>


        {/* LOGOUT */}

        <button
          className="logout-button"
          onClick={handleLogout}
        >

          <Icon
            type="logout"
            size={21}
          />

          <span>
            Logout
          </span>

        </button>

      </aside>


      {/* MAIN */}

      <div className="admin-main">

        {/* TOPBAR */}

        <header className="admin-topbar">

          <button
            className="mobile-menu-button"
            onClick={() =>
              setSidebarOpen(
                !sidebarOpen
              )
            }
          >

            <Icon
              type="menu"
              size={23}
            />

          </button>


          {/* SEARCH */}

          <div className="search-wrapper">

            <div className="search-box">

              <Icon
                type="search"
                size={18}
              />

              <input
                type="text"
                placeholder="Search anything..."
                value={searchText}
                onChange={(e) =>
                  setSearchText(
                    e.target.value
                  )
                }
              />

            </div>


            {searchText && (

              <div className="search-results">

                {searchResults.length ===
                0 ? (

                  <div className="no-results">
                    No results found.
                  </div>

                ) : (

                  searchResults.map(
                    (result, index) => (

                      <button
                        key={index}
                        onClick={() =>
                          handleSearchResult(
                            result
                          )
                        }
                      >

                        <Icon
                          type={
                            result.type ===
                            "manufacturer"
                              ? "users"
                              : result.type ===
                                "product"
                              ? "box"
                              : result.type ===
                                "alert"
                              ? "alert"
                              : "home"
                          }
                          size={17}
                        />

                        <span>

                          {result.type ===
                          "page"
                            ? result.name
                            : result.type ===
                              "manufacturer"
                            ? result.companyName
                            : result.type ===
                              "product"
                            ? result.productName
                            : result.productCode}

                        </span>

                      </button>

                    )
                  )

                )}

              </div>

            )}

          </div>


          {/* TOPBAR RIGHT */}

          <div className="topbar-right">

            {/* NOTIFICATIONS */}

            <div className="topbar-dropdown">

              <button
                className="icon-button"
                onClick={() =>
                  setShowNotifications(
                    !showNotifications
                  )
                }
              >

                <Icon
                  type="bell"
                  size={22}
                />

                {alerts.length > 0 && (

                  <span className="notification-count">
                    {alerts.length}
                  </span>

                )}

              </button>


              {showNotifications && (

                <div className="notification-menu">

                  <div className="dropdown-title">
                    Notifications
                  </div>


                  {alerts
                    .slice(0, 5)
                    .map(
                      (alert) => (

                        <button
                          key={alert._id}
                          onClick={() => {

                            setShowNotifications(
                              false
                            );

                            navigate(
                              "alerts"
                            );

                          }}
                        >

                          <Icon
                            type="alert"
                            size={18}
                          />

                          <div>

                            <strong>

                              {alert.status ===
                              "FAKE"
                                ? "Counterfeit detected"
                                : "Suspicious verification"}

                            </strong>

                            <span>
                              {
                                alert.productCode
                              }
                            </span>

                          </div>

                        </button>

                      )
                    )}


                  {alerts.length ===
                    0 && (

                    <div className="no-results">
                      No new alerts.
                    </div>

                  )}

                </div>

              )}

            </div>


            {/* SETTINGS */}

            <button
              className="icon-button"
              onClick={() =>
                showToast(
                  "Settings panel coming soon."
                )
              }
            >

              <Icon
                type="settings"
                size={22}
              />

            </button>


            <div className="topbar-divider"></div>


            {/* PROFILE */}

            <div className="profile-wrapper">

              <button
                className="profile-button"
                onClick={() =>
                  setShowProfile(
                    !showProfile
                  )
                }
              >

                <div className="profile-avatar">

                  <Icon
                    type="shield"
                    size={25}
                  />

                </div>

                <div className="profile-info">

                  <strong>
                    Admin
                  </strong>

                  <span>
                    Super Administrator
                  </span>

                </div>

                <Icon
                  type="chevron"
                  size={17}
                />

              </button>


              {showProfile && (

                <div className="profile-menu">

                  <button
                    onClick={() =>
                      showToast(
                        "Profile selected."
                      )
                    }
                  >
                    My Profile
                  </button>

                  <button
                    onClick={() =>
                      showToast(
                        "Account settings selected."
                      )
                    }
                  >
                    Account Settings
                  </button>

                  <button
                    className="profile-logout"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>

                </div>

              )}

            </div>

          </div>

        </header>


        {/* CONTENT */}

        <main className="admin-content">

          {renderPage()}

        </main>

      </div>


      {/* TOAST */}

      {toast && (

        <div className="admin-toast">

          <Icon
            type="check"
            size={18}
          />

          <span>
            {toast}
          </span>

        </div>

      )}

    </div>

  );
}


// =========================================================
// LIVE CHART
// =========================================================

function LiveChart({ data }) {

  const width = 700;
  const height = 230;

  const maxValue =
    Math.max(
      1,
      ...data.flatMap(
        (item) => [
          item.genuine,
          item.counterfeit
        ]
      )
    );


  const makePoints =
    (key) => {

      if (data.length === 1) {

        return `350,${
          height -
          (data[0][key] /
            maxValue) *
            190 -
          20
        }`;

      }

      return data
        .map(
          (item, index) => {

            const x =
              25 +
              (index *
                (width - 50)) /
                (data.length - 1);

            const y =
              height -
              20 -
              (item[key] /
                maxValue) *
                190;

            return `${x},${y}`;

          }
        )
        .join(" ");

    };


  return (

    <div className="simple-chart">

      <div className="chart-y-labels">

        <span>
          {maxValue}
        </span>

        <span>
          {Math.round(
            maxValue * 0.75
          )}
        </span>

        <span>
          {Math.round(
            maxValue * 0.5
          )}
        </span>

        <span>
          {Math.round(
            maxValue * 0.25
          )}
        </span>

        <span>
          0
        </span>

      </div>


      <div className="chart-area">

        <div className="chart-grid-line line-1"></div>
        <div className="chart-grid-line line-2"></div>
        <div className="chart-grid-line line-3"></div>
        <div className="chart-grid-line line-4"></div>
        <div className="chart-grid-line line-5"></div>


        <svg
          className="scan-line-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >

          <polyline
            points={makePoints("genuine")}
            fill="none"
            stroke="#1468ee"
            strokeWidth="3"
          />

          <polyline
            points={makePoints("counterfeit")}
            fill="none"
            stroke="#ef3d3d"
            strokeWidth="3"
          />

        </svg>


        <div className="chart-days">

          {data.map(
            (item) => (

              <span
                key={item.date}
              >
                {item.date.slice(5)}
              </span>

            )
          )}

        </div>

      </div>

    </div>

  );
}


// =========================================================
// STAT CARD
// =========================================================

function StatCard({
  icon,
  iconClass,
  title,
  value,
  change,
  subtitle,
  green,
  red
}) {

  return (

    <div className="stat-card">

      <div
        className={`stat-icon ${iconClass}`}
      >

        <Icon
          type={icon}
          size={28}
        />

      </div>


      <div className="stat-content">

        <span className="stat-title">
          {title}
        </span>

        <strong className="stat-value">
          {value}
        </strong>

        <span
          className={`stat-change ${
            green
              ? "green"
              : red
              ? "red"
              : ""
          }`}
        >
          {change}
        </span>

        <span className="stat-subtitle">
          {subtitle}
        </span>

      </div>

    </div>

  );
}


// =========================================================
// DISTRIBUTION ITEM
// =========================================================

function DistributionItem({
  color,
  title,
  percentage,
  count
}) {

  return (

    <div className="distribution-item">

      <span
        className={`distribution-dot ${color}`}
      ></span>

      <div>

        <strong>
          {title}
        </strong>

        <span>
          {percentage} ({count})
        </span>

      </div>

    </div>

  );
}


// =========================================================
// MONITOR CARD
// =========================================================

function MonitorCard({
  title,
  value,
  change,
  icon,
  danger,
  green
}) {

  return (

    <div className="monitor-card">

      <div
        className={`monitor-icon ${
          danger
            ? "danger"
            : green
            ? "green"
            : "blue"
        }`}
      >

        <Icon
          type={icon}
          size={25}
        />

      </div>


      <div>

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

        <small
          className={
            danger
              ? "danger-text"
              : green
              ? "green-text"
              : ""
          }
        >
          {change}
        </small>

      </div>

    </div>

  );
}


export default AdminDashboard;