import json
import os
from utils import get_conn, require_auth, get_token, cors_headers, SCHEMA


def handler(event: dict, context) -> dict:
    """
    Применённые цены пользователя.
    GET  /              — текущие цены (sku → price)
    POST /              — сохранить цену, записать в историю
      body: { sku, price, source? }
    GET  /?action=history&sku=SKU — история цен по товару
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    token = get_token(event)
    qs = event.get("queryStringParameters") or {}

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

        # ── GET ?action=history&sku=SKU — история одного товара ──────
        if method == "GET" and qs.get("action") == "history":
            sku = qs.get("sku", "").strip()
            if not sku:
                return err("Нужен параметр sku")
            cur.execute(
                f"""SELECT id, sku, old_price, new_price, source, created_at
                    FROM {SCHEMA}.price_history
                    WHERE user_id = %s AND sku = %s
                    ORDER BY created_at DESC
                    LIMIT 50""",
                (user_id, sku),
            )
            history = [
                {
                    "id": str(r[0]),
                    "sku": r[1],
                    "old_price": float(r[2]),
                    "new_price": float(r[3]),
                    "source": r[4],
                    "created_at": str(r[5]),
                }
                for r in cur.fetchall()
            ]
            return ok({"history": history, "sku": sku})

        # ── GET / — текущие цены ─────────────────────────────────────
        elif method == "GET":
            cur.execute(
                f"SELECT sku, price, applied_at FROM {SCHEMA}.applied_prices WHERE user_id = %s",
                (user_id,),
            )
            prices = {r[0]: {"price": float(r[1]), "applied_at": str(r[2])} for r in cur.fetchall()}
            return ok({"prices": prices})

        # ── POST / — сохранить цену + записать историю ───────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            sku = (body.get("sku") or "").strip()
            price = body.get("price")
            source = (body.get("source") or "manual").strip()

            if not sku or price is None:
                return err("Нужны sku и price")
            price = float(price)
            if price <= 0:
                return err("Цена должна быть больше 0")

            # Читаем старую цену (из applied_prices или из products)
            cur.execute(
                f"""SELECT COALESCE(
                        (SELECT price FROM {SCHEMA}.applied_prices WHERE user_id = %s AND sku = %s),
                        (SELECT current_price FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s),
                        0
                    )""",
                (user_id, sku, user_id, sku),
            )
            row = cur.fetchone()
            old_price = float(row[0]) if row else 0.0

            # Upsert applied_prices
            cur.execute(
                f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, sku) DO UPDATE
                    SET price = EXCLUDED.price, applied_at = NOW()""",
                (user_id, sku, price),
            )

            # Записываем в историю только если цена реально изменилась
            if abs(price - old_price) > 0.001:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.price_history (user_id, sku, old_price, new_price, source)
                        VALUES (%s, %s, %s, %s, %s)""",
                    (user_id, sku, old_price, price, source),
                )

            conn.commit()
            return ok({
                "ok": True,
                "sku": sku,
                "price": price,
                "old_price": old_price,
                "history_recorded": abs(price - old_price) > 0.001,
            })

        else:
            return err("Не найдено", 404)

    finally:
        cur.close()
        conn.close()
