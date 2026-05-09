from fastapi.testclient import TestClient

from app.auth import get_current_user, require_operator_or_above
from app.db import connect
from app.linking import normalize_defect_type, split_batches
from app.main import app
from app.pipeline import ensure_users_table, rebuild_database, seed_default_admin


TEST_ADMIN = {
    "user_id": "test-admin",
    "email": "admin@example.com",
    "full_name": "Test Admin",
    "role": "admin",
    "is_active": 1,
}


def client():
    rebuild_database()
    conn = connect()
    try:
        ensure_users_table(conn)
        seed_default_admin(conn)
    finally:
        conn.close()
    app.dependency_overrides[get_current_user] = lambda: TEST_ADMIN
    app.dependency_overrides[require_operator_or_above] = lambda: TEST_ADMIN
    return TestClient(app)


def auth_headers(c: TestClient) -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_defect_normalization_variants():
    assert normalize_defect_type("surf-delam") == "surface_delamination"
    assert normalize_defect_type("SurfDeLam") == "surface_delamination"
    assert normalize_defect_type("surface delamination") == "surface_delamination"
    assert split_batches("BATCH-1,BATCH-2") == ["BATCH-1", "BATCH-2"]


def test_trace_d_1847_full_chain():
    c = client()
    res = c.get("/api/v1/trace/dispatch/D-1847", headers=auth_headers(c))
    assert res.status_code == 200
    data = res.json()
    batch = data["batches"][0]
    assert data["dispatch"]["customer_id"] == "OEM-TATA"
    assert batch["batch_id"] == "BATCH-2023-0500"
    assert batch["production"]["input_lot_ref"] == "LOT-2023-114"
    assert batch["production"]["machine_id"] == "MC-04"
    assert batch["production"]["shift"] == "C"
    assert batch["qc"]["pass_fail"] == "FAIL"
    assert batch["qc"]["defect_type_normalized"] == "surface_delamination"
    assert batch["qc"]["defect_rate_pct"] == 5.74
    assert batch["raw_material"]["supplier_id"] == "S03"
    assert batch["raw_material"]["supplier"]["supplier_name"] == "Sundaram Clayton"
    assert data["query_ms"] < 30000


def test_lot_2023_114_alert_contains_anchor_orders():
    c = client()
    res = c.get("/api/v1/alerts/lots/LOT-2023-114", headers=auth_headers(c))
    assert res.status_code == 200
    data = res.json()
    orders = {row["order_id"] for row in data["affected_dispatch_orders"]}
    assert {"D-1847", "D-1921", "D-2044", "D-2102", "D-2367"}.issubset(orders)
    assert data["summary"]["dispatch_order_count"] >= 5
    assert data["query_ms"] < 30000


def test_operator_entry_endpoint():
    c = client()
    res = c.post("/api/v1/operator/batches", headers=auth_headers(c), json={
        "date": "2024-03-18",
        "shift": "A",
        "machine_id": "MC-04",
        "operator_id": "OP-101",
        "raw_lot": "LOT-2023-114",
        "units_produced": 120,
        "qc_notes": "visual check ok",
        "client_entry_id": "test-entry-001",
        "device_id": "test-device",
    })
    assert res.status_code == 200
    assert res.json()["status"] == "saved"
