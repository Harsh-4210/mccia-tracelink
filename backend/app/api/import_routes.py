"""CSV/Excel import endpoints with validation, source file tracking, and error reporting."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import require_admin, require_quality_or_above
from ..db import connect
from ..pipeline import parse_date

router = APIRouter(prefix="/imports", tags=["imports"])

# Required columns by file type
REQUIRED_COLUMNS: dict[str, list[str]] = {
    "raw_materials": ["receipt_date", "supplier_id", "material_type", "lot_number", "quantity_kg"],
    "production": ["date", "shift", "machine_id", "operator_id", "batch_id", "input_lot_ref", "units_produced"],
    "qc": ["batch_id", "inspection_date", "inspector_id", "pass_fail"],
    "dispatch": ["order_id", "dispatch_date", "customer_id", "product_type", "quantity", "batch_ref"],
    "supplier": ["supplier_id", "supplier_name", "material_supplied"],
    "complaints": ["complaint_id", "oem_id", "complaint_date", "defect_description"],
}


def validate_csv_content(content: str, file_type: str) -> tuple[list[dict], list[dict]]:
    """Parse and validate CSV content. Returns (valid_rows, errors)."""
    reader = csv.DictReader(io.StringIO(content))
    headers = reader.fieldnames or []

    required = REQUIRED_COLUMNS.get(file_type, [])
    missing_cols = [c for c in required if c not in headers]
    if missing_cols:
        return [], [{"row": 0, "field": None, "error": f"Missing required columns: {', '.join(missing_cols)}"}]

    valid_rows = []
    errors = []
    for idx, row in enumerate(reader, start=2):  # Row 1 is header
        row_errors = []
        # Check required fields
        for col in required:
            val = (row.get(col) or "").strip()
            if not val:
                row_errors.append({"row": idx, "field": col, "error": f"Required field '{col}' is empty"})

        # Date validation
        for col in [c for c in row if "date" in c.lower()]:
            val = (row.get(col) or "").strip()
            if val:
                try:
                    parse_date(val)
                except Exception:
                    row_errors.append({"row": idx, "field": col, "error": f"Invalid date format: '{val}'"})

        # Numeric checks
        for col in [c for c in row if any(k in c.lower() for k in ["quantity", "rate", "impact", "time"])]:
            val = (row.get(col) or "").strip()
            if val:
                try:
                    float(val)
                except ValueError:
                    row_errors.append({"row": idx, "field": col, "error": f"Non-numeric value: '{val}'"})

        if row_errors:
            errors.extend(row_errors)
        else:
            valid_rows.append(row)

    return valid_rows, errors


@router.post("")
async def upload_import(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    user: dict = Depends(require_quality_or_above),
):
    if file_type not in REQUIRED_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Unknown file_type '{file_type}'. Must be one of: {', '.join(REQUIRED_COLUMNS)}")

    content = (await file.read()).decode("utf-8-sig")
    checksum = hashlib.sha256(content.encode()).hexdigest()

    # Check for duplicate file
    conn = connect()
    try:
        dup = conn.execute("SELECT import_id FROM source_files WHERE checksum = ?", (checksum,)).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail=f"Duplicate file detected (matches import {dup['import_id']})")
    finally:
        conn.close()

    valid_rows, errors = validate_csv_content(content, file_type)
    row_count = len(valid_rows) + len(errors)
    import_id = str(uuid.uuid4())[:12]

    # Determine status
    error_threshold = max(1, int(row_count * 0.1))  # 10% error threshold
    if len(errors) > error_threshold:
        status = "rejected"
    elif errors:
        status = "partial"
    else:
        status = "validated"

    conn = connect()
    try:
        # Store source file record
        conn.execute(
            """INSERT INTO source_files
            (import_id, filename, file_type, uploader, checksum, row_count, valid_rows, error_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (import_id, file.filename, file_type, user.get("email"), checksum, row_count, len(valid_rows), len(errors), status),
        )

        # Store raw source rows
        for idx, row_data in enumerate(valid_rows):
            conn.execute(
                "INSERT INTO source_rows (import_id, row_number, raw_json, validation_status) VALUES (?, ?, ?, ?)",
                (import_id, idx + 1, json.dumps(row_data), "valid"),
            )

        # Store errors
        for err in errors:
            conn.execute(
                "INSERT INTO import_errors (import_id, row_number, field_name, error_message) VALUES (?, ?, ?, ?)",
                (import_id, err.get("row"), err.get("field"), err.get("error")),
            )

        conn.commit()

        return {
            "import_id": import_id,
            "filename": file.filename,
            "file_type": file_type,
            "row_count": row_count,
            "valid_rows": len(valid_rows),
            "error_count": len(errors),
            "status": status,
            "errors": errors[:50],  # Cap error display
        }
    finally:
        conn.close()


@router.get("/{import_id}")
async def get_import(import_id: str, user: dict = Depends(require_quality_or_above)):
    conn = connect()
    try:
        source = conn.execute("SELECT * FROM source_files WHERE import_id = ?", (import_id,)).fetchone()
        if not source:
            raise HTTPException(status_code=404, detail="Import not found")
        errors = [dict(r) for r in conn.execute(
            "SELECT * FROM import_errors WHERE import_id = ? ORDER BY row_number", (import_id,)
        ).fetchall()]
        return {**dict(source), "errors": errors}
    finally:
        conn.close()


@router.get("")
async def list_imports(user: dict = Depends(require_quality_or_above)):
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM source_files ORDER BY uploaded_at DESC LIMIT 100").fetchall()
        return {"imports": [dict(r) for r in rows]}
    finally:
        conn.close()
