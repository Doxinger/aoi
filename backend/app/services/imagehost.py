import logging
import re
import uuid

import httpx

from ..errors import UpstreamError, ValidationError

logger = logging.getLogger("aoi.imagehost")

PIXHOST_API = "https://api.pixhost.to/images"
FREEIMAGE_API = "https://freeimage.host/api/1/upload"
FREEIMAGE_KEY = "6d207e02198a847aa98d0a2a901485a5"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}

EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def detect_type(data):
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _filename(ext):
    return f"aoi_{uuid.uuid4().hex}{ext}"


async def _upload_pixhost(client, data, mime, ext):
    response = await client.post(
        PIXHOST_API,
        data={"content_type": "0"},
        files={"img": (_filename(ext), data, mime)},
    )
    response.raise_for_status()
    show_url = response.json().get("show_url")
    if not show_url:
        raise UpstreamError("Хостинг не вернул ссылку")
    page = await client.get(show_url)
    page.raise_for_status()
    match = re.search(r"https://img\d+\.pixhost\.to/images/[^\s\"'<>]+", page.text)
    if not match:
        raise UpstreamError("Хостинг не вернул ссылку")
    return match.group(0)


async def _upload_freeimage(client, data, mime, ext):
    response = await client.post(
        FREEIMAGE_API,
        data={"key": FREEIMAGE_KEY, "format": "json"},
        files={"source": (_filename(ext), data, mime)},
    )
    response.raise_for_status()
    payload = response.json()
    url = (payload.get("image") or {}).get("url")
    if not url:
        raise UpstreamError("Хостинг не вернул ссылку")
    return url


_PROVIDERS = (_upload_pixhost, _upload_freeimage)


async def upload_avatar(data):
    mime = detect_type(data)
    if mime is None:
        raise ValidationError("Поддерживаются только изображения JPEG, PNG, GIF и WebP")
    ext = EXTENSIONS[mime]
    async with httpx.AsyncClient(timeout=60.0, headers=HEADERS, follow_redirects=True) as client:
        for provider in _PROVIDERS:
            try:
                return await provider(client, data, mime, ext)
            except ValidationError:
                raise
            except Exception as error:
                logger.warning("Провайдер %s недоступен: %s", provider.__name__, error)
    raise UpstreamError("Сервис хранения изображений недоступен. Попробуйте позже")
