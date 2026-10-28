import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manufacturerDashboard = readFileSync(
  fileURLToPath(new URL("../src/ManufacturerDashboard.jsx", import.meta.url)),
  "utf8"
);
const adminDashboard = readFileSync(
  fileURLToPath(new URL("../src/AdminDashboard.jsx", import.meta.url)),
  "utf8"
);

test("manufacturer product views label registration separately from authenticity", () => {
  assert.match(manufacturerDashboard, /status === "REGISTERED" \? "Registered"/);
  assert.match(manufacturerDashboard, /This lookup does not verify authenticity/);
  assert.doesNotMatch(manufacturerDashboard, /✓ Genuine/);
  assert.doesNotMatch(manufacturerDashboard, /product\.genuineScans|product\.counterfeitScans/);
});

test("manufacturer dashboard displays supported metrics without defaulting absent values to zero", () => {
  assert.match(manufacturerDashboard, /product\.totalVerifications/);
  assert.match(manufacturerDashboard, /product\.qrScans/);
  assert.match(manufacturerDashboard, /product\.imageVerifications/);
  assert.match(manufacturerDashboard, /Number\.isFinite\(value\).*"—"/);
  assert.doesNotMatch(manufacturerDashboard, /product\.totalScans\s*\|\|\s*0/);
});

test("admin dashboard exposes separate verification types and persisted scoring states", () => {
  for (const field of ["qrScans", "imageVerifications", "SCORED", "INSUFFICIENT_DATA", "UNAVAILABLE", "validLocationScans"]) {
    assert.ok(adminDashboard.includes(field), `Expected dashboard to display ${field}`);
  }
});
