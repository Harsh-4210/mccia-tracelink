<div align="center">

# TraceLink

### Manufacturing Traceability & Quality Control Platform

**End-to-end supply chain traceability for Indian automotive component manufacturers.**
Track raw materials → production batches → QC inspections → dispatch orders → customer complaints — all in one system.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Data Pipeline](#data-pipeline)
- [API Reference](#api-reference)
- [Frontend](#frontend)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Overview

TraceLink solves the **traceability gap** in Indian manufacturing supply chains. When a defective brake pad reaches an OEM customer, TraceLink can trace it back through dispatch → production batch → raw material lot → supplier — in milliseconds. It provides:

- **Forward tracing**: Given a raw material lot, find every dispatch order it touched.
- **Reverse tracing**: Given a dispatch order, trace back to the exact supplier and material.
- **Blast radius analysis**: When a lot is flagged, instantly compute financial exposure, escaped shipments, and quarantine recommendations.
- **Data quality enforcement**: A 5-tier imputation engine fills missing batch IDs with confidence scoring.
- **AI-powered natural language queries**: Ask questions like "show me all failed batches from Shift A" in plain English.

---

## Key Features

### 1. Full-Chain Traceability
- **Dispatch → Batch → Lot → Supplier** reverse trace with confidence scoring
- **Link types**: `deterministic` (exact match), `inferred` (imputed with confidence), `reviewed` (human-approved)
- **Cross-supplier anomaly detection**: Flags lots sourced from multiple suppliers
- **Incomplete trace warnings**: Identifies missing production records, QC gaps, or broken material links

### 2. Quality Metrics Dashboard
- Real-time KPIs: production batch count, QC pass rate, open complaints, unresolved links, open CAPAs
- **Shift intelligence**: Per-shift fail counts and average defect rates
- **Top failing machines**: Ranked by QC failure count
- **Supplier scorecard**: Lots supplied vs complaint count per supplier
- **Financial exposure tracking**: Aggregated complaint impact in INR
- **30-second TTL cache** with automatic invalidation after data imports

### 3. CSV Import Pipeline
- Upload 6 file types: `raw_materials`, `production`, `qc`, `dispatch`, `supplier`, `complaints`
- **Per-type validation rules** with required column checks, date parsing, and numeric validation
- **Per-type error thresholds**: Supplier allows 30% errors (sparse master data), production/QC allow 10%
- **Batch `executemany` inserts** for high-throughput ingestion (40k+ rows in seconds)
- **SHA-256 duplicate detection**: Prevents re-importing the same file
- **Source file tracking**: Every import is logged with row counts, error counts, and status
- **Import rollback**: Delete an import and all domain rows it created are reversed

### 4. 5-Tier Batch ID Imputation Engine
When production CSV rows are missing `batch_id`, the pipeline infers them using progressively relaxed rules:

| Rule | Confidence | Logic |
|------|-----------|-------|
| Rule 1 | 90% | Same lot + same machine, ±7 days |
| Rule 2 | 75% | Same lot, ±14 days |
| Rule 3 | 55% | Same lot, ±30 days (closest date) |
| Rule 4 | 30% | Same lot, nearest neighbor (any date) |
| Rule 5 | 0% | No match → synthetic ID (`SYN-XXXXXXXX`) |

All inferred links land in the **Review Queue** for human approval/rejection.

### 5. Data Sanitization
- **SQL injection stripping**: `DROP TABLE`, `OR 1=1`, `UNION SELECT` patterns
- **XSS prevention**: `<script>`, event handler attributes, iframe/object tags
- **Path traversal blocking**: `../../etc/passwd` patterns
- **Template injection**: `{{7*7}}` Jinja/SSTI patterns
- **Garbage value filtering**: `NaN`, `undefined`, `null`, `[object Object]`, `#REF!`, `#DIV/0!`
- **Junk string rejection**: Strings with <70% printable characters are discarded
- **Length truncation**: All text fields capped at 255 characters

### 6. Blast Radius Alerts
- Given a flagged lot number, computes:
  - All production batches using that lot
  - All dispatch orders containing those batches
  - QC pass/fail status per batch
  - **Financial exposure** from linked complaints
  - **Escaped shipments**: Orders dispatched before QC failure was detected
  - **Quarantine recommendations**: Failed batches not yet dispatched
- Paginated results with CSV export

### 7. Corrective Action (CAPA) Management
- Create, list, update corrective actions linked to quality events
- Fields: root cause, immediate action, corrective action, preventive action, due date
- Status lifecycle: `open` → `closed`

### 8. Operator Batch Entry
- Shop-floor operators submit production entries via web form
- **Offline-first**: Entries queued in IndexedDB when offline, auto-synced when connectivity returns
- **Idempotency**: `client_entry_id` prevents duplicate submissions during retry
- **Device tracking**: Each entry records `device_id` for audit
- **Supervisor approval workflow**: Entries require supervisor sign-off

### 9. AI Natural Language Query Engine
Ask questions in plain English. The NLU engine detects intent via keyword matching and routes to the appropriate data query:

- `"Show me shift performance"` → Shift intelligence breakdown
- `"Which machines are failing the most?"` → Top failing machines
- `"Trace lot LOT-2023-114"` → Full lot alert with blast radius
- `"How many batches were produced?"` → Count queries
- `"Give me a summary"` → Full dashboard overview
- `"What is defect rate?"` → Domain concept explanations
- `"How do I upload a CSV?"` → Help/tutorial responses

### 10. Audit Trail
- Every mutating API call (POST/PUT/PATCH/DELETE) is logged with:
  - User ID, email, action, entity type/ID
  - Request IP, unique request ID, response status, duration in ms
- Dashboard GETs are excluded from audit (performance optimization)
- Queryable via admin API with filtering by action and user

### 11. Multi-Tenancy
- All domain tables include a `user_id` column
- Each user sees only their own data across all endpoints
- Firebase UID is used as the tenant key

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React 19 + Vite)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Dashboard │ │Trace     │ │Import    │ │AI Assistant│ │
│  │Screen    │ │Screen    │ │Screen    │ │Screen      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Alert     │ │Operator  │ │Compliance│ │Account     │ │
│  │Screen    │ │Screen    │ │Screen    │ │Screen      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│                                                         │
│  Firebase Auth ←→ IndexedDB (Offline Queue)             │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS + Bearer Token
┌───────────────────────┴─────────────────────────────────┐
│                 Backend (FastAPI + Uvicorn)              │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Audit Middleware                       │ │
│  │  (logs mutating requests, skips dashboard GETs)    │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐│
│  │auth  │ │trace │ │alert │ │import│ │dash  │ │ai   ││
│  │routes│ │routes│ │routes│ │routes│ │routes│ │route││
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └─────┘│
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────────────────┐│
│  │oper  │ │review│ │compl │ │   Pipeline Engine       ││
│  │routes│ │routes│ │routes│ │ (sanitize+impute+batch) ││
│  └──────┘ └──────┘ └──────┘ └────────────────────────┘│
│                                                        │
│  Linking Engine (confidence scoring, defect-material   │
│  correlation, supplier anomaly detection)              │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────┴────────────────────────────────┐
│              SQLite (WAL mode, 16MB cache)              │
│  13 tables · 22 indexes · PRAGMA optimizations         │
└────────────────────────────────────────────────────────┘
```

---

## Database Schema

13 tables organized in 4 layers:

### Domain Tables
| Table | Primary Key | Description |
|-------|------------|-------------|
| `suppliers` | `supplier_id` | Supplier master data |
| `raw_materials` | `raw_id` (auto) | Incoming material receipts with lot numbers |
| `production_batches` | `production_id` (auto) | Production runs with batch IDs and imputation metadata |
| `qc_inspections` | `batch_id` | Quality control pass/fail with defect classification |
| `dispatch_orders` | `order_id` | Outgoing shipments to OEM customers |
| `dispatch_batches` | `(order_id, batch_id, user_id)` | Many-to-many link between orders and batches |
| `complaints` | `complaint_id` | Customer complaints with financial impact |

### Operational Tables
| Table | Description |
|-------|-------------|
| `operator_entries` | Shop-floor production entries with offline sync support |
| `trace_reviews` | Human review queue for inferred trace links |
| `corrective_actions` | CAPA lifecycle tracking |

### System Tables
| Table | Description |
|-------|-------------|
| `users` | Firebase-synced user accounts |
| `audit_events` | Immutable audit trail of all API mutations |
| `source_files` | Import file metadata with checksums |
| `source_rows` | Raw JSON of each imported row |
| `import_errors` | Per-row validation errors |

### Performance Indexes (22 total)
Indexes cover: `lot_number`, `batch_id`, `input_lot_ref`, `user_id` (all domain tables), `(user_id, pass_fail)`, `(user_id, inferred_batch_id)`, `checksum`, `client_entry_id`, `email`, `timestamp`.

---

## Data Pipeline

### Input Sanitization (`pipeline.py`)
Every field passes through `clean_text()` which applies 10 compiled regex patterns for injection/XSS stripping, garbage value filtering, printability checks, and length truncation. Numeric fields use `to_int()`/`to_float()` with currency symbol stripping and overflow protection.

### Defect Normalization (`linking.py`)
Raw defect strings like `"surfDelam"`, `"surface-delamination"`, `"SURFACE DELAMINATION"` are all normalized to `"surface_delamination"` via case-insensitive compact matching.

### Confidence Scoring (`linking.py`)
When resolving which raw material supplied a production batch, candidates are scored on:
1. **Defect-material correlation** (+0.25): Maps defect types to material categories (e.g., `surface_delamination` → adhesive/bonding)
2. **Supplier in complaint** (+0.10): Supplier name appears in complaint root cause text
3. **Material in complaint** (+0.10): Material type matches complaint context
4. **Quality grade risk** (+0.08 for grade C, +0.03 for grade B)
5. **Supplier approval status** (+0.05 if not approved)

Scores ≥0.80 = `deterministic`, below = `inferred`.

---

## API Reference

Base URL: `/api/v1`

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/firebase-sync` | Sync Firebase user → local DB |
| GET | `/auth/me` | Get current user info |
| DELETE | `/auth/me` | Delete current user account |
| GET | `/auth/users` | List all users |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/metrics` | All KPIs (cached 30s, auto-invalidated after import) |

### Traceability
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trace/{order_id}` | Full reverse trace for a dispatch order |
| GET | `/trace/{order_id}/export` | Export trace as CSV |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/alerts/lots/{lot_number}` | Blast radius analysis with pagination |
| GET | `/alerts/lots/{lot_number}/export` | Export alert as CSV |

### Data Import
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/imports` | Upload CSV (multipart form: `file` + `file_type`) |
| GET | `/imports` | List all imports for current user |
| GET | `/imports/{import_id}` | Get import details with errors |
| DELETE | `/imports/{import_id}` | Rollback import and all domain rows |

### Operator
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/operator/batches` | Submit production entry (idempotent via `client_entry_id`) |
| GET | `/operator/batches/recent` | Recent entries |
| GET | `/operator/batches/pending` | Entries awaiting supervisor approval |
| POST | `/operator/batches/{id}/approve` | Approve an entry |

### Review Queue
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/review/unresolved-links` | Paginated list of inferred links needing review |
| POST | `/review/unresolved-links/{id}/approve` | Approve an inferred link |
| POST | `/review/unresolved-links/{id}/reject` | Reject an inferred link |

### Compliance (CAPA)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/compliance/corrective-actions` | Create CAPA |
| GET | `/compliance/corrective-actions` | List CAPAs (filterable by status) |
| GET | `/compliance/corrective-actions/{id}` | Get single CAPA |
| PATCH | `/compliance/corrective-actions/{id}` | Update CAPA fields |

### AI Query
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/query` | Natural language query (body: `{"query": "..."}`) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/health` | System health + table counts + DB size |
| GET | `/admin/audit-events` | Paginated audit log with filters |
| GET | `/admin/pipeline-audit` | Imputation breakdown, temporal warnings, lot anomalies |
| GET | `/admin/users` | User management |

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Basic health check (no auth) |

---

## Frontend

Single-page application built with **React 19 + TypeScript + Vite**.

### Design System
- **Fonts**: Hanken Grotesk (headlines), Chivo (body), Outfit (labels)
- **Color palette**: Navy authority, Blue action-only, Slate tertiary
- **Modes**: Light (industrial shop floor) and Dark (Bloomberg/Aerospace aesthetic)
- **Motion**: Custom cubic-bezier easing (`--ease-out`, `--ease-spring`)
- **CSS**: Vanilla CSS with CSS custom properties (no Tailwind)

### Screens
| Screen | Description |
|--------|-------------|
| **Dashboard** | KPI cards, defect trend chart, shift intelligence, supplier scorecard, recent complaints |
| **Trace** | Enter dispatch order ID → full reverse trace visualization with link-type badges |
| **Alerts** | Enter lot number → blast radius with escaped shipments, financial exposure, quarantine recommendations |
| **Import** | Custom animated dropdown for file type, drag-and-drop CSV upload with progress bar, error report |
| **Operator** | Production entry form with offline queue indicator and sync status |
| **AI Assistant** | Chat interface for natural language queries |
| **Compliance** | CAPA list with create/update forms |
| **Account** | User info, usage stats (rows ingested, DB size, API calls), delete account |

### Offline-First Architecture
- **IndexedDB queue** (`tracelink-offline` database) stores operator entries when offline
- Entries include `client_entry_id` (UUID) for idempotent sync
- `device_id` is persisted in localStorage for device tracking
- Auto-sync on reconnection with per-entry error handling
- Failed entries remain in queue with error messages for retry

### Internationalization
- Hindi transliteration support via `transliterate.ts` (89KB mapping table)
- i18n module (`i18n.tsx`) for future multi-language support

---

## Authentication

TraceLink uses **Firebase Authentication** for all user management:

1. **Frontend**: Firebase SDK handles login/register UI and token management
2. **Backend**: `firebase-admin` SDK verifies ID tokens on every request
3. **User sync**: On first login, Firebase UID is synced to local `users` table via `/auth/firebase-sync`
4. **Token flow**: Frontend gets ID token → sends as `Authorization: Bearer <token>` → backend verifies via `firebase_auth.verify_id_token()`
5. **Re-registration handling**: If a user deletes their Firebase account and re-registers with the same email, the old account is archived and a fresh tenant is created

All role guards (`require_admin`, `require_quality_or_above`, etc.) are currently aliases for `get_current_user` — every authenticated user has full access.

---

## Deployment

### Render (Docker)

TraceLink is containerized with a multi-stage Dockerfile:

1. **Stage 1** (Bun): Builds the frontend Vite SPA
2. **Stage 2** (Python 3.11-slim): Serves the API + static frontend

```bash
# Build and deploy via Render
# Connect your GitHub repo → Render auto-detects Dockerfile
```

### Persistent Storage

On **Render**, the app auto-detects the environment:
- If a **Persistent Disk** is mounted at `/data`, the database lives at `/data/tracelink.sqlite3` (survives redeployments)
- Otherwise, falls back to `/tmp/tracelink/tracelink.sqlite3` (survives within a deploy lifecycle)
- Locally, the database lives at `backend/tracelink.sqlite3`

The `DB_PATH` environment variable can override all defaults.

### Performance Tuning

SQLite is configured for high-throughput:
```
PRAGMA journal_mode = WAL      -- concurrent reads during writes
PRAGMA synchronous = NORMAL    -- balanced durability/speed
PRAGMA cache_size = -16000     -- 16MB page cache
PRAGMA busy_timeout = 10000    -- 10s retry on lock contention
```

Dashboard metrics are served from a **30-second TTL in-memory cache** per user. The cache is automatically invalidated after every CSV import, so metrics reflect new data within seconds.

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+ or Bun
- Firebase project with Authentication enabled

### Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

# Place your Firebase service account key:
# backend/serviceAccountKey.json

uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
bun install        # or npm install
bun run dev        # or npm run dev
```

The frontend dev server proxies API requests to `localhost:8000`.

### First Run
1. The database is auto-created on first startup (`lifespan` creates schema + indexes)
2. Register via the Firebase Auth UI on the frontend
3. Upload CSV files via the Import screen
4. Dashboard populates immediately after upload (cache is invalidated)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `backend/tracelink.sqlite3` | SQLite database file path |
| `ENVIRONMENT` | `dev` | `dev` / `staging` / `production` |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins (must be restricted in production) |
| `FIREBASE_PROJECT_ID` | `tracelink-793ba` | Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | _(empty)_ | Full JSON string of service account key (for deployment) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `backend/serviceAccountKey.json` | Path to service account key file (for local dev) |
| `FRONTEND_DIST` | `frontend/dist` | Path to built frontend assets |
| `VITE_FIREBASE_API_KEY` | _(required)_ | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | _(required)_ | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | _(required)_ | Firebase project ID (frontend) |

---

## Project Structure

```
mccia-tracelink/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin_routes.py      # Audit logs, health, pipeline audit
│   │   │   ├── ai_routes.py         # NLU query engine (463 lines)
│   │   │   ├── alert_routes.py      # Blast radius + pagination + CSV export
│   │   │   ├── auth_routes.py       # Firebase sync, user CRUD
│   │   │   ├── compliance_routes.py # CAPA lifecycle
│   │   │   ├── dashboard_routes.py  # Metrics with 30s TTL cache
│   │   │   ├── import_routes.py     # CSV upload, validation, rollback
│   │   │   ├── operator_routes.py   # Batch entries with idempotency
│   │   │   ├── review_routes.py     # Unresolved link review queue
│   │   │   └── trace_routes.py      # Full-chain trace + CSV export
│   │   ├── auth.py                  # Firebase token verification
│   │   ├── config.py                # Pydantic settings from env/.env
│   │   ├── db.py                    # SQLite connection + Render detection
│   │   ├── linking.py               # Confidence scoring engine
│   │   ├── main.py                  # FastAPI app + SPA serving
│   │   ├── middleware.py            # Audit logging middleware
│   │   ├── pipeline.py              # Schema, sanitization, imputation, batch inserts
│   │   └── schemas.py               # Pydantic request/response models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── terminal/
│   │   │   ├── App.tsx              # All screens (2000+ lines)
│   │   │   └── styles.css           # Design system (1650+ lines)
│   │   ├── api.ts                   # Typed API client with auth headers
│   │   ├── auth/                    # Firebase auth components
│   │   ├── firebase.ts              # Firebase SDK initialization
│   │   ├── i18n.tsx                 # Internationalization
│   │   ├── offlineQueue.ts          # IndexedDB offline sync
│   │   └── transliterate.ts         # Hindi transliteration
│   └── package.json
├── Dummy Data/                      # Sample CSVs for testing
├── Dockerfile                       # Multi-stage (Bun → Python 3.11)
├── *.csv                            # Augmented test data (~40k rows each)
└── README.md
```

---

## Future Roadmap

| Priority | Feature | Status | Details |
|----------|---------|--------|---------|
| 🔴 High | **Persistent Storage (Render Paid Tier)** | Planned | Currently on Render Free Tier, data resets on redeploy. Upgrading to a Persistent Disk mount at `/data` will make the SQLite database survive redeployments. The backend already auto-detects the mount — just add the disk in Render dashboard. |
| 🔴 High | **PostgreSQL Migration** | Planned | Replace SQLite with Render's managed PostgreSQL for true cloud-native persistence, concurrent write support, and connection pooling. Eliminates the ephemeral filesystem constraint entirely. |
| 🟡 Medium | **Role-Based Access Control** | Planned | Re-enable role differentiation (admin, supervisor, quality, operator) with granular route-level permissions. The role guards are already wired in code as aliases. |
| 🟡 Medium | **WebSocket Real-Time Dashboard** | Planned | Push dashboard updates via WebSocket instead of polling, for instant metric refresh across all connected clients. |
| 🟢 Low | **Batch Export (PDF Reports)** | Planned | Generate downloadable PDF trace reports with charts, for regulatory submission and OEM audit compliance. |
| 🟢 Low | **Multi-Language UI** | Planned | Activate the i18n module with Hindi, Marathi, and Gujarati translations for shop-floor operators. Transliteration engine is already built. |
| 🟢 Low | **Mobile PWA** | Planned | Convert the frontend to a Progressive Web App with service worker caching for full offline capability on mobile devices. |

> **Note on Current Persistence**: On Render Free Tier, the filesystem is ephemeral. Data persists within a deploy lifecycle but is wiped on new deployments or after 15 minutes of inactivity. The pipeline is optimized for fast re-ingestion (40k+ rows in seconds), so re-uploading CSVs after a redeploy takes minimal time. For production use, a Render Persistent Disk ($0.25/GB/month) or PostgreSQL migration is recommended.

---

## Authors

<table>
  <tr>
    <td align="center"><strong>Harsh Jain</strong><br/> Developer & System Architect</td>
    <td align="center"><strong>Ruchir Kalokhe</strong><br/>Developer & System Architec</td>
    <td align="center"><strong>Krishna Naiker</strong><br/>Developer & System Architec</td>
  </tr>
</table>

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for the full license text.

### What This Means

- ✅ **You may** use, modify, and distribute this software
- ✅ **You may** use it for commercial purposes
- 📋 **You must** include the original copyright notice and license in any copy or fork
- 📋 **You must** disclose your source code if you distribute or deploy modified versions
- 📋 **You must** state changes you made to the original code
- 🌐 **Network use is distribution**: If you run a modified version as a web service (SaaS), you must make your source code available to users of that service
- ❌ **No warranty** is provided

### Why AGPL-3.0?

TraceLink is a **web application**. Standard open-source licenses like MIT or Apache 2.0 allow anyone to fork, modify, and deploy as a competing service without sharing their changes or crediting the original authors. The AGPL-3.0 closes this "SaaS loophole" — if you deploy a modified TraceLink as a network service, you must release your source code under the same license and credit the original authors.

```
Copyright (c) 2026 Harsh Jain, Ruchir Kalokhe, Krishna Naiker

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

---

<div align="center">

**Built for the MCCIA Industrial Innovation Program**

*Solving traceability challenges in Indian automotive manufacturing*

Copyright © 2026 Harsh Jain, Ruchir Kalokhe, Krishna Naiker. All rights reserved.

</div>
