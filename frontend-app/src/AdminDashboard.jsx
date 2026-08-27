import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AdminDashboard.css";

/* =========================================================
   LEAFLET MARKER FIX
========================================================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* =========================================================
   ICON COMPONENT
========================================================= */

function Icon({ type, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
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
        <circle cx="12" cy="16.5" r=".5" fill="currentColor" />
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
    ),
  };

  return icons[type] || null;
}

/* =========================================================
   MAP LOCATION DATA
========================================================= */

const defaultLocations = [
  {
    id: 1,
    city: "Mumbai",
    country: "India",
    scans: 24568,
    position: [19.076, 72.8777],
  },
  {
    id: 2,
    city: "Delhi",
    country: "India",
    scans: 18245,
    position: [28.6139, 77.209],
  },
  {
    id: 3,
    city: "Bengaluru",
    country: "India",
    scans: 15224,
    position: [12.9716, 77.5946],
  },
  {
    id: 4,
    city: "Kolkata",
    country: "India",
    scans: 9845,
    position: [22.5726, 88.3639],
  },
  {
    id: 5,
    city: "Chennai",
    country: "India",
    scans: 7654,
    position: [13.0827, 80.2707],
  },
];

/* =========================================================
   DEFAULT DATA
========================================================= */

const defaultManufacturers = [
  {
    id: 1,
    name: "TechNova Industries",
    products: 2350,
    genuine: 21245,
    counterfeit: 245,
  },
  {
    id: 2,
    name: "Global Electronics",
    products: 1820,
    genuine: 18745,
    counterfeit: 125,
  },
  {
    id: 3,
    name: "Bright Future Ltd.",
    products: 1450,
    genuine: 15245,
    counterfeit: 98,
  },
  {
    id: 4,
    name: "SmartLife Solutions",
    products: 1250,
    genuine: 12458,
    counterfeit: 76,
  },
  {
    id: 5,
    name: "NextGen Devices",
    products: 980,
    genuine: 9845,
    counterfeit: 54,
  },
];

const defaultAlerts = [
  {
    id: 1,
    title: "High Counterfeit Detected",
    product: "SmartWatch X1",
    location: "Mumbai, India",
    time: "10:24 AM",
    type: "danger",
  },
  {
    id: 2,
    title: "QR Code Tampering",
    product: "PowerBank Pro",
    location: "Delhi, India",
    time: "09:15 AM",
    type: "danger",
  },
  {
    id: 3,
    title: "Duplicate Code Detected",
    product: "Bluetooth Earbuds",
    location: "Bengaluru, India",
    time: "Yesterday",
    type: "danger",
  },
  {
    id: 4,
    title: "Fake Manufacturer Detected",
    product: "LED Panel Light",
    location: "Kolkata, India",
    time: "Yesterday",
    type: "danger",
  },
];

const defaultBlocks = [
  {
    id: "#985632",
    date: "May 26, 2025 11:32 AM",
    transactions: 256,
  },
  {
    id: "#985631",
    date: "May 26, 2025 11:22 AM",
    transactions: 198,
  },
  {
    id: "#985630",
    date: "May 26, 2025 11:12 AM",
    transactions: 210,
  },
  {
    id: "#985629",
    date: "May 26, 2025 11:02 AM",
    transactions: 189,
  },
  {
    id: "#985628",
    date: "May 26, 2025 10:52 AM",
    transactions: 201,
  },
];

/* =========================================================
   LOCAL STORAGE HELPER
========================================================= */

function getStoredData(key, fallback) {
  try {
    const value = localStorage.getItem(key);

    if (!value) {
      return fallback;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/* =========================================================
   MAP FLY TO LOCATION
========================================================= */

function MapController({ selectedLocation }) {
  const map = useMap();

  useEffect(() => {
    if (selectedLocation) {
      map.flyTo(selectedLocation.position, 10, {
        duration: 1.2,
      });
    }
  }, [selectedLocation, map]);

  return null;
}

/* =========================================================
   MAIN ADMIN DASHBOARD
========================================================= */

function AdminDashboard() {
  const [activePage, setActivePage] = useState(
    localStorage.getItem("adminActivePage") || "dashboard"
  );

  const [searchText, setSearchText] = useState("");

  const [showNotifications, setShowNotifications] = useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    localStorage.getItem("adminDate") || "May 20 – May 26, 2025"
  );

  const [manufacturers, setManufacturers] = useState(
    getStoredData(
      "adminManufacturers",
      defaultManufacturers
    )
  );

  const [alerts, setAlerts] = useState(
    getStoredData(
      "adminAlerts",
      defaultAlerts
    )
  );

  const [blocks] = useState(
    getStoredData(
      "adminBlocks",
      defaultBlocks
    )
  );

  const [locations] = useState(
    getStoredData(
      "adminLocations",
      defaultLocations
    )
  );

  const [selectedLocation, setSelectedLocation] =
    useState(null);

  const [toast, setToast] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* =====================================================
     SAVE DATA
  ===================================================== */

  useEffect(() => {
    localStorage.setItem(
      "adminActivePage",
      activePage
    );
  }, [activePage]);

  useEffect(() => {
    localStorage.setItem(
      "adminManufacturers",
      JSON.stringify(manufacturers)
    );
  }, [manufacturers]);

  useEffect(() => {
    localStorage.setItem(
      "adminAlerts",
      JSON.stringify(alerts)
    );
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem(
      "adminDate",
      selectedDate
    );
  }, [selectedDate]);

  /* =====================================================
     TOAST
  ===================================================== */

  const showToast = (message) => {
    setToast(message);

    setTimeout(() => {
      setToast("");
    }, 2500);
  };

  /* =====================================================
     SIDEBAR NAVIGATION
  ===================================================== */

  const navigate = (page) => {
    setActivePage(page);
    setSidebarOpen(false);
    setSearchText("");
  };

  /* =====================================================
     LOGOUT
  ===================================================== */

  const handleLogout = () => {
    const confirmed = window.confirm(
      "Are you sure you want to logout?"
    );

    if (!confirmed) return;

    localStorage.removeItem("adminActivePage");

    window.location.href = "/";
  };

  /* =====================================================
     SEARCH
  ===================================================== */

  const searchResults = useMemo(() => {
    if (!searchText.trim()) {
      return [];
    }

    const text = searchText.toLowerCase();

    const results = [];

    const pages = [
      {
        name: "Dashboard",
        key: "dashboard",
      },
      {
        name: "Manufacturer Management",
        key: "manufacturers",
      },
      {
        name: "Product Monitoring",
        key: "products",
      },
      {
        name: "Counterfeit Activity",
        key: "counterfeit",
      },
      {
        name: "Fraud Alerts",
        key: "alerts",
      },
      {
        name: "Scan Locations",
        key: "locations",
      },
      {
        name: "Blockchain Records",
        key: "blockchain",
      },
    ];

    pages.forEach((page) => {
      if (
        page.name.toLowerCase().includes(text)
      ) {
        results.push({
          type: "page",
          ...page,
        });
      }
    });

    manufacturers.forEach((manufacturer) => {
      if (
        manufacturer.name
          .toLowerCase()
          .includes(text)
      ) {
        results.push({
          type: "manufacturer",
          ...manufacturer,
        });
      }
    });

    alerts.forEach((alert) => {
      if (
        alert.title
          .toLowerCase()
          .includes(text) ||
        alert.product
          .toLowerCase()
          .includes(text) ||
        alert.location
          .toLowerCase()
          .includes(text)
      ) {
        results.push({
          type: "alert",
          ...alert,
        });
      }
    });

    return results.slice(0, 8);
  }, [
    searchText,
    manufacturers,
    alerts,
  ]);

  /* =====================================================
     ADD MANUFACTURER
  ===================================================== */

  const addManufacturer = () => {
    const name = window.prompt(
      "Enter manufacturer name:"
    );

    if (!name || !name.trim()) {
      return;
    }

    const newManufacturer = {
      id: Date.now(),
      name: name.trim(),
      products: 0,
      genuine: 0,
      counterfeit: 0,
    };

    setManufacturers((previous) => [
      ...previous,
      newManufacturer,
    ]);

    showToast(
      "Manufacturer added successfully."
    );
  };

  /* =====================================================
     REMOVE MANUFACTURER
  ===================================================== */

  const removeManufacturer = (id) => {
    const confirmed = window.confirm(
      "Remove this manufacturer?"
    );

    if (!confirmed) return;

    setManufacturers((previous) =>
      previous.filter(
        (manufacturer) =>
          manufacturer.id !== id
      )
    );

    showToast(
      "Manufacturer removed."
    );
  };

  /* =====================================================
     CLEAR ALERT
  ===================================================== */

  const clearAlert = (id) => {
    setAlerts((previous) =>
      previous.filter(
        (alert) => alert.id !== id
      )
    );

    showToast("Alert removed.");
  };

  /* =====================================================
     SEARCH RESULT CLICK
  ===================================================== */

  const handleSearchResult = (result) => {
    if (result.type === "page") {
      navigate(result.key);
    }

    if (result.type === "manufacturer") {
      navigate("manufacturers");
    }

    if (result.type === "alert") {
      navigate("alerts");
    }

    setSearchText("");
  };

  /* =====================================================
     NAVIGATION ITEMS
  ===================================================== */

  const navigationItems = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "home",
    },
    {
      key: "manufacturers",
      label: "Manufacturer Management",
      icon: "users",
    },
    {
      key: "products",
      label: "Product Monitoring",
      icon: "box",
    },
    {
      key: "counterfeit",
      label: "Counterfeit Activity",
      icon: "shield",
    },
    {
      key: "alerts",
      label: "Fraud Alerts",
      icon: "bell",
    },
    {
      key: "locations",
      label: "Scan Locations",
      icon: "location",
    },
    {
      key: "blockchain",
      label: "Blockchain Records",
      icon: "blockchain",
    },
  ];

  /* =====================================================
     PAGE TITLE
  ===================================================== */

  const pageTitle = {
    dashboard: "Admin Dashboard",
    manufacturers: "Manufacturer Management",
    products: "Product Monitoring",
    counterfeit: "Counterfeit Activity",
    alerts: "Fraud Alerts",
    locations: "Scan Locations",
    blockchain: "Blockchain Records",
  };

  /* =====================================================
     RENDER DASHBOARD
  ===================================================== */

  const renderDashboard = () => {
    return (
      <>
        {/* PAGE HEADER */}

        <div className="page-heading-row">

          <div>
            <h1>Admin Dashboard</h1>

            <p>
              Welcome back, Admin! Here's what's
              happening with your platform.
            </p>
          </div>

          <div className="date-picker-wrapper">

            <button
              className="date-picker"
              onClick={() =>
                setShowDatePicker(
                  !showDatePicker
                )
              }
            >
              <Icon
                type="calendar"
                size={18}
              />

              <span>
                {selectedDate}
              </span>

              <Icon
                type="chevron"
                size={16}
              />
            </button>

            {showDatePicker && (
              <div className="date-menu">

                <button
                  onClick={() => {
                    setSelectedDate(
                      "May 20 – May 26, 2025"
                    );
                    setShowDatePicker(false);
                  }}
                >
                  May 20 – May 26, 2025
                </button>

                <button
                  onClick={() => {
                    setSelectedDate(
                      "May 13 – May 19, 2025"
                    );
                    setShowDatePicker(false);
                  }}
                >
                  May 13 – May 19, 2025
                </button>

                <button
                  onClick={() => {
                    setSelectedDate(
                      "May 06 – May 12, 2025"
                    );
                    setShowDatePicker(false);
                  }}
                >
                  May 06 – May 12, 2025
                </button>

              </div>
            )}

          </div>

        </div>

        {/* STAT CARDS */}

        <div className="stats-grid">

          <StatCard
            icon="box"
            iconClass="blue"
            title="Total Products"
            value="12,458"
            change="18.6%"
            subtitle="vs last week"
          />

          <StatCard
            icon="blockchain"
            iconClass="blue"
            title="Total Scans"
            value="98,765"
            change="24.3%"
            subtitle="vs last week"
          />

          <StatCard
            icon="shield"
            iconClass="green"
            title="Genuine Products"
            value="87,654"
            change="88.8%"
            subtitle="of total scans"
            green
          />

          <StatCard
            icon="alert"
            iconClass="red"
            title="Counterfeit Detected"
            value="2,345"
            change="2.37%"
            subtitle="of total scans"
            red
          />

          <StatCard
            icon="users"
            iconClass="purple"
            title="Manufacturers"
            value={manufacturers.length}
            change="12.2%"
            subtitle="vs last week"
          />

        </div>

        {/* MIDDLE ROW */}

        <div className="dashboard-middle-grid">

          {/* SCAN OVERVIEW */}

          <div className="dashboard-card scan-overview-card">

            <div className="card-header">

              <div>
                <h2>Scan Overview</h2>
              </div>

              <select
                className="small-select"
                defaultValue="week"
              >
                <option value="week">
                  This Week
                </option>

                <option value="month">
                  This Month
                </option>

                <option value="year">
                  This Year
                </option>
              </select>

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

            <div className="simple-chart">

              <div className="chart-y-labels">
                <span>20K</span>
                <span>15K</span>
                <span>10K</span>
                <span>5K</span>
                <span>0</span>
              </div>

              <div className="chart-area">

                <div className="chart-grid-line line-1"></div>
                <div className="chart-grid-line line-2"></div>
                <div className="chart-grid-line line-3"></div>
                <div className="chart-grid-line line-4"></div>
                <div className="chart-grid-line line-5"></div>

                <svg
                  className="scan-line-svg"
                  viewBox="0 0 700 230"
                  preserveAspectRatio="none"
                >

                  <polyline
                    points="
                      25,175
                      130,145
                      235,115
                      340,75
                      445,105
                      555,45
                      670,35
                    "
                    fill="none"
                    stroke="#1468ee"
                    strokeWidth="3"
                  />

                  <polyline
                    points="
                      25,220
                      130,220
                      235,220
                      340,220
                      445,220
                      555,220
                      670,190
                    "
                    fill="none"
                    stroke="#ef3d3d"
                    strokeWidth="3"
                  />

                  {[
                    [25, 175],
                    [130, 145],
                    [235, 115],
                    [340, 75],
                    [445, 105],
                    [555, 45],
                    [670, 35],
                  ].map(
                    ([cx, cy], index) => (
                      <circle
                        key={index}
                        cx={cx}
                        cy={cy}
                        r="5"
                        fill="#1468ee"
                      />
                    )
                  )}

                </svg>

                <div className="chart-values">

                  <span>8.2K</span>
                  <span>11.5K</span>
                  <span>13.8K</span>
                  <span>15.6K</span>
                  <span>14.2K</span>
                  <span>17.8K</span>
                  <span>18.0K</span>

                </div>

                <div className="chart-days">

                  <span>May 20</span>
                  <span>May 21</span>
                  <span>May 22</span>
                  <span>May 23</span>
                  <span>May 24</span>
                  <span>May 25</span>
                  <span>May 26</span>

                </div>

              </div>

            </div>

          </div>

          {/* COUNTERFEIT DISTRIBUTION */}

          <div className="dashboard-card distribution-card">

            <div className="card-header">
              <h2>Counterfeit Distribution</h2>
            </div>

            <div className="distribution-content">

              <div className="donut-chart">

                <div className="donut-hole">
                  <strong>2,345</strong>
                  <span>Total</span>
                </div>

              </div>

              <div className="distribution-list">

                <DistributionItem
                  color="red"
                  title="Packaging Mismatch"
                  percentage="35%"
                  count="820"
                />

                <DistributionItem
                  color="orange"
                  title="QR Code Tampered"
                  percentage="28%"
                  count="656"
                />

                <DistributionItem
                  color="yellow"
                  title="Duplicate Code"
                  percentage="20%"
                  count="469"
                />

                <DistributionItem
                  color="purple"
                  title="Fake Manufacturer"
                  percentage="10%"
                  count="235"
                />

                <DistributionItem
                  color="blue"
                  title="Other Reasons"
                  percentage="7%"
                  count="165"
                />

              </div>

            </div>

          </div>

          {/* ALERTS */}

          <div className="dashboard-card alerts-card">

            <div className="card-header">

              <h2>Recent Fraud Alerts</h2>

              <button
                className="view-link"
                onClick={() =>
                  navigate("alerts")
                }
              >
                View All
              </button>

            </div>

            <div className="alerts-list">

              {alerts
                .slice(0, 4)
                .map((alert) => (

                  <div
                    className="alert-row"
                    key={alert.id}
                  >

                    <div className="alert-icon">
                      <Icon
                        type="alert"
                        size={19}
                      />
                    </div>

                    <div className="alert-info">

                      <strong>
                        {alert.title}
                      </strong>

                      <span>
                        Product: {alert.product}
                      </span>

                      <span>
                        Location: {alert.location}
                      </span>

                    </div>

                    <span className="alert-time">
                      {alert.time}
                    </span>

                  </div>

                ))}

            </div>

          </div>

        </div>

        {/* LOWER GRID */}

        <div className="dashboard-lower-grid">

          {/* MANUFACTURERS */}

          <div className="dashboard-card">

            <div className="card-header">

              <h2>Top Manufacturers</h2>

              <button
                className="view-link"
                onClick={() =>
                  navigate("manufacturers")
                }
              >
                View All
              </button>

            </div>

            <div className="table-wrapper">

              <table>

                <thead>

                  <tr>
                    <th>#</th>
                    <th>Manufacturer</th>
                    <th>Products</th>
                    <th>Genuine Scans</th>
                    <th>Counterfeit</th>
                  </tr>

                </thead>

                <tbody>

                  {manufacturers
                    .slice(0, 5)
                    .map(
                      (
                        manufacturer,
                        index
                      ) => (

                        <tr
                          key={
                            manufacturer.id
                          }
                        >

                          <td>
                            {index + 1}
                          </td>

                          <td>
                            <div className="manufacturer-name">
                              <div className="manufacturer-avatar">
                                {manufacturer.name
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>

                              {
                                manufacturer.name
                              }
                            </div>
                          </td>

                          <td>
                            {manufacturer.products.toLocaleString()}
                          </td>

                          <td>
                            {manufacturer.genuine.toLocaleString()}
                          </td>

                          <td className="counterfeit-number">
                            {
                              manufacturer.counterfeit
                            }
                          </td>

                        </tr>

                      )
                    )}

                </tbody>

              </table>

            </div>

          </div>

          {/* LOCATION TOP 5 */}

          <div className="dashboard-card">

            <div className="card-header">

              <h2>
                Scan Locations (Top 5)
              </h2>

              <button
                className="view-link"
                onClick={() =>
                  navigate("locations")
                }
              >
                View All
              </button>

            </div>

            <div className="mini-map">

              <MapContainer
                center={[
                  20.5937,
                  78.9629,
                ]}
                zoom={4}
                scrollWheelZoom={false}
                zoomControl={false}
              >

                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {locations.map(
                  (location) => (
                    <Marker
                      key={location.id}
                      position={
                        location.position
                      }
                    >
                      <Popup>
                        <strong>
                          {
                            location.city
                          }
                        </strong>
                        <br />
                        {
                          location.scans.toLocaleString()
                        }{" "}
                        scans
                      </Popup>
                    </Marker>
                  )
                )}

              </MapContainer>

            </div>

            <div className="location-ranking">

              {locations.map(
                (location, index) => (

                  <div
                    className="location-rank-row"
                    key={location.id}
                  >

                    <span>
                      {index + 1}.
                    </span>

                    <strong>
                      {location.city},{" "}
                      {location.country}
                    </strong>

                    <em>
                      {location.scans.toLocaleString()}
                    </em>

                  </div>

                )
              )}

            </div>

          </div>

          {/* BLOCKCHAIN */}

          <div className="dashboard-card">

            <div className="card-header">

              <h2>Blockchain Records</h2>

              <button
                className="view-link"
                onClick={() =>
                  navigate("blockchain")
                }
              >
                View All
              </button>

            </div>

            <div className="block-list">

              {blocks
                .slice(0, 5)
                .map((block) => (

                  <div
                    className="block-row"
                    key={block.id}
                  >

                    <div className="block-icon">
                      <Icon
                        type="blockchain"
                        size={19}
                      />
                    </div>

                    <div className="block-info">

                      <strong>
                        Block {block.id}
                      </strong>

                      <span>
                        {block.date}
                      </span>

                    </div>

                    <div className="block-transactions">
                      {block.transactions}{" "}
                      Transactions
                    </div>

                    <button
                      className="block-view"
                      onClick={() =>
                        showToast(
                          `Viewing block ${block.id}`
                        )
                      }
                    >
                      View
                    </button>

                  </div>

                ))}

            </div>

          </div>

        </div>

        {/* BOTTOM STATUS */}

        <div className="bottom-status-card">

          <StatusItem
            icon="blockchain"
            title="Total Blockchain Blocks"
            value="98,563"
          />

          <StatusItem
            icon="blockchain"
            title="Total Transactions"
            value="1,245,896"
          />

          <StatusItem
            icon="shield"
            title="Data Integrity"
            value="100% Secured"
            green
          />

          <StatusItem
            icon="check"
            title="System Status"
            value="All Systems Operational"
            green
          />

        </div>
      </>
    );
  };

  /* =====================================================
     MANUFACTURER PAGE
  ===================================================== */

  const renderManufacturers = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Manufacturer Management
            </h1>

            <p>
              Manage registered manufacturers
              on the platform.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={addManufacturer}
          >
            + Add Manufacturer
          </button>

        </div>

        <div className="dashboard-card full-card">

          <div className="management-summary">

            <div>
              <span>Total Manufacturers</span>
              <strong>
                {manufacturers.length}
              </strong>
            </div>

            <div>
              <span>Total Products</span>
              <strong>
                {manufacturers
                  .reduce(
                    (sum, item) =>
                      sum + item.products,
                    0
                  )
                  .toLocaleString()}
              </strong>
            </div>

            <div>
              <span>Counterfeit Cases</span>
              <strong className="danger-text">
                {manufacturers
                  .reduce(
                    (sum, item) =>
                      sum + item.counterfeit,
                    0
                  )
                  .toLocaleString()}
              </strong>
            </div>

          </div>

          <div className="management-table">

            <table>

              <thead>

                <tr>
                  <th>Manufacturer</th>
                  <th>Products</th>
                  <th>Genuine Scans</th>
                  <th>Counterfeit</th>
                  <th>Actions</th>
                </tr>

              </thead>

              <tbody>

                {manufacturers.map(
                  (manufacturer) => (

                    <tr
                      key={
                        manufacturer.id
                      }
                    >

                      <td>
                        <div className="manufacturer-name">

                          <div className="manufacturer-avatar">
                            {manufacturer.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <strong>
                            {
                              manufacturer.name
                            }
                          </strong>

                        </div>
                      </td>

                      <td>
                        {manufacturer.products.toLocaleString()}
                      </td>

                      <td>
                        {manufacturer.genuine.toLocaleString()}
                      </td>

                      <td className="counterfeit-number">
                        {
                          manufacturer.counterfeit
                        }
                      </td>

                      <td>

                        <button
                          className="delete-button"
                          onClick={() =>
                            removeManufacturer(
                              manufacturer.id
                            )
                          }
                        >
                          Remove
                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        </div>

      </div>
    );
  };

  /* =====================================================
     PRODUCT MONITORING
  ===================================================== */

  const renderProducts = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Product Monitoring
            </h1>

            <p>
              Monitor product verification
              activity.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              showToast(
                "Product monitoring refreshed."
              )
            }
          >
            Refresh Data
          </button>

        </div>

        <div className="monitor-grid">

          <MonitorCard
            title="Total Products"
            value="12,458"
            change="+18.6%"
            icon="box"
          />

          <MonitorCard
            title="Verified Products"
            value="10,113"
            change="+21.4%"
            icon="shield"
          />

          <MonitorCard
            title="Pending Verification"
            value="756"
            change="+5.2%"
            icon="alert"
          />

          <MonitorCard
            title="Flagged Products"
            value="2,345"
            change="+2.37%"
            icon="alert"
            danger
          />

        </div>

        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Product Verification Activity
            </h2>

            <button
              className="view-link"
              onClick={() =>
                showToast(
                  "Product report generated."
                )
              }
            >
              Generate Report
            </button>

          </div>

          <div className="product-progress-list">

            <ProgressRow
              title="Genuine Products"
              value="87,654"
              percentage={89}
              green
            />

            <ProgressRow
              title="Counterfeit Products"
              value="2,345"
              percentage={12}
              danger
            />

            <ProgressRow
              title="Pending Verification"
              value="756"
              percentage={7}
            />

          </div>

        </div>

      </div>
    );
  };

  /* =====================================================
     COUNTERFEIT ACTIVITY
  ===================================================== */

  const renderCounterfeit = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Counterfeit Activity
            </h1>

            <p>
              Monitor suspicious product
              verification activity.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              showToast(
                "Counterfeit report refreshed."
              )
            }
          >
            Refresh
          </button>

        </div>

        <div className="monitor-grid">

          <MonitorCard
            title="Total Detected"
            value="2,345"
            change="+2.37%"
            icon="alert"
            danger
          />

          <MonitorCard
            title="Packaging Mismatch"
            value="820"
            change="35%"
            icon="box"
          />

          <MonitorCard
            title="QR Tampered"
            value="656"
            change="28%"
            icon="blockchain"
          />

          <MonitorCard
            title="Duplicate Code"
            value="469"
            change="20%"
            icon="shield"
          />

        </div>

        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Recent Counterfeit Activity
            </h2>

            <span className="danger-badge">
              High Risk
            </span>

          </div>

          <div className="activity-list">

            {alerts.map((alert) => (

              <div
                className="activity-row"
                key={alert.id}
              >

                <div className="activity-alert-icon">
                  <Icon
                    type="alert"
                    size={20}
                  />
                </div>

                <div className="activity-details">

                  <strong>
                    {alert.title}
                  </strong>

                  <span>
                    {alert.product}
                  </span>

                  <small>
                    {alert.location}
                  </small>

                </div>

                <span className="activity-time">
                  {alert.time}
                </span>

              </div>

            ))}

          </div>

        </div>

      </div>
    );
  };

  /* =====================================================
     FRAUD ALERTS
  ===================================================== */

  const renderAlerts = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Fraud Alerts
            </h1>

            <p>
              Review and manage suspicious
              activities.
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
                Everything looks secure.
              </p>

            </div>

          ) : (

            <div className="full-alert-list">

              {alerts.map((alert) => (

                <div
                  className="full-alert-row"
                  key={alert.id}
                >

                  <div className="full-alert-icon">
                    <Icon
                      type="alert"
                      size={22}
                    />
                  </div>

                  <div className="full-alert-info">

                    <h3>
                      {alert.title}
                    </h3>

                    <p>
                      Product:{" "}
                      {alert.product}
                    </p>

                    <p>
                      Location:{" "}
                      {alert.location}
                    </p>

                  </div>

                  <span>
                    {alert.time}
                  </span>

                  <button
                    className="resolve-button"
                    onClick={() =>
                      clearAlert(alert.id)
                    }
                  >
                    Resolve
                  </button>

                </div>

              ))}

            </div>

          )}

        </div>

      </div>
    );
  };

  /* =====================================================
     SCAN LOCATIONS WITH MAP
  ===================================================== */

  const renderLocations = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Scan Locations
            </h1>

            <p>
              View product verification
              activity by location.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setSelectedLocation(null);
              showToast(
                "Map reset successfully."
              );
            }}
          >
            Reset Map
          </button>

        </div>

        {/* MAP */}

        <div className="dashboard-card map-card-large">

          <MapContainer
            center={[
              20.5937,
              78.9629,
            ]}
            zoom={5}
            scrollWheelZoom={true}
            className="admin-map"
          >

            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapController
              selectedLocation={
                selectedLocation
              }
            />

            {locations.map(
              (location) => (

                <Marker
                  key={location.id}
                  position={
                    location.position
                  }
                >

                  <Popup>

                    <div className="map-popup">

                      <h3>
                        {location.city},{" "}
                        {
                          location.country
                        }
                      </h3>

                      <p>
                        Product Verification
                        Scans
                      </p>

                      <strong>
                        {location.scans.toLocaleString()}
                      </strong>

                      <span>
                        ● Active Location
                      </span>

                    </div>

                  </Popup>

                </Marker>

              )
            )}

          </MapContainer>

        </div>

        {/* LOCATION LIST */}

        <div className="dashboard-card location-full-list">

          <div className="card-header">

            <div>
              <h2>
                Top Scan Locations
              </h2>

              <p className="card-subtitle">
                Click a location to view it
                on the map.
              </p>
            </div>

            <span className="total-activity">
              Global Scan Activity
            </span>

          </div>

          <div className="location-cards">

            {locations.map(
              (location, index) => (

                <button
                  className={`location-select-card ${
                    selectedLocation?.id ===
                    location.id
                      ? "selected"
                      : ""
                  }`}
                  key={location.id}
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
                      {location.city},{" "}
                      {location.country}
                    </strong>

                    <span>
                      Product verification
                      activity
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

        </div>

      </div>
    );
  };

  /* =====================================================
     BLOCKCHAIN PAGE
  ===================================================== */

  const renderBlockchain = () => {
    return (
      <div className="inner-page">

        <div className="inner-page-header">

          <div>
            <h1>
              Blockchain Records
            </h1>

            <p>
              View secure blockchain
              transaction records.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              showToast(
                "Blockchain is synchronized."
              )
            }
          >
            Sync Blockchain
          </button>

        </div>

        <div className="monitor-grid">

          <MonitorCard
            title="Total Blocks"
            value="98,563"
            change="+12.4%"
            icon="blockchain"
          />

          <MonitorCard
            title="Transactions"
            value="1,245,896"
            change="+18.2%"
            icon="blockchain"
          />

          <MonitorCard
            title="Data Integrity"
            value="100%"
            change="Secured"
            icon="shield"
            green
          />

          <MonitorCard
            title="Network Status"
            value="Online"
            change="Operational"
            icon="check"
            green
          />

        </div>

        <div className="dashboard-card full-card">

          <div className="card-header">

            <h2>
              Recent Blockchain Blocks
            </h2>

            <span className="secure-badge">
              100% Secured
            </span>

          </div>

          <div className="block-full-list">

            {blocks.map((block) => (

              <div
                className="block-full-row"
                key={block.id}
              >

                <div className="block-icon large">
                  <Icon
                    type="blockchain"
                    size={22}
                  />
                </div>

                <div className="block-full-info">

                  <strong>
                    Block {block.id}
                  </strong>

                  <span>
                    {block.date}
                  </span>

                </div>

                <div className="block-full-transactions">
                  <strong>
                    {block.transactions}
                  </strong>

                  <span>
                    Transactions
                  </span>
                </div>

                <button
                  className="block-view"
                  onClick={() =>
                    showToast(
                      `Block ${block.id} verified successfully.`
                    )
                  }
                >
                  View
                </button>

              </div>

            ))}

          </div>

        </div>

      </div>
    );
  };

  /* =====================================================
     RENDER CURRENT PAGE
  ===================================================== */

  const renderPage = () => {
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

  /* =====================================================
     MAIN RETURN
  ===================================================== */

  return (
    <div className="admin-layout">

      {/* =================================================
          MOBILE OVERLAY
      ================================================= */}

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* =================================================
          SIDEBAR
      ================================================= */}

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
                  activePage === item.key
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

        {/* SIDEBAR BOTTOM IMAGE */}

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

      {/* =================================================
          MAIN SECTION
      ================================================= */}

      <div className="admin-main">

        {/* =================================================
            TOP BAR
        ================================================= */}

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
                            "page"
                              ? "home"
                              : result.type ===
                                "manufacturer"
                              ? "users"
                              : "alert"
                          }
                          size={17}
                        />

                        <span>

                          {result.type ===
                          "page"
                            ? result.name
                            : result.type ===
                              "manufacturer"
                            ? result.name
                            : result.title}

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
                    .slice(0, 3)
                    .map((alert) => (

                      <button
                        key={alert.id}
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
                            {alert.title}
                          </strong>

                          <span>
                            {alert.location}
                          </span>
                        </div>

                      </button>

                    ))}

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
                    onClick={
                      handleLogout
                    }
                  >
                    Logout
                  </button>

                </div>
              )}

            </div>

          </div>

        </header>

        {/* =================================================
            CONTENT
        ================================================= */}

        <main className="admin-content">

          {renderPage()}

        </main>

      </div>

      {/* =================================================
          TOAST
      ================================================= */}

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

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  iconClass,
  title,
  value,
  change,
  subtitle,
  green,
  red,
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
          ↑ {change}
        </span>

        <span className="stat-subtitle">
          {subtitle}
        </span>

      </div>

    </div>
  );
}

/* =========================================================
   DISTRIBUTION ITEM
========================================================= */

function DistributionItem({
  color,
  title,
  percentage,
  count,
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

/* =========================================================
   STATUS ITEM
========================================================= */

function StatusItem({
  icon,
  title,
  value,
  green,
}) {
  return (
    <div className="status-item">

      <div
        className={`status-icon ${
          green ? "green" : "blue"
        }`}
      >
        <Icon
          type={icon}
          size={23}
        />
      </div>

      <div>

        <span>
          {title}
        </span>

        <strong
          className={
            green ? "green-text" : ""
          }
        >
          {value}
        </strong>

      </div>

    </div>
  );
}

/* =========================================================
   MONITOR CARD
========================================================= */

function MonitorCard({
  title,
  value,
  change,
  icon,
  danger,
  green,
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

/* =========================================================
   PROGRESS ROW
========================================================= */

function ProgressRow({
  title,
  value,
  percentage,
  green,
  danger,
}) {
  return (
    <div className="progress-row">

      <div className="progress-header">

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

      </div>

      <div className="progress-bar">

        <div
          className={`progress-fill ${
            green
              ? "green"
              : danger
              ? "danger"
              : ""
          }`}
          style={{
            width: `${percentage}%`,
          }}
        ></div>

      </div>

      <small>
        {percentage}% of total
      </small>

    </div>
  );
}

export default AdminDashboard;