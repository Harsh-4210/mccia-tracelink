# TraceLink

TraceLink is a manufacturing traceability system for connecting raw material lots, production batches, quality inspections, dispatch orders, and customer complaints. It is designed for fast recall investigation, supplier-risk analysis, and audit-ready operational visibility.

The application includes a FastAPI backend, a React/Vite frontend, SQLite-backed demo data, Firebase Authentication, role-based access control, CSV ingestion, trace exports, operator batch entry, compliance actions, and an audit trail.

## What TraceLink Does

When a customer reports a defect or a raw material lot is flagged, TraceLink helps answer:

- Which raw material lot was used in a dispatch order?
- Which production batch, machine, operator, and shift produced it?
- What did QC record for that batch?
- Which other customer orders may be affected by the same lot?
- What follow-up actions, reviews, and audit events exist?

Core trace flow:

```text
Raw Material Lot -> Production Batch -> QC Inspection -> Dispatch Order -> Customer
```

## Key Capabilities

| Area | Capability |
| --- | --- |
| Trace search | Backward trace from dispatch orders to production, QC, raw lot, and supplier data |
| Lot alerts | Forward impact analysis from a raw lot to affected batches and dispatches |
| CSV ingestion | Upload and validate manufacturing data, with rollback support for imported files |
| Link review | Review, approve, or reject inferred trace links |
| Operator entry | Create shop-floor batch entries with idempotent sync support |
| Dashboard | Operational metrics, QC trends, and shift-level visibility |
| Compliance | Corrective action tracking for quality follow-up workflows |
| Auditability | Request-level audit events for trace, import, review, admin, and operator activity |
| AI assistant | Natural-language query endpoint for logistics and traceability questions |
| Frontend | React SPA with Firebase login, role-aware workflows, and localized UI support |

## Architecture

```text
Frontend: React + Vite
  - Firebase client authentication
  - API client with bearer-token requests
  - Offline/operator sync helpers

Backend: FastAPI
  - Firebase Admin token verification
  - Role-based route dependencies
  - Versioned API routes under /api/v1
  - Audit middleware
  - Static frontend serving in production builds

Storage
  - SQLite database for local/demo operation
  - CSV source files for sample manufacturing data
```

The production Docker image builds the frontend with Bun, installs the Python API dependencies, copies the sample CSV files, and serves both API and static SPA from one container.

## Repository Layout

```text
.
├── backend/
│   ├── app/
│   │   ├── api/                 # Versioned route modules
│   │   ├── auth.py              # Firebase token verification and RBAC helpers
│   │   ├── config.py            # Environment configuration
│   │   ├── db.py                # SQLite connection helpers
│   │   ├── linking.py           # Trace-link matching and scoring
│   │   ├── main.py              # FastAPI app, middleware, routes, SPA mount
│   │   ├── middleware.py        # Audit logging middleware
│   │   ├── pipeline.py          # Schema creation and CSV rebuild pipeline
│   │   └── schemas.py           # Request/response models
│   ├── requirements.txt
│   └── tests/
├── docs/
│   ├── data-cleaning-assumptions.md
│   └── scaling-to-10-lines.md
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── *.csv                        # Demo manufacturing data
├── Dockerfile
└── README.md
```

## Prerequisites

- Python 3.11 recommended
- Node.js 18+ or Bun for frontend development
- Firebase project with Email/Password auth enabled
- Firebase service account credentials for backend token verification

## Local Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Place your Firebase service account JSON at:

```text
backend/serviceAccountKey.json
```

Then rebuild the local SQLite database from the CSV files:

```bash
python -c "from app.pipeline import rebuild_database; print(rebuild_database())"
```

Start the API:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Useful backend URLs:

- Health check: `http://127.0.0.1:8000/api/health`
- OpenAPI docs: `http://127.0.0.1:8000/api/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server listens on:

```text
http://localhost:5173
```

## Configuration

TraceLink reads configuration from environment variables or a root `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `dev` | Use `dev`, `staging`, or `production` |
| `DATABASE_URL` | `sqlite:///backend/tracelink.sqlite3` | Database URL placeholder for current SQLite setup |
| `DB_PATH` | `backend/tracelink.sqlite3` | SQLite database path |
| `FIREBASE_PROJECT_ID` | `tracelink-793ba` | Firebase project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | `backend/serviceAccountKey.json` | Firebase service account key path |
| `CORS_ORIGINS` | `*` | Allowed browser origins; must be restricted in production |
| `DEFAULT_ADMIN_EMAIL` | project default | Seeded admin email used by the local data pipeline |
| `DEFAULT_ADMIN_PASSWORD` | `FIREBASE_AUTH` | Placeholder marker for Firebase-managed auth |

Production mode refuses to start when `CORS_ORIGINS` is empty or `*`.

## Authentication and Roles

The frontend authenticates users with Firebase. Backend requests must include a Firebase ID token:

```http
Authorization: Bearer <firebase-id-token>
```

The API verifies the token with `firebase-admin`, creates or updates a local user record, and enforces route access using local roles.

Supported roles:

| Role | Intended access |
| --- | --- |
| `pending` | Newly synced user awaiting role assignment |
| `operator` | Operator batch entry and standard trace visibility |
| `supervisor` | Operator review and inferred-link approval |
| `quality` | Imports, compliance workflows, and quality review |
| `manager` | Dashboard, trace, alert, and reporting workflows |
| `admin` | User management, audit logs, health, and administrative actions |

Admin role assignment is available through:

```http
PATCH /api/v1/auth/users/{user_id}/role?role=admin
```

## API Overview

Most application endpoints are mounted under `/api/v1`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/firebase-sync` | Sync Firebase user into the local user table |
| `GET` | `/api/v1/auth/me` | Return current user profile and role |
| `GET` | `/api/v1/auth/users` | List users for admin management |
| `PATCH` | `/api/v1/auth/users/{user_id}/role` | Update a user's role |
| `GET` | `/api/v1/trace/dispatch/{order_id}` | Trace a dispatch order backward through production, QC, and raw material data |
| `GET` | `/api/v1/trace/dispatch/{order_id}/export` | Export trace results |
| `GET` | `/api/v1/alerts/lots/{lot_number}` | Analyze downstream impact for a flagged raw lot |
| `GET` | `/api/v1/alerts/lots/{lot_number}/export` | Export lot impact results |
| `POST` | `/api/v1/operator/batches` | Create an operator batch entry |
| `GET` | `/api/v1/operator/batches/recent` | List recent operator entries |
| `GET` | `/api/v1/operator/batches/pending` | List pending operator entries |
| `POST` | `/api/v1/operator/batches/{entry_id}/approve` | Approve an operator entry |
| `POST` | `/api/v1/imports` | Upload a CSV import |
| `GET` | `/api/v1/imports` | List imports |
| `GET` | `/api/v1/imports/{import_id}` | Inspect an import |
| `DELETE` | `/api/v1/imports/{import_id}` | Roll back imported data |
| `GET` | `/api/v1/review/unresolved-links` | List inferred links needing review |
| `POST` | `/api/v1/review/unresolved-links/{production_id}/approve` | Approve an inferred link |
| `POST` | `/api/v1/review/unresolved-links/{production_id}/reject` | Reject an inferred link |
| `GET` | `/api/v1/dashboard/metrics` | Return dashboard metrics |
| `POST` | `/api/v1/compliance/corrective-actions` | Create a corrective action |
| `GET` | `/api/v1/compliance/corrective-actions` | List corrective actions |
| `GET` | `/api/v1/admin/audit-events` | View audit events |
| `GET` | `/api/v1/admin/pipeline-audit` | Inspect pipeline and imputation audit data |
| `GET` | `/api/v1/admin/health` | Administrative health details |
| `POST` | `/api/v1/ai/query` | AI-assisted logistics query endpoint |

There are also legacy compatibility endpoints under `/api/*` for selected trace, alert, rebuild, and operator workflows.

## Demo Data

The root CSV files provide a complete sample traceability dataset:

| File | Contents |
| --- | --- |
| `raw_materials_log.csv` | Raw material lots, suppliers, receipt data, and material metadata |
| `production_log.csv` | Production batches, machines, operators, shifts, and raw-lot references |
| `qc_inspection.csv` | QC results, defect types, and defect rates |
| `dispatch_log.csv` | Dispatch orders, customers, dates, and batch references |
| `supplier_master.csv` | Supplier metadata and approval status |
| `defect_complaints.csv` | Customer complaints and root-cause references |

The database is rebuilt from these files by `backend/app/pipeline.py`.

## Testing

Run backend tests from the repository root with:

```bash
PYTHONPATH=backend pytest backend/tests
```

Build the frontend with:

```bash
cd frontend
npm run build
```

## Render Deployment

The project is currently deployed on Render as a Docker web service. Render builds the root `Dockerfile`, which compiles the frontend and serves the FastAPI API plus the static React app from one container.

Current production service:

```text
https://tracelink.ruchir.dev
```

Render should deploy automatically when changes are merged into the connected `main` branch, as long as auto-deploy is enabled for the service and the service is watching the correct GitHub repository and branch.

For a manual deploy in Render:

1. Open the `mccia-tracelink` web service.
2. Confirm the connected branch is `main`.
3. Use `Manual Deploy -> Deploy latest commit`.
4. Confirm the deploy event references the latest Git commit from `main`.

The service is expected to run with:

```text
PORT=8000
```

The Dockerfile command binds to Render's assigned port with `${PORT:-8000}`.

## Docker

Build the image locally:

```bash
docker build -t tracelink .
```

Run it:

```bash
docker run --rm -p 8000:8000 \
  -e ENVIRONMENT=dev \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/backend/serviceAccountKey.json \
  tracelink
```

For production deployment, provide credentials securely through your platform's secret manager rather than baking them into the image.

## Production Notes

Before using TraceLink with live manufacturing data:

- Restrict `CORS_ORIGINS` to approved domains.
- Store Firebase service account credentials outside the repository.
- Replace local/demo SQLite operation with a managed production database when concurrency, retention, backup, and migration controls are required.
- Put API traffic behind HTTPS.
- Define backup and restore procedures for database and uploaded source files.
- Review `docs/data-cleaning-assumptions.md` before onboarding customer data.
- Review `docs/scaling-to-10-lines.md` for multi-line or larger plant deployments.

## License

MIT
