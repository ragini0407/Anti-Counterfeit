import React, { useState } from "react";
import "./Login.css";

function Login({
  onSignup,
  onHome,
  onAdminLogin,
  onManufacturerLogin,
  onAdmin,
  onManufacturer,
  onConsumer
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !password || !role) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "http://localhost:5000/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Login failed"
        );
      }

      /*
       * IMPORTANT
       * Save JWT returned by backend.
       */
      localStorage.setItem(
        "token",
        data.token
      );

      /*
       * Save logged-in user.
       */
      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      /*
       * Backend returns:
       *
       * ADMIN
       * MANUFACTURER
       *
       * Consumer may need to exist
       * in your User model later.
       */

      const backendRole =
        data.user.role;

      if (backendRole === "ADMIN") {
        if (onAdminLogin) {
          onAdminLogin();
        } else if (onAdmin) {
          onAdmin();
        }

        return;
      }

      if (backendRole === "MANUFACTURER") {
        if (onManufacturerLogin) {
          onManufacturerLogin();
        } else if (onManufacturer) {
          onManufacturer();
        }

        return;
      }

      if (backendRole === "CONSUMER") {
        if (onConsumerLogin) {
          onConsumerLogin();
        } else if (onConsumer) {
          onConsumer();
        }

        return;
      }

      alert(
        `Unknown account role: ${backendRole}`
      );

    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      alert(error.message);

    } finally {
      setLoading(false);
    }
  };


  const handleGoogle = () => {
    alert("Google Login is not connected yet.");
  };


  const handleMicrosoft = () => {
    alert("Microsoft Login is not connected yet.");
  };


  const handleForgotPassword = () => {
    alert("Forgot Password is not connected yet.");
  };


  return (
    <div className="login-page">

      <div className="login-card">

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


        <div className="login-heading">

          <h1>Welcome Back</h1>

          <p>
            Sign in to continue to your account
          </p>

        </div>


        <form onSubmit={handleLogin}>

          {/* EMAIL */}

          <div className="form-group">

            <label>
              Email Address
            </label>

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
                disabled={loading}
              />

            </div>

          </div>


          {/* PASSWORD */}

          <div className="form-group">

            <label>
              Password
            </label>

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
                disabled={loading}
              />

              <button
                type="button"
                className="show-password"
                onClick={() =>
                  setShowPassword(
                    !showPassword
                  )
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
              onClick={
                handleForgotPassword
              }
            >
              Forgot Password?
            </button>

          </div>


          {/* ROLE */}

          <div className="form-group">

            <label>
              Login As
            </label>

            <div className="input-box">

              <span className="input-icon">
                ♙
              </span>

              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value)
                }
                disabled={loading}
              >

                <option value="">
                  Select your role
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


          {/* LOGIN */}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >

            <span>
              {loading
                ? "Logging in..."
                : "Login"}
            </span>

            {!loading && (
              <span className="arrow">
                →
              </span>
            )}

          </button>

        </form>


        <div className="divider">

          <span></span>

          <p>
            OR CONTINUE WITH
          </p>

          <span></span>

        </div>


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


        <div className="back-home">

          <button
            type="button"
            onClick={onHome}
          >
            ← Back to Home
          </button>

        </div>


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