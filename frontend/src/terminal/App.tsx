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
import "./styles.css";

/* ══════════════════════════════════════════════
   SVG ICON LIBRARY
══════════════════════════════════════════════ */
const sp = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const Ic = {
  trace:      <svg {...sp}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  alert:      <svg {...sp}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  operator:   <svg {...sp}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  dashboard:  <svg {...sp}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  import:     <svg {...sp}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  review:     <svg {...sp}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  compliance: <svg {...sp}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  admin:      <svg {...sp}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  ai:         <svg {...sp}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  audit:      <svg {...sp}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  account:    <svg {...sp}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  guide:      <svg {...sp}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  logout:     <svg {...sp}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  bolt:       <svg {...sp}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  chevron:    <svg {...sp}><polyline points="9 18 15 12 9 6"/></svg>,
  bell:       <svg {...sp}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  sun:        <svg {...sp}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>,
  moon:       <svg {...sp}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  trash:      <svg {...sp}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  check:      <svg {...sp}><polyline points="20 6 9 17 4 12"/></svg>,
  x:          <svg {...sp}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  close:      <svg {...sp}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  doc:        <svg {...sp}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  download:   <svg {...sp}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  send:       <svg {...sp}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  map:        <svg {...sp}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  upload2:    <svg {...sp}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
};

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
  const [theme, setTheme] = useState(() => localStorage.getItem("tl_theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tl_theme", theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(t => t === "dark" ? "light" : "dark") };
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
const GUIDE_PAGES = [
  { key: "trace", title: "Dispatch Trace", desc: "Enter an order ID to trace the full chain: batch, QC, raw material, supplier." },
  { key: "alert", title: "Lot Alert", desc: "Identify every dispatch order affected by a suspect raw material lot." },
  { key: "operator", title: "Batch Entry", desc: "Log production batches from the shop floor. Works fully offline." },
  { key: "dashboard", title: "Dashboard", desc: "Factory-wide metrics: pass rates, shift intelligence, top failing machines." },
  { key: "import", title: "Data Import", desc: "Bulk upload CSV files for production, QC, dispatch, suppliers, and complaints." },
  { key: "review", title: "Link Review", desc: "Approve or reject automatically inferred trace links." },
  { key: "compliance", title: "Compliance", desc: "Track corrective actions (CAPA/8D) for quality incidents." },
  { key: "admin", title: "Admin & Audit", desc: "Audit logs, pipeline health, and imputation diagnostics." },
];

function Guide({ onClose }: { onClose: () => void }) {
  return (
    <div className="tl-guide-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tl-guide-card">
        <div className="tl-crumb" style={{ marginBottom: 8 }}>System Guide</div>
        <div className="tl-guide-title">Welcome to TraceLink</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 4 }}>
          End-to-end manufacturing traceability from raw lot to customer.
        </p>
        <div className="tl-guide-items stagger">
          {GUIDE_PAGES.map(p => (
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
  const sevColor = (s?: string) => s === "danger" ? "var(--red)" : s === "warn" ? "var(--amber)" : "var(--cyan)";
  return (
    <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", zIndex: 50, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "0.03em" }}>Notifications</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            {notifs.items.length} total · {notifs.unread} unread
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {notifs.items.length > 0 && <button className="tl-btn tl-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={notifs.clear}>Clear</button>}
          <button className="tl-icon-btn" onClick={onClose}>{Ic.x}</button>
        </div>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", padding: "10px" }}>
        {notifs.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px", color: "var(--text-tertiary)", fontSize: 13 }}>No notifications yet. Trace or alert events will appear here.</div>
        ) : notifs.items.map(n => (
          <div key={n.id} style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "var(--bg-deep)", border: `1px solid var(--border-subtle)`, marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: sevColor(n.sev), display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sevColor(n.sev), display: "inline-block" }} />
              {n.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{n.body}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>{new Date(n.at).toLocaleString()}</div>
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
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const notifs = useNotifs();
  const online = useOnline();
  const [notifOpen, setNotifOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("tl_guide_v2"));

  function closeGuide() { setShowGuide(false); localStorage.setItem("tl_guide_v2", "1"); }

  const navGroups = [
    {
      label: "Operations",
      items: [
        { to: "/app/dashboard", icon: Ic.dashboard, label: t("nav.dashboard") },
        { to: "/app/trace", icon: Ic.trace, label: t("nav.trace") },
        { to: "/app/alert", icon: Ic.alert, label: t("nav.alert") },
        { to: "/app/operator", icon: Ic.operator, label: t("nav.operator") },
        { to: "/app/ai", icon: Ic.ai, label: "AI Assistant" },
      ]
    },
    {
      label: "Data",
      items: [
        { to: "/app/import", icon: Ic.import, label: t("nav.import") },
        { to: "/app/review", icon: Ic.review, label: t("nav.review") },
        { to: "/app/compliance", icon: Ic.compliance, label: t("nav.compliance") },
      ]
    },
    {
      label: "System",
      items: [
        { to: "/app/audit", icon: Ic.audit, label: "Data Audit" },
        { to: "/app/account", icon: Ic.account, label: "Account" },
      ]
    }
  ];

  return (
    <div className="tl-app">
      <div className="tl-bg-grid" />
      <aside className="tl-sidebar">
        <div className="tl-brand">
          <div className="tl-brand-mark">{Ic.bolt}</div>
          <div>
            <div className="tl-brand-name">TraceLink</div>
            <div className="tl-brand-ver">PRECISION INDUSTRIAL v2</div>
          </div>
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
          <div style={{ marginBottom: 8 }}>
            <div className="tl-statusline" style={{ padding: "6px 12px", gap: 8 }}>
              <div className="tl-status-dot" style={{ background: online ? "var(--green)" : "var(--amber)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: online ? "var(--text-secondary)" : "var(--amber)" }}>
                {online ? "NETWORK STABLE" : "OFFLINE MODE"}
              </span>
            </div>
          </div>
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

      <main className="tl-main">
        <header className="tl-topbar">
          <div className="tl-search">
            {Ic.trace}
            <input type="text" placeholder="Search orders, lots, machines…" />
          </div>
          <div className="tl-topbar-actions">
            <div className="tl-lang-group">
              {LANGS.map(l => (
                <button key={l} className={`tl-lang-btn${lang === l ? " active" : ""}`} onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
              ))}
            </div>
            <button className="tl-icon-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === "dark" ? Ic.sun : Ic.moon}
            </button>
            <button className="tl-icon-btn" onClick={() => setShowGuide(true)} title="Help Guide">?</button>
            <div style={{ position: "relative" }}>
              <button className={`tl-icon-btn${notifOpen ? " active" : ""}`} onClick={() => { setNotifOpen(o => !o); if (!notifOpen) notifs.markRead(); }}>
                {Ic.bell}
                {notifs.unread > 0 && <span className="tl-notif-dot">{notifs.unread > 9 ? "9+" : notifs.unread}</span>}
              </button>
              {notifOpen && <NotifPanel notifs={notifs} onClose={() => setNotifOpen(false)} />}
            </div>
            <button className="tl-btn tl-btn-ghost" onClick={logout} style={{ padding: "7px 14px", fontSize: 12 }}>
              {Ic.logout} Sign Out
            </button>
          </div>
        </header>
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
    <div className="tl-metric anim-up" style={{ "--metric-color": color || "var(--cyan)" } as any}>
      <div className="tl-metric-label">{label}</div>
      <div className="tl-metric-value">{value}</div>
      {sub && <div className="tl-metric-sub">{sub}</div>}
      {icon && <div className="tl-metric-icon" style={{ color: color || "var(--cyan)" }}>{icon}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   PROGRESS RING
══════════════════════════════════════════════ */
function Ring({ pct, color = "var(--cyan)", size = 80 }: { pct: number; color?: string; size?: number }) {
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
    <div className="tl-login-root" data-theme={theme || "dark"}>
      <div className="tl-bg-grid" />

      {/* LEFT: Hero */}
      <div className="tl-login-left">
        <div className="tl-login-brand">
          <div style={{ width: 44, height: 44, background: "var(--cyan)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ic.bolt}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>TraceLink</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.12em" }}>PRECISION INDUSTRIAL v2</div>
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
            { n: "30s", l: "Avg Trace Time" },
            { n: "100%", l: "Audit Coverage" },
            { n: "5-Tier", l: "Imputation Engine" },
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
            {mode === "login" ? "System Authentication" : "Create Account"}
          </div>
          <div className="tl-login-card-title">{mode === "login" ? "Sign In" : "Register"}</div>
          <div className="tl-login-card-sub">
            {mode === "login" ? "Access your operations console." : "Create your secure workspace."}
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
              {loading ? "Processing…" : mode === "login" ? "Sign In" : "Create Account"}
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
            {mode === "login" ? "No account? " : "Already registered? "}
            <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setErr(""); }}>
              {mode === "login" ? "Register" : "Sign In"}
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
          {metrics && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", alignSelf: "flex-end", paddingBottom: 4 }}>
            Last refreshed {new Date().toLocaleTimeString()}
          </div>}
        </div>
      </div>

      {err && <div className="tl-alert tl-alert-danger anim-up">{Ic.alert} {err}</div>}

      {isEmpty && (
        <div className="tl-card anim-up" style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ width: 64, height: 64, background: "var(--bg-deep)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--cyan)" }}>
            {Ic.import}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Empty Workspace</div>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Import your first CSV files to populate metrics and begin tracing.</p>
          <Link to="/app/import" className="tl-btn tl-btn-primary" style={{ textDecoration: "none", padding: "11px 28px" }}>
            {Ic.upload2} Import Data
          </Link>
        </div>
      )}

      {metrics && !isEmpty && (
        <>
          {/* Metric Strip */}
          <div className="tl-metrics stagger">
            <Metric label="Production Batches" value={metrics.batch_count.toLocaleString()} icon={Ic.operator} />
            <Metric label="QC Pass Rate" value={`${metrics.pass_rate}%`} color="var(--green)" icon={Ic.check} />
            <Metric label="Open Complaints" value={metrics.open_complaints} color={metrics.open_complaints > 0 ? "var(--red)" : "var(--green)"} icon={Ic.alert} />
            <Metric label="Unresolved Links" value={metrics.unresolved_links} color={metrics.unresolved_links > 0 ? "var(--amber)" : "var(--green)"} icon={Ic.review} />
            <Metric label="Open CAPAs" value={metrics.open_corrective_actions} color="var(--purple)" icon={Ic.compliance} />
            <Metric label="Pending Entries" value={metrics.pending_operator_entries} icon={Ic.operator} />
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
                        <div className="tl-shift-bar-fill" style={{ width: `${pct}%`, "--bar-color": isWorst ? "var(--red)" : "var(--cyan)" } as any} />
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
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
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
                          <td style={{ fontFamily: "var(--font-mono)" }}>{d.inspection_date}</td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{d.total}</td>
                          <td style={{ color: d.failures > 0 ? "var(--red)" : "var(--green)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{d.failures}</td>
                          <td style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>{d.avg_defect_rate}%</td>
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
                        <td style={{ color: "var(--red)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.fail_count}</td>
                        <td style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>{m.avg_defect_rate}%</td>
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
                        <td style={{ fontFamily: "var(--font-mono)" }}>{s.lots_supplied}</td>
                        <td style={{ color: s.complaint_count > 0 ? "var(--red)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontWeight: s.complaint_count > 0 ? 600 : 400 }}>{s.complaint_count}</td>
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
                <Link to="/app/import" style={{ color: "var(--cyan)", fontSize: 12, textDecoration: "none", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>View All →</Link>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {metrics.recent_imports.map(r => (
                  <div key={r.import_id} style={{ padding: "10px 16px", background: "var(--bg-deep)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)", fontSize: 10, marginBottom: 3 }}>{r.import_id}</div>
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
                placeholder="Enter dispatch order ID (e.g. D-1847)" onKeyDown={e => e.key === "Enter" && run()} />
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
                  <div key={b.batch_id} style={{ padding: "16px", background: "var(--bg-deep)", border: `1px solid ${b.qc?.pass_fail === "FAIL" ? "rgba(255,59,92,0.3)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-sm)", marginBottom: i < result.batches.length - 1 ? 10 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{b.batch_id}</span>
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
                        { k: "Machine", v: b.production?.machine_id || "—" },
                        { k: "Shift", v: b.production?.shift || "—" },
                        { k: "Supplier", v: b.raw_material?.supplier?.supplier_name || "—" },
                        { k: "Material", v: b.raw_material?.material_type || "—" },
                        { k: "Defect Rate", v: b.qc?.defect_rate_pct != null ? `${b.qc.defect_rate_pct}%` : "—" },
                      ].map(r => (
                        <div key={r.k} style={{ padding: "8px 10px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 3 }}>{r.k}</div>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Supply Chain Visualization</div>
            {result && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)" }}>{result.batches.length} batch{result.batches.length !== 1 ? "es" : ""} linked</div>}
          </div>
          <div className="tl-chain-map" style={{ paddingTop: 58 }}>
            {!result ? (
              <div className="tl-chain-empty">
                <div className="tl-chain-empty-icon" style={{ color: "var(--cyan)" }}>{Ic.map}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Chain Map</div>
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
                <div style={{ padding: "14px 28px", background: "var(--bg-elevated)", border: "2px solid var(--cyan)", borderRadius: "var(--radius-md)", textAlign: "center", marginBottom: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 3 }}>Distribution</div>
                  <div style={{ fontWeight: 600 }}>Dispatch {result.dispatch.dispatch_date}</div>
                </div>
                <div className="tl-chain-connector" style={{ background: "linear-gradient(to bottom, var(--cyan), var(--border-default))" }} />
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
                          { k: "Machine", v: b.production?.machine_id },
                          { k: "Shift", v: b.production?.shift },
                          { k: "Lot", v: b.production?.input_lot_ref },
                          { k: "Supplier", v: b.raw_material?.supplier?.supplier_name },
                        ].map(r => r.v ? (
                          <div key={r.k} className="tl-batch-row">
                            <span className="tl-batch-key">{r.k}</span>
                            <span className="tl-batch-val">{r.v}</span>
                          </div>
                        ) : null)}
                      </div>
                      <div style={{ height: 28, width: 1, background: "var(--border-subtle)", borderLeft: "1px dashed var(--border-default)", margin: "0 auto" }} />
                      <div style={{ padding: "8px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Raw Supplier</div>
                        {b.raw_material?.supplier?.supplier_name || "No link"}
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
            placeholder="Enter lot number (e.g. LOT-2023-114)" onKeyDown={e => e.key === "Enter" && run()} />
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
            <Metric label="Failed Batches" value={result.summary.failed_batch_count || 0} color="var(--red)" />
            <Metric label="Financial Exposure" value={`₹ ${(result.summary.financial_exposure || 0).toLocaleString()}`} color="var(--amber)" />
            <Metric label="Escaped Shipments" value={result.summary.escaped_shipments_count || 0} color={( result.summary.escaped_shipments_count || 0) > 0 ? "var(--red)" : "var(--green)"} />
            <Metric label="Post-QC Dispatches" value={result.summary.post_qc_dispatches_count || 0} color="var(--amber)" />
            <Metric label="Quarantine Needed" value={result.summary.quarantine_recommendations?.length || 0} color="var(--purple)" />
          </div>

          {result.summary.escaped_shipments_count && result.summary.escaped_shipments_count > 0 ? (
            <div className="tl-alert tl-alert-danger anim-up">
              {Ic.alert} <strong>{result.summary.escaped_shipments_count} escaped shipment{result.summary.escaped_shipments_count > 1 ? "s" : ""}</strong> — Failed batches dispatched before QC inspection. Immediate recall action required.
            </div>
          ) : null}

          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">Affected Dispatch Orders</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{result.affected_dispatch_orders.length} orders · {result.query_ms}ms</div>
            </div>
            <div className="tl-table-wrap">
              <table className="tl-table">
                <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Batch</th><th>QC</th></tr></thead>
                <tbody>
                  {result.affected_dispatch_orders.map(r => (
                    <tr key={`${r.order_id}-${r.batch_id}`}>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)" }}>{r.order_id}</td>
                      <td>{r.customer_id}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{r.dispatch_date}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.batch_id}</td>
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
    if (!entry.raw_lot || !entry.operator_id || !entry.units_produced) { setMsg("Fill all required fields."); return; }
    if (!online) {
      await enqueueEntry(entry); const q = await getQueuedEntries(); setQueued(q.length);
      setMsg("Saved offline — will sync on reconnect."); (e.target as HTMLFormElement).reset(); return;
    }
    const r = await postBatch(entry);
    setMsg(r.ok ? "Batch saved successfully." : "Save failed.");
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
    if (!file) { setMsg("Please select a CSV file first."); return; }
    
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
                    <div style={{ color: "var(--cyan)" }}>{Ic.doc}</div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <button type="button" className="tl-btn tl-btn-ghost" onClick={(e) => { e.stopPropagation(); setFile(null); }}>{Ic.close}</button>
                  </>
                ) : (
                  <>
                    <div style={{ color: "var(--text-tertiary)" }}>{Ic.upload2}</div>
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
                <>{Ic.upload2} Upload File</>
              )}
            </button>
            {uploading && (
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, color: "var(--text-secondary)" }}>
                  <span>Uploading to ingest pipeline...</span>
                  <span>{progress}%</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-inset)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "var(--cyan)", transition: "width 0.2s" }} />
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
            <Metric label="Total Rows" value={report.row_count} color="var(--text)" />
            <Metric label="Valid Rows" value={report.valid_rows} color="var(--green)" />
            <Metric label="Errors" value={report.error_count} color={report.error_count > 0 ? "var(--red)" : "var(--text)"} />
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
                        <td style={{ fontFamily: "var(--font-mono)" }}>{e.row}</td>
                        <td style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>{e.field || "—"}</td>
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
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)" }}>{r.import_id}</span></td>
                  <td>{r.filename}</td>
                  <td><span className="tl-badge tl-badge-info">{r.file_type}</span></td>
                  <td><span className={`tl-badge ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{r.row_count}</td>
                  <td style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{r.uploaded_at?.slice(0,16)}</td>
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{links.filter(l => l.review_status === "pending").length} pending</span>
        </div>
      </div>

      {msg && <div className="tl-alert tl-alert-info anim-up">{msg}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((l, i) => (
          <div key={l.production_id} className="tl-review-item anim-up" style={{ animationDelay: `${i * 40}ms` }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{l.batch_id}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{l.production_date}</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className="tl-badge tl-badge-purple">Inferred Lot</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{l.input_lot_ref}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", marginBottom: 8 }}>"{l.inference_reason}"</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="tl-confidence-bar" style={{ flex: 1 }}>
                  <div className="tl-confidence-fill" style={{ width: `${Math.round(l.inference_confidence * 100)}%` }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)", fontWeight: 600 }}>
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
                  <button className="tl-btn tl-btn-ghost" style={{ padding: "7px 16px", color: "var(--red)" }} onClick={() => act(l.production_id, "reject")}>{Ic.x} Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!links.length && (
          <div className="tl-card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ color: "var(--green)", marginBottom: 10 }}>{Ic.check}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>All Clear</div>
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
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
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)" }}>{r.ca_id}</span></td>
                  <td><span className={`tl-badge ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td>{r.triggered_by}</td>
                  <td>{r.assigned_to}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.due_date}</td>
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

  const suggestions = ["What is the worst shift?", "Show failed batches", "Supplier scorecard", "System overview"];

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
              <div style={{ width: 64, height: 64, background: "var(--cyan-dim)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan)", margin: "0 auto 20px" }}>
                {Ic.ai}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>TraceLink Intelligence</div>
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
                  {m.ms && <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>{m.ms}ms</div>}
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
              placeholder="Ask about lots, machines, shifts, failures…" disabled={loading} />
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
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchPipelineAudit().then(setData).catch(e => setErr(e.message)); }, []);

  const tiers = [
    { key: "rule1_90", label: "Rule 1 — Lot+Machine ±7d", color: "var(--green)" },
    { key: "rule2_75", label: "Rule 2 — Same Lot ±14d", color: "var(--cyan)" },
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
                        <td style={{ fontFamily: "var(--font-mono)" }}>{w.batch_id}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{w.production_date}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{w.inspection_date}</td>
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
                        <td style={{ fontFamily: "var(--font-mono)" }}>{w.input_lot_ref}</td>
                        <td style={{ color: "var(--red)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{w.complaint_count}</td>
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
          <div className="tl-crumb">Settings</div>
          <div className="tl-page-title">Enterprise Account</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* User Identity Card */}
          <div className="tl-card anim-up">
            <div className="tl-card-header">
              <div className="tl-card-title">Identity & Access</div>
              <div className="tl-card-tag">Active</div>
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center", padding: "10px 0" }}>
              <div style={{ width: 72, height: 72, background: "linear-gradient(135deg, var(--cyan), var(--blue))", borderRadius: "var(--radius-full)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: "0 8px 16px rgba(0, 240, 255, 0.2)" }}>
                {(user?.email?.[0] || "U").toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>{user?.email}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.08em", marginTop: 4, background: "var(--bg-inset)", padding: "4px 8px", borderRadius: "var(--radius-sm)", display: "inline-block" }}>
                  UID: {user?.uid}
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 12 }}>
              <button className="tl-btn tl-btn-secondary" onClick={logout}>{Ic.logout} Sign Out</button>
              <button 
                className="tl-btn tl-btn-danger" 
                onClick={async () => {
                  if (window.confirm("Are you sure you want to completely delete your account? This will remove all associated data and cannot be undone.")) {
                    try {
                      await deleteUserAccount();
                    } catch (e) {
                      alert("Failed to delete account. Please try logging in again first to verify your identity.");
                    }
                  }
                }}
              >
                {Ic.trash} Delete Account
              </button>
            </div>
          </div>

          {/* Directory */}
          <div className="tl-card anim-up" style={{ animationDelay: "0.1s" }}>
            <div className="tl-card-header">
              <div className="tl-card-title">Organization Directory</div>
              <div className="tl-card-tag">{users.length} members</div>
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
                        <span className="tl-badge tl-badge-pass" style={{ marginRight: 8 }}>Active</span>
                        {i === 0 && <span className="tl-badge tl-badge-info">Admin</span>}
                      </td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>Loading directory...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Usage Metrics */}
          <div className="tl-card anim-up" style={{ animationDelay: "0.2s" }}>
            <div className="tl-card-header" style={{ marginBottom: 16 }}>
              <div className="tl-card-title">System Usage</div>
              <div className="tl-card-tag">Current Billing Cycle</div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Rows Ingested</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)" }}>
                    {usage ? usage.rows_ingested.toLocaleString() : "..."} / 1M
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${usage ? Math.min((usage.rows_ingested / 1000000) * 100, 100) : 0}%`, height: "100%", background: "var(--cyan)" }} />
                </div>
              </div>
              
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Storage Used</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--purple)" }}>
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
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
                    {usage ? usage.api_calls.toLocaleString() : "..."} / 50K
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${usage ? Math.min((usage.api_calls / 50000) * 100, 100) : 0}%`, height: "100%", background: "var(--amber)" }} />
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 24, padding: "12px 16px", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Enterprise Plan limits apply. Contact your account manager to increase ingestion throughput or storage capacity.
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
  const { theme, toggleTheme } = useTheme();

  const features = [
    { icon: Ic.trace, title: "End-to-End Trace", desc: "From raw lot to customer shipment in under 30 seconds." },
    { icon: Ic.alert, title: "Blast Radius Analysis", desc: "Identify all affected orders for any suspect lot instantly." },
    { icon: Ic.operator, title: "Offline-First Entry", desc: "Shop floor data entry that works without network." },
    { icon: Ic.audit, title: "5-Tier Imputation", desc: "Automatically fills missing batch IDs with confidence scoring." },
  ];

  return (
    <div className="tl-landing" data-theme={theme || "dark"}>
      <div className="tl-bg-grid" />
      <nav className="tl-landing-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "var(--cyan)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ic.bolt}</div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>TraceLink</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="tl-icon-btn" onClick={toggleTheme}>{theme === "dark" ? Ic.sun : Ic.moon}</button>
          <Link to={isAuthenticated ? "/app/dashboard" : "/login"} className="tl-btn tl-btn-primary" style={{ textDecoration: "none" }}>
            {isAuthenticated ? "Open Dashboard" : "Sign In"}
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
