from quart import Blueprint, request

from ..responses import json_response
from ..services import kodik

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
