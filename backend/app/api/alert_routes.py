"""Versioned alert endpoints with pagination and export (ALERT-01 fix)."""
from __future__ import annotations

import csv
import datetime
import io
import time
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from ..auth import get_current_user
from ..db import connect

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _build_lot_alert(
    lot_number: str, user_id: str, limit: int = 100, offset: int = 0
) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        productions = [dict(r) for r in conn.execute(
            "SELECT * FROM production_batches WHERE input_lot_ref = ? AND batch_id IS NOT NULL AND user_id = ?",
            (lot_number, user_id),
        ).fetchall()]
        batch_ids = [p["batch_id"] for p in productions]

        # Compute failed batches from actual QC data
        failed_batches = []
        for batch_id in batch_ids:
            qc = conn.execute(
                "SELECT pass_fail FROM qc_inspections WHERE batch_id = ? AND user_id = ?",
                (batch_id, user_id),
            ).fetchone()
            if qc and qc["pass_fail"] == "FAIL":
                failed_batches.append(batch_id)

        # Count total affected dispatches
        total_count = 0
        for batch_id in batch_ids:
            count = conn.execute(
                "SELECT COUNT(*) as cnt FROM dispatch_batches db JOIN dispatch_orders d ON d.order_id = db.order_id AND d.user_id = db.user_id WHERE db.batch_id = ? AND db.user_id = ?",
                (batch_id, user_id),
            ).fetchone()
            total_count += count["cnt"] if count else 0

        # Paginated affected dispatches
        affected = []
        seen = 0
        for batch_id in batch_ids:
            rows = conn.execute("""
                SELECT d.*, db.batch_id, q.pass_fail, q.defect_type_normalized, q.defect_rate_pct
                FROM dispatch_batches db
                JOIN dispatch_orders d ON d.order_id = db.order_id AND d.user_id = db.user_id
                LEFT JOIN qc_inspections q ON q.batch_id = db.batch_id AND q.user_id = db.user_id
                WHERE db.batch_id = ? AND db.user_id = ?
                ORDER BY d.dispatch_date, d.order_id
            """, (batch_id, user_id)).fetchall()
            for row in rows:
                if seen >= offset and len(affected) < limit:
                    affected.append(dict(row))
                seen += 1

        # Compute Blast Radius Advanced Metrics
        financial_exposure = 0
        escaped_shipments = []
        post_qc_dispatches = []
        
        # Calculate financial exposure from complaints matching this lot (by root cause text)
        complaints = conn.execute(
            "SELECT financial_impact_inr FROM complaints WHERE root_cause_identified LIKE ? AND user_id = ?", 
            (f"%{lot_number}%", user_id)
        ).fetchall()
        for c in complaints:
            if c["financial_impact_inr"]:
                financial_exposure += c["financial_impact_inr"]
        
        # Also check complaints whose affected_order_ids overlap with dispatch orders tied to this lot
        if financial_exposure == 0:
            all_order_ids = set()
            for batch_id in batch_ids:
                orders = conn.execute(
                    "SELECT order_id FROM dispatch_batches WHERE batch_id = ? AND user_id = ?", (batch_id, user_id)
                ).fetchall()
                for o in orders:
                    all_order_ids.add(o["order_id"])
            
            if all_order_ids:
                all_complaints = conn.execute("SELECT affected_order_ids, financial_impact_inr FROM complaints WHERE affected_order_ids IS NOT NULL AND user_id = ?", (user_id,)).fetchall()
                for c in all_complaints:
                    if c["affected_order_ids"] and c["financial_impact_inr"]:
                        complaint_orders = set(o.strip() for o in c["affected_order_ids"].split(","))
                        if complaint_orders & all_order_ids:
                            financial_exposure += c["financial_impact_inr"]

        # Calculate escaped shipments and post-qc dispatches using ALL affected orders (not just paginated)
        all_affected = []
        for batch_id in batch_ids:
            rows = conn.execute("""
                SELECT d.*, db.batch_id, q.pass_fail, q.inspection_date
                FROM dispatch_batches db
                JOIN dispatch_orders d ON d.order_id = db.order_id AND d.user_id = db.user_id
                LEFT JOIN qc_inspections q ON q.batch_id = db.batch_id AND q.user_id = db.user_id
                WHERE db.batch_id = ? AND db.user_id = ?
            """, (batch_id, user_id)).fetchall()
            all_affected.extend([dict(r) for r in rows])
            
        for a in all_affected:
            dispatch_date = a.get("dispatch_date")
            inspection_date = a.get("inspection_date")
            pass_fail = a.get("pass_fail")
            
            if pass_fail == "FAIL":
                if dispatch_date and inspection_date and dispatch_date < inspection_date:
                    escaped_shipments.append(a["order_id"])
                elif dispatch_date and inspection_date and dispatch_date >= inspection_date:
                    post_qc_dispatches.append(a["order_id"])
                elif dispatch_date and not inspection_date:
                    escaped_shipments.append(a["order_id"])

        # Quarantine recommendations: failed batches that are not in dispatch_batches
        quarantine_batches = []
        for batch_id in failed_batches:
            is_dispatched = conn.execute("SELECT 1 FROM dispatch_batches WHERE batch_id = ?", (batch_id,)).fetchone()
            if not is_dispatched:
                quarantine_batches.append(batch_id)

        return {
            "query_ms": round((time.perf_counter() - start) * 1000, 2),
            "lot_number": lot_number,
            "production_batches": productions,
            "failed_batches": failed_batches,
            "affected_dispatch_orders": affected,
            "summary": {
                "batch_count": len(batch_ids),
                "dispatch_order_count": total_count,
                "failed_batch_count": len(failed_batches),
                "financial_exposure": financial_exposure,
                "escaped_shipments_count": len(escaped_shipments),
                "post_qc_dispatches_count": len(post_qc_dispatches),
                "quarantine_recommendations": quarantine_batches
            },
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total_count,
        }
    finally:
        conn.close()


@router.get("/lots/{lot_number}")
async def lot_alert(
    lot_number: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    return _build_lot_alert(lot_number, user.get("user_id"), limit=limit, offset=offset)


@router.get("/lots/{lot_number}/export")
async def export_lot_alert(
    lot_number: str,
    format: str = Query("csv", pattern="^(csv)$"),
    user: dict = Depends(get_current_user),
):
    # Export ALL rows (no pagination)
    result = _build_lot_alert(lot_number, user.get("user_id"), limit=999999, offset=0)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "lot_number", "order_id", "customer_id", "dispatch_date",
        "batch_id", "pass_fail", "defect_type", "defect_rate_pct",
        "generated_by", "generated_at",
    ])
    for row in result["affected_dispatch_orders"]:
        writer.writerow([
            lot_number,
            row.get("order_id", ""),
            row.get("customer_id", ""),
            row.get("dispatch_date", ""),
            row.get("batch_id", ""),
            row.get("pass_fail", ""),
            row.get("defect_type_normalized", ""),
            row.get("defect_rate_pct", ""),
            user.get("email", ""),
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=alert_{lot_number}.csv"},
    )
