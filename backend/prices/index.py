import json
import os
from utils import get_conn, require_auth, get_token, cors_headers, SCHEMA
from ozon_client import ozon_post, OzonAPIError, log_error
from wb_client import wb_post, WBAPIError


# ── Helpers ────────────────────────────────────────────────────────

def get_wb_token(cur, user_id: str):
    cur.execute(
        f"SELECT api_key FROM {SCHEMA}.integrations WHERE user_id = %s AND platform = 'wb'",
        (user_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def apply_wb_price(user_id: str, sku: str, new_price: float, conn) -> dict:
    """
    Отправляет цену в WB API и сохраняет в БД.

    POST https://discounts-prices-api.wildberries.ru/api/v2/upload/task
    Body: { "data": [{ "nmID": <int>, "price": <int> }] }

    Шаги:
      1. Берёт api_token из integrations
      2. Находит товар в products (user_id, platform='WB', sku)
      3. Запоминает old_price
      4. POST в WB с retry 1 раз на 429/5xx
      5. Upsert applied_prices + UPDATE products.current_price + INSERT price_history

    Бросает WBAPIError при ошибке (с user_message для UI).
    Возвращает { ok, sku, price, old_price, history_recorded }.
    """
    cur = conn.cursor()
    try:
        # 1. Токен
        api_token = get_wb_token(cur, user_id)
        if not api_token:
            raise WBAPIError("WB integration not configured", 0,
                             "Интеграция Wildberries не настроена. Добавьте токен в Настройки → WB.")

        # 2. Проверка товара
        cur.execute(
            f"""SELECT current_price FROM {SCHEMA}.products
                WHERE user_id = %s AND sku = %s AND platform = 'WB'""",
            (user_id, sku),
        )
        prod_row = cur.fetchone()
        if not prod_row:
            raise WBAPIError("WB product not found", 0,
                             f"Товар {sku} не найден среди ваших товаров Wildberries")

        # 3. Запоминаем old_price (приоритет applied_prices > products.current_price)
        cur.execute(
            f"""SELECT COALESCE(
                    (SELECT price FROM {SCHEMA}.applied_prices WHERE user_id = %s AND sku = %s),
                    %s)""",
            (user_id, sku, prod_row[0]),
        )
        old_price = float((cur.fetchone() or [0])[0])

        # 4. nmID должен быть числом
        try:
            nm_id = int(sku)
        except ValueError:
            raise WBAPIError("Invalid nmID", 0,
                             f"SKU {sku} не является числом — для WB nmID должен быть числовым")

        url = "https://discounts-prices-api.wildberries.ru/api/v2/upload/task"
        payload = {
            "data": [
                {"nmID": nm_id, "price": int(new_price)}
            ]
        }

        # Запрос с retry 1 раз на 429/5xx
        wb_post(
            url, payload, api_token,
            conn=conn, user_id=user_id,
            retries=1,
            retry_on=(429, 500, 502, 503, 504),
        )

        # 5. Сохраняем applied_prices
        cur.execute(
            f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, sku) DO UPDATE
                SET price = EXCLUDED.price, applied_at = NOW()""",
            (user_id, sku, new_price),
        )
        # Обновляем products.current_price
        cur.execute(
            f"""UPDATE {SCHEMA}.products
                SET current_price = %s, updated_at = NOW()
                WHERE user_id = %s AND sku = %s AND platform = 'WB'""",
            (new_price, user_id, sku),
        )
        # История
        history_recorded = abs(new_price - old_price) > 0.001
        if history_recorded:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.price_history
                    (user_id, sku, old_price, new_price, source)
                    VALUES (%s, %s, %s, %s, 'wb_push')""",
                (user_id, sku, old_price, new_price),
            )

        conn.commit()
        return {
            "ok":              True,
            "sku":             sku,
            "price":           new_price,
            "old_price":       old_price,
            "wb_updated":      True,
            "history_recorded": history_recorded,
        }
    finally:
        cur.close()


def get_ozon_creds(cur, user_id: str):
    cur.execute(
        f"SELECT client_id, api_key FROM {SCHEMA}.integrations WHERE user_id = %s AND platform = 'ozon'",
        (user_id,),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def push_price_to_ozon(client_id: str, api_key: str, sku: str, price: float, conn=None, user_id=None) -> dict:
    """
    POST /v1/product/import/prices — обновляет цену на Ozon.
    Бросает OzonAPIError при ошибке (с понятным user_message).
    """
    payload = {
        "prices": [{
            "offer_id":               sku,
            "price":                  str(int(price)),
            "old_price":              "0",
            "price_strategy_enabled": False,
        }]
    }

    resp = ozon_post(
        "/v1/product/import/prices",
        payload,
        client_id, api_key,
        conn=conn, user_id=user_id,
        retries=1,
        retry_on=(429, 500, 502, 503, 504),
    )

    results = resp.get("result", [])
    if not results:
        raise OzonAPIError("Ozon вернул пустой результат", 0, "Пустой ответ от Ozon API")

    item = results[0]
    if item.get("updated"):
        return {"ok": True, "offer_id": item["offer_id"]}

    errors = item.get("errors", [])
    msg = "; ".join(e.get("message", e.get("code", "unknown")) for e in errors)
    if conn:
        log_error(conn, user_id, "/v1/product/import/prices", 200,
                  f"updated=false: {msg}", json.dumps(payload))
    raise OzonAPIError(f"updated=false: {msg}", 200, msg or "Ozon отклонил изменение цены")


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

        # ── POST ?action=push-wb ──────────────────────────────────────
        elif method == "POST" and qs.get("action") == "push-wb":
            body = json.loads(event.get("body") or "{}")
            sku       = (body.get("sku") or "").strip()
            new_price = body.get("price")

            if not sku or new_price is None:
                return err("Нужны sku и price")
            try:
                new_price = float(new_price)
            except (TypeError, ValueError):
                return err("price должен быть числом")
            if new_price <= 0:
                return err("Цена должна быть больше 0")

            try:
                result = apply_wb_price(user_id, sku, new_price, conn)
            except WBAPIError as e:
                return err(e.user_message, 502 if e.status_code else 400)

            return ok(result)

        # ── POST ?action=push-ozon ────────────────────────────────────
        elif method == "POST" and qs.get("action") == "push-ozon":
            body = json.loads(event.get("body") or "{}")
            sku   = (body.get("sku") or "").strip()
            price = body.get("price")

            if not sku or price is None:
                return err("Нужны sku и price")
            price = float(price)
            if price <= 0:
                return err("Цена должна быть больше 0")

            cur.execute(
                f"SELECT platform FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s",
                (user_id, sku),
            )
            row = cur.fetchone()
            if not row:
                return err("Товар не найден", 404)
            if row[0].lower() != "ozon":
                return err(f"Товар {sku} не является товаром Ozon (платформа: {row[0]})", 400)

            client_id, api_key = get_ozon_creds(cur, user_id)
            if not client_id or not api_key:
                return err("Интеграция Ozon не настроена. Добавьте ключи в Настройки.", 400)

            cur.execute(
                f"""SELECT COALESCE(
                        (SELECT price FROM {SCHEMA}.applied_prices WHERE user_id = %s AND sku = %s),
                        (SELECT current_price FROM {SCHEMA}.products WHERE user_id = %s AND sku = %s),
                        0)""",
                (user_id, sku, user_id, sku),
            )
            old_price = float((cur.fetchone() or [0])[0])

            try:
                push_price_to_ozon(client_id, api_key, sku, price, conn=conn, user_id=user_id)
            except OzonAPIError as e:
                return err(e.user_message, 502)

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
                        VALUES (%s, %s, %s, %s, 'ozon_push')""",
                    (user_id, sku, old_price, price),
                )
            conn.commit()
            return ok({
                "ok": True, "sku": sku, "price": price,
                "old_price": old_price, "ozon_updated": True,
                "history_recorded": abs(price - old_price) > 0.001,
            })

        # ── POST / — сохранить локально ──────────────────────────────
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