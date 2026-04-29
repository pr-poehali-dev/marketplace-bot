import json
import os
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

PLATFORMS = {"ozon", "wb"}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
    """Проверяет X-Auth-Token. Возвращает user_id (str) или None."""
    h = event.get("headers") or {}
    token = h.get("X-Auth-Token") or h.get("x-auth-token") or ""
    if not token:
        return None
    cur.execute(
        f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()",
        (token,),
    )
    row = cur.fetchone()
    return str(row[0]) if row else None


def ok(data):
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400):
    return {"statusCode": code, "headers": CORS, "body": json.dumps({"error": msg}, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """
    Интеграции с маркетплейсами (API-ключи).
    GET  /integrations               — список интеграций пользователя
    POST /integrations               — сохранить/обновить ключ
      body: { platform: "ozon"|"wb", api_key: "..." }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        # ── GET — список интеграций ──────────────────────────────────
        if method == "GET":
            cur.execute(
                f"""SELECT id, platform, LEFT(api_key, 8) || '...' AS api_key_preview,
                           created_at, updated_at
                    FROM {SCHEMA}.integrations
                    WHERE user_id = %s
                    ORDER BY platform""",
                (user_id,),
            )
            rows = cur.fetchall()
            integrations = [
                {
                    "id": str(r[0]),
                    "platform": r[1],
                    "api_key_preview": r[2],
                    "created_at": str(r[3]),
                    "updated_at": str(r[4]),
                }
                for r in rows
            ]
            return ok({"integrations": integrations})

        # ── POST — сохранить/обновить ключ ───────────────────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            platform = (body.get("platform") or "").strip().lower()
            api_key = (body.get("api_key") or "").strip()

            if platform not in PLATFORMS:
                return err(f"platform должен быть одним из: {', '.join(PLATFORMS)}")
            if not api_key:
                return err("api_key обязателен")
            if len(api_key) < 8:
                return err("api_key слишком короткий")

            cur.execute(
                f"""INSERT INTO {SCHEMA}.integrations (user_id, platform, api_key)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, platform) DO UPDATE
                    SET api_key = EXCLUDED.api_key, updated_at = NOW()
                    RETURNING id, platform, updated_at""",
                (user_id, platform, api_key),
            )
            row = cur.fetchone()
            conn.commit()
            return ok({
                "ok": True,
                "integration": {
                    "id": str(row[0]),
                    "platform": row[1],
                    "updated_at": str(row[2]),
                }
            })

        else:
            return err("Метод не поддерживается", 405)

    finally:
        cur.close()
        conn.close()
