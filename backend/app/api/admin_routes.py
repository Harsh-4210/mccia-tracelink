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

@router.get("/pipeline-audit")
async def pipeline_audit(admin: dict = Depends(require_admin)):
    conn = connect()
    try:
        # Row counts
        counts = {}
        for t in ["users", "production_batches", "qc_inspections", "dispatch_orders", "raw_materials", "complaints"]:
            try:
                counts[t] = conn.execute(f"SELECT COUNT(*) as cnt FROM {t}").fetchone()["cnt"]
            except:
                counts[t] = 0

        # Imputation breakdowns (5-tier engine)
        imputations = conn.execute("""
            SELECT 
                SUM(CASE WHEN inference_confidence = 0.9 THEN 1 ELSE 0 END) as rule1_90,
                SUM(CASE WHEN inference_confidence = 0.75 THEN 1 ELSE 0 END) as rule2_75,
                SUM(CASE WHEN inference_confidence = 0.55 THEN 1 ELSE 0 END) as rule3_55,
                SUM(CASE WHEN inference_confidence = 0.3 THEN 1 ELSE 0 END) as rule4_30,
                SUM(CASE WHEN inference_confidence = 0.0 AND inferred_batch_id = 1 THEN 1 ELSE 0 END) as rule5_0,
                SUM(CASE WHEN inferred_batch_id = 1 THEN 1 ELSE 0 END) as total_inferred
            FROM production_batches
        """).fetchone()

        # Temporal integrity: QC before production
        temporal_warnings = conn.execute("""
            SELECT q.batch_id, q.inspection_date, p.production_date
            FROM qc_inspections q
            JOIN production_batches p ON p.batch_id = q.batch_id
            WHERE q.inspection_date < p.production_date
            LIMIT 100
        """).fetchall()

        # LOT anomaly flags: Lots with complaints but no QC failure
        lot_anomalies = conn.execute("""
            SELECT p.input_lot_ref, COUNT(DISTINCT c.complaint_id) as complaint_count
            FROM production_batches p
            JOIN complaints c ON c.root_cause_identified LIKE '%' || p.input_lot_ref || '%'
            WHERE p.batch_id NOT IN (SELECT batch_id FROM qc_inspections WHERE pass_fail = 'FAIL')
            GROUP BY p.input_lot_ref
            ORDER BY complaint_count DESC
            LIMIT 50
        """).fetchall()

        return {
            "row_counts": counts,
            "imputations": dict(imputations),
            "temporal_warnings": [dict(r) for r in temporal_warnings],
            "lot_anomalies": [dict(r) for r in lot_anomalies]
        }
    finally:
        conn.close()
