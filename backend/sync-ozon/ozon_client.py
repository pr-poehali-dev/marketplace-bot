"""
Ozon API client с единой обработкой ошибок и логированием.
Используется из sync-ozon и других функций.
"""
import json
import time
import urllib.request
import urllib.error

SCHEMA = "t_p37499172_marketplace_bot"


class OzonAPIError(Exception):
    """Базовая ошибка Ozon API с понятным сообщением для пользователя."""
    def __init__(self, message: str, status_code: int = 0, user_message: str = ""):
        super().__init__(message)
        self.status_code = status_code
        # user_message — строка для показа пользователю (на русском)
        self.user_message = user_message or message


def _classify_error(status_code: int, body: str) -> str:
    """Возвращает понятное сообщение об ошибке по HTTP-коду."""
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
    # Пытаемся достать message из тела
    try:
        data = json.loads(body)
        msg = data.get("message") or data.get("error") or ""
        if msg:
            return f"Ozon API: {msg}"
    except Exception:
        pass
    return f"Ошибка Ozon API (код {status_code})."


def log_error(conn, user_id: str | None, endpoint: str, status_code: int,
              error: str, request_body: str = "") -> None:
    """Записывает ошибку в таблицу api_logs. Не бросает исключений."""
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
        pass   # логирование не должно ломать основной поток


def ozon_post(
    path: str,
    payload: dict,
    client_id: str,
    api_key: str,
    *,
    conn=None,
    user_id: str | None = None,
    retries: int = 0,
    retry_on: tuple[int, ...] = (429, 500, 502, 503, 504),
) -> dict:
    """
    POST-запрос к Ozon Seller API.

    Параметры:
      path       — путь, например "/v2/product/list"
      payload    — тело запроса (dict → JSON)
      conn       — psycopg2 connection для логирования (опционально)
      user_id    — UUID пользователя для логирования (опционально)
      retries    — кол-во повторных попыток (0 = без retry)
      retry_on   — коды HTTP, при которых делать retry

    Бросает OzonAPIError при ошибке.
    """
    url = f"https://api-seller.ozon.ru{path}"
    request_body = json.dumps(payload, ensure_ascii=False)
    data = request_body.encode()

    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Client-Id":    client_id,
            "Api-Key":      api_key,
        },
    )

    last_error: OzonAPIError | None = None

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

            # Не ретраим 4xx (кроме 429)
            if e.code not in retry_on:
                raise last_error

            if attempt < retries:
                # Exponential backoff: 1s, 2s, 4s...
                time.sleep(2 ** attempt)

        except Exception as exc:
            tech_msg = str(exc)
            if conn:
                log_error(conn, user_id, path, 0, tech_msg, request_body[:500])
            last_error = OzonAPIError(tech_msg, 0, "Ошибка соединения с Ozon API.")
            if attempt < retries:
                time.sleep(2 ** attempt)

    raise last_error  # type: ignore
