const test = require("node:test");
const assert = require("node:assert/strict");

const Manufacturer = require("../models/Manufacturer");
const Product = require("../models/Product");
const Verification = require("../models/Verification");
const adminRoutes = require("../routes/adminRoutes");
const productRegistrationService = require("../services/productRegistrationService");
const { protect } = require("../middleware/authMiddleware");
const { getAdminDashboard, getAdminVerifications } = require("../controllers/adminController");

const original = {
  countDocuments: Verification.countDocuments,
  aggregate: Verification.aggregate,
  find: Verification.find,
  manufacturerCountDocuments: Manufacturer.countDocuments,
  manufacturerFind: Manufacturer.find,
  productAggregate: Product.aggregate,
  productFind: Product.find,
  listAllProductsPaginated: productRegistrationService.listAllProductsPaginated
};

const rows = [
  { _id: "q1", productCode: "FPD100", verificationType: "QR", status: "GENUINE", scoringStatus: "SCORED", anomalyScore: 0.12, isSuspicious: false, locationConsentStatus: "GRANTED", createdAt: new Date("2026-10-01T10:00:00Z"), location: { latitude: 12, longitude: 77 } },
  { _id: "q-risk", productCode: "FPD100", verificationType: "QR", status: "GENUINE", scoringStatus: "SCORED", anomalyScore: 0.89, isSuspicious: true, createdAt: new Date("2026-10-01T11:00:00Z") },
  { _id: "q2", productCode: "FPD100", verificationType: "QR", status: "SUSPICIOUS", scoringStatus: "INSUFFICIENT_DATA", anomalyScore: null, isSuspicious: null, locationConsentStatus: "DENIED", createdAt: new Date("2026-10-02T10:00:00Z"), location: { latitude: 13, longitude: 78 } },
  { _id: "q3", productCode: "FPD101", verificationType: "QR", status: "FAKE", scoringStatus: "UNAVAILABLE", anomalyScore: null, isSuspicious: null, createdAt: new Date("2026-10-03T10:00:00Z") },
  { _id: "i1", productCode: "FPD100", verificationType: "IMAGE", status: "GENUINE", scoringStatus: "NOT_APPLICABLE", locationConsentStatus: "GRANTED", createdAt: new Date("2026-10-04T10:00:00Z"), location: { latitude: 95, longitude: 200 } },
  { _id: "q-legacy", productCode: "FPD104", verificationType: "QR", status: "GENUINE", scoringStatus: "INSUFFICIENT_DATA", createdAt: new Date("2026-10-04T11:00:00Z"), location: { latitude: 18, longitude: 79 } },
  { _id: "i2", productCode: "FPD102", verificationType: "IMAGE", status: "FAKE", scoringStatus: "NOT_APPLICABLE", createdAt: new Date("2026-10-05T10:00:00Z") }
];

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function chain(rowsForQuery, calls = {}) {
  let selectedRows = rowsForQuery;
  const query = {
    select(value) {
      calls.select = value;
      if (typeof value === "string" && !value.includes("-")) {
        const fields = value.split(/\s+/).filter(Boolean);
        selectedRows = rowsForQuery.map((row) => Object.fromEntries(
          fields.filter((field) => field in row).map((field) => [field, row[field]])
        ));
      }
      return this;
    },
    populate(...args) { calls.populate = args; return this; },
    sort(value) { calls.sort = value; return this; },
    skip(value) { calls.skip = value; return this; },
    limit(value) { calls.limit = value; return this; },
    lean: async () => selectedRows
  };
  return query;
}

function installDashboardMocks() {
  const calls = { verificationFind: [], aggregates: [], manufacturer: {}, product: {} };
  Verification.countDocuments = async (filter = {}) => {
    if (filter.status?.$in) return rows.filter((row) => filter.status.$in.includes(row.status)).length;
    if (filter.$or) return rows.filter((row) => filter.$or.some((clause) => Object.entries(clause).every(([key, value]) => value?.$in ? value.$in.includes(row[key]) : row[key] === value))).length;
    return rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value)).length;
  };
  Verification.aggregate = async (pipeline) => {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    calls.aggregates.push(pipeline);
    if (match.scoringStatus) {
      const counts = new Map();
      rows.filter((row) => row.verificationType === "QR" && match.scoringStatus.$in.includes(row.scoringStatus))
        .forEach((row) => counts.set(row.scoringStatus, (counts.get(row.scoringStatus) || 0) + 1));
      return [...counts].map(([_id, count]) => ({ _id, count }));
    }
    if (match.locationConsentStatus === "GRANTED") {
      return rows
        .filter((row) => row.locationConsentStatus === "GRANTED" &&
          typeof row.location?.latitude === "number" && row.location.latitude >= -90 && row.location.latitude <= 90 &&
          typeof row.location?.longitude === "number" && row.location.longitude >= -180 && row.location.longitude <= 180)
        .map((row) => ({
          latitude: row.location.latitude,
          longitude: row.location.longitude,
          scans: 1,
          genuine: row.status === "GENUINE" ? 1 : 0,
          suspicious: row.status === "SUSPICIOUS" ? 1 : 0,
          fake: row.status === "FAKE" ? 1 : 0,
          lastScan: row.createdAt
        }));
    }
    return [{ _id: { date: "2026-10-01", status: "GENUINE", verificationType: "QR" }, count: 1 }];
  };
  Verification.find = (filter = {}) => {
    const selected = rows.filter((row) => {
      if (filter.$or && !filter.$or.some((clause) => Object.entries(clause).every(([key, value]) => value?.$in ? value.$in.includes(row[key]) : row[key] === value))) return false;
      if (filter.status?.$in && !filter.status.$in.includes(row.status)) return false;
      return Object.entries(filter).every(([key, value]) => key === "status" && value?.$in ? true : row[key] === value);
    });
    const current = { filter, selected };
    calls.verificationFind.push(current);
    return chain(selected, current);
  };
  Manufacturer.countDocuments = async (filter = {}) => filter.verificationStatus ? 0 : 1;
  Manufacturer.find = () => chain([{ _id: "m1", companyName: "Example Manufacturer", userId: { name: "Admin Test", email: "masked@example.test", status: "ACTIVE" } }], calls.manufacturer);
  Product.aggregate = async () => [];
  Product.find = () => chain([
    { productCode: "FPD100", productName: "Sample medicine", brandName: "Example brand", category: "Medicine", manufacturerId: { companyName: "Example Manufacturer" }, productHash: "stored-hash", transactionHash: "stored-tx", mintedAt: new Date("2026-09-01T00:00:00Z") }
  ], calls.product);
  productRegistrationService.listAllProductsPaginated = async ({ page, pageSize }) => ({
    products: [{ productCode: "FPD100", productName: "Sample medicine", status: "REGISTERED", totalVerifications: 3 }],
    pagination: { page, pageSize, total: 1, totalPages: 1 }
  });
  return calls;
}

test.after(() => {
  Verification.countDocuments = original.countDocuments;
  Verification.aggregate = original.aggregate;
  Verification.find = original.find;
  Manufacturer.countDocuments = original.manufacturerCountDocuments;
  Manufacturer.find = original.manufacturerFind;
  Product.aggregate = original.productAggregate;
  Product.find = original.productFind;
  productRegistrationService.listAllProductsPaginated = original.listAllProductsPaginated;
});

test("dashboard separates QR and image counts and summarizes actual QR scoring states", async () => {
  const calls = installDashboardMocks();
  const response = responseRecorder();
  await getAdminDashboard({ query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.stats.totalScans, 7);
  assert.equal(response.body.stats.qrScans, 5);
  assert.equal(response.body.stats.imageVerifications, 2);
  assert.equal(response.body.stats.genuineScans, 4);
  assert.equal(response.body.stats.suspiciousScans, 1);
  assert.equal(response.body.stats.fakeScans, 2);
  assert.deepEqual(response.body.stats.scoringStatusCounts, { SCORED: 2, INSUFFICIENT_DATA: 2, UNAVAILABLE: 1 });
  assert.equal(response.body.stats.validLocationScans, 1);
  assert.deepEqual(response.body.locations.map((point) => [point.latitude, point.longitude]), [[12, 77]]);
  assert.equal(response.body.locationDataAvailability.available, true);
  const locationMatch = calls.aggregates
    .map((pipeline) => pipeline.find((stage) => stage.$match)?.$match)
    .find((match) => match?.locationConsentStatus);
  assert.equal(locationMatch.locationConsentStatus, "GRANTED");
  assert.equal(response.body.locations.some((point) => point.latitude === 18), false);
});

test("dashboard returns a location empty state when no valid consented coordinates exist", async () => {
  const calls = installDashboardMocks();
  const originalAggregate = Verification.aggregate;
  Verification.aggregate = async (pipeline) => {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    calls.aggregates.push(pipeline);
    if (match.scoringStatus) return [];
    if (match.locationConsentStatus === "GRANTED") return [];
    return [{ _id: { date: "2026-10-01", status: "GENUINE", verificationType: "QR" }, count: 1 }];
  };
  try {
    const response = responseRecorder();
    await getAdminDashboard({ query: {} }, response);
    assert.deepEqual(response.body.locations, []);
    assert.equal(response.body.stats.validLocationScans, 0);
    assert.equal(response.body.locationDataAvailability.available, false);
    assert.match(response.body.locationDataAvailability.reason, /valid coordinates and recorded location consent/i);
  } finally {
    Verification.aggregate = originalAggregate;
  }
});

test("dashboard uses bounded server-side pagination for product, manufacturer and verification lists", async () => {
  const calls = installDashboardMocks();
  const response = responseRecorder();
  await getAdminDashboard({ query: { productPage: "2", manufacturerPage: "3", recentPage: "4", alertPage: "5", pageSize: "10" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.pagination.products.page, 2);
  assert.equal(response.body.pagination.recentVerifications.page, 4);
  assert.equal(response.body.pagination.alerts.page, 5);
  assert.equal(calls.manufacturer.skip, 20);
  assert.equal(calls.manufacturer.limit, 10);
  assert.equal(calls.verificationFind[0].skip, 30);
  assert.equal(calls.verificationFind[0].limit, 10);
  assert.deepEqual(calls.verificationFind[1].filter.$or[1], { scoringStatus: "SCORED", isSuspicious: true });
  assert.equal(calls.product.select.includes("location"), false);
});

test("verification endpoint validates supported filters, paginates and omits unconsented location and internal idempotency fields", async () => {
  const calls = installDashboardMocks();
  const response = responseRecorder();
  await getAdminVerifications({ query: { type: "QR", status: "SUSPICIOUS", scoringStatus: "INSUFFICIENT_DATA", productCode: "FPD100", page: "2", pageSize: "1" } }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls.verificationFind[0].filter, { verificationType: "QR", status: "SUSPICIOUS", scoringStatus: "INSUFFICIENT_DATA", productCode: "FPD100" });
  assert.equal(calls.verificationFind[0].skip, 1);
  assert.equal(calls.verificationFind[0].limit, 1);
  assert.equal(response.body.verifications[0].product.productCode, "FPD100");
  assert.equal("location" in response.body.verifications[0], false);
  assert.equal("scanRequestId" in response.body.verifications[0], false);
  assert.equal("productHash" in response.body.verifications[0].product, true);

  const invalid = responseRecorder();
  await getAdminVerifications({ query: { type: "PARTNER" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const invalidPage = responseRecorder();
  await getAdminVerifications({ query: { pageSize: "101" } }, invalidPage);
  assert.equal(invalidPage.statusCode, 400);

  const manualCode = responseRecorder();
  const manualCalls = installDashboardMocks();
  await getAdminVerifications({ query: { type: "MANUAL_CODE", status: "AI_UNAVAILABLE" } }, manualCode);
  assert.equal(manualCode.statusCode, 200);
  assert.deepEqual(manualCalls.verificationFind[0].filter, { verificationType: "MANUAL_CODE", status: "AI_UNAVAILABLE" });
});

test("dashboard and verification endpoints remain ADMIN-only", () => {
  for (const path of ["/dashboard", "/verifications"]) {
    const route = adminRoutes.stack.find((layer) => layer.route?.path === path)?.route;
    assert.ok(route, `${path} route exists`);
    assert.equal(route.stack[0].handle, protect);
    assert.equal(route.stack.length, 3);
    let adminAllowed = false;
    route.stack[1].handle({ user: { role: "ADMIN" } }, responseRecorder(), () => { adminAllowed = true; });
    assert.equal(adminAllowed, true);
    for (const role of ["MANUFACTURER", "DISTRIBUTOR", "RETAILER", "CONSUMER"]) {
      const response = responseRecorder();
      let allowed = false;
      route.stack[1].handle({ user: { role } }, response, () => { allowed = true; });
      assert.equal(allowed, false);
      assert.equal(response.statusCode, 403);
    }
  }
});
