import json
import os
import psycopg2

SCHEMA = "t_p37499172_marketplace_bot"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

RULE_TYPES = {
    "increase_margin": {
        "label": "Повысить маржу",
        "description": "Если маржа товара ниже порога — поднять цену на указанный %",
        "value_label": "Целевая маржа (%)",
        "default": 20.0,
    },
    "beat_competitor": {
        "label": "Обойти конкурента",
        "description": "Снизить цену на указанный % если продажи упали ниже порога",
        "value_label": "Снижение цены (%)",
        "default": 5.0,
    },
    "min_margin": {
        "label": "Минимальная маржа",
        "description": "Никогда не опускать цену ниже уровня, при котором маржа < value%",
        "value_label": "Минимальная маржа (%)",
        "default": 10.0,
    },
    "max_discount": {
        "label": "Максимальная скидка",
        "description": "Не снижать цену более чем на value% от базовой",
        "value_label": "Максимальная скидка (%)",
        "default": 15.0,
    },
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


def handler(event: dict, context) -> dict:
    """
    Правила ценообразования пользователя.

    GET  /             — список правил
    POST /             — создать правило  body: {type, value}
    PATCH/?id=UUID     — обновить правило body: {enabled?, value?}
    GET  /?action=types — список доступных типов правил
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

        # ── GET ?action=types — справочник типов ─────────────────────
        if method == "GET" and qs.get("action") == "types":
            return ok({"types": RULE_TYPES})

        # ── GET — список правил пользователя ─────────────────────────
        if method == "GET":
            cur.execute(
                f"""SELECT id, type, value, enabled, created_at, updated_at
                    FROM {SCHEMA}.pricing_rules
                    WHERE user_id = %s
                    ORDER BY created_at""",
                (user_id,),
            )
            rules = [
                {
                    "id":         str(r[0]),
                    "type":       r[1],
                    "value":      float(r[2]),
                    "enabled":    r[3],
                    "created_at": str(r[4]),
                    "updated_at": str(r[5]),
                    "label":      RULE_TYPES.get(r[1], {}).get("label", r[1]),
                    "description":RULE_TYPES.get(r[1], {}).get("description", ""),
                    "value_label":RULE_TYPES.get(r[1], {}).get("value_label", "Значение"),
                }
                for r in cur.fetchall()
            ]
            return ok({"rules": rules})

        # ── POST — создать правило ────────────────────────────────────
        elif method == "POST":
            body = json.loads(event.get("body") or "{}")
            rule_type = (body.get("type") or "").strip()
            value = body.get("value")

            if rule_type not in RULE_TYPES:
                return err(f"Неизвестный тип правила. Доступные: {', '.join(RULE_TYPES)}")
            if value is None:
                return err("Нужно поле value")
            value = float(value)
            if value <= 0:
                return err("value должен быть > 0")

            # Разрешаем только одно правило каждого типа на пользователя
            cur.execute(
                f"SELECT id FROM {SCHEMA}.pricing_rules WHERE user_id = %s AND type = %s",
                (user_id, rule_type),
            )
            if cur.fetchone():
                return err(f"Правило типа '{rule_type}' уже существует. Обновите существующее.")

            cur.execute(
                f"""INSERT INTO {SCHEMA}.pricing_rules (user_id, type, value)
                    VALUES (%s, %s, %s) RETURNING id, type, value, enabled, created_at, updated_at""",
                (user_id, rule_type, value),
            )
            r = cur.fetchone()
            conn.commit()
            return ok({
                "ok": True,
                "rule": {
                    "id": str(r[0]), "type": r[1], "value": float(r[2]),
                    "enabled": r[3], "created_at": str(r[4]), "updated_at": str(r[5]),
                    "label": RULE_TYPES[r[1]]["label"],
                    "description": RULE_TYPES[r[1]]["description"],
                    "value_label": RULE_TYPES[r[1]]["value_label"],
                }
            })

        # ── PATCH ?id=UUID — обновить enabled / value ─────────────────
        elif method == "PATCH":
            rule_id = qs.get("id", "").strip()
            if not rule_id:
                return err("Нужен параметр ?id=UUID")

            body = json.loads(event.get("body") or "{}")
            # Проверяем владение
            cur.execute(
                f"SELECT id, type, value, enabled FROM {SCHEMA}.pricing_rules WHERE id = %s AND user_id = %s",
                (rule_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                return err("Правило не найдено", 404)

            _, rtype, cur_val, cur_enabled = row
            new_val = float(body["value"]) if "value" in body else float(cur_val)
            new_enabled = bool(body["enabled"]) if "enabled" in body else cur_enabled

            if new_val <= 0:
                return err("value должен быть > 0")

            cur.execute(
                f"""UPDATE {SCHEMA}.pricing_rules
                    SET value = %s, enabled = %s, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, type, value, enabled, updated_at""",
                (new_val, new_enabled, rule_id),
            )
            r = cur.fetchone()
            conn.commit()
            return ok({
                "ok": True,
                "rule": {
                    "id": str(r[0]), "type": r[1], "value": float(r[2]),
                    "enabled": r[3], "updated_at": str(r[4]),
                    "label": RULE_TYPES.get(r[1], {}).get("label", r[1]),
                }
            })

        else:
            return err("Метод не поддерживается", 405)

    finally:
        cur.close()
        conn.close()
