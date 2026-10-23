import asyncio
import urllib.parse

import httpx

from ..cache import cache
from ..config import KODIK_API, kodik_token
from ..errors import BlockedError, UpstreamError
from .blocklist import blocked_keys

HEADERS = {"User-Agent": "AOI/1.0", "Accept": "application/json"}


async def _fetch(url, timeout):
    hit = cache.get(url)
    if hit is not None:
        return hit
    async with httpx.AsyncClient(timeout=timeout, headers=HEADERS, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
    cache.set(url, data)
    return data


async def request(path, timeout=15.0, **params):
    token = kodik_token()
    if not token:
        raise UpstreamError("Не найден KODIK_TOKEN в файле .env")
    query = {k: v for k, v in params.items() if v not in (None, "")}
    url = f"{KODIK_API}/{path}?{urllib.parse.urlencode({**query, 'token': token})}"
    return await _fetch(url, timeout)


def _num(value):
    try:
        number = float(value)
        return round(number, 1) if number > 0 else None
    except (TypeError, ValueError):
        return None


def _brief(row):
    material = row.get("material_data") or {}
    return {
        "mal": row.get("shikimori_id"),
        "title": row.get("title"),
        "kp": _num(material.get("kinopoisk_rating")),
        "imdb": _num(material.get("imdb_rating")),
    }


def merge_briefs(rows):
    out = {}
    for row in rows:
        brief = _brief(row)
        if not brief["mal"]:
            continue
        old = out.setdefault(str(brief["mal"]), brief)
        for key, value in brief.items():
            if not old.get(key) and value:
                old[key] = value
    return out


async def _russian_one(mal_id):
    try:
        data = await request("search", timeout=5.0, shikimori_id=mal_id, with_material_data="true", limit=20)
        return mal_id, merge_briefs(data.get("results", [])).get(str(mal_id))
    except Exception:
        return mal_id, None


async def russian_titles(ids):
    tasks = [asyncio.create_task(_russian_one(i)) for i in ids[:40] if str(i).isdigit()]
    if not tasks:
        return {}
    done, pending = await asyncio.wait(tasks, timeout=8)
    for task in pending:
        task.cancel()
    out = {}
    for task in done:
        mal_id, brief = task.result()
        if brief:
            out[mal_id] = brief
    return out


async def search(query):
    data = await request(
        "search", timeout=12.0, title=query, types="anime-serial,anime", with_material_data="true", limit=100
    )
    return {"items": list(merge_briefs(data.get("results", [])).values())[:30]}


async def title(key):
    if key in blocked_keys():
        raise BlockedError("Материал недоступен по обращению правообладателя")
    if key[:1] != "s":
        raise UpstreamError("Устаревшая закладка: удалите её и добавьте заново")
    data = await request("search", shikimori_id=key[1:], with_material_data="true", limit=100)
    results = data.get("results", [])
    voices, seen = [], set()
    for row in results:
        translation = row.get("translation") or {}
        if translation.get("id") in seen or not row.get("link"):
            continue
        seen.add(translation.get("id"))
        voices.append({
            "id": translation.get("id"),
            "name": translation.get("title") or "Озвучка",
            "type": translation.get("type"),
            "eps": row.get("episodes_count") or row.get("last_episode"),
            "quality": row.get("quality"),
            "link": row["link"],
        })
    voices.sort(key=lambda v: (v["type"] == "subtitles", -(v["eps"] or 0)))
    brief = merge_briefs(results).get(key[1:]) or {}
    material = next(
        (
            row.get("material_data")
            for row in results
            if (row.get("material_data") or {}).get("description") or (row.get("material_data") or {}).get("anime_description")
        ),
        None,
    ) or next((row.get("material_data") for row in results if row.get("material_data")), {})
    item = {
        "key": key,
        "title": brief.get("title"),
        "kp": brief.get("kp"),
        "imdb": brief.get("imdb"),
        "desc": material.get("anime_description") or material.get("description") or "",
        "genres": material.get("anime_genres") or material.get("all_genres") or material.get("genres") or [],
        "orig": results[0].get("title_orig") if results else None,
    }
    return {"item": item, "voices": voices}


async def health():
    token = bool(kodik_token())
    try:
        data = await request("list", timeout=8.0, limit=1)
        return {"kodik_token": token, "kodik": f"ok ({len(data.get('results', []))})"}
    except Exception as error:
        return {"kodik_token": token, "kodik": f"ошибка: {error}"}
