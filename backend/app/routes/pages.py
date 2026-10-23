from quart import Blueprint, send_from_directory

from ..config import FRONTEND_DIR
from ..responses import json_response
from ..services.blocklist import blocked_keys

pages_bp = Blueprint("pages", __name__)


async def _page(filename):
    response = await send_from_directory(FRONTEND_DIR, filename)
    response.headers["Cache-Control"] = "no-store"
    return response


@pages_bp.get("/")
async def index():
    return await _page("index.html")


@pages_bp.get("/healthz")
async def healthz():
    return json_response({"ok": True})


@pages_bp.get("/oferta")
async def oferta():
    return await _page("oferta.html")


@pages_bp.get("/profile")
async def profile_page():
    return await _page("profile.html")


@pages_bp.get("/u/<path:value>")
async def user_page(value):
    return await _page("profile.html")


@pages_bp.get("/pravoobladatelyam")
async def rights():
    return await _page("pravoobladatelyam.html")


@pages_bp.get("/config.js")
async def config_js():
    response = await send_from_directory(FRONTEND_DIR, "config.js")
    response.headers["Content-Type"] = "application/javascript; charset=utf-8"
    response.headers["Cache-Control"] = "no-store"
    return response


@pages_bp.get("/api/blocked")
async def blocked():
    return json_response({"keys": blocked_keys()})
