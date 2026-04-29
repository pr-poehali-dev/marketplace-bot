
-- Пересоздаём таблицы с нуля (uuid + правильная структура sessions)
-- Сначала дропаем зависимые таблицы, потом основные

ALTER TABLE t_p37499172_marketplace_bot.sync_log DROP CONSTRAINT IF EXISTS sync_log_user_id_fkey;
ALTER TABLE t_p37499172_marketplace_bot.applied_prices DROP CONSTRAINT IF EXISTS applied_prices_user_id_fkey;
ALTER TABLE t_p37499172_marketplace_bot.products DROP CONSTRAINT IF EXISTS products_user_id_fkey;
ALTER TABLE t_p37499172_marketplace_bot.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;

-- Пересоздаём users с uuid
CREATE TABLE t_p37499172_marketplace_bot.users_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    ozon_api_key TEXT,
    wb_api_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Пересоздаём sessions с id + uuid user_id
CREATE TABLE t_p37499172_marketplace_bot.sessions_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users_new(id),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

-- Пересоздаём products с uuid user_id
CREATE TABLE t_p37499172_marketplace_bot.products_new (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users_new(id),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    current_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    logistics_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    storage_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
    ads_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
    return_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    sales INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
    raw_data JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, sku)
);

-- Пересоздаём applied_prices с uuid user_id
CREATE TABLE t_p37499172_marketplace_bot.applied_prices_new (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users_new(id),
    sku TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, sku)
);

-- Пересоздаём sync_log с uuid user_id
CREATE TABLE t_p37499172_marketplace_bot.sync_log_new (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users_new(id),
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    products_count INTEGER,
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Переименовываем (старые таблицы останутся с суффиксом _old)
ALTER TABLE t_p37499172_marketplace_bot.sync_log RENAME TO sync_log_old;
ALTER TABLE t_p37499172_marketplace_bot.applied_prices RENAME TO applied_prices_old;
ALTER TABLE t_p37499172_marketplace_bot.products RENAME TO products_old;
ALTER TABLE t_p37499172_marketplace_bot.sessions RENAME TO sessions_old;
ALTER TABLE t_p37499172_marketplace_bot.users RENAME TO users_old;

ALTER TABLE t_p37499172_marketplace_bot.users_new RENAME TO users;
ALTER TABLE t_p37499172_marketplace_bot.sessions_new RENAME TO sessions;
ALTER TABLE t_p37499172_marketplace_bot.products_new RENAME TO products;
ALTER TABLE t_p37499172_marketplace_bot.applied_prices_new RENAME TO applied_prices;
ALTER TABLE t_p37499172_marketplace_bot.sync_log_new RENAME TO sync_log;

-- Индексы
CREATE INDEX idx_sessions_user_v2 ON t_p37499172_marketplace_bot.sessions(user_id);
CREATE INDEX idx_sessions_token ON t_p37499172_marketplace_bot.sessions(token);
CREATE INDEX idx_products_user_v2 ON t_p37499172_marketplace_bot.products(user_id);
CREATE INDEX idx_applied_prices_user_v2 ON t_p37499172_marketplace_bot.applied_prices(user_id);
CREATE INDEX idx_sync_log_user_v2 ON t_p37499172_marketplace_bot.sync_log(user_id);
