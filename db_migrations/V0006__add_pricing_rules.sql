
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
    type TEXT NOT NULL CHECK (type IN ('increase_margin', 'beat_competitor', 'min_margin', 'max_discount')),
    value NUMERIC(10,2) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_user
    ON t_p37499172_marketplace_bot.pricing_rules(user_id);
