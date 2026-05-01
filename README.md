# TraceLink MVP

AI-powered batch traceability demo for Precision Auto Parts. The app links raw material lots, production batches, QC results, finished goods dispatches, and OEM complaints from the provided CSV files.

## Backend

```bash
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests -q
PYTHONPATH=backend backend/.venv/bin/uvicorn app.main:app --reload
```

Rebuild the trace database:

```bash
curl -X POST http://127.0.0.1:8000/api/rebuild
```

Demo queries:

```bash
curl http://127.0.0.1:8000/api/trace/dispatch/D-1847
curl http://127.0.0.1:8000/api/alerts/lot/LOT-2023-114
```

## Frontend

Use bun, not npm or yarn.

```bash
bun install --cwd frontend
cd frontend && bun run dev
cd frontend && bun run build
```

Open the Vite URL and use the three demo panels: Trace Dispatch Order, Contamination Alert, and Operator Batch Entry. The operator form stores entries offline in IndexedDB and syncs when the browser is online.

## Data

The pipeline reads these root-level files: `raw_materials_log.csv`, `production_log.csv`, `qc_inspection.csv`, `dispatch_log.csv`, `supplier_master.csv`, and `defect_complaints.csv`. See `docs/data-cleaning-assumptions.md` for linking and normalization rules.

## Required Demo Anchors

- Dispatch `D-1847` resolves to `BATCH-2023-0500`, `LOT-2023-114`, machine `MC-04`, shift `C`, QC `FAIL`, `surface_delamination`, and defect rate `5.74%`.
- Lot alert `LOT-2023-114` includes the anchor dispatches `D-1847`, `D-1921`, `D-2044`, `D-2102`, and `D-2367`.
- The raw lot ambiguity is resolved to supplier `S03` / Sundaram Clayton for the delamination scenario with a confidence explanation.

## Scaling Brief

See `docs/scaling-to-10-lines.md`.

## Deploy on Railway

This repo ships a single Docker image: Bun builds the Vite app, Python serves `/api/*` and the static SPA from `frontend/dist`. Railway injects `PORT`; the container runs `uvicorn` on that port.

### Critical: repository root, not `backend`

In Railway → your service → **Settings** → **Source** → **Root Directory**, this must be **empty** or **`/`** (the Git repo root).

If Root Directory is set to **`backend`**, the build only uploads that folder (~hundreds of KB). Railway then cannot see the repo-root [`Dockerfile`](Dockerfile), the CSV data files, or [`frontend/`](frontend/), so it falls back to **Railpack** on Python only and fails with **“No start command detected”**.

[`railway.json`](railway.json) forces the **DOCKERFILE** builder when the full repo is used.

1. Create a project on [Railway](https://railway.app), choose **Deploy from GitHub**, select this repository.
2. Clear **Root Directory** so the build uses the repository root. Railway will use [`railway.json`](railway.json) / [`Dockerfile`](Dockerfile). Set the **healthcheck** path to `/api/health` if the dashboard does not pick it up from config.
3. Optional variables:
   - `CORS_ORIGINS` — comma-separated list if the UI is hosted on another origin (default `*` for demos).
   - `FRONTEND_DIST` — override path to built static files (default `/app/frontend/dist` in the image).

The SQLite file lives on the container filesystem. Each redeploy rebuilds the DB on first boot from the bundled CSVs. Add a Railway **volume** mounted at `/app/backend` if you need persistence across deploys.

Locally you can smoke-test the production layout after `cd frontend && bun run build` by running uvicorn from the repo root with `PYTHONPATH=backend` (static files must exist under `frontend/dist`).