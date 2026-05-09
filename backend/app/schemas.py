from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field
from typing import Any


# ── Auth Schemas ──────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    user_id: str
    email: str
    full_name: str | None = None
    role: str
    is_active: int = 1


class UserCreateRequest(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    role: str = "operator"


# ── Operator Entry Schemas ────────────────────────────────────────
class BatchEntry(BaseModel):
    date: str
    shift: str
    machine_id: str
    operator_id: str
    raw_lot: str
    units_produced: int
    qc_notes: str | None = None
    client_entry_id: str | None = None
    device_id: str | None = None
    created_offline_at: str | None = None


# ── Import Schemas ────────────────────────────────────────────────
class ImportSummary(BaseModel):
    import_id: str
    filename: str
    file_type: str
    uploader: str | None = None
    row_count: int = 0
    valid_rows: int = 0
    error_count: int = 0
    status: str = "pending"
    errors: list[dict[str, Any]] = []


# ── Pagination ────────────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    data: list[dict[str, Any]]
    total_count: int
    limit: int
    offset: int
    has_more: bool


# ── Trace/Alert Response ─────────────────────────────────────────
class TraceResponse(BaseModel):
    query_ms: float
    dispatch: dict[str, Any]
    batches: list[dict[str, Any]]


class AlertResponse(BaseModel):
    query_ms: float
    lot_number: str
    production_batches: list[dict[str, Any]]
    affected_dispatch_orders: list[dict[str, Any]]
    summary: dict[str, Any]
    total_count: int = 0
    limit: int = 100
    offset: int = 0
    has_more: bool = False


# ── Dashboard ─────────────────────────────────────────────────────
class DashboardMetrics(BaseModel):
    batch_count: int = 0
    pass_rate: float = 0.0
    defect_trend: list[dict[str, Any]] = []
    top_failing_machines: list[dict[str, Any]] = []
    supplier_scorecard: list[dict[str, Any]] = []
    open_complaints: int = 0
    pending_operator_entries: int = 0
    unresolved_links: int = 0
    recent_imports: list[dict[str, Any]] = []
    open_corrective_actions: int = 0


# ── Corrective Action ────────────────────────────────────────────
class CorrectiveActionCreate(BaseModel):
    triggered_by: str | None = None
    assigned_to: str | None = None
    root_cause: str | None = None
    immediate_action: str | None = None
    corrective_action: str | None = None
    preventive_action: str | None = None
    due_date: str | None = None


class CorrectiveActionUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    root_cause: str | None = None
    immediate_action: str | None = None
    corrective_action: str | None = None
    preventive_action: str | None = None
    due_date: str | None = None
    closed_date: str | None = None


# ── Review Queue ──────────────────────────────────────────────────
class LinkReviewAction(BaseModel):
    action: str  # "approve" or "reject"
    notes: str | None = None


# ── Legacy ────────────────────────────────────────────────────────
class ApiResponse(BaseModel):
    data: dict[str, Any]
