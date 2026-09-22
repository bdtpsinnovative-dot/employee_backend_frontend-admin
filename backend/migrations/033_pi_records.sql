-- Purchase and sales data is read through the Go API only.
CREATE TABLE IF NOT EXISTS pi_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pi_supplier TEXT NOT NULL DEFAULT '',
    record_date TEXT NOT NULL DEFAULT '',
    supplier TEXT NOT NULL DEFAULT '',
    link_file TEXT NOT NULL DEFAULT '',
    link_file_url TEXT NOT NULL DEFAULT '',
    etd TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_url TEXT NOT NULL DEFAULT '',
    sale_name TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL DEFAULT '',
    delivered_date TEXT NOT NULL DEFAULT '',
    date_order TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_records_pi_supplier ON pi_records(pi_supplier);
CREATE INDEX IF NOT EXISTS idx_pi_records_order_no ON pi_records(order_no);

ALTER TABLE pi_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE pi_records FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE pi_records FROM authenticated;
    END IF;
END
$$;
