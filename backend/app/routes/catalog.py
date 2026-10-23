from quart import Blueprint, request

from ..responses import json_response, raw_response
from ..services import images, jikan

catalog_bp = Blueprint("catalog", __name__, url_prefix="/api")


@catalog_bp.get("/catalog")
async def catalog():
    data = await jikan.catalog(request.args)
    return json_response(data, cache_control="public, max-age=120")


@catalog_bp.get("/img")
async def image():
    body, content_type = await images.proxy(request.args.get("u", ""))
    return raw_response(body, content_type=content_type, cache_control="public, max-age=604800")
