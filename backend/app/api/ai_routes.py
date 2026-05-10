"""AI Query endpoints for natural language interface."""
from __future__ import annotations

import time
import re
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user
from ..db import connect

router = APIRouter(prefix="/ai", tags=["ai"])

class QueryRequest(BaseModel):
    query: str

@router.post("/query")
async def ai_query(req: QueryRequest, user: dict = Depends(get_current_user)):
    start = time.perf_counter()
    conn = connect()
    q = req.query.lower().strip()
    user_id = user.get("user_id")
    
    response = {
        "text": "",
        "data": None,
        "type": "text"
    }

    try:
        # ── Greetings ───────────────────────────────────────────
        if q in ["hi", "hello", "hey", "greetings", "good morning", "good afternoon"]:
            response["text"] = "Hello! I am your TraceLink AI Assistant. I'm here to help you navigate your supply chain data. You can ask me about lot tracing, machine performance, or recent QC failures. What's on your mind today?"
            response["type"] = "help"

        # ── Shift Intelligence ──────────────────────────────────
        elif "worst shift" in q or ("shift" in q and ("fail" in q or "performance" in q or "best" in q or "intelligence" in q)):
            rows = conn.execute("""
                SELECT p.shift, COUNT(*) as total_inspections,
                       SUM(CASE WHEN q.pass_fail = 'FAIL' THEN 1 ELSE 0 END) as failures,
                       ROUND(AVG(q.defect_rate_pct), 2) as avg_defect_rate
                FROM qc_inspections q
                JOIN production_batches p ON p.batch_id = q.batch_id AND p.user_id = q.user_id
                WHERE p.shift IS NOT NULL AND p.user_id = ?
                GROUP BY p.shift
                ORDER BY failures DESC
            """, (user_id,)).fetchall()
            if rows:
                worst = rows[0]
                best = rows[-1]
                response["text"] = (
                    f"I've analyzed the shift intelligence metrics for you. Here is the summary:\n\n"
                    f"• **Worst Performing:** Shift {worst['shift']} is currently struggling with {worst['failures']} failures, "
                    f"and an average defect rate of {worst['avg_defect_rate']}%.\n"
                    f"• **Best Performing:** Shift {best['shift']} is doing well with only {best['failures']} failures, "
                    f"maintaining a low defect rate of {best['avg_defect_rate']}%.\n\n"
                    f"Below is the complete breakdown:"
                )
                response["data"] = [dict(r) for r in rows]
                response["type"] = "shift_metrics"
            else:
                response["text"] = "I don't have enough shift data to analyze yet. Could you make sure production and QC files have been uploaded?"

        # ── Explanations ────────────────────────────────────────
        elif "what is" in q or "explain" in q or "what are" in q or "meaning" in q:
            if "qc" in q or "inspection" in q:
                response["text"] = "**QC (Quality Control) inspections** are checks performed on production batches to ensure they meet quality standards. In TraceLink, we track if a batch PASSES or FAILS, and the specific defect type and rate."
            elif "lot" in q:
                response["text"] = "A **Lot** (or Input Lot Reference) is a unique identifier assigned to a specific batch of raw materials received from a supplier. TraceLink tracks how this raw material is used across different production batches."
            elif "shift" in q:
                response["text"] = "A **Shift** refers to the working period (e.g., Morning, Evening, Night) during which production batches are manufactured. Tracking by shift helps identify if certain teams or times of day have higher defect rates."
            elif "dispatch" in q or "order" in q:
                response["text"] = "**Dispatch orders** represent the final shipment of finished goods to customers. TraceLink links the dispatched products back to their production batches to ensure full end-to-end traceability."
            elif "complaint" in q or "oem" in q:
                response["text"] = "**OEM Complaints** are issues reported by customers after they receive the product. TraceLink helps you investigate the root cause by tracing the complaint back to the specific machine, shift, or supplier involved."
            elif "user id" in q or "userid" in q or "identifier" in q:
                response["text"] = "A **User ID** is a unique identifier assigned to your account. It ensures that your data (production, QC, suppliers) remains isolated and secure from other users in our multi-tenant system. You can see yours next to your email in the sidebar."
            else:
                response["text"] = "I can explain various TraceLink concepts like QC inspections, Lots, Shifts, Dispatch Orders, User IDs, and Complaints. What would you like to know more about?"
            response["type"] = "explanation"

        # ── CSV/Upload Help ─────────────────────────────────────
        elif "csv" in q or "upload" in q or "import" in q:
            response["text"] = "To upload data, please navigate to the **Imports** tab on the left sidebar. There, you can upload CSV files for Production Batches, QC Inspections, Dispatch Orders, Raw Materials, Suppliers, and OEM Complaints to populate your dashboard."
            response["type"] = "help"

        # ── Lot Lookup ──────────────────────────────────────────
        elif "lot" in q:
            match = re.search(r'lot[\s\-]*([a-zA-Z0-9\-]+)', q)
            if match:
                lot = match.group(1).upper()
                if not lot.startswith("LOT-"):
                    lot = "LOT-" + lot
                rows = conn.execute("SELECT batch_id, production_date, machine_id, shift, operator_id, units_produced, inference_confidence FROM production_batches WHERE input_lot_ref = ? AND user_id = ?", (lot, user_id)).fetchall()
                if rows:
                    response["text"] = f"I found {len(rows)} production batches linked to the lot **{lot}**. Here are the details:"
                    response["data"] = [dict(r) for r in rows]
                    response["type"] = "table"
                else:
                    response["text"] = f"I couldn't find any batches associated with lot **'{lot}'**. Could you double-check the lot number format (e.g., LOT-2023-114)?"
            else:
                response["text"] = "Sure, I can help with lot tracing! Just specify the lot number you're looking for, e.g., 'show me lot LOT-2023-114'."

        # ── Failed Batches ──────────────────────────────────────
        elif "fail" in q or "failed" in q or "reject" in q:
            limit = 50
            rows = conn.execute("""
                SELECT q.batch_id, q.inspection_date, q.pass_fail, q.defect_type_normalized, 
                       q.defect_rate_pct, p.machine_id, p.shift, p.operator_id
                FROM qc_inspections q
                LEFT JOIN production_batches p ON p.batch_id = q.batch_id AND p.user_id = q.user_id
                WHERE q.pass_fail = 'FAIL' AND q.user_id = ?
                ORDER BY q.inspection_date DESC LIMIT ?
            """, (user_id, limit)).fetchall()
            if rows:
                response["text"] = f"I've pulled up the {len(rows)} most recently failed QC inspections for you. Please review them below:"
                response["data"] = [dict(r) for r in rows]
                response["type"] = "table"
            else:
                response["text"] = "Great news! I didn't find any failed QC inspections in the database."
            
        # ── Imputation / Missing Data ───────────────────────────
        elif "missing" in q or "impute" in q or "imputation" in q or "synthetic" in q or "inferred" in q:
            rows = conn.execute("""
                SELECT batch_id, input_lot_ref, production_date, machine_id, 
                       inference_confidence, inference_reason
                FROM production_batches 
                WHERE inferred_batch_id = 1 AND user_id = ?
                ORDER BY production_date DESC LIMIT 50
            """, (user_id,)).fetchall()
            if rows:
                total = conn.execute("SELECT COUNT(*) as cnt FROM production_batches WHERE inferred_batch_id = 1 AND user_id = ?", (user_id,)).fetchone()["cnt"]
                response["text"] = f"The TraceLink engine has inferred {total} missing batch records. I've listed the 50 most recent ones here:"
                response["data"] = [dict(r) for r in rows]
                response["type"] = "table"
            else:
                response["text"] = "Perfect! Your data integrity looks solid. All batch IDs were present, and no synthetic imputations were necessary."

        # ── Machine Performance ─────────────────────────────────
        elif "machine" in q:
            match = re.search(r'(mc[\s\-]*\d+)', q)
            if match:
                machine = match.group(1).upper().replace(" ", "-")
                if not "-" in machine[2:]:
                    machine = "MC-" + machine[2:]
                rows = conn.execute("""
                    SELECT p.machine_id, COUNT(*) as total_batches,
                           SUM(CASE WHEN q.pass_fail = 'FAIL' THEN 1 ELSE 0 END) as failures,
                           ROUND(AVG(q.defect_rate_pct), 2) as avg_defect_rate
                    FROM production_batches p
                    LEFT JOIN qc_inspections q ON q.batch_id = p.batch_id AND q.user_id = p.user_id
                    WHERE p.machine_id = ? AND p.user_id = ?
                    GROUP BY p.machine_id
                """, (machine, user_id)).fetchall()
                if rows:
                    r = rows[0]
                    response["text"] = f"Machine {r['machine_id']}: {r['total_batches']} batches, {r['failures']} failures, avg defect rate {r['avg_defect_rate']}%."
                    response["data"] = [dict(r) for r in rows]
                    response["type"] = "table"
                else:
                    response["text"] = f"No data found for machine '{machine}'."
            else:
                rows = conn.execute("""
                    SELECT p.machine_id, COUNT(*) as total_batches,
                           SUM(CASE WHEN q.pass_fail = 'FAIL' THEN 1 ELSE 0 END) as failures,
                           ROUND(AVG(q.defect_rate_pct), 2) as avg_defect_rate
                    FROM production_batches p
                    LEFT JOIN qc_inspections q ON q.batch_id = p.batch_id AND q.user_id = p.user_id
                    WHERE p.machine_id IS NOT NULL AND p.user_id = ?
                    GROUP BY p.machine_id
                    ORDER BY failures DESC
                """, (user_id,)).fetchall()
                if rows:
                    response["text"] = "Machine performance summary (ordered by failure count):"
                    response["data"] = [dict(r) for r in rows]
                    response["type"] = "table"
                else:
                    response["text"] = "No machine data available yet."

        # ── Supplier Info ───────────────────────────────────────
        elif "supplier" in q:
            rows = conn.execute("""
                SELECT s.supplier_id, s.supplier_name, s.approved_status,
                       COUNT(DISTINCT r.lot_number) as lots_supplied,
                       COUNT(DISTINCT c.complaint_id) as complaint_count
                FROM suppliers s
                LEFT JOIN raw_materials r ON r.supplier_id = s.supplier_id AND r.user_id = s.user_id
                LEFT JOIN complaints c ON (c.root_cause_identified LIKE '%' || s.supplier_name || '%' OR c.root_cause_identified LIKE '%' || s.supplier_id || '%') AND c.user_id = s.user_id
                WHERE s.user_id = ?
                GROUP BY s.supplier_id
                ORDER BY complaint_count DESC
            """, (user_id,)).fetchall()
            if rows:
                response["text"] = "Here is the full supplier scorecard. I've sorted it to show the suppliers tied to the most complaints at the top:"
                response["data"] = [dict(r) for r in rows]
                response["type"] = "table"
            else:
                response["text"] = "I don't have any supplier information right now. Try uploading the supplier master file from the Imports screen."

        # ── Complaints ──────────────────────────────────────────
        elif "complaint" in q or "oem" in q:
            rows = conn.execute("SELECT * FROM complaints WHERE user_id = ? ORDER BY complaint_date DESC", (user_id,)).fetchall()
            if rows:
                total_impact = sum(r["financial_impact_inr"] or 0 for r in rows)
                response["text"] = f"There are {len(rows)} OEM complaints currently in the system, totaling a financial impact of ₹{total_impact:,.0f}. Here are the details:"
                response["data"] = [dict(r) for r in rows]
                response["type"] = "table"
            else:
                response["text"] = "Great news! I couldn't find any OEM complaints logged in the system."

        # ── Dispatch / Order Lookup ─────────────────────────────
        elif "dispatch" in q or "order" in q:
            match = re.search(r'd[\s\-]*(\d+)', q)
            if match:
                order_id = "D-" + match.group(1)
                row = conn.execute("SELECT * FROM dispatch_orders WHERE order_id = ? AND user_id = ?", (order_id, user_id)).fetchone()
                if row:
                    response["text"] = f"I found the dispatch details for **{order_id}**. It was sent out on {row['dispatch_date']} to customer **{row['customer_id']}**."
                    response["data"] = [dict(row)]
                    response["type"] = "table"
                else:
                    response["text"] = f"I'm sorry, but I couldn't find order '{order_id}' in the dispatch logs."
            else:
                rows = conn.execute("SELECT * FROM dispatch_orders WHERE user_id = ? ORDER BY dispatch_date DESC LIMIT 20", (user_id,)).fetchall()
                if rows:
                    response["text"] = f"Here are the 20 most recent dispatch orders we have on record:"
                    response["data"] = [dict(r) for r in rows]
                    response["type"] = "table"
                else:
                    response["text"] = "It looks like the dispatch order logs are completely empty right now."

        # ── Summary / Overview ──────────────────────────────────
        elif "summary" in q or "overview" in q or "status" in q or "dashboard" in q or "stats" in q:
            counts = {}
            for t in ["production_batches", "qc_inspections", "dispatch_orders", "raw_materials", "complaints", "suppliers"]:
                counts[t] = conn.execute(f"SELECT COUNT(*) as cnt FROM {t} WHERE user_id = ?", (user_id,)).fetchone()["cnt"]
            total_qc = counts["qc_inspections"]
            pass_qc = conn.execute("SELECT COUNT(*) as cnt FROM qc_inspections WHERE pass_fail = 'PASS' AND user_id = ?", (user_id,)).fetchone()["cnt"]
            pass_rate = round((pass_qc / total_qc * 100) if total_qc > 0 else 0, 1)
            
            response["text"] = (
                f"Here is a high-level summary of your current TraceLink environment:\n\n"
                f"• **Production Batches:** {counts['production_batches']}\n"
                f"• **QC Inspections:** {counts['qc_inspections']} (with a pass rate of {pass_rate}%)\n"
                f"• **Dispatch Orders:** {counts['dispatch_orders']}\n"
                f"• **Raw Materials:** {counts['raw_materials']}\n"
                f"• **Suppliers Monitored:** {counts['suppliers']}\n"
                f"• **Active Complaints:** {counts['complaints']}\n\n"
                f"Let me know if you want to dive deeper into any of these areas!"
            )
            response["type"] = "summary"

        # ── Help / Default ──────────────────────────────────────
        elif "help" in q or "what can" in q or "how" in q:
            response["text"] = (
                "I am here to help you navigate and analyze your TraceLink data! Here are a few things you can ask me:\n\n"
                "• *'What is the worst shift?'* — Analyzes shift performance\n"
                "• *'Show me lot LOT-2023-114'* — Performs full traceability on a specific lot\n"
                "• *'Show failed batches'* — Reviews recent QC failures\n"
                "• *'Machine MC-03 performance'* — Aggregates analytics for a specific machine\n"
                "• *'Supplier scorecard'* — Assesses supplier quality metrics\n"
                "• *'Show complaints'* — Displays OEM complaint history\n"
                "• *'System overview'* — Gives a dashboard summary of all data\n"
                "• *'Show imputed batches'* — Triggers an imputation audit\n"
                "• *'Show dispatch D-1847'* — Looks up a specific order"
            )
            response["type"] = "help"
        
        else:
            response["text"] = (
                "Hmm, I didn't quite catch that. Could you try rephrasing?\n\n"
                "You can ask me things like:\n"
                "• Shift performance (e.g., 'worst shift')\n"
                "• Lot tracing (e.g., 'lot LOT-2023-114')\n"
                "• Failed batches, machine stats, suppliers, or complaints\n"
                "• Or just type 'help' for a full list of commands!"
            )

    except Exception as e:
        response["text"] = f"Error processing query: {str(e)}"
        
    finally:
        conn.close()

    response["query_ms"] = round((time.perf_counter() - start) * 1000, 2)
    return response
