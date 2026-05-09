# TraceLink Production Implementation Blueprint

## Executive Verdict

TraceLink is a strong prototype, but it is not ready to hand to a business as-is. The current system proves the traceability concept, but a production business deployment needs security, durable storage, reliable offline sync, auditable imports, correct link scoring, reports, monitoring, and a controlled pilot.

This document combines two earlier plans:

- The stakeholder blueprint: roles, governance, phases, acceptance criteria, deployment, and rollout.
- The council blueprint: specific code defects, file-level fixes, sprint tasks, and production blockers.

The conclusion is simple:

- The business-facing plan is the right frame for handover.
- The developer-facing plan is the right backlog for implementation.
- The final roadmap must use both.

Do not ship a polished UI around a broken trace engine. TraceLink must earn trust by being correct, secure, explainable, and auditable.

## Current System Snapshot

Repository structure today:

- `backend/`: FastAPI backend with SQLite database, CSV ingestion, trace and alert APIs.
- `frontend/`: Vite + React frontend with trace search, lot alert, and operator entry.
- Root CSV files: demo data for raw materials, production, QC, dispatch, suppliers, and complaints.
- `Dockerfile`: single image that builds the frontend and serves API plus static SPA.
- `.github/workflows/ci.yml`: basic backend tests and frontend build.
- `docs/`: existing notes for data-cleaning assumptions and scaling.

The prototype already demonstrates the business flow:

- Dispatch order -> production batch.
- Production batch -> raw lot.
- Raw lot -> supplier and material.
- Batch -> QC result.
- Lot -> downstream dispatch impact.

That core model should remain. The production work is about making it dependable.

## Production Blockers

These are ship-blocking issues found in the current codebase.

| ID | Area | Current Risk | Business Impact |
| --- | --- | --- | --- |
| AUTH-01 | Authentication | No login or role checks; `/api/rebuild` is open | Anyone on the network can read business data or rebuild/wipe the DB |
| DB-01 | SQLite concurrency | No WAL mode, timeout, pooling, or retry strategy | Concurrent operator writes can fail with database locks |
| LINK-01 | Confidence scoring | `linking.py` contains demo-specific scoring for supplier/material scenarios | Recalls for non-demo lots can receive confident but wrong supplier attribution |
| ALERT-01 | Lot alert endpoint | `/api/alerts/lot/{lot_number}` has no pagination | Large affected lots can timeout or overload the app |
| OFFLINE-01 | Offline sync | `syncQueuedEntries()` can clear all queued entries after partial failure | Operator data can be silently lost |
| AUDIT-01 | Auditability | No audit log for trace, alert, import, or operator actions | Business cannot prove who did what during a recall or audit |
| INGEST-01 | Data onboarding | CSV paths are hardcoded demo files | Real customers cannot safely upload their own data |
| STARTUP-01 | FastAPI startup | Uses deprecated `@app.on_event("startup")` | Future FastAPI upgrades can break startup behavior |
| EXPORT-01 | Reports | Trace results cannot be saved, exported, or shared | QC cannot attach results to recall, CAPA, or customer records |
| COMPLIANCE-01 | Automotive compliance | No corrective action or IATF/ISO-oriented records | Risk during IATF 16949 or ISO 9001 audits |

## Target Users and Roles

### Operator

- Create production batch entries.
- Scan or type raw lot, machine, shift, operator ID, and quantity.
- Work offline and sync when network returns.
- View own recent entries and sync status.

### Supervisor

- Review operator entries.
- Correct rejected or incomplete records.
- Approve inferred links and unresolved matches.
- Monitor line-level data quality.

### Quality Engineer

- Run dispatch trace searches.
- Run raw-lot contamination alerts.
- Review QC failures, complaints, and root-cause links.
- Export recall-ready reports.
- Open corrective actions.

### Management

- View dashboards.
- Track incidents, affected dispatches, supplier risk, and traceability coverage.
- Export monthly business reports.

### Admin

- Manage users, roles, plants, machines, lines, suppliers, and import settings.
- Configure integrations and retention policies.
- Access audit logs and system health.

## Target Architecture

```text
Shop-floor browser/tablet
        |
        | HTTPS
        v
React frontend
        |
        | /api/v1/*
        v
FastAPI backend
        |
        +-- PostgreSQL primary database
        +-- Redis or database-backed job queue
        +-- Object/file storage for uploaded source files
        +-- WhatsApp/email/Teams alert channel
        +-- Monitoring and log aggregation
```

### Backend Direction

Keep FastAPI, but move toward production modules:

- `api/`: versioned route handlers.
- `auth.py`: JWT auth, password hashing, role dependencies.
- `config.py`: `pydantic-settings` environment config.
- `models.py`: SQLAlchemy or SQLModel database models.
- `schemas.py`: Pydantic request/response contracts.
- `services/`: trace, alert, import, operator sync, audit, and authorization logic.
- `repositories/`: database access boundaries.
- `jobs/`: background import and alert jobs.
- `migrations/`: Alembic migrations.

### Frontend Direction

Keep React and Vite, but evolve the app into a business workflow tool:

- Login and role-aware navigation.
- Trace and lot-alert workspace.
- Operator entry optimized for tablets and low connectivity.
- Import/review workflow.
- Dashboard and supplier scorecard.
- Corrective action and recall reporting.
- Optional professional theme for business demos, while preserving the current terminal-style internal mode.

### Data Storage Direction

Move production data to PostgreSQL. SQLite can remain only for local development or very short pilot fallback.

Recommended core tables:

- `users`, `roles`, `user_roles`
- `plants`, `production_lines`, `machines`, `operators`
- `suppliers`, `materials`, `raw_material_receipts`
- `production_batches`, `batch_material_links`
- `qc_inspections`, `defect_types`
- `dispatch_orders`, `dispatch_batches`
- `complaints`, `complaint_dispatch_links`
- `operator_entries`, `sync_events`
- `source_files`, `source_rows`, `import_runs`, `import_errors`
- `trace_links`, `trace_confidence_reasons`
- `audit_events`
- `corrective_actions`

Production must retain both:

- Source records: what the uploaded file originally said.
- Normalized records: how TraceLink interpreted and linked that data.

## Combined 10-Week Roadmap

### Week 0: Business Alignment and Code Audit

Purpose: prevent building the wrong production system and identify every demo assumption.

Business tasks:

- Collect real CSV/Excel files from the business.
- Confirm plants, lines, machines, shifts, users, and roles.
- Confirm required reports and recall workflow.
- Confirm data retention and access rules.
- Produce signed-off data dictionary and role matrix.

Code audit tasks:

- Document all hardcoded demo assumptions in `backend/app/linking.py`, `backend/app/main.py`, and `backend/app/pipeline.py`.
- Specifically inspect demo-specific supplier/material/lot scoring in `score_raw_candidate()`.
- Inspect `lot_alert()` for hardcoded anchor batches.
- Inspect `offlineQueue.ts` for partial sync failure behavior.
- Inspect all endpoints for missing auth and unbounded list responses.

Deliverable:

- Signed-off pilot scope.
- Signed-off data dictionary.
- Role matrix.
- Hardcoded demo assumption list.

### Week 1: Security Baseline and SQLite Safety

Purpose: stop the most dangerous security and concurrency failures immediately.

Backend tasks:

- Add SQLite interim safety in `backend/app/db.py`:

```python
conn.execute("PRAGMA foreign_keys = ON")
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=NORMAL")
conn.execute("PRAGMA busy_timeout=5000")
```

- Add JWT auth with `python-jose[cryptography]` and `passlib[bcrypt]`.
- Add `users` table.
- Add auth endpoints:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/logout`
- Protect:
  - Trace and alert reads: any authenticated user.
  - Operator entry: `operator`, `supervisor`, or `admin`.
  - Rebuild/import/admin actions: `admin`.
  - Dashboard and exports: `quality`, `manager`, or `admin`.
- Restrict CORS in production.
- Replace `@app.on_event("startup")` with FastAPI lifespan.

Frontend tasks:

- Add login page.
- Add auth context.
- Redirect to login on 401.
- Add role-aware navigation.

Deliverable:

- The app requires login.
- `/api/rebuild` is admin-only.
- SQLite local/dev mode is safer during the PostgreSQL transition.

### Week 2: Database Foundation and Migration

Purpose: move from prototype storage to durable production storage.

Backend tasks:

- Add `pydantic-settings` config.
- Add PostgreSQL support with SQLAlchemy/SQLModel and `asyncpg`.
- Add Alembic migrations.
- Create initial schema matching the current domain.
- Add Docker Compose with `api`, `db` PostgreSQL, and `redis`.
- Update CI to run migrations before tests.

Data migration tasks:

- Add SQLite-to-PostgreSQL migration script for existing pilot/operator data.
- Verify row counts by table.
- Spot-check trace parity for known dispatches such as `D-1847`.
- Spot-check lot-alert parity for known lots such as `LOT-2023-114`.
- Add rollback plan: keep a timestamped SQLite backup and PostgreSQL dump.

Deliverable:

- App runs on PostgreSQL in staging.
- Existing demo trace tests pass on PostgreSQL.
- Any prototype data can be migrated and verified.

### Week 3: Fix Silent Data Defects

Purpose: make trace results correct beyond the demo data.

LINK-01: Confidence scoring rewrite.

- Remove demo-only supplier/lot scoring from `backend/app/linking.py`.
- Remove hardcoded boosts that only work for the demo scenario.
- Treat probabilistic scoring as a fallback, not the primary path.
- Clearly distinguish deterministic links from inferred links.
- Load known problem suppliers and lots from complaint history or reviewed records.
- Move defect-material correlations into data/config, not hidden string checks.
- Add tests proving unknown suppliers do not receive demo-specific score boosts.

Recommended model:

- Deterministic match: exact source-backed lot/material/batch relationship.
- Inferred match: ambiguous lot or missing ID, with confidence and reasons.
- Reviewed match: human-approved inferred link.

Also fix `lot_alert()`:

- Remove hardcoded `failed_anchor_batches`.
- Compute failed/affected batches from database data.

OFFLINE-01: Offline sync data loss fix.

- In `frontend/src/offlineQueue.ts`, sync entries one by one.
- Catch per-entry errors.
- Delete only successfully synced IndexedDB records.
- Return `{ synced, failed, errors }`.
- Keep failed entries visible and retryable.

ALERT-01: Pagination fix.

- Add `limit` and `offset` to `/api/v1/alerts/lots/{lot_number}`.
- Default `limit=100`, max `limit=500`.
- Return `total_count`, `has_more`, and `next_offset`.

Deliverable:

- Confidence scoring works for real data, not only demo anchors.
- Offline entries cannot be silently lost on partial failure.
- Large lot alerts do not overload the API.

### Week 4: Audit Log and Basic Import

Purpose: make the system auditable and usable with real business files.

Audit tasks:

- Add `audit_events` table:

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  request_ip TEXT,
  response_status INTEGER,
  result_summary JSONB,
  duration_ms REAL
);
```

- Add middleware to log trace, alert, operator entry, import, export, rebuild, login failure, and admin actions.
- Include request ID in logs and responses.

Import tasks:

- Add `POST /api/v1/imports` accepting multipart CSV upload.
- Require `file_type`.
- Validate required columns by file type.
- Normalize dates and numeric fields.
- Create `source_files` record with filename, uploader, timestamp, checksum, row count, and status.
- Store raw `source_rows`.
- Reject or hold file if validation failures exceed configured threshold.
- Return validation summary.

Frontend tasks:

- Add admin/QC import page.
- Add file picker/drop zone.
- Show validation preview.
- Show errors with row number and field.

Deliverable:

- Real CSV files can be uploaded in staging.
- Every import records who uploaded it, when, and what happened.

### Week 5-6: Operator Hardening

Purpose: make the shop-floor workflow reliable in low connectivity.

Backend tasks:

- Add `client_entry_id` UUID to operator entry schema.
- Add unique constraint on `client_entry_id`.
- Duplicate sync should return existing server record, not create another row.
- Add `device_id`.
- Add `created_offline_at`, `synced_at`, `sync_attempt_count`, and `entry_version`.
- Add supervisor approval flag for backdated or corrected entries.
- Pull machine list and shift config from master data.

Frontend tasks:

- Generate `client_entry_id` client-side.
- Save per-entry sync status in IndexedDB.
- Show queued, syncing, synced, and failed states.
- Show readable error messages for failed syncs.
- Add QR/barcode scan button for lot and batch fields using ZXing.js or browser `BarcodeDetector` where supported.
- Complete Marathi translations for errors, QC status labels, and defect labels.

Deliverable:

- Operators can work offline.
- Retry is safe and idempotent.
- Failed syncs remain visible.
- Supervisors can review flagged entries.

### Week 7-8: Trace, Alert, Export, Dashboard, and Compliance Skeleton

Purpose: make trace results useful in real quality workflows.

Trace and export tasks:

- Add `/api/v1/trace/dispatch/{order_id}/export?format=csv`.
- Add `/api/v1/alerts/lots/{lot_number}/export?format=csv`.
- Add PDF export if required for customer/CAPA workflows.
- Add permalinks such as `/app/trace?order_id=D-1847`.
- Show link type: deterministic, inferred, or reviewed.
- Show link confidence and review status.
- Add incomplete-trace warnings when any expected chain is missing.

Review tasks:

- Add unresolved-link review queue:
  - `GET /api/v1/review/unresolved-links`
  - `POST /api/v1/review/unresolved-links/{id}/approve`
  - `POST /api/v1/review/unresolved-links/{id}/reject`
- Store reviewer and timestamp.

Dashboard tasks:

- Add `/api/v1/dashboard/metrics`.
- Show batch count, pass rate, defect trend, top failing machines, supplier scorecard, open complaints, and pending operator entries.

Compliance tasks:

- Add `corrective_actions` table for 8D/CAPA-style records:

```sql
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);
```

- Add "Open Corrective Action" from lot alert or failed trace.
- Surface supplier approval status in UI.
- Add retention policy fields for audit readiness.

Alerting tasks:

- Add WhatsApp alert option for QC failures and recall events.
- Email/Teams can remain secondary.

Deliverable:

- QC can trace a dispatch, export evidence, initiate corrective action, and notify stakeholders.
- Management can see operational quality KPIs.

### Week 9-10: Pilot

Purpose: prove the system works under real plant conditions before full rollout.

Pilot scope:

- One production line.
- Real operators and supervisors.
- Real business file imports.
- Daily comparison against existing paper/Excel process.

Pilot activities:

- Train operators and supervisors, maximum 2 hours per role.
- Compare TraceLink output against paper/Excel control sample.
- Track issue log and fix weekly.
- Test backup and restore.
- Performance test with one month of real data.
- Confirm trace response under 2 seconds for normal queries.
- Confirm lot alert under 5 seconds for large but realistic fanouts.

Exit criteria:

- 95% or higher batch-entry completion on pilot line.
- Trace report matches control sample.
- No P0 defects open.
- Backup restore verified.
- Business signs off for wider rollout.

## Post-Pilot Rollout

After pilot success:

- Roll out line by line.
- Add remaining plants using `plant_id` scoping.
- Introduce supplier portal if business wants supplier-facing quality scorecards.
- Add ERP/webhook integrations.
- Expand compliance module for full IATF 16949 and ISO 9001 evidence support.
- Add professional UI theme for external business demonstrations.
- Add predictive quality alerts after enough clean production data exists.

## API Hardening

Use `/api/v1` for production endpoints.

Recommended endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/trace/dispatch/{order_id}`
- `GET /api/v1/trace/dispatch/{order_id}/export`
- `GET /api/v1/alerts/lots/{lot_number}`
- `GET /api/v1/alerts/lots/{lot_number}/export`
- `POST /api/v1/operator/batches`
- `GET /api/v1/operator/batches/recent`
- `POST /api/v1/imports`
- `GET /api/v1/imports/{import_id}`
- `GET /api/v1/review/unresolved-links`
- `POST /api/v1/review/unresolved-links/{id}/approve`
- `POST /api/v1/review/unresolved-links/{id}/reject`
- `GET /api/v1/dashboard/metrics`
- `POST /api/v1/compliance/corrective-actions`
- `GET /api/v1/compliance/corrective-actions`
- `PATCH /api/v1/compliance/corrective-actions/{ca_id}`
- `GET /api/v1/admin/audit-events`

API requirements:

- Strict Pydantic validation.
- Consistent error format.
- Request IDs.
- Pagination on list/fanout endpoints.
- Role checks on every protected endpoint.
- Rate limiting for login and expensive endpoints.
- OpenAPI docs enabled in staging.

## Data Ingestion Model

Each upload must create:

- `source_files`: file name, uploader, timestamp, checksum, row count, file type, status.
- `source_rows`: raw row JSON, row number, validation status.
- `import_runs`: summary of parse, validation, and commit.
- `import_errors`: row-level and file-level errors.
- Normalized domain rows only after validation.

Minimum validation rules:

- Required fields by file type.
- Date normalization.
- Numeric range checks.
- Supplier exists and is active.
- Machine exists and belongs to selected plant/line.
- Batch ID uniqueness.
- Dispatch batch reference resolution.
- Duplicate file detection by checksum.

Ambiguous links must enter review instead of silently becoming official.

## Security Plan

Authentication:

- Start with username/password and secure password hashing.
- Prefer `httpOnly`, `Secure`, `SameSite` cookies for browser sessions.
- Plan SSO later if the business uses Microsoft 365 or Google Workspace.

Authorization:

- Roles: `operator`, `supervisor`, `quality`, `manager`, `admin`.
- Every write action records user, timestamp, and request ID.

Data protection:

- HTTPS only.
- Production CORS must not be `*`.
- Secrets in environment variables or secret manager.
- No production data in Git.
- Automated backups.
- Restore test before go-live.
- Audit logs for imports, edits, approvals, exports, login failures, and admin changes.

## Observability and Operations

Structured logs should include:

- Request ID.
- User ID.
- Endpoint.
- Duration.
- Status code.
- Entity ID such as order, lot, batch, import, or corrective action.

Dashboards:

- API error rate.
- Trace query latency.
- Import success/failure count.
- Offline sync failures.
- Unresolved link count.
- Database size and backup status.
- Daily active users.

Alerts:

- App down.
- Database unavailable.
- Import failure.
- High unresolved link count.
- Repeated sync failures from a device.
- Backup failure.
- QC defect threshold crossed.

## Testing Strategy

Current tests cover demo anchors. Production tests must add:

| Gap | Test |
| --- | --- |
| Auth protection | Unauthenticated trace returns 401 |
| RBAC | Operator cannot rebuild/import/admin |
| SQLite interim concurrency | 10 simultaneous operator posts are handled during local/dev mode |
| PostgreSQL migration | Migrations run cleanly from empty DB |
| Data migration | SQLite row counts match PostgreSQL row counts |
| Confidence scoring | Unknown supplier gets no demo-specific boost |
| Lot alert pagination | `limit=2` returns `has_more=True` when appropriate |
| Offline partial failure | Failed entry remains queued |
| Idempotent sync | Duplicate `client_entry_id` does not create duplicate row |
| Import validation | Missing required columns returns validation errors |
| Audit log | Trace, alert, operator entry, import, and export create audit rows |
| Export | Trace export contains dispatch, batch, QC, raw lot, and supplier fields |
| Review queue | Approved inferred link records reviewer and timestamp |
| E2E offline | Operator saves offline, reconnects, syncs once |

Use Playwright for full browser workflows after the frontend auth/import/operator flows exist.

## Dependency Additions

Backend:

```text
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
pydantic-settings>=2.0
sqlalchemy>=2.0
alembic>=1.13
asyncpg>=0.29
psycopg2-binary>=2.9
redis>=5.0
prometheus-fastapi-instrumentator>=6.1
reportlab>=4.0
openpyxl>=3.1
```

Frontend:

```text
@tanstack/react-query
recharts
zxing-js/library
```

Add only when implementing the related feature. Do not add all dependencies in one unused batch.

## Deployment and Infrastructure

Environments:

- `local`: developer machine with safe test data.
- `staging`: business validation with realistic controlled data.
- `production`: live plant/business use.

Requirements:

- Dockerized app.
- Managed PostgreSQL.
- Object/file storage for uploaded source files.
- Automated daily backups.
- Restore test before go-live.
- CI/CD from GitHub Actions.
- Tagged releases and rollback instructions.
- Separate staging and production secrets.

Railway can support an early pilot if:

- PostgreSQL plugin is used.
- `DATABASE_URL` is configured.
- `JWT_SECRET_KEY`, CORS, and alert secrets are environment variables.
- Health check verifies app and database.
- Backups and restore procedure are documented.

## Business Reports and Exports

Required reports:

- Dispatch trace report.
- Lot contamination report.
- Recall list export.
- Supplier quality scorecard.
- QC defect trend report.
- Machine/shift/operator defect comparison.
- Open unresolved links report.
- Corrective action report.
- Monthly traceability coverage report.

Every export should include:

- Generated by.
- Generated at.
- Input filters.
- Data timestamp.
- Link type and confidence.
- Review status.

## Acceptance Criteria for Business Go-Live

TraceLink is business-ready only when:

- All users authenticate with assigned roles.
- `/api/rebuild`, imports, admin actions, and exports are protected.
- Production data is in PostgreSQL.
- Any existing SQLite pilot data has been migrated and verified.
- Confidence scoring is data-driven and not demo-hardcoded.
- Imports retain source files and row-level history.
- Critical actions are audited.
- Offline sync is idempotent and tested.
- Backups run automatically and restore has been tested.
- Trace and alert queries meet response-time targets.
- QC can export recall-ready reports.
- Incomplete traces are clearly marked.
- At least one pilot line has run successfully for two weeks.
- Business owners have signed off against real traceability samples.

## Priority Backlog

### Critical

- AUTH-01: JWT auth and RBAC.
- DB-01: SQLite WAL/busy timeout interim fix.
- LINK-01: remove demo-hardcoded confidence scoring.
- OFFLINE-01: fix offline sync partial failure loss.
- ALERT-01: add lot-alert pagination.
- AUDIT-01: audit log and middleware.
- INGEST-01: basic CSV upload and validation.
- STARTUP-01: FastAPI lifespan migration.

### High

- PostgreSQL and Alembic.
- SQLite-to-PostgreSQL migration script.
- Source-file/source-row import history.
- Trace and alert export.
- Unresolved-link review queue.
- Operator idempotency keys and device IDs.
- QR/barcode scan input.
- Dashboard metrics.
- WhatsApp alert option for QC failures.

### Medium

- Corrective action/8D skeleton.
- Supplier scorecard.
- Professional UI theme.
- Multi-plant support.
- ERP/webhook ingestion.
- Playwright E2E tests.
- Prometheus metrics and alerting.

### Later

- SSO.
- Supplier portal.
- Predictive quality alerts.
- Full IATF 16949 documentation module.
- Mobile wrapper if browser deployment is insufficient.

## Key Principle

The final product is not "the prototype with a nicer UI." It is a traceability control system. Every official trace result must be:

- Correct.
- Explainable.
- Reviewable.
- Exportable.
- Auditable.
- Backed by durable source data.

That is the standard for handing TraceLink to a business.
