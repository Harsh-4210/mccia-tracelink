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
    conn.row_factory = sqlite3.Row
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
    """Load the bundled CSV dataset used for demos, tests, and fresh local DBs."""
    file_order = [
        ("supplier", "supplier"),
        ("raw", "raw_materials"),
        ("production", "production"),
        ("qc", "qc"),
        ("dispatch", "dispatch"),
        ("complaints", "complaints"),
    ]

    stats: dict[str, Any] = {
        "raw_materials": 0,
        "production_batches": 0,
        "missing_batch_ids_inferred": 0,
        "qc_inspections": 0,
        "dispatch_orders": 0,
        "dispatch_batch_links": 0,
        "suppliers": 0,
        "complaints": 0,
    }

    for data_key, file_type in file_order:
        path = DATA_FILES[data_key]
        if not path.exists():
            continue
        rows = read_csv(path)
        result = process_domain_import(conn, file_type, rows)
        if file_type == "production":
            stats["missing_batch_ids_inferred"] = result.get("total_missing", 0)

    stats["suppliers"] = conn.execute("SELECT COUNT(*) FROM suppliers").fetchone()[0]
    stats["raw_materials"] = conn.execute("SELECT COUNT(*) FROM raw_materials").fetchone()[0]
    stats["production_batches"] = conn.execute("SELECT COUNT(*) FROM production_batches").fetchone()[0]
    stats["qc_inspections"] = conn.execute("SELECT COUNT(*) FROM qc_inspections").fetchone()[0]
    stats["dispatch_orders"] = conn.execute("SELECT COUNT(*) FROM dispatch_orders").fetchone()[0]
    stats["dispatch_batch_links"] = conn.execute("SELECT COUNT(*) FROM dispatch_batches").fetchone()[0]
    stats["complaints"] = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
    return stats


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

import uuid

def process_domain_import(conn: sqlite3.Connection, file_type: str, valid_rows: list[dict[str, Any]]) -> dict[str, int]:
    imputation_stats = {"total_missing": 0, "rule1_75": 0, "rule2_45": 0, "rule3_0": 0}
    
    if file_type == "supplier":
        for r in valid_rows:
            conn.execute(
                """INSERT OR REPLACE INTO suppliers
                (supplier_id, supplier_name, material_supplied, lead_time_days, approved_status)
                VALUES (?, ?, ?, ?, ?)""",
                (
                    clean_text(r.get("supplier_id")),
                    clean_text(r.get("supplier_name")),
                    clean_text(r.get("material_supplied")),
                    to_int(r.get("lead_time_days")),
                    clean_text(r.get("approved_status")),
                ),
            )
            
    elif file_type == "raw_materials":
        for r in valid_rows:
            conn.execute(
                """INSERT OR IGNORE INTO raw_materials
                (lot_number, supplier_id, material_type, quantity_kg, receipt_date, quality_grade, inspector_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    clean_text(r.get("lot_number")),
                    clean_text(r.get("supplier_id")),
                    clean_text(r.get("material_type")),
                    to_float(r.get("quantity_kg")),
                    parse_date(r.get("receipt_date")),
                    clean_text(r.get("quality_grade")),
                    clean_text(r.get("inspector_name")),
                ),
            )

    elif file_type == "production":
        # First pass: Insert all rows with batch_id
        missing_rows = []
        for r in valid_rows:
            batch_id = clean_text(r.get("batch_id"))
            if not batch_id:
                missing_rows.append(r)
                continue
                
            input_lot_ref = clean_text(r.get("input_lot_ref"))
            prod_date_str = parse_date(r.get("date"))
            machine_id = clean_text(r.get("machine_id"))
            
            conn.execute(
                "INSERT INTO production_batches (batch_id, input_lot_ref, units_produced, production_date, machine_id, operator_id, shift, inferred_batch_id, inference_confidence, inference_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (batch_id, input_lot_ref, to_int(r.get("units_produced")), prod_date_str, machine_id, clean_text(r.get("operator_id")), clean_text(r.get("shift")), 0, 1.0, None)
            )

        # Second pass: Impute missing batch_ids using full dataset context
        # 5-tier imputation engine — picks closest date match at each tier
        for r in missing_rows:
            input_lot_ref = clean_text(r.get("input_lot_ref"))
            prod_date_str = parse_date(r.get("date"))
            machine_id = clean_text(r.get("machine_id"))
            
            imputation_stats["total_missing"] += 1
            batch_id = None
            inferred = 1
            confidence = 0.0
            reason = None
            p_date = None
            
            if prod_date_str:
                try:
                    p_date = parser.parse(prod_date_str)
                except Exception:
                    pass

            def find_closest(candidates, max_days):
                """Return the batch_id of the candidate with the closest production_date within max_days."""
                best_id = None
                best_gap = max_days + 1
                for c in candidates:
                    if c["production_date"] and p_date:
                        try:
                            c_date = parser.parse(c["production_date"])
                            gap = abs((p_date - c_date).days)
                            if gap <= max_days and gap < best_gap:
                                best_gap = gap
                                best_id = c["batch_id"]
                        except Exception:
                            continue
                return best_id

            # ── Rule 1 (90%): Same lot + same machine, ±7 days ──
            if not batch_id and input_lot_ref and machine_id and p_date:
                candidates = conn.execute(
                    "SELECT batch_id, production_date FROM production_batches WHERE input_lot_ref = ? AND machine_id = ? AND inferred_batch_id = 0",
                    (input_lot_ref, machine_id)
                ).fetchall()
                match = find_closest(candidates, 7)
                if match:
                    batch_id = match
                    confidence = 0.90
                    reason = "Rule 1: Same lot + same machine, ±7 days (closest date)"
                    imputation_stats["rule1_75"] += 1

            # ── Rule 2 (75%): Same lot, ±14 days ──
            if not batch_id and input_lot_ref and p_date:
                candidates = conn.execute(
                    "SELECT batch_id, production_date FROM production_batches WHERE input_lot_ref = ? AND inferred_batch_id = 0",
                    (input_lot_ref,)
                ).fetchall()
                match = find_closest(candidates, 14)
                if match:
                    batch_id = match
                    confidence = 0.75
                    reason = "Rule 2: Same lot, ±14 days (closest date)"
                    imputation_stats["rule2_45"] += 1

            # ── Rule 3 (55%): Same lot, ±30 days ──
            if not batch_id and input_lot_ref and p_date:
                candidates = conn.execute(
                    "SELECT batch_id, production_date FROM production_batches WHERE input_lot_ref = ? AND inferred_batch_id = 0",
                    (input_lot_ref,)
                ).fetchall()
                match = find_closest(candidates, 30)
                if match:
                    batch_id = match
                    confidence = 0.55
                    reason = "Rule 3: Same lot, ±30 days (closest date)"
                    imputation_stats.setdefault("rule3_55", 0)
                    imputation_stats["rule3_55"] += 1

            # ── Rule 4 (30%): Same lot, nearest neighbor (any distance) ──
            if not batch_id and input_lot_ref:
                candidates = conn.execute(
                    "SELECT batch_id, production_date FROM production_batches WHERE input_lot_ref = ? AND inferred_batch_id = 0",
                    (input_lot_ref,)
                ).fetchall()
                if candidates:
                    if p_date:
                        # pick the closest by date
                        best_id = None
                        best_gap = float("inf")
                        for c in candidates:
                            if c["production_date"]:
                                try:
                                    gap = abs((p_date - parser.parse(c["production_date"])).days)
                                    if gap < best_gap:
                                        best_gap = gap
                                        best_id = c["batch_id"]
                                except Exception:
                                    continue
                        if best_id:
                            batch_id = best_id
                    else:
                        # no date, just pick the first known batch for this lot
                        batch_id = candidates[0]["batch_id"]
                    if batch_id:
                        confidence = 0.30
                        reason = "Rule 4: Same lot, nearest neighbor (wide temporal gap)"
                        imputation_stats.setdefault("rule4_30", 0)
                        imputation_stats["rule4_30"] += 1

            # ── Rule 5 (0%): No match — synthetic ID ──
            if not batch_id:
                batch_id = "SYN-" + str(uuid.uuid4())[:8].upper()
                confidence = 0.0
                reason = "Rule 5: No match found, synthetic ID generated"
                imputation_stats["rule3_0"] += 1

            conn.execute(
                "INSERT INTO production_batches (batch_id, input_lot_ref, units_produced, production_date, machine_id, operator_id, shift, inferred_batch_id, inference_confidence, inference_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (batch_id, input_lot_ref, to_int(r.get("units_produced")), prod_date_str, machine_id, clean_text(r.get("operator_id")), clean_text(r.get("shift")), inferred, confidence, reason)
            )

    elif file_type == "qc":
        for r in valid_rows:
            batch_id = clean_text(r.get("batch_id"))
            conn.execute("INSERT OR REPLACE INTO qc_inspections (batch_id, inspection_date, inspector_id, pass_fail, defect_type_raw, defect_rate_pct, defect_type_normalized) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (batch_id, parse_date(r.get("inspection_date")), clean_text(r.get("inspector_id")), clean_text(r.get("pass_fail")), clean_text(r.get("defect_type")), to_float(r.get("defect_rate_pct")), normalize_defect_type(r.get("defect_type"))))
                         
    elif file_type == "dispatch":
        for r in valid_rows:
            order_id = clean_text(r.get("order_id"))
            conn.execute("INSERT OR REPLACE INTO dispatch_orders (order_id, dispatch_date, customer_id, product_type, quantity, batch_ref, vehicle_number) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (order_id, parse_date(r.get("dispatch_date")), clean_text(r.get("customer_id")), clean_text(r.get("product_type")), to_int(r.get("quantity")), clean_text(r.get("batch_ref")), clean_text(r.get("vehicle_number"))))
            batches_str = clean_text(r.get("batch_ref"))
            if batches_str:
                for b in split_batches(batches_str):
                    conn.execute("INSERT OR IGNORE INTO dispatch_batches (order_id, batch_id) VALUES (?, ?)",
                                 (order_id, b))
                                 
    elif file_type == "complaints":
        for r in valid_rows:
            conn.execute("INSERT OR REPLACE INTO complaints (complaint_id, oem_id, complaint_date, affected_order_ids, defect_description, root_cause_identified, resolution, financial_impact_inr) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                         (clean_text(r.get("complaint_id")), clean_text(r.get("oem_id")), parse_date(r.get("complaint_date")), clean_text(r.get("affected_order_ids")), clean_text(r.get("defect_description")), clean_text(r.get("root_cause_identified")), clean_text(r.get("resolution")), to_float(r.get("financial_impact_inr"))))
                         
    return imputation_stats
