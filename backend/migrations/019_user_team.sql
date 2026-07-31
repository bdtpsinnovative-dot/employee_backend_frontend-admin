-- Add the employee's team to the profile stored in users.
-- This is intentionally a text field: teams are edited from the profile and
-- do not need a separate lookup table yet.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT '';
