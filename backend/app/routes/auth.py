import asyncio
import uuid

from quart import Blueprint, request

from .. import db, security
from ..auth import (
    EMAIL_RE,
    USERNAME_RE,
    client_ip,
    clear_auth_cookies,
    current_user,
    issue_session,
    set_auth_cookies,
    user_json,
)
from ..config import login_limit, password_change_limit, register_limit
from ..errors import AuthError, ConflictError, RateLimitError, ValidationError
from ..ratelimit import limiter
from ..responses import json_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


async def _json_body():
    data = await request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Некорректный запрос")
    return data


def _field(data, name, limit):
    value = data.get(name)
    if not isinstance(value, str):
        raise ValidationError("Некорректный запрос")
    value = value.strip()
    if not value or len(value) > limit:
        raise ValidationError("Некорректный запрос")
    return value


def _guard(action, key, limit, window):
    allowed, retry_after = limiter.allow(action, key, limit, window)
    if not allowed:
        minutes = max(1, retry_after // 60 + (1 if retry_after % 60 else 0))
        raise RateLimitError(f"Слишком много попыток. Повторите через {minutes} мин.")


@auth_bp.post("/register")
async def register():
    ip = client_ip()
    _guard("register", ip or "unknown", register_limit(), 3600)
    data = await _json_body()
    username = _field(data, "username", 32)
    email = _field(data, "email", 254)
    password = data.get("password")
    if not USERNAME_RE.match(username):
        raise ValidationError("Имя: 3–32 символа, буквы, цифры и знак _")
    if not EMAIL_RE.match(email):
        raise ValidationError("Некорректный адрес почты")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ValidationError("Пароль: от 8 до 128 символов")
    password_hash = await asyncio.to_thread(security.hash_password, password)
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO users (username, email, password_hash, last_login_at)
                VALUES ($1, $2, $3, now())
                ON CONFLICT DO NOTHING
                RETURNING id, username, email, created_at
                """,
                username,
                email,
                password_hash,
            )
            if row is None:
                taken_name = await conn.fetchval(
                    "SELECT 1 FROM users WHERE lower(username) = lower($1)", username
                )
                raise ConflictError("Имя уже занято" if taken_name else "Почта уже используется")
            await conn.execute(
                "INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
                row["id"],
            )
            access_token, refresh_token = await issue_session(
                conn, row["id"], request.user_agent.string, ip
            )
    response = json_response({"user": user_json(row)}, status=201)
    set_auth_cookies(response, access_token, refresh_token)
    return response


@auth_bp.post("/login")
async def login():
    ip = client_ip()
    _guard("login", ip or "unknown", login_limit(), 900)
    data = await _json_body()
    identity = _field(data, "login", 254)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise ValidationError("Введите логин и пароль")
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.username, u.email, u.password_hash, u.created_at, p.avatar_url
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE lower(u.username) = lower($1) OR lower(u.email) = lower($1)
            LIMIT 1
            """,
            identity,
        )
        password_hash = row["password_hash"] if row else await asyncio.to_thread(security.dummy_hash)
        valid = await asyncio.to_thread(security.verify_password, password_hash, password[:128])
        if row is None or not valid:
            raise AuthError("Неверный логин или пароль")
        async with conn.transaction():
            await conn.execute(
                "UPDATE users SET last_login_at = now() WHERE id = $1", row["id"]
            )
            await conn.execute(
                "DELETE FROM sessions WHERE user_id = $1 AND (expires_at < now() OR revoked_at IS NOT NULL)",
                row["id"],
            )
            access_token, refresh_token = await issue_session(
                conn, row["id"], request.user_agent.string, ip
            )
    response = json_response({"user": user_json(row)})
    set_auth_cookies(response, access_token, refresh_token)
    return response


@auth_bp.post("/refresh")
async def refresh():
    token_hash = None
    refresh_token = request.cookies.get("aoi_rt", "")
    if refresh_token:
        token_hash = security.hash_refresh_token(refresh_token)
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            session = None
            if token_hash:
                session = await conn.fetchrow(
                    """
                    SELECT id, user_id FROM sessions
                    WHERE refresh_hash = $1 AND revoked_at IS NULL AND expires_at > now()
                    FOR UPDATE
                    """,
                    token_hash,
                )
            if session is None:
                raise AuthError("Требуется вход")
            await conn.execute("UPDATE sessions SET revoked_at = now() WHERE id = $1", session["id"])
            row = await conn.fetchrow(
                """
                SELECT u.id, u.username, u.email, u.created_at, p.avatar_url
                FROM users u
                LEFT JOIN profiles p ON p.user_id = u.id
                WHERE u.id = $1
                """,
                session["user_id"],
            )
            if row is None:
                raise AuthError("Требуется вход")
            access_token, new_refresh = await issue_session(
                conn, row["id"], request.user_agent.string, client_ip()
            )
    response = json_response({"user": user_json(row)})
    set_auth_cookies(response, access_token, new_refresh)
    return response


@auth_bp.post("/logout")
async def logout():
    refresh_token = request.cookies.get("aoi_rt", "")
    claims = security.decode_access_token(request.cookies.get("aoi_at", ""))
    if refresh_token:
        await db.execute(
            "UPDATE sessions SET revoked_at = now() WHERE refresh_hash = $1 AND revoked_at IS NULL",
            security.hash_refresh_token(refresh_token),
        )
    elif claims and claims.get("sid"):
        try:
            await db.execute(
                "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
                uuid.UUID(claims["sid"]),
            )
        except ValueError:
            pass
    response = json_response({"ok": True})
    clear_auth_cookies(response)
    return response


@auth_bp.get("/me")
async def me():
    row = await current_user()
    return json_response({"user": user_json(row)})


@auth_bp.post("/password")
async def change_password():
    user = await current_user()
    ip = client_ip()
    _guard("password", ip or "unknown", password_change_limit(), 3600)
    data = await _json_body()
    current = data.get("currentPassword")
    new = data.get("newPassword")
    if not isinstance(current, str) or not current:
        raise ValidationError("Введите текущий пароль")
    if not isinstance(new, str) or not 8 <= len(new) <= 128:
        raise ValidationError("Новый пароль: от 8 до 128 символов")
    password_hash = await db.fetchval(
        "SELECT password_hash FROM users WHERE id = $1", user["id"]
    )
    valid = await asyncio.to_thread(security.verify_password, password_hash, current[:128])
    if not valid:
        raise AuthError("Неверный текущий пароль")
    new_hash = await asyncio.to_thread(security.hash_password, new)
    keep_session = None
    claims = security.decode_access_token(request.cookies.get("aoi_at", ""))
    if claims and claims.get("sid"):
        try:
            keep_session = uuid.UUID(claims["sid"])
        except ValueError:
            keep_session = None
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE id = $2", new_hash, user["id"]
            )
            if keep_session is not None:
                await conn.execute(
                    "UPDATE sessions SET revoked_at = now() "
                    "WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL",
                    user["id"],
                    keep_session,
                )
            else:
                await conn.execute(
                    "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
                    user["id"],
                )
    return json_response({"ok": True})


@auth_bp.delete("/account")
async def delete_account():
    user = await current_user()
    data = await _json_body()
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise ValidationError("Введите пароль")
    password_hash = await db.fetchval(
        "SELECT password_hash FROM users WHERE id = $1", user["id"]
    )
    valid = await asyncio.to_thread(security.verify_password, password_hash, password[:128])
    if not valid:
        raise AuthError("Неверный пароль")
    await db.execute("DELETE FROM users WHERE id = $1", user["id"])
    response = json_response({"ok": True})
    clear_auth_cookies(response)
    return response
