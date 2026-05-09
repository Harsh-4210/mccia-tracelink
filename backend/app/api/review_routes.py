"""Unresolved link review queue endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user, require_supervisor_or_above
from ..db import connect

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/unresolved-links")
async def list_unresolved_links(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    conn = connect()
    try:
        total = conn.execute(
            "SELECT COUNT(*) as cnt FROM production_batches WHERE inferred_batch_id = 1"
        ).fetchone()["cnt"]

        rows = conn.execute("""
            SELECT p.production_id, p.batch_id, p.input_lot_ref, p.inference_confidence,
                   p.inference_reason, p.production_date, p.machine_id, p.operator_id,
                   COALESCE(tr.status, 'pending') as review_status,
                   tr.reviewed_by, tr.reviewed_at, tr.notes as review_notes
            FROM production_batches p
            LEFT JOIN trace_reviews tr ON tr.batch_id = p.batch_id AND tr.lot_number = p.input_lot_ref
            WHERE p.inferred_batch_id = 1
            ORDER BY p.inference_confidence ASC, p.production_date DESC
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()

        return {
            "unresolved_links": [dict(r) for r in rows],
            "total_count": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total,
        }
    finally:
        conn.close()


@router.post("/unresolved-links/{production_id}/approve")
async def approve_link(production_id: int, notes: str = "", user: dict = Depends(require_supervisor_or_above)):
    conn = connect()
    try:
        prod = conn.execute(
            "SELECT batch_id, input_lot_ref FROM production_batches WHERE production_id = ?",
            (production_id,),
        ).fetchone()
        if not prod:
            raise HTTPException(status_code=404, detail="Production record not found")

        # Upsert review record
        conn.execute("""
            INSERT INTO trace_reviews (batch_id, lot_number, status, reviewed_by, notes)
            VALUES (?, ?, 'approved', ?, ?)
            ON CONFLICT(batch_id, lot_number) DO UPDATE SET
                status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, notes = ?
        """, (prod["batch_id"], prod["input_lot_ref"], user.get("email"), notes,
              user.get("email"), notes))
        conn.commit()
        return {"status": "approved", "production_id": production_id, "reviewer": user.get("email")}
    finally:
        conn.close()


@router.post("/unresolved-links/{production_id}/reject")
async def reject_link(production_id: int, notes: str = "", user: dict = Depends(require_supervisor_or_above)):
    conn = connect()
    try:
        prod = conn.execute(
            "SELECT batch_id, input_lot_ref FROM production_batches WHERE production_id = ?",
            (production_id,),
        ).fetchone()
        if not prod:
            raise HTTPException(status_code=404, detail="Production record not found")

        conn.execute("""
            INSERT INTO trace_reviews (batch_id, lot_number, status, reviewed_by, notes)
            VALUES (?, ?, 'rejected', ?, ?)
            ON CONFLICT(batch_id, lot_number) DO UPDATE SET
                status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, notes = ?
        """, (prod["batch_id"], prod["input_lot_ref"], user.get("email"), notes,
              user.get("email"), notes))
        conn.commit()
        return {"status": "rejected", "production_id": production_id, "reviewer": user.get("email")}
    finally:
        conn.close()
