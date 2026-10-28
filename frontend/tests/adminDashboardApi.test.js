import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAdminDashboard, fetchAdminVerifications, fetchAdminProductLifecycle } from "../src/adminDashboardApi.js";

const dashboardSource = readFileSync(fileURLToPath(new URL("../src/AdminDashboard.jsx", import.meta.url)), "utf8");
const dashboardCss = readFileSync(fileURLToPath(new URL("../src/AdminDashboard.css", import.meta.url)), "utf8");

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("dashboard client sends server pagination and admin bearer authorization", async () => {
  let request;
  const data = await fetchAdminDashboard({
    url: "/api/admin/dashboard", token: "test-token",
    pages: { products: 2, manufacturers: 3, recentVerifications: 4, alerts: 5, pageSize: 10 },
    fetchImpl: async (url, options) => { request = { url, options }; return response(200, { success: true, products: [], pagination: {} }); }
  });
  assert.equal(data.success, true);
  const url = new URL(request.url, "http://local.test");
  assert.equal(url.searchParams.get("productPage"), "2");
  assert.equal(url.searchParams.get("pageSize"), "10");
  assert.equal(request.options.headers.Authorization, "Bearer test-token");
});

test("verification client sends only supported filters with page and page size", async () => {
  let requestedUrl;
  await fetchAdminVerifications({
    url: "/api/admin/verifications", token: "test-token",
    filters: { type: "QR", status: "SUSPICIOUS", scoringStatus: "UNAVAILABLE", productCode: " FPD100 " },
    page: 2, pageSize: 25,
    fetchImpl: async (url) => { requestedUrl = url; return response(200, { success: true, verifications: [], pagination: {} }); }
  });
  const url = new URL(requestedUrl, "http://local.test");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    type: "QR", status: "SUSPICIOUS", scoringStatus: "UNAVAILABLE", productCode: "FPD100", page: "2", pageSize: "25"
  });
});

test("admin lifecycle client uses bounded server pagination and authorization", async () => {
  let request;
  await fetchAdminProductLifecycle({
    url: "/api/admin/products/FPD-V2-1/lifecycle", token: "admin-test-token", page: 2, pageSize: 15,
    fetchImpl: async (url, options) => { request = { url, options }; return response(200, { success: true, lifecycle: [], verifications: [] }); }
  });
  const url = new URL(request.url, "http://local.test");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("pageSize"), "15");
  assert.equal(request.options.headers.Authorization, "Bearer admin-test-token");
});

test("API client distinguishes unauthorized and malformed responses", async () => {
  await assert.rejects(
    fetchAdminVerifications({ url: "/api/admin/verifications", token: "test-token", fetchImpl: async () => response(401, { message: "Authentication required" }) }),
    (error) => error.status === 401 && /Authentication required/.test(error.message)
  );
  await assert.rejects(
    fetchAdminDashboard({ url: "/api/admin/dashboard", token: "test-token", fetchImpl: async () => response(200, { products: [] }) }),
    /invalid response/i
  );
  await assert.rejects(fetchAdminDashboard({ url: "/api/admin/dashboard", token: "", fetchImpl: fetch }), /login session/i);
});

test("dashboard UI exposes loading, error, empty, pagination, filters, and distinct scoring states", () => {
  for (const evidence of [
    "Loading verification records", "verificationError", "No matching verification records",
    "PageControls", "Apply filters", "SCORED", "INSUFFICIENT_DATA", "UNAVAILABLE",
    "NOT RECORDED", "Stored authenticity result", "AI scan-risk assessment", "Location and partner attribution"
  ]) assert.ok(dashboardSource.includes(evidence), `Expected UI evidence for ${evidence}`);
  assert.match(dashboardCss, /@media \(max-width: 640px\)/);
  assert.match(dashboardCss, /verification-filters/);
});
