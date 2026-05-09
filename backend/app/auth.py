"""Firebase Auth integration for backend.

Verifies Firebase ID tokens and maps users to local accounts.
Uses firebase-admin SDK for token verification.

NOTE: Role-based access control has been removed. All authenticated users
have full access to every feature. The require_* guards are kept as aliases
for get_current_user so existing route imports don't break.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

from .db import connect

import json
import logging
from .config import settings

logger = logging.getLogger(__name__)

# ── Firebase Admin init ──────────────────────────────────────────
_firebase_app = None

def _init_firebase():
    global _firebase_app
    if _firebase_app is not None:
        return

    try:
        if settings.FIREBASE_SERVICE_ACCOUNT_JSON.strip():
            logger.info("Initializing Firebase from environment variable")
            cred_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
            cred = credentials.Certificate(cred_dict)
        else:
            logger.info("Initializing Firebase from local service account file")
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)

        _firebase_app = firebase_admin.initialize_app(cred, {
            "projectId": settings.FIREBASE_PROJECT_ID,
        })
        logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        if not settings.FIREBASE_SERVICE_ACCOUNT_JSON.strip():
             try:
                 _firebase_app = firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
             except Exception:
                 pass

_init_firebase()


# ── Token verification ───────────────────────────────────────────
security = HTTPBearer(auto_error=False)


def verify_firebase_token(token: str) -> dict[str, Any]:
    """Verify a Firebase ID token and return the decoded claims."""
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Authentication failed: {str(e)}")


# ── User sync / lookup ───────────────────────────────────────────

def get_or_create_user(firebase_uid: str, email: str | None, display_name: str | None = None) -> dict[str, Any]:
    """Find existing user by firebase_uid or create a new one.
    
    All users get the same access level — no role differentiation.
    """
    conn = connect()
    try:
        # Look up by firebase_uid
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (firebase_uid,)).fetchone()
        if row:
            return dict(row)

        # Look up by email (migration from old system or re-registration)
        if email:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if row:
                if row["user_id"] != firebase_uid:
                    # User deleted Firebase account and signed up again with same email.
                    # Archive old email so the new account is completely isolated.
                    archived_email = f"{email}_archived_{row['user_id']}"
                    conn.execute("UPDATE users SET email = ? WHERE user_id = ?", (archived_email, row["user_id"]))
                    conn.commit()
                else:
                    return dict(row)

        # Auto-create new user
        conn.execute(
            "INSERT INTO users (user_id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            (firebase_uid, email or f"{firebase_uid}@firebase", "FIREBASE_AUTH", display_name or "", "user", 1),
        )
        conn.commit()
        return {
            "user_id": firebase_uid,
            "email": email or f"{firebase_uid}@firebase",
            "full_name": display_name or "",
            "role": "user",
            "is_active": 1,
        }
    finally:
        conn.close()


# ── FastAPI dependencies ─────────────────────────────────────────

async def get_current_user(creds=Depends(security)) -> dict[str, Any]:
    """Extract and verify the Firebase token, return the local user record."""
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    decoded = verify_firebase_token(creds.credentials)
    firebase_uid = decoded.get("uid", "")
    email = decoded.get("email")
    name = decoded.get("name")

    user = get_or_create_user(firebase_uid, email, name)
    return user


# ── Role guards (NO-OP — kept as aliases for backward compatibility) ──
# Every authenticated user passes these checks. They exist only so that
# existing route imports like `from ..auth import require_admin` keep working.
require_admin = get_current_user
require_operator_or_above = get_current_user
require_supervisor_or_above = get_current_user
require_quality_or_above = get_current_user


# ── Legacy helpers ───────────────────────────────────────────────
def get_password_hash(password: str) -> str:
    return "FIREBASE_AUTH"

def get_user_by_email(email: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

