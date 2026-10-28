import React, { useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

import L from "leaflet";

import { apiUrl } from "./api";
import { fetchAdminDashboard, fetchAdminVerifications, fetchAdminProductLifecycle } from "./adminDashboardApi";

import "leaflet/dist/leaflet.css";
import "./AdminDashboard.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
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

function MapController({ selectedLocation }) {
  const map = useMap();
  useEffect(() => {
    if (selectedLocation) {
      map.flyTo([selectedLocation.latitude, selectedLocation.longitude], 12, { duration: 1.2 });
    }
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

  const [selectedLocation, setSelectedLocation] = useState(null);

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
        qrScans: null,
        imageVerifications: null,
        scoringStatusCounts: {
          SCORED: null,
          INSUFFICIENT_DATA: null,
          UNAVAILABLE: null
        },
        validLocationScans: null,
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
      blockchainRecords: [],
      locationDataAvailability: { available: false }
    });

  const [dashboardPages, setDashboardPages] = useState({
    products: 1,
    manufacturers: 1,
    recentVerifications: 1,
    alerts: 1,
    pageSize: 20
  });
  const [verificationRows, setVerificationRows] = useState([]);
  const [verificationPagination, setVerificationPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [verificationFilters, setVerificationFilters] = useState({ type: "", status: "", scoringStatus: "", productCode: "" });
  const [verificationPage, setVerificationPage] = useState(1);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [lifecycleProductCode, setLifecycleProductCode] = useState("");
  const [lifecycleDetail, setLifecycleDetail] = useState(null);
  const [lifecycleDetailLoading, setLifecycleDetailLoading] = useState(false);
  const [lifecycleDetailError, setLifecycleDetailError] = useState("");
  const [lifecycleDetailPage, setLifecycleDetailPage] = useState(1);

  const [pendingPartners, setPendingPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState("");
  const [partnersNotice, setPartnersNotice] = useState("");
  const [partnerActionId, setPartnerActionId] = useState("");


  // =====================================================
  // LOAD REAL ADMIN DATA
  // =====================================================

  const loadDashboardData = async (requestedPages = dashboardPages) => {

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

      let data;
      try {
        data = await fetchAdminDashboard({
          url: apiUrl("/admin/dashboard"),
          token,
          pages: requestedPages
        });
      } catch (requestError) {

        if (
          /expired|unauthorized|authentication|required|invalid/i.test(requestError.message)
        ) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
        throw requestError;
      }

      setDashboardData(data);
      setDashboardPages(requestedPages);

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

  const loadVerificationRecords = async (filters = verificationFilters, page = verificationPage) => {
    try {
      setVerificationLoading(true);
      setVerificationError("");
      const token = localStorage.getItem("token");
      const data = await fetchAdminVerifications({
        url: apiUrl("/admin/verifications"),
        token,
        filters,
        page,
        pageSize: 20
      });
      setVerificationRows(Array.isArray(data.verifications) ? data.verifications : []);
      setVerificationPagination(data.pagination || { page, pageSize: 20, total: 0, totalPages: 0 });
      setVerificationPage(page);
    } catch (requestError) {
      setVerificationError(requestError.message || "Verification records could not be loaded.");
      setVerificationRows([]);
    } finally {
      setVerificationLoading(false);
    }
  };

  const loadLifecycleDetail = async (productCode, page = 1) => {
    setLifecycleDetailLoading(true);
    setLifecycleDetailError("");
    setLifecycleProductCode(productCode);
    setLifecycleDetailPage(page);
    try {
      const data = await fetchAdminProductLifecycle({
        url: apiUrl(`/admin/products/${encodeURIComponent(productCode)}/lifecycle`),
        token: localStorage.getItem("token"),
        page,
        pageSize: 20
      });
      setLifecycleDetail(data);
    } catch (requestError) {
      setLifecycleDetail(null);
      setLifecycleDetailError(requestError.message || "Product lifecycle data could not be loaded.");
    } finally {
      setLifecycleDetailLoading(false);
    }
  };

  const changeDashboardPage = (section, page) => {
    const requestedPages = { ...dashboardPages, [section]: page };
    setDashboardPages(requestedPages);
    loadDashboardData(requestedPages);
  };

  const applyVerificationFilters = () => {
    setVerificationPage(1);
    loadVerificationRecords(verificationFilters, 1);
  };

  const openProductVerifications = (productCode) => {
    const filters = { ...verificationFilters, productCode };
    setVerificationFilters(filters);
    setVerificationPage(1);
    setActivePage("verifications");
    loadVerificationRecords(filters, 1);
  };

  const loadPendingPartners = async () => {
    try {
      setPartnersLoading(true);
      setPartnersError("");

      const token = localStorage.getItem("token");
      if (!token) throw new Error("Admin login session not found. Please log in again.");

      const response = await fetch(apiUrl("/admin/partners/pending"), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not load pending partner applications.");
      }

      setPendingPartners(Array.isArray(data.partners) ? data.partners : []);
    } catch (requestError) {
      setPartnersError(requestError.message || "Could not load pending partner applications.");
    } finally {
      setPartnersLoading(false);
    }
  };


  // =====================================================
  // LOAD DATA ON DASHBOARD OPEN
  // =====================================================

  useEffect(() => {

    loadDashboardData();
    if (localStorage.getItem("adminActivePage") === "partners") {
      loadPendingPartners();
    }
    if (localStorage.getItem("adminActivePage") === "verifications") loadVerificationRecords();

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
    if (page === "partners") {
      setPartnersNotice("");
      loadPendingPartners();
    }
    if (page === "verifications") {
      loadVerificationRecords(verificationFilters, 1);
    }

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
  const displayMetric = (value) =>
    Number.isFinite(value) ? value.toLocaleString() : "—";


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
          name: "Partner Applications",
          key: "partners"
        },
        {
          name: "Product Monitoring",
          key: "products"
        },
        {
          name: "Verification Event Log",
          key: "verifications"
        },
        {
          name: "Risk & Integrity Activity",
          key: "counterfeit"
        },
        {
          name: "Security Events",
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
            alert.product?.productName ||
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
            apiUrl(`/admin/manufacturers/${id}/${action}`),
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

  const updatePartner = async (partnerId, action) => {
    setPartnerActionId(`${partnerId}:${action}`);
    setPartnersError("");
    setPartnersNotice("");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Admin login session not found. Please log in again.");

      const response = await fetch(
        apiUrl(`/admin/partners/${partnerId}/${action}`),
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Unable to ${action} partner application.`);
      }

      setPartnersNotice(data.message || `Partner application ${action}d successfully.`);
      await loadPendingPartners();
    } catch (requestError) {
      setPartnersError(requestError.message || `Unable to ${action} partner application.`);
    } finally {
      setPartnerActionId("");
    }
  };


  // =====================================================
  // CALCULATE MANUFACTURER DISPLAY DATA
  // =====================================================

  const manufacturerDisplayData = manufacturers.map((manufacturer) => ({
    ...manufacturer,
    displayName: manufacturer.companyName || manufacturer.userId?.name || "Unknown Manufacturer"
  }));


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
              risk: 0,
              total: 0
            };

          }

          grouped[date].total += item.count;

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

            grouped[date].risk +=
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


    const fakePercentage =
      stats.totalScans > 0
        ? (
            (stats.fakeScans /
              stats.totalScans) *
            100
          ).toFixed(1)
        : 0;
    const suspiciousPercentage = stats.totalScans > 0
      ? ((stats.suspiciousScans / stats.totalScans) * 100).toFixed(1)
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
            title="Total Verifications"
            value={stats.totalScans.toLocaleString()}
            change="Live"
            subtitle="QR scans and image checks"
          />

          <StatCard
            icon="shield"
            iconClass="green"
            title="GENUINE outcomes"
            value={stats.genuineScans.toLocaleString()}
            change={`${genuinePercentage}%`}
            subtitle="stored verification records"
            green
          />

          <StatCard
            icon="alert"
            iconClass="red"
            title="FAKE outcomes"
            value={stats.fakeScans.toLocaleString()}
            change={`${fakePercentage}%`}
            subtitle="stored verification records"
            red
          />

          <StatCard
            icon="alert"
            iconClass="purple"
            title="SUSPICIOUS outcomes"
            value={stats.suspiciousScans.toLocaleString()}
            change={`${suspiciousPercentage}% · review signal`}
            subtitle="not a confirmed counterfeit count"
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

        <section className="dashboard-card full-card dashboard-metrics-card" aria-label="Verification and scan scoring metrics">
          <div className="card-header">
            <div>
              <h2>AI scan-risk assessment</h2>
              <p className="card-subtitle">These are stored model-assessment states for QR scans, separate from the verification outcome above.</p>
            </div>
          </div>
          <div className="dashboard-metrics-grid">
            <div className="dashboard-metric"><span>QR scans</span><strong>{displayMetric(stats.qrScans)}</strong></div>
            <div className="dashboard-metric"><span>Manual code lookups</span><strong>{displayMetric(stats.manualCodeLookups)}</strong></div>
            <div className="dashboard-metric"><span>Image verifications</span><strong>{displayMetric(stats.imageVerifications)}</strong></div>
            <div className="dashboard-metric scoring-scored"><span>SCORED</span><strong>{displayMetric(stats.scoringStatusCounts?.SCORED)}</strong></div>
            <div className="dashboard-metric scoring-insufficient"><span>INSUFFICIENT_DATA</span><strong>{displayMetric(stats.scoringStatusCounts?.INSUFFICIENT_DATA)}</strong></div>
            <div className="dashboard-metric scoring-unavailable"><span>UNAVAILABLE</span><strong>{displayMetric(stats.scoringStatusCounts?.UNAVAILABLE)}</strong><small>Not a safe result or a fraud finding.</small></div>
          </div>
          <p className="assessment-separation-note">A product’s stored verification outcome, its saved transaction reference, and its AI scan-risk assessment are separate records of evidence.</p>
        </section>


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
                Genuine outcomes
              </span>

              <span>
                <i className="legend-red"></i>
                Fake / suspicious outcomes
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
                title="FAKE outcomes"
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
                title="SUSPICIOUS outcomes"
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
                Stored result and AI assessment are shown as separate signals.
              </p>

            </div>

            <button
              className="view-link"
              onClick={() => navigate("verifications")}
            >
              Open event log
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
                        {verification.product
                          ?.productName ||
                          "Unknown Product"}
                      </strong>

                      <span>
                        <span className="type-mono">{verification.productCode}</span>
                        {" • "}
                        {verification.verificationType}
                      </span>

                      <small className="type-mono">
                        {formatDate(
                          verification.createdAt
                        )}
                      </small>

                    </div>


                    <div className="activity-assessments">
                      <VerificationOutcomeBadge status={verification.status} />
                      <ScoringStatusBadge verification={verification} />
                    </div>

                  </div>

                ))}

            </div>

          )}

          <PageControls
            page={dashboardData.pagination?.recentVerifications?.page || 1}
            totalPages={dashboardData.pagination?.recentVerifications?.totalPages || 0}
            total={dashboardData.pagination?.recentVerifications?.total || 0}
            onPageChange={(page) => changeDashboardPage("recentVerifications", page)}
            disabled={loading}
          />

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

                    <th>Activity</th>

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

          <PageControls
            page={dashboardData.pagination?.manufacturers?.page || 1}
            totalPages={dashboardData.pagination?.manufacturers?.totalPages || 0}
            total={dashboardData.pagination?.manufacturers?.total || 0}
            onPageChange={(page) => changeDashboardPage("manufacturers", page)}
            disabled={loading}
          />

        </div>

      </div>
    );
  };


  // =====================================================
  // PRODUCTS
  // =====================================================

  const renderProducts = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Product Monitoring
            </h1>

            <p>
              Product registration records and their saved verification metrics.
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
            value={stats.totalProducts}
            change="Live"
            icon="box"
          />

          <MonitorCard
            title="Records on this page"
            value={products.length}
            change="Paginated results"
            icon="shield"
          />

          <MonitorCard
            title="Saved transaction references"
            value={products.filter((product) => Boolean(product.transactionHash)).length}
            change="MongoDB records · not a live chain check"
            icon="blockchain"
          />

          <MonitorCard
            title="Live chain status"
            value="Not checked"
            change="No RPC read is performed by this page"
            icon="alert"
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <div>

              <h2>
                Registered Products
              </h2>

              <p className="card-subtitle">
                Stored product registration records; the current chain state is not fetched here.
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

                    <th>Verifications</th>

                    <th>
                      Status
                    </th>
                    <th>Actions</th>

                  </tr>

                </thead>


                <tbody>

                  {products.map(
                    (product) => (
              
                      <tr
                        key={product.productCode}
                      >

                        <td>
                          <strong>
                            {
                              product.productName
                            }
                          </strong>
                        </td>

                        <td>
                          <span className="type-mono">{product.productCode}</span>
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
                          {displayMetric(product.totalVerifications ?? product.totalScans)}
                        </td>

                        <td>

                          <span
  className="status registered"
>
  {product.status === "REGISTERED" ? "Registered in MongoDB" : "Status unavailable"}
</span>

                        </td>

                        <td className="product-admin-actions">
                          <button className="secondary-button" onClick={() => openProductVerifications(product.productCode)}>View verifications</button>
                          <button className="secondary-button" onClick={() => loadLifecycleDetail(product.productCode)}>Lifecycle details</button>
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

          <PageControls
            page={dashboardData.pagination?.products?.page || 1}
            totalPages={dashboardData.pagination?.products?.totalPages || 0}
            total={dashboardData.pagination?.products?.total || 0}
            onPageChange={(page) => changeDashboardPage("products", page)}
            disabled={loading}
          />

          {(lifecycleProductCode || lifecycleDetailLoading || lifecycleDetailError) && (
            <section className="dashboard-card lifecycle-admin-detail" aria-live="polite" aria-label="Product lifecycle and verification detail">
              <div className="card-header">
                <div>
                  <h2>Lifecycle and verification detail</h2>
                  <p className="card-subtitle">{lifecycleProductCode || "Selected product"} · blockchain state and stored records are shown separately.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => loadLifecycleDetail(lifecycleProductCode, lifecycleDetailPage)} disabled={lifecycleDetailLoading}>Refresh</button>
              </div>
              {lifecycleDetailLoading ? <div className="dashboard-state" role="status">Loading verified lifecycle and verification records…</div> : null}
              {lifecycleDetailError ? <div className="dashboard-state dashboard-state-error" role="alert">{lifecycleDetailError}</div> : null}
              {lifecycleDetail && !lifecycleDetailLoading && (
                <>
                  <div className="lifecycle-admin-summary">
                    <div><span>Registry</span><strong>V{lifecycleDetail.registry?.version || "?"}</strong><small>{lifecycleDetail.registry?.address || "Address unavailable"}</small></div>
                    <div><span>Chain</span><strong>{lifecycleDetail.registry?.chainId || "—"}</strong></div>
                    <div><span>Current chain state</span><strong>{lifecycleDetail.chain?.state || lifecycleDetail.chain?.status || "Unavailable"}</strong><small>Custodian {lifecycleDetail.chain?.currentCustodian ? `${lifecycleDetail.chain.currentCustodian.slice(0, 8)}…${lifecycleDetail.chain.currentCustodian.slice(-6)}` : "unavailable"}</small></div>
                  </div>
                  {lifecycleDetail.lifecycleHistoryStatus === "NOT_INDEXED_FOR_LEGACY_REGISTRY" && <p className="lifecycle-admin-note">Legacy V1 transition events were not indexed by the application. The current state is a live read when available; no historical events are inferred.</p>}
                  {lifecycleDetail.lifecycleHistoryStatus === "REGISTRY_IDENTITY_UNRESOLVED" && <p className="lifecycle-admin-note">Saved chain and registry provenance is incomplete or conflicting. No registry was queried and no lifecycle history is attributed to this product.</p>}
                  <h3 className="lifecycle-admin-subheading">Confirmed custody events</h3>
                  {lifecycleDetail.lifecycle?.length ? (
                    <div className="verification-table-wrap"><table className="verification-table"><thead><tr><th>Action</th><th>State change</th><th>Actor</th><th>Custodian</th><th>Transaction</th><th>Confirmed at</th></tr></thead><tbody>
                      {lifecycleDetail.lifecycle.map((event) => <tr key={`${event.transactionHash}:${event.logIndex}`}><td>{event.action}</td><td>{["MINTED", "DISPATCHED_TO_DISTRIBUTOR", "RECEIVED_BY_DISTRIBUTOR", "DISPATCHED_TO_RETAILER", "RECEIVED_BY_RETAILER", "SOLD", "FLAGGED_COUNTERFEIT"][event.previousState] || event.previousState} → {["MINTED", "DISPATCHED_TO_DISTRIBUTOR", "RECEIVED_BY_DISTRIBUTOR", "DISPATCHED_TO_RETAILER", "RECEIVED_BY_RETAILER", "SOLD", "FLAGGED_COUNTERFEIT"][event.newState] || event.newState}</td><td className="type-mono">{event.actorWallet}</td><td className="type-mono">{event.custodian}</td><td className="type-mono">{event.transactionHash}</td><td>{event.eventTimestamp ? new Date(event.eventTimestamp).toLocaleString() : "—"}</td></tr>)}
                    </tbody></table></div>
                  ) : <div className="dashboard-state">No confirmed lifecycle events are stored for this registry record.</div>}
                  <h3 className="lifecycle-admin-subheading">Failed transaction attempts</h3>
                  {lifecycleDetail.failedOperations?.length ? (
                    <div className="verification-table-wrap"><table className="verification-table"><thead><tr><th>Action</th><th>Actor role</th><th>Result</th><th>Transaction</th><th>Failed at</th></tr></thead><tbody>
                      {lifecycleDetail.failedOperations.map((item) => <tr key={item.transactionHash}><td>{item.action}</td><td>{item.actorRole}</td><td>{item.failureCode || "FAILED"}</td><td className="type-mono">{item.transactionHash}</td><td>{item.failedAt ? new Date(item.failedAt).toLocaleString() : "—"}</td></tr>)}
                    </tbody></table></div>
                  ) : <div className="dashboard-state">No reverted lifecycle transactions are recorded for this product.</div>}
                  <h3 className="lifecycle-admin-subheading">Transactions requiring reconciliation review</h3>
                  {lifecycleDetail.reviewRequiredOperations?.length ? (
                    <div className="verification-table-wrap"><table className="verification-table"><thead><tr><th>Action</th><th>Actor role</th><th>Review reason</th><th>Transaction</th><th>Reported</th></tr></thead><tbody>
                      {lifecycleDetail.reviewRequiredOperations.map((item) => <tr key={item.transactionHash}><td>{item.action}</td><td>{item.actorRole}</td><td>{item.reviewReason || item.failureCode || "REVIEW_REQUIRED"}</td><td className="type-mono">{item.transactionHash}</td><td>{item.reviewRequiredAt ? new Date(item.reviewRequiredAt).toLocaleString() : "—"}</td></tr>)}
                    </tbody></table></div>
                  ) : <div className="dashboard-state">No lifecycle transaction currently requires reconciliation review.</div>}
                  <h3 className="lifecycle-admin-subheading">Stored verification and AI assessments</h3>
                  {lifecycleDetail.verifications?.length ? (
                    <div className="verification-table-wrap"><table className="verification-table"><thead><tr><th>Type</th><th>Authenticity result</th><th>AI scoring state</th><th>Risk score</th><th>Recorded</th></tr></thead><tbody>
                      {lifecycleDetail.verifications.map((item) => <tr key={item._id || `${item.verificationType}:${item.createdAt}`}><td>{item.verificationType}</td><td>{item.status}</td><td>{item.scoringStatus || "NOT_APPLICABLE"}</td><td>{Number.isFinite(item.anomalyScore) ? item.anomalyScore : "—"}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td></tr>)}
                    </tbody></table></div>
                  ) : <div className="dashboard-state">No verification records are stored for this product.</div>}
                  <div className="page-controls"><span>Lifecycle events: {lifecycleDetail.pagination?.lifecycleTotal ?? "—"} · Failed attempts: {lifecycleDetail.pagination?.failureTotal ?? "—"} · Review required: {lifecycleDetail.pagination?.reviewRequiredTotal ?? "—"} · Verifications: {lifecycleDetail.pagination?.verificationTotal ?? "—"}</span><div><button type="button" className="secondary-button" disabled={lifecycleDetailPage <= 1 || lifecycleDetailLoading} onClick={() => loadLifecycleDetail(lifecycleProductCode, lifecycleDetailPage - 1)}>Previous</button><button type="button" className="secondary-button" disabled={lifecycleDetailPage >= (lifecycleDetail.pagination?.totalPages || 1) || lifecycleDetailLoading} onClick={() => loadLifecycleDetail(lifecycleProductCode, lifecycleDetailPage + 1)}>Next</button></div></div>
                </>
              )}
            </section>
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
              Risk & Integrity Activity
            </h1>

            <p>
              Stored FAKE and SUSPICIOUS outcomes. Suspicious results are review signals, not confirmed fraud.
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
            title="Review signals"
            value={
              stats.fakeScans +
              stats.suspiciousScans
            }
            change="FAKE + SUSPICIOUS outcomes"
            icon="alert"
            danger
          />

          <MonitorCard
            title="FAKE outcomes"
            value={stats.fakeScans}
            change="Verification records"
            icon="alert"
            danger
          />

          <MonitorCard
            title="SUSPICIOUS outcomes"
            value={stats.suspiciousScans}
            change="Verification records"
            icon="shield"
          />

          <MonitorCard
            title="Image verifications"
            value={stats.imageVerifications}
            change="All stored image records"
            icon="box"
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Recent Review and Integrity Events
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
                No Review or Integrity Events
              </h2>

              <p>
                No FAKE or SUSPICIOUS outcomes appear on this page.
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

                {verification.product
                          ?.productName ||
                          "Unknown Product"}

                      </strong>

                      <span>

                        <span className="type-mono">{verification.productCode}</span>
                        {" • "}
                        {verification.verificationType}

                      </span>

                      <small className="type-mono">

                        {formatDate(
                          verification.createdAt
                        )}

                      </small>

                    </div>


                    <span className="danger-text">

                      <VerificationOutcomeBadge status={verification.status} />
                      <ScoringStatusBadge verification={verification} />

                    </span>

                  </div>

                )
              )}

            </div>

          )}

          <PageControls
            page={dashboardData.pagination?.alerts?.page || 1}
            totalPages={dashboardData.pagination?.alerts?.totalPages || 0}
            total={dashboardData.pagination?.alerts?.total || 0}
            onPageChange={(page) => changeDashboardPage("alerts", page)}
            disabled={loading}
          />

        </div>

      </div>
    );
  };

  const renderVerifications = () => (
    <section className="inner-page admin-verifications-page">
      <div className="inner-page-header">
        <div>
          <h1>Verification event log</h1>
          <p>Stored product-authenticity outcomes and AI scan-risk assessments are shown separately.</p>
        </div>
        <button className="primary-button" onClick={() => loadVerificationRecords(verificationFilters, verificationPage)} disabled={verificationLoading}>
          {verificationLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <form className="verification-filters dashboard-card" onSubmit={(event) => { event.preventDefault(); applyVerificationFilters(); }}>
        <label>Method
          <select value={verificationFilters.type} onChange={(event) => setVerificationFilters({ ...verificationFilters, type: event.target.value })}>
            <option value="">All methods</option><option value="QR">QR</option><option value="MANUAL_CODE">Manual code</option><option value="IMAGE">Image</option>
          </select>
        </label>
        <label>Stored outcome
          <select value={verificationFilters.status} onChange={(event) => setVerificationFilters({ ...verificationFilters, status: event.target.value })}>
            <option value="">All outcomes</option>
            {["GENUINE", "SUSPICIOUS", "FAKE", "AI_UNAVAILABLE", "NOT_REGISTERED", "DEACTIVATED", "FLAGGED", "INVALID_QR", "INVALID_PRODUCT_CODE", "REGISTRY_UNAVAILABLE", "REGISTRY_UNRESOLVED"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>AI assessment
          <select value={verificationFilters.scoringStatus} onChange={(event) => setVerificationFilters({ ...verificationFilters, scoringStatus: event.target.value })}>
            <option value="">All scoring states</option>
            {["SCORED", "INSUFFICIENT_DATA", "UNAVAILABLE", "NOT_APPLICABLE"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>Product code
          <input maxLength={64} value={verificationFilters.productCode} onChange={(event) => setVerificationFilters({ ...verificationFilters, productCode: event.target.value })} placeholder="Exact product code" />
        </label>
        <button className="primary-button" type="submit" disabled={verificationLoading}>Apply filters</button>
      </form>

      <section className="dashboard-card full-card verification-log-card" aria-live="polite" aria-busy={verificationLoading}>
        <div className="card-header"><div><h2>Verification records</h2><p className="card-subtitle">{displayMetric(verificationPagination.total)} records · newest first</p></div></div>
        {verificationLoading ? <div className="dashboard-state" role="status">Loading verification records…</div> : null}
        {!verificationLoading && verificationError ? <div className="dashboard-state dashboard-state-error" role="alert"><span>{verificationError}</span><button className="secondary-button" onClick={() => loadVerificationRecords(verificationFilters, verificationPage)}>Try again</button></div> : null}
        {!verificationLoading && !verificationError && verificationRows.length === 0 ? <div className="dashboard-state" role="status"><strong>No matching verification records</strong><span>Try another filter or clear the product code.</span></div> : null}
        {!verificationLoading && !verificationError && verificationRows.length > 0 ? (
          <div className="management-table verification-table-wrap"><table className="verification-table">
            <thead><tr><th>Product</th><th>Method</th><th>Stored authenticity result</th><th>AI scan-risk assessment</th><th>Recorded</th></tr></thead>
            <tbody>{verificationRows.map((verification) => (
              <tr key={verification._id}>
                <td><strong>{verification.product?.productName || "Product details unavailable"}</strong><span className="type-mono">{verification.productCode}</span>{verification.product?.brandName ? <small>{verification.product.brandName}</small> : null}</td>
                <td>{verification.verificationType}</td>
                <td><VerificationOutcomeBadge status={verification.status} />{Number.isFinite(verification.similarity) ? <small>Image similarity: {verification.similarity}</small> : null}</td>
                <td><ScoringStatusBadge verification={verification} />{verification.scoringStatus === "SCORED" && Number.isFinite(verification.anomalyScore) ? <small>Score: <span className="type-mono">{verification.anomalyScore}</span>{verification.isSuspicious === true ? " · model flagged" : verification.isSuspicious === false ? " · model did not flag" : ""}</small> : null}</td>
                <td className="type-mono">{formatDate(verification.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : null}
        {!verificationLoading && !verificationError ? <PageControls page={verificationPagination.page} totalPages={verificationPagination.totalPages} total={verificationPagination.total} onPageChange={(page) => loadVerificationRecords(verificationFilters, page)} disabled={verificationLoading} /> : null}
        <p className="assessment-separation-note">Location and partner attribution are unavailable in the current scan schema and are not inferred from anonymous consumer checks.</p>
      </section>
    </section>
  );


  // =====================================================
  // ALERTS
  // =====================================================

  const renderAlerts = () => {

    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>

            <h1>
              Security Events
            </h1>

            <p>
              Stored review and integrity events. AI scoring availability is shown separately.
            </p>

          </div>

          <div className="alert-count">
            {displayMetric(dashboardData.pagination?.alerts?.total)} Events
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
                No Security Events
              </h2>

              <p>
                No matching integrity or review events have been recorded on this page.
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
                        {alert.status.replaceAll("_", " ")} · {alert.verificationType} verification
                      </h3>

                      <p>
                        Product:{" "}
                        {alert.product
                          ?.productName ||
                          "Unknown Product"}
                      </p>

                      <p>
                        Code:{" "}
                        <span className="type-mono">{alert.productCode}</span>
                      </p>

                      <p>
                        Type:{" "}
                        {alert.verificationType}
                      </p>
                      <VerificationOutcomeBadge status={alert.status} />
                      <ScoringStatusBadge verification={alert} />
                      {alert.product?.transactionHash ? <p>Saved transaction reference: <span className="type-mono">{`${alert.product.transactionHash.slice(0, 10)}…${alert.product.transactionHash.slice(-6)}`}</span> (not a live chain check)</p> : null}

                    </div>


                    <span className="type-mono">
                      {formatDate(
                        alert.createdAt
                      )}
                    </span>

                  </div>

                )
              )}

            </div>

          )}

          <PageControls
            page={dashboardData.pagination?.alerts?.page || 1}
            totalPages={dashboardData.pagination?.alerts?.totalPages || 0}
            total={dashboardData.pagination?.alerts?.total || 0}
            onPageChange={(page) => changeDashboardPage("alerts", page)}
            disabled={loading}
          />

        </div>

      </div>
    );
  };


  // =====================================================
  // LOCATIONS
  // =====================================================

  const renderLocations = () => {

    if (!locations.length) {
      return (
        <div className="inner-page">
          <div className="inner-page-header">
            <div>
              <h1>Location insights</h1>
              <p>Only scans with recorded consent and valid coordinates can appear here.</p>
            </div>
          </div>
          <section className="dashboard-card location-privacy-state" role="status">
            <span className="location-privacy-icon" aria-hidden="true">⌖</span>
            <div>
              <h2>No consented scan locations yet</h2>
              <p>{dashboardData.locationDataAvailability?.reason || "No eligible scan locations are available."}</p>
              <p>Location sharing is optional. Existing coordinates without a consent record remain excluded.</p>
            </div>
          </section>
        </div>
      );
    }

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
            title="Saved product records"
            value={
              blockchainRecords.length
            }
            change="MongoDB transaction references"
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
            title="Live chain status"
            value="Not checked"
            change="This page does not query Sepolia"
            icon="check"
          />

        </div>


        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Stored product registration references
            </h2>

            <span className="secure-badge">
              MongoDB · chain not checked
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

                      <strong className="type-mono">
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

                      <strong className="type-mono">
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
      label: "Manufacturers",
      icon: "users"
    },

    {
      key: "partners",
      label: "Partner Applications",
      icon: "users"
    },

    {
      key: "products",
      label: "Product Monitoring",
      icon: "box"
    },

    {
      key: "verifications",
      label: "Verification Log",
      icon: "shield"
    },

    {
      key: "counterfeit",
      label: "Risk & Integrity",
      icon: "shield"
    },

    {
      key: "alerts",
      label: "Security Events",
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

  const renderPartnerApplications = () => {
    const distributorApplications = pendingPartners.filter(
      (partner) => partner.partnerType === "DISTRIBUTOR"
    );
    const retailerApplications = pendingPartners.filter(
      (partner) => partner.partnerType === "RETAILER"
    );

    const renderPartnerTable = (partners, partnerType) => (
      <section className="dashboard-card full-card partner-approval-card" key={partnerType}>
        <div className="card-header">
          <div>
            <h2>{partnerType === "DISTRIBUTOR" ? "Distributor applications" : "Retailer applications"}</h2>
            <p className="card-subtitle">{partners.length} pending review</p>
          </div>
        </div>

        {partners.length === 0 ? (
          <div className="partner-role-empty">No pending {partnerType.toLowerCase()} applications.</div>
        ) : (
          <div className="management-table">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Company</th>
                  <th>Registration</th>
                  <th>Contact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => {
                  const busy = partnerActionId.startsWith(`${partner._id}:`);
                  return (
                    <tr key={partner._id}>
                      <td>
                        <div className="partner-applicant-cell">
                          <strong>{partner.userId?.name || "Name unavailable"}</strong>
                          <small>{partner.userId?.email || "Email unavailable"}</small>
                        </div>
                      </td>
                      <td>{partner.companyName}</td>
                      <td>{partner.registrationNumber}</td>
                      <td>
                        <div className="partner-applicant-cell">
                          <span>{partner.contactNumber}</span>
                          <small>{partner.address}</small>
                        </div>
                      </td>
                      <td>
                        <div className="partner-approval-actions">
                          <button
                            className="primary-button"
                            type="button"
                            disabled={Boolean(partnerActionId)}
                            onClick={() => updatePartner(partner._id, "approve")}
                          >
                            {busy && partnerActionId.endsWith(":approve") ? "Approving…" : "Approve"}
                          </button>
                          <button
                            className="delete-button"
                            type="button"
                            disabled={Boolean(partnerActionId)}
                            onClick={() => updatePartner(partner._id, "reject")}
                          >
                            {busy && partnerActionId.endsWith(":reject") ? "Rejecting…" : "Reject"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );

    return (
      <div className="inner-page">
        <div className="inner-page-header">
          <div>
            <h1>Partner Applications</h1>
            <p>Review distributor and retailer account requests.</p>
          </div>
          <button className="primary-button" type="button" onClick={loadPendingPartners} disabled={partnersLoading}>
            {partnersLoading ? "Refreshing…" : "Refresh applications"}
          </button>
        </div>

        <p className="partner-approval-note">
          Admin approval activates the application account. It does not grant an on-chain contract role.
        </p>

        {partnersNotice && <p className="partner-approval-success" role="status">{partnersNotice}</p>}
        {partnersError && <p className="partner-approval-error" role="alert">{partnersError}</p>}

        {partnersLoading && pendingPartners.length === 0 ? (
          <div className="dashboard-card partner-approval-state" role="status">Loading pending partner applications…</div>
        ) : partnersError && pendingPartners.length === 0 ? (
          <div className="dashboard-card partner-approval-state">
            <p>Applications could not be loaded.</p>
            <button className="primary-button" type="button" onClick={loadPendingPartners}>Try again</button>
          </div>
        ) : pendingPartners.length === 0 ? (
          <div className="dashboard-card partner-approval-state" role="status">
            <h2>No pending partner applications</h2>
            <p>New distributor and retailer requests will appear here.</p>
          </div>
        ) : (
          <div className="partner-approval-list" aria-busy={partnersLoading}>
            {renderPartnerTable(distributorApplications, "DISTRIBUTOR")}
            {renderPartnerTable(retailerApplications, "RETAILER")}
          </div>
        )}
      </div>
    );
  };

  const renderPage = () => {

    if (activePage === "partners") {
      return renderPartnerApplications();
    }

    if (activePage === "verifications") {
      return renderVerifications();
    }

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

      case "partners":
        return renderPartnerApplications();

      case "products":
        return renderProducts();

      case "verifications":
        return renderVerifications();

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
        id="admin-navigation"
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
                aria-current={activePage === item.key ? "page" : undefined}
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
            type="button"
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
            aria-controls="admin-navigation"
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

          <div className="topbar-brand" aria-label="Anti-Counterfeit security console">
            <img src="/logo.png" alt="" />
            <span>Anti-Counterfeit</span>
          </div>


          {/* SEARCH */}

          <div className="search-wrapper">

            <div className="search-box">

              <Icon
                type="search"
                size={18}
              />

              <input
                type="text"
                placeholder="Search pages and loaded records..."
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

                            <span className="type-mono">
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
              className="icon-button topbar-settings-button"
              type="button"
              aria-label="Settings"
              title="Settings"
              onClick={() =>
                showToast(
                  "Settings panel coming soon."
                )
              }
            >

              <SettingsIcon size={20} strokeWidth={2} aria-hidden="true" />

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
          <div className="admin-page-container">
            {renderPage()}
          </div>

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
          item.risk
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
            points={makePoints("risk")}
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

function VerificationOutcomeBadge({ status }) {
  const value = status || "UNKNOWN";
  const className = value === "GENUINE" ? "outcome-genuine" : ["FAKE", "INVALID_QR", "FLAGGED", "DEACTIVATED"].includes(value) ? "outcome-critical" : "outcome-review";
  return <span className={`assessment-badge ${className}`}>{value.replaceAll("_", " ")}</span>;
}

function ScoringStatusBadge({ verification }) {
  const value = verification.scoringStatus || "NOT RECORDED";
  const className = value === "SCORED" ? (verification.isSuspicious === true ? "scoring-flagged" : "scoring-complete") : value === "UNAVAILABLE" ? "scoring-unavailable" : value === "INSUFFICIENT_DATA" ? "scoring-insufficient" : "scoring-na";
  return <span className={`assessment-badge ${className}`}>{value.replaceAll("_", " ")}</span>;
}

function PageControls({ page = 1, totalPages = 0, total = 0, onPageChange, disabled = false }) {
  if (totalPages <= 1) return <div className="page-controls-summary">{total ? `${total.toLocaleString()} records` : ""}</div>;
  return <div className="page-controls" aria-label="Pagination">
    <span>Page {page} of {totalPages} · {total.toLocaleString()} records</span>
    <div><button type="button" className="secondary-button" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>Previous</button><button type="button" className="secondary-button" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>Next</button></div>
  </div>;
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
