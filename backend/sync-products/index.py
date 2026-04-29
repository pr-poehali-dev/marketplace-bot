import json
import os
import random
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

# ── Тарифные лимиты ───────────────────────────────────────────────
PLAN_LIMITS = {
    "free": 50,
    "pro": 500,
}

MOCK_CATALOG = {
    "ozon": [
        {"sku": "OZ-44821", "name": "Наушники TWS Pro X12",    "price": 3990, "cost_price": 1800,
         "commission_pct": 8,  "logistics_cost": 220, "storage_cost_per_unit": 18, "ads_cost_per_unit": 140, "return_rate_pct": 4},
        {"sku": "OZ-77234", "name": "Фитнес-браслет ActFit 5", "price": 3999, "cost_price": 1600,
         "commission_pct": 9,  "logistics_cost": 180, "storage_cost_per_unit": 14, "ads_cost_per_unit": 120, "return_rate_pct": 3},
        {"sku": "OZ-38821", "name": "Беспроводная зарядка X3", "price": 1999, "cost_price": 700,
         "commission_pct": 8,  "logistics_cost": 140, "storage_cost_per_unit": 10, "ads_cost_per_unit": 60,  "return_rate_pct": 3},
        {"sku": "OZ-91042", "name": "Умные часы NovaSport 3",  "price": 6990, "cost_price": 3200,
         "commission_pct": 9,  "logistics_cost": 280, "storage_cost_per_unit": 24, "ads_cost_per_unit": 200, "return_rate_pct": 5},
    ],
    "wb": [
        {"sku": "WB-29103", "name": "Умная колонка Hori M2",       "price": 4500, "cost_price": 2100,
         "commission_pct": 10, "logistics_cost": 260, "storage_cost_per_unit": 22, "ads_cost_per_unit": 190, "return_rate_pct": 6},
        {"sku": "WB-51029", "name": "Портативный аккумулятор 20K", "price": 2500, "cost_price": 950,
         "commission_pct": 11, "logistics_cost": 160, "storage_cost_per_unit": 12, "ads_cost_per_unit": 80,  "return_rate_pct": 5},
        {"sku": "WB-63301", "name": "Робот-пылесос CleanBot X1",   "price": 12990, "cost_price": 6500,
         "commission_pct": 12, "logistics_cost": 400, "storage_cost_per_unit": 35, "ads_cost_per_unit": 320, "return_rate_pct": 7},
    ],
}


def mock_marketplace_api(platform: str, api_key: str) -> list[dict]:
    """
    Имитирует вызов API маркетплейса.
    Для подключения реального API — заменить на HTTP-запросы.

    Ozon: POST https://api-seller.ozon.ru/v2/product/list  Headers: Client-Id, Api-Key
    WB:   GET  https://statistics-api.wildberries.ru/api/v1/supplier/stocks  Headers: Authorization
    """
    items = MOCK_CATALOG.get(platform, [])
    result = []
    for item in items:
        sales = random.randint(80, 400)
        stock = random.randint(0, 250)
        result.append({
            "sku":                   item["sku"],
            "name":                  item["name"],
            "price":                 item["price"],
            "sales":                 sales,
            "stock":                 stock,
            "cost_price":            item["cost_price"],
            "commission_pct":        item["commission_pct"],
            "logistics_cost":        item["logistics_cost"],
            "storage_cost_per_unit": item["storage_cost_per_unit"],
            "ads_cost_per_unit":     item["ads_cost_per_unit"],
            "return_rate_pct":       item["return_rate_pct"],
            "revenue":               round(item["price"] * sales, 2),
        })
    return result


def get_conn():
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
    if not row:
        return None, None
    return str(row[0]), row[1]


def ok(data):
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400, extra: dict | None = None):
    body = {"error": msg}
    if extra:
        body.update(extra)
    return {"statusCode": code, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def save_products(cur, user_id: str, platform: str, items: list[dict]):
    for p in items:
        cur.execute(
            f"""INSERT INTO {SCHEMA}.products
                (user_id, sku, name, platform, current_price, cost_price,
                 commission_pct, logistics_cost, storage_cost_per_unit,
                 ads_cost_per_unit, return_rate_pct, sales, stock, revenue, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (user_id, sku) DO UPDATE SET
                  name=EXCLUDED.name, platform=EXCLUDED.platform,
                  current_price=EXCLUDED.current_price, cost_price=EXCLUDED.cost_price,
                  commission_pct=EXCLUDED.commission_pct, logistics_cost=EXCLUDED.logistics_cost,
                  storage_cost_per_unit=EXCLUDED.storage_cost_per_unit,
                  ads_cost_per_unit=EXCLUDED.ads_cost_per_unit, return_rate_pct=EXCLUDED.return_rate_pct,
                  sales=EXCLUDED.sales, stock=EXCLUDED.stock, revenue=EXCLUDED.revenue, updated_at=NOW()""",
            (user_id, p["sku"], p["name"], platform,
             p["price"], p["cost_price"], p["commission_pct"],
             p["logistics_cost"], p["storage_cost_per_unit"], p["ads_cost_per_unit"],
             p["return_rate_pct"], p["sales"], p["stock"], p["revenue"]),
        )


def handler(event: dict, context) -> dict:
    """Синхронизация товаров. POST body: { platform: "ozon"|"wb"|"all" }"""
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

        limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

        body = json.loads(event.get("body") or "{}")
        requested = (body.get("platform") or "all").strip().lower()
        platforms = ["ozon", "wb"] if requested == "all" else [requested]

        if any(p not in {"ozon", "wb"} for p in platforms):
            return err("platform должен быть ozon, wb или all")

        # Текущее кол-во товаров пользователя
        cur.execute(
            f"SELECT COUNT(*) FROM {SCHEMA}.products WHERE user_id = %s",
            (user_id,),
        )
        current_count = cur.fetchone()[0]

        # Загружаем интеграции
        cur.execute(
            f"SELECT platform, api_key FROM {SCHEMA}.integrations WHERE user_id = %s",
            (user_id,),
        )
        integrations = {row[0]: row[1] for row in cur.fetchall()}

        results = []
        for platform in platforms:
            # Cooldown 1 час
            cur.execute(
                f"""SELECT started_at FROM {SCHEMA}.sync_log
                    WHERE user_id = %s AND platform = %s AND status = 'success'
                    AND started_at > NOW() - INTERVAL '1 hour' LIMIT 1""",
                (user_id, platform),
            )
            if cur.fetchone():
                results.append({"platform": platform, "skipped": True, "reason": "cooldown_1h"})
                continue

            api_key = integrations.get(platform)
            items = mock_marketplace_api(platform, api_key or "")

            # Считаем НОВЫЕ SKU (которых ещё нет у пользователя)
            existing_skus = set()
            if items:
                skus = tuple(p["sku"] for p in items)
                cur.execute(
                    f"SELECT sku FROM {SCHEMA}.products WHERE user_id = %s AND sku = ANY(%s::text[])",
                    (user_id, list(skus)),
                )
                existing_skus = {r[0] for r in cur.fetchall()}

            new_items = [p for p in items if p["sku"] not in existing_skus]
            would_be_total = current_count + len(new_items)

            # Проверка лимита тарифа
            if would_be_total > limit:
                allowed = max(0, limit - current_count)
                return err(
                    f"Превышен лимит тарифа {plan.upper()}: максимум {limit} товаров. "
                    f"Сейчас {current_count}, при синхронизации добавится {len(new_items)} новых. "
                    f"Доступно слотов: {allowed}.",
                    code=403,
                    extra={"plan": plan, "limit": limit, "current": current_count,
                           "new_items": len(new_items), "allowed_slots": allowed},
                )

            cur.execute(
                f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, %s, 'running') RETURNING id",
                (user_id, platform),
            )
            log_id = cur.fetchone()[0]
            conn.commit()

            save_products(cur, user_id, platform, items)
            current_count += len(new_items)  # обновляем счётчик для следующей платформы

            cur.execute(
                f"UPDATE {SCHEMA}.sync_log SET status='success', products_count=%s, finished_at=NOW() WHERE id=%s",
                (len(items), log_id),
            )
            conn.commit()

            results.append({
                "platform": platform,
                "synced": len(items),
                "new": len(new_items),
                "products": [{"sku": p["sku"], "name": p["name"], "price": p["price"],
                               "sales": p["sales"], "stock": p["stock"]} for p in items],
                "demo_mode": api_key is None,
            })

        return ok({
            "ok": True,
            "results": results,
            "plan": plan,
            "limit": limit,
            "total_products": current_count,
        })

    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        cur.close()
        conn.close()
