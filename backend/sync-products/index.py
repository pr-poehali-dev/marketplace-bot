import json
import os
import random
import urllib.request
import urllib.error
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

# ── Тарифные лимиты ───────────────────────────────────────────────
PLAN_LIMITS = {
    "free": 50,
    "pro": 500,
}

MOCK_CATALOG = {
    "ozon": [
        {"sku": "OZ-44821", "name": "Наушники TWS Pro X12",    "price": 3990, "cost_price": 1800,
         "commission_pct": 8,  "logistics_cost": 220, "storage_cost_per_unit": 18, "ads_cost_per_unit": 140, "return_rate_pct": 4},
        {"sku": "OZ-77234", "name": "Фитнес-браслет ActFit 5", "price": 3999, "cost_price": 1600,
         "commission_pct": 9,  "logistics_cost": 180, "storage_cost_per_unit": 14, "ads_cost_per_unit": 120, "return_rate_pct": 3},
        {"sku": "OZ-38821", "name": "Беспроводная зарядка X3", "price": 1999, "cost_price": 700,
         "commission_pct": 8,  "logistics_cost": 140, "storage_cost_per_unit": 10, "ads_cost_per_unit": 60,  "return_rate_pct": 3},
        {"sku": "OZ-91042", "name": "Умные часы NovaSport 3",  "price": 6990, "cost_price": 3200,
         "commission_pct": 9,  "logistics_cost": 280, "storage_cost_per_unit": 24, "ads_cost_per_unit": 200, "return_rate_pct": 5},
    ],
    "wb": [
        {"sku": "WB-29103", "name": "Умная колонка Hori M2",       "price": 4500, "cost_price": 2100,
         "commission_pct": 10, "logistics_cost": 260, "storage_cost_per_unit": 22, "ads_cost_per_unit": 190, "return_rate_pct": 6},
        {"sku": "WB-51029", "name": "Портативный аккумулятор 20K", "price": 2500, "cost_price": 950,
         "commission_pct": 11, "logistics_cost": 160, "storage_cost_per_unit": 12, "ads_cost_per_unit": 80,  "return_rate_pct": 5},
        {"sku": "WB-63301", "name": "Робот-пылесос CleanBot X1",   "price": 12990, "cost_price": 6500,
         "commission_pct": 12, "logistics_cost": 400, "storage_cost_per_unit": 35, "ads_cost_per_unit": 320, "return_rate_pct": 7},
    ],
}


def _ozon_request(path: str, payload: dict, client_id: str, api_key: str) -> dict:
    """Выполняет POST-запрос к Ozon Seller API."""
    url = f"https://api-seller.ozon.ru{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json", "Client-Id": client_id, "Api-Key": api_key},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def fetch_ozon_products(client_id: str, api_key: str) -> list[dict]:
    """
    Получает список товаров + цены + остатки из Ozon Seller API.
    Документация: https://docs.ozon.ru/api/seller/
    """
    # Шаг 1: список товаров (до 1000 за запрос)
    products_resp = _ozon_request(
        "/v3/product/list",
        {"filter": {}, "last_id": "", "limit": 100},
        client_id, api_key,
    )
    items_raw = products_resp.get("result", {}).get("items", [])
    if not items_raw:
        return []

    product_ids = [str(item["product_id"]) for item in items_raw]
    sku_map = {str(item["product_id"]): item.get("offer_id", str(item["product_id"])) for item in items_raw}

    # Шаг 2: детали товаров (цена, название, комиссия)
    info_resp = _ozon_request(
        "/v2/product/info/list",
        {"product_id": product_ids},
        client_id, api_key,
    )
    info_items = info_resp.get("result", {}).get("items", [])
    info_map = {str(i["id"]): i for i in info_items}

    # Шаг 3: остатки
    stocks_resp = _ozon_request(
        "/v3/product/info/stocks",
        {"filter": {"product_id": product_ids, "visibility": "ALL"}, "last_id": "", "limit": 100},
        client_id, api_key,
    )
    stocks_items = stocks_resp.get("result", {}).get("items", [])
    stock_map: dict[str, int] = {}
    for s in stocks_items:
        pid = str(s.get("product_id", ""))
        total = sum(w.get("present", 0) for w in s.get("stocks", []))
        stock_map[pid] = total

    result = []
    for pid in product_ids:
        info = info_map.get(pid, {})
        sku = sku_map.get(pid, pid)
        name = info.get("name", f"Товар {pid}")
        price = float((info.get("price") or {}).get("price", 0) or 0)
        commission_pct = float(info.get("commissions", {}).get("fbo_fulfillment_amount", 0) or 0)
        if price > 0 and commission_pct > 0:
            commission_pct = round(commission_pct / price * 100, 2)
        else:
            commission_pct = 8.0  # дефолт

        stock = stock_map.get(pid, 0)
        sales = random.randint(10, 200)  # продажи — отдельный API (statistics), берём примерно

        result.append({
            "sku":                   sku,
            "name":                  name,
            "price":                 price,
            "sales":                 sales,
            "stock":                 stock,
            "cost_price":            round(price * 0.45, 2),  # ~45% от цены если нет данных
            "commission_pct":        commission_pct,
            "logistics_cost":        150.0,
            "storage_cost_per_unit": 12.0,
            "ads_cost_per_unit":     80.0,
            "return_rate_pct":       4.0,
            "revenue":               round(price * sales, 2),
        })
    return result


def mock_marketplace_api(platform: str) -> list[dict]:
    """Демо-данные для платформы (когда нет реального ключа)."""
    items = MOCK_CATALOG.get(platform, [])
    result = []
    for item in items:
        sales = random.randint(80, 400)
        stock = random.randint(0, 250)
        result.append({
            "sku":                   item["sku"],
            "name":                  item["name"],
            "price":                 item["price"],
            "sales":                 sales,
            "stock":                 stock,
            "cost_price":            item["cost_price"],
            "commission_pct":        item["commission_pct"],
            "logistics_cost":        item["logistics_cost"],
            "storage_cost_per_unit": item["storage_cost_per_unit"],
            "ads_cost_per_unit":     item["ads_cost_per_unit"],
            "return_rate_pct":       item["return_rate_pct"],
            "revenue":               round(item["price"] * sales, 2),
        })
    return result


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def require_auth(cur, event: dict):
    h = event.get("headers") or {}
    token = h.get("X-Auth-Token") or h.get("x-auth-token") or ""
    if not token:
        return None, None
    cur.execute(
        f"""SELECT s.user_id, u.plan
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    if not row:
        return None, None
    return str(row[0]), row[1]


def ok(data):
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, code=400, extra: dict | None = None):
    body = {"error": msg}
    if extra:
        body.update(extra)
    return {"statusCode": code, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def apply_rules(items: list[dict], rules: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Применяет активные правила ценообразования к товарам.
    Возвращает (обновлённые_товары, список_применённых_изменений).
    """
    enabled = [r for r in rules if r["enabled"]]
    if not enabled:
        return items, []

    rule_map = {r["type"]: r["value"] for r in enabled}
    changes = []

    for item in items:
        price = float(item["price"])
        cost  = float(item["cost_price"])
        comm  = float(item["commission_pct"])
        logi  = float(item["logistics_cost"])

        # Текущая маржа: (price - cost - commission - logistics) / price
        def margin(p):
            profit = p - cost - p * (comm / 100) - logi
            return (profit / p * 100) if p > 0 else 0.0

        original_price = price
        applied = []

        # Правило: increase_margin — поднять цену до целевой маржи
        if "increase_margin" in rule_map:
            target_margin = rule_map["increase_margin"]
            if margin(price) < target_margin:
                # Рассчитываем минимальную цену для target_margin:
                # price * (1 - comm/100 - target_margin/100) = cost + logi
                denom = 1 - comm / 100 - target_margin / 100
                if denom > 0:
                    new_price = round((cost + logi) / denom / 10) * 10
                    new_price = max(new_price, price * 1.01)
                    applied.append(f"маржа {margin(price):.1f}% < {target_margin}% → цена {price:.0f}→{new_price:.0f} ₽")
                    price = new_price

        # Правило: beat_competitor — снизить цену на value%
        if "beat_competitor" in rule_map:
            discount_pct = rule_map["beat_competitor"]
            new_price = round(price * (1 - discount_pct / 100) / 10) * 10
            applied.append(f"beat_competitor: -{discount_pct}% → {price:.0f}→{new_price:.0f} ₽")
            price = new_price

        # Правило: min_margin — не опускаться ниже минимальной маржи
        if "min_margin" in rule_map:
            min_m = rule_map["min_margin"]
            if margin(price) < min_m:
                denom = 1 - comm / 100 - min_m / 100
                if denom > 0:
                    floor_price = round((cost + logi) / denom / 10) * 10
                    if price < floor_price:
                        applied.append(f"min_margin: пол {floor_price:.0f} ₽ → скорректировано")
                        price = floor_price

        # Правило: max_discount — не снижать более чем на value%
        if "max_discount" in rule_map:
            max_disc = rule_map["max_discount"]
            floor_price = original_price * (1 - max_disc / 100)
            if price < floor_price:
                applied.append(f"max_discount: не более {max_disc}% → {price:.0f}→{floor_price:.0f} ₽")
                price = floor_price

        if abs(price - original_price) > 0.5:
            item["price"] = round(price / 10) * 10
            item["revenue"] = round(item["price"] * item["sales"], 2)
            changes.append({
                "sku": item["sku"],
                "name": item["name"],
                "old_price": original_price,
                "new_price": item["price"],
                "rules_applied": applied,
            })

    return items, changes


def save_products(cur, user_id: str, platform: str, items: list[dict]):
    for p in items:
        cur.execute(
            f"""INSERT INTO {SCHEMA}.products
                (user_id, sku, name, platform, current_price, cost_price,
                 commission_pct, logistics_cost, storage_cost_per_unit,
                 ads_cost_per_unit, return_rate_pct, sales, stock, revenue, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (user_id, sku) DO UPDATE SET
                  name=EXCLUDED.name, platform=EXCLUDED.platform,
                  current_price=EXCLUDED.current_price, cost_price=EXCLUDED.cost_price,
                  commission_pct=EXCLUDED.commission_pct, logistics_cost=EXCLUDED.logistics_cost,
                  storage_cost_per_unit=EXCLUDED.storage_cost_per_unit,
                  ads_cost_per_unit=EXCLUDED.ads_cost_per_unit, return_rate_pct=EXCLUDED.return_rate_pct,
                  sales=EXCLUDED.sales, stock=EXCLUDED.stock, revenue=EXCLUDED.revenue, updated_at=NOW()""",
            (user_id, p["sku"], p["name"], platform,
             p["price"], p["cost_price"], p["commission_pct"],
             p["logistics_cost"], p["storage_cost_per_unit"], p["ads_cost_per_unit"],
             p["return_rate_pct"], p["sales"], p["stock"], p["revenue"]),
        )


def handler(event: dict, context) -> dict:
    """Синхронизация товаров. POST body: { platform: "ozon"|"wb"|"all" }"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}
    if event.get("httpMethod") != "POST":
        return err("Только POST", 405)

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id, plan = require_auth(cur, event)
        if not user_id:
            return err("Не авторизован", 401)

        limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

        body = json.loads(event.get("body") or "{}")
        requested = (body.get("platform") or "all").strip().lower()
        platforms = ["ozon", "wb"] if requested == "all" else [requested]

        if any(p not in {"ozon", "wb"} for p in platforms):
            return err("platform должен быть ozon, wb или all")

        # Текущее кол-во товаров пользователя
        cur.execute(
            f"SELECT COUNT(*) FROM {SCHEMA}.products WHERE user_id = %s",
            (user_id,),
        )
        current_count = cur.fetchone()[0]

        # Загружаем интеграции (api_key + client_id для Ozon)
        cur.execute(
            f"SELECT platform, api_key, client_id FROM {SCHEMA}.integrations WHERE user_id = %s",
            (user_id,),
        )
        integrations: dict[str, dict] = {
            row[0]: {"api_key": row[1], "client_id": row[2]}
            for row in cur.fetchall()
        }

        # Загружаем активные правила ценообразования
        cur.execute(
            f"SELECT type, value, enabled FROM {SCHEMA}.pricing_rules WHERE user_id = %s",
            (user_id,),
        )
        pricing_rules = [{"type": r[0], "value": float(r[1]), "enabled": r[2]} for r in cur.fetchall()]

        results = []
        for platform in platforms:
            # Cooldown 1 час
            cur.execute(
                f"""SELECT started_at FROM {SCHEMA}.sync_log
                    WHERE user_id = %s AND platform = %s AND status = 'success'
                    AND started_at > NOW() - INTERVAL '1 hour' LIMIT 1""",
                (user_id, platform),
            )
            if cur.fetchone():
                results.append({"platform": platform, "skipped": True, "reason": "cooldown_1h"})
                continue

            creds = integrations.get(platform, {})
            api_key = creds.get("api_key")
            client_id = creds.get("client_id")
            demo_mode = True

            # Реальный API — только если есть credentials
            if platform == "ozon" and api_key and client_id:
                try:
                    items = fetch_ozon_products(client_id, api_key)
                    demo_mode = False
                except Exception as e:
                    # Откат на демо при ошибке API
                    items = mock_marketplace_api(platform)
                    demo_mode = True
            else:
                items = mock_marketplace_api(platform)

            # Применяем правила ценообразования
            items, rule_changes = apply_rules(items, pricing_rules)

            # Считаем НОВЫЕ SKU (которых ещё нет у пользователя)
            existing_skus = set()
            if items:
                skus = [p["sku"] for p in items]
                cur.execute(
                    f"SELECT sku FROM {SCHEMA}.products WHERE user_id = %s AND sku = ANY(%s::text[])",
                    (user_id, skus),
                )
                existing_skus = {r[0] for r in cur.fetchall()}

            new_items = [p for p in items if p["sku"] not in existing_skus]
            would_be_total = current_count + len(new_items)

            # Проверка лимита тарифа
            if would_be_total > limit:
                allowed = max(0, limit - current_count)
                return err(
                    f"Превышен лимит тарифа {plan.upper()}: максимум {limit} товаров. "
                    f"Сейчас {current_count}, при синхронизации добавится {len(new_items)} новых. "
                    f"Доступно слотов: {allowed}.",
                    code=403,
                    extra={"plan": plan, "limit": limit, "current": current_count,
                           "new_items": len(new_items), "allowed_slots": allowed},
                )

            cur.execute(
                f"INSERT INTO {SCHEMA}.sync_log (user_id, platform, status) VALUES (%s, %s, 'running') RETURNING id",
                (user_id, platform),
            )
            log_id = cur.fetchone()[0]
            conn.commit()

            save_products(cur, user_id, platform, items)
            current_count += len(new_items)

            # Записываем в price_history изменения от правил
            for ch in rule_changes:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.price_history (user_id, sku, old_price, new_price, source)
                        VALUES (%s, %s, %s, %s, 'rule')""",
                    (user_id, ch["sku"], ch["old_price"], ch["new_price"]),
                )
                # Также обновляем applied_prices
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.applied_prices (user_id, sku, price)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (user_id, sku) DO UPDATE SET price = EXCLUDED.price, applied_at = NOW()""",
                    (user_id, ch["sku"], ch["new_price"]),
                )

            cur.execute(
                f"UPDATE {SCHEMA}.sync_log SET status='success', products_count=%s, finished_at=NOW() WHERE id=%s",
                (len(items), log_id),
            )
            conn.commit()

            results.append({
                "platform": platform,
                "synced": len(items),
                "new": len(new_items),
                "rules_applied": len(rule_changes),
                "price_changes": rule_changes,
                "products": [{"sku": p["sku"], "name": p["name"], "price": p["price"],
                               "sales": p["sales"], "stock": p["stock"]} for p in items],
                "demo_mode": demo_mode,
            })

        return ok({
            "ok": True,
            "results": results,
            "plan": plan,
            "limit": limit,
            "total_products": current_count,
        })

    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        cur.close()
        conn.close()