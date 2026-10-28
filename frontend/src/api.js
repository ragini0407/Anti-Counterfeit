const configuredApiBase = import.meta.env?.VITE_API_BASE_URL || "/api";
const apiBase = configuredApiBase.replace(/\/+$/, "");

export const apiUrl = (path) => `${apiBase}/${String(path).replace(/^\/+/, "")}`;
