"""Admin endpoints: audit logs, user management, system health."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..auth import require_admin, get_current_user
from ..db import connect, DB_PATH

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-events")
async def list_audit_events(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    user_email: str | None = Query(None),
    admin: dict = Depends(require_admin),
):
    conn = connect()
    try:
        conditions = []
        params: list = []

        if action:
            conditions.append("action LIKE ?")
            params.append(f"%{action}%")
        if user_email:
            conditions.append("user_email = ?")
            params.append(user_email)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        total = conn.execute(f"SELECT COUNT(*) as cnt FROM audit_events {where}", params).fetchone()["cnt"]

        params.extend([limit, offset])
        rows = conn.execute(
            f"SELECT * FROM audit_events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            params,
        ).fetchall()

        return {
            "audit_events": [dict(r) for r in rows],
            "total_count": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total,
        }
    finally:
        conn.close()


@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT user_id, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        return {"users": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/health")
async def system_health(user: dict = Depends(get_current_user)):
    import os
    db_size = os.path.getsize(DB_PATH) if DB_PATH.exists() else 0
    conn = connect()
    try:
        table_counts = {}
        for table in ["users", "production_batches", "qc_inspections", "dispatch_orders",
                       "raw_materials", "suppliers", "complaints", "operator_entries",
                       "audit_events", "source_files", "corrective_actions"]:
            try:
                row = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()
                table_counts[table] = row["cnt"]
            except Exception:
                table_counts[table] = -1

        return {
            "status": "healthy",
            "database_exists": DB_PATH.exists(),
            "database_size_mb": round(db_size / 1024 / 1024, 2),
            "table_counts": table_counts,
        }
    finally:
        conn.close()
