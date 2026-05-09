"""Dashboard metrics endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..db import connect

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics")
async def dashboard_metrics(user: dict = Depends(get_current_user)):
    conn = connect()
    try:
        # Batch count
        batch_count = conn.execute("SELECT COUNT(DISTINCT batch_id) as cnt FROM production_batches WHERE batch_id IS NOT NULL").fetchone()["cnt"]

        # QC pass rate
        total_qc = conn.execute("SELECT COUNT(*) as cnt FROM qc_inspections").fetchone()["cnt"]
        pass_qc = conn.execute("SELECT COUNT(*) as cnt FROM qc_inspections WHERE pass_fail = 'PASS'").fetchone()["cnt"]
        pass_rate = round((pass_qc / total_qc * 100) if total_qc > 0 else 0, 1)

        # Defect trend (last 10 dates)
        defect_trend = [dict(r) for r in conn.execute("""
            SELECT inspection_date, COUNT(*) as total,
                   SUM(CASE WHEN pass_fail = 'FAIL' THEN 1 ELSE 0 END) as failures,
                   ROUND(AVG(defect_rate_pct), 2) as avg_defect_rate
            FROM qc_inspections
            WHERE inspection_date IS NOT NULL
            GROUP BY inspection_date
            ORDER BY inspection_date DESC
            LIMIT 10
        """).fetchall()]

        # Top failing machines
        top_machines = [dict(r) for r in conn.execute("""
            SELECT p.machine_id, COUNT(*) as fail_count,
                   ROUND(AVG(q.defect_rate_pct), 2) as avg_defect_rate
            FROM qc_inspections q
            JOIN production_batches p ON p.batch_id = q.batch_id
            WHERE q.pass_fail = 'FAIL' AND p.machine_id IS NOT NULL
            GROUP BY p.machine_id
            ORDER BY fail_count DESC
            LIMIT 5
        """).fetchall()]

        # Supplier scorecard
        supplier_scorecard = [dict(r) for r in conn.execute("""
            SELECT s.supplier_id, s.supplier_name, s.approved_status,
                   COUNT(DISTINCT r.lot_number) as lots_supplied,
                   COUNT(DISTINCT c.complaint_id) as complaint_count
            FROM suppliers s
            LEFT JOIN raw_materials r ON r.supplier_id = s.supplier_id
            LEFT JOIN complaints c ON c.root_cause_identified LIKE '%' || s.supplier_name || '%'
            GROUP BY s.supplier_id
            ORDER BY complaint_count DESC
        """).fetchall()]

        # Open complaints
        open_complaints = conn.execute("SELECT COUNT(*) as cnt FROM complaints").fetchone()["cnt"]

        # Pending operator entries (not approved)
        pending_entries = conn.execute(
            "SELECT COUNT(*) as cnt FROM operator_entries WHERE supervisor_approved = 0"
        ).fetchone()["cnt"]

        # Unresolved links (inferred, not reviewed)
        unresolved = conn.execute(
            "SELECT COUNT(*) as cnt FROM production_batches WHERE inferred_batch_id = 1"
        ).fetchone()["cnt"]

        # Recent imports
        recent_imports = [dict(r) for r in conn.execute(
            "SELECT import_id, filename, file_type, status, row_count, uploaded_at FROM source_files ORDER BY uploaded_at DESC LIMIT 5"
        ).fetchall()]

        # Open corrective actions
        open_cas = conn.execute(
            "SELECT COUNT(*) as cnt FROM corrective_actions WHERE status = 'open'"
        ).fetchone()["cnt"]

        return {
            "batch_count": batch_count,
            "pass_rate": pass_rate,
            "defect_trend": defect_trend,
            "top_failing_machines": top_machines,
            "supplier_scorecard": supplier_scorecard,
            "open_complaints": open_complaints,
            "pending_operator_entries": pending_entries,
            "unresolved_links": unresolved,
            "recent_imports": recent_imports,
            "open_corrective_actions": open_cas,
        }
    finally:
        conn.close()
