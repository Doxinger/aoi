from quart import Blueprint, request

from ..auth import client_ip
from ..config import kodik_play_limit
from ..errors import RateLimitError, ValidationError
from ..ratelimit import limiter
from ..responses import json_response
from ..services import kodik, kodik_stream

kodik_bp = Blueprint("kodik", __name__, url_prefix="/api")


@kodik_bp.get("/ru")
async def russian_titles():
    ids = request.args.get("ids", "").split(",")
    return json_response(await kodik.russian_titles(ids))


@kodik_bp.get("/find")
async def find():
    query = request.args.get("q", "").strip()
    return json_response(await kodik.search(query))


@kodik_bp.get("/title")
async def title():
    key = request.args.get("key", "")
    return json_response(await kodik.title(key))


@kodik_bp.get("/info")
async def info():
    key = request.args.get("key", "")
    data = await kodik.title(key)
    return json_response(data["item"])


@kodik_bp.get("/health")
async def health():
    return json_response(await kodik.health())


@kodik_bp.get("/kodik/play")
async def kodik_play():
    allowed, retry_after = limiter.allow("kodik_play", client_ip() or "unknown", kodik_play_limit(), 3600)
    if not allowed:
        minutes = max(1, retry_after // 60 + (1 if retry_after % 60 else 0))
        raise RateLimitError(f"Слишком много запросов к плееру. Повторите через {minutes} мин.")
    link = request.args.get("link", "")
    season = _number_param(request.args.get("season"), 1, 100)
    ep = _number_param(request.args.get("ep"), 1, 10000)
    return json_response(await kodik_stream.resolve(link, season, ep))


def _number_param(raw, low, high):
    if raw in (None, ""):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError("Некорректный запрос")
    if not low <= value <= high:
        raise ValidationError("Некорректный запрос")
    return value
