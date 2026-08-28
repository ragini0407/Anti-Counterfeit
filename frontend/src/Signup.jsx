import React, { useState } from "react";
import "./Auth.css";

function Signup({ onLogin, onHome }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // =========================
  // FORM STATES
  // =========================
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // =========================
  // CREATE ACCOUNT
  // =========================
  const handleSubmit = (e) => {
    e.preventDefault();

    // Check all fields
    if (
      !fullName ||
      !email ||
      !password ||
      !confirmPassword ||
      !role
    ) {
      alert("Please fill in all fields.");
      return;
    }

    // Check password
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    // Check terms
    if (!termsAccepted) {
      alert("Please accept the Terms of Service and Privacy Policy.");
      return;
    }

    // =========================
    // SUCCESS
    // =========================
    alert(
      `Account created successfully!\n\nName: ${fullName}\nRole: ${role}`
    );

    // After signup go to Login
    if (onLogin) {
      onLogin();
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card signup-card">

        {/* =========================
            LOGO
        ========================= */}
        <div className="auth-logo-section">

          <img
            src="/logo.png"
            alt="Anti-Counterfeit Logo"
            className="auth-logo"
          />

          <h1>
            Anti-<span>Counterfeit</span>
          </h1>

          <p>
            AI-Powered Blockchain Product Verification
          </p>

        </div>


        {/* =========================
            HEADING
        ========================= */}
        <div className="auth-heading">

          <h2>Create Account</h2>

          <p>
            Join us and start verifying with confidence
          </p>

        </div>


        {/* =========================
            SIGNUP FORM
        ========================= */}
        <form onSubmit={handleSubmit}>

          {/* =========================
              FULL NAME
          ========================= */}
          <div className="form-group">

            <label>Full Name</label>

            <div className="input-box">

              <span className="input-icon">
                ♙
              </span>

              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                required
              />

            </div>

          </div>


          {/* =========================
              EMAIL
          ========================= */}
          <div className="form-group">

            <label>Email Address</label>

            <div className="input-box">

              <span className="input-icon">
                ✉
              </span>

              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />

            </div>

          </div>


          {/* =========================
              PASSWORD
          ========================= */}
          <div className="form-group">

            <label>Password</label>

            <div className="input-box">

              <span className="input-icon">
                🔒
              </span>

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Create a password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />

              <button
                type="button"
                className="eye-button"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? "◉" : "◌"}
              </button>

            </div>

          </div>


          {/* =========================
              CONFIRM PASSWORD
          ========================= */}
          <div className="form-group">

            <label>Confirm Password</label>

            <div className="input-box">

              <span className="input-icon">
                🔒
              </span>

              <input
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                required
              />

              <button
                type="button"
                className="eye-button"
                onClick={() =>
                  setShowConfirmPassword(
                    !showConfirmPassword
                  )
                }
              >
                {showConfirmPassword ? "◉" : "◌"}
              </button>

            </div>

          </div>


          {/* =========================
              REGISTER AS
          ========================= */}
          <div className="form-group">

            <label>Register As</label>

            <div className="input-box">

              <span className="input-icon">
                ♙
              </span>

              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value)
                }
                required
              >

                <option value="" disabled>
                  Select your role
                </option>

                <option value="consumer">
                  Consumer
                </option>

                <option value="manufacturer">
                  Manufacturer
                </option>

                <option value="seller">
                  Seller
                </option>

                <option value="admin">
                  Admin
                </option>

              </select>

            </div>

          </div>


          {/* =========================
              TERMS
          ========================= */}
          <div className="terms">

            <input
              type="checkbox"
              id="terms"
              checked={termsAccepted}
              onChange={(e) =>
                setTermsAccepted(e.target.checked)
              }
              required
            />

            <label htmlFor="terms">

              I agree to{" "}

              <button
                type="button"
                onClick={() =>
                  alert("Terms of Service")
                }
              >
                Terms of Service
              </button>

              {" "}and{" "}

              <button
                type="button"
                onClick={() =>
                  alert("Privacy Policy")
                }
              >
                Privacy Policy
              </button>

            </label>

          </div>


          {/* =========================
              CREATE ACCOUNT
          ========================= */}
          <button
            type="submit"
            className="auth-submit"
          >

            Create Account

            <span>
              →
            </span>

          </button>

        </form>


        {/* =========================
            LOGIN
        ========================= */}
        <div className="switch-page">

          <span>
            Already have an account?
          </span>

          <button
            type="button"
            onClick={onLogin}
          >
            Login
          </button>

        </div>


        {/* =========================
            BACK HOME
        ========================= */}
        <div className="back-home">

          <button
            type="button"
            onClick={onHome}
          >
            ← Back to Home
          </button>

        </div>


        {/* =========================
            BOTTOM FEATURES
        ========================= */}
        <div className="auth-features">

          <div>

            <span>
              ♢
            </span>

            <p>
              Secure
            </p>

          </div>


          <div>

            <span>
              ♙
            </span>

            <p>
              Transparent
            </p>

          </div>


          <div>

            <span>
              ♢
            </span>

            <p>
              Trustworthy
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Signup;