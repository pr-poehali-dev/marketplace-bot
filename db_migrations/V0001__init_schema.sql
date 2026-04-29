
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  ozon_api_key TEXT,
  wb_api_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
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

CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.applied_prices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
  sku TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sku)
);

CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.sync_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  products_count INTEGER,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON t_p37499172_marketplace_bot.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON t_p37499172_marketplace_bot.products(user_id);
CREATE INDEX IF NOT EXISTS idx_applied_prices_user ON t_p37499172_marketplace_bot.applied_prices(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_user ON t_p37499172_marketplace_bot.sync_log(user_id);
