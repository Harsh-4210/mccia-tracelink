"""Versioned trace endpoints with auth, export, and link-type annotations."""
from __future__ import annotations

import csv
import io
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..auth import get_current_user
from ..db import connect, row_to_dict
from ..linking import best_raw_candidate

router = APIRouter(prefix="/trace", tags=["trace"])


def resolve_raw(conn, production: dict[str, Any] | None, qc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not production or not production.get("input_lot_ref"):
        return None
    suppliers = {r["supplier_id"]: dict(r) for r in conn.execute("SELECT * FROM suppliers").fetchall()}
    complaint_rows = conn.execute(
        "SELECT defect_description, root_cause_identified FROM complaints WHERE root_cause_identified LIKE ?",
        (f"%{production['input_lot_ref']}%",),
    ).fetchall()
    complaint_text = " ".join(" ".join(str(v or "") for v in dict(row).values()) for row in complaint_rows)
    candidates = [dict(r) for r in conn.execute("SELECT * FROM raw_materials WHERE lot_number = ?", (production["input_lot_ref"],)).fetchall()]
    best = best_raw_candidate(candidates, suppliers, qc, complaint_text)
    if not best:
        return None
    supplier = suppliers.get(best.get("supplier_id"), {})
    return {**best, "supplier": supplier}


def _build_trace(order_id: str) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        dispatch = row_to_dict(conn.execute("SELECT * FROM dispatch_orders WHERE order_id = ?", (order_id,)).fetchone())
        if not dispatch:
            raise HTTPException(status_code=404, detail=f"Dispatch order {order_id} not found")
        batches = []
        for link in conn.execute("SELECT batch_id FROM dispatch_batches WHERE order_id = ? ORDER BY batch_id", (order_id,)).fetchall():
            batch_id = link["batch_id"]
            production = row_to_dict(conn.execute("SELECT * FROM production_batches WHERE batch_id = ? ORDER BY inferred_batch_id LIMIT 1", (batch_id,)).fetchone())
            qc = row_to_dict(conn.execute("SELECT * FROM qc_inspections WHERE batch_id = ?", (batch_id,)).fetchone())
            raw = resolve_raw(conn, production, qc) if production else None

            # Determine link type
            link_type = "none"
            if production and raw:
                if production.get("inferred_batch_id", 0) == 0:
                    link_type = "deterministic"
                else:
                    link_type = "inferred"
                # Check if reviewed
                review_row = conn.execute(
                    "SELECT status FROM trace_reviews WHERE batch_id = ? AND lot_number = ? LIMIT 1",
                    (batch_id, production.get("input_lot_ref", "")),
                ).fetchone()
                if review_row and review_row["status"] == "approved":
                    link_type = "reviewed"

            batches.append({
                "batch_id": batch_id,
                "production": production,
                "qc": qc,
                "raw_material": raw,
                "link_type": link_type,
            })

        # Incomplete trace warning
        missing_chains = []
        for b in batches:
            if not b["production"]:
                missing_chains.append(f"Batch {b['batch_id']}: missing production record")
            elif not b["raw_material"]:
                missing_chains.append(f"Batch {b['batch_id']}: missing raw material link")
            if not b["qc"]:
                missing_chains.append(f"Batch {b['batch_id']}: missing QC inspection")

        return {
            "query_ms": round((time.perf_counter() - start) * 1000, 2),
            "dispatch": dispatch,
            "batches": batches,
            "incomplete_warnings": missing_chains,
        }
    finally:
        conn.close()


@router.get("/dispatch/{order_id}")
async def trace_dispatch(order_id: str, user: dict = Depends(get_current_user)):
    return _build_trace(order_id)


@router.get("/dispatch/{order_id}/export")
async def export_trace(
    order_id: str,
    format: str = Query("csv", pattern="^(csv)$"),
    user: dict = Depends(get_current_user),
):
    result = _build_trace(order_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "order_id", "dispatch_date", "customer_id", "batch_id", "link_type",
        "raw_lot", "supplier_id", "supplier_name", "material_type", "confidence",
        "qc_pass_fail", "defect_type", "defect_rate_pct",
        "machine_id", "shift", "operator_id",
        "generated_by", "generated_at",
    ])
    import datetime
    for b in result["batches"]:
        p = b.get("production") or {}
        q = b.get("qc") or {}
        r = b.get("raw_material") or {}
        s = r.get("supplier") or {}
        writer.writerow([
            order_id,
            result["dispatch"].get("dispatch_date", ""),
            result["dispatch"].get("customer_id", ""),
            b["batch_id"],
            b.get("link_type", ""),
            p.get("input_lot_ref", ""),
            r.get("supplier_id", ""),
            s.get("supplier_name", ""),
            r.get("material_type", ""),
            r.get("confidence", ""),
            q.get("pass_fail", ""),
            q.get("defect_type_normalized", ""),
            q.get("defect_rate_pct", ""),
            p.get("machine_id", ""),
            p.get("shift", ""),
            p.get("operator_id", ""),
            user.get("email", ""),
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=trace_{order_id}.csv"},
    )
