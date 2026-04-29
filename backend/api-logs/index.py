import json
import os
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ok(data: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(data, default=str)}


def err(msg: str, status: int = 400) -> dict:
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps({"error": msg})}


def get_user_id(event: dict) -> str | None:
    headers = event.get("headers") or {}
    return (
        headers.get("X-User-Id")
        or headers.get("x-user-id")
        or (event.get("queryStringParameters") or {}).get("user_id")
    )


def handler(event: dict, context) -> dict:
    """
    Логи API-запросов к маркетплейсам.

    GET  /             — список логов с фильтрами
      ?platform=ozon|wb|all   (default: all)
      ?period=1|7|30|90       (дней, default: 30)
      ?critical=true          (только 401/403/5xx)
      ?limit=N                (default: 200, max: 500)

    DELETE /           — очистить все логи текущего пользователя
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    user_id = get_user_id(event)

    if not user_id:
        return err("Не авторизован", 401)

    conn = get_conn()
    cur = conn.cursor()

    # ── GET / — получить логи ─────────────────────────────────────────
    if method == "GET":
        platform = (qs.get("platform") or "all").lower()
        try:
            period = int(qs.get("period") or 30)
        except ValueError:
            period = 30
        critical = qs.get("critical", "").lower() == "true"
        try:
            limit = min(int(qs.get("limit") or 200), 500)
        except ValueError:
            limit = 200

        # Строим WHERE-условия
        conditions = [
            f"user_id = '{user_id}'",
            f"created_at >= NOW() - INTERVAL '{period} days'",
        ]
        if platform != "all":
            conditions.append(f"platform = '{platform}'")
        if critical:
            conditions.append("(status_code IN (401, 403) OR status_code >= 500)")

        where = " AND ".join(conditions)

        cur.execute(
            f"""SELECT id, platform, endpoint, status_code, error, created_at
                FROM {SCHEMA}.api_logs
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT {limit}"""
        )
        rows = cur.fetchall()

        # Считаем общее кол-во по фильтрам (без limit)
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.api_logs WHERE {where}")
        total = cur.fetchone()[0]

        logs = [
            {
                "id": str(r[0]),
                "platform": r[1],
                "endpoint": r[2],
                "status_code": r[3],
                "error": r[4],
                "created_at": str(r[5]),
            }
            for r in rows
        ]

        # Краткая статистика
        cur.execute(
            f"""SELECT
                    COUNT(*) FILTER (WHERE status_code = 401 OR status_code = 403) AS auth_errors,
                    COUNT(*) FILTER (WHERE status_code = 429) AS rate_limit,
                    COUNT(*) FILTER (WHERE status_code >= 500) AS server_errors
                FROM {SCHEMA}.api_logs
                WHERE {where}"""
        )
        stats_row = cur.fetchone()
        stats = {
            "auth_errors": int(stats_row[0]),
            "rate_limit": int(stats_row[1]),
            "server_errors": int(stats_row[2]),
        }

        cur.close()
        conn.close()
        return ok({"logs": logs, "total": total, "stats": stats})

    # ── DELETE / — очистить логи пользователя ─────────────────────────
    elif method == "DELETE":
        cur.execute(
            f"DELETE FROM {SCHEMA}.api_logs WHERE user_id = '{user_id}'"
        )
        deleted = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        return ok({"deleted": deleted, "ok": True})

    cur.close()
    conn.close()
    return err("Метод не поддерживается", 405)
