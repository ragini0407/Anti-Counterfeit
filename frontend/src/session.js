const USER_SESSION_KEYS = [
  "token",
  "user",
  "manufacturerProfile",
  "adminActivePage",
  "adminAlerts",
  "adminManufacturers",
  "adminLocations",
  "adminBlocks"
];

export function pendingMintKey(userId) {
  return `pendingProductMint:${userId}`;
}

export function clearUserSession({
  localStorage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage
} = {}) {
  let userId = null;
  try {
    userId = JSON.parse(localStorage.getItem("user") || "null")?.id || null;
  } catch {
    userId = null;
  }

  // Keep transaction recovery data available only to its original account.
  const pendingMint = sessionStorage.getItem("pendingProductMint");
  if (pendingMint) {
    if (userId) {
      sessionStorage.setItem(pendingMintKey(userId), pendingMint);
    }
    sessionStorage.removeItem("pendingProductMint");
  }

  USER_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}
