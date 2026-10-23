import urllib.parse

import httpx

from ..errors import BlockedError

HEADERS = {"User-Agent": "AOI/1.0"}
MAX_BYTES = 6_000_000


def _allowed(url):
    host = urllib.parse.urlparse(url).hostname or ""
    return host == "anilist.co" or host.endswith(".anilist.co")


async def proxy(url):
    if not _allowed(url):
        raise BlockedError("Неподдерживаемый источник")
    async with httpx.AsyncClient(timeout=15.0, headers=HEADERS, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content[:MAX_BYTES], response.headers.get("content-type", "image/jpeg")
