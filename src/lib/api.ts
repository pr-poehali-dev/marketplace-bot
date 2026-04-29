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

// ── Prices ───────────────────────────────────────────────────────

export async function apiGetPrices() {
  const res = await fetch(PRICES_URL, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiSavePrice(sku: string, price: number, source = "manual") {
  const res = await fetch(PRICES_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sku, price, source }),
  });
  return parseResponse(res);
}

// ── Integrations ─────────────────────────────────────────────────

const INTEGRATIONS_URL = "https://functions.poehali.dev/ed29450a-3acc-4dca-a6a6-646a29edb2ed";
const SYNC_PRODUCTS_URL = "https://functions.poehali.dev/a86eaec6-1c8a-4660-b821-c9d960c600a2";

export async function apiGetIntegrations() {
  const res = await fetch(INTEGRATIONS_URL, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiSaveIntegration(platform: "ozon" | "wb", api_key: string) {
  const res = await fetch(INTEGRATIONS_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ platform, api_key }),
  });
  return parseResponse(res);
}

export async function apiSyncProducts(platform: "ozon" | "wb" | "all" = "all") {
  const res = await fetch(SYNC_PRODUCTS_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ platform }),
  });
  return parseResponse(res);
}

// ── Price Recommendations ─────────────────────────────────────────

const PRICE_REC_URL = "https://functions.poehali.dev/41ea5b72-9eb3-410a-9a2d-0537e2df1d24";

export async function apiGetPriceHistory(sku: string) {
  const res = await fetch(`${PRICES_URL}?action=history&sku=${encodeURIComponent(sku)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export async function apiGetRecommendations() {
  const res = await fetch(PRICE_REC_URL, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseResponse(res);
}

// ── Pricing Rules ─────────────────────────────────────────────────

const PRICING_RULES_URL = "https://functions.poehali.dev/eb291255-d134-4bb1-b318-d361cfc35747";

export async function apiGetRules() {
  const res = await fetch(PRICING_RULES_URL, { method: "GET", headers: authHeaders() });
  return parseResponse(res);
}

export async function apiCreateRule(type: string, value: number) {
  const res = await fetch(PRICING_RULES_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type, value }),
  });
  return parseResponse(res);
}

export async function apiUpdateRule(id: string, patch: { enabled?: boolean; value?: number }) {
  const res = await fetch(`${PRICING_RULES_URL}?id=${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return parseResponse(res);
}