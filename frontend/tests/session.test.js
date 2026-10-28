import test from "node:test";
import assert from "node:assert/strict";
import { clearUserSession, pendingMintKey } from "../src/session.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("logout clears auth and user caches while scoping pending mint recovery to its owner", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const user = { id: "manufacturer-1", role: "MANUFACTURER" };
  const pendingMint = JSON.stringify({ productCode: "P-1", transactionHash: "0xtest" });

  [
    "token",
    "manufacturerProfile",
    "adminActivePage",
    "adminAlerts",
    "adminManufacturers",
    "adminLocations",
    "adminBlocks"
  ].forEach((key) => localStorage.setItem(key, "session-value"));
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("theme", "dark");
  sessionStorage.setItem("pendingProductMint", pendingMint);

  clearUserSession({ localStorage, sessionStorage });

  for (const key of [
    "token",
    "user",
    "manufacturerProfile",
    "adminActivePage",
    "adminAlerts",
    "adminManufacturers",
    "adminLocations",
    "adminBlocks"
  ]) {
    assert.equal(localStorage.getItem(key), null, `${key} should be cleared`);
  }
  assert.equal(localStorage.getItem("theme"), "dark", "unrelated preferences should remain");
  assert.equal(sessionStorage.getItem("pendingProductMint"), null);
  assert.equal(sessionStorage.getItem(pendingMintKey(user.id)), pendingMint);
});

test("logout removes unowned legacy mint recovery data instead of exposing it to another user", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  sessionStorage.setItem("pendingProductMint", JSON.stringify({ productCode: "P-2" }));

  clearUserSession({ localStorage, sessionStorage });

  assert.equal(sessionStorage.getItem("pendingProductMint"), null);
});
