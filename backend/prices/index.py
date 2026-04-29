import json
import os
from utils import get_conn, require_auth, get_token, cors_headers, SCHEMA


def handler(event: dict, context) -> dict:
    """Применённые цены пользователя: получение и сохранение."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
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

        # ── GET — все цены пользователя ──────────────────────────────
        if method == "GET":
            cur.execute(
                f"SELECT sku, price, applied_at FROM {SCHEMA}.applied_prices WHERE user_id = %s",
                (user_id,),
            )
            prices = {r[0]: {"price": float(r[1]), "applied_at": str(r[2])} for r in cur.fetchall()}
            return ok({"prices": prices})

        # ── POST — сохранить/обновить цену ───────────────────────────
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
                    ON CONFLICT (user_id, sku) DO UPDATE
                    SET price = EXCLUDED.price, applied_at = NOW()""",
                (user_id, sku, price),
            )
            conn.commit()
            return ok({"ok": True, "sku": sku, "price": price})

        else:
            return err("Не найдено", 404)

    finally:
        cur.close()
        conn.close()
