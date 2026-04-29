"""
Ozon API client с единой обработкой ошибок и логированием.
Копия из sync-ozon/ozon_client.py — используется в prices.
"""
import json
import time
import urllib.request
import urllib.error

SCHEMA = "t_p37499172_marketplace_bot"


class OzonAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, user_message: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.user_message = user_message or message


def _classify_error(status_code: int, body: str) -> str:
    if status_code == 401:
        return "Неверный API ключ или Client-Id. Проверьте настройки интеграции."
    if status_code == 403:
        return "Доступ запрещён. Проверьте права API-ключа в кабинете Ozon."
    if status_code == 429:
        return "Слишком много запросов к Ozon API. Попробуйте позже."
    if status_code == 404:
        return "Ресурс не найден на Ozon. Проверьте offer_id товара."
    if status_code >= 500:
        return f"Внутренняя ошибка Ozon API (код {status_code}). Попробуйте позже."
    try:
        data = json.loads(body)
        msg = data.get("message") or data.get("error") or ""
        if msg:
            return f"Ozon API: {msg}"
    except Exception:
        pass
    return f"Ошибка Ozon API (код {status_code})."


def log_error(conn, user_id, endpoint: str, status_code: int, error: str, request_body: str = "") -> None:
    try:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO {SCHEMA}.api_logs
                (user_id, platform, endpoint, status_code, error, request_body)
                VALUES (%s, 'ozon', %s, %s, %s, %s)""",
            (user_id, endpoint, status_code, error[:2000], request_body[:500]),
        )
        conn.commit()
        cur.close()
    except Exception:
        pass


def ozon_post(path: str, payload: dict, client_id: str, api_key: str, *,
              conn=None, user_id=None, retries: int = 0,
              retry_on: tuple = (429, 500, 502, 503, 504)) -> dict:
    url = f"https://api-seller.ozon.ru{path}"
    request_body = json.dumps(payload, ensure_ascii=False)
    data = request_body.encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json", "Client-Id": client_id, "Api-Key": api_key},
    )
    last_error = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            user_msg = _classify_error(e.code, body)
            tech_msg = f"HTTP {e.code}: {body[:300]}"
            if conn:
                log_error(conn, user_id, path, e.code, tech_msg, request_body[:500])
            last_error = OzonAPIError(tech_msg, e.code, user_msg)
            if e.code not in retry_on:
                raise last_error
            if attempt < retries:
                time.sleep(2 ** attempt)
        except Exception as exc:
            tech_msg = str(exc)
            if conn:
                log_error(conn, user_id, path, 0, tech_msg, request_body[:500])
            last_error = OzonAPIError(tech_msg, 0, "Ошибка соединения с Ozon API.")
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise last_error
