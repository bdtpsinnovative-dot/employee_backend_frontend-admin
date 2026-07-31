-- Map each brand to the active employees responsible for it.
-- The responsibility type is independent from the employee's profile team:
-- for example, an MKT employee may be the Graphic contact for one brand.
CREATE TABLE IF NOT EXISTS brand_responsibilities (
    brand_id  UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    responsibility_type TEXT NOT NULL
        CHECK (responsibility_type IN ('bd', 'mkt', 'graphic')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (brand_id, user_id)
);

ALTER TABLE brand_responsibilities
    ALTER COLUMN brand_id SET NOT NULL,
    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brand_responsibilities_user_id
    ON brand_responsibilities(user_id);

ALTER TABLE brand_responsibilities ENABLE ROW LEVEL SECURITY;

-- The application accesses this table through the Go API using a direct
-- database connection. Keep it unavailable to Supabase Data API clients.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE brand_responsibilities FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE brand_responsibilities FROM authenticated;
    END IF;
END
$$;
