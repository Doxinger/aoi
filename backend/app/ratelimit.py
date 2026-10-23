import time
from collections import deque

_MAX_BUCKETS = 100000


class SlidingLimiter:
    def __init__(self):
        self._hits = {}

    def allow(self, action, key, limit, window):
        now = time.monotonic()
        hits = self._hits.setdefault((action, key), deque())
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return False, int(window - (now - hits[0])) + 1
        hits.append(now)
        if len(self._hits) > _MAX_BUCKETS:
            self._compact(now)
        return True, 0

    def _compact(self, now):
        stale = [key for key, hits in self._hits.items() if not hits or now - hits[-1] > 3600]
        for key in stale:
            del self._hits[key]


limiter = SlidingLimiter()
