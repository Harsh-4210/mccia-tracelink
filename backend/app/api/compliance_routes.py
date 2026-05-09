"""Corrective action (8D/CAPA) endpoints."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user, require_quality_or_above
from ..db import connect
from ..schemas import CorrectiveActionCreate, CorrectiveActionUpdate

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.post("/corrective-actions")
async def create_corrective_action(body: CorrectiveActionCreate, user: dict = Depends(require_quality_or_above)):
    conn = connect()
    try:
        ca_id = f"CA-{uuid.uuid4().hex[:8].upper()}"
        user_id = user.get("user_id")
        conn.execute(
            """INSERT INTO corrective_actions
            (ca_id, triggered_by, assigned_to, root_cause, immediate_action,
             corrective_action, preventive_action, due_date, created_by, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ca_id, body.triggered_by, body.assigned_to, body.root_cause,
             body.immediate_action, body.corrective_action, body.preventive_action,
             body.due_date, user.get("email"), user_id),
        )
        conn.commit()
        return {"ca_id": ca_id, "status": "open"}
    finally:
        conn.close()


@router.get("/corrective-actions")
async def list_corrective_actions(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    conn = connect()
    try:
        user_id = user.get("user_id")
        if status:
            rows = conn.execute(
                "SELECT * FROM corrective_actions WHERE status = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?",
                (status, user_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM corrective_actions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        return {"corrective_actions": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/corrective-actions/{ca_id}")
async def get_corrective_action(ca_id: str, user: dict = Depends(get_current_user)):
    conn = connect()
    try:
        user_id = user.get("user_id")
        row = conn.execute("SELECT * FROM corrective_actions WHERE ca_id = ? AND user_id = ?", (ca_id, user_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Corrective action not found")
        return dict(row)
    finally:
        conn.close()


@router.patch("/corrective-actions/{ca_id}")
async def update_corrective_action(ca_id: str, body: CorrectiveActionUpdate, user: dict = Depends(require_quality_or_above)):
    conn = connect()
    try:
        user_id = user.get("user_id")
        existing = conn.execute("SELECT * FROM corrective_actions WHERE ca_id = ? AND user_id = ?", (ca_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Corrective action not found")

        updates: dict[str, Any] = {}
        for field in ["status", "assigned_to", "root_cause", "immediate_action",
                       "corrective_action", "preventive_action", "due_date", "closed_date"]:
            val = getattr(body, field, None)
            if val is not None:
                updates[field] = val

        if not updates:
            return dict(existing)

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [ca_id, user_id]
        conn.execute(f"UPDATE corrective_actions SET {set_clause} WHERE ca_id = ? AND user_id = ?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM corrective_actions WHERE ca_id = ? AND user_id = ?", (ca_id, user_id)).fetchone()
        return dict(row)
    finally:
        conn.close()
