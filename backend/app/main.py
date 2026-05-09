"""TraceLink production API.

STARTUP-01 FIX: Uses FastAPI lifespan instead of deprecated @app.on_event("startup").
AUTH-01 FIX: All endpoints are protected with JWT auth and role-based access control.
"""
from __future__ import annotations

import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import DB_PATH, ROOT_DIR, connect, row_to_dict
from .auth import get_current_user, require_admin, require_operator_or_above
from .linking import best_raw_candidate
from .middleware import AuditMiddleware
from .pipeline import rebuild_database, ensure_users_table
from .schemas import BatchEntry

# ── API route imports ────────────────────────────────────────────
from .api.auth_routes import router as auth_router
from .api.trace_routes import router as trace_router
from .api.alert_routes import router as alert_router
from .api.operator_routes import router as operator_router
from .api.import_routes import router as import_router
from .api.dashboard_routes import router as dashboard_router
from .api.compliance_routes import router as compliance_router
from .api.review_routes import router as review_router
from .api.admin_routes import router as admin_router
from .api.ai_routes import router as ai_router

# ── CORS config ──────────────────────────────────────────────────
_cors_raw = settings.CORS_ORIGINS.strip()
if _cors_raw == "*" or not _cors_raw:
    _allow_origins = ["*"]
    _allow_credentials = False
else:
    _allow_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
    _allow_credentials = True

STATIC_DIR = Path(
    os.environ.get("FRONTEND_DIST", str(ROOT_DIR / "frontend" / "dist"))
).resolve()


# ── Lifespan (STARTUP-01 fix) ───────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if not DB_PATH.exists():
        rebuild_database()

    # Ensure production tables exist (safe for upgrades)
    conn = connect()
    try:
        ensure_users_table(conn)
    finally:
        conn.close()

    yield
    # Shutdown (nothing needed yet)


app = FastAPI(
    title="TraceLink",
    version="1.0.0",
    description="Manufacturing traceability control system",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit middleware
app.add_middleware(AuditMiddleware)


# ── Mount versioned API routes ───────────────────────────────────
app.include_router(auth_router, prefix="/api/v1")
app.include_router(trace_router, prefix="/api/v1")
app.include_router(alert_router, prefix="/api/v1")
app.include_router(operator_router, prefix="/api/v1")
app.include_router(import_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(compliance_router, prefix="/api/v1")
app.include_router(review_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")


# ── Public health endpoint ───────────────────────────────────────
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "database_exists": DB_PATH.exists(), "database": str(DB_PATH)}


# ── Protected legacy endpoints (backward compat with frontend) ──
@app.post("/api/rebuild")
def rebuild(admin: dict = Depends(require_admin)) -> dict[str, Any]:
    return rebuild_database()


@app.get("/api/trace/dispatch/{order_id}")
def trace_dispatch(order_id: str, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        user_id = user.get("user_id")
        dispatch = row_to_dict(conn.execute("SELECT * FROM dispatch_orders WHERE order_id = ? AND user_id = ?", (order_id, user_id)).fetchone())
        if not dispatch:
            raise HTTPException(status_code=404, detail=f"Dispatch order {order_id} not found")
        batches = []
        for link in conn.execute("SELECT batch_id FROM dispatch_batches WHERE order_id = ? AND user_id = ? ORDER BY batch_id", (order_id, user_id)).fetchall():
            batch_id = link["batch_id"]
            production = row_to_dict(conn.execute("SELECT * FROM production_batches WHERE batch_id = ? AND user_id = ? ORDER BY inferred_batch_id LIMIT 1", (batch_id, user_id)).fetchone())
            qc = row_to_dict(conn.execute("SELECT * FROM qc_inspections WHERE batch_id = ? AND user_id = ?", (batch_id, user_id)).fetchone())
            raw = resolve_raw(conn, production, qc, user_id) if production else None
            batches.append({"batch_id": batch_id, "production": production, "qc": qc, "raw_material": raw})
        return {"query_ms": round((time.perf_counter() - start) * 1000, 2), "dispatch": dispatch, "batches": batches}
    finally:
        conn.close()


@app.get("/api/alerts/lot/{lot_number}")
def lot_alert(lot_number: str, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        user_id = user.get("user_id")
        productions = [dict(r) for r in conn.execute("SELECT * FROM production_batches WHERE input_lot_ref = ? AND user_id = ? AND batch_id IS NOT NULL", (lot_number, user_id)).fetchall()]
        batch_ids = [p["batch_id"] for p in productions]
        affected = []
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
                affected.append(dict(row))

        # Compute failed batches from QC data
        failed_batches = []
        for batch_id in batch_ids:
            qc = conn.execute("SELECT pass_fail FROM qc_inspections WHERE batch_id = ? AND user_id = ?", (batch_id, user_id)).fetchone()
            if qc and qc["pass_fail"] == "FAIL":
                failed_batches.append(batch_id)

        return {
            "query_ms": round((time.perf_counter() - start) * 1000, 2),
            "lot_number": lot_number,
            "production_batches": productions,
            "failed_anchor_batches": failed_batches,
            "affected_dispatch_orders": affected,
            "summary": {"batch_count": len(batch_ids), "dispatch_order_count": len(affected)},
        }
    finally:
        conn.close()


def resolve_raw(conn, production: dict[str, Any] | None, qc: dict[str, Any] | None, user_id: str) -> dict[str, Any] | None:
    if not production or not production.get("input_lot_ref"):
        return None
    suppliers = {r["supplier_id"]: dict(r) for r in conn.execute("SELECT * FROM suppliers WHERE user_id = ?", (user_id,)).fetchall()}
    complaint_rows = conn.execute("SELECT defect_description, root_cause_identified FROM complaints WHERE root_cause_identified LIKE ? AND user_id = ?", (f"%{production['input_lot_ref']}%", user_id)).fetchall()
    complaint_text = " ".join(" ".join(str(v or "") for v in dict(row).values()) for row in complaint_rows)
    candidates = [dict(r) for r in conn.execute("SELECT * FROM raw_materials WHERE lot_number = ? AND user_id = ?", (production["input_lot_ref"], user_id)).fetchall()]
    best = best_raw_candidate(candidates, suppliers, qc, complaint_text)
    if not best:
        return None
    supplier = suppliers.get(best.get("supplier_id"), {})
    return {**best, "supplier": supplier}


# ── Runtime frontend configuration ───────────────────────────────
@app.get("/env.js", include_in_schema=False)
def frontend_env() -> Response:
    keys = [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID",
        "VITE_FIREBASE_MEASUREMENT_ID",
    ]
    payload = {key: os.environ.get(key, "") for key in keys}
    body = f"window.__TRACELINK_ENV__ = {json.dumps(payload)};"
    return Response(content=body, media_type="application/javascript")


# ── SPA frontend serving ─────────────────────────────────────────
def _mount_frontend() -> None:
    if not STATIC_DIR.is_dir():
        return
    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/", include_in_schema=False)
    def spa_root() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        root = STATIC_DIR.resolve()
        target = (STATIC_DIR / full_path).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            raise HTTPException(status_code=404) from None
        if target.is_file():
            return FileResponse(target)
        return FileResponse(STATIC_DIR / "index.html")


_mount_frontend()
