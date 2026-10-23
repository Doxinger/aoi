import os
import secrets
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
BLOCKED_FILE = BACKEND_DIR / "blocked.txt"
MIGRATIONS_DIR = BACKEND_DIR / "migrations"
SECRET_FILE = BACKEND_DIR / ".jwt_secret"

KODIK_API = "https://kodik-api.com"
ANILIST_API = "https://graphql.anilist.co"
JIKAN_API = "https://api.jikan.moe/v4"

CACHE_TTL = int(os.environ.get("CACHE_TTL", "1800"))

DEFAULT_DSN = "postgresql://aoi:aoi@127.0.0.1:5432/aoi"

_env_cache = None


def _env_files():
    return [BACKEND_DIR / ".env", PROJECT_DIR / ".env"]


def read_env():
    global _env_cache
    if _env_cache is not None:
        return _env_cache
    out = dict(os.environ)
    for path in _env_files():
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, value = line.split("=", 1)
                out[key.strip()] = value.strip().strip("\"'")
    _env_cache = out
    return out


def _int(name, default):
    try:
        return int(read_env().get(name, default))
    except ValueError:
        return default


def kodik_token():
    env = read_env()
    return env.get("KODIK_TOKEN") or env.get("KODIK_API_KEY") or env.get("KODIK_API_TOKEN")


def server_host():
    return "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"


def server_port():
    return int(os.environ.get("PORT", "8000"))


def database_url():
    return read_env().get("DATABASE_URL") or DEFAULT_DSN


def db_pool_min():
    return _int("DB_POOL_MIN", 2)


def db_pool_max():
    return _int("DB_POOL_MAX", 20)


def purge_interval():
    return _int("SESSION_PURGE_INTERVAL", 21600)


def jwt_secret():
    env = read_env()
    secret = env.get("JWT_SECRET")
    if secret:
        return secret.encode()
    if SECRET_FILE.exists():
        value = SECRET_FILE.read_text(encoding="utf-8").strip()
        if value:
            return value.encode()
    value = secrets.token_urlsafe(48)
    SECRET_FILE.write_text(value, encoding="utf-8")
    os.chmod(SECRET_FILE, 0o600)
    return value.encode()


def access_ttl():
    return _int("ACCESS_TTL_MIN", 15) * 60


def refresh_ttl():
    return _int("REFRESH_TTL_DAYS", 30) * 86400


def cookie_secure():
    env = read_env()
    return env.get("COOKIE_SECURE") == "1" or env.get("APP_ENV") == "production"


def register_limit():
    return _int("AUTH_REGISTER_LIMIT", 5)


def login_limit():
    return _int("AUTH_LOGIN_LIMIT", 20)


def user_write_limit():
    return _int("AUTH_WRITE_LIMIT", 240)
