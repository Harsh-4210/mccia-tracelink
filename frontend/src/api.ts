// Shared API layer — all requests include Firebase ID token auth headers.
// Token is retrieved from Firebase Auth currentUser.

import { auth } from "./firebase";

async function getToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...(await authHeaders()), ...(options.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("tl:unauthorized"));
  }
  return res;
}


// ── Types ─────────────────────────────────────────────────────
export type TraceBatch = {
  batch_id: string;
  production: Record<string, any>;
  qc: Record<string, any>;
  raw_material: Record<string, any>;
  link_type?: string;
};

export type TraceResult = {
  query_ms: number;
  dispatch: Record<string, any>;
  batches: TraceBatch[];
  incomplete_warnings?: string[];
  warnings?: string[];
  anomalies: string[];
  status?: "complete" | "partial";
};

export type AlertResult = {
  query_ms: number;
  lot_number: string;
  summary: {
    batch_count: number;
    dispatch_order_count: number;
    failed_batch_count?: number;
    financial_exposure?: number;
    escaped_shipments_count?: number;
    post_qc_dispatches_count?: number;
    quarantine_recommendations?: string[];
  };
  affected_dispatch_orders: Record<string, any>[];
  failed_batches?: string[];
  total_count?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
};

export type BatchEntry = {
  date: string;
  shift: string;
  machine_id: string;
  operator_id: string;
  raw_lot: string;
  units_produced: number;
  qc_notes?: string;
  client_entry_id?: string;
  device_id?: string;
  created_offline_at?: string;
};

export type DashboardMetrics = {
  batch_count: number;
  pass_rate: number;
  defect_trend: Record<string, any>[];
  top_failing_machines: Record<string, any>[];
  supplier_scorecard: Record<string, any>[];
  open_complaints: number;
  financial_exposure: number;
  recent_complaints?: Record<string, any>[];
  pending_operator_entries: number;
  unresolved_links: number;
  recent_imports: Record<string, any>[];
  open_corrective_actions: number;
  shift_metrics: { shift: string; total_inspections: number; fail_count: number; avg_defect_rate: number }[];
  complaints_by_oem?: { oem_id: string; count: number }[];
  total_financial_impact?: number;
};

// ── Trace ────────────────────────────────────────────────────
export async function fetchTrace(orderId: string): Promise<TraceResult> {
  const res = await authFetch(`/api/v1/trace/${encodeURIComponent(orderId.trim())}`);
  if (!res.ok) throw new Error("Dispatch order not found");
  return res.json();
}

export async function fetchTraceV1(orderId: string): Promise<TraceResult> {
  const res = await authFetch(`/api/v1/trace/${encodeURIComponent(orderId.trim())}`);
  if (!res.ok) throw new Error("Dispatch order not found");
  return res.json();
}

// ── Alerts ───────────────────────────────────────────────────
export async function fetchAlert(lot: string): Promise<AlertResult> {
  const res = await authFetch(`/api/v1/alerts/lots/${encodeURIComponent(lot.trim())}`);
  if (!res.ok) throw new Error("Lot not found");
  return res.json();
}

export async function fetchAlertV1(lot: string, limit = 100, offset = 0): Promise<AlertResult> {
  const res = await authFetch(`/api/v1/alerts/lots/${encodeURIComponent(lot.trim())}?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error("Lot not found");
  return res.json();
}

// ── Operator ─────────────────────────────────────────────────
export async function postBatch(entry: BatchEntry): Promise<Response> {
  return authFetch("/api/v1/operator/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export async function postBatchV1(entry: BatchEntry): Promise<Response> {
  return authFetch("/api/v1/operator/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export async function fetchRecentEntries(limit = 50): Promise<any> {
  const res = await authFetch(`/api/v1/operator/batches/recent?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch entries");
  return res.json();
}

// ── Auth & Users ─────────────────────────────────────────────
export async function fetchUsers(): Promise<any> {
  const res = await authFetch("/api/v1/auth/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function deleteAccount(): Promise<any> {
  const res = await authFetch("/api/v1/auth/me", { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete account");
  return res.json();
}


// ── Dashboard ────────────────────────────────────────────────
export async function fetchDashboard(): Promise<DashboardMetrics> {
  const res = await authFetch("/api/v1/dashboard/metrics");
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return res.json();
}

export async function fetchComplaints(): Promise<{ complaints: Record<string, any>[] }> {
  const data = await fetchDashboard();
  return { complaints: data.recent_complaints || [] };
}

// ── Imports ──────────────────────────────────────────────────
export async function uploadImport(file: File, fileType: string): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("file_type", fileType);
  const res = await authFetch("/api/v1/imports", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Import failed");
  }
  return res.json();
}

export async function uploadImportWithProgress(
  file: File,
  fileType: string,
  onProgress: (pct: number) => void,
): Promise<any> {
  const token = await getToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/imports");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || `Import failed (HTTP ${xhr.status})`));
        } catch { reject(new Error(`Import failed (HTTP ${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 120000; // 2 min timeout for large files

    const formData = new FormData();
    formData.append("file", file);
    formData.append("file_type", fileType);
    xhr.send(formData);
  });
}

export async function fetchImportDetails(importId: string): Promise<any> {
  const res = await authFetch(`/api/v1/imports/${importId}`);
  if (!res.ok) throw new Error("Failed to fetch import details");
  return res.json();
}

export async function fetchDataUsage(): Promise<any> {
  const res = await authFetch("/api/v1/admin/health");
  if (!res.ok) throw new Error("Failed to fetch data usage");
  return res.json();
}

export async function fetchImports(): Promise<any> {
  const res = await authFetch("/api/v1/imports");
  if (!res.ok) throw new Error("Failed to fetch imports");
  return res.json();
}

export async function deleteImport(importId: string): Promise<any> {
  const res = await authFetch(`/api/v1/imports/${importId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

// ── Compliance ───────────────────────────────────────────────
export async function fetchCorrectiveActions(status?: string): Promise<any> {
  const params = status ? `?status=${status}` : "";
  const res = await authFetch(`/api/v1/compliance/corrective-actions${params}`);
  if (!res.ok) throw new Error("Failed to fetch CAs");
  return res.json();
}

export async function createCorrectiveAction(data: Record<string, any>): Promise<any> {
  const res = await authFetch("/api/v1/compliance/corrective-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create CA");
  return res.json();
}

export async function updateCorrectiveAction(caId: string, data: Record<string, any>): Promise<any> {
  const res = await authFetch(`/api/v1/compliance/corrective-actions/${caId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update CA");
  return res.json();
}

// ── Review Queue ─────────────────────────────────────────────
export async function fetchUnresolvedLinks(limit = 200, offset = 0): Promise<any> {
  const res = await authFetch(`/api/v1/review/unresolved-links?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error("Failed to fetch unresolved links");
  return res.json();
}

export async function approveLink(productionId: number, notes = ""): Promise<any> {
  const res = await authFetch(`/api/v1/review/unresolved-links/${productionId}/approve?notes=${encodeURIComponent(notes)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to approve link");
  return res.json();
}

export async function rejectLink(productionId: number, notes = ""): Promise<any> {
  const res = await authFetch(`/api/v1/review/unresolved-links/${productionId}/reject?notes=${encodeURIComponent(notes)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reject link");
  return res.json();
}

// ── Admin ────────────────────────────────────────────────────
export async function fetchAuditEvents(limit = 100, offset = 0): Promise<any> {
  const res = await authFetch(`/api/v1/admin/audit-events?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error("Failed to fetch audit events");
  return res.json();
}

export async function fetchPipelineAudit(): Promise<any> {
  const res = await authFetch(`/api/v1/admin/pipeline-audit`);
  if (!res.ok) throw new Error("Failed to fetch pipeline audit");
  return res.json();
}

// ── Export helpers ────────────────────────────────────────────
export function traceExportUrl(orderId: string): string {
  return `/api/v1/trace/dispatch/${encodeURIComponent(orderId)}/export?format=csv`;
}

export function alertExportUrl(lot: string): string {
  return `/api/v1/alerts/lots/${encodeURIComponent(lot)}/export?format=csv`;
}

async function downloadAuthenticatedCsv(url: string, filename: string): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadTraceExport(orderId: string): Promise<void> {
  await downloadAuthenticatedCsv(traceExportUrl(orderId), `trace_${orderId}.csv`);
}

export async function downloadAlertExport(lot: string): Promise<void> {
  await downloadAuthenticatedCsv(alertExportUrl(lot), `alert_${lot}.csv`);
}

export async function fetchAiQuery(query: string): Promise<any> {
  const res = await authFetch(`/api/v1/ai/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("Failed to process AI query");
  return res.json();
}
