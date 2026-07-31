-- Keep the brand role separate from users.position and users.team.
ALTER TABLE brand_responsibilities
    ADD COLUMN IF NOT EXISTS responsibility_type TEXT;

UPDATE brand_responsibilities
SET responsibility_type = 'bd'
WHERE responsibility_type IS NULL;

ALTER TABLE brand_responsibilities
    ALTER COLUMN responsibility_type SET NOT NULL;

ALTER TABLE brand_responsibilities
    DROP CONSTRAINT IF EXISTS brand_responsibilities_responsibility_type_check;

ALTER TABLE brand_responsibilities
    ADD CONSTRAINT brand_responsibilities_responsibility_type_check
    CHECK (responsibility_type IN ('bd', 'mkt', 'graphic'));
