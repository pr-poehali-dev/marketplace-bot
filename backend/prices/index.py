import json
import os
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_id(cur, token: str):
    cur.execute(
        f"""SELECT user_id FROM {SCHEMA}.sessions
            WHERE token = %s AND expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def handler(event: dict, context) -> dict:
    """Управление применёнными ценами: сохранение и получение."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    token = (event.get("headers") or {}).get("X-Auth-Token") or (event.get("headers") or {}).get("x-auth-token")

    def ok(data):
        return {"statusCode": 200, "headers": cors, "body": json.dumps(data, ensure_ascii=False, default=str)}

    def err(msg, code=400):
        return {"statusCode": code, "headers": cors, "body": json.dumps({"error": msg}, ensure_ascii=False)}

    if not token:
        return err("Не авторизован", 401)

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = get_user_id(cur, token)
        if not user_id:
            return err("Сессия недействительна", 401)

        # ── GET / — все применённые цены ────────────────────────────
        if method == "GET":
            cur.execute(
                f"SELECT sku, price, applied_at FROM {SCHEMA}.applied_prices WHERE user_id = %s",
                (user_id,),
            )
            rows = cur.fetchall()
            prices = {r[0]: {"price": float(r[1]), "applied_at": str(r[2])} for r in rows}
            return ok({"prices": prices})

        # ── POST / — сохранить цену для товара ──────────────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            sku = body.get("sku")
            price = body.get("price")

            if not sku or price is None:
                return err("Нужны sku и price")

            price = float(price)
            if price <= 0:
                return err("Цена должна быть больше 0")

            cur.execute(
                f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, sku) DO UPDATE SET price = EXCLUDED.price, applied_at = NOW()""",
                (user_id, sku, price),
            )
            conn.commit()
            return ok({"ok": True, "sku": sku, "price": price})

        else:
            return err("Не найдено", 404)

    finally:
        cur.close()
        conn.close()
