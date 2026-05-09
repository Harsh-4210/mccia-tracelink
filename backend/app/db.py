from pathlib import Path
import os
import sqlite3

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("DB_PATH", ROOT_DIR / "backend" / "tracelink.sqlite3"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DATA_FILES = {
    "raw": ROOT_DIR / "raw_materials_log.csv",
    "production": ROOT_DIR / "production_log.csv",
    "qc": ROOT_DIR / "qc_inspection.csv",
    "dispatch": ROOT_DIR / "dispatch_log.csv",
    "supplier": ROOT_DIR / "supplier_master.csv",
    "complaints": ROOT_DIR / "defect_complaints.csv",
}


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None
