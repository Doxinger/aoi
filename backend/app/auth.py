import ipaddress
import re
import time
import uuid

from quart import request

from . import db, security
from .config import access_ttl, cookie_secure, refresh_ttl
from .errors import AuthError, TokenExpiredError

ACCESS_COOKIE = "aoi_at"
REFRESH_COOKIE = "aoi_rt"

USERNAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё0-9_]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

_USER_SELECT = "u.id, u.username, u.email, u.created_at"


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    raw = forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


def user_json(row):
    return {
        "id": str(row["id"]),
        "username": row["username"],
        "email": row["email"],
        "createdAt": row["created_at"].isoformat(),
    }


def set_auth_cookies(response, access_token, refresh_token):
    common = {"httponly": True, "samesite": "Lax", "secure": cookie_secure()}
    response.set_cookie(ACCESS_COOKIE, access_token, max_age=access_ttl(), path="/", **common)
    response.set_cookie(REFRESH_COOKIE, refresh_token, max_age=refresh_ttl(), path="/api/auth", **common)


def clear_auth_cookies(response):
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")


async def issue_session(conn, user_id, user_agent=None, ip=None):
    refresh_token = security.generate_refresh_token()
    row = await conn.fetchrow(
        """
        INSERT INTO sessions (user_id, refresh_hash, user_agent, ip, expires_at)
        VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))
        RETURNING id
        """,
        user_id,
        security.hash_refresh_token(refresh_token),
        (user_agent or "")[:512] or None,
        ip,
        refresh_ttl(),
    )
    return security.make_access_token(user_id, row["id"]), refresh_token


async def current_user():
    token = request.cookies.get(ACCESS_COOKIE, "")
    claims = security.decode_access_token(token) if token else None
    if not claims:
        raise AuthError("Требуется вход")
    if claims.get("exp", 0) < time.time():
        raise TokenExpiredError("Сессия истекла")
    try:
        session_id = uuid.UUID(claims.get("sid", ""))
        user_id = int(claims.get("sub", ""))
    except ValueError:
        raise AuthError("Требуется вход")
    row = await db.fetchrow(
        f"""
        SELECT {_USER_SELECT}
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
        """,
        session_id,
        user_id,
    )
    if not row:
        raise AuthError("Требуется вход")
    return row


async def current_session_by_refresh():
    token = request.cookies.get(REFRESH_COOKIE, "")
    if not token:
        return None
    return await db.fetchrow(
        "SELECT id, user_id FROM sessions WHERE refresh_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
        security.hash_refresh_token(token),
    )
