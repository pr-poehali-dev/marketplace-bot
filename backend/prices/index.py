import json
import os
import time
import urllib.request
import urllib.error
from utils import get_conn, require_auth, get_token, cors_headers, SCHEMA


# ── Ozon price push ────────────────────────────────────────────────

def get_ozon_creds(cur, user_id: str):
    """Возвращает (client_id, api_key) или (None, None)."""
    cur.execute(
        f"SELECT client_id, api_key FROM {SCHEMA}.integrations WHERE user_id = %s AND platform = 'ozon'",
        (user_id,),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def push_price_to_ozon(client_id: str, api_key: str, sku: str, price: float, retries: int = 1) -> dict:
    """
    POST /v1/product/import/prices
    Устанавливает цену товара на Ozon.
    retries=1 → одна повторная попытка при ошибке сети/5xx.

    Ответ успеха:
      { "result": [{ "offer_id": "...", "updated": true, "errors": [] }] }
    Ответ ошибки позиции:
      { "result": [{ "offer_id": "...", "updated": false, "errors": [{"code": "...", "message": "..."}] }] }
    """
    url = "https://api-seller.ozon.ru/v1/product/import/prices"
    payload = json.dumps({
        "prices": [
            {
                "offer_id":   sku,
                "price":      str(int(price)),       # Ozon принимает строку без копеек
                "old_price":  "0",                   # 0 = не показывать зачёркнутую цену
                "price_strategy_enabled": False,
            }
        ]
    }).encode()

    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Content-Type": "application/json",
            "Client-Id":    client_id,
            "Api-Key":      api_key,
        },
    )

    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = json.loads(resp.read().decode())
                results = body.get("result", [])
                if not results:
                    return {"ok": False, "error": "Ozon вернул пустой результат"}

                item = results[0]
                if item.get("updated"):
                    return {"ok": True, "offer_id": item["offer_id"]}

                # Ошибки на уровне позиции (не HTTP)
                errors = item.get("errors", [])
                msg = "; ".join(e.get("message", e.get("code", "unknown")) for e in errors)
                return {"ok": False, "error": msg or "Ozon отклонил изменение цены"}

        except urllib.error.HTTPError as e:
            body_text = e.read().decode(errors="ignore")
            last_exc = RuntimeError(f"HTTP {e.code}: {body_text[:200]}")
            if e.code < 500:          # 4xx — не ретраим
                break
            if attempt < retries:
                time.sleep(1)

        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                time.sleep(1)

    return {"ok": False, "error": str(last_exc)}


# ── Handler ────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Цены пользователя.

    GET  /                       — текущие applied_prices
    GET  /?action=history&sku=X  — история цен по товару
    POST /                       — сохранить цену локально  {sku, price, source?}
    POST /?action=push-ozon      — отправить цену в Ozon API + сохранить {sku, price}
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    token  = get_token(event)
    qs     = event.get("queryStringParameters") or {}

    def ok(data):
        return {"statusCode": 200, "headers": cors_headers(),
                "body": json.dumps(data, ensure_ascii=False, default=str)}

    def err(msg, code=400):
        return {"statusCode": code, "headers": cors_headers(),
                "body": json.dumps({"error": msg}, ensure_ascii=False)}

    conn = get_conn(os.environ["DATABASE_URL"])
    cur  = conn.cursor()
    try:
        user_id = require_auth(cur, token)
        if not user_id:
            return err("Не авторизован", 401)

        # ── GET ?action=history ───────────────────────────────────────
        if method == "GET" and qs.get("action") == "history":
            sku = qs.get("sku", "").strip()
            if not sku:
                return err("Нужен параметр sku")
            cur.execute(
                f"""SELECT id, sku, old_price, new_price, source, created_at
                    FROM {SCHEMA}.price_history
                    WHERE user_id = %s AND sku = %s
                    ORDER BY created_at DESC LIMIT 50""",
                (user_id, sku),
            )
            return ok({"history": [
                {"id": str(r[0]), "sku": r[1], "old_price": float(r[2]),
                 "new_price": float(r[3]), "source": r[4], "created_at": str(r[5])}
                for r in cur.fetchall()
            ], "sku": sku})

        # ── GET / — все applied_prices ────────────────────────────────
        elif method == "GET":
            cur.execute(
                f"SELECT sku, price, applied_at FROM {SCHEMA}.applied_prices WHERE user_id = %s",
                (user_id,),
            )
            return ok({"prices": {
                r[0]: {"price": float(r[1]), "applied_at": str(r[2])}
                for r in cur.fetchall()
            }})

        # ── POST ?action=push-ozon — отправить цену в Ozon ───────────
        elif method == "POST" and qs.get("action") == "push-ozon":
            body = json.loads(event.get("body") or "{}")
            sku   = (body.get("sku") or "").strip()
            price = body.get("price")

            if not sku or price is None:
                return err("Нужны sku и price")
            price = float(price)
            if price <= 0:
                return err("Цена должна быть больше 0")

            # Проверяем что товар принадлежит пользователю и платформа — Ozon
            cur.execute(
                f"SELECT platform FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s",
                (user_id, sku),
            )
            row = cur.fetchone()
            if not row:
                return err("Товар не найден", 404)
            if row[0].lower() != "ozon":
                return err(f"Товар {sku} не является товаром Ozon (платформа: {row[0]})", 400)

            # Берём credentials
            client_id, api_key = get_ozon_creds(cur, user_id)
            if not client_id or not api_key:
                return err("Интеграция Ozon не настроена. Добавьте ключи в Настройки.", 400)

            # Читаем старую цену
            cur.execute(
                f"""SELECT COALESCE(
                        (SELECT price FROM {SCHEMA}.applied_prices WHERE user_id = %s AND sku = %s),
                        (SELECT current_price FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s),
                        0)""",
                (user_id, sku, user_id, sku),
            )
            old_price = float((cur.fetchone() or [0])[0])

            # Отправляем в Ozon (с 1 retry)
            result = push_price_to_ozon(client_id, api_key, sku, price, retries=1)

            if not result["ok"]:
                return err(f"Ozon API: {result['error']}", 502)

            # Сохраняем в applied_prices
            cur.execute(
                f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, sku) DO UPDATE
                    SET price = EXCLUDED.price, applied_at = NOW()""",
                (user_id, sku, price),
            )

            # Записываем историю
            if abs(price - old_price) > 0.001:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.price_history (user_id, sku, old_price, new_price, source)
                        VALUES (%s, %s, %s, %s, 'ozon_push')""",
                    (user_id, sku, old_price, price),
                )

            conn.commit()
            return ok({
                "ok":              True,
                "sku":             sku,
                "price":           price,
                "old_price":       old_price,
                "ozon_updated":    True,
                "history_recorded": abs(price - old_price) > 0.001,
            })

        # ── POST / — сохранить цену локально ─────────────────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            sku    = (body.get("sku") or "").strip()
            price  = body.get("price")
            source = (body.get("source") or "manual").strip()

            if not sku or price is None:
                return err("Нужны sku и price")
            price = float(price)
            if price <= 0:
                return err("Цена должна быть больше 0")

            cur.execute(
                f"""SELECT COALESCE(
                        (SELECT price FROM {SCHEMA}.applied_prices WHERE user_id = %s AND sku = %s),
                        (SELECT current_price FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s),
                        0)""",
                (user_id, sku, user_id, sku),
            )
            old_price = float((cur.fetchone() or [0])[0])

            cur.execute(
                f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, sku) DO UPDATE
                    SET price = EXCLUDED.price, applied_at = NOW()""",
                (user_id, sku, price),
            )
            if abs(price - old_price) > 0.001:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.price_history (user_id, sku, old_price, new_price, source)
                        VALUES (%s, %s, %s, %s, %s)""",
                    (user_id, sku, old_price, price, source),
                )
            conn.commit()
            return ok({"ok": True, "sku": sku, "price": price,
                       "old_price": old_price, "history_recorded": abs(price - old_price) > 0.001})

        else:
            return err("Не найдено", 404)

    finally:
        cur.close()
        conn.close()
