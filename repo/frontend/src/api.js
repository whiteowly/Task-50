const runtimeBase = `${window.location.protocol}//${window.location.hostname}:4000/api`;
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || runtimeBase).replace(/\/$/, "");
let sessionToken = null;

export function setSessionToken(token) {
  sessionToken = token || null;
}

export function getSessionToken() {
  return sessionToken;
}

export async function apiRequest(path, options = {}) {
  const token = getSessionToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: options.credentials || "include",
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export async function apiFormRequest(path, formData, options = {}) {
  const token = getSessionToken();
  const headers = {
    ...(options.headers || {})
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method: options.method || "POST",
    credentials: options.credentials || "include",
    headers,
    body: formData
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}
