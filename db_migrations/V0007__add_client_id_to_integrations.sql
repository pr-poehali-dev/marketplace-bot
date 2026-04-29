
ALTER TABLE t_p37499172_marketplace_bot.integrations
    ADD COLUMN IF NOT EXISTS client_id TEXT;

COMMENT ON COLUMN t_p37499172_marketplace_bot.integrations.client_id
    IS 'Client-Id для Ozon API (не нужен для WB)';
