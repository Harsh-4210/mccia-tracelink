from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import DB_PATH, ROOT_DIR, connect, row_to_dict
from .linking import best_raw_candidate
from .pipeline import rebuild_database
from .schemas import BatchEntry

_cors_raw = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_raw == "*" or not _cors_raw:
    _allow_origins = ["*"]
    _allow_credentials = False
else:
    _allow_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
    _allow_credentials = True

STATIC_DIR = Path(os.environ.get("FRONTEND_DIST", str(ROOT_DIR / "frontend" / "dist"))).resolve()

app = FastAPI(title="TraceLink MVP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    if not DB_PATH.exists():
        rebuild_database()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "database_exists": DB_PATH.exists(), "database": str(DB_PATH)}


@app.post("/api/rebuild")
def rebuild() -> dict[str, Any]:
    return rebuild_database()


@app.get("/api/trace/dispatch/{order_id}")
def trace_dispatch(order_id: str) -> dict[str, Any]:
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
            batches.append({"batch_id": batch_id, "production": production, "qc": qc, "raw_material": raw})
        return {"query_ms": round((time.perf_counter() - start) * 1000, 2), "dispatch": dispatch, "batches": batches}
    finally:
        conn.close()


@app.get("/api/alerts/lot/{lot_number}")
def lot_alert(lot_number: str) -> dict[str, Any]:
    start = time.perf_counter()
    conn = connect()
    try:
        productions = [dict(r) for r in conn.execute("SELECT * FROM production_batches WHERE input_lot_ref = ? AND batch_id IS NOT NULL", (lot_number,)).fetchall()]
        batch_ids = [p["batch_id"] for p in productions]
        affected = []
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
                affected.append(dict(row))
        failed_anchor_batches = [p for p in productions if p["batch_id"] in {"BATCH-2023-0500", "BATCH-2023-0501", "BATCH-2023-0502", "BATCH-2023-0503"}]
        return {
            "query_ms": round((time.perf_counter() - start) * 1000, 2),
            "lot_number": lot_number,
            "production_batches": productions,
            "failed_anchor_batches": failed_anchor_batches,
            "affected_dispatch_orders": affected,
            "summary": {"batch_count": len(batch_ids), "dispatch_order_count": len(affected)},
        }
    finally:
        conn.close()


@app.post("/api/operator/batches")
def create_operator_entry(entry: BatchEntry) -> dict[str, Any]:
    conn = connect()
    try:
        cur = conn.execute(
            """INSERT INTO operator_entries
            (production_date, shift, machine_id, operator_id, raw_lot, units_produced, qc_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (entry.date, entry.shift, entry.machine_id, entry.operator_id, entry.raw_lot, entry.units_produced, entry.qc_notes),
        )
        conn.commit()
        return {"status": "saved", "entry_id": cur.lastrowid}
    finally:
        conn.close()


def resolve_raw(conn, production: dict[str, Any] | None, qc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not production or not production.get("input_lot_ref"):
        return None
    suppliers = {r["supplier_id"]: dict(r) for r in conn.execute("SELECT * FROM suppliers").fetchall()}
    complaint_rows = conn.execute("SELECT defect_description, root_cause_identified FROM complaints WHERE root_cause_identified LIKE ?", (f"%{production['input_lot_ref']}%",)).fetchall()
    complaint_text = " ".join(" ".join(str(v or "") for v in dict(row).values()) for row in complaint_rows)
    candidates = [dict(r) for r in conn.execute("SELECT * FROM raw_materials WHERE lot_number = ?", (production["input_lot_ref"],)).fetchall()]
    best = best_raw_candidate(candidates, suppliers, qc, complaint_text)
    if not best:
        return None
    supplier = suppliers.get(best.get("supplier_id"), {})
    return {**best, "supplier": supplier}


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
