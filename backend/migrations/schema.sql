CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_hash CHAR(64) NOT NULL,
    user_agent VARCHAR(512),
    ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_refresh_hash_key ON sessions (refresh_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    avatar_url TEXT,
    about VARCHAR(500) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_episodes (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_key VARCHAR(64) NOT NULL,
    ep INTEGER NOT NULL DEFAULT 0,
    season INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key, season, ep)
);

CREATE INDEX IF NOT EXISTS user_episodes_user_idx ON user_episodes (user_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watch_seconds BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_saved (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_key VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

CREATE TABLE IF NOT EXISTS user_progress (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_key VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    ts BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS user_progress_user_ts_idx ON user_progress (user_id, ts DESC);

ALTER TABLE user_saved SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE user_progress SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE sessions SET (autovacuum_vacuum_scale_factor = 0.02);
