from quart import Blueprint, request

from ..errors import PayloadTooLargeError
from ..responses import raw_response
from ..services import anilist

anilist_bp = Blueprint("anilist", __name__, url_prefix="/api")


@anilist_bp.post("/al")
async def graphql():
    if (request.content_length or 0) > anilist.MAX_BODY:
        raise PayloadTooLargeError("Слишком большой запрос")
    body = await request.get_data()
    if len(body) > anilist.MAX_BODY:
        raise PayloadTooLargeError("Слишком большой запрос")
    return raw_response(await anilist.proxy(body))
