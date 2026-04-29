import json
import os
import psycopg2
from utils import get_conn, require_auth, get_token, cors_headers, SCHEMA

MOCK_OZON_PRODUCTS = [
    {"sku": "OZ-44821", "name": "Наушники TWS Pro X12", "platform": "Ozon", "current_price": 3990, "cost_price": 1800,
     "commission_pct": 8, "logistics_cost": 220, "storage_cost_per_unit": 18, "ads_cost_per_unit": 140,
     "return_rate_pct": 4, "sales": 312, "stock": 84, "revenue": 1248000},
    {"sku": "OZ-77234", "name": "Фитнес-браслет ActFit 5", "platform": "Ozon", "current_price": 3999, "cost_price": 1600,
     "commission_pct": 9, "logistics_cost": 180, "storage_cost_per_unit": 14, "ads_cost_per_unit": 120,
     "return_rate_pct": 3, "sales": 176, "stock": 203, "revenue": 704000},
    {"sku": "OZ-38821", "name": "Беспроводная зарядка X3", "platform": "Ozon", "current_price": 1999, "cost_price": 700,
     "commission_pct": 8, "logistics_cost": 140, "storage_cost_per_unit": 10, "ads_cost_per_unit": 60,
     "return_rate_pct": 3, "sales": 134, "stock": 67, "revenue": 268000},
]

MOCK_WB_PRODUCTS = [
    {"sku": "WB-29103", "name": "Умная колонка Hori M2", "platform": "WB", "current_price": 4500, "cost_price": 2100,
     "commission_pct": 10, "logistics_cost": 260, "storage_cost_per_unit": 22, "ads_cost_per_unit": 190,
     "return_rate_pct": 6, "sales": 198, "stock": 12, "revenue": 891000},
    {"sku": "WB-51029", "name": "Портативный аккумулятор 20K", "platform": "WB", "current_price": 2500, "cost_price": 950,
     "commission_pct": 11, "logistics_cost": 160, "storage_cost_per_unit": 12, "ads_cost_per_unit": 80,
     "return_rate_pct": 5, "sales": 145, "stock": 0, "revenue": 362500},
]


def fetch_products_from_api(platform: str, api_key) -> list:
    """
    Заглушка внешнего API. При наличии ключа — подключить реальный вызов.

    Ozon: POST https://api-seller.ozon.ru/v2/product/list
          Headers: Client-Id, Api-Key
    WB:   GET  https://statistics-api.wildberries.ru/api/v1/supplier/stocks
          Headers: Authorization: <token>
    """
    return MOCK_OZON_PRODUCTS if platform == "Ozon" else MOCK_WB_PRODUCTS


def handler(event: dict, context) -> dict:
    """Товары пользователя: получение списка и синхронизация с площадками."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    action = (event.get("queryStringParameters") or {}).get("action", "")
    token = get_token(event)

    def ok(data):
        return {"statusCode": 200, "headers": cors_headers(),
                "body": json.dumps(data, ensure_ascii=False, default=str)}

    def err(msg, code=400):
        return {"statusCode": code, "headers": cors_headers(),
                "body": json.dumps({"error": msg}, ensure_ascii=False)}

    conn = get_conn(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    try:
        user_id = require_auth(cur, token)
        if not user_id:
            return err("Не авторизован", 401)

        # Достаём ключи площадок
        cur.execute(
            f"SELECT ozon_api_key, wb_api_key FROM {SCHEMA}.users WHERE id = %s", (user_id,)
        )
        keys_row = cur.fetchone()
        ozon_key = keys_row[0] if keys_row else None
        wb_key = keys_row[1] if keys_row else None

        # ── GET — список товаров ─────────────────────────────────────
        if method == "GET":
            cur.execute(
                f"""SELECT p.sku, p.name, p.platform, p.current_price, p.old_price,
                           p.cost_price, p.commission_pct, p.logistics_cost, p.storage_cost_per_unit,
                           p.ads_cost_per_unit, p.return_rate_pct, p.sales, p.stock, p.revenue,
                           p.updated_at,
                           COALESCE(ap.price, p.current_price) AS applied_price
                    FROM {SCHEMA}.products p
                    LEFT JOIN {SCHEMA}.applied_prices ap
                           ON ap.user_id = p.user_id AND ap.sku = p.sku
                    WHERE p.user_id = %s
                    ORDER BY p.revenue DESC""",
                (user_id,),
            )
            cols = ["sku", "name", "platform", "current_price", "old_price", "cost_price",
                    "commission_pct", "logistics_cost", "storage_cost_per_unit", "ads_cost_per_unit",
                    "return_rate_pct", "sales", "stock", "revenue", "updated_at", "applied_price"]
            products = []
            for r in cur.fetchall():
                p = dict(zip(cols, r))
                for k in ["current_price", "cost_price", "commission_pct", "logistics_cost",
                          "storage_cost_per_unit", "ads_cost_per_unit", "return_rate_pct",
                          "revenue", "applied_price"]:
                    p[k] = float(p[k])
                if p["old_price"] is not None:
                    p["old_price"] = float(p["old_price"])
                products.append(p)

            cur.execute(
                f"""SELECT platform, status, products_count, started_at, finished_at
                    FROM {SCHEMA}.sync_log WHERE user_id = %s
                    ORDER BY started_at DESC LIMIT 4""",
                (user_id,),
            )
            last_sync = [
                {"platform": r[0], "status": r[1], "count": r[2],
                 "started_at": str(r[3]), "finished_at": str(r[4])}
                for r in cur.fetchall()
            ]
            return ok({"products": products, "last_sync": last_sync})

        # ── POST ?action=sync ────────────────────────────────────────
        elif method == "POST" and action == "sync":
            body = json.loads(event.get("body") or "{}")
            platform = body.get("platform", "all")
            platforms = ["Ozon", "WB"] if platform == "all" else [platform]

            # Защита: не чаще 1 раза в час
            for pl in platforms:
                cur.execute(
                    f"""SELECT started_at FROM {SCHEMA}.sync_log
                        WHERE user_id = %s AND platform = %s AND status = 'success'
                        AND started_at > NOW() - INTERVAL '1 hour'
                        LIMIT 1""",
                    (user_id, pl),
                )
                if cur.fetchone():
                    return err(f"Синхронизация {pl} доступна раз в час", 429)

            total = 0
            for pl in platforms:
                api_key = ozon_key if pl == "Ozon" else wb_key
                cur.execute(
                    f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, %s, 'running') RETURNING id",
                    (user_id, pl),
                )
                log_id = cur.fetchone()[0]
                conn.commit()

                items = fetch_products_from_api(pl, api_key)
                for p in items:
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.products
                            (user_id, sku, name, platform, current_price, cost_price,
                             commission_pct, logistics_cost, storage_cost_per_unit,
                             ads_cost_per_unit, return_rate_pct, sales, stock, revenue, updated_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                            ON CONFLICT (user_id, sku) DO UPDATE SET
                              name=EXCLUDED.name, platform=EXCLUDED.platform,
                              current_price=EXCLUDED.current_price,
                              cost_price=EXCLUDED.cost_price,
                              commission_pct=EXCLUDED.commission_pct,
                              logistics_cost=EXCLUDED.logistics_cost,
                              storage_cost_per_unit=EXCLUDED.storage_cost_per_unit,
                              ads_cost_per_unit=EXCLUDED.ads_cost_per_unit,
                              return_rate_pct=EXCLUDED.return_rate_pct,
                              sales=EXCLUDED.sales, stock=EXCLUDED.stock,
                              revenue=EXCLUDED.revenue, updated_at=NOW()""",
                        (user_id, p["sku"], p["name"], p["platform"],
                         p["current_price"], p["cost_price"], p["commission_pct"],
                         p["logistics_cost"], p["storage_cost_per_unit"], p["ads_cost_per_unit"],
                         p["return_rate_pct"], p["sales"], p["stock"], p["revenue"]),
                    )
                cur.execute(
                    f"UPDATE {SCHEMA}.sync_log SET status='success', products_count=%s, finished_at=NOW() WHERE id=%s",
                    (len(items), log_id),
                )
                conn.commit()
                total += len(items)

            return ok({"ok": True, "synced": total})

        else:
            return err("Не найдено", 404)

    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        cur.close()
        conn.close()