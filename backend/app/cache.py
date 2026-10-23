import time

from .config import CACHE_TTL


class TTLCache:
    def __init__(self, ttl):
        self.ttl = ttl
        self._data = {}

    def get(self, key):
        hit = self._data.get(key)
        if hit and time.time() - hit[0] < self.ttl:
            return hit[1]
        return None

    def set(self, key, value):
        self._data[key] = (time.time(), value)


cache = TTLCache(CACHE_TTL)
