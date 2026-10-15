-- Add requested_date and shipping_method to pi_records
ALTER TABLE pi_records ADD COLUMN IF NOT EXISTS requested_date TEXT NOT NULL DEFAULT '';
ALTER TABLE pi_records ADD COLUMN IF NOT EXISTS shipping_method TEXT NOT NULL DEFAULT '';
