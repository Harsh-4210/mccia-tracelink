/**
 * Offline queue — OFFLINE-01 FIX:
 *
 * syncQueuedEntries() now syncs one-by-one and only deletes
 * successfully synced entries. Failed entries remain in IndexedDB
 * for retry. Returns { synced, failed, errors }.
 */

const DB_NAME = "tracelink-offline";
const STORE = "batchEntries";

export type OfflineEntry = {
  id?: number;
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
  sync_status?: "queued" | "syncing" | "synced" | "failed";
  sync_error?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueEntry(entry: OfflineEntry) {
  // Generate client_entry_id for idempotency
  if (!entry.client_entry_id) {
    entry.client_entry_id = crypto.randomUUID();
  }
  entry.created_offline_at = entry.created_offline_at || new Date().toISOString();
  entry.device_id = entry.device_id || getDeviceId();
  entry.sync_status = "queued";

  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedEntries(): Promise<OfflineEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteEntry(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateEntryStatus(id: number, status: string, error?: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.sync_status = status;
        if (error) entry.sync_error = error;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type SyncResult = {
  synced: number;
  failed: number;
  errors: string[];
};

/**
 * OFFLINE-01 FIX: Sync entries one by one.
 * Delete only successfully synced entries.
 * Failed entries remain visible and retryable.
 */
export async function syncQueuedEntries(): Promise<SyncResult> {
  const entries = await getQueuedEntries();
  if (!entries.length) return { synced: 0, failed: 0, errors: [] };

  // Get Firebase ID token
  const { auth } = await import("./firebase");
  const fbUser = auth.currentUser;
  const token = fbUser ? await fbUser.getIdToken() : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const entryId = entry.id!;
    try {
      await updateEntryStatus(entryId, "syncing");

      const res = await fetch("/api/v1/operator/batches", {
        method: "POST",
        headers,
        body: JSON.stringify({
          date: entry.date,
          shift: entry.shift,
          machine_id: entry.machine_id,
          operator_id: entry.operator_id,
          raw_lot: entry.raw_lot,
          units_produced: entry.units_produced,
          qc_notes: entry.qc_notes,
          client_entry_id: entry.client_entry_id,
          device_id: entry.device_id,
          created_offline_at: entry.created_offline_at,
        }),
      });

      if (res.ok) {
        // Only delete successfully synced entries
        await deleteEntry(entryId);
        synced++;
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.detail || `HTTP ${res.status}`;
        await updateEntryStatus(entryId, "failed", errMsg);
        failed++;
        errors.push(`Entry ${entryId}: ${errMsg}`);
      }
    } catch (err: any) {
      const errMsg = err?.message || "Network error";
      await updateEntryStatus(entryId, "failed", errMsg);
      failed++;
      errors.push(`Entry ${entryId}: ${errMsg}`);
    }
  }

  return { synced, failed, errors };
}

// ── Device ID helper ─────────────────────────────────────────
export function getDeviceId(): string {
  let id = localStorage.getItem("tl_device_id");
  if (!id) {
    id = `device-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("tl_device_id", id);
  }
  return id;
}
