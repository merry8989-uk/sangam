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


def trace_id_of(traceparent: str | None) -> str | None:
    """Extract the trace id from a W3C traceparent header."""
    if not traceparent:
        return None
    parts = traceparent.split("-")
    return parts[1] if len(parts) >= 3 and len(parts[1]) == 32 else None


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
        trace_id = trace_id_of(request.headers.get("traceparent"))
        logger.info(
            json.dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "trace_id": trace_id,
                }
            )
        )
        if trace_id:
            response.headers["x-trace-id"] = trace_id
        return response


def metrics_snapshot() -> dict:
    return {
        "requests": [
            {"method": m, "path": p, "status": s, "count": c}
            for (m, p, s), c in sorted(_metrics.items())
        ],
        "total": sum(_metrics.values()),
    }
