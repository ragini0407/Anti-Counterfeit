# Backend Deployment & Security Configuration Guide

This guide describes how to configure the backend environment for a public HTTPS demonstration of the V1 Anti-Counterfeit system.

---

## 1. Environment Configuration

All production configurations must be provided through secure platform environment variables or a local secret manager. Never commit actual secret values, private keys, or credentials to version control.

### Example Configuration (`.env.example`)

```env
# Application Port and Environment
PORT=5000
NODE_ENV=production

# Frontend Origin Allowlist (Required in production)
# Specify one or more canonical HTTPS origins separated by commas or spaces.
# In production:
#   - Every origin must use HTTPS (plain HTTP is rejected).
#   - Loopback origins (localhost, 127.0.0.1, [::1], 0.0.0.0) are rejected.
#   - Wildcard '*' is strictly prohibited and fails closed on startup.
# Examples:
#   Single origin:  FRONTEND_ORIGIN=https://anti-counterfeit.example.com
#   Multi-origin:   FRONTEND_ORIGIN=https://demo.example.com,https://admin.example.com
FRONTEND_ORIGIN=https://anti-counterfeit.example.com

# Reverse Proxy Trust Configuration
# Safe options:
#   1          - Trust single front-facing proxy hop (Render, Railway, Heroku, AWS ALB, Cloudflare, Nginx).
#   loopback   - Trust local loopback proxy on the same host (127.0.0.1, ::1).
#   <ip-list>  - Comma-separated list of trusted upstream proxy CIDRs or IP addresses.
#   false      - Do not trust proxy headers (direct internet exposure without reverse proxy).
# Note: "true" is automatically sanitized to 1 to avoid blind trust of arbitrary spoofed headers.
# Defaults to 1 when NODE_ENV=production, and false in development.
TRUST_PROXY=1

# MongoDB Connection String (Placeholder only)
MONGO_URI=mongodb+srv://PLACEHOLDER_USER:PLACEHOLDER_PASSWORD@cluster0.example.mongodb.net/anti_counterfeit?retryWrites=true&w=majority

# JWT Authentication Secret (At least 32 random characters)
JWT_SECRET=REPLACE_WITH_A_SECURE_RANDOM_SECRET_AT_LEAST_32_CHARS

# Blockchain Configuration (Sepolia Testnet V1 Read-Only Verification)
CHAIN_ID=11155111
BLOCKCHAIN_RPC_URL=https://rpc2.sepolia.org
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Optional AI Microservice Configuration
AI_ENABLED=false
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_TOKEN=REPLACE_WITH_A_RANDOM_32_CHAR_TOKEN_IF_AI_IS_ENABLED
```

---

## 2. CORS Policy and Origin Security

* **Production Mode (`NODE_ENV=production`)**:
  - `FRONTEND_ORIGIN` is **mandatory**. If omitted, empty, or malformed, the server fails closed immediately during startup.
  - **HTTPS Enforcement**: In production, every configured origin **must use HTTPS**. Insecure `http:` origins are strictly rejected.
  - **Loopback Rejection**: `localhost`, `127.0.0.1`, `[::1]`, and other loopback hostnames are strictly rejected in production to guarantee public demo readiness.
  - **Wildcard Prohibition**: Wildcard (`*`) is **strictly rejected**.
* **Development Mode (`NODE_ENV=development` / unset)**:
  - If `FRONTEND_ORIGIN` is unset, standard local development origins are permitted:
    - `http://localhost:5173`, `http://127.0.0.1:5173` (Vite dev server)
    - `http://localhost:3000`, `http://127.0.0.1:3000`
    - `http://localhost:5000`, `http://127.0.0.1:5000`
  - If `FRONTEND_ORIGIN` is provided, those origins are merged with the local development origins for ease of mobile testing tunnels (e.g. ngrok).
* **Allowed HTTP Methods**:
  - `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
* **Allowed Request Headers**:
  - `Content-Type`, `Authorization`, `Idempotency-Key`
* **Preflight Requests**:
  - Authorized preflights respond with HTTP `204 No Content`.
  - Disallowed preflights respond with HTTP `403 Forbidden` and do not receive `Access-Control-Allow-Origin`.

---

## 3. Reverse Proxy & Public HTTPS Demo Readiness

1. **Express `trust proxy` Safety**:
   - Modern cloud platforms (Render, Railway, Fly.io, Heroku, AWS ALB) terminate TLS and forward requests to the Node application with `X-Forwarded-*` headers.
   - Setting `trust proxy` to `true` blindly trusts all forwarded headers from untrusted clients, which allows IP and protocol spoofing.
   - The backend enforces safe parsing: `"true"` is mapped to `1` (single hop), `"false"` to `false`, and defaults to `1` in production.
2. **Mobile Browser HTTPS Requirement**:
   - Mobile browsers (Safari on iOS, Chrome on Android) enforce that `navigator.mediaDevices.getUserMedia` (camera for QR scanning and photo upload) and `navigator.geolocation` are **only accessible in a Secure Context (`https://`)**.
   - If deploying a demo for testing from phones, both frontend and backend must be served over valid HTTPS (e.g. via Cloudflare, Vercel/Netlify for frontend, Railway/Render for backend, or an HTTPS reverse proxy tunnel).
3. **Frontend Production Build Base URL**:
   - When building the frontend for production (`npm run build` in `frontend/`), set the environment variable:
     ```env
     VITE_API_BASE_URL=https://api.your-backend-domain.com/api
     ```
   - Ensure `FRONTEND_ORIGIN` on the backend matches the public HTTPS frontend domain (e.g. `https://your-frontend-domain.com`).
