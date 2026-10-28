import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../src/AdminDashboard.jsx", import.meta.url)), "utf8");
const styles = readFileSync(fileURLToPath(new URL("../src/AdminDashboard.css", import.meta.url)), "utf8");
const designSystem = readFileSync(fileURLToPath(new URL("../src/DesignSystem.css", import.meta.url)), "utf8");
const manufacturerStyles = readFileSync(fileURLToPath(new URL("../src/ManufacturerDashboard.css", import.meta.url)), "utf8");

test("admin navigation keeps every existing section while using compact visible labels", () => {
  for (const key of ["dashboard", "manufacturers", "partners", "products", "verifications", "counterfeit", "alerts", "locations", "blockchain"]) {
    assert.match(source, new RegExp(`key: "${key}"`));
  }
  for (const label of ["Manufacturers", "Verification Log", "Risk & Integrity", "Security Events", "Scan Locations", "Blockchain Records"]) {
    assert.ok(source.includes(`label: "${label}"`), `Missing label ${label}`);
  }
  assert.match(source, /aria-controls="admin-navigation"/);
  assert.match(source, /aria-expanded=\{sidebarOpen\}/);
  assert.match(source, /SettingsIcon size=\{20\}/);
  assert.match(source, /aria-label="Settings"/);
});

test("admin layout defines a stable sidebar, single-line rows, flexible header, and bounded content", () => {
  assert.match(styles, /\.admin-sidebar\s*\{[^}]*width:\s*252px/s);
  assert.match(styles, /\.admin-sidebar \.nav-item\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(styles, /\.admin-sidebar \.nav-item span\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(styles, /\.admin-sidebar \.nav-item span\s*\{[^}]*width:\s*auto/s);
  assert.match(styles, /\.admin-layout \.profile-avatar\s*\{[^}]*margin:\s*0/s);
  assert.match(styles, /\.admin-layout \.profile-avatar\s*\{[^}]*width:\s*40px/s);
  assert.match(styles, /\.admin-layout \.profile-info\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(manufacturerStyles, /\.nav-item span\s*\{[^}]*width:\s*25px/s);
  assert.match(manufacturerStyles, /\.profile-avatar\s*\{[^}]*width:\s*90px/s);
  assert.match(manufacturerStyles, /\.profile-info\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.search-wrapper\s*\{[^}]*flex:\s*1 1 360px/s);
  assert.match(styles, /\.admin-topbar\s*\{[^}]*min-height:\s*72px/s);
  assert.match(styles, /\.admin-page-container\s*\{[^}]*max-width:\s*1680px/s);
  assert.match(styles, /\.admin-content\s*\{[^}]*overflow-x:\s*clip/s);
  assert.match(styles, /\.management-table\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /@media \(max-width:\s*1000px\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)/);
  assert.match(styles, /@media \(max-width:\s*520px\)/);
  assert.match(styles, /outline:\s*3px solid #15965b/);
  assert.match(designSystem, /--font-body:/);
  assert.match(designSystem, /--font-display:/);
  assert.match(designSystem, /--font-mono:/);
});
