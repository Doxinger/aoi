import httpx

from ..cache import cache
from ..config import ANILIST_API

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "AOI/1.0",
}

MAX_BODY = 4096


async def proxy(body):
    key = "al:" + body.decode("utf-8", "ignore")
    hit = cache.get(key)
    if hit is not None:
        return hit
    async with httpx.AsyncClient(timeout=15.0, headers=HEADERS, follow_redirects=True) as client:
        response = await client.post(ANILIST_API, content=body)
        response.raise_for_status()
        raw = response.content
    cache.set(key, raw)
    return raw
