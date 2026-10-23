import json

from quart import Response


def json_response(data, status=200, cache_control="no-store"):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    return Response(
        body,
        status=status,
        content_type="application/json; charset=utf-8",
        headers={"Cache-Control": cache_control},
    )


def raw_response(body, content_type="application/json; charset=utf-8", status=200, cache_control="no-store"):
    return Response(body, status=status, content_type=content_type, headers={"Cache-Control": cache_control})
