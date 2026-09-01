import json
import logging
import os
import time
from collections import defaultdict, deque
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, FastAPI, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse

from .database import engine

logger = logging.getLogger("metam.enterprise")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(message)s")

enterprise_router = APIRouter(tags=["Enterprise Platform"])

STARTED_AT = time.time()
REQUEST_COUNT = 0
ERROR_COUNT = 0
REQUEST_LATENCY_SECONDS = 0.0
TRAFFIC_BY_PATH: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "errors": 0, "latency_seconds": 0.0})
RECENT_TRAFFIC: deque[dict[str, Any]] = deque(maxlen=100)

# The app serves its own frontend build with no inline scripts/styles and no
# third-party origins (see frontend/index.html), so a same-origin-only policy
# is safe. Swagger/ReDoc (when enabled) load from a CDN and run an inline
# init script, so those doc routes are exempt below rather than weakened globally.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)
DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}


def success_response(data: Any, message: str = "OK") -> dict[str, Any]:
    return {"success": True, "message": message, "data": data}


def failure_response(message: str, errors: list[Any] | None = None) -> dict[str, Any]:
    return {"success": False, "message": message, "errors": errors or []}


def configure_enterprise(app: FastAPI) -> None:
    @app.middleware("http")
    async def enterprise_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        global ERROR_COUNT, REQUEST_COUNT, REQUEST_LATENCY_SECONDS
        correlation_id = request.headers.get("x-correlation-id", str(uuid4()))
        start = time.perf_counter()
        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception as error:
            ERROR_COUNT += 1
            logger.exception(
                json.dumps(
                    {
                        "event": "unhandled_exception",
                        "correlation_id": correlation_id,
                        "method": request.method,
                        "path": request.url.path,
                        "error": str(error),
                    }
                )
            )
            return JSONResponse(status_code=500, content=failure_response("Internal server error", [{"type": "server_error"}]))
        finally:
            duration = time.perf_counter() - start
            REQUEST_COUNT += 1
            REQUEST_LATENCY_SECONDS += duration
            path_key = request.url.path
            path_stats = TRAFFIC_BY_PATH[path_key]
            path_stats["count"] += 1
            path_stats["latency_seconds"] += duration
            if status_code >= 500:
                path_stats["errors"] += 1
            RECENT_TRAFFIC.append(
                {
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "path": path_key,
                    "status_code": status_code,
                    "duration_ms": round(duration * 1000, 2),
                }
            )
            logger.info(
                json.dumps(
                    {
                        "event": "request",
                        "correlation_id": correlation_id,
                        "method": request.method,
                        "path": path_key,
                        "status_code": status_code,
                        "duration_ms": round(duration * 1000, 2),
                    }
                )
            )
            try:
                if response is not None:
                    response.headers["x-correlation-id"] = correlation_id
                    response.headers["cache-control"] = "no-store" if request.url.path.startswith(("/runtime", "/auth")) else "private, max-age=30, stale-while-revalidate=120"
                    response.headers["x-content-type-options"] = "nosniff"
                    response.headers["x-frame-options"] = "DENY"
                    response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
                    response.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()"
                    if request.url.path not in DOCS_PATHS:
                        response.headers["content-security-policy"] = CONTENT_SECURITY_POLICY
            except Exception:
                pass


@enterprise_router.get("/live")
def live() -> dict[str, Any]:
    return success_response({"status": "live", "uptime_seconds": round(time.time() - STARTED_AT, 2)})


@enterprise_router.get("/ready")
def ready() -> dict[str, Any]:
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except Exception as error:
        return failure_response("Database readiness check failed", [{"error": str(error)}])
    return success_response({"status": "ready", "database": "connected"})


@enterprise_router.get("/info")
def info() -> dict[str, Any]:
    return success_response(
        {
            "name": "Metam Services",
            "version": "0.2.6",
            "runtime": "python-fastapi-react",
            "api_version": "v1",
            "industries": [
                "manufacturing",
                "textile",
                "clothing",
                "food_processing",
                "electronics",
                "automotive",
                "pharmaceutical",
                "packaging",
                "warehousing",
                "logistics",
                "chemical",
                "generic_business",
            ],
        }
    )


@enterprise_router.get("/traffic")
def traffic() -> dict[str, Any]:
    return success_response(
        {
            "requests": REQUEST_COUNT,
            "errors": ERROR_COUNT,
            "average_latency_ms": round((REQUEST_LATENCY_SECONDS / REQUEST_COUNT) * 1000, 2) if REQUEST_COUNT else 0,
            "by_path": {
                path: {
                    "count": stats["count"],
                    "errors": stats["errors"],
                    "average_latency_ms": round((stats["latency_seconds"] / stats["count"]) * 1000, 2) if stats["count"] else 0,
                }
                for path, stats in sorted(TRAFFIC_BY_PATH.items())
            },
            "recent": list(RECENT_TRAFFIC),
        }
    )


@enterprise_router.get("/performance/summary")
def performance_summary() -> dict[str, Any]:
    slowest_paths = [
        {
            "path": path,
            "count": stats["count"],
            "errors": stats["errors"],
            "average_latency_ms": round((stats["latency_seconds"] / stats["count"]) * 1000, 2) if stats["count"] else 0,
        }
        for path, stats in TRAFFIC_BY_PATH.items()
    ]
    slowest_paths.sort(key=lambda row: row["average_latency_ms"], reverse=True)
    return success_response(
        {
            "api": {
                "requests": REQUEST_COUNT,
                "error_rate": round(ERROR_COUNT / REQUEST_COUNT, 4) if REQUEST_COUNT else 0,
                "average_latency_ms": round((REQUEST_LATENCY_SECONDS / REQUEST_COUNT) * 1000, 2) if REQUEST_COUNT else 0,
                "cache_hit_ratio": 0.0,
                "slowest_paths": slowest_paths[:10],
            },
            "database": {
                "connection_pool": "SQLAlchemy pooled engine",
                "query_mode": "bounded list endpoints with optional search, fields, limit and offset",
                "index_strategy": ["tenant_id/company_id filters", "module_key filters", "created_at audit ordering"],
            },
            "frontend": {
                "lazy_loading": "route chunks, lazy charts, lazy management workspace, viewport sections and modal-only connector forms",
                "route_chunks": "Vite dynamic imports",
                "bundle_budget_kb": 500,
            },
            "jobs": {
                "background_workers": "Docker worker container enabled",
                "queue_status": "ready",
            },
        }
    )


@enterprise_router.get("/metrics", response_class=PlainTextResponse)
def metrics() -> str:
    uptime = time.time() - STARTED_AT
    average_latency = REQUEST_LATENCY_SECONDS / REQUEST_COUNT if REQUEST_COUNT else 0
    return "\n".join(
        [
            "# HELP metam_uptime_seconds Application uptime in seconds",
            "# TYPE metam_uptime_seconds gauge",
            f"metam_uptime_seconds {uptime:.2f}",
            "# HELP metam_requests_total Total HTTP requests observed by enterprise middleware",
            "# TYPE metam_requests_total counter",
            f"metam_requests_total {REQUEST_COUNT}",
            "# HELP metam_errors_total Total HTTP 5xx errors observed by enterprise middleware",
            "# TYPE metam_errors_total counter",
            f"metam_errors_total {ERROR_COUNT}",
            "# HELP metam_request_latency_seconds Average request latency",
            "# TYPE metam_request_latency_seconds gauge",
            f"metam_request_latency_seconds {average_latency:.6f}",
            "",
        ]
    )


@enterprise_router.get("/swagger", include_in_schema=False)
def swagger_redirect() -> RedirectResponse:
    return RedirectResponse(url="/docs", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
