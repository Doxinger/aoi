import json
import re
import time

from quart import Blueprint, request

from .. import db
from ..auth import current_user
from ..config import user_write_limit
from ..errors import PayloadTooLargeError, RateLimitError, ValidationError
from ..ratelimit import limiter
from ..responses import json_response

user_bp = Blueprint("user", __name__, url_prefix="/api/user")

KEY_RE = re.compile(r"^[A-Za-z0-9_\-:.]{1,64}$")
MAX_ITEM_BYTES = 16 * 1024
MAX_SYNC_BYTES = 512 * 1024
MAX_SAVED = 500
MAX_CONT = 100


def _check_key(key):
    if not KEY_RE.match(key or ""):
        raise ValidationError("Некорректный ключ")
    return key


def _check_item(item):
    if not isinstance(item, dict) or not item:
        raise ValidationError("Некорректные данные")
    if len(json.dumps(item, ensure_ascii=False).encode("utf-8")) > MAX_ITEM_BYTES:
        raise PayloadTooLargeError("Слишком большие данные элемента")
    return item


async def _write_guard(user_id):
    allowed, retry_after = limiter.allow("user_write", str(user_id), user_write_limit(), 60)
    if not allowed:
        raise RateLimitError(f"Слишком много запросов. Повторите через {retry_after} с.")


def _cont_ts(entry):
    try:
        return int(entry.get("ts") or time.time() * 1000)
    except (TypeError, ValueError):
        return int(time.time() * 1000)


@user_bp.get("/data")
async def data():
    user = await current_user()
    saved = await db.fetch(
        "SELECT item_key, data FROM user_saved WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
        user["id"],
        MAX_SAVED,
    )
    cont = await db.fetch(
        "SELECT item_key, data FROM user_progress WHERE user_id = $1 ORDER BY ts DESC LIMIT $2",
        user["id"],
        MAX_CONT,
    )
    return json_response(
        {
            "saved": {row["item_key"]: row["data"] for row in saved},
            "cont": {row["item_key"]: row["data"] for row in cont},
        }
    )


@user_bp.post("/sync")
async def sync():
    user = await current_user()
    await _write_guard(user["id"])
    raw = await request.get_data(as_text=True)
    if len(raw.encode("utf-8")) > MAX_SYNC_BYTES:
        raise PayloadTooLargeError("Слишком большой объём данных")
    payload = json.loads(raw) if raw else {}
    if not isinstance(payload, dict):
        raise ValidationError("Некорректный запрос")
    saved = payload.get("saved") or {}
    cont = payload.get("cont") or {}
    if not isinstance(saved, dict) or not isinstance(cont, dict):
        raise ValidationError("Некорректный запрос")
    if len(saved) > MAX_SAVED or len(cont) > MAX_CONT:
        raise PayloadTooLargeError("Слишком большой объём данных")
    saved_upsert = []
    saved_delete = []
    for key, item in saved.items():
        _check_key(key)
        if item is None:
            saved_delete.append(key)
        else:
            saved_upsert.append((user["id"], key, _check_item(item)))
    cont_upsert = []
    cont_delete = []
    for key, entry in cont.items():
        _check_key(key)
        if entry is None:
            cont_delete.append(key)
        else:
            _check_item(entry)
            cont_upsert.append((user["id"], key, entry, _cont_ts(entry)))
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            if saved_upsert:
                await conn.executemany(
                    """
                    INSERT INTO user_saved (user_id, item_key, data)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, item_key) DO UPDATE SET data = EXCLUDED.data
                    """,
                    saved_upsert,
                )
            if saved_delete:
                await conn.execute(
                    "DELETE FROM user_saved WHERE user_id = $1 AND item_key = ANY($2::varchar[])",
                    user["id"],
                    saved_delete,
                )
            if cont_upsert:
                await conn.executemany(
                    """
                    INSERT INTO user_progress (user_id, item_key, data, ts)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, item_key)
                    DO UPDATE SET data = EXCLUDED.data, ts = GREATEST(user_progress.ts, EXCLUDED.ts), updated_at = now()
                    """,
                    cont_upsert,
                )
            if cont_delete:
                await conn.execute(
                    "DELETE FROM user_progress WHERE user_id = $1 AND item_key = ANY($2::varchar[])",
                    user["id"],
                    cont_delete,
                )
    return json_response({"ok": True})


@user_bp.put("/saved/<key>")
async def put_saved(key):
    user = await current_user()
    await _write_guard(user["id"])
    _check_key(key)
    body = await request.get_json(silent=True) or {}
    item = _check_item(body.get("item"))
    await db.execute(
        """
        INSERT INTO user_saved (user_id, item_key, data)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_key) DO UPDATE SET data = EXCLUDED.data
        """,
        user["id"],
        key,
        item,
    )
    return json_response({"ok": True})


@user_bp.delete("/saved/<key>")
async def delete_saved(key):
    user = await current_user()
    await _write_guard(user["id"])
    _check_key(key)
    await db.execute(
        "DELETE FROM user_saved WHERE user_id = $1 AND item_key = $2", user["id"], key
    )
    return json_response({"ok": True})


@user_bp.put("/cont/<key>")
async def put_cont(key):
    user = await current_user()
    await _write_guard(user["id"])
    _check_key(key)
    body = await request.get_json(silent=True) or {}
    entry = _check_item(body.get("entry"))
    await db.execute(
        """
        INSERT INTO user_progress (user_id, item_key, data, ts)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, item_key)
        DO UPDATE SET data = EXCLUDED.data, ts = EXCLUDED.ts, updated_at = now()
        """,
        user["id"],
        key,
        entry,
        _cont_ts(entry),
    )
    return json_response({"ok": True})


@user_bp.delete("/cont/<key>")
async def delete_cont(key):
    user = await current_user()
    await _write_guard(user["id"])
    _check_key(key)
    await db.execute(
        "DELETE FROM user_progress WHERE user_id = $1 AND item_key = $2", user["id"], key
    )
    return json_response({"ok": True})
