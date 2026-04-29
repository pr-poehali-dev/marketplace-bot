import json
import os
import hashlib
import secrets
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    }


def ok(data):
    return {"statusCode": 200, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False)}


def err(msg, code=400):
    return {"statusCode": code, "headers": cors_headers(), "body": json.dumps({"error": msg}, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """
    Авторизация пользователей.
    action=register — регистрация (POST, body: email, password, name)
    action=login    — вход (POST, body: email, password)
    action=logout   — выход (POST, header: X-Auth-Token)
    action=me       — профиль (GET, header: X-Auth-Token)
    action=api-keys — сохранить ключи API (POST, body: ozon_api_key, wb_api_key)
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "me")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    headers = event.get("headers") or {}
    token = headers.get("X-Auth-Token") or headers.get("x-auth-token")

    conn = get_conn()
    cur = conn.cursor()

    try:
        # ── register ────────────────────────────────────────────────
        if action == "register" and method == "POST":
            email = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            name = (body.get("name") or "").strip()

            if not email or not password:
                return err("Email и пароль обязательны")
            if len(password) < 6:
                return err("Пароль минимум 6 символов")

            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = %s", (email,))
            if cur.fetchone():
                return err("Пользователь с таким email уже существует")

            pw_hash = hash_password(password)
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id",
                (email, pw_hash, name),
            )
            user_id = cur.fetchone()[0]
            session_token = secrets.token_hex(32)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s, %s)",
                (session_token, user_id),
            )
            conn.commit()
            return ok({"token": session_token, "user": {"id": user_id, "email": email, "name": name}})

        # ── login ───────────────────────────────────────────────────
        elif action == "login" and method == "POST":
            email = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""

            if not email or not password:
                return err("Email и пароль обязательны")

            pw_hash = hash_password(password)
            cur.execute(
                f"SELECT id, email, name FROM {SCHEMA}.users WHERE email = %s AND password_hash = %s",
                (email, pw_hash),
            )
            row = cur.fetchone()
            if not row:
                return err("Неверный email или пароль", 401)

            user_id, user_email, user_name = row
            session_token = secrets.token_hex(32)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s, %s)",
                (session_token, user_id),
            )
            conn.commit()
            return ok({"token": session_token, "user": {"id": user_id, "email": user_email, "name": user_name}})

        # ── logout ──────────────────────────────────────────────────
        elif action == "logout" and method == "POST":
            if token:
                cur.execute(
                    f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE token = %s", (token,)
                )
                conn.commit()
            return ok({"ok": True})

        # ── me ──────────────────────────────────────────────────────
        elif action == "me" and method == "GET":
            if not token:
                return err("Не авторизован", 401)
            cur.execute(
                f"""SELECT u.id, u.email, u.name, u.ozon_api_key, u.wb_api_key
                    FROM {SCHEMA}.sessions s
                    JOIN {SCHEMA}.users u ON u.id = s.user_id
                    WHERE s.token = %s AND s.expires_at > NOW()""",
                (token,),
            )
            row = cur.fetchone()
            if not row:
                return err("Сессия недействительна", 401)
            uid, email, name, ozon_key, wb_key = row
            return ok({
                "user": {
                    "id": uid, "email": email, "name": name,
                    "hasOzonKey": bool(ozon_key),
                    "hasWbKey": bool(wb_key),
                }
            })

        # ── api-keys ────────────────────────────────────────────────
        elif action == "api-keys" and method == "POST":
            if not token:
                return err("Не авторизован", 401)
            cur.execute(
                f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()", (token,)
            )
            row = cur.fetchone()
            if not row:
                return err("Сессия недействительна", 401)
            user_id = row[0]

            ozon_key = body.get("ozon_api_key")
            wb_key = body.get("wb_api_key")
            if ozon_key is not None:
                cur.execute(
                    f"UPDATE {SCHEMA}.users SET ozon_api_key = %s WHERE id = %s",
                    (ozon_key or None, user_id),
                )
            if wb_key is not None:
                cur.execute(
                    f"UPDATE {SCHEMA}.users SET wb_api_key = %s WHERE id = %s",
                    (wb_key or None, user_id),
                )
            conn.commit()
            return ok({"ok": True})

        else:
            return err("Неизвестное действие", 404)

    finally:
        cur.close()
        conn.close()
