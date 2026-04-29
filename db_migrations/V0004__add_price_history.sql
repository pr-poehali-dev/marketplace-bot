
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
    sku TEXT NOT NULL,
    old_price NUMERIC(12,2) NOT NULL,
    new_price NUMERIC(12,2) NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_user_sku
    ON t_p37499172_marketplace_bot.price_history(user_id, sku, created_at DESC);
