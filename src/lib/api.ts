const AUTH_URL = "https://functions.poehali.dev/7a6aa94f-05ea-4ac3-aff2-f289544c29b4";
const PRODUCTS_URL = "https://functions.poehali.dev/3c76d47d-aef4-476e-a827-3f5a8261e881";
const PRICES_URL = "https://functions.poehali.dev/f159ac5b-5ca7-4e79-9af6-c13e84c115a0";

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { "X-Auth-Token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function parseResponse(res: Response) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    // backend может вернуть body как строку (двойная сериализация)
    if (typeof data === "string") return JSON.parse(data);
    return data;
  } catch {
    return { error: text };
  }
}

// ── Auth ─────────────────────────────────────────────────────────

export async function apiRegister(email: string, password: string, name: string) {
  const res = await fetch(`${AUTH_URL}?action=register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return parseResponse(res);
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${AUTH_URL}?action=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(res);
}

export async function apiLogout() {
  const res = await fetch(`${AUTH_URL}?action=logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  localStorage.removeItem("auth_token");
  return parseResponse(res);
}

export async function apiMe() {
  const res = await fetch(`${AUTH_URL}?action=me`, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiSaveApiKeys(ozon_api_key?: string, wb_api_key?: string) {
  const res = await fetch(`${AUTH_URL}?action=api-keys`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ozon_api_key, wb_api_key }),
  });
  return parseResponse(res);
}

// ── Products ─────────────────────────────────────────────────────

export async function apiGetProducts() {
  const res = await fetch(PRODUCTS_URL, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiSyncProducts(platform: "Ozon" | "WB" | "all" = "all") {
  const res = await fetch(`${PRODUCTS_URL}?action=sync`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ platform }),
  });
  return parseResponse(res);
}

// ── Prices ───────────────────────────────────────────────────────

export async function apiGetPrices() {
  const res = await fetch(PRICES_URL, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiSavePrice(sku: string, price: number) {
  const res = await fetch(PRICES_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sku, price }),
  });
  return parseResponse(res);
}
