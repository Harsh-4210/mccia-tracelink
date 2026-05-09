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
    lot_number: str, limit: int = 100, offset: int = 0
) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        productions = [dict(r) for r in conn.execute(
            "SELECT * FROM production_batches WHERE input_lot_ref = ? AND batch_id IS NOT NULL",
            (lot_number,),
        ).fetchall()]
        batch_ids = [p["batch_id"] for p in productions]

        # Compute failed batches from actual QC data (removed hardcoded anchor batches)
        failed_batches = []
        for batch_id in batch_ids:
            qc = conn.execute(
                "SELECT pass_fail FROM qc_inspections WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            if qc and qc["pass_fail"] == "FAIL":
                failed_batches.append(batch_id)

        # Count total affected dispatches
        total_count = 0
        for batch_id in batch_ids:
            count = conn.execute(
                "SELECT COUNT(*) as cnt FROM dispatch_batches db JOIN dispatch_orders d ON d.order_id = db.order_id WHERE db.batch_id = ?",
                (batch_id,),
            ).fetchone()
            total_count += count["cnt"] if count else 0

        # Paginated affected dispatches
        affected = []
        seen = 0
        for batch_id in batch_ids:
            rows = conn.execute("""
                SELECT d.*, db.batch_id, q.pass_fail, q.defect_type_normalized, q.defect_rate_pct
                FROM dispatch_batches db
                JOIN dispatch_orders d ON d.order_id = db.order_id
                LEFT JOIN qc_inspections q ON q.batch_id = db.batch_id
                WHERE db.batch_id = ?
                ORDER BY d.dispatch_date, d.order_id
            """, (batch_id,)).fetchall()
            for row in rows:
                if seen >= offset and len(affected) < limit:
                    affected.append(dict(row))
                seen += 1

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
    return _build_lot_alert(lot_number, limit=limit, offset=offset)


@router.get("/lots/{lot_number}/export")
async def export_lot_alert(
    lot_number: str,
    format: str = Query("csv", pattern="^(csv)$"),
    user: dict = Depends(get_current_user),
):
    # Export ALL rows (no pagination)
    result = _build_lot_alert(lot_number, limit=999999, offset=0)
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
