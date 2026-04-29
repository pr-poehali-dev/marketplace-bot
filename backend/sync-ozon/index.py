import json
import os
import psycopg2
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from ozon_client import ozon_post, OzonAPIError, log_error

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


# ── Ozon API fetch helpers ─────────────────────────────────────────

def fetch_product_list(client_id: str, api_key: str, conn=None, user_id=None) -> list[dict]:
    """POST /v2/product/list — все товары с пагинацией (last_id cursor)."""
    all_items: list[dict] = []
    last_id = ""
    while True:
        resp = ozon_post(
            "/v2/product/list",
            {"filter": {"visibility": "ALL"}, "last_id": last_id, "limit": 100},
            client_id, api_key, conn=conn, user_id=user_id, retries=1,
        )
        result = resp.get("result", {})
        items = result.get("items", [])
        all_items.extend(items)
        last_id = result.get("last_id", "")
        if len(items) < 100 or not last_id:
            break
    return all_items


def fetch_product_info(product_ids: list[int], client_id: str, api_key: str, conn=None, user_id=None) -> dict[int, dict]:
    """POST /v2/product/info/list — названия, комиссии."""
    info_map: dict[int, dict] = {}
    for i in range(0, len(product_ids), 100):
        batch = product_ids[i:i + 100]
        resp = ozon_post("/v2/product/info/list", {"product_id": batch},
                         client_id, api_key, conn=conn, user_id=user_id, retries=1)
        for item in resp.get("result", {}).get("items", []):
            info_map[item["id"]] = item
    return info_map


def fetch_prices(offer_ids: list[str], client_id: str, api_key: str, conn=None, user_id=None) -> dict[str, dict]:
    """POST /v4/product/info/prices — цены по offer_id."""
    price_map: dict[str, dict] = {}
    for i in range(0, len(offer_ids), 100):
        batch = offer_ids[i:i + 100]
        resp = ozon_post(
            "/v4/product/info/prices",
            {"filter": {"offer_id": batch, "visibility": "ALL"}, "last_id": "", "limit": 100},
            client_id, api_key, conn=conn, user_id=user_id, retries=1,
        )
        for item in resp.get("result", {}).get("items", []):
            oid = item.get("offer_id")
            if oid:
                price_map[oid] = item.get("price", {})
    return price_map


def fetch_stocks(product_ids: list[int], client_id: str, api_key: str, conn=None, user_id=None) -> dict[int, int]:
    """POST /v3/product/info/stocks — остатки по складам."""
    stock_map: dict[int, int] = {}
    for i in range(0, len(product_ids), 100):
        batch = product_ids[i:i + 100]
        resp = ozon_post(
            "/v3/product/info/stocks",
            {"filter": {"product_id": [str(pid) for pid in batch], "visibility": "ALL"}, "last_id": "", "limit": 100},
            client_id, api_key, conn=conn, user_id=user_id, retries=1,
        )
        for s in resp.get("result", {}).get("items", []):
            pid = s.get("product_id")
            total = sum(w.get("present", 0) for w in s.get("stocks", []))
            if pid is not None:
                stock_map[int(pid)] = total
    return stock_map


def _parse_price(val) -> float:
    """Безопасно парсит строку или число в float. '0' → 0.0."""
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


# ── Core sync logic ────────────────────────────────────────────────

def sync_ozon_products(user_id: str, client_id: str, api_key: str, conn) -> dict:
    """
    Полная синхронизация товаров Ozon:
    1. /v2/product/list        — список товаров (product_id + offer_id)
    2. /v2/product/info/list   — название, комиссия
    3. /v4/product/info/prices — актуальные цены (price, old_price, marketing_price)
    4. /v3/product/info/stocks — остатки
    5. Upsert в products:
       - current_price = из Ozon (ВСЕГДА обновляем — это реальная цена на площадке)
       - old_price     = старая цена до скидки (если есть)
       - applied_prices НЕ трогаем (пользовательская цена)
    6. Возвращает статистику и список товаров
    """
    cur = conn.cursor()
    try:
        # ── 1. Список товаров ─────────────────────────────────────────
        raw_items = fetch_product_list(client_id, api_key, conn=conn, user_id=user_id)
        if not raw_items:
            return {"synced": 0, "prices_updated": 0, "products": []}

        product_ids = [item["product_id"] for item in raw_items]
        offer_map = {
            item["product_id"]: item.get("offer_id", str(item["product_id"]))
            for item in raw_items
        }
        all_offer_ids = list(offer_map.values())

        # ── 2. Детали (название, комиссия FBO) ───────────────────────
        info_map = fetch_product_info(product_ids, client_id, api_key, conn=conn, user_id=user_id)

        # ── 3. Цены через /v4/product/info/prices ────────────────────
        price_map = fetch_prices(all_offer_ids, client_id, api_key, conn=conn, user_id=user_id)

        # ── 4. Остатки ───────────────────────────────────────────────
        stock_map = fetch_stocks(product_ids, client_id, api_key, conn=conn, user_id=user_id)

        # ── 5. Upsert ─────────────────────────────────────────────────
        result:         list[dict] = []
        prices_updated: int = 0

        for pid in product_ids:
            sku   = offer_map.get(pid, str(pid))
            info  = info_map.get(pid, {})
            name  = info.get("name", f"Товар {pid}")
            stock = stock_map.get(pid, 0)

            # Цены из /v4
            p_block = price_map.get(sku, {})
            # Приоритет: marketing_price (акция) > price (базовая)
            marketing = _parse_price(p_block.get("marketing_price"))
            base      = _parse_price(p_block.get("price"))
            current_price = marketing if marketing > 0 else base

            # old_price — цена «до скидки» (0 если не задана)
            raw_old = _parse_price(p_block.get("old_price"))
            old_price = raw_old if raw_old > 0 and raw_old != current_price else None

            # Комиссия FBO → %
            raw_comm       = float((info.get("commissions") or {}).get("fbo_fulfillment_amount") or 0)
            commission_pct = round(raw_comm / current_price * 100, 2) if current_price > 0 and raw_comm > 0 else 8.0

            # Прочие дефолты
            cost_price            = round(current_price * 0.45, 2)
            logistics_cost        = 180.0
            storage_cost_per_unit = 12.0
            ads_cost_per_unit     = 80.0
            return_rate_pct       = 4.0
            sales                 = 0
            revenue               = 0.0

            # Upsert: current_price и old_price ВСЕГДА обновляем из Ozon.
            # applied_prices — отдельная таблица, её не трогаем.
            cur.execute(
                f"""INSERT INTO {SCHEMA}.products
                    (user_id, sku, name, platform, current_price, old_price, cost_price,
                     commission_pct, logistics_cost, storage_cost_per_unit,
                     ads_cost_per_unit, return_rate_pct, sales, stock, revenue, updated_at)
                    VALUES (%s,%s,%s,'Ozon',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                    ON CONFLICT (user_id, sku) DO UPDATE SET
                      name                  = EXCLUDED.name,
                      platform              = 'Ozon',
                      old_price             = CASE
                                                WHEN products.current_price <> EXCLUDED.current_price
                                                THEN products.current_price
                                                ELSE EXCLUDED.old_price
                                              END,
                      current_price         = EXCLUDED.current_price,
                      cost_price            = EXCLUDED.cost_price,
                      commission_pct        = EXCLUDED.commission_pct,
                      logistics_cost        = EXCLUDED.logistics_cost,
                      storage_cost_per_unit = EXCLUDED.storage_cost_per_unit,
                      ads_cost_per_unit     = EXCLUDED.ads_cost_per_unit,
                      return_rate_pct       = EXCLUDED.return_rate_pct,
                      stock                 = EXCLUDED.stock,
                      revenue               = EXCLUDED.revenue,
                      updated_at            = NOW()
                    RETURNING (xmax <> 0) AS was_update,
                              (products.current_price IS DISTINCT FROM EXCLUDED.current_price)""",
                (
                    user_id, sku, name,
                    current_price, old_price, cost_price,
                    commission_pct, logistics_cost, storage_cost_per_unit,
                    ads_cost_per_unit, return_rate_pct, sales, stock, revenue,
                ),
            )
            row = cur.fetchone()
            if row and row[0]:   # was_update = True (не INSERT)
                prices_updated += 1

            result.append({
                "sku":         sku,
                "name":        name,
                "price":       current_price,
                "old_price":   old_price,
                "stock":       stock,
                "sales":       sales,
                "price_changed": bool(row and row[1]) if row else False,
            })

        conn.commit()
        return {
            "synced":         len(result),
            "prices_updated": prices_updated,
            "products":       result,
        }

    finally:
        cur.close()


# ── Sales sync ────────────────────────────────────────────────────

def fetch_fbo_sales(client_id: str, api_key: str, days: int = 30, conn=None, user_id=None) -> list[dict]:
    """
    POST /v2/posting/fbo/list — список FBO-отправлений за последние N дней.

    Используемые поля ответа:
      posting_number, status, created_at,
      products[]: { offer_id, name, quantity, price }

    Учитываем только финальные статусы (не отменённые):
      delivered, sent_by_seller, awaiting_deliver, ...
    Исключаем: cancelled, cancelled_from_acceptance

    Пагинация: offset + limit.
    """
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    until = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    SKIP_STATUSES = {"cancelled", "cancelled_from_acceptance", "returned"}

    all_postings: list[dict] = []
    offset = 0
    limit  = 1000

    while True:
        resp = ozon_post(
            "/v2/posting/fbo/list",
            {
                "dir":    "asc",
                "filter": {"since": since, "to": until, "status": ""},
                "limit":  limit,
                "offset": offset,
                "translit": False,
                "with": {"analytics_data": False, "financial_data": False},
            },
            client_id, api_key, conn=conn, user_id=user_id, retries=1,
        )
        result   = resp.get("result", [])
        postings = result if isinstance(result, list) else result.get("postings", [])

        # Фильтруем отменённые
        valid = [p for p in postings if p.get("status") not in SKIP_STATUSES]
        all_postings.extend(valid)

        if len(postings) < limit:
            break
        offset += limit

    return all_postings


def aggregate_sales(postings: list[dict]) -> dict[str, dict]:
    """
    Агрегирует продажи по offer_id (SKU).
    Возвращает:
      { offer_id: { sales: int, revenue: float, orders: int } }
    """
    by_sku: dict[str, dict] = defaultdict(lambda: {"sales": 0, "revenue": 0.0, "orders": 0})

    for posting in postings:
        for product in posting.get("products", []):
            sku = product.get("offer_id", "")
            if not sku:
                continue
            qty   = int(product.get("quantity", 0))
            price = float(product.get("price", 0) or 0)
            by_sku[sku]["sales"]   += qty
            by_sku[sku]["revenue"] += qty * price
            by_sku[sku]["orders"]  += 1  # одна строка = одна позиция в заказе

    return dict(by_sku)


def sync_ozon_sales(user_id: str, client_id: str, api_key: str, conn, days: int = 30) -> dict:
    """
    Синхронизация продаж Ozon за последние N дней.

    1. GET /v2/posting/fbo/list → все отправления
    2. Агрегирует: sales, revenue по SKU
    3. Обновляет products: sales, revenue (только товары этого user_id)
    4. Сохраняет агрегат в sales_aggregates
    5. Возвращает статистику
    """
    cur = conn.cursor()
    try:
        now   = datetime.now(timezone.utc)
        since = now - timedelta(days=days)

        # ── 1. Список FBO-отправлений ─────────────────────────────────
        postings = fetch_fbo_sales(client_id, api_key, days, conn=conn, user_id=user_id)

        # ── 2. Агрегация по SKU ───────────────────────────────────────
        by_sku = aggregate_sales(postings)

        total_orders  = len(postings)
        total_items   = sum(v["sales"]   for v in by_sku.values())
        total_revenue = sum(v["revenue"] for v in by_sku.values())

        # ── 3. Обновляем products ─────────────────────────────────────
        updated_skus: list[str] = []

        for sku, agg in by_sku.items():
            cur.execute(
                f"""UPDATE {SCHEMA}.products
                    SET sales      = %s,
                        revenue    = %s,
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND sku = %s
                      AND platform = 'Ozon'
                    RETURNING sku""",
                (agg["sales"], round(agg["revenue"], 2), user_id, sku),
            )
            row = cur.fetchone()
            if row:
                updated_skus.append(row[0])

        # ── 4. Сохраняем агрегат ──────────────────────────────────────
        cur.execute(
            f"""INSERT INTO {SCHEMA}.sales_aggregates
                (user_id, platform, period_start, period_end, total_orders, total_revenue, total_items)
                VALUES (%s, 'ozon', %s, %s, %s, %s, %s)""",
            (user_id, since, now, total_orders, round(total_revenue, 2), total_items),
        )

        conn.commit()

        return {
            "period_days":    days,
            "total_orders":   total_orders,
            "total_items":    total_items,
            "total_revenue":  round(total_revenue, 2),
            "skus_updated":   len(updated_skus),
            "skus_in_orders": len(by_sku),
            "by_sku": [
                {
                    "sku":     sku,
                    "sales":   agg["sales"],
                    "revenue": round(agg["revenue"], 2),
                }
                for sku, agg in sorted(by_sku.items(), key=lambda x: -x[1]["revenue"])
            ],
        }

    finally:
        cur.close()


# ── DB helpers ─────────────────────────────────────────────────────

def get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
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


# ── Handler ────────────────────────────────────────────────────────

# ── Full sync ──────────────────────────────────────────────────────

def sync_ozon_full(user_id: str, client_id: str, api_key: str, conn) -> dict:
    """
    Полная синхронизация Ozon за один вызов:
      1. sync_ozon_products  — список товаров + цены (/v2/product/list, /v4/product/info/prices, /v3/product/info/stocks)
      2. sync_ozon_sales     — продажи FBO за 30 дней (/v2/posting/fbo/list)

    Каждый шаг выполняется независимо: ошибка в одном не останавливает другие.
    После успеха обновляет integrations.last_sync_at.
    """
    cur = conn.cursor()
    errors: list[str] = []

    # ── Шаг 1: товары + цены ─────────────────────────────────────────
    products_stats: dict = {}
    try:
        products_stats = sync_ozon_products(user_id, client_id, api_key, conn)
    except RuntimeError as e:
        errors.append(f"products: {e}")

    # ── Шаг 2: продажи ───────────────────────────────────────────────
    sales_stats: dict = {}
    try:
        sales_stats = sync_ozon_sales(user_id, client_id, api_key, conn, days=30)
    except RuntimeError as e:
        errors.append(f"sales: {e}")

    # ── Обновляем last_sync_at ────────────────────────────────────────
    cur.execute(
        f"""UPDATE {SCHEMA}.integrations
            SET last_sync_at = NOW()
            WHERE user_id = %s AND platform = 'ozon'""",
        (user_id,),
    )
    conn.commit()
    cur.close()

    return {
        "products": {
            "synced":         products_stats.get("synced", 0),
            "prices_updated": products_stats.get("prices_updated", 0),
            "prices_changed": sum(
                1 for p in products_stats.get("products", []) if p.get("price_changed")
            ),
        },
        "sales": {
            "total_orders":  sales_stats.get("total_orders", 0),
            "total_items":   sales_stats.get("total_items", 0),
            "total_revenue": sales_stats.get("total_revenue", 0.0),
            "skus_updated":  sales_stats.get("skus_updated", 0),
        },
        "errors": errors,
    }


# ── Handler ────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Синхронизация данных Ozon.
    POST /sync-ozon                — только товары (список + цены + остатки)
    POST /sync-ozon?action=sales   — только продажи (FBO 30 дней)
    POST /sync-ozon?action=full    — полная синхронизация (товары + продажи), cooldown 1 ч
    Header: X-Auth-Token
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}
    if event.get("httpMethod") != "POST":
        return err("Только POST", 405)

    qs     = event.get("queryStringParameters") or {}
    action = qs.get("action", "products")   # "products" | "sales" | "full"

    conn = get_conn()
    cur  = conn.cursor()
    try:
        user_id, _plan = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        client_id, api_key = get_ozon_creds(cur, user_id)
        if not client_id or not api_key:
            return err("Интеграция Ozon не настроена. Добавьте ключи в Настройки → Ozon.", 400)

        # ── action=full ───────────────────────────────────────────────
        if action == "full":
            # Cooldown: проверяем last_sync_at в integrations
            cur.execute(
                f"""SELECT last_sync_at FROM {SCHEMA}.integrations
                    WHERE user_id = %s AND platform = 'ozon'""",
                (user_id,),
            )
            row = cur.fetchone()
            if row and row[0]:
                last = row[0]
                diff = datetime.now(timezone.utc) - last.replace(tzinfo=timezone.utc)
                if diff.total_seconds() < 3600:
                    remaining = int(3600 - diff.total_seconds()) // 60
                    return err(
                        f"Полная синхронизация доступна раз в час. "
                        f"Следующая через ~{remaining} мин.",
                        429,
                    )

            # Лог: старт полной синхронизации
            cur.execute(
                f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, 'ozon', 'running') RETURNING id",
                (user_id,),
            )
            log_id = cur.fetchone()[0]
            conn.commit()

            result = sync_ozon_full(user_id, client_id, api_key, conn)

            # Лог: завершение
            total_products = result["products"]["synced"]
            status = "success" if not result["errors"] else "partial"
            cur.execute(
                f"""UPDATE {SCHEMA}.sync_log
                    SET status=%s, products_count=%s, finished_at=NOW(),
                        error=%s
                    WHERE id=%s""",
                (
                    status,
                    total_products,
                    "; ".join(result["errors"]) if result["errors"] else None,
                    log_id,
                ),
            )
            conn.commit()

            return ok({
                "ok":       True,
                "action":   "full",
                "platform": "ozon",
                "summary": {
                    "products_synced":   result["products"]["synced"],
                    "prices_updated":    result["products"]["prices_updated"],
                    "prices_changed":    result["products"]["prices_changed"],
                    "total_orders":      result["sales"]["total_orders"],
                    "total_items":       result["sales"]["total_items"],
                    "total_revenue":     result["sales"]["total_revenue"],
                    "skus_updated":      result["sales"]["skus_updated"],
                },
                "errors":   result["errors"],
            })

        # ── action=sales ──────────────────────────────────────────────
        elif action == "sales":
            body = json.loads(event.get("body") or "{}")
            days = max(1, min(int(body.get("days", 30)), 90))

            try:
                stats = sync_ozon_sales(user_id, client_id, api_key, conn, days)
            except RuntimeError as e:
                conn.rollback()
                return err(f"Ошибка Ozon API: {e}", 502)

            return ok({"ok": True, "action": "sales", "platform": "ozon", **stats})

        # ── action=products (по умолчанию) ────────────────────────────
        else:
            cur.execute(
                f"""SELECT started_at FROM {SCHEMA}.sync_log
                    WHERE user_id = %s AND platform = 'ozon' AND status = 'success'
                    AND started_at > NOW() - INTERVAL '1 hour' LIMIT 1""",
                (user_id,),
            )
            if cur.fetchone():
                return err("Синхронизация Ozon уже выполнялась менее часа назад", 429)

            cur.execute(
                f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, 'ozon', 'running') RETURNING id",
                (user_id,),
            )
            log_id = cur.fetchone()[0]
            conn.commit()

            try:
                stats = sync_ozon_products(user_id, client_id, api_key, conn)
            except RuntimeError as e:
                cur.execute(
                    f"UPDATE {SCHEMA}.sync_log SET status='error', error=%s, finished_at=NOW() WHERE id=%s",
                    (str(e), log_id),
                )
                conn.commit()
                return err(f"Ошибка Ozon API: {e}", 502)

            cur.execute(
                f"UPDATE {SCHEMA}.sync_log SET status='success', products_count=%s, finished_at=NOW() WHERE id=%s",
                (stats["synced"], log_id),
            )
            conn.commit()

            return ok({
                "ok":             True,
                "action":         "products",
                "platform":       "ozon",
                "synced":         stats["synced"],
                "prices_updated": stats["prices_updated"],
                "products":       stats["products"],
                "log": {
                    "total_products": stats["synced"],
                    "prices_updated": stats["prices_updated"],
                    "prices_changed": sum(1 for p in stats["products"] if p.get("price_changed")),
                },
            })

    except Exception as e:
        conn.rollback()
        return err(f"Внутренняя ошибка: {e}", 500)
    finally:
        cur.close()
        conn.close()