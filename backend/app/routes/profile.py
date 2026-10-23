from quart import Blueprint, request

from .. import db
from ..auth import USERNAME_RE, current_user, user_json
from ..config import avatar_max_bytes, avatar_upload_limit, user_write_limit
from ..errors import NotFoundError, PayloadTooLargeError, RateLimitError, ValidationError
from ..ratelimit import limiter
from ..responses import json_response
from ..services import imagehost

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")

MAX_ABOUT = 500


async def _write_guard(user_id):
    allowed, retry_after = limiter.allow("user_write", str(user_id), user_write_limit(), 60)
    if not allowed:
        raise RateLimitError(f"Слишком много запросов. Повторите через {retry_after} с.")


def _guard(action, key, limit, window):
    allowed, retry_after = limiter.allow(action, key, limit, window)
    if not allowed:
        minutes = max(1, retry_after // 60 + (1 if retry_after % 60 else 0))
        raise RateLimitError(f"Слишком много попыток. Повторите через {minutes} мин.")


async def _profile_row(user_id):
    return await db.fetchrow(
        "SELECT avatar_url, about, updated_at FROM profiles WHERE user_id = $1", user_id
    )


async def _stats(user_id):
    saved = await db.fetchval(
        "SELECT count(*) FROM user_saved WHERE user_id = $1", user_id
    )
    cont = await db.fetchval(
        "SELECT count(*) FROM user_progress WHERE user_id = $1", user_id
    )
    last_activity = await db.fetchval(
        "SELECT max(ts) FROM user_progress WHERE user_id = $1", user_id
    )
    anime = await db.fetchval(
        "SELECT count(DISTINCT item_key) FROM user_episodes WHERE user_id = $1", user_id
    )
    episodes = await db.fetchval(
        "SELECT count(*) FROM user_episodes WHERE user_id = $1", user_id
    )
    watch_seconds = await db.fetchval(
        "SELECT watch_seconds FROM profiles WHERE user_id = $1", user_id
    )
    genres = await db.fetch(
        """
        SELECT genre, count(*) AS n
        FROM user_saved s
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(s.data->'genres') = 'array'
                 THEN s.data->'genres' ELSE '[]'::jsonb END
        ) AS genre
        WHERE s.user_id = $1
        GROUP BY genre
        ORDER BY n DESC, genre
        LIMIT 6
        """,
        user_id,
    )
    return {
        "saved": saved or 0,
        "cont": cont or 0,
        "anime": anime or 0,
        "episodes": episodes or 0,
        "watchSeconds": watch_seconds or 0,
        "lastActivity": last_activity,
        "genres": [{"name": row["genre"], "count": row["n"]} for row in genres],
    }


def _profile_json(user, profile, stats=None):
    data = user_json(user)
    if profile is not None:
        data["avatar"] = profile["avatar_url"]
        data["about"] = profile["about"]
    else:
        data["about"] = ""
    if stats is not None:
        data["stats"] = stats
    return data


@profile_bp.get("")
async def my_profile():
    user = await current_user()
    profile = await _profile_row(user["id"])
    stats = await _stats(user["id"])
    return json_response({"profile": _profile_json(user, profile, stats)})


@profile_bp.put("")
async def update_profile():
    user = await current_user()
    await _write_guard(user["id"])
    data = await request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Некорректный запрос")
    about = data.get("about")
    if about is None:
        about = ""
    if not isinstance(about, str):
        raise ValidationError("Некорректный запрос")
    about = about.strip()
    if len(about) > MAX_ABOUT:
        raise ValidationError(f"Описание: не более {MAX_ABOUT} символов")
    await db.execute(
        """
        INSERT INTO profiles (user_id, about)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET about = EXCLUDED.about, updated_at = now()
        """,
        user["id"],
        about,
    )
    profile = await _profile_row(user["id"])
    return json_response({"profile": _profile_json(user, profile)})


@profile_bp.post("/avatar")
async def upload_avatar():
    user = await current_user()
    _guard("avatar", str(user["id"]), avatar_upload_limit(), 3600)
    await _write_guard(user["id"])
    files = await request.files
    file = files.get("avatar") or files.get("file")
    if file is None:
        raise ValidationError("Файл не получен")
    data = file.read()
    if not data:
        raise ValidationError("Пустой файл")
    if len(data) > avatar_max_bytes():
        raise PayloadTooLargeError("Изображение больше 5 МБ")
    url = await imagehost.upload_avatar(data)
    await db.execute(
        """
        INSERT INTO profiles (user_id, avatar_url)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = now()
        """,
        user["id"],
        url,
    )
    profile = await _profile_row(user["id"])
    return json_response({"profile": _profile_json(user, profile)})


@profile_bp.delete("/avatar")
async def remove_avatar():
    user = await current_user()
    await _write_guard(user["id"])
    await db.execute(
        "UPDATE profiles SET avatar_url = NULL, updated_at = now() WHERE user_id = $1",
        user["id"],
    )
    profile = await _profile_row(user["id"])
    return json_response({"profile": _profile_json(user, profile)})


@profile_bp.get("/u/<value>")
async def public_profile(value):
    row = None
    if value.isdigit() and len(value) <= 18:
        row = await db.fetchrow(
            """
            SELECT u.id, u.username, u.created_at, p.avatar_url, p.about
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE u.id = $1
            """,
            int(value),
        )
    if row is None:
        if not USERNAME_RE.match(value or ""):
            raise NotFoundError("Профиль не найден")
        row = await db.fetchrow(
            """
            SELECT u.id, u.username, u.created_at, p.avatar_url, p.about
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE lower(u.username) = lower($1)
            """,
            value,
        )
    if row is None:
        raise NotFoundError("Профиль не найден")
    stats = await _stats(row["id"])
    return json_response(
        {
            "profile": {
                "id": str(row["id"]),
                "username": row["username"],
                "avatar": row["avatar_url"],
                "about": row["about"] or "",
                "createdAt": row["created_at"].isoformat(),
                "stats": {
                    "saved": stats["saved"],
                    "cont": stats["cont"],
                    "anime": stats["anime"],
                    "episodes": stats["episodes"],
                    "watchSeconds": stats["watchSeconds"],
                },
            }
        }
    )
