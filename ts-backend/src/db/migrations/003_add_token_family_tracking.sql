-- Add token family tracking to detect refresh token reuse attacks
-- A family_id groups all tokens in a refresh chain
-- is_revoked marks tokens that have been used (for reuse detection)

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;

-- Make family_id NOT NULL after setting defaults
UPDATE refresh_tokens SET family_id = gen_random_uuid() WHERE family_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;

-- Index for efficient family lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
