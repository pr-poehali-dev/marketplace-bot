import json
import os
import urllib.request
import urllib.error
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


# ── Ozon API helpers ──────────────────────────────────────────────────────────

def ozon_post(path: str, payload: dict, client_id: str, api_key: str) -> dict:
    """POST-запрос к Ozon Seller API. Бросает исключение при HTTP-ошибке."""
    url = f"https://api-seller.ozon.ru{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Client-Id":    client_id,
            "Api-Key":      api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise RuntimeError(f"Ozon API {path} → HTTP {e.code}: {body[:300]}")


def fetch_product_list(client_id: str, api_key: str) -> list[dict]:
    """
    POST /v2/product/list
    Возвращает все товары с пагинацией (cursor-based, last_id).
    Поля ответа: product_id, offer_id, name, has_fbo_stocks, ...
    """
    all_items: list[dict] = []
    last_id = ""

    while True:
        resp = ozon_post(
            "/v2/product/list",
            {
                "filter": {"visibility": "ALL"},
                "last_id": last_id,
                "limit": 100,
            },
            client_id, api_key,
        )
        result = resp.get("result", {})
        items = result.get("items", [])
        all_items.extend(items)

        # Пагинация: если вернулось < 100 — дошли до конца
        last_id = result.get("last_id", "")
        if len(items) < 100 or not last_id:
            break

    return all_items


def fetch_product_info(product_ids: list[int], client_id: str, api_key: str) -> dict[int, dict]:
    """
    POST /v2/product/info/list
    Возвращает dict {product_id: info} с ценами, названиями, комиссиями.
    Ozon принимает до 1000 id за запрос.
    """
    info_map: dict[int, dict] = {}
    # Батчи по 100 чтобы не превысить лимиты
    for i in range(0, len(product_ids), 100):
        batch = product_ids[i:i + 100]
        resp = ozon_post(
            "/v2/product/info/list",
            {"product_id": batch},
            client_id, api_key,
        )
        for item in resp.get("result", {}).get("items", []):
            info_map[item["id"]] = item
    return info_map


def fetch_stocks(product_ids: list[int], client_id: str, api_key: str) -> dict[int, int]:
    """
    POST /v3/product/info/stocks
    Возвращает dict {product_id: total_stock}.
    """
    stock_map: dict[int, int] = {}
    for i in range(0, len(product_ids), 100):
        batch = product_ids[i:i + 100]
        resp = ozon_post(
            "/v3/product/info/stocks",
            {
                "filter": {
                    "product_id":  [str(pid) for pid in batch],
                    "visibility":  "ALL",
                },
                "last_id": "",
                "limit":   100,
            },
            client_id, api_key,
        )
        for s in resp.get("result", {}).get("items", []):
            pid = s.get("product_id")
            # present — фактический остаток, reserved — зарезервировано
            total = sum(w.get("present", 0) for w in s.get("stocks", []))
            if pid is not None:
                stock_map[int(pid)] = total
    return stock_map


def sync_ozon_products(user_id: str, client_id: str, api_key: str, conn) -> list[dict]:
    """
    Основная функция синхронизации.
    1. Получает список товаров из Ozon /v2/product/list
    2. Обогащает деталями (/v2/product/info/list) и остатками (/v3/product/info/stocks)
    3. Сохраняет/обновляет в таблице products (upsert по user_id + sku)
    4. Возвращает итоговый список товаров
    """
    cur = conn.cursor()
    try:
        # ── Шаг 1: список товаров ────────────────────────────────────
        raw_items = fetch_product_list(client_id, api_key)
        if not raw_items:
            return []

        product_ids = [item["product_id"] for item in raw_items]
        # offer_id — это артикул продавца (SKU), product_id — внутренний id Ozon
        offer_map = {item["product_id"]: item.get("offer_id", str(item["product_id"])) for item in raw_items}

        # ── Шаг 2: детали товаров (цена, название) ───────────────────
        info_map = fetch_product_info(product_ids, client_id, api_key)

        # ── Шаг 3: остатки ───────────────────────────────────────────
        stock_map = fetch_stocks(product_ids, client_id, api_key)

        # ── Шаг 4: сборка + upsert ───────────────────────────────────
        result: list[dict] = []

        for pid in product_ids:
            info = info_map.get(pid, {})
            sku  = offer_map.get(pid, str(pid))
            name = info.get("name", f"Товар {pid}")

            # Цена: marketing_price > min_price > price (приоритет)
            price_info = info.get("price") or {}
            price = float(
                price_info.get("marketing_price") or
                price_info.get("min_price") or
                price_info.get("price") or 0
            )

            # Комиссия FBO (абсолютная) → переводим в %
            raw_comm = float((info.get("commissions") or {}).get("fbo_fulfillment_amount") or 0)
            commission_pct = round(raw_comm / price * 100, 2) if price > 0 and raw_comm > 0 else 8.0

            stock = stock_map.get(pid, 0)

            # Дефолтные поля — обновить когда подключите реальную аналитику
            cost_price            = round(price * 0.45, 2)   # ~45% от цены
            logistics_cost        = 180.0                     # FBO логистика ~средняя
            storage_cost_per_unit = 12.0
            ads_cost_per_unit     = 80.0
            return_rate_pct       = 4.0
            # sales — в отдельном Statistics API, здесь ставим 0 (обновить позже)
            sales = 0

            revenue = round(price * sales, 2) if sales else 0.0

            # Upsert в products
            cur.execute(
                f"""INSERT INTO {SCHEMA}.products
                    (user_id, sku, name, platform, current_price, cost_price,
                     commission_pct, logistics_cost, storage_cost_per_unit,
                     ads_cost_per_unit, return_rate_pct, sales, stock, revenue, updated_at)
                    VALUES (%s,%s,%s,'Ozon',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                    ON CONFLICT (user_id, sku) DO UPDATE SET
                      name                  = EXCLUDED.name,
                      platform              = 'Ozon',
                      current_price         = EXCLUDED.current_price,
                      cost_price            = EXCLUDED.cost_price,
                      commission_pct        = EXCLUDED.commission_pct,
                      logistics_cost        = EXCLUDED.logistics_cost,
                      storage_cost_per_unit = EXCLUDED.storage_cost_per_unit,
                      ads_cost_per_unit     = EXCLUDED.ads_cost_per_unit,
                      return_rate_pct       = EXCLUDED.return_rate_pct,
                      stock                 = EXCLUDED.stock,
                      revenue               = EXCLUDED.revenue,
                      updated_at            = NOW()""",
                (
                    user_id, sku, name,
                    price, cost_price, commission_pct,
                    logistics_cost, storage_cost_per_unit, ads_cost_per_unit,
                    return_rate_pct, sales, stock, revenue,
                ),
            )

            result.append({
                "sku":    sku,
                "name":   name,
                "price":  price,
                "stock":  stock,
                "sales":  sales,
            })

        conn.commit()
        return result

    finally:
        cur.close()


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
    """Проверяет X-Auth-Token. Возвращает (user_id, plan) или (None, None)."""
    h = event.get("headers") or {}
    token = h.get("X-Auth-Token") or h.get("x-auth-token") or ""
    if not token:
        return None, None
    cur.execute(
        f"""SELECT s.user_id, u.plan
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    return (str(row[0]), row[1]) if row else (None, None)


def get_ozon_creds(cur, user_id: str):
    """Возвращает (client_id, api_key) или (None, None)."""
    cur.execute(
        f"SELECT client_id, api_key FROM {SCHEMA}.integrations WHERE user_id = %s AND platform = 'ozon'",
        (user_id,),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def ok(data):
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400):
    return {"statusCode": code, "headers": CORS,
            "body": json.dumps({"error": msg}, ensure_ascii=False)}


# ── Handler ───────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Синхронизация товаров Ozon для текущего пользователя.
    POST /sync-ozon
    Header: X-Auth-Token

    Алгоритм:
    1. Аутентификация по токену → user_id
    2. Берёт client_id + api_key из integrations
    3. Вызывает Ozon /v2/product/list (с пагинацией)
    4. Обогащает деталями и остатками
    5. Сохраняет/обновляет products
    6. Записывает в sync_log
    7. Возвращает список товаров
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    if event.get("httpMethod") != "POST":
        return err("Только POST", 405)

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id, plan = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        # Проверка cooldown (не чаще 1 раза в час)
        cur.execute(
            f"""SELECT started_at FROM {SCHEMA}.sync_log
                WHERE user_id = %s AND platform = 'ozon' AND status = 'success'
                AND started_at > NOW() - INTERVAL '1 hour'
                LIMIT 1""",
            (user_id,),
        )
        recent = cur.fetchone()
        if recent:
            return err(
                f"Синхронизация Ozon уже выполнялась менее часа назад. Следующая доступна после {recent[0]}",
                429,
            )

        # Берём credentials из БД
        client_id, api_key = get_ozon_creds(cur, user_id)
        if not client_id or not api_key:
            return err(
                "Интеграция Ozon не настроена. Добавьте Client-Id и Api-Key в Настройки → Ozon.",
                400,
            )

        # Лог: старт синхронизации
        cur.execute(
            f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, 'ozon', 'running') RETURNING id",
            (user_id,),
        )
        log_id = cur.fetchone()[0]
        conn.commit()

        try:
            products = sync_ozon_products(user_id, client_id, api_key, conn)
        except RuntimeError as e:
            # Обновляем лог с ошибкой
            cur.execute(
                f"UPDATE {SCHEMA}.sync_log SET status='error', error=%s, finished_at=NOW() WHERE id=%s",
                (str(e), log_id),
            )
            conn.commit()
            return err(f"Ошибка Ozon API: {e}", 502)

        # Лог: успех
        cur.execute(
            f"""UPDATE {SCHEMA}.sync_log
                SET status='success', products_count=%s, finished_at=NOW()
                WHERE id=%s""",
            (len(products), log_id),
        )
        conn.commit()

        return ok({
            "ok":       True,
            "platform": "ozon",
            "synced":   len(products),
            "products": products,
        })

    except Exception as e:
        conn.rollback()
        return err(f"Внутренняя ошибка: {e}", 500)
    finally:
        cur.close()
        conn.close()
