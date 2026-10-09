"""Structured request logging and a lightweight metrics snapshot.

Every request is logged as one JSON line (method, path, status, duration_ms),
and counters are kept in-process for the /metrics endpoint.
"""

import json
import logging
import time
from collections import Counter

from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("sangam.ai")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

_metrics: Counter = Counter()


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            _metrics[(request.method, request.url.path, 500)] += 1
            raise
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        _metrics[(request.method, request.url.path, response.status_code)] += 1
        logger.info(
            json.dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                }
            )
        )
        return response


def metrics_snapshot() -> dict:
    return {
        "requests": [
            {"method": m, "path": p, "status": s, "count": c}
            for (m, p, s), c in sorted(_metrics.items())
        ],
        "total": sum(_metrics.values()),
    }
