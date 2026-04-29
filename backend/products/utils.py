import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"


def get_conn(database_url: str):
    return psycopg2.connect(database_url)


def require_auth(cur, token: str):
    """Проверяет токен. Возвращает user_id (str UUID) или None."""
    if not token:
        return None
    cur.execute(
        f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()",
        (token,),
    )
    row = cur.fetchone()
    return str(row[0]) if row else None


def get_token(event: dict) -> str:
    h = event.get("headers") or {}
    return h.get("X-Auth-Token") or h.get("x-auth-token") or ""


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    }
