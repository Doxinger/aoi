import base64
import re
import urllib.parse

import httpx

from ..cache import cache
from ..errors import UpstreamError

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0"}
MIRRORS = ("kodikplayer.com", "kodik.cc", "aniqit.com")
DEAD_HOSTS = {"kodik.info", "kodik.biz"}
KNOWN_SHIFT = 18

_EMBED_RE = re.compile(
    r"/(?P<type>[a-z][a-z-]*)/(?P<id>\d+)/(?P<hash>[0-9a-z]{16,})(?:/(?P<quality>\d{3,4})p?)?",
    re.IGNORECASE,
)
_SIG_RE = re.compile(
    r"""var\s+(domain|d_sign|pd|pd_sign|ref|ref_sign)\s*=\s*['"]([^'"]*)['"]\s*;"""
)
_VINFO_RE = re.compile(r"""\.(type|hash|id)\s*=\s*'([^']*)'""")
_JS_RE = re.compile(
    r"""<script\s[^>]*src=["'](?:https?://[^/"']+)?/(assets/js/app\.player[^"']+?\.js)["']""",
    re.IGNORECASE,
)
_ATOB_RE = re.compile(r"""url\s*:\s*atob\(\s*["']([A-Za-z0-9+/=]{4,})["']""")
_SEASON_DIV_RE = re.compile(
    r'<div\b[^>]*class\s*=\s*["\'][^"\']*\bseason-(\d+)\b[^"\']*["\'][^>]*>(.*?)</select>',
    re.DOTALL,
)
_SERIES_BOX_RE = re.compile(
    r'<div[^>]*class\s*=\s*["\'][^"\']*\bserial-series-box\b[^"\']*["\'][^>]*>(.*?)</select>',
    re.DOTALL,
)
_SEASONS_BOX_RE = re.compile(
    r'<div[^>]*class\s*=\s*["\'][^"\']*\bserial-seasons-box\b[^"\']*["\'][^>]*>(.*?)</select>',
    re.DOTALL,
)
_OPTION_RE = re.compile(r"<option\b([^>]*)>([^<]*)", re.DOTALL)
_ATTR_RE = re.compile(r'([a-z-]+)\s*=\s*"([^"]*)"')


def _parse_embed(link):
    text = str(link or "").strip()
    if text.startswith("//"):
        text = "https:" + text
    if not text.startswith("http"):
        raise UpstreamError("Некорректная ссылка на плеер")
    parts = urllib.parse.urlsplit(text)
    host = (parts.hostname or "").lower()
    match = _EMBED_RE.search(parts.path)
    if not match:
        raise UpstreamError("Некорректная ссылка на плеер")
    if host not in MIRRORS and host not in DEAD_HOSTS:
        raise UpstreamError("Неподдерживаемый плеер")
    query = dict(urllib.parse.parse_qsl(parts.query))
    return host, match, query


def _hosts(original):
    ordered = []
    for host in (original, *MIRRORS):
        if host and host not in DEAD_HOSTS and host not in ordered:
            ordered.append(host)
    return ordered


def _page_url(host, match, query, season):
    kept = {
        key: value
        for key, value in query.items()
        if key not in ("only_episode", "only_season", "episode", "season", "start_from")
    }
    if season:
        kept["season"] = str(season)
    path = f"/{match.group('type').lower()}/{match.group('id')}/{match.group('hash').lower()}"
    if match.group("quality"):
        path += f"/{match.group('quality')}p"
    suffix = "?" + urllib.parse.urlencode(kept) if kept else ""
    return f"https://{host}{path}{suffix}"


def _parse_sig(html):
    found = dict(_SIG_RE.findall(html))
    return {key: found.get(key, "") for key in ("domain", "d_sign", "pd", "pd_sign", "ref", "ref_sign")}


def _parse_videoinfo(html):
    fields = {}
    for name, value in _VINFO_RE.findall(html):
        fields.setdefault(name, value)
    if not all(fields.get(key) for key in ("type", "id", "hash")):
        return None
    return fields


def _parse_options(block):
    out = []
    for attrs_raw, label in _OPTION_RE.findall(block):
        attrs = {name: value for name, value in _ATTR_RE.findall(attrs_raw)}
        if not attrs.get("data-id") or not attrs.get("data-hash"):
            continue
        title = attrs.get("data-title") or label.strip()
        value_digits = re.sub(r"\D", "", attrs.get("value") or "")
        title_digits = re.sub(r"\D", "", title or "")
        ep = 0
        for candidate in (value_digits, title_digits):
            if candidate:
                ep = int(candidate)
                break
        if not ep:
            continue
        out.append(
            {
                "ep": ep,
                "id": attrs["data-id"],
                "hash": attrs["data-hash"].lower(),
                "title": title or f"{ep} серия",
                "selected": "selected" in (attrs_raw or "").lower(),
            }
        )
    return out


def _parse_episodes(html):
    episodes = []
    for season, block in _SEASON_DIV_RE.findall(html):
        for entry in _parse_options(block):
            episodes.append({**entry, "season": int(season)})
    if not episodes:
        box = _SERIES_BOX_RE.search(html)
        if box:
            season = 1
            seasons_box = _SEASONS_BOX_RE.search(html)
            if seasons_box:
                selected = re.search(r'<option\b[^>]*value="(\d+)"[^>]*selected', seasons_box.group(1))
                if selected:
                    season = int(selected.group(1))
            for entry in _parse_options(box.group(1)):
                episodes.append({**entry, "season": season})
    seasons = sorted({entry["season"] for entry in episodes})
    current = next((entry for entry in episodes if entry["selected"]), None)
    return episodes, seasons, current


def _caesar(text, shift):
    out = []
    for char in text:
        if "a" <= char <= "z" or "A" <= char <= "Z":
            base = ord("a") if char.islower() else ord("A")
            out.append(chr(base + (ord(char) - base + shift) % 26))
        else:
            out.append(char)
    return "".join(out)


def _decode_src(src):
    text = "".join(str(src or "").split())
    if len(text) < 8:
        return None
    for shift in [KNOWN_SHIFT, *(value for value in range(26) if value != KNOWN_SHIFT)]:
        rotated = _caesar(text, shift)
        rotated += "=" * (-len(rotated) % 4)
        try:
            decoded = base64.b64decode(rotated).decode("utf-8", "strict")
        except Exception:
            continue
        if ".m3u8" in decoded or decoded.startswith("//"):
            return "https:" + decoded if decoded.startswith("//") else decoded
    return None


async def _endpoint(client, host, html):
    cached = cache.get(f"kodik_endpoint:{host}")
    if cached:
        return cached
    endpoint = "/ftor"
    match = _JS_RE.search(html)
    if match:
        try:
            response = await client.get(
                f"https://{host}/{match.group(1)}",
                headers={**HEADERS, "Referer": f"https://{host}/"},
            )
            response.raise_for_status()
            atob = _ATOB_RE.search(response.text)
            if atob:
                decoded = base64.b64decode(
                    atob.group(1) + "=" * (-len(atob.group(1)) % 4)
                ).decode("utf-8", "strict")
                if decoded.startswith("/") and len(decoded) < 64:
                    endpoint = decoded
        except Exception:
            pass
    cache.set(f"kodik_endpoint:{host}", endpoint)
    return endpoint


async def _get_page(client, url, host):
    response = await client.get(url, headers={**HEADERS, "Referer": f"https://{host}/"})
    response.raise_for_status()
    return response.text


async def _post_links(client, host, page_url, sig, videoinfo, endpoint):
    form = {
        "d": sig["domain"],
        "d_sign": sig["d_sign"],
        "pd": sig["pd"],
        "pd_sign": sig["pd_sign"],
        "ref": urllib.parse.unquote(sig["ref"]).strip(),
        "ref_sign": sig["ref_sign"],
        "bad_user": "false",
        "cdn_is_working": "true",
        "type": videoinfo["type"],
        "id": videoinfo["id"],
        "hash": videoinfo["hash"],
    }
    headers = {
        **HEADERS,
        "Referer": page_url,
        "Origin": f"https://{host}",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    response = await client.post(f"https://{host}{endpoint}", data=form, headers=headers)
    response.raise_for_status()
    data = response.json()
    if data.get("error"):
        raise UpstreamError(str(data["error"]))
    links = data.get("links") or {}
    if not links:
        raise UpstreamError("Kodik не вернул потоки")
    return links, data.get("default")


def _qualities(links, default):
    out = []
    for key in sorted(links, key=lambda value: int(value) if str(value).isdigit() else 0, reverse=True):
        if not str(key).isdigit():
            continue
        entries = links[key]
        src = next((entry.get("src") for entry in entries if isinstance(entry, dict) and entry.get("src")), None)
        url = _decode_src(src) if src else None
        if url:
            out.append({"q": int(key), "url": url})
    if not out:
        raise UpstreamError("Не удалось расшифровать потоки")
    try:
        default_q = int(default)
    except (TypeError, ValueError):
        default_q = out[0]["q"]
    if not any(entry["q"] == default_q for entry in out):
        default_q = out[0]["q"]
    return out, default_q


async def _resolve_host(client, host, match, query, season, ep):
    page_url = _page_url(host, match, query, season)
    html = await _get_page(client, page_url, host)
    sig = _parse_sig(html)
    if not sig["d_sign"] or not sig["ref_sign"]:
        raise UpstreamError("Страница плеера Kodik изменилась")
    episodes, seasons, selected = _parse_episodes(html)
    page_videoinfo = _parse_videoinfo(html)

    target = None
    if episodes and ep:
        wanted_season = season or (selected or {}).get("season") or seasons[0]
        target = next(
            (
                entry
                for entry in episodes
                if entry["ep"] == ep and (not season or entry["season"] == season or entry["season"] == wanted_season)
            ),
            None,
        )
        if target is None:
            target = next((entry for entry in episodes if entry["ep"] == ep), None)
    if target is None and page_videoinfo:
        target = next(
            (entry for entry in episodes if entry["hash"] == page_videoinfo["hash"].lower()),
            None,
        )
    if target is None and selected:
        target = selected

    if target is not None:
        videoinfo = {"type": "seria", "id": target["id"], "hash": target["hash"]}
    elif page_videoinfo:
        videoinfo = page_videoinfo
    else:
        raise UpstreamError("Не удалось разобрать страницу плеера")

    endpoint = await _endpoint(client, host, html)
    try:
        links, default = await _post_links(client, host, page_url, sig, videoinfo, endpoint)
    except Exception:
        html = await _get_page(client, page_url, host)
        sig = _parse_sig(html)
        if not sig["d_sign"] or not sig["ref_sign"]:
            raise
        links, default = await _post_links(client, host, page_url, sig, videoinfo, endpoint)

    qualities, default_q = _qualities(links, default)
    current = None
    if target is not None:
        current = {"season": target["season"], "ep": target["ep"]}
    elif episodes:
        first = episodes[0]
        current = {"season": first["season"], "ep": first["ep"]}
    return {
        "qualities": qualities,
        "default": default_q,
        "episodes": [
            {"season": entry["season"], "ep": entry["ep"], "title": entry["title"]}
            for entry in sorted(episodes, key=lambda value: (value["season"], value["ep"]))
        ],
        "seasons": seasons,
        "current": current,
    }


async def resolve(link, season=None, ep=None):
    host, match, query = _parse_embed(link)
    key = f"kodik_resolve:{host}:{match.group(0).lower()}:{season or 0}:{ep or 0}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    last_error = None
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        for candidate in _hosts(host):
            try:
                result = await _resolve_host(client, candidate, match, query, season, ep)
                cache.set(key, result)
                return result
            except Exception as error:
                last_error = error
    raise UpstreamError(f"Плеер Kodik недоступен: {last_error}")
