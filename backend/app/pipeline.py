"""Data pipeline: schema creation, CSV loading, and database rebuild.

Production schema includes: users, audit_events, source_files, source_rows,
import_errors, trace_reviews, corrective_actions, and enhanced operator_entries.
"""
from __future__ import annotations

import csv
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from dateutil import parser

from .db import DATA_FILES, DB_PATH
from .linking import normalize_defect_type, split_batches


def parse_date(value: str | None) -> str | None:
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return parser.parse(text, dayfirst=True).date().isoformat()


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return [dict(row) for row in csv.DictReader(fh)]


def exec_many(conn: sqlite3.Connection, sql: str, rows: list[tuple[Any, ...]]) -> None:
    if rows:
        conn.executemany(sql, rows)


def rebuild_database(db_path: Path = DB_PATH) -> dict[str, Any]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        stats = load_all(conn)
        create_indexes(conn)
        conn.commit()
        return {"status": "rebuilt", "database": str(db_path), **stats}
    finally:
        conn.close()


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript('''
    -- ── Core domain tables ──────────────────────────────────────
    CREATE TABLE suppliers (
        supplier_id TEXT PRIMARY KEY,
        supplier_name TEXT,
        material_supplied TEXT,
        lead_time_days INTEGER,
        approved_status TEXT
    );

    CREATE TABLE raw_materials (
        raw_id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_date TEXT,
        supplier_id TEXT,
        material_type TEXT,
        lot_number TEXT,
        quantity_kg REAL,
        quality_grade TEXT,
        inspector_name TEXT,
        missing_lot_number INTEGER DEFAULT 0
    );

    CREATE TABLE production_batches (
        production_id INTEGER PRIMARY KEY AUTOINCREMENT,
        production_date TEXT,
        shift TEXT,
        machine_id TEXT,
        operator_id TEXT,
        batch_id TEXT,
        input_lot_ref TEXT,
        units_produced INTEGER,
        cycle_time_min REAL,
        inferred_batch_id INTEGER DEFAULT 0,
        inference_confidence REAL DEFAULT 1.0,
        inference_reason TEXT
    );

    CREATE TABLE qc_inspections (
        batch_id TEXT PRIMARY KEY,
        inspection_date TEXT,
        inspector_id TEXT,
        pass_fail TEXT,
        defect_type_raw TEXT,
        defect_type_normalized TEXT,
        defect_rate_pct REAL,
        rework_flag TEXT
    );

    CREATE TABLE dispatch_orders (
        order_id TEXT PRIMARY KEY,
        dispatch_date TEXT,
        customer_id TEXT,
        product_type TEXT,
        quantity INTEGER,
        batch_ref TEXT,
        vehicle_number TEXT
    );

    CREATE TABLE dispatch_batches (
        order_id TEXT,
        batch_id TEXT,
        PRIMARY KEY(order_id, batch_id)
    );

    CREATE TABLE complaints (
        complaint_id TEXT PRIMARY KEY,
        oem_id TEXT,
        complaint_date TEXT,
        affected_order_ids TEXT,
        defect_description TEXT,
        root_cause_identified TEXT,
        resolution TEXT,
        financial_impact_inr REAL
    );

    -- ── Operator entries (enhanced for Week 5-6) ────────────────
    CREATE TABLE operator_entries (
        entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        production_date TEXT,
        shift TEXT,
        machine_id TEXT,
        operator_id TEXT,
        raw_lot TEXT,
        units_produced INTEGER,
        qc_notes TEXT,
        sync_source TEXT DEFAULT 'web',
        client_entry_id TEXT UNIQUE,
        device_id TEXT,
        created_offline_at TEXT,
        synced_at TEXT,
        sync_attempt_count INTEGER DEFAULT 0,
        entry_version INTEGER DEFAULT 1,
        user_id TEXT,
        supervisor_approved INTEGER DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT
    );

    -- ── Auth tables (Week 1) ────────────────────────────────────
    CREATE TABLE users (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'operator',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Audit events (Week 4) ───────────────────────────────────
    CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        user_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        request_ip TEXT,
        request_id TEXT,
        response_status INTEGER,
        result_summary TEXT,
        duration_ms REAL
    );

    -- ── Import tracking (Week 4) ────────────────────────────────
    CREATE TABLE source_files (
        import_id TEXT PRIMARY KEY,
        filename TEXT,
        file_type TEXT,
        uploader TEXT,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT,
        row_count INTEGER DEFAULT 0,
        valid_rows INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
    );

    CREATE TABLE source_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id TEXT,
        row_number INTEGER,
        raw_json TEXT,
        validation_status TEXT DEFAULT 'valid',
        FOREIGN KEY (import_id) REFERENCES source_files(import_id)
    );

    CREATE TABLE import_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id TEXT,
        row_number INTEGER,
        field_name TEXT,
        error_message TEXT,
        FOREIGN KEY (import_id) REFERENCES source_files(import_id)
    );

    -- ── Trace reviews (Week 7-8) ────────────────────────────────
    CREATE TABLE trace_reviews (
        batch_id TEXT,
        lot_number TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        PRIMARY KEY(batch_id, lot_number)
    );

    -- ── Corrective actions / CAPA (Week 7-8) ────────────────────
    CREATE TABLE corrective_actions (
        ca_id TEXT PRIMARY KEY,
        triggered_by TEXT,
        status TEXT DEFAULT 'open',
        assigned_to TEXT,
        root_cause TEXT,
        immediate_action TEXT,
        corrective_action TEXT,
        preventive_action TEXT,
        due_date TEXT,
        closed_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
    );
    ''')


def load_all(conn: sqlite3.Connection) -> dict[str, Any]:
    suppliers = read_csv(DATA_FILES["supplier"])
    exec_many(conn, "INSERT INTO suppliers VALUES (?, ?, ?, ?, ?)", [(r["supplier_id"], r["supplier_name"], r["material_supplied"], int(r["lead_time_days"]), r["approved_status"]) for r in suppliers if r.get("supplier_id")])

    raw = read_csv(DATA_FILES["raw"])
    exec_many(conn, "INSERT INTO raw_materials (receipt_date, supplier_id, material_type, lot_number, quantity_kg, quality_grade, inspector_name, missing_lot_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [(parse_date(r.get("receipt_date")), r.get("supplier_id"), r.get("material_type"), clean_text(r.get("lot_number")), to_float(r.get("quantity_kg")), r.get("quality_grade"), r.get("inspector_name"), 0 if clean_text(r.get("lot_number")) else 1) for r in raw])

    production = read_csv(DATA_FILES["production"])
    production_rows = []
    inferred = 0
    for idx, r in enumerate(production):
        batch_id = clean_text(r.get("batch_id"))
        inferred_flag = 0
        confidence = 1.0
        reason = "source batch_id present"
        if not batch_id:
            batch_id = infer_missing_batch_id(production, idx)
            inferred_flag = 1 if batch_id else 0
            confidence = 0.82 if batch_id else 0.0
            reason = "inferred from neighboring sequential batch IDs" if batch_id else "unresolved missing batch_id"
            if batch_id:
                inferred += 1
        production_rows.append((parse_date(r.get("date")), r.get("shift"), r.get("machine_id"), r.get("operator_id"), batch_id, clean_text(r.get("input_lot_ref")), to_int(r.get("units_produced")), to_float(r.get("cycle_time_min")), inferred_flag, confidence, reason))
    exec_many(conn, "INSERT INTO production_batches (production_date, shift, machine_id, operator_id, batch_id, input_lot_ref, units_produced, cycle_time_min, inferred_batch_id, inference_confidence, inference_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", production_rows)

    qc = read_csv(DATA_FILES["qc"])
    exec_many(conn, "INSERT OR REPLACE INTO qc_inspections VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [(r.get("batch_id"), parse_date(r.get("inspection_date")), r.get("inspector_id"), r.get("pass_fail"), r.get("defect_type"), normalize_defect_type(r.get("defect_type")), to_float(r.get("defect_rate_pct")), r.get("rework_flag")) for r in qc if r.get("batch_id")])

    dispatch = read_csv(DATA_FILES["dispatch"])
    exec_many(conn, "INSERT OR REPLACE INTO dispatch_orders VALUES (?, ?, ?, ?, ?, ?, ?)", [(r.get("order_id"), parse_date(r.get("dispatch_date")), r.get("customer_id"), r.get("product_type"), to_int(r.get("quantity")), r.get("batch_ref"), r.get("vehicle_number")) for r in dispatch if r.get("order_id")])
    dispatch_batch_rows = []
    for r in dispatch:
        for batch_id in split_batches(r.get("batch_ref")):
            dispatch_batch_rows.append((r.get("order_id"), batch_id))
    exec_many(conn, "INSERT OR IGNORE INTO dispatch_batches VALUES (?, ?)", dispatch_batch_rows)

    complaints = read_csv(DATA_FILES["complaints"])
    exec_many(conn, "INSERT OR REPLACE INTO complaints VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [(r.get("complaint_id"), r.get("oem_id"), parse_date(r.get("complaint_date")), r.get("affected_order_ids"), r.get("defect_description"), r.get("root_cause_identified"), r.get("resolution"), to_float(r.get("financial_impact_inr"))) for r in complaints if r.get("complaint_id")])

    return {"raw_materials": len(raw), "production_batches": len(production), "missing_batch_ids_inferred": inferred, "qc_inspections": len(qc), "dispatch_orders": len(dispatch), "dispatch_batch_links": len(dispatch_batch_rows), "suppliers": len(suppliers), "complaints": len(complaints)}


def create_indexes(conn: sqlite3.Connection) -> None:
    conn.executescript('''
    CREATE INDEX idx_raw_lot ON raw_materials(lot_number);
    CREATE INDEX idx_prod_batch ON production_batches(batch_id);
    CREATE INDEX idx_prod_lot ON production_batches(input_lot_ref);
    CREATE INDEX idx_dispatch_batch_batch ON dispatch_batches(batch_id);
    CREATE INDEX idx_dispatch_date ON dispatch_orders(dispatch_date);
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_audit_timestamp ON audit_events(timestamp);
    CREATE INDEX idx_audit_user ON audit_events(user_email);
    CREATE INDEX idx_source_files_checksum ON source_files(checksum);
    CREATE INDEX idx_operator_client_id ON operator_entries(client_entry_id);
    CREATE INDEX idx_trace_reviews ON trace_reviews(batch_id, lot_number);
    CREATE INDEX idx_ca_status ON corrective_actions(status);
    ''')


def seed_default_admin(conn: sqlite3.Connection) -> None:
    """Seed the default admin user if users table is empty."""
    from .config import settings
    from .auth import get_password_hash
    import uuid

    count = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()[0]
    if count == 0:
        user_id = str(uuid.uuid4())
        password_hash = get_password_hash(settings.DEFAULT_ADMIN_PASSWORD)
        conn.execute(
            "INSERT INTO users (user_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, settings.DEFAULT_ADMIN_EMAIL, password_hash, "System Admin", "admin"),
        )
        conn.commit()


def ensure_users_table(conn: sqlite3.Connection) -> None:
    """Create users table if it doesn't exist (for upgrades from old schema)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'operator',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Also ensure all production tables exist for upgrades
    for table_sql in [
        "CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, user_id TEXT, user_email TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, request_ip TEXT, request_id TEXT, response_status INTEGER, result_summary TEXT, duration_ms REAL)",
        "CREATE TABLE IF NOT EXISTS source_files (import_id TEXT PRIMARY KEY, filename TEXT, file_type TEXT, uploader TEXT, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP, checksum TEXT, row_count INTEGER DEFAULT 0, valid_rows INTEGER DEFAULT 0, error_count INTEGER DEFAULT 0, status TEXT DEFAULT 'pending')",
        "CREATE TABLE IF NOT EXISTS source_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT, row_number INTEGER, raw_json TEXT, validation_status TEXT DEFAULT 'valid')",
        "CREATE TABLE IF NOT EXISTS import_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT, row_number INTEGER, field_name TEXT, error_message TEXT)",
        "CREATE TABLE IF NOT EXISTS trace_reviews (batch_id TEXT, lot_number TEXT, status TEXT DEFAULT 'pending', reviewed_by TEXT, reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT, PRIMARY KEY(batch_id, lot_number))",
        "CREATE TABLE IF NOT EXISTS corrective_actions (ca_id TEXT PRIMARY KEY, triggered_by TEXT, status TEXT DEFAULT 'open', assigned_to TEXT, root_cause TEXT, immediate_action TEXT, corrective_action TEXT, preventive_action TEXT, due_date TEXT, closed_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, created_by TEXT)",
    ]:
        conn.execute(table_sql)

    # Ensure operator_entries has new columns
    try:
        conn.execute("SELECT client_entry_id FROM operator_entries LIMIT 1")
    except Exception:
        for col_sql in [
            "ALTER TABLE operator_entries ADD COLUMN client_entry_id TEXT",
            "ALTER TABLE operator_entries ADD COLUMN device_id TEXT",
            "ALTER TABLE operator_entries ADD COLUMN created_offline_at TEXT",
            "ALTER TABLE operator_entries ADD COLUMN synced_at TEXT",
            "ALTER TABLE operator_entries ADD COLUMN sync_attempt_count INTEGER DEFAULT 0",
            "ALTER TABLE operator_entries ADD COLUMN entry_version INTEGER DEFAULT 1",
            "ALTER TABLE operator_entries ADD COLUMN user_id TEXT",
            "ALTER TABLE operator_entries ADD COLUMN supervisor_approved INTEGER DEFAULT 0",
            "ALTER TABLE operator_entries ADD COLUMN approved_by TEXT",
            "ALTER TABLE operator_entries ADD COLUMN approved_at TEXT",
        ]:
            try:
                conn.execute(col_sql)
            except Exception:
                pass

    conn.commit()


def infer_missing_batch_id(rows: list[dict[str, Any]], idx: int) -> str | None:
    prev_id = next_batch_id(rows, idx, -1)
    next_id = next_batch_id(rows, idx, 1)
    if not prev_id or not next_id:
        return None
    prev_num = batch_num(prev_id)
    next_num = batch_num(next_id)
    if prev_num is None or next_num is None:
        return None
    gap = next_num - prev_num
    if 1 < gap <= 8:
        prefix = prev_id.rsplit('-', 1)[0]
        return f"{prefix}-{prev_num + 1:04d}"
    return None


def next_batch_id(rows: list[dict[str, Any]], idx: int, step: int) -> str | None:
    pos = idx + step
    while 0 <= pos < len(rows) and abs(pos - idx) <= 8:
        value = clean_text(rows[pos].get("batch_id"))
        if value:
            return value
        pos += step
    return None


def batch_num(batch_id: str) -> int | None:
    try:
        return int(batch_id.rsplit('-', 1)[1])
    except (IndexError, ValueError):
        return None


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def to_int(value: Any) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except ValueError:
        return None


def to_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None
