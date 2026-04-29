
ALTER TABLE t_p37499172_marketplace_bot.integrations
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
