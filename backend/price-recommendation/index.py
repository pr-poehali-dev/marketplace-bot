import json
import os
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

# Пороговые значения
MARGIN_TARGET = 20.0       # целевая маржа %
LOW_SALES_THRESHOLD = 50   # продаж/мес — считаем «мало»
PRICE_INCREASE_STEP = 0.10  # +10% если маржа низкая
PRICE_DECREASE_STEP = 0.07  # -7% если продажи низкие


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


def calc_profit(price: float, cost_price: float, commission_pct: float, logistics_cost: float) -> float:
    commission = price * (commission_pct / 100)
    return price - cost_price - commission - logistics_cost


def calc_margin(price: float, profit: float) -> float:
    return (profit / price * 100) if price > 0 else 0.0


def recommend(product: dict) -> dict:
    """
    Логика рекомендации цены для одного товара.

    Правила (применяются по приоритету):
    1. margin < MARGIN_TARGET  → увеличить цену на PRICE_INCREASE_STEP
    2. sales < LOW_SALES_THRESHOLD → снизить цену на PRICE_DECREASE_STEP
    3. Иначе → цена оптимальна
    """
    price        = float(product["current_price"])
    cost_price   = float(product["cost_price"])
    commission   = float(product["commission_pct"])
    logistics    = float(product["logistics_cost"])
    sales        = int(product["sales"])

    profit = calc_profit(price, cost_price, commission, logistics)
    margin = calc_margin(price, profit)

    # Правило 1: маржа ниже целевой
    if margin < MARGIN_TARGET:
        # Ищем цену при которой маржа станет MARGIN_TARGET
        # profit_needed = price_new * MARGIN_TARGET / 100
        # price_new - cost - price_new * comm/100 - logistics = price_new * MARGIN_TARGET/100
        # price_new * (1 - comm/100 - MARGIN_TARGET/100) = cost + logistics
        denom = 1 - commission / 100 - MARGIN_TARGET / 100
        if denom > 0:
            target_price = round((cost_price + logistics) / denom, -1)  # округляем до 10 ₽
        else:
            target_price = round(price * (1 + PRICE_INCREASE_STEP), -1)

        # Не предлагаем цену ниже текущей в этом правиле
        target_price = max(target_price, price * 1.02)
        target_price = round(target_price / 10) * 10  # кратно 10

        new_profit = calc_profit(target_price, cost_price, commission, logistics)
        new_margin = calc_margin(target_price, new_profit)

        return {
            "action": "increase",
            "recommended_price": target_price,
            "current_price": price,
            "current_margin": round(margin, 1),
            "expected_margin": round(new_margin, 1),
            "reason": f"Маржа {margin:.1f}% ниже цели {MARGIN_TARGET}%. "
                      f"Рекомендуем поднять цену до {int(target_price):,} ₽ → маржа станет {new_margin:.1f}%".replace(",", " "),
        }

    # Правило 2: мало продаж
    if sales < LOW_SALES_THRESHOLD:
        target_price = round(price * (1 - PRICE_DECREASE_STEP) / 10) * 10
        target_price = max(target_price, cost_price * 1.05)  # не ниже себестоимости + 5%

        new_profit = calc_profit(target_price, cost_price, commission, logistics)
        new_margin = calc_margin(target_price, new_profit)

        return {
            "action": "decrease",
            "recommended_price": target_price,
            "current_price": price,
            "current_margin": round(margin, 1),
            "expected_margin": round(new_margin, 1),
            "reason": f"Продаж {sales} — ниже порога {LOW_SALES_THRESHOLD}. "
                      f"Рекомендуем снизить цену до {int(target_price):,} ₽ для роста спроса.".replace(",", " "),
        }

    # Правило 3: всё ок
    return {
        "action": "keep",
        "recommended_price": price,
        "current_price": price,
        "current_margin": round(margin, 1),
        "expected_margin": round(margin, 1),
        "reason": f"Цена оптимальна. Маржа {margin:.1f}%, продаж {sales} — в норме.",
    }


def handler(event: dict, context) -> dict:
    """
    Рекомендации по цене для всех товаров пользователя.
    GET /price-recommendation
    Возвращает список { sku, name, recommended_price, reason, action, current_margin, expected_margin }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    if event.get("httpMethod") != "GET":
        return {"statusCode": 405, "headers": CORS,
                "body": json.dumps({"error": "Только GET"}, ensure_ascii=False)}

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = require_auth(cur, event)
        if not user_id:
            return {"statusCode": 401, "headers": CORS,
                    "body": json.dumps({"error": "Не авторизован"}, ensure_ascii=False)}

        # Берём товары пользователя с применёнными ценами
        cur.execute(
            f"""SELECT p.sku, p.name, p.platform,
                       COALESCE(ap.price, p.current_price) AS current_price,
                       p.cost_price, p.commission_pct, p.logistics_cost, p.sales
                FROM {SCHEMA}.products p
                LEFT JOIN {SCHEMA}.applied_prices ap
                       ON ap.user_id = p.user_id AND ap.sku = p.sku
                WHERE p.user_id = %s
                ORDER BY p.revenue DESC""",
            (user_id,),
        )
        cols = ["sku", "name", "platform", "current_price",
                "cost_price", "commission_pct", "logistics_cost", "sales"]
        products = [dict(zip(cols, r)) for r in cur.fetchall()]

        recommendations = []
        for p in products:
            rec = recommend(p)
            recommendations.append({
                "sku":               p["sku"],
                "name":              p["name"],
                "platform":          p["platform"],
                "action":            rec["action"],
                "recommended_price": rec["recommended_price"],
                "current_price":     rec["current_price"],
                "current_margin":    rec["current_margin"],
                "expected_margin":   rec["expected_margin"],
                "reason":            rec["reason"],
            })

        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"recommendations": recommendations}, ensure_ascii=False, default=float),
        }

    finally:
        cur.close()
        conn.close()
