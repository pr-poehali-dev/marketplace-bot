import json
import os
import urllib.request
import urllib.error
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
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
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400):
    return {"statusCode": code, "headers": CORS,
            "body": json.dumps({"error": msg}, ensure_ascii=False)}


# ── Platform verifiers ─────────────────────────────────────────────

def verify_ozon_credentials(client_id: str, api_key: str) -> tuple[bool, str]:
    """
    Проверяет Client-Id + Api-Key через Ozon API.
    POST /v1/category/tree — лёгкий эндпоинт без изменений данных.
    """
    url = "https://api-seller.ozon.ru/v1/category/tree"
    req = urllib.request.Request(
        url,
        data=json.dumps({"language": "RU"}).encode(),
        method="POST",
        headers={"Content-Type": "application/json",
                 "Client-Id": client_id, "Api-Key": api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200, ""
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return False, "Неверный Client-Id или Api-Key"
        if e.code == 403:
            return False, "Доступ запрещён — проверьте права ключа"
        return False, f"Ozon API вернул ошибку {e.code}"
    except Exception as e:
        return False, f"Не удалось подключиться к Ozon API: {e}"


def log_api_error(conn, user_id, endpoint: str, status_code: int, error: str) -> None:
    """Пишет ошибку в api_logs. Не бросает исключений."""
    try:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO {SCHEMA}.api_logs
                (user_id, platform, endpoint, status_code, error)
                VALUES (%s, 'wb', %s, %s, %s)""",
            (user_id, endpoint, status_code, error[:2000]),
        )
        conn.commit()
        cur.close()
    except Exception:
        pass


def verify_wb_token(api_token: str, conn=None, user_id=None) -> tuple[bool, str]:
    """
    Проверяет WB API-токен через Seller API.
    GET /api/v3/warehouses — лёгкий GET-запрос без изменений данных.

    Возвращает (valid, error_message).
    Все ошибки логируются в api_logs.
    """
    endpoint = "/api/v3/warehouses"
    url = "https://marketplace-api.wildberries.ru" + endpoint
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": api_token},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 204), ""

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode(errors="ignore")[:300]
        except Exception:
            pass

        if e.code == 401:
            msg = "Неверный токен Wildberries"
        elif e.code == 403:
            msg = "Доступ запрещён — проверьте разрешения токена в кабинете WB"
        elif e.code == 429:
            msg = "Слишком много запросов WB, попробуйте позже"
        elif e.code >= 500:
            msg = "Wildberries временно недоступен"
        else:
            msg = f"Wildberries API вернул ошибку {e.code}"

        if conn:
            log_api_error(conn, user_id, endpoint, e.code, f"{msg}. Body: {body}")
        return False, msg

    except Exception as e:
        msg = f"Не удалось подключиться к Wildberries API: {e}"
        if conn:
            log_api_error(conn, user_id, endpoint, 0, msg)
        return False, msg


def mask_token(token: str | None) -> str | None:
    """Скрывает токен: первые 4 + **** + последние 4 символа."""
    if not token or len(token) < 9:
        return token
    return token[:4] + "****" + token[-4:]


# ── Handler ────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Интеграции с маркетплейсами.

    GET  /                    — список всех интеграций пользователя
    GET  /?platform=ozon|wb   — интеграция конкретной платформы

    POST /?action=verify      — проверить ключи без сохранения
      body: { platform, api_key, client_id? }
      Ozon: нужны client_id + api_key
      WB:   нужен только api_key (это и есть api_token)

    POST /                    — сохранить/обновить интеграцию
      Ozon body: { platform: "ozon", api_key, client_id }
      WB   body: { platform: "wb",   api_key }   (api_key = api_token)
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        # ── GET /?platform=... — одна интеграция ─────────────────────
        if method == "GET" and qs.get("platform"):
            platform = qs["platform"].lower()
            if platform not in ("ozon", "wb"):
                return err("platform должен быть ozon или wb")

            cur.execute(
                f"""SELECT id, platform,
                           api_key,
                           client_id, created_at, updated_at, last_sync_at
                    FROM {SCHEMA}.integrations
                    WHERE user_id = %s AND platform = %s""",
                (user_id, platform),
            )
            row = cur.fetchone()
            if not row:
                return ok({"integration": None})

            return ok({
                "integration": {
                    "id":              str(row[0]),
                    "platform":        row[1],
                    "api_key_preview": mask_token(row[2]),
                    "client_id":       row[3],            # только для Ozon
                    "created_at":      str(row[4]),
                    "updated_at":      str(row[5]),
                    "last_sync_at":    str(row[6]) if row[6] else None,
                    "connected":       True,
                }
            })

        # ── GET / — список всех ───────────────────────────────────────
        elif method == "GET":
            cur.execute(
                f"""SELECT id, platform, api_key, client_id,
                           created_at, updated_at, last_sync_at
                    FROM {SCHEMA}.integrations
                    WHERE user_id = %s ORDER BY platform""",
                (user_id,),
            )
            integrations = [
                {
                    "id":              str(r[0]),
                    "platform":        r[1],
                    "api_key_preview": mask_token(r[2]),
                    "client_id":       r[3],
                    "created_at":      str(r[4]),
                    "updated_at":      str(r[5]),
                    "last_sync_at":    str(r[6]) if r[6] else None,
                    "connected":       True,
                }
                for r in cur.fetchall()
            ]
            return ok({"integrations": integrations})

        # ── POST /?action=verify — проверить без сохранения ──────────
        elif method == "POST" and qs.get("action") == "verify":
            body = json.loads(event.get("body") or "{}")
            platform  = (body.get("platform") or "").lower()
            api_key   = (body.get("api_key") or "").strip()
            client_id = (body.get("client_id") or "").strip()

            if platform == "ozon":
                if not client_id or not api_key:
                    return err("Для Ozon нужны client_id и api_key")
                valid, error = verify_ozon_credentials(client_id, api_key)
                return ok({"valid": valid, "error": error if not valid else None})

            elif platform == "wb":
                if not api_key:
                    return err("Для Wildberries нужен api_key (токен)")
                valid, error = verify_wb_token(api_key, conn=conn, user_id=user_id)
                return ok({"valid": valid, "error": error if not valid else None})

            return err(f"Проверка не поддерживается для платформы: {platform}")

        # ── POST / — сохранить/обновить ──────────────────────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            platform  = (body.get("platform") or "").strip().lower()
            api_key   = (body.get("api_key") or "").strip()
            client_id = (body.get("client_id") or "").strip() or None

            if platform not in ("ozon", "wb"):
                return err("platform должен быть ozon или wb")
            if not api_key or len(api_key) < 8:
                return err("api_key обязателен (минимум 8 символов)")

            # Платформо-специфичные проверки
            if platform == "ozon":
                if not client_id:
                    return err("Для Ozon обязателен client_id")
                valid, error = verify_ozon_credentials(client_id, api_key)
                if not valid:
                    return err(f"Проверка Ozon API не прошла: {error}", 422)

            elif platform == "wb":
                valid, error = verify_wb_token(api_key, conn=conn, user_id=user_id)
                if not valid:
                    # Возвращаем точный текст ошибки от WB (без префикса)
                    return err(error, 422)

            cur.execute(
                f"""INSERT INTO {SCHEMA}.integrations (user_id, platform, api_key, client_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, platform) DO UPDATE
                    SET api_key    = EXCLUDED.api_key,
                        client_id  = EXCLUDED.client_id,
                        updated_at = NOW()
                    RETURNING id, platform, client_id, updated_at""",
                (user_id, platform, api_key, client_id),
            )
            row = cur.fetchone()
            conn.commit()

            return ok({
                "ok": True,
                "integration": {
                    "id":        str(row[0]),
                    "platform":  row[1],
                    "client_id": row[2],
                    "updated_at": str(row[3]),
                    "connected": True,
                }
            })

        else:
            return err("Метод не поддерживается", 405)

    finally:
        cur.close()
        conn.close()