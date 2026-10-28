const withQuery = (url, values) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `${url}${url.includes("?") ? "&" : "?"}${suffix}` : url;
};

const requestAdminJson = async ({ url, token, fetchImpl }) => {
  if (!token) throw new Error("Admin login session not found. Please log in again.");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "The admin service could not complete the request.");
    error.status = response.status;
    throw error;
  }
  if (!data || data.success !== true) {
    throw new Error("The admin service returned an invalid response.");
  }
  return data;
};

export const fetchAdminDashboard = ({
  url,
  token,
  pages = {},
  fetchImpl = fetch
}) => requestAdminJson({
  url: withQuery(url, {
    productPage: pages.products || 1,
    manufacturerPage: pages.manufacturers || 1,
    recentPage: pages.recentVerifications || 1,
    alertPage: pages.alerts || 1,
    pageSize: pages.pageSize || 20
  }),
  token,
  fetchImpl
});

export const fetchAdminVerifications = ({
  url,
  token,
  filters = {},
  page = 1,
  pageSize = 20,
  fetchImpl = fetch
}) => requestAdminJson({
  url: withQuery(url, {
    type: filters.type,
    status: filters.status,
    scoringStatus: filters.scoringStatus,
    productCode: filters.productCode?.trim(),
    page,
    pageSize
  }),
  token,
  fetchImpl
});

export const fetchAdminProductLifecycle = ({
  url,
  token,
  page = 1,
  pageSize = 20,
  fetchImpl = fetch
}) => requestAdminJson({
  url: withQuery(url, { page, pageSize }),
  token,
  fetchImpl
});
