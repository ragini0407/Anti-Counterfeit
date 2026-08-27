import React, { useState } from "react";
import "./Login.css";

function Login({
  onSignup,
  onHome,
  onAdminLogin,
  onManufacturer,
  onConsumer
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // =========================
  // LOGIN
  // =========================
  const handleLogin = (e) => {
    e.preventDefault();

    // Check all fields
    if (!email || !password || !role) {
      alert("Please fill in all fields.");
      return;
    }

    // =========================
    // ADMIN LOGIN
    // =========================
    if (role === "admin") {
      if (onAdminLogin) {
        onAdminLogin();
      } else {
        alert("Admin navigation is not connected.");
      }

      return;
    }

    // =========================
    // MANUFACTURER LOGIN
    // =========================
    if (role === "manufacturer") {
      if (onManufacturer) {
        onManufacturer();
      } else {
        alert("Manufacturer navigation is not connected.");
      }

      return;
    }

    // =========================
    // CONSUMER LOGIN
    // =========================
    if (role === "consumer") {
      if (onConsumer) {
        onConsumer();
      } else {
        alert("Consumer navigation is not connected.");
      }

      return;
    }
  };

  // =========================
  // GOOGLE LOGIN
  // =========================
  const handleGoogle = () => {
    alert("Google Login clicked.");
  };

  // =========================
  // MICROSOFT LOGIN
  // =========================
  const handleMicrosoft = () => {
    alert("Microsoft Login clicked.");
  };

  // =========================
  // FORGOT PASSWORD
  // =========================
  const handleForgotPassword = () => {
    alert("Forgot Password clicked.");
  };

  return (
    <div className="login-page">

      <div className="login-card">

        {/* =========================
            LOGO
        ========================= */}
        <div className="login-logo-section">

          <img
            src="/logo.png"
            alt="Anti-Counterfeit"
            className="login-logo"
          />

          <h2>
            Anti-<span>Counterfeit</span>
          </h2>

          <p>
            AI-Powered Blockchain Product Verification
          </p>

        </div>


        {/* =========================
            HEADING
        ========================= */}
        <div className="login-heading">

          <h1>Welcome Back</h1>

          <p>
            Sign in to continue to your account
          </p>

        </div>


        {/* =========================
            LOGIN FORM
        ========================= */}
        <form onSubmit={handleLogin}>

          {/* EMAIL */}
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
              />

            </div>

          </div>


          {/* PASSWORD */}
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
              />

              <button
                type="button"
                className="show-password"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword
                  ? "◉"
                  : "◌"}
              </button>

            </div>

          </div>


          {/* FORGOT PASSWORD */}
          <div className="forgot-password">

            <button
              type="button"
              onClick={handleForgotPassword}
            >
              Forgot Password?
            </button>

          </div>


          {/* =========================
              LOGIN AS
          ========================= */}
          <div className="form-group">

            <label>Login As</label>

            <div className="input-box">

              <span className="input-icon">
                ♙
              </span>

              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value)
                }
              >

                <option value="">
                  Select your role
                </option>

                <option value="consumer">
                  Consumer
                </option>

                <option value="manufacturer">
                  Manufacturer
                </option>

                <option value="admin">
                  Admin
                </option>

              </select>

            </div>

          </div>


          {/* =========================
              LOGIN BUTTON
          ========================= */}
          <button
            type="submit"
            className="login-submit"
          >

            <span>
              Login
            </span>

            <span className="arrow">
              →
            </span>

          </button>

        </form>


        {/* =========================
            DIVIDER
        ========================= */}
        <div className="divider">

          <span></span>

          <p>
            OR CONTINUE WITH
          </p>

          <span></span>

        </div>


        {/* =========================
            GOOGLE + MICROSOFT
        ========================= */}
        <div className="social-login">

          <button
            type="button"
            className="social-button"
            onClick={handleGoogle}
          >

            <img
              src="/google.png"
              alt="Google"
              className="social-logo"
            />

            <span>
              Google
            </span>

          </button>


          <button
            type="button"
            className="social-button"
            onClick={handleMicrosoft}
          >

            <img
              src="/microsoft.png"
              alt="Microsoft"
              className="social-logo"
            />

            <span>
              Microsoft
            </span>

          </button>

        </div>


        {/* =========================
            SIGN UP
        ========================= */}
        <div className="signup-text">

          <span>
            Don't have an account?
          </span>

          <button
            type="button"
            onClick={onSignup}
          >
            Sign Up
          </button>

        </div>


        {/* =========================
            BACK TO HOME
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
            FOOTER
        ========================= */}
        <div className="security-footer">

          <div>

            <span className="security-icon">
              ♢
            </span>

            <span>
              Secure
            </span>

          </div>


          <div className="footer-line"></div>


          <div>

            <span className="security-icon">
              ♙
            </span>

            <span>
              Transparent
            </span>

          </div>


          <div className="footer-line"></div>


          <div>

            <span className="security-icon">
              ♢
            </span>

            <span>
              Trustworthy
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Login;