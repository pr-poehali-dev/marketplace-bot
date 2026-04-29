import json
import os
import secrets
import bcrypt
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    }


def ok(data):
    return {"statusCode": 200, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False)}


def err(msg, code=400):
    return {"statusCode": code, "headers": cors_headers(), "body": json.dumps({"error": msg}, ensure_ascii=False)}


def get_token(event):
    h = event.get("headers") or {}
    return h.get("X-Auth-Token") or h.get("x-auth-token") or ""


def require_auth(cur, token):
    """Возвращает user_id (UUID строка) или None."""
    if not token:
        return None
    cur.execute(
        f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()",
        (token,),
    )
    row = cur.fetchone()
    return str(row[0]) if row else None


def handler(event: dict, context) -> dict:
    """
    Авторизация пользователей.
    POST ?action=register  body: {email, password, name?}
    POST ?action=login     body: {email, password}
    POST ?action=logout    header: X-Auth-Token
    GET  ?action=me        header: X-Auth-Token
    POST ?action=api-keys  header: X-Auth-Token, body: {ozon_api_key?, wb_api_key?}
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    action = (event.get("queryStringParameters") or {}).get("action", "me")
    token = get_token(event)

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    conn = get_conn()
    cur = conn.cursor()
    try:

        # ── POST ?action=register ────────────────────────────────────
        if action == "register" and method == "POST":
            email = (body.get("email") or "").strip().lower()
            password = (body.get("password") or "")
            name = (body.get("name") or "").strip()

            if not email or not password:
                return err("Email и пароль обязательны")
            if len(password) < 6:
                return err("Пароль минимум 6 символов")

            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = %s", (email,))
            if cur.fetchone():
                return err("Пользователь с таким email уже существует")

            pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id, plan",
                (email, pw_hash, name),
            )
            r = cur.fetchone()
            user_id, plan = str(r[0]), r[1]
            session_token = secrets.token_hex(32)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)",
                (user_id, session_token),
            )
            conn.commit()
            return ok({"token": session_token, "user": {"id": user_id, "email": email, "name": name, "plan": plan}})

        # ── POST ?action=login ───────────────────────────────────────
        elif action == "login" and method == "POST":
            email = (body.get("email") or "").strip().lower()
            password = (body.get("password") or "")

            if not email or not password:
                return err("Email и пароль обязательны")

            cur.execute(
                f"SELECT id, email, name, password_hash, plan FROM {SCHEMA}.users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
            if not row:
                return err("Неверный email или пароль", 401)

            user_id, user_email, user_name, pw_hash, user_plan = row
            if not bcrypt.checkpw(password.encode(), pw_hash.encode()):
                return err("Неверный email или пароль", 401)

            user_id = str(user_id)
            session_token = secrets.token_hex(32)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)",
                (user_id, session_token),
            )
            conn.commit()
            return ok({"token": session_token, "user": {"id": user_id, "email": user_email, "name": user_name, "plan": user_plan}})

        # ── POST ?action=logout ──────────────────────────────────────
        elif action == "logout" and method == "POST":
            if token:
                cur.execute(
                    f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE token = %s", (token,)
                )
                conn.commit()
            return ok({"ok": True})

        # ── GET ?action=me ───────────────────────────────────────────
        elif action == "me" and method == "GET":
            user_id = require_auth(cur, token)
            if not user_id:
                return err("Не авторизован", 401)

            cur.execute(
                f"SELECT id, email, name, ozon_api_key, wb_api_key, plan FROM {SCHEMA}.users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                return err("Пользователь не найден", 404)
            uid, email, name, ozon_key, wb_key, plan = row
            return ok({
                "user": {
                    "id": str(uid), "email": email, "name": name,
                    "hasOzonKey": bool(ozon_key),
                    "hasWbKey": bool(wb_key),
                    "plan": plan,
                }
            })

        # ── POST ?action=api-keys ────────────────────────────────────
        elif action == "api-keys" and method == "POST":
            user_id = require_auth(cur, token)
            if not user_id:
                return err("Не авторизован", 401)

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