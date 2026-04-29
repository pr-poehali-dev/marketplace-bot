
ALTER TABLE t_p37499172_marketplace_bot.users
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'pro'));
