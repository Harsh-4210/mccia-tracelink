"""Operator batch entry endpoints with idempotency (client_entry_id) and device tracking."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user, require_operator_or_above, require_supervisor_or_above
from ..db import connect
from ..schemas import BatchEntry

router = APIRouter(prefix="/operator", tags=["operator"])


@router.post("/batches")
async def create_operator_entry(entry: BatchEntry, user: dict = Depends(require_operator_or_above)):
    conn = connect()
    try:
        # Idempotency: if client_entry_id exists, return existing record
        if entry.client_entry_id:
            existing = conn.execute(
                "SELECT entry_id FROM operator_entries WHERE client_entry_id = ? AND user_id = ?",
                (entry.client_entry_id, user.get("user_id")),
            ).fetchone()
            if existing:
                return {"status": "already_saved", "entry_id": existing["entry_id"], "duplicate": True}

        cur = conn.execute(
            """INSERT INTO operator_entries
            (production_date, shift, machine_id, operator_id, raw_lot, units_produced,
             qc_notes, sync_source, client_entry_id, device_id, created_offline_at,
             synced_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)""",
            (
                entry.date, entry.shift, entry.machine_id, entry.operator_id,
                entry.raw_lot, entry.units_produced, entry.qc_notes,
                "offline" if entry.created_offline_at else "web",
                entry.client_entry_id, entry.device_id, entry.created_offline_at,
                user.get("user_id"),
            ),
        )
        conn.commit()
        return {"status": "saved", "entry_id": cur.lastrowid}
    finally:
        conn.close()


@router.get("/batches/recent")
async def recent_entries(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_operator_or_above),
):
    conn = connect()
    try:
        user_id = user.get("user_id")
        # Everyone sees only their own tenant's data
        rows = conn.execute(
            "SELECT * FROM operator_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return {"entries": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/batches/pending")
async def pending_entries(user: dict = Depends(require_supervisor_or_above)):
    """Get entries needing supervisor review within the current user's workspace."""
    conn = connect()
    try:
        user_id = user.get("user_id")
        rows = conn.execute(
            "SELECT * FROM operator_entries WHERE supervisor_approved = 0 AND user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return {"entries": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/batches/{entry_id}/approve")
async def approve_entry(entry_id: int, user: dict = Depends(require_supervisor_or_above)):
    conn = connect()
    try:
        user_id = user.get("user_id")
        conn.execute(
            "UPDATE operator_entries SET supervisor_approved = 1, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE entry_id = ? AND user_id = ?",
            (user_id, entry_id, user_id),
        )
        conn.commit()
        return {"status": "approved", "entry_id": entry_id}
    finally:
        conn.close()
