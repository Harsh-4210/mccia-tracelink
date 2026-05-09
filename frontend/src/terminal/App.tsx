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
  fetchUsers,
  updateUserRole,
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
  account:    <svg {...svgProps}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
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

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("tl_theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tl_theme", theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(t => t === "light" ? "dark" : "light") };
}

function Landing() {
  const { isAuthenticated } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="d1-root">
      <main className="d1-land">
        {/* ── Glassmorphic Top Bar ── */}
        <nav className="d1-landing-topbar">
          <div className="logo">
            <div className="logo-dot">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            TraceLink
          </div>
          <div className="d1-landing-topbar-actions">
            <div className="d1-lang-group">
              {LANGS.map((l) => (
                <button key={l} className={`d1-lang-btn${lang === l ? " active" : ""}`} onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
              ))}
            </div>
            <button className="d1-icon-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              )}
            </button>
            <Link to={isAuthenticated ? "/app/dashboard" : "/login"} className="d1-cta" style={{ padding: "8px 20px", fontSize: 13 }}>
              {isAuthenticated ? "Dashboard" : "Get Started"}
            </Link>
          </div>
        </nav>

        {/* ── Hero Section ── */}
        <section className="d1-hero">
          <div className="d1-hero-inner">
            <div className="d1-hero-badge">
              <span className="pulse" />
              Manufacturing Traceability Platform
            </div>
            <h1>
              {t("app.tagline").split(" ").slice(0, 3).join(" ")}{" "}
              <span className="gradient">{t("app.tagline").split(" ").slice(3).join(" ")}</span>
            </h1>
            <p>{t("app.subtitle")}</p>
            <div className="d1-hero-actions">
              <Link to={isAuthenticated ? "/app/trace" : "/login"} className="d1-cta">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                Get Started Free
              </Link>
              <Link to={isAuthenticated ? "/app/dashboard" : "/login"} className="d1-cta ghost">
                View Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* ── Feature Cards ── */}
        <section className="d1-features">
          <div className="d1-feature-card">
            <div className="icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <h3>Firebase Auth</h3>
            <p>Enterprise-grade authentication with email, password, and Google SSO. Role-based access control from day one.</p>
          </div>
          <div className="d1-feature-card">
            <div className="icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <h3>Full Audit Trail</h3>
            <p>Every action logged with user identity, timestamp, and request ID. Complete regulatory compliance built in.</p>
          </div>
          <div className="d1-feature-card">
            <div className="icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <h3>Offline-First</h3>
            <p>Operator entries queue locally and sync automatically when reconnected. Never lose factory floor data.</p>
          </div>
        </section>
      </main>
    </div>
  );
}



function DashboardShell({ children, page }: { children: ReactNode; page: string }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("tl_guide_seen"));

  function closeGuide() {
    setShowGuide(false);
    localStorage.setItem("tl_guide_seen", "1");
  }

  const role = user?.role || "pending";
  const allNavItems = [
    { to: "/app/dashboard", icon: Icon.dashboard, label: t("nav.dashboard"), roles: ["pending", "operator", "supervisor", "quality", "manager", "admin"] },
    { to: "/app/trace", icon: Icon.trace, label: t("nav.trace"), roles: ["operator", "supervisor", "quality", "manager", "admin"] },
    { to: "/app/alert", icon: Icon.alert, label: t("nav.alert"), roles: ["supervisor", "quality", "manager", "admin"] },
    { to: "/app/operator", icon: Icon.operator, label: t("nav.operator"), roles: ["operator", "supervisor", "quality", "manager", "admin"] },
    { to: "/app/import", icon: Icon.import, label: t("nav.import"), roles: ["manager", "quality", "admin"] },
    { to: "/app/review", icon: Icon.review, label: t("nav.review"), roles: ["manager", "quality", "admin"] },
    { to: "/app/compliance", icon: Icon.compliance, label: t("nav.compliance"), roles: ["manager", "quality", "admin"] },
  ];

  const navItems = allNavItems.filter((item) => item.roles.includes(role));

  return (
    <div className="d1-root">
      <div className="d1-dash">
        <aside className="d1-side">
          <div className="d1-brand">{t("app.title")}</div>
          <nav className="d1-nav" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/app/dashboard"} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.icon} <span style={{ flex: 1 }}>{item.label}</span>
              </NavLink>
            ))}
            <div style={{ flex: 1 }}></div>
            <button className="d1-btn ghost" onClick={() => setShowGuide(true)} style={{ marginTop: 8, justifyContent: "flex-start", background: "transparent", border: "none" }}>
              {Icon.guide} {t("nav.guide")}
            </button>
          </nav>
          <Link to="/app/account" className="d1-userbadge" style={{ textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--amber)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
              {user?.email?.[0].toUpperCase() || "U"}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email || "authenticated"}</div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", textTransform: "capitalize" }}>{role}</div>
            </div>
          </Link>
        </aside>
        
        <main className="d1-main">
          <header className="d1-topbar">
            <div className="d1-topbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" placeholder="Search or Press '/' for commands" />
            </div>
            <div className="d1-topbar-actions">
              <button className="d1-icon-btn" onClick={toggleTheme} title="Toggle Light/Dark Mode">
                {theme === "light" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                )}
              </button>
              <button className="d1-icon-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              </button>
              <button className="d1-btn ghost" onClick={logout} style={{ border: "1px solid var(--line)", background: "transparent" }}>
                {t("nav.logout")}
              </button>
            </div>
          </header>
          
          <div className="d1-content">
            {children}
          </div>
        </main>
      </div>
      {showGuide && <OnboardingGuide onClose={closeGuide} />}
    </div>
  );
}

function TraceScreen() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get("order_id") || "");
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
      </div>

      <div className="split-layout">
        <div className="split-left">
          <div className="d1-frame">
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>Search Trace</h2>
            <div style={{ display: "flex", gap: "12px" }}>
              <input
                className="d1-input"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. D-1847"
                onKeyDown={(e) => e.key === "Enter" && run()}
                aria-label="Dispatch order"
              />
              <button className="d1-btn amber" onClick={() => run()} disabled={loading}>
                {loading ? t("trace.tracing") : "Search"}
              </button>
            </div>
            {error && <div className="d1-error" style={{ marginTop: 16 }}>{error}</div>}
          </div>

          {result && (
            <div className="d1-frame" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: "20px" }}>Order {result.dispatch.order_id}</h3>
                  <div style={{ color: "var(--ink-dim)", fontSize: "13px" }}>
                    Customer: {result.dispatch.customer_id} • Query: {result.query_ms}ms
                  </div>
                </div>
                <button className="d1-btn" onClick={exportTrace}>{t("trace.export")}</button>
              </div>

              <div style={{ padding: "16px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
                <h4 style={{ margin: "0 0 16px", color: "var(--ink-dim)", textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.05em" }}>Shipment Status</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {result.batches.map((batch, i) => (
                    <div key={batch.batch_id} style={{ display: "flex", gap: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "24px" }}>
                        <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: batch.qc?.pass_fail === "PASS" ? "#10b981" : "var(--amber)", zIndex: 2 }} />
                        {i !== result.batches.length - 1 && <div style={{ flex: 1, width: "2px", background: "var(--line)", margin: "4px 0" }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: "16px" }}>
                        <div style={{ fontWeight: 600, marginBottom: "4px" }}>Batch {batch.batch_id}</div>
                        <div style={{ fontSize: "13px", color: "var(--ink-dim)" }}>
                          Supplier: {batch.raw_material?.supplier?.supplier_name || "Unknown"} • QC: {batch.qc?.pass_fail || "PENDING"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="split-right">
          <div style={{ width: "100%", height: "100%", position: "relative", background: "url('https://maps.googleapis.com/maps/api/staticmap?center=40.7128,-74.0060&zoom=11&size=600x800&maptype=roadmap&style=element:geometry%7Ccolor:0xf5f5f5&style=element:labels.icon%7Cvisibility:off&style=element:labels.text.fill%7Ccolor:0x616161&style=element:labels.text.stroke%7Ccolor:0xf5f5f5&style=feature:administrative.land_parcel%7Celement:labels.text.fill%7Ccolor:0xbdbdbd&style=feature:poi%7Celement:geometry%7Ccolor:0xeeeeee&style=feature:poi%7Celement:labels.text.fill%7Ccolor:0x757575&style=feature:poi.park%7Celement:geometry%7Ccolor:0xe5e5e5&style=feature:poi.park%7Celement:labels.text.fill%7Ccolor:0x9e9e9e&style=feature:road%7Celement:geometry%7Ccolor:0xffffff&style=feature:road.arterial%7Celement:labels.text.fill%7Ccolor:0x757575&style=feature:road.highway%7Celement:geometry%7Ccolor:0xdadada&style=feature:road.highway%7Celement:labels.text.fill%7Ccolor:0x616161&style=feature:road.local%7Celement:labels.text.fill%7Ccolor:0x9e9e9e&style=feature:transit.line%7Celement:geometry%7Ccolor:0xe5e5e5&style=feature:transit.station%7Celement:geometry%7Ccolor:0xeeeeee&style=feature:water%7Celement:geometry%7Ccolor:0xc9c9c9&style=feature:water%7Celement:labels.text.fill%7Ccolor:0x9e9e9e&key=YOUR_API_KEY') center/cover no-repeat" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.05)" }} />
            {/* Map Placeholder Content */}
            <div style={{ position: "absolute", bottom: "24px", right: "24px", background: "var(--bg-2)", padding: "8px", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", display: "flex", gap: "8px" }}>
              <button className="d1-btn" style={{ padding: "8px" }}>Satellite</button>
              <button className="d1-btn" style={{ padding: "8px" }}>Map View</button>
            </div>
            {result && (
              <div style={{ position: "absolute", top: "40%", left: "40%", background: "#0f172a", color: "white", padding: "16px", borderRadius: "8px", width: "220px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)" }}>
                <div style={{ fontWeight: 600, marginBottom: "4px" }}>Warehouse Route</div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>Order ID: {result.dispatch.order_id}</div>
                <div style={{ marginTop: "12px", width: "8px", height: "8px", background: "var(--amber)", borderRadius: "50%" }}></div>
              </div>
            )}
          </div>
        </div>
      </div>
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
      </div>

      <div className="d1-frame">
        <div className="panel-key">{t("alert.panel_key")}</div>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("alert.resolve")}</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            className="d1-input"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            placeholder="e.g. LOT-2023-114"
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Lot number"
          />
          <button className="d1-btn amber" onClick={() => run()} disabled={loading}>
            {loading ? t("alert.scanning") : t("alert.simulate")}
          </button>
        </div>
        {error && <div className="d1-error" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="d1-grid3">
              <div><span className="key">Lot</span><span className="val" style={{ fontSize: 22 }}>{result.lot_number}</span></div>
              <div><span className="key">Batches Affected</span><span className="val" style={{ fontSize: 22 }}>{result.summary.batch_count}</span></div>
              <div><span className="key">At-Risk Orders</span><span className="val" style={{ fontSize: 22, color: "var(--red)" }}>{result.summary.dispatch_order_count}</span></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--ink-dim)", fontSize: 13 }}>Query completed in {result.query_ms}ms</span>
              <button className="d1-inlinebtn" onClick={exportAlert}>{t("alert.export")}</button>
            </div>
            <div className="d1-table-wrapper">
              <table className="d1-table">
                <thead>
                  <tr><th>Order</th><th>OEM</th><th>Date</th><th>Batch</th><th>QC Status</th></tr>
                </thead>
                <tbody>
                  {result.affected_dispatch_orders.map((row) => (
                    <tr key={`${row.order_id}-${row.batch_id}`}>
                      <td style={{ color: "var(--primary)", fontWeight: 600 }}>{row.order_id}</td>
                      <td>{row.customer_id}</td>
                      <td>{row.dispatch_date}</td>
                      <td style={{ fontFamily: "monospace" }}>{row.batch_id}</td>
                      <td>
                        {row.pass_fail ? (
                          <span className={`badge ${row.pass_fail === "PASS" ? "success" : "delay"}`}>
                            {row.pass_fail}{row.defect_rate_pct ? ` / ${row.defect_rate_pct}%` : ""}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );

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
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then(setMetrics).catch((e) => setError(e?.message || "Dashboard failed"));
  }, []);

  const isEmpty = metrics && metrics.batch_count === 0 && metrics.supplier_scorecard.length === 0;

  return (
    <DashboardShell page="DASH">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("dash.crumb")}</div>
          <h1>{t("dash.heading")}</h1>
        </div>
      </div>
      {error && <div className="d1-error">! {error}</div>}
      
      {isEmpty && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "40px" }}>
          <div className="d1-guide-card d1-frame" style={{ textAlign: "center", padding: "40px", maxWidth: "600px", width: "100%" }}>
            <div style={{ color: "var(--amber)", marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <div style={{ width: 48, height: 48 }}>{Icon.dashboard}</div>
            </div>
            <h2 style={{ fontSize: 24, margin: "0 0 12px" }}>{t("dash.empty.title")}</h2>
            <p style={{ color: "var(--ink-mid)", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>{t("dash.empty.desc")}</p>
            {["manager", "quality", "admin"].includes(user?.role || "") ? (
              <Link to="/app/import" className="d1-btn amber" style={{ display: "inline-block", textDecoration: "none", padding: "10px 24px" }}>{t("dash.empty.btn")}</Link>
            ) : (
              <div className="d1-error" style={{ textAlign: "left" }}>{t("account.pending_warning")}</div>
            )}
          </div>
        </div>
      )}

      {metrics && !isEmpty && (
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
  useEffect(() => { navigate("/app/dashboard", { replace: true }); }, [navigate]);
  return null;
}

function RoleRoute({ children, allowed }: { children: ReactNode; allowed: string[] }) {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <div className="d1-root"><div className="d1-login-wrap">Loading...</div></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user && !allowed.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

function AccountScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (isAdmin) {
      fetchUsers().then((res) => setUsers(res.users)).catch((e) => setError(e.message));
    }
  }, [isAdmin]);

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <DashboardShell page="ACCOUNT">
      <div className="d1-pageHead">
        <div>
          <div className="crumb">{t("nav.account")}</div>
          <h1>{t("account.title")}</h1>
        </div>
      </div>
      
      <section className="d1-panel d1-frame" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>{t("account.profile")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginTop: 16 }}>
          <span style={{ color: "var(--ink-dim)" }}>{t("account.email")}</span>
          <span>{user?.email}</span>
          <span style={{ color: "var(--ink-dim)" }}>{t("account.role")}</span>
          <span style={{ color: "var(--amber)", fontWeight: "bold", textTransform: "uppercase" }}>{user?.role}</span>
        </div>
        {user?.role === "pending" && (
          <div className="d1-error" style={{ marginTop: 24 }}>
            {t("account.pending_warning")}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="d1-panel d1-frame">
          <h2 style={{ marginTop: 0 }}>{t("account.admin_title")}</h2>
          {error && <div className="d1-error" style={{ marginBottom: 12 }}>{error}</div>}
          <table className="d1-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>{u.email}</td>
                  <td>{u.full_name || "—"}</td>
                  <td>
                    <select 
                      className="d1-input" 
                      style={{ padding: "4px 8px", width: "auto" }}
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                    >
                      <option value="pending">pending</option>
                      <option value="operator">operator</option>
                      <option value="supervisor">supervisor</option>
                      <option value="quality">quality</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </DashboardShell>
  );
}

export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  
  // Define role groups
  const allRoles = ["pending", "operator", "supervisor", "quality", "manager", "admin"];
  const opRoles = ["operator", "supervisor", "quality", "manager", "admin"];
  const mgrRoles = ["manager", "quality", "admin"];
  const supRoles = ["supervisor", "quality", "manager", "admin"];

  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="login" element={isAuthenticated ? <Navigate to="/app/dashboard" replace /> : <LoginPage />} />
      <Route path="app" element={<RoleRoute allowed={allRoles}><DashIndex /></RoleRoute>} />
      <Route path="app/dashboard" element={<RoleRoute allowed={allRoles}><DashboardScreen /></RoleRoute>} />
      <Route path="app/account" element={<RoleRoute allowed={allRoles}><AccountScreen /></RoleRoute>} />
      
      <Route path="app/trace" element={<RoleRoute allowed={opRoles}><TraceScreen /></RoleRoute>} />
      <Route path="app/operator" element={<RoleRoute allowed={opRoles}><OperatorScreen /></RoleRoute>} />
      
      <Route path="app/alert" element={<RoleRoute allowed={supRoles}><AlertScreen /></RoleRoute>} />
      
      <Route path="app/import" element={<RoleRoute allowed={mgrRoles}><ImportScreen /></RoleRoute>} />
      <Route path="app/review" element={<RoleRoute allowed={mgrRoles}><ReviewScreen /></RoleRoute>} />
      <Route path="app/compliance" element={<RoleRoute allowed={mgrRoles}><ComplianceScreen /></RoleRoute>} />
    </Routes>
  );
}
