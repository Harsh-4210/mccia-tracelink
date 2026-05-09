"""Authentication endpoints — Firebase Auth integration.

Login/register is handled by Firebase on the frontend.
This module provides:
  - /firebase-sync: syncs Firebase user → local DB + returns role
  - /me: returns current user info
  - /users: admin user management + role assignment
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import (
    get_current_user,
    get_or_create_user,
    get_user_by_email,
    verify_firebase_token,
)
from ..schemas import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/firebase-sync")
async def firebase_sync(user: dict = Depends(get_current_user)):
    """Called by frontend after Firebase login to sync user record."""
    return {
        "user_id": user["user_id"],
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "role": user.get("role", "user"),
        "is_active": user.get("is_active", 1),
    }


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)):
    return UserResponse(
        user_id=user["user_id"],
        email=user.get("email", ""),
        full_name=user.get("full_name"),
        role=user.get("role", "user"),
        is_active=user.get("is_active", 1),
    )


@router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    from ..db import connect
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT user_id, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        return {"users": [dict(r) for r in rows]}
    finally:
        conn.close()
