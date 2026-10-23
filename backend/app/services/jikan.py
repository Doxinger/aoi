import asyncio
import urllib.parse

import httpx

from ..cache import cache
from ..config import JIKAN_API
from ..errors import UpstreamError

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AOI/1.0)", "Accept": "application/json"}
RETRY_STATUSES = (429, 500, 502, 503, 504)
ATTEMPTS = 3

STATUS_MAP = {
    "Currently Airing": "RELEASING",
    "Not yet aired": "NOT_YET_RELEASED",
}


def _media_item(entry):
    mal_id = entry.get("mal_id")
    if not mal_id:
        return None
    jpg = (entry.get("images") or {}).get("jpg") or {}
    title = entry.get("title_english") or entry.get("title") or "Аниме"
    aired_from = ((entry.get("aired") or {}).get("prop") or {}).get("from") or {}
    score = entry.get("score")
    return {
        "idMal": mal_id,
        "title": {"romaji": entry.get("title") or title, "english": title},
        "coverImage": {"extraLarge": jpg.get("large_image_url") or jpg.get("image_url") or ""},
        "bannerImage": None,
        "averageScore": round(score * 10) if isinstance(score, (int, float)) else None,
        "status": STATUS_MAP.get(entry.get("status") or "", "FINISHED"),
        "episodes": entry.get("episodes"),
        "seasonYear": entry.get("year") or aired_from.get("year"),
        "format": "MOVIE" if entry.get("type") == "Movie" else "TV",
    }


def _endpoint(params):
    ids = params.get("ids", "").strip()
    search = params.get("search", "").strip()
    status = params.get("status", "").strip()
    if ids:
        return "anime", {"ids": ids, "limit": "25"}
    if search:
        return "anime", {"q": search, "limit": "25", "sfw": "true"}
    if status == "RELEASING":
        return "seasons/now", {"limit": "25"}
    return "top/anime", {"filter": "bypopularity", "limit": "25"}


async def _fetch_with_retries(url):
    last_error = None
    for attempt in range(ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=18.0, headers=HEADERS, follow_redirects=True) as client:
                response = await client.get(url)
            if response.status_code in RETRY_STATUSES:
                last_error = UpstreamError(f"Jikan API HTTP {response.status_code}")
                if attempt == ATTEMPTS - 1:
                    raise last_error
                await asyncio.sleep(1.0 + attempt * 1.5)
                continue
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as error:
            last_error = error
            if error.response.status_code not in RETRY_STATUSES or attempt == ATTEMPTS - 1:
                raise UpstreamError(f"Jikan API HTTP {error.response.status_code}") from error
            await asyncio.sleep(1.0 + attempt * 1.5)
        except httpx.TransportError as error:
            last_error = error
            if attempt == ATTEMPTS - 1:
                raise UpstreamError(f"Jikan API недоступен: {error}") from error
            await asyncio.sleep(1.0 + attempt * 1.5)
    raise UpstreamError(f"Jikan API не ответил: {last_error}")


async def catalog(params):
    endpoint, query = _endpoint(params)
    url = f"{JIKAN_API}/{endpoint}?{urllib.parse.urlencode(query)}"
    cache_key = "jikan:" + url
    hit = cache.get(cache_key)
    if hit is not None:
        return hit
    payload = await _fetch_with_retries(url)
    data = payload.get("data")
    if not isinstance(data, list):
        raise UpstreamError("Jikan вернул неверный ответ")
    media = [item for item in (_media_item(entry) for entry in data) if item]
    result = {"data": {"Page": {"media": media}}}
    cache.set(cache_key, result)
    return result
