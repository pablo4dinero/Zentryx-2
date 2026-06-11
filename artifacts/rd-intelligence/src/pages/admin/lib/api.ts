// Shared API helpers for the Admin Dashboard module.
export const BASE = import.meta.env.BASE_URL;

export const apiHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
});

export const apiGet = (path: string) => fetch(`${BASE}api${path}`, { headers: apiHeaders() }).then(r => r.ok ? r.json() : null);
export const apiPatch = (path: string, body: any) => fetch(`${BASE}api${path}`, { method: "PATCH", headers: apiHeaders(), body: JSON.stringify(body) }).then(r => r.json());
export const apiPost = (path: string, body: any) => fetch(`${BASE}api${path}`, { method: "POST", headers: apiHeaders(), body: JSON.stringify(body) }).then(r => r.json());
export const apiDelete = (path: string) => fetch(`${BASE}api${path}`, { method: "DELETE", headers: apiHeaders() }).then(r => r.json());
