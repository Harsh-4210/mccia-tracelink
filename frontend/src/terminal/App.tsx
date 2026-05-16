/**
 * TraceLink — Precision Industrial UI v2.0
 * Aesthetic: Aerospace Control × Bloomberg Terminal
 * Fonts: Rajdhani (display) + IBM Plex Mono (data) + Outfit (body)
 */

import { FormEvent, type ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import {
  approveLink, createCorrectiveAction, downloadAlertExport, downloadTraceExport,
  fetchCorrectiveActions, fetchAlert, fetchDashboard, fetchImports, uploadImport,
  uploadImportWithProgress, fetchDataUsage,
  deleteImport, fetchTrace, fetchUnresolvedLinks, postBatch, rejectLink,
  type AlertResult, type DashboardMetrics, type TraceResult,
  fetchUsers, fetchAiQuery, fetchAuditEvents, fetchPipelineAudit,
} from "../api";
import { LoginPage } from "../auth/LoginPage";
import { useAuth } from "../auth/AuthContext";
import { useI18n, LANGS, LANG_LABELS, type Lang } from "../i18n";
import { enqueueEntry, getDeviceId, getQueuedEntries, syncQueuedEntries } from "../offlineQueue";
import { Icons } from "./icons";
import "./styles.css";

// Alias for brevity
const Ic = Icons;

/* ══════════════════════════════════════════════
   HOOKS
══════════════════════════════════════════════ */
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);
  return online;
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("tl_theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tl_theme", theme);
  }, [theme]);
  return { theme, setTheme, toggleTheme: () => setTheme(t => t === "dark" ? "light" : "dark") };
}

function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("tl_sidebar") === "collapsed");
  useEffect(() => {
    localStorage.setItem("tl_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);
  return { collapsed, toggle: () => setCollapsed(c => !c), expand: () => setCollapsed(false) };
}

/* ══════════════════════════════════════════════
   NOTIFICATION SYSTEM
══════════════════════════════════════════════ */
type AppNotif = { id: string; title: string; body: string; at: string; read: boolean; sev?: "info"|"warn"|"danger" };
const NOTIF_KEY = "tl_notifications_v2";
const NOTIF_EV = "tl:notif";

function readNotifs(): AppNotif[] {
  try { const r = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
}
function writeNotifs(n: AppNotif[]) { localStorage.setItem(NOTIF_KEY, JSON.stringify(n.slice(0,40))); window.dispatchEvent(new CustomEvent(NOTIF_EV)); }

async function notify(title: string, body: string, sev: AppNotif["sev"] = "info") {
  const n: AppNotif = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, body, at: new Date().toISOString(), read: false, sev };
  writeNotifs([n, ...readNotifs()]);
  if (Notification?.permission === "granted") new Notification(title, { body });
}

function useNotifs() {
  const [items, setItems] = useState(readNotifs);
  useEffect(() => {
    const cb = () => setItems(readNotifs());
    window.addEventListener(NOTIF_EV, cb);
    window.addEventListener("storage", cb);
    return () => { window.removeEventListener(NOTIF_EV, cb); window.removeEventListener("storage", cb); };
  }, []);
  return {
    items,
    unread: items.filter(n => !n.read).length,
    markRead: () => writeNotifs(readNotifs().map(n => ({ ...n, read: true }))),
    clear: () => writeNotifs([]),
  };
}

/* ══════════════════════════════════════════════
   GUIDE OVERLAY
══════════════════════════════════════════════ */
function Guide({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const pages = [
    { key: "trace", title: t("nav.trace"), desc: t("guide.items.0") },
    { key: "alert", title: t("nav.alert"), desc: t("guide.items.1") },
    { key: "operator", title: t("nav.operator"), desc: t("guide.items.2") },
    { key: "dashboard", title: t("nav.dashboard"), desc: t("guide.items.3") },
    { key: "import", title: t("nav.import"), desc: t("guide.items.4") },
    { key: "review", title: t("nav.review"), desc: t("guide.items.5") },
    { key: "compliance", title: t("nav.compliance"), desc: t("guide.items.6") },
    { key: "admin", title: t("nav.audit"), desc: t("guide.items.7") },
  ];
  return (
    <div className="tl-guide-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tl-guide-card">
        <div className="tl-crumb" style={{ marginBottom: 8 }}>System Guide</div>
        <div className="tl-guide-title">Welcome to TraceLink</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
          End-to-end manufacturing traceability from raw lot to customer.
        </p>
        <div className="tl-guide-items stagger">
          {pages.map(p => (
            <div key={p.key} className="tl-guide-item">
              <div className="tl-guide-item-icon">{(Ic as any)[p.key]}</div>
              <div><strong>{p.title}</strong><p>{p.desc}</p></div>
            </div>
          ))}
        </div>
        <div className="tl-guide-tip">💡 Click the help icon in the topbar any time to reopen this guide.</div>
        <button className="tl-btn tl-btn-primary" onClick={onClose} style={{ width: "100%", marginTop: 18, padding: "12px" }}>
          {Ic.bolt} Enter the System
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   NOTIFICATION PANEL
══════════════════════════════════════════════ */
function NotifPanel({ notifs, onClose }: { notifs: ReturnType<typeof useNotifs>; onClose: () => void }) {
  const { t } = useI18n();
  const sevColor = (s?: string) => s === "danger" ? "var(--red)" : s === "warn" ? "var(--amber)" : "var(--accent)";
  return (
    <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", zIndex: 50, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: 15, fontWeight: 600, letterSpacing: "0.03em" }}>Notifications</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-label)", marginTop: 2 }}>
            {notifs.items.length} total · {notifs.unread} unread
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {notifs.items.length > 0 && <button className="tl-btn tl-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={notifs.clear}>Clear</button>}
          <button className="tl-icon-btn" onClick={onClose}>{Ic.close}</button>
        </div>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", padding: "10px" }}>
        {notifs.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px", color: "var(--text-tertiary)", fontSize: 13 }}>No notifications yet. Trace or alert events will appear here.</div>
        ) : notifs.items.map(n => (
          <div key={n.id} style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", border: `1px solid var(--border-subtle)`, marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: sevColor(n.sev), display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sevColor(n.sev), display: "inline-block" }} />
              {n.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{n.body}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-label)", marginTop: 4 }}>{new Date(n.at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DASHBOARD SHELL
══════════════════════════════════════════════ */
function Shell({ children, page }: { children: ReactNode; page: string }) {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const notifs = useNotifs();
  const sidebar = useSidebar();
  const [notifOpen, setNotifOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("tl_guide_v2"));

  function closeGuide() { setShowGuide(false); localStorage.setItem("tl_guide_v2", "1"); }

  const navGroups = [
    {
      label: t("nav.section.ops"),
      items: [
        { to: "/app/dashboard", icon: Ic.dashboard, label: t("nav.dashboard") },
        { to: "/app/trace", icon: Ic.trace, label: t("nav.trace") },
        { to: "/app/alert", icon: Ic.alert, label: t("nav.alert") },
        { to: "/app/operator", icon: Ic.operator, label: t("nav.operator") },
        { to: "/app/ai", icon: Ic.ai, label: t("nav.ai") },
      ]
    },
    {
      label: t("nav.section.data"),
      items: [
        { to: "/app/import", icon: Ic.import, label: t("nav.import") },
        { to: "/app/review", icon: Ic.review, label: t("nav.review") },
        { to: "/app/compliance", icon: Ic.compliance, label: t("nav.compliance") },
      ]
    },
    {
      label: t("nav.section.system"),
      items: [
        { to: "/app/audit", icon: Ic.audit, label: t("nav.audit") },
        { to: "/app/account", icon: Ic.account, label: t("nav.account") },
      ]
    }
  ];

  return (
    <div className="tl-app">
      <div className="tl-bg-grid" />
      <header className="tl-topbar">
        <div className="tl-topbar-left">
          <div className="tl-brand">
            <div className="tl-brand-mark">{Ic.bolt}</div>
            <div className="tl-brand-name">TraceLink</div>
          </div>
          <div className="tl-search">
            {Ic.search}
            <input type="text" placeholder={t("shell.search")} />
          </div>
        </div>
        <div className="tl-topbar-actions">
          <div className="tl-lang-group" aria-label="Language">
            {LANGS.map(l => (
              <button key={l} className={`tl-lang-btn${lang === l ? " active" : ""}`} onClick={() => setLang(l)}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          <button className="tl-icon-btn" onClick={() => setShowGuide(true)} title="Help Guide">?</button>
          <div style={{ position: "relative" }}>
            <button className={`tl-icon-btn${notifOpen ? " active" : ""}`} onClick={() => { setNotifOpen(o => !o); if (!notifOpen) notifs.markRead(); }}>
              {Ic.bell}
              {notifs.unread > 0 && <span className="tl-notif-dot">{notifs.unread > 9 ? "9+" : notifs.unread}</span>}
            </button>
            {notifOpen && <NotifPanel notifs={notifs} onClose={() => setNotifOpen(false)} />}
          </div>
        </div>
      </header>
      <aside className={`tl-sidebar${sidebar.collapsed ? " collapsed" : ""}`}>
        <div className="tl-sidebar-header">
          <button className="tl-sidebar-toggle" onClick={sidebar.toggle} title="Toggle sidebar">
            {Ic.panelLeft}
          </button>
        </div>
        <nav className="tl-nav">
          {navGroups.map(g => (
            <div key={g.label}>
              <div className="tl-nav-section">{g.label}</div>
              {g.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === "/app/dashboard"} className={({ isActive }) => isActive ? "active" : ""}>
                  {item.icon}<span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="tl-user-area">
          <Link to="/app/account" className="tl-user-card">
            <div className="tl-avatar">{(user?.email?.[0] || "U").toUpperCase()}</div>
            <div className="tl-user-info">
              <div className="tl-user-email">{user?.email || "authenticated"}</div>
              <div className="tl-user-id">ID: {user?.uid?.substring(0, 10)}…</div>
            </div>
            <button className="tl-icon-btn tl-btn-ghost" style={{ width: 28, height: 28, border: "none", flexShrink: 0 }} onClick={e => { e.preventDefault(); logout(); }}>{Ic.logout}</button>
          </Link>
        </div>
      </aside>

      {sidebar.collapsed && (
        <button className="tl-sidebar-peek" onClick={sidebar.expand} title="Open sidebar">
          {Ic.chevronRight}
        </button>
      )}

      <main className="tl-main">
        <div className="tl-content">{children}</div>
      </main>

      {showGuide && <Guide onClose={closeGuide} />}
    </div>
  );
}

/* ══════════════════════════════════════════════
   METRIC CARD
══════════════════════════════════════════════ */
function Metric({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color?: string; icon?: ReactNode }) {
  return (
    <div className="tl-metric anim-up" style={{ "--metric-color": color || "var(--text-secondary)" } as any}>
      <div className="tl-metric-label">{label}</div>
      <div className="tl-metric-value">{value}</div>
      {sub && <div className="tl-metric-sub">{sub}</div>}
      {icon && <div className="tl-metric-icon" style={{ color: color || "var(--text-tertiary)" }}>{icon}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   PROGRESS RING
══════════════════════════════════════════════ */
function Ring({ pct, color = "var(--accent)", size = 80 }: { pct: number; color?: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="tl-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.23,1,0.32,1)" }} />
      </svg>
      <div className="tl-ring-val">{pct}%</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SPARKLINE
══════════════════════════════════════════════ */
function Spark({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="tl-sparkline">
      {data.map((v, i) => (
        <div key={i} className="tl-spark-bar" style={{ height: `${(v / max) * 100}%` }} title={`${v}`} />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════
   LOGIN PAGE (NEW DESIGN)
══════════════════════════════════════════════ */
export function LoginPageNew() {
  const { login, loginWithGoogle, register } = useAuth();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login"|"register">("login");
  const { theme } = useTheme();

  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      if (mode === "register") await register(email, pw);
      else await login(email, pw);
    } catch (ex: any) {
      const c = ex?.code || "";
      if (c === "auth/invalid-credential" || c === "auth/wrong-password") setErr("Invalid email or password");
      else if (c === "auth/user-not-found") setErr("No account found with this email");
      else if (c === "auth/email-already-in-use") setErr("Email already registered");
      else if (c === "auth/weak-password") setErr("Password must be at least 6 characters");
      else setErr(ex?.message || "Authentication failed");
    } finally { setLoading(false); }
  }

  async function googleSignIn() {
    setErr(""); setLoading(true);
    try { await loginWithGoogle(); }
    catch (ex: any) { if (ex?.code !== "auth/popup-closed-by-user") setErr(ex?.message || "Google sign-in failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="tl-login-root" data-theme={theme || "light"}>
      <div className="tl-bg-grid" />

      {/* LEFT: Hero */}
      <div className="tl-login-left">
        <div className="tl-login-brand">
          <div style={{ width: 44, height: 44, background: "var(--bg-auth)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF" }}>
            {Ic.bolt}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>TraceLink</div>
            <div style={{ fontFamily: "var(--font-label)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.12em" }}>PRECISION INDUSTRIAL v2</div>
          </div>
        </div>
        <h1 className="tl-login-hero">
          Trace Every<br /><span className="accent">Component</span><br />End-to-End
        </h1>
        <p className="tl-login-desc">
          Manufacturing traceability from raw material lot to customer shipment. Recall investigations in seconds, not days.
        </p>
        <div className="tl-login-stats">
          {[
            { n: "30s", l: t("login.stat.time") },
            { n: "100%", l: t("login.stat.coverage") },
            { n: "5-Tier", l: t("login.stat.engine") },
          ].map(s => (
            <div key={s.l}>
              <div className="tl-login-stat-num">{s.n}</div>
              <div className="tl-login-stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="tl-login-right">
        <div className="tl-login-card">
          <div className="tl-crumb" style={{ marginBottom: 10 }}>
            {mode === "login" ? t("login.mode.system") : t("login.mode.create")}
          </div>
          <div className="tl-login-card-title">{mode === "login" ? t("login.mode.signin") : t("login.mode.register")}</div>
          <div className="tl-login-card-sub">
            {mode === "login" ? t("login.card.sub.signin") : t("login.card.sub.register")}
          </div>

          <form className="tl-login-form" onSubmit={submit}>
            <label className="tl-label">
              Email
              <input className="tl-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" required autoFocus />
            </label>
            <label className="tl-label">
              Password
              <input className="tl-input" type="password" value={pw} onChange={e => setPw(e.target.value)}
                placeholder="••••••••" required minLength={6} />
            </label>
            {err && <div className="tl-login-error">{err}</div>}
            <button className="tl-btn tl-btn-primary" type="submit" disabled={loading} style={{ width: "100%", padding: 12, fontSize: 14 }}>
              {loading ? "Processing…" : mode === "login" ? t("login.mode.signin") : t("login.mode.create")}
            </button>
          </form>

          <div className="tl-divider" style={{ margin: "16px 0" }}><span>or</span></div>

          <button className="tl-btn" onClick={googleSignIn} disabled={loading} style={{ width: "100%", padding: 11, gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.01 24.01 0 000 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div className="tl-login-toggle" style={{ marginTop: 18 }}>
            {mode === "login" ? t("login.toggle.noaccount") : t("login.toggle.hasaccount")}
            <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setErr(""); }}>
              {mode === "login" ? t("login.mode.register") : t("login.mode.signin")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DASHBOARD SCREEN
══════════════════════════════════════════════ */
function DashboardScreen() {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(() => {
    try { const c = sessionStorage.getItem("tl_dash_cache"); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchDashboard().then(d => {
      setMetrics(d);
      sessionStorage.setItem("tl_dash_cache", JSON.stringify(d));
    }).catch(e => setErr(e.message));
  }, []);

  const isEmpty = metrics && metrics.batch_count === 0;

  const trendData = metrics?.defect_trend?.slice(0, 10).map(d => d.failures || 0).reverse() || [];
  const maxFail = metrics?.shift_metrics ? Math.max(...metrics.shift_metrics.filter(s => s.shift && s.shift.length <= 5).map(s => s.fail_count), 1) : 1;

  return (
    <Shell page="DASHBOARD">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Quality Metrics</div>
          <div className="tl-page-title">Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {metrics && <div style={{ fontFamily: "var(--font-label)", fontSize: 11, color: "var(--text-tertiary)", alignSelf: "flex-end", paddingBottom: 4 }}>
            Last refreshed {new Date().toLocaleTimeString()}
          </div>}
        </div>
      </div>

      {err && <div className="tl-alert tl-alert-danger anim-up">{Ic.alert} {err}</div>}

      {isEmpty && (
        <div className="tl-card anim-up" style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ width: 64, height: 64, background: "var(--bg-inset)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--text-tertiary)" }}>
            {Ic.import}
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Empty Workspace</div>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Import your first CSV files to populate metrics and begin tracing.</p>
          <Link to="/app/import" className="tl-btn tl-btn-primary" style={{ textDecoration: "none", padding: "11px 28px" }}>
            {Ic.upload} Import Data
          </Link>
        </div>
      )}

      {metrics && !isEmpty && (
        <>
          {/* Metric Strip */}
          <div className="tl-metrics stagger">
            <Metric label={t("dash.prod_batches")} value={metrics.batch_count.toLocaleString()} icon={Ic.operator} />
            <Metric label={t("dash.qc_pass")} value={`${metrics.pass_rate}%`} color="var(--green)" icon={Ic.check} />
            <Metric label={t("dash.open_complaints")} value={metrics.open_complaints} color={metrics.open_complaints > 0 ? "var(--red)" : "var(--green)"} icon={Ic.alert} />
            <Metric label={t("dash.unresolved_links")} value={metrics.unresolved_links} color={metrics.unresolved_links > 0 ? "var(--amber)" : "var(--green)"} icon={Ic.review} />
            <Metric label={t("dash.open_capas")} value={metrics.open_corrective_actions} color="var(--purple)" icon={Ic.compliance} />
            <Metric label={t("dash.pending")} value={metrics.pending_operator_entries} icon={Ic.operator} />
          </div>

          {/* Shift Intelligence + Defect Trend */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Shift Intelligence</div>
                <div className="tl-card-tag">QC Fail Analysis</div>
              </div>
              <div className="tl-shift-grid">
                {metrics.shift_metrics?.filter(s => s.shift && s.shift.length <= 3).map(s => {
                  const cleanShifts = metrics.shift_metrics.filter(x => x.shift && x.shift.length <= 3);
                  const isWorst = s.fail_count === Math.max(...cleanShifts.map(x => x.fail_count));
                  const pct = Math.round((s.fail_count / maxFail) * 100);
                  return (
                    <div key={s.shift} className={`tl-shift-card${isWorst ? " worst" : ""}`}>
                      <div className="tl-shift-label">
                        <span className="tl-shift-label-text" title={`Shift ${s.shift}`}>Shift {s.shift}</span>
                        {isWorst && <span className="tl-badge tl-badge-fail" style={{ flexShrink: 0 }}>Worst</span>}
                      </div>
                      <div className="tl-shift-value">{s.fail_count}</div>
                      <div className="tl-shift-sub">fails · {s.avg_defect_rate}% avg defect</div>
                      <div className="tl-shift-bar-wrap">
                        <div className="tl-shift-bar-fill" style={{ width: `${pct}%`, "--bar-color": isWorst ? "var(--red)" : "var(--text-secondary)" } as any} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Defect Trend</div>
                <div className="tl-card-tag">Last 10 Dates</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
                <Ring pct={metrics.pass_rate} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Failure count per inspection date</div>
                  <Spark data={trendData} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-label)", marginTop: 4 }}>
                    <span>Oldest</span><span>Recent</span>
                  </div>
                </div>
              </div>
              {metrics.defect_trend && metrics.defect_trend.length > 0 && (
                <div className="tl-table-wrap" style={{ marginTop: 14, maxHeight: 160, overflowY: "auto" }}>
                  <table className="tl-table" style={{ fontSize: 11 }}>
                    <thead><tr><th>Date</th><th>Total</th><th>Failures</th><th>Defect %</th></tr></thead>
                    <tbody>
                      {metrics.defect_trend.slice(0, 10).map((d: any) => (
                        <tr key={d.inspection_date}>
                          <td style={{ fontFamily: "var(--font-label)" }}>{d.inspection_date}</td>
                          <td style={{ fontFamily: "var(--font-label)" }}>{d.total}</td>
                          <td style={{ color: d.failures > 0 ? "var(--red)" : "var(--green)", fontFamily: "var(--font-label)", fontWeight: 600 }}>{d.failures}</td>
                          <td style={{ color: "var(--amber)", fontFamily: "var(--font-label)" }}>{d.avg_defect_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!metrics.defect_trend || metrics.defect_trend.length === 0) && (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)", fontSize: 12 }}>No defect trend data available. Upload QC inspection files to populate.</div>
              )}
            </div>
          </div>

          {/* Top Machines + Supplier Scorecard */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Top Failing Machines</div>
                <div className="tl-card-tag">By failure count</div>
              </div>
              <div className="tl-table-wrap">
                <table className="tl-table">
                  <thead><tr><th>Machine</th><th>Failures</th><th>Avg Defect %</th></tr></thead>
                  <tbody>
                    {metrics.top_failing_machines.map(m => (
                      <tr key={m.machine_id}>
                        <td><span className="tl-badge tl-badge-info">{m.machine_id}</span></td>
                        <td style={{ color: "var(--red)", fontFamily: "var(--font-label)", fontWeight: 600 }}>{m.fail_count}</td>
                        <td style={{ color: "var(--amber)", fontFamily: "var(--font-label)" }}>{m.avg_defect_rate}%</td>
                      </tr>
                    ))}
                    {!metrics.top_failing_machines.length && (
                      <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 24 }}>No failures recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Supplier Scorecard</div>
                <div className="tl-card-tag">Risk Ranked</div>
              </div>
              <div className="tl-table-wrap">
                <table className="tl-table">
                  <thead><tr><th>Supplier</th><th>Status</th><th>Lots</th><th>Complaints</th></tr></thead>
                  <tbody>
                    {metrics.supplier_scorecard.slice(0, 6).map(s => (
                      <tr key={s.supplier_id}>
                        <td>{s.supplier_name || s.supplier_id}</td>
                        <td>
                          <span className={`tl-badge ${s.approved_status?.toLowerCase() === "approved" ? "tl-badge-pass" : "tl-badge-warn"}`}>
                            {s.approved_status || "Unknown"}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--font-label)" }}>{s.lots_supplied}</td>
                        <td style={{ color: s.complaint_count > 0 ? "var(--red)" : "var(--text-tertiary)", fontFamily: "var(--font-label)", fontWeight: s.complaint_count > 0 ? 600 : 400 }}>{s.complaint_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent Imports */}
          {metrics.recent_imports?.length > 0 && (
            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Recent Imports</div>
                <Link to="/app/import" style={{ color: "var(--accent)", fontSize: 12, textDecoration: "none", fontFamily: "var(--font-label)", letterSpacing: "0.06em" }}>View All →</Link>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {metrics.recent_imports.map(r => (
                  <div key={r.import_id} style={{ padding: "10px 16px", background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                    <div style={{ fontFamily: "var(--font-label)", color: "var(--accent)", fontSize: 10, marginBottom: 3 }}>{r.import_id}</div>
                    <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.filename}</div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 2 }}>{r.file_type} · {r.row_count} rows · <span className={`tl-badge ${r.status === "validated" ? "tl-badge-pass" : r.status === "partial" ? "tl-badge-warn" : "tl-badge-fail"}`} style={{ padding: "1px 6px", fontSize: 9 }}>{r.status}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   TRACE SCREEN
══════════════════════════════════════════════ */
function TraceScreen() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem("tl_trace_query") || params.get("order_id") || "");
  const [result, setResult] = useState<TraceResult | null>(() => {
    try { const c = sessionStorage.getItem("tl_trace_result"); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const notified = useRef(new Set<string>());

  async function run(update = true) {
    const id = orderId.trim(); if (!id) return;
    setErr(""); setLoading(true);
    try {
      const r = await fetchTrace(id);
      setResult(r);
      sessionStorage.setItem("tl_trace_result", JSON.stringify(r));
      sessionStorage.setItem("tl_trace_query", id);
      if (update) setParams({ order_id: id });
    } catch (e: any) { setErr(e?.message || "Trace failed"); setResult(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (params.get("order_id") && params.get("order_id") !== orderId) { setOrderId(params.get("order_id")!); run(false); } }, [params]);

  useEffect(() => {
    const id = result?.dispatch?.order_id;
    if (!id || notified.current.has(id)) return;
    const hasFail = result?.batches?.some(b => b.qc?.pass_fail === "FAIL");
    if (hasFail) { notify(`QC FAIL — ${id}`, "Dispatch includes at least one failed batch.", "danger"); notified.current.add(id); }
  }, [result]);

  return (
    <Shell page="TRACE">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Traceability</div>
          <div className="tl-page-title">Dispatch Trace</div>
        </div>
        {result && (
          <button className="tl-btn tl-btn-ghost" onClick={() => downloadTraceExport(result.dispatch.order_id).catch()}>
            {Ic.download} Export CSV
          </button>
        )}
      </div>

      <div className="tl-split">
        <div className="tl-split-left">
          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">Order Lookup</div>
              <div className="tl-card-tag">[ Input ]</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="tl-input" value={orderId} onChange={e => setOrderId(e.target.value)}
                placeholder={t("trace.ordering")} onKeyDown={e => e.key === "Enter" && run()} />
              <button className="tl-btn tl-btn-primary" onClick={() => run()} disabled={loading} style={{ minWidth: 100, flexShrink: 0 }}>
                {loading ? "Tracing…" : "Trace"}
              </button>
            </div>
            {err && <div className="tl-alert tl-alert-danger" style={{ marginTop: 12 }}>{err}</div>}
          </div>

          {result && (
            <>
              {result.batches.some(b => b.qc?.pass_fail === "FAIL") && (
                <div className="tl-alert tl-alert-danger anim-up">
                  {Ic.alert} <strong>QC FAIL detected</strong> — Prioritize containment. Review affected batches below.
                </div>
              )}
              {result.anomalies?.length > 0 && result.anomalies.map((a, i) => (
                <div key={i} className="tl-alert tl-alert-warn anim-up">{Ic.alert} {a}</div>
              ))}

              <div className="tl-card anim-up">
                <div className="tl-card-header">
                  <div>
                    <div className="tl-card-title">Order {result.dispatch.order_id}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      Customer: <strong>{result.dispatch.customer_id}</strong> · {result.dispatch.dispatch_date} · {result.query_ms}ms
                    </div>
                  </div>
                  <span className={`tl-badge ${result.status === "complete" ? "tl-badge-pass" : "tl-badge-warn"}`}>
                    {result.status || "partial"}
                  </span>
                </div>

                {result.batches.map((b, i) => (
                  <div key={b.batch_id} style={{ padding: "16px", background: "var(--bg-inset)", border: `1px solid ${b.qc?.pass_fail === "FAIL" ? "rgba(255,59,92,0.3)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-sm)", marginBottom: i < result.batches.length - 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontFamily: "var(--font-label)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{b.batch_id}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span className={`tl-badge ${b.qc?.pass_fail === "PASS" ? "tl-badge-pass" : b.qc?.pass_fail === "FAIL" ? "tl-badge-fail" : "tl-badge-info"}`}>
                          {b.qc?.pass_fail || "NO QC"}
                        </span>
                        {b.link_type && <span className="tl-badge tl-badge-purple">{b.link_type}</span>}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 12 }}>
                      {[
                        { k: "Lot", v: b.production?.input_lot_ref || "—" },
                        { k: t("dash.machine_col"), v: b.production?.machine_id || "—" },
                        { k: "Shift", v: b.production?.shift || "—" },
                        { k: t("dash.supplier_col"), v: b.raw_material?.supplier?.supplier_name || "—" },
                        { k: "Material", v: b.raw_material?.material_type || "—" },
                        { k: "Defect Rate", v: b.qc?.defect_rate_pct != null ? `${b.qc.defect_rate_pct}%` : "—" },
                      ].map(r => (
                        <div key={r.k} style={{ padding: "8px 10px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontFamily: "var(--font-label)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 3 }}>{r.k}</div>
                          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: Chain Map */}
        <div className="tl-split-right">
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "12px 18px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
            <div style={{ fontFamily: "var(--font-label)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Supply Chain Visualization</div>
            {result && <div style={{ fontFamily: "var(--font-label)", fontSize: 10, color: "var(--accent)" }}>{result.batches.length} batch{result.batches.length !== 1 ? "es" : ""} linked</div>}
          </div>
          <div className="tl-chain-map" style={{ paddingTop: 58 }}>
            {!result ? (
              <div className="tl-chain-empty">
                <div className="tl-chain-empty-icon" style={{ color: "var(--text-tertiary)" }}>{Ic.map}</div>
                <div style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 600 }}>Chain Map</div>
                <div style={{ fontSize: 12 }}>Enter an order ID to visualize the full supply chain node graph.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animation: "fadeInUp 0.5s var(--ease-snappy)" }}>
                <div className="tl-chain-node-customer">
                  <div className="node-type">Destination</div>
                  <div className="node-id">{result.dispatch.customer_id}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Order {result.dispatch.order_id}</div>
                </div>
                <div className="tl-chain-connector" />
                <div style={{ padding: "14px 28px", background: "var(--bg-elevated)", border: "2px solid var(--border-strong)", borderRadius: "var(--radius-md)", textAlign: "center", marginBottom: 0 }}>
                  <div style={{ fontFamily: "var(--font-label)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 3 }}>Distribution</div>
                  <div style={{ fontWeight: 600 }}>Dispatch {result.dispatch.dispatch_date}</div>
                </div>
                <div className="tl-chain-connector" style={{ background: "linear-gradient(to bottom, var(--text-tertiary), var(--border-default))" }} />
                <div className="tl-chain-batches" style={{ animation: "fadeInUp 0.6s var(--ease-snappy) 0.1s both" }}>
                  {result.batches.map(b => (
                    <div key={b.batch_id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div className={`tl-chain-batch${b.qc?.pass_fail === "FAIL" ? " fail" : ""}`}>
                        {b.link_type && <div className="tl-link-type-badge">{b.link_type}</div>}
                        <div className="tl-batch-id">{b.batch_id}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span className={`tl-badge ${b.qc?.pass_fail === "PASS" ? "tl-badge-pass" : b.qc?.pass_fail === "FAIL" ? "tl-badge-fail" : "tl-badge-info"}`}>
                            {b.qc?.pass_fail || "NO QC"}
                          </span>
                          {b.qc?.defect_rate_pct && <span className="tl-badge tl-badge-warn">{b.qc.defect_rate_pct}%</span>}
                        </div>
                        {[
                          { k: t("dash.machine_col"), v: b.production?.machine_id },
                          { k: "Shift", v: b.production?.shift },
                          { k: "Lot", v: b.production?.input_lot_ref },
                          { k: t("dash.supplier_col"), v: b.raw_material?.supplier?.supplier_name },
                        ].map(r => r.v ? (
                          <div key={r.k} className="tl-batch-row">
                            <span className="tl-batch-key">{r.k}</span>
                            <span className="tl-batch-val">{r.v}</span>
                          </div>
                        ) : null)}
                      </div>
                      <div style={{ height: 28, width: 1, background: "var(--border-subtle)", borderLeft: "1px dashed var(--border-default)", margin: "0 auto" }} />
                      <div style={{ padding: "8px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-label)", fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Raw Supplier</div>
                        {b.raw_material?.supplier?.supplier_name || t("trace.map_no_link")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   ALERT SCREEN
══════════════════════════════════════════════ */
function AlertScreen() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [lot, setLot] = useState(params.get("lot") || "");
  const [result, setResult] = useState<AlertResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(update = true) {
    const l = lot.trim(); if (!l) return;
    setErr(""); setLoading(true);
    try { setResult(await fetchAlert(l)); if (update) setParams({ lot: l }); }
    catch (e: any) { setErr(e?.message || "Alert failed"); setResult(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (params.get("lot")) run(false); }, []); // eslint-disable-line

  return (
    <Shell page="ALERT">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Quality Response</div>
          <div className="tl-page-title">Lot Impact Alert</div>
        </div>
        {result && (
          <button className="tl-btn tl-btn-ghost" onClick={() => downloadAlertExport(result.lot_number).catch()}>
            {Ic.download} Export CSV
          </button>
        )}
      </div>

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">Lot Fanout Analysis</div>
          <div className="tl-card-tag">[ Fanout ]</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="tl-input" value={lot} onChange={e => setLot(e.target.value)}
            placeholder={t("alert.lot_placeholder")} onKeyDown={e => e.key === "Enter" && run()} />
          <button className="tl-btn tl-btn-amber" onClick={() => run()} disabled={loading} style={{ minWidth: 110, flexShrink: 0 }}>
            {loading ? "Scanning…" : "Simulate"}
          </button>
        </div>
        {err && <div className="tl-alert tl-alert-danger" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      {result && (
        <>
          <div className="tl-metrics stagger">
            <Metric label="Affected Orders" value={result.summary.dispatch_order_count} color="var(--red)" />
            <Metric label={t("alert.failed_batches")} value={result.summary.failed_batch_count || 0} color="var(--red)" />
            <Metric label={t("alert.financial")} value={`₹ ${(result.summary.financial_exposure || 0).toLocaleString()}`} color="var(--amber)" />
            <Metric label={t("alert.escaped_shipments")} value={result.summary.escaped_shipments_count || 0} color={( result.summary.escaped_shipments_count || 0) > 0 ? "var(--red)" : "var(--green)"} />
            <Metric label={t("alert.post_qc")} value={result.summary.post_qc_dispatches_count || 0} color="var(--amber)" />
            <Metric label={t("alert.quarantine")} value={result.summary.quarantine_recommendations?.length || 0} color="var(--purple)" />
          </div>

          {result.summary.escaped_shipments_count && result.summary.escaped_shipments_count > 0 ? (
            <div className="tl-alert tl-alert-danger anim-up">
              {Ic.alert} <strong>{result.summary.escaped_shipments_count} escaped shipment{result.summary.escaped_shipments_count > 1 ? "s" : ""}</strong> — Failed batches dispatched before QC inspection. Immediate recall action required.
            </div>
          ) : null}

          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">Affected Dispatch Orders</div>
              <div style={{ fontFamily: "var(--font-label)", fontSize: 10, color: "var(--text-tertiary)" }}>{result.affected_dispatch_orders.length} orders · {result.query_ms}ms</div>
            </div>
            <div className="tl-table-wrap">
              <table className="tl-table">
                <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Batch</th><th>QC</th></tr></thead>
                <tbody>
                  {result.affected_dispatch_orders.map(r => (
                    <tr key={`${r.order_id}-${r.batch_id}`}>
                      <td style={{ fontFamily: "var(--font-label)", color: "var(--accent)" }}>{r.order_id}</td>
                      <td>{r.customer_id}</td>
                      <td style={{ fontFamily: "var(--font-label)" }}>{r.dispatch_date}</td>
                      <td style={{ fontFamily: "var(--font-label)", fontSize: 12 }}>{r.batch_id}</td>
                      <td>{r.pass_fail ? <span className={`tl-badge ${r.pass_fail === "PASS" ? "tl-badge-pass" : "tl-badge-fail"}`}>{r.pass_fail}{r.defect_rate_pct ? ` ${r.defect_rate_pct}%` : ""}</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   OPERATOR SCREEN
══════════════════════════════════════════════ */
function OperatorScreen() {
  const online = useOnline();
  const { t } = useI18n();
  const [queued, setQueued] = useState(0);
  const [msg, setMsg] = useState("");
  const [shift, setShift] = useState("A");

  useEffect(() => {
    const h = new Date().getHours();
    setShift(h >= 6 && h < 14 ? "A" : h >= 14 && h < 22 ? "B" : "C");
    getQueuedEntries().then(e => setQueued(e.length));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const entry = {
      date: String(d.get("date")), raw_lot: String(d.get("raw_lot")),
      machine_id: String(d.get("machine_id")), shift: String(d.get("shift")),
      operator_id: String(d.get("operator_id")),
      units_produced: Number(d.get("units_produced")),
      qc_notes: String(d.get("qc_notes") || ""),
      client_entry_id: crypto.randomUUID(), device_id: getDeviceId(),
    };
    if (!entry.raw_lot || !entry.operator_id || !entry.units_produced) { setMsg(t("op.fill_required")); return; }
    if (!online) {
      await enqueueEntry(entry); const q = await getQueuedEntries(); setQueued(q.length);
      setMsg(t("op.saved_offline")); (e.target as HTMLFormElement).reset(); return;
    }
    const r = await postBatch(entry);
    setMsg(r.ok ? t("op.saved") : t("op.save_failed"));
    if (r.ok) (e.target as HTMLFormElement).reset();
  }

  return (
    <Shell page="OPERATOR">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Shop Floor</div>
          <div className="tl-page-title">Batch Entry</div>
        </div>
        <div className="tl-statusline" style={{ padding: "6px 14px" }}>
          <div className="tl-status-dot" style={{ background: online ? "var(--green)" : "var(--amber)" }} />
          {online ? <span className="ok">Online</span> : <span className="warn">Offline — {queued} queued</span>}
          {online && queued > 0 && (
            <button className="tl-btn tl-btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }} onClick={async () => {
              const r = await syncQueuedEntries(); const q = await getQueuedEntries(); setQueued(q.length);
              setMsg(`${r.synced} synced, ${r.failed} failed.`);
            }}>Sync Now</button>
          )}
        </div>
      </div>

      {!online && (
        <div className="tl-alert tl-alert-warn anim-up">
          {Ic.alert} You're offline. Entries are saved locally and will sync automatically when you reconnect.
        </div>
      )}

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">New Batch</div>
          <div className="tl-card-tag">Auto-shift: {shift}</div>
        </div>
        <form className="tl-form" onSubmit={submit}>
          <label className="tl-label">Date<input className="tl-input" name="date" type="date" required /></label>
          <label className="tl-label">Raw Lot<input className="tl-input" name="raw_lot" placeholder="LOT-YYYY-NNN" required /></label>
          <label className="tl-label">Machine
            <select className="tl-input" name="machine_id">
              <option>MC-01</option><option>MC-02</option><option>MC-03</option><option>MC-04</option><option>MC-05</option>
            </select>
          </label>
          <label className="tl-label">Shift
            <select className="tl-input" name="shift" defaultValue={shift} key={shift}>
              <option value="A">A — 06:00–14:00</option>
              <option value="B">B — 14:00–22:00</option>
              <option value="C">C — 22:00–06:00</option>
            </select>
          </label>
          <label className="tl-label">Operator ID<input className="tl-input" name="operator_id" placeholder="OP-001" required /></label>
          <label className="tl-label">Units Produced<input className="tl-input" name="units_produced" type="number" min="1" required /></label>
          <label className="tl-label tl-span3">QC Notes (optional)<input className="tl-input" name="qc_notes" placeholder="Visual check, measurements, anomalies…" /></label>
          <div className="tl-span3">
            <button className="tl-btn tl-btn-primary" type="submit" style={{ padding: "11px 28px" }}>
              {Ic.check} Save Batch
            </button>
          </div>
        </form>
        {msg && <div className={`tl-alert ${msg.includes("fail") || msg.includes("fail") ? "tl-alert-warn" : "tl-alert-ok"}`} style={{ marginTop: 14 }}>{msg}</div>}
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   IMPORT SCREEN
══════════════════════════════════════════════ */
function ImportScreen() {
  const { t } = useI18n();
  const [fileType, setFileType] = useState("raw_materials");
  const [file, setFile] = useState<File | null>(null);
  const [imports, setImports] = useState<any[]>(() => {
    try { const c = sessionStorage.getItem("tl_import_cache"); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<any>(null);
  
  const refresh = async () => {
    const d = await fetchImports();
    setImports(d.imports || []);
    sessionStorage.setItem("tl_import_cache", JSON.stringify(d.imports || []));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setMsg(t("import.select_file")); return; }
    
    setUploading(true);
    setProgress(0);
    setMsg("");
    setReport(null);
    
    try {
      const r = await uploadImportWithProgress(file, fileType, setProgress);
      setReport(r);
      setFile(null);
      await refresh();
    } catch (ex: any) {
      setMsg(ex?.message || "Import failed");
    } finally {
      setUploading(false);
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const statusColor = (s: string) => s === "validated" ? "tl-badge-pass" : s === "partial" ? "tl-badge-warn" : s === "rejected" ? "tl-badge-fail" : "tl-badge-info";

  return (
    <Shell page="IMPORT">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Data Management</div>
          <div className="tl-page-title">Data Ingestion Pipeline</div>
        </div>
      </div>

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">Upload Industrial CSV</div>
          <div className="tl-card-tag">
            raw_materials · production · qc · dispatch · supplier · complaints
          </div>
        </div>
        <form className="tl-form" onSubmit={submit} style={{ display: "block" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 20 }}>
            <label className="tl-label">Target Table
              <select className="tl-input" value={fileType} onChange={e => setFileType(e.target.value)}>
                {["raw_materials","production","qc","dispatch","supplier","complaints"].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <div className="tl-label">Source File
              <div 
                className="tl-dropzone" 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => document.getElementById("hidden-file-input")?.click()}
                style={{
                  border: "1px dashed var(--border)",
                  borderRadius: 6,
                  padding: "16px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "var(--bg-inset)",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12
                }}
              >
                <input 
                  id="hidden-file-input"
                  type="file" 
                  accept=".csv,text/csv" 
                  style={{ display: "none" }}
                  onChange={e => setFile(e.target.files?.[0] || null)} 
                />
                {file ? (
                  <>
                    <div style={{ color: "var(--accent)" }}>{Ic.doc}</div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <button type="button" className="tl-btn tl-btn-ghost" onClick={(e) => { e.stopPropagation(); setFile(null); }}>{Ic.close}</button>
                  </>
                ) : (
                  <>
                    <div style={{ color: "var(--text-tertiary)" }}>{Ic.upload}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Click to browse or drag and drop a CSV file here</div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button className="tl-btn tl-btn-primary" type="submit" disabled={!file || uploading} style={{ minWidth: 120 }}>
              {uploading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="tl-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Processing...
                </div>
              ) : (
                <>{Ic.upload} Upload File</>
              )}
            </button>
            {uploading && (
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, color: "var(--text-secondary)" }}>
                  <span>Uploading to ingest pipeline...</span>
                  <span>{progress}%</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-inset)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", transition: "width 0.2s" }} />
                </div>
              </div>
            )}
            {msg && !uploading && <div className={`tl-alert ${msg.includes("failed") ? "tl-alert-warn" : "tl-alert-ok"}`} style={{ margin: 0, padding: "8px 12px", flex: 1 }}>{msg}</div>}
          </div>
        </form>
      </div>

      {report && (
        <div className="tl-card anim-up">
          <div className="tl-card-header">
            <div className="tl-card-title">Upload Report</div>
            <div className="tl-card-tag">{report.import_id}</div>
          </div>
          <div className="tl-metrics">
            <Metric label={t("import.report_total")} value={report.row_count} color="var(--text)" />
            <Metric label={t("import.report_valid")} value={report.valid_rows} color="var(--green)" />
            <Metric label={t("import.report_errors")} value={report.error_count} color={report.error_count > 0 ? "var(--red)" : "var(--text)"} />
            <div className="tl-metric-card">
              <div className="tl-metric-label">Status</div>
              <div style={{ marginTop: 4 }}><span className={`tl-badge ${statusColor(report.status)}`}>{report.status.toUpperCase()}</span></div>
            </div>
          </div>
          
          {report.errors && report.errors.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {Ic.alert} Validation Errors ({report.errors.length}{report.errors.length === 50 ? "+" : ""})
              </div>
              <div className="tl-table-wrap" style={{ maxHeight: 200, overflowY: "auto" }}>
                <table className="tl-table" style={{ fontSize: 12 }}>
                  <thead><tr><th style={{ width: 80 }}>Row</th><th style={{ width: 140 }}>Field</th><th>Error Details</th></tr></thead>
                  <tbody>
                    {report.errors.map((e: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-label)" }}>{e.row}</td>
                        <td style={{ color: "var(--amber)", fontFamily: "var(--font-label)" }}>{e.field || "—"}</td>
                        <td>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">Ingestion History</div>
          <div className="tl-card-tag">{imports.length} files</div>
        </div>
        <div className="tl-table-wrap">
          <table className="tl-table">
            <thead><tr><th>ID</th><th>Filename</th><th>Type</th><th>Status</th><th>Rows</th><th>Uploaded</th><th>Actions</th></tr></thead>
            <tbody>
              {imports.map(r => (
                <tr key={r.import_id}>
                  <td><span style={{ fontFamily: "var(--font-label)", fontSize: 11, color: "var(--accent)" }}>{r.import_id}</span></td>
                  <td>{r.filename}</td>
                  <td><span className="tl-badge tl-badge-info">{r.file_type}</span></td>
                  <td><span className={`tl-badge ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td style={{ fontFamily: "var(--font-label)" }}>{r.row_count}</td>
                  <td style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-label)" }}>{r.uploaded_at?.slice(0,16)}</td>
                  <td>
                    <button className="tl-btn tl-btn-danger" style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={async () => {
                        if (!confirm("Delete this import and all associated data?")) return;
                        try { const d = await deleteImport(r.import_id); setMsg(`Deleted ${d.import_id} — ${d.domain_rows_removed} rows removed.`); await refresh(); }
                        catch (ex: any) { setMsg(ex?.message || "Delete failed"); }
                      }}>
                      {Ic.trash} Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!imports.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 28 }}>No imports yet. Upload a CSV file above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   REVIEW SCREEN
══════════════════════════════════════════════ */
function ReviewScreen() {
  const { t } = useI18n();
  const [links, setLinks] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const refresh = async () => { const d = await fetchUnresolvedLinks(); setLinks(d.unresolved_links || []); };
  useEffect(() => { refresh().catch(e => setMsg(e.message)); }, []);

  async function act(id: number, action: "approve"|"reject") {
    try {
      if (action === "approve") await approveLink(id, "Reviewed in TraceLink v2");
      else await rejectLink(id, "Rejected in TraceLink v2");
      setMsg(`Link ${action}d.`); await refresh();
    } catch (ex: any) { setMsg(ex?.message || "Action failed"); }
  }

  return (
    <Shell page="REVIEW">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Data Quality</div>
          <div className="tl-page-title">Link Review Queue</div>
        </div>
        <div className="tl-statusline">
          <span style={{ fontFamily: "var(--font-label)", fontSize: 11 }}>{links.filter(l => l.review_status === "pending").length} pending</span>
        </div>
      </div>

      {msg && <div className="tl-alert tl-alert-info anim-up">{msg}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((l, i) => (
          <div key={l.production_id} className="tl-review-item anim-up" style={{ animationDelay: `${i * 40}ms` }}>
            <div>
              <div style={{ fontFamily: "var(--font-label)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{l.batch_id}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-label)" }}>{l.production_date}</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className="tl-badge tl-badge-purple">Inferred Lot</span>
                <span style={{ fontFamily: "var(--font-label)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{l.input_lot_ref}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", marginBottom: 8 }}>"{l.inference_reason}"</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="tl-confidence-bar" style={{ flex: 1 }}>
                  <div className="tl-confidence-fill" style={{ width: `${Math.round(l.inference_confidence * 100)}%` }} />
                </div>
                <span style={{ fontFamily: "var(--font-label)", fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                  {Math.round(l.inference_confidence * 100)}%
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {l.review_status !== "pending" ? (
                <span className={`tl-badge ${l.review_status === "approved" ? "tl-badge-pass" : "tl-badge-fail"}`} style={{ padding: "6px 14px" }}>
                  {l.review_status}
                </span>
              ) : (
                <>
                  <button className="tl-btn tl-btn-primary" style={{ padding: "7px 16px" }} onClick={() => act(l.production_id, "approve")}>{Ic.check} Approve</button>
                  <button className="tl-btn tl-btn-ghost" style={{ padding: "7px 16px", color: "var(--red)" }} onClick={() => act(l.production_id, "reject")}>{Ic.close} Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!links.length && (
          <div className="tl-card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ color: "var(--green)", marginBottom: 10 }}>{Ic.check}</div>
            <div style={{ fontFamily: "var(--font-headline)", fontSize: 18, fontWeight: 600 }}>All Clear</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 6 }}>No pending inferences. All traces are deterministic.</div>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   COMPLIANCE SCREEN
══════════════════════════════════════════════ */
function ComplianceScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const refresh = async () => { const d = await fetchCorrectiveActions(); setItems(d.corrective_actions || []); };
  useEffect(() => { refresh().catch(e => setMsg(e.message)); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      const r = await createCorrectiveAction({ triggered_by: String(d.get("triggered_by")), assigned_to: String(d.get("assigned_to")), root_cause: String(d.get("root_cause")), due_date: String(d.get("due_date")) });
      setMsg(`Created ${r.ca_id}`); (e.target as HTMLFormElement).reset(); await refresh();
    } catch (ex: any) { setMsg(ex?.message || "Create failed"); }
  }

  const statusColor = (s: string) => s === "open" ? "tl-badge-warn" : s === "closed" ? "tl-badge-pass" : "tl-badge-info";

  return (
    <Shell page="CAPA">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Compliance</div>
          <div className="tl-page-title">Corrective Actions</div>
        </div>
        <div style={{ fontFamily: "var(--font-label)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {items.filter(i => i.status === "open").length} open · {items.length} total
        </div>
      </div>

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">Open Corrective Action</div>
          <div className="tl-card-tag">CAPA / 8D</div>
        </div>
        <form className="tl-form" onSubmit={submit}>
          <label className="tl-label">Triggered By<input className="tl-input" name="triggered_by" placeholder="Lot number or complaint ID" /></label>
          <label className="tl-label">Assigned To<input className="tl-input" name="assigned_to" placeholder="Quality owner name or email" /></label>
          <label className="tl-label">Due Date<input className="tl-input" name="due_date" type="date" /></label>
          <label className="tl-label tl-span3">Root Cause<input className="tl-input" name="root_cause" placeholder="Initial root cause finding…" /></label>
          <div className="tl-span3">
            <button className="tl-btn tl-btn-primary" type="submit" style={{ padding: "10px 24px" }}>
              {Ic.compliance} Open CAPA
            </button>
          </div>
        </form>
        {msg && <div className="tl-alert tl-alert-info" style={{ marginTop: 14 }}>{msg}</div>}
      </div>

      <div className="tl-card anim-up">
        <div className="tl-card-header">
          <div className="tl-card-title">Action Register</div>
          <div className="tl-card-tag">{items.length} records</div>
        </div>
        <div className="tl-table-wrap">
          <table className="tl-table">
            <thead><tr><th>ID</th><th>Status</th><th>Triggered By</th><th>Assigned To</th><th>Due Date</th></tr></thead>
            <tbody>
              {items.map(r => (
                <tr key={r.ca_id}>
                  <td><span style={{ fontFamily: "var(--font-label)", fontSize: 11, color: "var(--accent)" }}>{r.ca_id}</span></td>
                  <td><span className={`tl-badge ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td>{r.triggered_by}</td>
                  <td>{r.assigned_to}</td>
                  <td style={{ fontFamily: "var(--font-label)", fontSize: 12 }}>{r.due_date}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 24 }}>No corrective actions recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   AI ASSISTANT SCREEN
══════════════════════════════════════════════ */
type ChatMsg = { id: string; role: "user"|"assistant"; text: string; data?: any; ms?: number; };

function AiScreen() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => {
    try { const s = sessionStorage.getItem("tl_chat_v2"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionStorage.setItem("tl_chat_v2", JSON.stringify(msgs));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const um: ChatMsg = { id: `${Date.now()}_u`, role: "user", text: query.trim() };
    setMsgs(m => [...m, um]); setQuery(""); setLoading(true);
    try {
      const r = await fetchAiQuery(um.text);
      setMsgs(m => [...m, { id: `${Date.now()}_a`, role: "assistant", text: r.text, data: r.data, ms: r.query_ms }]);
    } catch (ex: any) {
      setMsgs(m => [...m, { id: `${Date.now()}_e`, role: "assistant", text: `Error: ${ex?.message || "Unknown error"}. Please try again.` }]);
    } finally { setLoading(false); }
  }

  const suggestions = [t("ai.suggest.0"), t("ai.suggest.1"), t("ai.suggest.2"), t("ai.suggest.3")];

  return (
    <Shell page="AI">
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px - 56px)" }}>
        <div className="tl-page-header anim-up" style={{ flexShrink: 0, marginBottom: 18 }}>
          <div>
            <div className="tl-crumb">Intelligence</div>
            <div className="tl-page-title">AI Assistant</div>
          </div>
          {msgs.length > 0 && (
            <button className="tl-btn tl-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setMsgs([]); sessionStorage.removeItem("tl_chat_v2"); }}>
              Clear Chat
            </button>
          )}
        </div>

        <div className="tl-chat-area">
          {msgs.length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 60 }}>
              <div style={{ width: 64, height: 64, background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", margin: "0 auto 20px" }}>
                {Ic.ai}
              </div>
              <div style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>TraceLink Intelligence</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 28 }}>Ask about lots, machines, shifts, QC failures, or dispatch history.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {suggestions.map(s => (
                  <button key={s} className="tl-btn tl-btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setQuery(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map(m => (
              <div key={m.id} className={`tl-chat-bubble${m.role === "user" ? " user" : " assistant"}`}>
                <div className="tl-chat-bubble-inner">
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {m.text.split("**").map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p)}
                  </div>
                  {m.data?.length > 0 && (
                    <div className="tl-table-wrap" style={{ marginTop: 12 }}>
                      <table className="tl-table" style={{ fontSize: 12 }}>
                        <thead><tr>{Object.keys(m.data[0]).map(k => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
                        <tbody>{m.data.map((r: any, i: number) => <tr key={i}>{Object.values(r).map((v: any, j: number) => <td key={j}>{String(v)}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {m.ms && <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, fontFamily: "var(--font-label)" }}>{m.ms}ms</div>}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="tl-chat-bubble assistant">
              <div className="tl-chat-bubble-inner">
                <div style={{ display: "flex", gap: 4 }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animation: `pulse-dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="tl-chat-input-area">
          <form className="tl-chat-form" onSubmit={submit}>
            <input className="tl-chat-input" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t("ai.placeholder")} disabled={loading} />
            <button className="tl-btn tl-btn-primary" type="submit" disabled={loading || !query.trim()} style={{ padding: "12px 20px" }}>
              {Ic.send}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   DATA AUDIT SCREEN
══════════════════════════════════════════════ */
function AuditScreen() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchPipelineAudit().then(setData).catch(e => setErr(e.message)); }, []);

  const tiers = [
    { key: "rule1_90", label: "Rule 1 — Lot+Machine ±7d", color: "var(--green)" },
    { key: "rule2_75", label: "Rule 2 — Same Lot ±14d", color: "var(--accent)" },
    { key: "rule3_55", label: "Rule 3 — Same Lot ±30d", color: "var(--amber)" },
    { key: "rule4_30", label: "Rule 4 — Nearest Neighbor", color: "#ff8800" },
    { key: "rule5_0", label: "Rule 5 — Synthetic ID", color: "var(--red)" },
  ];

  return (
    <Shell page="AUDIT">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">Administration</div>
          <div className="tl-page-title">Pipeline Audit</div>
        </div>
      </div>
      {err && <div className="tl-alert tl-alert-danger anim-up">{err}</div>}
      {data && (
        <>
          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">Imputation Engine — 5-Tier Breakdown</div>
              <div className="tl-card-tag">Total inferred: {data.imputations?.total_inferred || 0}</div>
            </div>
            <div className="tl-audit-imputation">
              {tiers.map(({ key, label, color }) => (
                <div key={key} className="tl-imputation-tier">
                  <div className="tier-label">{label}</div>
                  <div className="tier-val" style={{ color }}>{data.imputations?.[key] || 0}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Temporal Warnings</div>
                <div className="tl-card-tag">QC before production</div>
              </div>
              {data.temporal_warnings?.length === 0 ? (
                <div className="tl-alert tl-alert-ok">{Ic.check} All batches pass temporal integrity.</div>
              ) : (
                <div className="tl-table-wrap">
                  <table className="tl-table">
                    <thead><tr><th>Batch</th><th>Production</th><th>QC Date</th></tr></thead>
                    <tbody>{data.temporal_warnings.map((w: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-label)" }}>{w.batch_id}</td>
                        <td style={{ fontFamily: "var(--font-label)" }}>{w.production_date}</td>
                        <td style={{ fontFamily: "var(--font-label)", color: "var(--red)" }}>{w.inspection_date}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="tl-card anim-up">
              <div className="tl-card-header">
                <div className="tl-card-title">Lot Anomalies</div>
                <div className="tl-card-tag">Complaints without QC fail</div>
              </div>
              {data.lot_anomalies?.length === 0 ? (
                <div className="tl-alert tl-alert-ok">{Ic.check} No lot anomalies detected.</div>
              ) : (
                <div className="tl-table-wrap">
                  <table className="tl-table">
                    <thead><tr><th>Lot Reference</th><th>Complaints</th></tr></thead>
                    <tbody>{data.lot_anomalies.map((w: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-label)" }}>{w.input_lot_ref}</td>
                        <td style={{ color: "var(--red)", fontFamily: "var(--font-label)", fontWeight: 600 }}>{w.complaint_count}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   ACCOUNT SCREEN
══════════════════════════════════════════════ */
function AccountScreen() {
  const { user, logout, deleteUserAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => { 
    fetchUsers().then(r => setUsers(r.users)).catch(() => {});
    fetchDataUsage().then(setUsage).catch(() => {});
  }, []);

  return (
    <Shell page="ACCOUNT">
      <div className="tl-page-header anim-up">
        <div>
          <div className="tl-crumb">SETTINGS</div>
          <div className="tl-page-title">Account</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Identity & Access */}
          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">IDENTITY &amp; ACCESS</div>
              <div className="tl-card-tag">ACTIVE</div>
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center", padding: "10px 0" }}>
              <div style={{ width: 64, height: 64, background: "var(--accent)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-headline)", fontSize: 26, fontWeight: 700, color: "#FFFFFF", flexShrink: 0 }}>
                {(user?.email?.[0] || "U").toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-headline)", fontSize: 20, fontWeight: 700 }}>{user?.email}</div>
                <div style={{ fontFamily: "var(--font-label)", fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", letterSpacing: "0.08em", marginTop: 4, background: "var(--bg-inset)", padding: "4px 10px", borderRadius: "var(--radius-sm)", display: "inline-block" }}>
                  UID: {user?.uid}
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 12 }}>
              <button className="tl-btn tl-btn-ghost" onClick={logout}>{Ic.logout} Sign Out</button>
              <button 
                className="tl-btn tl-btn-danger" 
                onClick={async () => {
                  if (window.confirm("Permanently delete your account and all associated data? This cannot be undone.")) {
                    try {
                      await deleteUserAccount();
                    } catch (e) {
                      alert("Failed to delete account. Please sign in again to verify your identity.");
                    }
                  }
                }}
              >
                {Ic.trash} Delete Account
              </button>
            </div>
          </div>

          {/* Appearance */}
          <div className="tl-card anim-up" style={{ animationDelay: "0.05s" }}>
            <div className="tl-card-header">
              <div className="tl-card-title">APPEARANCE</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {theme === "dark" ? Ic.moon : Ic.sun}
                <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500 }}>Theme</span>
              </div>
              <button
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                className="tl-toggle"
                data-active={theme === "dark"}
                aria-label="Toggle theme"
              >
                <span className="tl-toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Directory */}
          <div className="tl-card anim-up" style={{ animationDelay: "0.1s" }}>
            <div className="tl-card-header">
              <div className="tl-card-title">ORGANIZATION DIRECTORY</div>
              <div className="tl-card-tag">{users.length} MEMBERS</div>
            </div>
            <div className="tl-table-wrap">
              <table className="tl-table">
                <thead><tr><th>Email</th><th>Name</th><th>Role / Status</th></tr></thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.user_id || i}>
                      <td>{u.email}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{u.full_name || "—"}</td>
                      <td>
                        <span className="tl-badge tl-badge-pass" style={{ marginRight: 8 }}>ACTIVE</span>
                        {i === 0 && <span className="tl-badge tl-badge-info">ADMIN</span>}
                      </td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>Loading directory...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar — Usage */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="tl-card anim-up" style={{ animationDelay: "0.2s" }}>
            <div className="tl-card-header" style={{ marginBottom: 16 }}>
              <div className="tl-card-title">SYSTEM USAGE</div>
              <div className="tl-card-tag">CURRENT CYCLE</div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Rows Ingested</span>
                  <span style={{ fontFamily: "var(--font-label)", fontWeight: 600, color: "var(--accent)" }}>
                    {usage ? usage.rows_ingested.toLocaleString() : "..."} / 1M
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${usage ? Math.min((usage.rows_ingested / 1000000) * 100, 100) : 0}%`, height: "100%", background: "var(--accent)" }} />
                </div>
              </div>
              
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Storage Used</span>
                  <span style={{ fontFamily: "var(--font-label)", fontWeight: 600, color: "var(--purple)" }}>
                    {usage ? usage.db_size_mb.toFixed(1) : "..."} MB / 100 MB
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${usage ? Math.min((usage.db_size_mb / 100) * 100, 100) : 0}%`, height: "100%", background: "var(--purple)" }} />
                </div>
              </div>
              
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>API Calls</span>
                  <span style={{ fontFamily: "var(--font-label)", fontWeight: 600, color: "var(--green)" }}>
                    {usage ? usage.api_calls.toLocaleString() : "..."} / 50K
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${usage ? Math.min((usage.api_calls / 50000) * 100, 100) : 0}%`, height: "100%", background: "var(--green)" }} />
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 24, padding: "12px 16px", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Enterprise Plan. Contact your account manager to increase limits.
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ══════════════════════════════════════════════
   LANDING PAGE
══════════════════════════════════════════════ */
function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  const features = [
    { icon: Ic.trace, title: t("landing.feature.0.title"), desc: t("landing.feature.0.desc") },
    { icon: Ic.alert, title: t("landing.feature.1.title"), desc: t("landing.feature.1.desc") },
    { icon: Ic.operator, title: t("landing.feature.2.title"), desc: t("landing.feature.2.desc") },
    { icon: Ic.audit, title: t("landing.feature.3.title"), desc: t("landing.feature.3.desc") },
  ];

  return (
    <div className="tl-landing">
      <div className="tl-bg-grid" />
      <nav className="tl-landing-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ic.bolt}</div>
          <span style={{ fontFamily: "var(--font-headline)", fontSize: 20, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>TraceLink</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link to={isAuthenticated ? "/app/dashboard" : "/login"} className="tl-btn tl-btn-primary" style={{ textDecoration: "none" }}>
            {isAuthenticated ? "Open Dashboard" : t("login.mode.signin")}
          </Link>
        </div>
      </nav>

      <div className="tl-landing-hero">
        <div>
          <div className="tl-landing-badge">{Ic.bolt} Manufacturing Traceability Platform</div>
          <h1 className="tl-landing-h1">
            Trace Any<br /><span className="accent">Component</span><br />End-to-End
          </h1>
          <p className="tl-landing-p">
            Connect raw material lots to production batches, QC inspections, dispatch orders, and customer complaints — with full audit trail.
          </p>
          <div className="tl-landing-actions">
            <Link to={isAuthenticated ? "/app/trace" : "/login"} className="tl-btn tl-btn-primary" style={{ textDecoration: "none", padding: "12px 28px" }}>
              {Ic.trace} Start Tracing
            </Link>
            <Link to={isAuthenticated ? "/app/dashboard" : "/login"} className="tl-btn tl-btn-ghost" style={{ textDecoration: "none", padding: "12px 24px" }}>
              View Dashboard
            </Link>
          </div>
        </div>
        <div className="tl-feature-cards">
          {features.map(f => (
            <div key={f.title} className="tl-feature-card">
              <div className="tl-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ROUTE GUARD
══════════════════════════════════════════════ */
function Guard({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="tl-loading"><div className="tl-spinner" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DashRedirect() {
  const nav = useNavigate();
  useEffect(() => { nav("/app/dashboard", { replace: true }); }, [nav]);
  return null;
}

/* ══════════════════════════════════════════════
   APP ROUTES
══════════════════════════════════════════════ */
export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={isAuthenticated ? <Navigate to="/app/dashboard" replace /> : <LoginPageNew />} />
      <Route path="app" element={<Guard><DashRedirect /></Guard>} />
      <Route path="app/dashboard"  element={<Guard><DashboardScreen /></Guard>} />
      <Route path="app/trace"      element={<Guard><TraceScreen /></Guard>} />
      <Route path="app/alert"      element={<Guard><AlertScreen /></Guard>} />
      <Route path="app/operator"   element={<Guard><OperatorScreen /></Guard>} />
      <Route path="app/import"     element={<Guard><ImportScreen /></Guard>} />
      <Route path="app/review"     element={<Guard><ReviewScreen /></Guard>} />
      <Route path="app/compliance" element={<Guard><ComplianceScreen /></Guard>} />
      <Route path="app/ai"         element={<Guard><AiScreen /></Guard>} />
      <Route path="app/audit"      element={<Guard><AuditScreen /></Guard>} />
      <Route path="app/account"    element={<Guard><AccountScreen /></Guard>} />
    </Routes>
  );
}
