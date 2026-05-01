// Shared API layer used by every redesign.
// All five designs route through these helpers so backend integration is identical.

export type TraceBatch = {
  batch_id: string;
  production: Record<string, any>;
  qc: Record<string, any>;
  raw_material: Record<string, any>;
};

export type TraceResult = {
  query_ms: number;
  dispatch: Record<string, any>;
  batches: TraceBatch[];
};

export type AlertResult = {
  query_ms: number;
  lot_number: string;
  summary: { batch_count: number; dispatch_order_count: number };
  affected_dispatch_orders: Record<string, any>[];
};

export type BatchEntry = {
  date: string;
  shift: string;
  machine_id: string;
  operator_id: string;
  raw_lot: string;
  units_produced: number;
  qc_notes?: string;
};

export async function fetchTrace(orderId: string): Promise<TraceResult> {
  const res = await fetch(`/api/trace/dispatch/${encodeURIComponent(orderId.trim())}`);
  if (!res.ok) throw new Error("Dispatch order not found");
  return res.json();
}

export async function fetchAlert(lot: string): Promise<AlertResult> {
  const res = await fetch(`/api/alerts/lot/${encodeURIComponent(lot.trim())}`);
  if (!res.ok) throw new Error("Lot not found");
  return res.json();
}

export async function postBatch(entry: BatchEntry): Promise<Response> {
  return fetch("/api/operator/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}
