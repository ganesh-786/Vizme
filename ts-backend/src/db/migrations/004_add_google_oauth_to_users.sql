-- Add Google OAuth support to user accounts.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local';

-- OAuth-only users may not have a local password.
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- Enforce known auth providers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_provider_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_provider_check
      CHECK (auth_provider IN ('local', 'google'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
