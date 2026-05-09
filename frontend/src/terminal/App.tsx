import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import {
  approveLink,
  createCorrectiveAction,
  downloadAlertExport,
  downloadTraceExport,
  fetchCorrectiveActions,
  fetchAlert,
  fetchDashboard,
  fetchImports,
  fetchTrace,
  fetchUnresolvedLinks,
  postBatch,
  rejectLink,
  type AlertResult,
  type DashboardMetrics,
  type TraceResult,
  uploadImport,
} from "../api";
import { LoginPage } from "../auth/LoginPage";
import { useAuth } from "../auth/AuthContext";
import { useI18n, LANGS, LANG_LABELS, type Lang } from "../i18n";
import { enqueueEntry, getDeviceId, getQueuedEntries, syncQueuedEntries } from "../offlineQueue";
import "./styles.css";

/* ── SVG Icons (16×16, inline, zero deps) ───────────── */
const svgProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Icon = {
  trace:      <svg {...svgProps}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  alert:      <svg {...svgProps}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  operator:   <svg {...svgProps}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  dashboard:  <svg {...svgProps}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  import:     <svg {...svgProps}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  review:     <svg {...svgProps}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  compliance: <svg {...svgProps}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  admin:      <svg {...svgProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  guide:      <svg {...svgProps}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  logout:     <svg {...svgProps}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  globe:      <svg {...svgProps}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
};

/* ── Onboarding Guide ────────────────────────────── */
const iconKeys = ["trace","alert","operator","dashboard","import","review","compliance","admin"] as const;

function OnboardingGuide({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="d1-guide-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="d1-guide-card d1-frame">
        <h2 style={{ fontSize: 22, margin: 0, fontWeight: 700 }}>{t("guide.title")}</h2>
        <p style={{ color: "var(--ink-mid)", fontSize: 14, lineHeight: 1.6, margin: "6px 0 16px" }}>{t("guide.intro")}</p>
        <div className="d1-guide-list">
          {iconKeys.map((k) => (
            <div key={k} className="d1-guide-item">
              <div className="d1-guide-icon">{Icon[k]}</div>
              <div>
                <strong>{t(`nav.${k}`)}</strong>
                <p style={{ color: "var(--ink-mid)", fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>{t(`desc.${k}`)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="d1-guide-tip">
          <strong>{t("guide.tip")}</strong> {t("guide.tip.text")}
        </div>
        <button className="d1-btn amber" onClick={onClose} style={{ marginTop: 12, width: "100%" }}>
          {t("guide.close")}
        </button>
      </div>
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function StatusBar({ online, scope }: { online: boolean; scope: string }) {
  const [now, setNow] = useState(new Date());
  const { lang, setLang, t } = useI18n();
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="d1-statusbar">
      <span>{t("app.title")} / {scope}</span>
      <span className={online ? "ok" : "warn"}>
        <span className="blink">*</span> {online ? "LINK STABLE" : "OFFLINE"}
      </span>
      <span>UTC {now.toISOString().slice(11, 19)}</span>
      <div className="d1-lang-group">
        {LANGS.map((l) => (
          <button key={l} className={`d1-lang-btn${lang === l ? " active" : ""}`} onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  const online = useOnline();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  return (
    <div className="d1-root">
      <div className="d1-scan" />
      <StatusBar online={online} scope="PUBLIC" />
      <main className="d1-land">
        <div className="d1-asciibadge">[ MFG // TRACEABILITY CONTROL ]</div>
        <h1 className="d1-headline">
          {t("app.tagline")}<span className="cursor" />
        </h1>
        <p className="d1-sub">
          {t("app.subtitle")}
        </p>
        <div className="d1-row" style={{ marginTop: 8 }}>
          <Link to={isAuthenticated ? "/app/trace" : "/login"} className="d1-cta">
            GET STARTED
          </Link>
        </div>
        <div className="d1-grid3">
          <div>
            <span className="key">Firebase</span>
            <span className="val">AUTH</span>
            <span className="note">Secure authentication with Email, Password, or Google.</span>
          </div>
          <div>
            <span className="key">Audit</span>
            <span className="val">ON</span>
            <span className="note">Every action logged with user, timestamp, and request ID.</span>
          </div>
          <div>
            <span className="key">Offline</span>
            <span className="val">READY</span>
            <span className="note">Operator entries queue locally and sync when reconnected.</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardShell({ children, page }: { children: ReactNode; page: string }) {
  const online = useOnline();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("tl_guide_seen"));

  function closeGuide() {
    setShowGuide(false);
    localStorage.setItem("tl_guide_seen", "1");
  }

  const navItems: { to: string; icon: React.ReactNode; label: string }[] = [
    { to: "/app/trace", icon: Icon.trace, label: t("nav.trace") },
    { to: "/app/alert", icon: Icon.alert, label: t("nav.alert") },
    { to: "/app/operator", icon: Icon.operator, label: t("nav.operator") },
    { to: "/app/dashboard", icon: Icon.dashboard, label: t("nav.dashboard") },
    { to: "/app/import", icon: Icon.import, label: t("nav.import") },
    { to: "/app/review", icon: Icon.review, label: t("nav.review") },
    { to: "/app/compliance", icon: Icon.compliance, label: t("nav.compliance") },
  ];

  return (
    <div className="d1-root">
      <div className="d1-scan" />
      <StatusBar online={online} scope={page} />
      <div className="d1-dash">
        <aside className="d1-side">
          <div className="d1-brand">{t("app.title")}</div>
          <nav className="d1-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/app/trace"} className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="d1-nav-icon">{item.icon}</span>{item.label}
              </NavLink>
            ))}
            <button className="d1-navbtn" onClick={() => setShowGuide(true)} style={{ borderTop: "1px dashed var(--line-strong)", marginTop: 8, paddingTop: 10 }}>
              <span className="d1-nav-icon">{Icon.guide}</span>{t("nav.guide")}
            </button>
            <button className="d1-navbtn" onClick={logout}>
              <span className="d1-nav-icon">{Icon.logout}</span>{t("nav.logout")}
            </button>
          </nav>
          <div className="d1-user-badge">
            <div className="email">{user?.email || "authenticated"}</div>
            <div className="role">{user?.role || "user"}</div>
          </div>
        </aside>
        <main className="d1-main">{children}</main>
      </div>
      {showGuide && <OnboardingGuide onClose={closeGuide} />}
    </div>
  );
}

function TraceScreen() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get("order_id") || "D-1847");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(updateUrl = true) {
    const clean = orderId.trim();
    if (!clean) return;
    setError("");
    setLoading(true);
    try {
      setResult(await fetchTrace(clean));
      if (updateUrl) setSearchParams({ order_id: clean });
    } catch (e: any) {
      setError(e?.message || "Trace failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("order_id")) run(false);
    // Run only once for permalink loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportTrace() {
    if (!result?.dispatch?.order_id) return;
    try {
      await downloadTraceExport(result.dispatch.order_id);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    }
  }

  return (
    <DashboardShell page="TRACE">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("trace.crumb")}</div>
          <h1>{t("trace.heading")}</h1>
        </div>
        <div className="crumb">{t("trace.permalink")}</div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">{t("trace.panel_key")}</div>
        <h2>{t("trace.resolve")}</h2>
        <div className="d1-row" style={{ marginTop: 14 }}>
          <input
            className="d1-input"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="D-1847"
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Dispatch order"
          />
          <button className="d1-btn amber" onClick={() => run()} disabled={loading}>
            {loading ? t("trace.tracing") : t("trace.execute")}
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
              <button className="d1-inlinebtn" onClick={exportTrace}>{t("trace.export")}</button>
            </div>
            {!!result.incomplete_warnings?.length && (
              <div className="d1-error">
                ! INCOMPLETE TRACE / {result.incomplete_warnings.join(" / ")}
              </div>
            )}
            {result.batches.map((batch) => (
              <div className="d1-trace" key={batch.batch_id}>
                <div className="lane">
                  <div className="id">{batch.batch_id}</div>
                  <div className="conf">CONF {Math.round((batch.raw_material?.confidence || 0) * 100)}%</div>
                  <div className="conf">{batch.link_type || "unreviewed"}</div>
                  <div className="conf">
                    {batch.qc?.pass_fail === "PASS" ? <span className="d1-pf pass">PASS</span> : <span className="d1-pf fail">FAIL</span>}
                  </div>
                </div>
                <div className="body">
                  <div className="row"><span className="lbl">RAW LOT</span><span className="v">{batch.production?.input_lot_ref || "-"}</span></div>
                  <div className="row"><span className="lbl">SUPPLIER</span><span className="v">{batch.raw_material?.supplier?.supplier_name || "-"} / {batch.raw_material?.supplier_id || "-"}</span></div>
                  <div className="row"><span className="lbl">MACHINE</span><span className="v">{batch.production?.machine_id || "-"}</span></div>
                  <div className="row"><span className="lbl">SHIFT</span><span className="v">{batch.production?.shift || "-"}</span></div>
                  <div className="row"><span className="lbl">OPERATOR</span><span className="v">{batch.production?.operator_id || "-"}</span></div>
                  <div className="row"><span className="lbl">DEFECT</span><span className="v">{batch.qc?.defect_type_normalized || "-"} / {batch.qc?.defect_rate_pct ?? 0}%</span></div>
                  <div className="reason">REASON / {batch.raw_material?.confidence_reasons?.join(" / ") || "no reasons recorded"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function AlertScreen() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lot, setLot] = useState(searchParams.get("lot") || "LOT-2023-114");
  const [result, setResult] = useState<AlertResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(updateUrl = true) {
    const clean = lot.trim();
    if (!clean) return;
    setError("");
    setLoading(true);
    try {
      setResult(await fetchAlert(clean));
      if (updateUrl) setSearchParams({ lot: clean });
    } catch (e: any) {
      setError(e?.message || "Alert failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("lot")) run(false);
    // Run only once for permalink loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportAlert() {
    if (!result?.lot_number) return;
    try {
      await downloadAlertExport(result.lot_number);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    }
  }

  return (
    <DashboardShell page="ALERT">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("alert.crumb")}</div>
          <h1>{t("alert.heading")}</h1>
        </div>
        <div className="crumb">{t("alert.export_ready")}</div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">{t("alert.panel_key")}</div>
        <h2>{t("alert.resolve")}</h2>
        <div className="d1-row" style={{ marginTop: 14 }}>
          <input
            className="d1-input"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            placeholder="LOT-2023-114"
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Lot number"
          />
          <button className="d1-btn" onClick={() => run()} disabled={loading}>
            {loading ? t("alert.scanning") : t("alert.simulate")}
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
              <button className="d1-inlinebtn" onClick={exportAlert}>{t("alert.export")}</button>
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
                            {row.pass_fail}{row.defect_rate_pct ? ` / ${row.defect_rate_pct}%` : ""}
                          </span>
                        ) : (
                          "-"
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



function OperatorScreen() {
  const online = useOnline();
  const { t } = useI18n();
  const [queued, setQueued] = useState(0);
  const [message, setMessage] = useState("");


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
      qc_notes: String(data.get("qc_notes") || ""),
      client_entry_id: crypto.randomUUID(),
      device_id: getDeviceId(),
    };

    if (!entry.raw_lot || !entry.machine_id || !entry.operator_id || !entry.units_produced) {
      setMessage("Please fill lot, machine, operator, and units.");
      return;
    }

    if (!online) {
      await enqueueEntry(entry);
      const entries = await getQueuedEntries();
      setQueued(entries.length);
      setMessage("Saved offline. Will sync later.");
      event.currentTarget.reset();
      return;
    }

    const res = await postBatch(entry);
    setMessage(res.ok ? "Batch saved." : "Save failed");
    event.currentTarget.reset();
  }

  async function syncNow() {
    const result = await syncQueuedEntries();
    const entries = await getQueuedEntries();
    setQueued(entries.length);
    setMessage(`${result.synced} synced, ${result.failed} failed.`);
  }

  return (
    <DashboardShell page="ENTRY">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("op.crumb")}</div>
          <h1>{t("op.heading")}</h1>
        </div>
      </div>

      <section className="d1-panel d1-frame">
        <div className="panel-key">{t("op.panel_key")}</div>
        <h2>{t("op.title")}</h2>
        <form className="d1-form" onSubmit={submit}>
          <label>{t("op.date")}<input className="d1-input" name="date" type="date" required /></label>
          <label>{t("op.lot")}<input className="d1-input" name="raw_lot" placeholder="LOT-2023-114" required /></label>
          <label>{t("op.machine")}
            <select className="d1-input" name="machine_id">
              <option>MC-01</option><option>MC-02</option><option>MC-03</option><option>MC-04</option><option>MC-05</option>
            </select>
          </label>
          <label>{t("op.shift_label")}
            <select className="d1-input" name="shift">
              <option>A</option><option>B</option><option>C</option>
            </select>
          </label>
          <label>{t("op.operator")}<input className="d1-input" name="operator_id" placeholder="OP-001" required /></label>
          <label>{t("op.units")}<input className="d1-input" name="units_produced" type="number" min="1" required /></label>
          <label className="span3">{t("op.notes")}<input className="d1-input" name="qc_notes" placeholder="optional" /></label>
          <div className="span3">
            <button className="d1-btn amber" type="submit">{t("op.save")}</button>
          </div>
        </form>

        <div className="d1-syncbar" style={{ marginTop: 18 }}>
          <span>{t("op.queued")} / <strong>{queued}</strong></span>
          {online && queued > 0 && <button className="d1-btn ghost" onClick={syncNow}>{t("op.sync_now")}</button>}
          <span style={{ color: online ? "var(--ink)" : "var(--amber)" }}>{online ? t("op.online") : t("op.offline")}</span>
          {message && <strong style={{ marginLeft: "auto" }}>{message}</strong>}
        </div>
      </section>
    </DashboardShell>
  );
}

function DashboardScreen() {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then(setMetrics).catch((e) => setError(e?.message || "Dashboard failed"));
  }, []);

  return (
    <DashboardShell page="DASH">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("dash.crumb")}</div>
          <h1>{t("dash.heading")}</h1>
        </div>
      </div>
      {error && <div className="d1-error">! {error}</div>}
      {metrics && (
        <section className="d1-panel d1-frame">
          <div className="d1-grid3" style={{ marginTop: 0 }}>
            <div><span className="key">{t("dash.batches")}</span><span className="val">{metrics.batch_count}</span></div>
            <div><span className="key">{t("dash.qc_pass")}</span><span className="val">{metrics.pass_rate}%</span></div>
            <div><span className="key">{t("dash.open_ca")}</span><span className="val">{metrics.open_corrective_actions}</span></div>
          </div>
          <div className="d1-result">
            <h2>{t("dash.top_fail")}</h2>
            <table className="d1-table">
              <thead><tr><th>{t("dash.machine")}</th><th>{t("dash.failures")}</th><th>{t("dash.avg_defect_col")}</th></tr></thead>
              <tbody>
                {metrics.top_failing_machines.map((row) => (
                  <tr key={row.machine_id}><td>{row.machine_id}</td><td>{row.fail_count}</td><td>{row.avg_defect_rate}</td></tr>
                ))}
              </tbody>
            </table>
            <h2>{t("dash.supplier_card")}</h2>
            <table className="d1-table">
              <thead><tr><th>{t("dash.supplier_col")}</th><th>{t("dash.status")}</th><th>{t("dash.lots")}</th><th>{t("dash.complaints")}</th></tr></thead>
              <tbody>
                {metrics.supplier_scorecard.map((row) => (
                  <tr key={row.supplier_id}>
                    <td>{row.supplier_name}</td>
                    <td>{row.approved_status}</td>
                    <td>{row.lots_supplied}</td>
                    <td>{row.complaint_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}

function ImportScreen() {
  const { t } = useI18n();
  const [fileType, setFileType] = useState("dispatch");
  const [file, setFile] = useState<File | null>(null);
  const [imports, setImports] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const data = await fetchImports();
    setImports(data.imports || []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose a CSV file first.");
      return;
    }
    try {
      const result = await uploadImport(file, fileType);
      setMessage(`Import ${result.import_id}: ${result.status}, ${result.valid_rows} valid, ${result.error_count} errors.`);
      setFile(null);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Import failed");
    }
  }

  return (
    <DashboardShell page="IMPORT">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("import.crumb")}</div>
          <h1>{t("import.heading")}</h1>
        </div>
      </div>
      <section className="d1-panel d1-frame">
        <form className="d1-form" onSubmit={submit}>
          <label>{t("import.file_type")}
            <select className="d1-input" value={fileType} onChange={(e) => setFileType(e.target.value)}>
              <option value="raw_materials">raw_materials</option>
              <option value="production">production</option>
              <option value="qc">qc</option>
              <option value="dispatch">dispatch</option>
              <option value="supplier">supplier</option>
              <option value="complaints">complaints</option>
            </select>
          </label>
          <label className="span2">{t("import.csv_file")}
            <input className="d1-input" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div className="span3"><button className="d1-btn amber" type="submit">{t("import.upload_btn")}</button></div>
        </form>
        {message && <div className="d1-syncbar" style={{ marginTop: 18 }}>{message}</div>}
        <div className="d1-result">
          <table className="d1-table">
            <thead><tr><th>{t("import.id")}</th><th>{t("import.file")}</th><th>{t("import.type_col")}</th><th>{t("import.status")}</th><th>{t("import.rows")}</th><th>{t("import.uploaded")}</th></tr></thead>
            <tbody>
              {imports.map((row) => (
                <tr key={row.import_id}>
                  <td>{row.import_id}</td><td>{row.filename}</td><td>{row.file_type}</td><td>{row.status}</td><td>{row.row_count}</td><td>{row.uploaded_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}

function ReviewScreen() {
  const { t } = useI18n();
  const [links, setLinks] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const data = await fetchUnresolvedLinks();
    setLinks(data.unresolved_links || []);
  }

  useEffect(() => {
    refresh().catch((e) => setMessage(e?.message || "Review load failed"));
  }, []);

  async function act(productionId: number, action: "approve" | "reject") {
    try {
      if (action === "approve") await approveLink(productionId, "Reviewed in TraceLink UI");
      else await rejectLink(productionId, "Rejected in TraceLink UI");
      setMessage(`Link ${action}d.`);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Review action failed");
    }
  }

  return (
    <DashboardShell page="REVIEW">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("review.crumb")}</div>
          <h1>{t("review.heading")}</h1>
        </div>
      </div>
      <section className="d1-panel d1-frame">
        {message && <div className="d1-syncbar">{message}</div>}
        <table className="d1-table">
          <thead><tr><th>{t("review.batch")}</th><th>{t("review.lot")}</th><th>{t("review.confidence")}</th><th>{t("review.reason")}</th><th>{t("review.status")}</th><th>{t("review.action")}</th></tr></thead>
          <tbody>
            {links.map((row) => (
              <tr key={row.production_id}>
                <td>{row.batch_id}</td>
                <td>{row.input_lot_ref}</td>
                <td>{row.inference_confidence}</td>
                <td>{row.inference_reason}</td>
                <td>{row.review_status}</td>
                <td>
                  <button className="d1-inlinebtn" onClick={() => act(row.production_id, "approve")}>{t("review.approve")}</button>
                  <button className="d1-inlinebtn" onClick={() => act(row.production_id, "reject")} style={{ marginLeft: 6 }}>{t("review.reject")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardShell>
  );
}

function ComplianceScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const data = await fetchCorrectiveActions();
    setItems(data.corrective_actions || []);
  }

  useEffect(() => {
    refresh().catch((e) => setMessage(e?.message || "Corrective actions failed"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await createCorrectiveAction({
        triggered_by: String(data.get("triggered_by") || ""),
        assigned_to: String(data.get("assigned_to") || ""),
        root_cause: String(data.get("root_cause") || ""),
        due_date: String(data.get("due_date") || ""),
      });
      setMessage(`Created ${result.ca_id}`);
      event.currentTarget.reset();
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Create failed");
    }
  }

  return (
    <DashboardShell page="CAPA">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("comp.crumb")}</div>
          <h1>{t("comp.heading")}</h1>
        </div>
      </div>
      <section className="d1-panel d1-frame">
        <form className="d1-form" onSubmit={submit}>
          <label>{t("comp.triggered")}<input className="d1-input" name="triggered_by" placeholder="LOT-2023-114 or complaint id" /></label>
          <label>{t("comp.assigned")}<input className="d1-input" name="assigned_to" placeholder="quality owner" /></label>
          <label>{t("comp.due")}<input className="d1-input" name="due_date" type="date" /></label>
          <label className="span3">{t("comp.root")}<input className="d1-input" name="root_cause" placeholder="initial finding" /></label>
          <div className="span3"><button className="d1-btn amber" type="submit">{t("comp.open_btn")}</button></div>
        </form>
        {message && <div className="d1-syncbar" style={{ marginTop: 18 }}>{message}</div>}
        <div className="d1-result">
          <table className="d1-table">
            <thead><tr><th>{t("comp.id")}</th><th>{t("comp.status")}</th><th>{t("comp.triggered")}</th><th>{t("comp.assigned")}</th><th>{t("comp.due")}</th></tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.ca_id}><td>{row.ca_id}</td><td>{row.status}</td><td>{row.triggered_by}</td><td>{row.assigned_to}</td><td>{row.due_date}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}

function DashIndex() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/app/trace", { replace: true }); }, [navigate]);
  return null;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="d1-root"><div className="d1-login-wrap">Loading...</div></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="login" element={isAuthenticated ? <Navigate to="/app/trace" replace /> : <LoginPage />} />
      <Route path="app" element={<ProtectedRoute><DashIndex /></ProtectedRoute>} />
      <Route path="app/trace" element={<ProtectedRoute><TraceScreen /></ProtectedRoute>} />
      <Route path="app/alert" element={<ProtectedRoute><AlertScreen /></ProtectedRoute>} />
      <Route path="app/operator" element={<ProtectedRoute><OperatorScreen /></ProtectedRoute>} />
      <Route path="app/dashboard" element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
      <Route path="app/import" element={<ProtectedRoute><ImportScreen /></ProtectedRoute>} />
      <Route path="app/review" element={<ProtectedRoute><ReviewScreen /></ProtectedRoute>} />
      <Route path="app/compliance" element={<ProtectedRoute><ComplianceScreen /></ProtectedRoute>} />
    </Routes>
  );
}
