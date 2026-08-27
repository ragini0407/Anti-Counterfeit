import React, { useState } from "react";

import Home from "./Home";
import Login from "./Login";
import Signup from "./Signup";
import AdminDashboard from "./AdminDashboard";
import ManufacturerDashboard from "./ManufacturerDashboard";
import ConsumerDashboard from "./ConsumerDashboard";

import Scanner from "./Scanner";
import ConsumerScanner from "./ConsumerScanner";

import "./App.css";

function App() {
  const [page, setPage] = useState("home");

  // =========================
  // HOME → LOGIN
  // =========================
  const openLogin = () => {
    setPage("login");
  };

  // =========================
  // LOGIN → SIGNUP
  // =========================
  const openSignup = () => {
    setPage("signup");
  };

  // =========================
  // SIGNUP → LOGIN
  // =========================
  const openLoginFromSignup = () => {
    setPage("login");
  };

  // =========================
  // LOGIN / SIGNUP → HOME
  // =========================
  const openHome = () => {
    setPage("home");
  };

  // =========================
  // LOGIN → ADMIN
  // =========================
  const openAdmin = () => {
    setPage("admin");
  };

  // =========================
  // LOGIN → MANUFACTURER
  // =========================
  const openManufacturer = () => {
    setPage("manufacturer");
  };

  // =========================
  // LOGIN → CONSUMER
  // =========================
  const openConsumer = () => {
    setPage("consumer");
  };

  // ==================================================
  // MANUFACTURER → MANUFACTURER SCANNER
  // ==================================================
  const openManufacturerScanner = () => {
    setPage("manufacturer-scanner");
  };

  // ==================================================
  // MANUFACTURER SCANNER → MANUFACTURER DASHBOARD
  // ==================================================
  const closeManufacturerScanner = () => {
    setPage("manufacturer");
  };

  // ==================================================
  // CONSUMER → CONSUMER SCANNER
  // ==================================================
  const openConsumerScanner = () => {
    setPage("consumer-scanner");
  };

  // ==================================================
  // CONSUMER SCANNER → CONSUMER DASHBOARD
  // ==================================================
  const closeConsumerScanner = () => {
    setPage("consumer");
  };

  // =========================
  // HOME
  // =========================
  if (page === "home") {
    return (
      <Home
        onLogin={openLogin}
      />
    );
  }

  // =========================
  // LOGIN
  // =========================
  if (page === "login") {
    return (
      <Login
        onSignup={openSignup}
        onHome={openHome}

        // ADMIN
        onAdminLogin={openAdmin}
        onAdmin={openAdmin}

        // MANUFACTURER
        onManufacturerLogin={openManufacturer}
        onManufacturer={openManufacturer}

        // CONSUMER
        onConsumerLogin={openConsumer}
        onConsumer={openConsumer}
      />
    );
  }

  // =========================
  // SIGNUP
  // =========================
  if (page === "signup") {
    return (
      <Signup
        onLogin={openLoginFromSignup}
        onHome={openHome}
      />
    );
  }

  // =========================
  // ADMIN DASHBOARD
  // =========================
  if (page === "admin") {
    return (
      <AdminDashboard
        onLogout={openHome}
      />
    );
  }

  // ==================================================
  // MANUFACTURER DASHBOARD
  // ==================================================
  if (page === "manufacturer") {
    return (
      <ManufacturerDashboard
        onLogout={openHome}
        onScanner={openManufacturerScanner}
      />
    );
  }

  // ==================================================
  // CONSUMER DASHBOARD
  // ==================================================
  if (page === "consumer") {
    return (
      <ConsumerDashboard
        onLogout={openHome}
        onScanner={openConsumerScanner}
      />
    );
  }

  // ==================================================
  // MANUFACTURER QR SCANNER
  // ==================================================
  if (page === "manufacturer-scanner") {
    return (
      <Scanner
        onBack={closeManufacturerScanner}
      />
    );
  }

  // ==================================================
  // CONSUMER QR SCANNER
  // ==================================================
  if (page === "consumer-scanner") {
    return (
      <ConsumerScanner
        onBack={closeConsumerScanner}
      />
    );
  }

  // =========================
  // FALLBACK
  // =========================
  return (
    <Home
      onLogin={openLogin}
    />
  );
}

export default App;