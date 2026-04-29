
ALTER TABLE t_p37499172_marketplace_bot.products
    ADD COLUMN IF NOT EXISTS old_price NUMERIC(12,2);
