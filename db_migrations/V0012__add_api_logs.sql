
CREATE TABLE IF NOT EXISTS t_p37499172_marketplace_bot.api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES t_p37499172_marketplace_bot.users(id),
    platform TEXT NOT NULL DEFAULT 'ozon',
    endpoint TEXT NOT NULL,
    status_code INTEGER,
    error TEXT,
    request_body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_user ON t_p37499172_marketplace_bot.api_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON t_p37499172_marketplace_bot.api_logs(created_at DESC);
