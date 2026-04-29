
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.sales_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
    platform TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end   TIMESTAMPTZ NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_aggregates_user
    ON t_p37499172_marketplace_bot.sales_aggregates(user_id, platform, created_at DESC);
