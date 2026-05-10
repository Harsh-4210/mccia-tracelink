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


def resolve_raw(conn, production: dict[str, Any] | None, qc: dict[str, Any] | None, user_id: str) -> dict[str, Any] | None:
    if not production or not production.get("input_lot_ref"):
        return None
    suppliers = {r["supplier_id"]: dict(r) for r in conn.execute("SELECT * FROM suppliers WHERE user_id = ?", (user_id,)).fetchall()}
    complaint_rows = conn.execute(
        "SELECT defect_description, root_cause_identified FROM complaints WHERE root_cause_identified LIKE ? AND user_id = ?",
        (f"%{production['input_lot_ref']}%", user_id),
    ).fetchall()
    complaint_text = " ".join(" ".join(str(v or "") for v in dict(row).values()) for row in complaint_rows)
    candidates = [dict(r) for r in conn.execute("SELECT * FROM raw_materials WHERE lot_number = ? AND user_id = ?", (production["input_lot_ref"], user_id)).fetchall()]
    best = best_raw_candidate(candidates, suppliers, qc, complaint_text)
    if not best:
        return None
    supplier = suppliers.get(best.get("supplier_id"), {})
    return {**best, "supplier": supplier}


def _build_trace(order_id: str, user_id: str) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        dispatch = row_to_dict(conn.execute("SELECT * FROM dispatch_orders WHERE order_id = ? AND user_id = ?", (order_id, user_id)).fetchone())
        if not dispatch:
            raise HTTPException(status_code=404, detail=f"Dispatch order {order_id} not found")
        batches = []
        for link in conn.execute("SELECT batch_id FROM dispatch_batches WHERE order_id = ? AND user_id = ? ORDER BY batch_id", (order_id, user_id)).fetchall():
            batch_id = link["batch_id"]
            production = row_to_dict(conn.execute("SELECT * FROM production_batches WHERE batch_id = ? AND user_id = ? ORDER BY inferred_batch_id LIMIT 1", (batch_id, user_id)).fetchone())
            qc = row_to_dict(conn.execute("SELECT * FROM qc_inspections WHERE batch_id = ? AND user_id = ?", (batch_id, user_id)).fetchone())
            raw = resolve_raw(conn, production, qc, user_id) if production else None

            # Determine link type
            link_type = "none"
            if production and raw:
                if production.get("inferred_batch_id", 0) == 0:
                    link_type = "deterministic"
                else:
                    link_type = "inferred"
                # Check if reviewed
                review_row = conn.execute(
                    "SELECT status FROM trace_reviews WHERE batch_id = ? AND lot_number = ? AND user_id = ? LIMIT 1",
                    (batch_id, production.get("input_lot_ref", ""), user_id),
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

        # Cross-supplier anomaly detection
        anomalies = []
        seen_lots = set()
        for b in batches:
            raw = b.get("raw_material")
            if raw:
                lot = raw.get("lot_number")
                if lot and lot not in seen_lots:
                    seen_lots.add(lot)
                    # Check if this lot comes from multiple suppliers
                    multi_supplier = conn.execute("SELECT COUNT(DISTINCT supplier_id) as cnt FROM raw_materials WHERE lot_number = ? AND user_id = ?", (lot, user_id)).fetchone()
                    if multi_supplier and multi_supplier["cnt"] > 1:
                        anomalies.append(f"Cross-Supplier Anomaly: Lot {lot} was sourced from {multi_supplier['cnt']} different suppliers.")

        return {
            "query_ms": round((time.perf_counter() - start) * 1000, 2),
            "dispatch": dispatch,
            "batches": batches,
            "warnings": missing_chains,
            "anomalies": anomalies,
            "status": "complete" if not missing_chains else "partial",
        }
    finally:
        conn.close()


@router.get("/{order_id}")
async def get_trace(order_id: str, user: dict = Depends(get_current_user)):
    return _build_trace(order_id, user.get("user_id"))


@router.get("/dispatch/{order_id}")
async def get_dispatch_trace(order_id: str, user: dict = Depends(get_current_user)):
    return _build_trace(order_id, user.get("user_id"))


import datetime

@router.get("/{order_id}/export")
async def export_trace(order_id: str, user: dict = Depends(get_current_user)):
    data = _build_trace(order_id, user.get("user_id"))
    
    output = io.StringIO()
    writer = csv.writer(output)
    # Header
    writer.writerow([
        "order_id", "dispatch_date", "customer_id", "batch_id", "link_type",
        "raw_lot", "supplier_id", "supplier_name", "material_type",
        "qc_pass_fail", "defect_type", "defect_rate_pct",
        "machine_id", "shift", "operator_id",
        "generated_by", "generated_at",
    ])
    
    for b in data["batches"]:
        p = b.get("production") or {}
        q = b.get("qc") or {}
        r = b.get("raw_material") or {}
        s = r.get("supplier") or {}
        writer.writerow([
            order_id,
            data["dispatch"].get("dispatch_date", ""),
            data["dispatch"].get("customer_id", ""),
            b["batch_id"],
            b.get("link_type", ""),
            p.get("input_lot_ref", ""),
            r.get("supplier_id", ""),
            s.get("supplier_name", ""),
            r.get("material_type", ""),
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
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=trace_{order_id}.csv"},
    )
