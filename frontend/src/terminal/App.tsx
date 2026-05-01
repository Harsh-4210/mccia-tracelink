import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { fetchAlert, fetchTrace, postBatch, type AlertResult, type TraceResult } from "../api";
import { enqueueEntry, getQueuedEntries, syncQueuedEntries } from "../offlineQueue";
import "./styles.css";

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => {
      window.removeEventListener("online", u);
      window.removeEventListener("offline", u);
    };
  }, []);
  return online;
}

function StatusBar({ online, scope }: { online: boolean; scope: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="d1-statusbar">
      <span>TRACELINK · OPS-CONSOLE v3.2 · {scope}</span>
      <span className={online ? "ok" : "warn"}>
        <span className="blink">●</span> {online ? "LINK STABLE" : "OFFLINE"}
      </span>
      <span>UTC {now.toISOString().slice(11, 19)}</span>
      <span>NODE 14 / SHIFT B</span>
    </div>
  );
}

/* ============================== LANDING ============================== */
function Landing() {
  const online = useOnline();
  return (
    <div className="d1-root">
      <div className="d1-scan" />
      <StatusBar online={online} scope="UNAUTH" />
      <main className="d1-land">
        <div className="d1-asciibadge">[ MFG // PRECISION-AUTO-PARTS ]</div>
        <h1 className="d1-headline">
          Trace any <em>dispatch</em><br /> in 30 seconds<span className="cursor" />
        </h1>
        <p className="d1-sub">
          TraceLink unwinds your supply chain in reverse. From a single dispatch order, walk back
          through batch, raw lot, supplier, machine, shift, operator, and QC — even when half of
          it lived on paper. Built for shop-floor reality: Excel imports, fuzzy matches, offline
          entry.
        </p>
        <div className="d1-row" style={{ marginTop: 8 }}>
          <Link to="/app/trace" className="d1-cta">
            ▶ GET STARTED
          </Link>
        </div>

        <div className="d1-grid3">
          <div>
            <span className="key">Latency // P95</span>
            <span className="val">28 ms</span>
            <span className="note">Dispatch → root cause traversal across 12 joins.</span>
          </div>
          <div>
            <span className="key">Records // Linked</span>
            <span className="val">1.2 M</span>
            <span className="note">Excel + paper + ERP rows reconciled with confidence scores.</span>
          </div>
          <div>
            <span className="key">Floor // Languages</span>
            <span className="val">EN / मराठी</span>
            <span className="note">Operators log batches in their language. Offline-first.</span>
          </div>
        </div>

        <pre className="d1-asciirun">
{`> trace dispatch D-1847
  ├─ batch B-77231       supplier  ALPHA-METALS    machine MC-04   shift B
  │   ├─ raw lot         LOT-2023-114                              conf 0.94
  │   └─ qc              PASS  defect 0.4%                         op   OP-019
  └─ batch B-77232       supplier  ALPHA-METALS    machine MC-04   shift B
      ├─ raw lot         LOT-2023-114                              conf 0.91
      └─ qc              FAIL  pinhole 2.1%                        op   OP-019
> done in 26ms_`}
        </pre>
      </main>
    </div>
  );
}

/* ============================== DASHBOARD SHELL ============================== */
function DashboardShell({ children, page }: { children: React.ReactNode; page: string }) {
  const online = useOnline();
  return (
    <div className="d1-root">
      <div className="d1-scan" />
      <StatusBar online={online} scope={page} />
      <div className="d1-dash">
        <aside className="d1-side">
          <div className="d1-brand">TRACELINK</div>
          <nav className="d1-nav">
            <NavLink to="/app/trace" end className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : "")}>
              <span>01</span>TRACE
            </NavLink>
            <NavLink to="/app/alert" className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : "")}>
              <span>02</span>ALERT
            </NavLink>
            <NavLink to="/app/operator" className={({ isActive }: { isActive: boolean }) => (isActive ? "active" : "")}>
              <span>03</span>ENTRY
            </NavLink>
            <NavLink to="/" className="" style={{ marginTop: 18 }}>
              <span>↩</span>EXIT
            </NavLink>
          </nav>
          <div className="meta">
            session 0x4F · build 2026.04 · ops-console
          </div>
        </aside>
        <main className="d1-main">{children}</main>
      </div>
    </div>
  );
}

/* ============================== TRACE SEARCH ============================== */
function TraceScreen() {
  const [orderId, setOrderId] = useState("D-1847");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setError("");
    setLoading(true);
    try {
      setResult(await fetchTrace(orderId));
    } catch (e: any) {
      setError(e?.message || "Trace failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell page="TRACE">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">// MODULE 01 · DISPATCH-TRACE</div>
          <h1>Trace.dispatch</h1>
        </div>
        <div className="crumb">DEMO ANCHOR · D-1847</div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">[ INPUT ]</div>
        <h2>Resolve a dispatch order to its full upstream chain</h2>
        <div className="d1-row" style={{ marginTop: 14 }}>
          <input
            className="d1-input"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="D-1847"
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Dispatch order"
          />
          <button className="d1-btn amber" onClick={run} disabled={loading}>
            {loading ? "▶▶ TRACING…" : "▶ EXECUTE"}
          </button>
        </div>
        {error && <div className="d1-error" style={{ marginTop: 14 }}>! {error}</div>}

        {result && (
          <div className="d1-result">
            <div className="d1-metric">
              <span>QUERY <strong>{result.query_ms} ms</strong></span>
              <span>ORDER <strong>{result.dispatch.order_id}</strong></span>
              <span>OEM <strong>{result.dispatch.customer_id}</strong></span>
              <span>BATCHES <strong>{result.batches.length}</strong></span>
            </div>
            {result.batches.map((b) => (
              <div className="d1-trace" key={b.batch_id}>
                <div className="lane">
                  <div className="id">{b.batch_id}</div>
                  <div className="conf">CONF {Math.round((b.raw_material?.confidence || 0) * 100)}%</div>
                  <div className="conf">
                    {b.qc?.pass_fail === "PASS" ? <span className="d1-pf pass">PASS</span> : <span className="d1-pf fail">FAIL</span>}
                  </div>
                </div>
                <div className="body">
                  <div className="row"><span className="lbl">RAW LOT</span><span className="v">{b.production?.input_lot_ref}</span></div>
                  <div className="row"><span className="lbl">SUPPLIER</span><span className="v">{b.raw_material?.supplier?.supplier_name} · {b.raw_material?.supplier_id}</span></div>
                  <div className="row"><span className="lbl">MACHINE</span><span className="v">{b.production?.machine_id}</span></div>
                  <div className="row"><span className="lbl">SHIFT</span><span className="v">{b.production?.shift}</span></div>
                  <div className="row"><span className="lbl">OPERATOR</span><span className="v">{b.production?.operator_id}</span></div>
                  <div className="row"><span className="lbl">DEFECT</span><span className="v">{b.qc?.defect_type_normalized || "—"} · {b.qc?.defect_rate_pct ?? 0}%</span></div>
                  <div className="reason">REASON · {b.raw_material?.confidence_reasons?.join(" / ") || "no reasons recorded"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

/* ============================== CONTAMINATION ============================== */
function AlertScreen() {
  const [lot, setLot] = useState("LOT-2023-114");
  const [result, setResult] = useState<AlertResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setError("");
    setLoading(true);
    try {
      setResult(await fetchAlert(lot));
    } catch (e: any) {
      setError(e?.message || "Alert failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell page="ALERT">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">// MODULE 02 · CONTAMINATION-FANOUT</div>
          <h1>Alert.lot</h1>
        </div>
        <div className="crumb">DEMO ANCHOR · LOT-2023-114</div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">[ FANOUT ]</div>
        <h2>Find every dispatch order touched by a suspect raw lot</h2>
        <div className="d1-row" style={{ marginTop: 14 }}>
          <input
            className="d1-input"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            placeholder="LOT-2023-114"
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Lot number"
          />
          <button className="d1-btn" onClick={run} disabled={loading}>
            {loading ? "▶▶ SCANNING…" : "▶ SIMULATE"}
          </button>
        </div>
        {error && <div className="d1-error" style={{ marginTop: 14 }}>! {error}</div>}

        {result && (
          <div className="d1-result">
            <div className="d1-metric">
              <span>LOT <strong>{result.lot_number}</strong></span>
              <span>BATCHES <strong>{result.summary.batch_count}</strong></span>
              <span>AT-RISK ORDERS <strong>{result.summary.dispatch_order_count}</strong></span>
              <span>QUERY <strong>{result.query_ms} ms</strong></span>
            </div>
            <div style={{ overflowX: "auto", border: "1px solid var(--line-strong)" }}>
              <table className="d1-table">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>OEM</th>
                    <th>DATE</th>
                    <th>BATCH</th>
                    <th>QC</th>
                  </tr>
                </thead>
                <tbody>
                  {result.affected_dispatch_orders.map((row) => (
                    <tr key={`${row.order_id}-${row.batch_id}`}>
                      <td style={{ color: "var(--amber)", fontFamily: "JetBrains Mono" }}>{row.order_id}</td>
                      <td>{row.customer_id}</td>
                      <td>{row.dispatch_date}</td>
                      <td style={{ fontFamily: "JetBrains Mono" }}>{row.batch_id}</td>
                      <td>
                        {row.pass_fail ? (
                          <span className={`d1-pf ${row.pass_fail === "PASS" ? "pass" : "fail"}`}>
                            {row.pass_fail}{row.defect_rate_pct ? ` · ${row.defect_rate_pct}%` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

/* ============================== OPERATOR ENTRY ============================== */
const labels = {
  en: { title: "Operator Batch Entry", lot: "Raw lot", machine: "Machine", shift: "Shift", operator: "Operator", units: "Units produced", notes: "QC notes", date: "Date", save: "SAVE BATCH" },
  mr: { title: "ऑपरेटर बॅच नोंद", lot: "कच्चा लॉट", machine: "मशीन", shift: "शिफ्ट", operator: "ऑपरेटर", units: "तयार नग", notes: "QC नोंद", date: "तारीख", save: "बॅच सेव करा" }
};

function OperatorScreen() {
  const online = useOnline();
  const [lang, setLang] = useState<"en" | "mr">("en");
  const [queued, setQueued] = useState(0);
  const [message, setMessage] = useState("");
  const t = labels[lang];

  useEffect(() => {
    getQueuedEntries().then((entries) => setQueued(entries.length));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry = {
      date: String(data.get("date")),
      raw_lot: String(data.get("raw_lot")),
      machine_id: String(data.get("machine_id")),
      shift: String(data.get("shift")),
      operator_id: String(data.get("operator_id")),
      units_produced: Number(data.get("units_produced")),
      qc_notes: String(data.get("qc_notes") || "")
    };
    if (!entry.raw_lot || !entry.machine_id || !entry.operator_id || !entry.units_produced) {
      setMessage(lang === "en" ? "Please fill lot, machine, operator, and units." : "लॉट, मशीन, ऑपरेटर आणि नग भरा.");
      return;
    }
    if (!online) {
      await enqueueEntry(entry);
      setQueued((c) => c + 1);
      setMessage(lang === "en" ? "Saved offline. Will sync later." : "ऑफलाइन सेव झाले. नंतर सिंक होईल.");
      event.currentTarget.reset();
      return;
    }
    const res = await postBatch(entry);
    setMessage(res.ok ? (lang === "en" ? "Batch saved." : "बॅच सेव झाली.") : "Save failed");
    event.currentTarget.reset();
  }

  async function syncNow() {
    const count = await syncQueuedEntries();
    setQueued(0);
    setMessage(`${count} queued entries synced.`);
  }

  return (
    <DashboardShell page="ENTRY">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">// MODULE 03 · OPERATOR-INPUT</div>
          <h1>Entry.batch</h1>
        </div>
        <div className="d1-langtoggle">
          <button onClick={() => setLang("en")} className={lang === "en" ? "on" : ""}>EN</button>
          <button onClick={() => setLang("mr")} className={lang === "mr" ? "on" : ""}>मराठी</button>
        </div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">[ FORM ]</div>
        <h2>{t.title}</h2>
        <p style={{ color: "var(--ink-mid)", margin: "4px 0 18px", fontSize: 13 }}>
          Large controls. Simple language. Offline-first.
        </p>
        <form className="d1-form" onSubmit={submit}>
          <label>{t.date}<input className="d1-input" name="date" type="date" required /></label>
          <label>{t.lot}<input className="d1-input" name="raw_lot" placeholder="LOT-2023-114" required /></label>
          <label>{t.machine}
            <select className="d1-input" name="machine_id">
              <option>MC-01</option><option>MC-02</option><option>MC-03</option><option>MC-04</option><option>MC-05</option>
            </select>
          </label>
          <label>{t.shift}
            <select className="d1-input" name="shift">
              <option>A</option><option>B</option><option>C</option>
            </select>
          </label>
          <label>{t.operator}<input className="d1-input" name="operator_id" placeholder="OP-001" required /></label>
          <label>{t.units}<input className="d1-input" name="units_produced" type="number" min="1" required /></label>
          <label className="span3">{t.notes}<input className="d1-input" name="qc_notes" placeholder="optional" /></label>
          <div className="span3">
            <button className="d1-btn amber" type="submit">▶ {t.save}</button>
          </div>
        </form>

        <div className="d1-syncbar" style={{ marginTop: 18 }}>
          <span>QUEUED · <strong>{queued}</strong></span>
          {online && queued > 0 && <button className="d1-btn ghost" onClick={syncNow}>⟳ SYNC NOW</button>}
          <span style={{ color: online ? "var(--ink)" : "var(--amber)" }}>{online ? "● ONLINE" : "● OFFLINE"}</span>
          {message && <strong style={{ marginLeft: "auto" }}>{message}</strong>}
        </div>
      </section>
    </DashboardShell>
  );
}

/* ============================== ROUTES ============================== */
function DashIndex() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/app/trace", { replace: true }); }, [navigate]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="app" element={<DashIndex />} />
      <Route path="app/trace" element={<TraceScreen />} />
      <Route path="app/alert" element={<AlertScreen />} />
      <Route path="app/operator" element={<OperatorScreen />} />
    </Routes>
  );
}
