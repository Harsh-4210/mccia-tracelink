/**
 * TraceLink — Custom SVG Icon Library
 * Unified style: 24x24 viewBox, 1.75px stroke, rounded caps/joins
 */

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icons = {
  /* ── Navigation ── */
  dashboard: (
    <svg {...base}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),

  trace: (
    <svg {...base}>
      <circle cx="11" cy="11" r="8" />
      <path d="M16.5 16.5L21 21" />
      <circle cx="11" cy="11" r="3" />
    </svg>
  ),

  alert: (
    <svg {...base}>
      <path d="M12 2L2 20h20L12 2z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),

  operator: (
    <svg {...base}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 4V2" />
      <path d="M17 4V2" />
      <rect x="6" y="9" width="5" height="7" rx="0.5" />
      <rect x="13" y="6" width="5" height="10" rx="0.5" />
      <line x1="8.5" y1="13" x2="8.5" y2="13" />
      <line x1="15.5" y1="10" x2="15.5" y2="10" />
    </svg>
  ),

  ai: (
    <svg {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12a4 4 0 008 0 4 4 0 00-8 0" />
      <circle cx="9.5" cy="10.5" r="1.2" />
      <circle cx="14.5" cy="10.5" r="1.2" />
      <path d="M9.5 14c.7.5 1.5.8 2.5.8s1.8-.3 2.5-.8" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="16" cy="8" r="1" />
      <circle cx="8" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
    </svg>
  ),

  import: (
    <svg {...base}>
      <path d="M3 6h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
      <path d="M3 6l2-4h14l2 4" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <polyline points="9 15 12 18 15 15" />
    </svg>
  ),

  review: (
    <svg {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),

  compliance: (
    <svg {...base}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
      <circle cx="17" cy="17" r="3" />
      <path d="M17 15.5v1.5l1 .5" />
    </svg>
  ),

  audit: (
    <svg {...base}>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h8" />
      <path d="M7 16h6" />
      <circle cx="17" cy="14" r="3" />
      <path d="M17 12.5v1.5l1 .5" />
    </svg>
  ),

  account: (
    <svg {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  ),

  /* ── Actions ── */
  bolt: (
    <svg {...base}>
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="3.5" r="2" />
      <circle cx="19.36" cy="7.75" r="2" />
      <circle cx="19.36" cy="16.25" r="2" />
      <circle cx="12" cy="20.5" r="2" />
      <circle cx="4.64" cy="16.25" r="2" />
      <circle cx="4.64" cy="7.75" r="2" />
      <line x1="12" y1="12" x2="12" y2="5.5" />
      <line x1="12" y1="12" x2="17.36" y2="9.75" />
      <line x1="12" y1="12" x2="17.36" y2="14.25" />
      <line x1="12" y1="12" x2="12" y2="18.5" />
      <line x1="12" y1="12" x2="6.64" y2="14.25" />
      <line x1="12" y1="12" x2="6.64" y2="9.75" />
    </svg>
  ),

  search: (
    <svg {...base}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  ),

  bell: (
    <svg {...base}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),

  logout: (
    <svg {...base}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),

  sun: (
    <svg {...base}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v1.5" />
      <path d="M12 20.5V22" />
      <path d="M4.93 4.93l1.06 1.06" />
      <path d="M17.95 17.95l1.06 1.06" />
      <path d="M2 12h1.5" />
      <path d="M20.5 12H22" />
      <path d="M4.93 19.07l1.06-1.06" />
      <path d="M17.95 6.05l1.06-1.06" />
    </svg>
  ),

  moon: (
    <svg {...base}>
      <path d="M20 12.5A8.5 8.5 0 0111.5 4 7 7 0 1020 12.5z" />
    </svg>
  ),

  trash: (
    <svg {...base}>
      <polyline points="4 7 20 7" />
      <path d="M7 7V5a1 1 0 011-1h8a1 1 0 011 1v2" />
      <path d="M9 7v10a1 1 0 001 1h4a1 1 0 001-1V7" />
      <line x1="10" y1="11" x2="10" y2="16" />
      <line x1="14" y1="11" x2="14" y2="16" />
    </svg>
  ),

  check: (
    <svg {...base}>
      <polyline points="5 12 10 17 19 6" />
    </svg>
  ),

  close: (
    <svg {...base}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),

  doc: (
    <svg {...base}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),

  download: (
    <svg {...base}>
      <path d="M5 20h14" />
      <polyline points="12 4 12 16" />
      <polyline points="8 12 12 16 16 12" />
    </svg>
  ),

  upload: (
    <svg {...base}>
      <path d="M5 20h14" />
      <polyline points="12 16 12 4" />
      <polyline points="8 8 12 4 16 8" />
    </svg>
  ),

  send: (
    <svg {...base}>
      <line x1="20" y1="4" x2="12" y2="12" />
      <polygon points="20 4 13.5 20 10 13 3 9.5 20 4" />
    </svg>
  ),

  map: (
    <svg {...base}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 6 16 2 8 6 1 2" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="16" y1="2" x2="16" y2="22" />
    </svg>
  ),

  users: (
    <svg {...base}>
      <circle cx="8" cy="9" r="3" />
      <path d="M2 20a6 6 0 0112 0" />
      <circle cx="16" cy="9" r="2" />
      <path d="M20 20a2 2 0 00-2-2h-1" />
    </svg>
  ),

  settings: (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),

  database: (
    <svg {...base}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  ),

  palette: (
    <svg {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 010 20" />
      <path d="M12 2c-5.5 0-10 4.5-10 10s4.5 10 10 10" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),

  chevronRight: (
    <svg {...base}>
      <polyline points="9 5 16 12 9 19" />
    </svg>
  ),

  chevronLeft: (
    <svg {...base}>
      <polyline points="15 5 8 12 15 19" />
    </svg>
  ),

  panelLeft: (
    <svg {...base}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="6 9 3 12 6 15" />
    </svg>
  ),

  panelRight: (
    <svg {...base}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="6 9 9 12 6 15" />
    </svg>
  ),

  plus: (
    <svg {...base}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),

  minus: (
    <svg {...base}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),

  sparkle: (
    <svg {...base}>
      <polygon points="12 2 13.5 8.5 20 10 13.5 11.5 12 18 10.5 11.5 4 10 10.5 8.5" />
    </svg>
  ),
};
