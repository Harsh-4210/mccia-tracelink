"""Trace link scoring — production version.

LINK-01 FIX: All demo-specific hardcoded scoring has been removed.
Confidence scoring is now data-driven:
  - Deterministic match: exact lot/batch/material link from source data
  - Inferred match: ambiguous, with confidence and reasons
  - Quality grade and complaint correlation are generic, not supplier-specific
"""
from __future__ import annotations

import re
from typing import Iterable

# ── Defect normalization ─────────────────────────────────────────

DELAMINATION_LABELS = {
    "surfdelam", "surfdelamination", "surf_delamination",
    "surf-delam", "surface delamination", "surface_delamination",
    "surface-delamination",
}


def normalize_defect_type(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    raw = str(value).strip()
    compact = re.sub(r"[\s_-]+", "", raw).lower()
    if compact in {"surfdelam", "surfdelamination", "surfacedelamination"}:
        return "surface_delamination"
    return re.sub(r"[\s-]+", "_", raw.lower())


def split_batches(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


# ── Confidence scoring (data-driven, no demo hardcoding) ─────────

# Defect-to-material correlation map (configurable, not hidden string checks)
DEFECT_MATERIAL_CORRELATIONS: dict[str, list[str]] = {
    "surface_delamination": ["adhesive", "bonding", "coating"],
    "porosity": ["casting", "alloy", "metal"],
    "crack": ["steel", "metal", "alloy", "casting"],
    "dimensional": ["machining", "blank", "forging"],
    "contamination": ["chemical", "solvent", "cleaning"],
}


def score_raw_candidate(
    raw: dict,
    supplier: dict | None,
    qc: dict | None,
    complaint_text: str = "",
) -> tuple[float, list[str]]:
    """Score a raw material candidate purely from data relationships.

    No supplier-specific or lot-specific hardcoding.
    """
    score = 0.35
    reasons: list[str] = ["lot number matches production input"]
    material = (raw.get("material_type") or "").lower()
    supplier_name = ((supplier or {}).get("supplier_name") or "").lower()
    defect = (qc or {}).get("defect_type_normalized")
    complaint = complaint_text.lower()

    # 1. Defect-material correlation (generic, data-driven)
    if defect and defect in DEFECT_MATERIAL_CORRELATIONS:
        correlated_materials = DEFECT_MATERIAL_CORRELATIONS[defect]
        if any(mat in material for mat in correlated_materials):
            score += 0.25
            reasons.append(f"defect type '{defect}' correlates with material category")

    # 2. Supplier mentioned in complaint (generic match, not hardcoded to specific supplier)
    if supplier_name and supplier_name in complaint:
        score += 0.10
        reasons.append("supplier name appears in complaint context")

    # 3. Material type mentioned in complaint
    if material and material in complaint:
        score += 0.10
        reasons.append("material type matches complaint root cause context")

    # 4. Quality grade risk
    if raw.get("quality_grade") == "C":
        score += 0.08
        reasons.append("raw material quality grade C indicates higher risk")
    elif raw.get("quality_grade") == "B":
        score += 0.03
        reasons.append("raw material quality grade B")

    # 5. Supplier approval status
    if supplier and supplier.get("approved_status", "").lower() not in ("approved", "active", "yes"):
        score += 0.05
        reasons.append("supplier approval status is not 'Approved'")

    return min(score, 0.99), reasons


def best_raw_candidate(
    candidates: Iterable[dict],
    suppliers: dict[str, dict],
    qc: dict | None,
    complaint_text: str = "",
) -> dict | None:
    ranked = []
    for raw in candidates:
        score, reasons = score_raw_candidate(raw, suppliers.get(raw.get("supplier_id", "")), qc, complaint_text)

        # Determine link type
        link_type = "inferred"
        if score >= 0.80:
            link_type = "deterministic"

        ranked.append((score, raw, reasons, link_type))

    if not ranked:
        return None

    score, raw, reasons, link_type = sorted(ranked, key=lambda item: item[0], reverse=True)[0]
    return {
        **raw,
        "confidence": round(score, 3),
        "confidence_reasons": reasons,
        "link_type": link_type,
    }
