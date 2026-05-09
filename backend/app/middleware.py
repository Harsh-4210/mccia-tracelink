"""Audit logging middleware.

Records every mutating API call and important reads into the audit_events table.
Each request gets a unique request_id for traceability.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from .db import connect

# Endpoints that trigger audit logging (prefix match)
AUDITED_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/imports",
    "/api/v1/operator",
    "/api/v1/trace",
    "/api/v1/alerts",
    "/api/v1/review",
    "/api/v1/compliance",
    "/api/v1/admin",
    "/api/v1/dashboard",
    "/api/rebuild",
    "/api/operator",
    "/api/trace",
    "/api/alerts",
)

# Methods that always audit
AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def should_audit(method: str, path: str) -> bool:
    if method in AUDIT_METHODS:
        return any(path.startswith(p) for p in AUDITED_PREFIXES)
    # Audit GET on trace/alert/export for compliance
    if method == "GET" and ("export" in path or "trace" in path or "alert" in path):
        return True
    return False


def log_audit_event(
    user_id: str | None,
    user_email: str | None,
    action: str,
    entity_type: str | None,
    entity_id: str | None,
    request_ip: str | None,
    request_id: str | None,
    response_status: int,
    duration_ms: float,
    result_summary: str | None = None,
) -> None:
    try:
        conn = connect()
        try:
            conn.execute(
                """INSERT INTO audit_events
                (user_id, user_email, action, entity_type, entity_id,
                 request_ip, request_id, response_status, duration_ms, result_summary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, user_email, action, entity_type, entity_id,
                 request_ip, request_id, response_status, duration_ms, result_summary),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        # Never let audit logging crash the request
        pass


def extract_entity_from_path(path: str) -> tuple[str | None, str | None]:
    """Try to extract entity_type and entity_id from the URL path."""
    parts = path.strip("/").split("/")
    # /api/v1/trace/dispatch/D-1847 → ("dispatch", "D-1847")
    # /api/v1/alerts/lots/LOT-2023-114 → ("lot", "LOT-2023-114")
    # /api/v1/compliance/corrective-actions/CA-001 → ("corrective_action", "CA-001")
    if len(parts) >= 4:
        entity_type = parts[-2] if len(parts) >= 2 else None
        entity_id = parts[-1] if not parts[-1].startswith("export") else parts[-2]
        return entity_type, entity_id
    return None, None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())[:12]
        request.state.request_id = request_id
        start = time.perf_counter()

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        path = request.url.path
        method = request.method

        if should_audit(method, path):
            # Try to get user info from request state (set by auth)
            user_id = getattr(request.state, "user_id", None)
            user_email = getattr(request.state, "user_email", None)
            entity_type, entity_id = extract_entity_from_path(path)
            action = f"{method} {path}"

            log_audit_event(
                user_id=user_id,
                user_email=user_email,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                request_ip=request.client.host if request.client else None,
                request_id=request_id,
                response_status=response.status_code,
                duration_ms=duration_ms,
            )

        return response
