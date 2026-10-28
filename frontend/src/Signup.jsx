import React, { useState } from "react";
import { apiUrl } from "./api";
import "./Auth.css";

const REGISTRATION_ENDPOINTS = {
  manufacturer: "register-manufacturer",
  distributor: "register-distributor",
  retailer: "register-retailer"
};

function Signup({ onLogin, onHome }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
    companyName: "",
    registrationNumber: "",
    address: "",
    contactNumber: ""
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageType("error");

    if (!REGISTRATION_ENDPOINTS[form.role]) {
      setMessage("Select manufacturer, distributor, or retailer.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (!termsAccepted) {
      setMessage("Please accept the Terms of Service and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        apiUrl(`/auth/${REGISTRATION_ENDPOINTS[form.role]}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            companyName: form.companyName.trim(),
            registrationNumber: form.registrationNumber.trim(),
            address: form.address.trim(),
            contactNumber: form.contactNumber.trim()
          })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.message === "Email is already registered") {
          setMessage("This email is already registered. Try logging in.");
        } else {
          setMessage(data.message || "Registration failed. Please try again.");
        }
        return;
      }

      setMessage(
        "Registration submitted. Your account and profile are pending admin approval. Wallet binding and on-chain role approval are separate steps."
      );
      setMessageType("success");
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const textField = (label, field, placeholder, type = "text", autoComplete) => (
    <div className="form-group" key={field}>
      <label htmlFor={`signup-${field}`}>{label}</label>
      <div className="input-box">
        <input
          id={`signup-${field}`}
          type={type}
          placeholder={placeholder}
          value={form[field]}
          onChange={update(field)}
          autoComplete={autoComplete}
          disabled={loading}
          required
        />
      </div>
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card signup-card">
        <div className="auth-logo-section">
          <img src="/logo.png" alt="Anti-Counterfeit Logo" className="auth-logo" />
          <h1>Anti-<span>Counterfeit</span></h1>
          <p>AI-Powered Blockchain Product Verification</p>
        </div>

        <div className="auth-heading">
          <h2>Create Account</h2>
          <p>Join us and start verifying with confidence</p>
        </div>

        <form onSubmit={handleSubmit}>
          {textField("Full Name", "name", "Enter your full name", "text", "name")}
          {textField("Email Address", "email", "Enter your email", "email", "email")}
          <div className="form-group">
            <label htmlFor="signup-password">Password</label>
            <div className="input-box">
              <input id="signup-password" type={showPassword ? "text" : "password"} placeholder="Create a password" value={form.password} onChange={update("password")} autoComplete="new-password" disabled={loading} required />
              <button type="button" className="eye-button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? "◉" : "◌"}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="signup-confirmPassword">Confirm Password</label>
            <div className="input-box">
              <input id="signup-confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Confirm your password" value={form.confirmPassword} onChange={update("confirmPassword")} autoComplete="new-password" disabled={loading} required />
              <button type="button" className="eye-button" onClick={() => setShowConfirmPassword((shown) => !shown)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}>
                {showConfirmPassword ? "◉" : "◌"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="signup-role">Register As</label>
            <div className="input-box">
              <select id="signup-role" value={form.role} onChange={update("role")} disabled={loading} required>
                <option value="" disabled>Select your role</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="distributor">Distributor</option>
                <option value="retailer">Retailer</option>
              </select>
            </div>
          </div>

          {textField("Company Name", "companyName", "Enter your registered company name", "text", "organization")}
          {textField("Registration Number", "registrationNumber", "Enter your registration number", "text")}
          {textField("Business Address", "address", "Enter your business address", "text", "street-address")}
          {textField("Contact Number", "contactNumber", "Enter your contact number", "tel", "tel")}

          <div className="terms">
            <input
              type="checkbox"
              id="terms"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              disabled={loading}
              required
            />
            <label htmlFor="terms">
              I agree to <button type="button" onClick={() => alert("Terms of Service")}>Terms of Service</button>
              {" and "}
              <button type="button" onClick={() => alert("Privacy Policy")}>Privacy Policy</button>
            </label>
          </div>

          {message && (
            <p
              className={`signup-message ${messageType}`}
              role={messageType === "error" ? "alert" : "status"}
              style={{
                color: messageType === "error" ? "#b42318" : "#157347",
                background: messageType === "error" ? "#fff3f2" : "#eefaf3",
                borderRadius: "6px",
                padding: "10px 12px",
                lineHeight: 1.45,
                fontSize: "13px"
              }}
            >
              {message}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Submitting..." : "Create Account"}
            {!loading && <span>→</span>}
          </button>
        </form>

        <div className="switch-page">
          <span>Already have an account?</span>
          <button type="button" onClick={onLogin}>Login</button>
        </div>
        <div className="back-home">
          <button type="button" onClick={onHome}>← Back to Home</button>
        </div>
        <div className="auth-features">
          <div><span>♢</span><p>Secure</p></div>
          <div><span>♙</span><p>Transparent</p></div>
          <div><span>♢</span><p>Trustworthy</p></div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
