"""
WB API client с обработкой ошибок и логированием в api_logs.
"""
import json
import time
import urllib.request
import urllib.error

SCHEMA = "t_p37499172_marketplace_bot"


class WBAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, user_message: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.user_message = user_message or message


def _classify_error(status_code: int, body: str) -> str:
    if status_code == 401:
        return "Неверный API-токен Wildberries. Проверьте настройки интеграции."
    if status_code == 403:
        return "Доступ запрещён. Проверьте разрешения токена в кабинете WB."
    if status_code == 429:
        return "Слишком много запросов к Wildberries API. Попробуйте позже."
    if status_code == 422:
        return "WB отклонил данные — проверьте корректность цены."
    if status_code >= 500:
        return f"Внутренняя ошибка Wildberries API (код {status_code}). Попробуйте позже."
    try:
        data = json.loads(body)
        msg = data.get("message") or data.get("errorText") or data.get("error") or ""
        if msg:
            return f"WB API: {msg}"
    except Exception:
        pass
    return f"Ошибка Wildberries API (код {status_code})."


def log_error(conn, user_id, endpoint: str, status_code: int, error: str, request_body: str = "") -> None:
    try:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO {SCHEMA}.api_logs
                (user_id, platform, endpoint, status_code, error, request_body)
                VALUES (%s, 'wb', %s, %s, %s, %s)""",
            (user_id, endpoint, status_code, error[:2000], request_body[:500]),
        )
        conn.commit()
        cur.close()
    except Exception:
        pass


def wb_post(url: str, payload: dict, api_token: str, *,
            conn=None, user_id=None, retries: int = 0,
            retry_on: tuple = (429, 500, 502, 503, 504)) -> dict:
    """
    POST-запрос к WB API с retry на 429/5xx и логированием.
    Бросает WBAPIError при ошибке.
    """
    request_body = json.dumps(payload, ensure_ascii=False)
    data = request_body.encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Authorization": api_token,
            "Content-Type":  "application/json",
        },
    )

    last_error = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                body_text = resp.read().decode()
                try:
                    return json.loads(body_text) if body_text else {}
                except Exception:
                    return {"raw": body_text}
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            user_msg = _classify_error(e.code, body)
            tech_msg = f"HTTP {e.code}: {body[:300]}"
            if conn:
                log_error(conn, user_id, url, e.code, tech_msg, request_body[:500])
            last_error = WBAPIError(tech_msg, e.code, user_msg)
            if e.code not in retry_on:
                raise last_error
            if attempt < retries:
                time.sleep(2 ** attempt)
        except Exception as exc:
            tech_msg = str(exc)
            if conn:
                log_error(conn, user_id, url, 0, tech_msg, request_body[:500])
            last_error = WBAPIError(tech_msg, 0, "Ошибка соединения с Wildberries API.")
            if attempt < retries:
                time.sleep(2 ** attempt)

    raise last_error
