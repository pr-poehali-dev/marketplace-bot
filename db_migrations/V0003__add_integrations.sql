
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES t_p37499172_marketplace_bot.users(id),
    platform TEXT NOT NULL CHECK (platform IN ('ozon', 'wb')),
    api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_integrations_user ON t_p37499172_marketplace_bot.integrations(user_id);
