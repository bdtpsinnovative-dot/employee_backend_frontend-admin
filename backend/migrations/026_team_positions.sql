-- A team can contain many job positions. Users keep both references so an
-- employee may belong to a team before a position has been selected.
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT positions_team_name_unique UNIQUE (team_id, name)
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS position_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_position_id_fkey'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_position_id_fkey
            FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_positions_team_id ON positions(team_id);
CREATE INDEX IF NOT EXISTS idx_users_position_id ON users(position_id);

CREATE OR REPLACE FUNCTION set_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_positions_updated_at();
