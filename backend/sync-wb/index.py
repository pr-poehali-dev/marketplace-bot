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

# WB API base URLs
WB_CONTENT_API  = "https://suppliers-api.wildberries.ru"
WB_STATS_API    = "https://statistics-api.wildberries.ru"
WB_SELLER_API   = "https://marketplace-api.wildberries.ru"


# ── WB API client ─────────────────────────────────────────────────

class WBAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, user_message: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.user_message = user_message or message


def _classify_wb_error(status_code: int, body: str) -> str:
    if status_code == 401:
        return "Неверный API-токен Wildberries. Проверьте настройки интеграции."
    if status_code == 403:
        return "Доступ запрещён — проверьте разрешения токена в кабинете WB (нужна категория Контент)."
    if status_code == 429:
        return "Слишком много запросов к Wildberries API. Попробуйте позже."
    if status_code >= 500:
        return f"Внутренняя ошибка Wildberries API (код {status_code}). Попробуйте позже."
    try:
        data = json.loads(body)
        msg = data.get("message") or data.get("errorText") or ""
        if msg:
            return f"WB API: {msg}"
    except Exception:
        pass
    return f"Ошибка Wildberries API (код {status_code})."


def wb_get(path: str, api_token: str, base_url: str = WB_CONTENT_API, params: dict | None = None) -> dict:
    """GET-запрос к WB API. Бросает WBAPIError при ошибке."""
    url = base_url + path
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += "?" + qs
    req = urllib.request.Request(
        url, method="GET",
        headers={"Authorization": api_token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise WBAPIError(f"HTTP {e.code}: {body[:300]}", e.code, _classify_wb_error(e.code, body))


def wb_post(path: str, payload: dict, api_token: str, base_url: str = WB_CONTENT_API) -> dict:
    """POST-запрос к WB API. Бросает WBAPIError при ошибке."""
    url = base_url + path
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Authorization": api_token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise WBAPIError(f"HTTP {e.code}: {body[:300]}", e.code, _classify_wb_error(e.code, body))


def log_error(conn, user_id, endpoint: str, status_code: int, error: str) -> None:
    try:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO {SCHEMA}.api_logs
                (user_id, platform, endpoint, status_code, error)
                VALUES (%s, 'wb', %s, %s, %s)""",
            (user_id, endpoint, status_code, error[:2000]),
        )
        conn.commit()
        cur.close()
    except Exception:
        pass


# ── WB Data fetchers ──────────────────────────────────────────────

def fetch_wb_cards(api_token: str, conn=None, user_id=None) -> list[dict]:
    """
    GET /content/v2/get/cards/list
    Возвращает список карточек товаров с пагинацией (cursor-based).

    Поля карточки:
      nmID       — артикул WB (наш SKU)
      title      — название
      vendorCode — артикул продавца
      sizes[]    — размеры (для суммирования стока)
      photos[]   — фото
      tags[]
    """
    all_cards: list[dict] = []
    cursor: dict = {}

    path = "/content/v2/get/cards/list"

    while True:
        payload: dict = {
            "settings": {
                "cursor": {
                    "limit": 100,
                    **cursor,
                },
                "filter": {
                    "withPhoto": -1,   # -1 = все товары (с фото и без)
                },
            }
        }

        try:
            resp = wb_post(path, payload, api_token)
        except WBAPIError as e:
            if conn:
                log_error(conn, user_id, path, e.status_code, str(e))
            raise

        cards = resp.get("cards", [])
        all_cards.extend(cards)

        # Пагинация через cursor из ответа
        next_cursor = resp.get("cursor", {})
        total   = next_cursor.get("total", 0)
        updated = next_cursor.get("updatedAt")
        nm_id   = next_cursor.get("nmID")

        if len(cards) < 100 or not nm_id:
            break

        cursor = {"updatedAt": updated, "nmID": nm_id}

    return all_cards


def fetch_wb_stocks(api_token: str, conn=None, user_id=None) -> dict[int, int]:
    """
    GET /api/v3/stocks/{warehouseId}
    Возвращает dict {nmID: total_stock}.

    WB требует указывать склад. Сначала получаем список складов,
    потом остатки по каждому.
    """
    stock_map: dict[int, int] = {}

    try:
        warehouses_resp = wb_get(
            "/api/v3/warehouses", api_token, base_url=WB_SELLER_API
        )
    except WBAPIError as e:
        if conn:
            log_error(conn, user_id, "/api/v3/warehouses", e.status_code, str(e))
        return stock_map   # Не критично — вернём пустой словарь

    warehouses = warehouses_resp if isinstance(warehouses_resp, list) else []

    for wh in warehouses[:5]:   # Берём первые 5 складов чтобы не долго
        wh_id = wh.get("id")
        if not wh_id:
            continue
        try:
            stocks_resp = wb_get(
                f"/api/v3/stocks/{wh_id}",
                api_token,
                base_url=WB_SELLER_API,
                params={"limit": 1000, "skip": 0},
            )
            for s in stocks_resp.get("stocks", []):
                nm_id = s.get("nmId") or s.get("nmID")
                amount = int(s.get("amount", 0))
                if nm_id:
                    stock_map[int(nm_id)] = stock_map.get(int(nm_id), 0) + amount
        except WBAPIError:
            continue   # Пропускаем ошибочный склад

    return stock_map


def fetch_wb_prices(api_token: str, conn=None, user_id=None) -> dict[int, dict]:
    """
    GET https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter

    Возвращает dict { nmID: { price, discounted_price } }.

    Поля ответа (goods[]):
      nmID            — артикул WB
      price           — цена до скидки (базовая)
      discountedPrice — цена со скидкой продавца (итоговая для покупателя)
    """
    WB_PRICES_API = "https://discounts-prices-api.wildberries.ru"
    price_map: dict[int, dict] = {}
    offset = 0
    limit  = 1000
    path   = "/api/v2/list/goods/filter"

    while True:
        try:
            resp = wb_get(
                path, api_token,
                base_url=WB_PRICES_API,
                params={"limit": limit, "offset": offset},
            )
        except WBAPIError as e:
            if conn:
                log_error(conn, user_id, path, e.status_code, str(e))
            break   # Не критично — вернём что успели собрать

        data    = resp.get("data", {})
        goods   = data.get("listGoods", [])

        for item in goods:
            nm_id  = item.get("nmID") or item.get("nmId")
            price  = float(item.get("price", 0) or 0)
            disc   = float(item.get("discountedPrice", 0) or 0)
            if nm_id:
                price_map[int(nm_id)] = {
                    "price":            price,          # цена до скидки (old_price)
                    "discounted_price": disc if disc > 0 else price,  # итоговая цена
                }

        if len(goods) < limit:
            break
        offset += limit

    return price_map


# ── Core sync ─────────────────────────────────────────────────────

def sync_wb_products(user_id: str, api_token: str, conn) -> dict:
    """
    Синхронизация товаров WB.
    1. /content/v2/get/cards/list        — карточки (nmID, title, vendorCode)
    2. /api/v3/warehouses + stocks       — остатки по складам
    3. /api/v2/list/goods/filter         — цены (price, discountedPrice)
    4. Upsert в products:
       - current_price = discountedPrice (цена покупателя)
       - old_price     = price (цена до скидки), если отличается
       - applied_prices НЕ трогаем
    5. Возвращает { synced, prices_updated, products[] }
    """
    cur = conn.cursor()
    try:
        # ── 1. Карточки товаров ───────────────────────────────────────
        cards = fetch_wb_cards(api_token, conn=conn, user_id=user_id)
        if not cards:
            return {"synced": 0, "prices_updated": 0, "products": []}

        # ── 2. Остатки ────────────────────────────────────────────────
        stock_map = fetch_wb_stocks(api_token, conn=conn, user_id=user_id)

        # ── 3. Цены из нового эндпоинта ───────────────────────────────
        price_map = fetch_wb_prices(api_token, conn=conn, user_id=user_id)

        # ── 4. Upsert ─────────────────────────────────────────────────
        result:        list[dict] = []
        prices_updated: int = 0

        for card in cards:
            nm_id       = card.get("nmID") or card.get("nmId")
            title       = card.get("title") or card.get("name") or f"Товар WB {nm_id}"
            vendor_code = card.get("vendorCode", "")

            if not nm_id:
                continue

            sku   = str(nm_id)
            stock = stock_map.get(int(nm_id), 0)

            p_data         = price_map.get(int(nm_id), {})
            current_price  = p_data.get("discounted_price", 0.0)   # итоговая цена покупателя
            base_price     = p_data.get("price", 0.0)              # цена до скидки
            # old_price показываем только если реально есть скидка
            old_price      = base_price if base_price > current_price > 0 else None

            cost_price            = round(current_price * 0.45, 2) if current_price > 0 else 0.0
            commission_pct        = 12.0
            logistics_cost        = 80.0
            storage_cost_per_unit = 8.0
            ads_cost_per_unit     = 60.0
            return_rate_pct       = 7.0

            # Upsert с сохранением old_price при смене цены.
            # applied_prices — отдельная таблица, здесь не трогаем.
            cur.execute(
                f"""INSERT INTO {SCHEMA}.products
                    (user_id, sku, name, platform, current_price, old_price, cost_price,
                     commission_pct, logistics_cost, storage_cost_per_unit,
                     ads_cost_per_unit, return_rate_pct, stock, updated_at)
                    VALUES (%s,%s,%s,'WB',%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                    ON CONFLICT (user_id, sku) DO UPDATE SET
                      name                  = EXCLUDED.name,
                      platform              = 'WB',
                      old_price             = CASE
                                                WHEN EXCLUDED.current_price > 0
                                                 AND products.current_price <> EXCLUDED.current_price
                                                THEN products.current_price
                                                ELSE EXCLUDED.old_price
                                              END,
                      current_price         = CASE WHEN EXCLUDED.current_price > 0
                                                   THEN EXCLUDED.current_price
                                                   ELSE products.current_price END,
                      cost_price            = EXCLUDED.cost_price,
                      commission_pct        = EXCLUDED.commission_pct,
                      logistics_cost        = EXCLUDED.logistics_cost,
                      storage_cost_per_unit = EXCLUDED.storage_cost_per_unit,
                      ads_cost_per_unit     = EXCLUDED.ads_cost_per_unit,
                      return_rate_pct       = EXCLUDED.return_rate_pct,
                      stock                 = EXCLUDED.stock,
                      updated_at            = NOW()
                    RETURNING
                      (xmax <> 0) AS was_update,
                      (products.current_price IS DISTINCT FROM EXCLUDED.current_price
                       AND EXCLUDED.current_price > 0) AS price_changed""",
                (
                    user_id, sku, title,
                    current_price, old_price, cost_price,
                    commission_pct, logistics_cost, storage_cost_per_unit,
                    ads_cost_per_unit, return_rate_pct, stock,
                ),
            )
            row = cur.fetchone()
            if row and row[0]:    # was_update
                prices_updated += 1

            result.append({
                "sku":           sku,
                "name":          title,
                "vendor_code":   vendor_code,
                "price":         current_price,
                "old_price":     old_price,
                "stock":         stock,
                "price_changed": bool(row and row[1]) if row else False,
            })

        conn.commit()
        return {
            "synced":         len(result),
            "prices_updated": prices_updated,
            "prices_changed": sum(1 for p in result if p.get("price_changed")),
            "products":       result,
        }

    finally:
        cur.close()


# ── DB helpers ────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
    h = event.get("headers") or {}
    token = h.get("X-Auth-Token") or h.get("x-auth-token") or ""
    if not token:
        return None, None
    cur.execute(
        f"""SELECT s.user_id, u.plan FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    return (str(row[0]), row[1]) if row else (None, None)


def get_wb_token(cur, user_id: str):
    cur.execute(
        f"SELECT api_key FROM {SCHEMA}.integrations WHERE user_id = %s AND platform = 'wb'",
        (user_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def ok(data):
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400):
    return {"statusCode": code, "headers": CORS,
            "body": json.dumps({"error": msg}, ensure_ascii=False)}


# ── Handler ───────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Синхронизация товаров Wildberries.
    POST /sync-wb   Header: X-Auth-Token

    Алгоритм:
    1. Auth → user_id
    2. api_token из integrations
    3. Cooldown 1 час
    4. /content/v2/get/cards/list → карточки (nmID, title, sizes)
    5. /api/v3/stocks → остатки
    6. /public/api/v1/info → цены
    7. Upsert в products
    8. Запись в sync_log
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}
    if event.get("httpMethod") != "POST":
        return err("Только POST", 405)

    conn = get_conn()
    cur  = conn.cursor()
    try:
        user_id, _plan = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        # Cooldown 1 час
        cur.execute(
            f"""SELECT started_at FROM {SCHEMA}.sync_log
                WHERE user_id = %s AND platform = 'wb' AND status = 'success'
                AND started_at > NOW() - INTERVAL '1 hour' LIMIT 1""",
            (user_id,),
        )
        if cur.fetchone():
            return err("Синхронизация WB уже выполнялась менее часа назад", 429)

        api_token = get_wb_token(cur, user_id)
        if not api_token:
            return err("Интеграция Wildberries не настроена. Добавьте токен в Настройки → WB.", 400)

        # Лог: старт
        cur.execute(
            f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, 'wb', 'running') RETURNING id",
            (user_id,),
        )
        log_id = cur.fetchone()[0]
        conn.commit()

        try:
            stats = sync_wb_products(user_id, api_token, conn)
        except WBAPIError as e:
            cur.execute(
                f"UPDATE {SCHEMA}.sync_log SET status='error', error=%s, finished_at=NOW() WHERE id=%s",
                (str(e), log_id),
            )
            conn.commit()
            return err(e.user_message, 502)

        # Лог: успех
        cur.execute(
            f"UPDATE {SCHEMA}.sync_log SET status='success', products_count=%s, finished_at=NOW() WHERE id=%s",
            (stats["synced"], log_id),
        )
        # Обновляем last_sync_at в integrations
        cur.execute(
            f"UPDATE {SCHEMA}.integrations SET last_sync_at = NOW() WHERE user_id = %s AND platform = 'wb'",
            (user_id,),
        )
        conn.commit()

        return ok({
            "ok":             True,
            "platform":       "wb",
            "synced":         stats["synced"],
            "prices_updated": stats["prices_updated"],
            "prices_changed": stats["prices_changed"],
            "products":       stats["products"],
            "log": {
                "total_products":  stats["synced"],
                "prices_updated":  stats["prices_updated"],
                "prices_changed":  stats["prices_changed"],
            },
        })

    except Exception as e:
        conn.rollback()
        return err(f"Внутренняя ошибка: {e}", 500)
    finally:
        cur.close()
        conn.close()