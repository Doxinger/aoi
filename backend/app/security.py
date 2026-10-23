import base64
import hashlib
import hmac
import json
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from .config import access_ttl, jwt_secret

_hasher = PasswordHasher()
_secret_cache = None
_dummy_cache = None


def _secret():
    global _secret_cache
    if _secret_cache is None:
        _secret_cache = jwt_secret()
    return _secret_cache


def hash_password(password):
    return _hasher.hash(password)


def verify_password(password_hash, password):
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def dummy_hash():
    global _dummy_cache
    if _dummy_cache is None:
        _dummy_cache = hash_password(secrets.token_urlsafe(24))
    return _dummy_cache


def _b64encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_access_token(user_id, session_id):
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    now = int(time.time())
    payload = _b64encode(
        json.dumps(
            {"sub": str(user_id), "sid": str(session_id), "iat": now, "exp": now + access_ttl()},
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(_secret(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64encode(signature)}"


def decode_access_token(token):
    try:
        header, payload, signature = token.split(".")
        expected = hmac.new(_secret(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature)):
            return None
        return json.loads(_b64decode(payload))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def generate_refresh_token():
    return secrets.token_urlsafe(48)


def hash_refresh_token(token):
    return hashlib.sha256(token.encode()).hexdigest()
