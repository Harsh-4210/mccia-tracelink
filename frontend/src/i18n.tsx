/**
 * Internationalization (i18n) — English + Hindi
 *
 * Usage:
 *   import { useI18n, I18nProvider } from "./i18n";
 *   const { t, lang, setLang } = useI18n();
 *   <p>{t("nav.dashboard")}</p>
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Lang = "en" | "hi" | "mr";
export const LANGS: Lang[] = ["en", "hi", "mr"];
export const LANG_LABELS: Record<Lang, string> = { en: "EN", hi: "HI", mr: "MR" };

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // ── App chrome ────────────────────────────
    "app.title": "TraceLink",
    "app.subtitle": "Manufacturing Traceability System",
    "app.tagline": "Track any dispatch from floor to customer in 30 seconds",
    "lang.toggle": "EN",

    // ── Navigation ────────────────────────────
    "nav.trace": "Trace",
    "nav.alert": "Alert",
    "nav.operator": "Operator",
    "nav.dashboard": "Dashboard",
    "nav.import": "Import",
    "nav.review": "Review",
    "nav.compliance": "Compliance",
    "nav.admin": "Admin",
    "nav.logout": "Logout",
    "nav.guide": "Help Guide",

    // ── Page descriptions (for guide) ─────────
    "desc.trace": "Enter a Dispatch Order ID to trace every batch, raw material, supplier, and QC result linked to that shipment.",
    "desc.alert": "Enter a raw material Lot Number to find every dispatch order that used that material — critical for recall response.",
    "desc.operator": "Log new production batches from the shop floor. Works offline — data syncs automatically when you reconnect.",
    "desc.dashboard": "View factory performance at a glance: total batches, pass rates, defect trends, and machine utilization.",
    "desc.import": "Upload CSV files to bulk-import production batches, QC inspections, or dispatch records into the database.",
    "desc.review": "Review and approve/reject automatically inferred trace links that need human verification.",
    "desc.compliance": "Create and manage corrective actions (CAPA/8D) for quality incidents and customer complaints.",
    "desc.admin": "View audit logs, manage users and roles, and monitor system health.",

    // ── Trace page ────────────────────────────
    "trace.title": "Dispatch Trace",
    "trace.subtitle": "Enter a Dispatch Order ID to trace the complete manufacturing chain",
    "trace.input": "Order ID (e.g. D-1000)",
    "trace.button": "Trace",
    "trace.result_title": "Trace Result",
    "trace.batch_id": "Batch ID",
    "trace.raw_lot": "Raw Material Lot",
    "trace.supplier": "Supplier",
    "trace.machine": "Machine",
    "trace.qc_result": "QC Result",
    "trace.defect_rate": "Defect Rate",
    "trace.confidence": "Link Confidence",
    "trace.export": "Export CSV",
    "trace.no_batches": "No batches found for this order.",
    "trace.timing": "Query completed in {ms}ms",

    // ── Alert page ────────────────────────────
    "alert.title": "Lot Alert",
    "alert.subtitle": "Find all dispatch orders affected by a specific raw material lot",
    "alert.input": "Lot Number (e.g. LOT-0001)",
    "alert.button": "Search",
    "alert.result_title": "Affected Orders",
    "alert.export": "Export CSV",

    // ── Operator page ─────────────────────────
    "op.title": "Batch Entry",
    "op.subtitle": "Log a new production batch from the shop floor",
    "op.batch_id": "Batch ID",
    "op.machine_id": "Machine",
    "op.shift": "Shift",
    "op.operator_name": "Operator Name",
    "op.input_lot": "Input Raw Lot",
    "op.submit": "Submit Entry",
    "op.success": "Batch entry submitted successfully!",
    "op.recent": "Recent Entries",
    "op.offline_note": "📡 You're offline. Entries are saved locally and will sync when you reconnect.",
    "op.sync_status": "Sync Status",
    "op.pending": "Pending",
    "op.synced": "Synced",

    // ── Dashboard ─────────────────────────────
    "dash.title": "Dashboard",
    "dash.subtitle": "Factory performance overview",
    "dash.batches": "Total Batches",
    "dash.pass_rate": "Pass Rate (%)",
    "dash.dispatches": "Dispatch Orders",
    "dash.avg_defect": "Avg Defect Rate",
    "dash.suppliers": "Active Suppliers",
    "dash.unresolved": "Unresolved Links",

    // ── Import ────────────────────────────────
    "import.title": "Data Import",
    "import.subtitle": "Upload CSV files to bulk-import records into the database",
    "import.dropzone": "Drag & drop a CSV file here, or click to browse",
    "import.type": "Import Type",
    "import.type.production": "Production Batches",
    "import.type.qc": "QC Inspections",
    "import.type.dispatch": "Dispatch Orders",
    "import.upload": "Upload & Import",
    "import.result": "Import Result",
    "import.rows_imported": "Rows imported",
    "import.errors": "Errors",

    // ── Review ────────────────────────────────
    "review.title": "Link Review Queue",
    "review.subtitle": "Approve or reject automatically inferred trace links",
    "review.approve": "Approve",
    "review.reject": "Reject",
    "review.total": "Total unresolved",
    "review.empty": "No unresolved links — all clear! ✅",
    "review.confidence": "Confidence",

    // ── Compliance ────────────────────────────
    "comp.title": "Compliance — Corrective Actions",
    "comp.subtitle": "Track and manage quality incident responses (CAPA / 8D)",
    "comp.create": "Create New Action",
    "comp.type": "Action Type",
    "comp.type.capa": "CAPA",
    "comp.type.8d": "8D",
    "comp.status": "Status",
    "comp.status.open": "Open",
    "comp.status.closed": "Closed",
    "comp.desc": "Description",
    "comp.empty": "No corrective actions yet.",

    // ── Admin ─────────────────────────────────
    "admin.title": "Admin Console",
    "admin.subtitle": "Audit logs, user management, and system health",
    "admin.audit": "Audit Events",
    "admin.users": "Users",
    "admin.health": "System Health",
    "admin.role": "Role",

    // ── Onboarding / Guide ────────────────────
    "guide.title": "Welcome to TraceLink!",
    "guide.intro": "TraceLink helps you track any product from factory floor to customer. Here's what each section does:",
    "guide.close": "Got it, let's go!",
    "guide.step": "Step {n}",
    "guide.tip": "💡 Tip",
    "guide.tip.text": "Click the Help Guide button in the sidebar any time to see this again.",

    // ── Common ────────────────────────────────
    "common.loading": "Loading…",
    "common.error": "Something went wrong",
    "common.retry": "Retry",
    "common.back": "Back",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.search": "Search",
    "common.nodata": "No data available",
    "common.role": "Role",
    "common.email": "Email",
    "common.password": "Password",

    // ── Login ─────────────────────────────────
    "login.title": "Sign In",
    "login.subtitle": "Enter your credentials to access the system",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign In",
    "login.google": "Sign in with Google",
    "login.register_link": "Need an account? Register",
    "login.login_link": "Already have an account? Sign In",
    "login.register_title": "Create Account",
    "login.register_submit": "Create Account",
    "login.processing": "Processing…",

    // ── Page-level (Trace) ────────────────
    "trace.crumb": "// MODULE 01 / DISPATCH TRACE",
    "trace.heading": "Trace.dispatch",
    "trace.permalink": "PERMALINK ENABLED",
    "trace.panel_key": "[ INPUT ]",
    "trace.resolve": "Resolve a dispatch order to its upstream chain",
    "trace.execute": "EXECUTE",
    "trace.tracing": "TRACING...",
    // ── Page-level (Alert) ────────────────
    "alert.crumb": "// MODULE 02 / LOT FANOUT",
    "alert.heading": "Alert.lot",
    "alert.export_ready": "EXPORT READY",
    "alert.panel_key": "[ FANOUT ]",
    "alert.resolve": "Find every dispatch order touched by a suspect raw lot",
    "alert.scanning": "SCANNING...",
    "alert.simulate": "SIMULATE",
    // ── Page-level (Operator) ────────────
    "op.crumb": "// MODULE 03 / OPERATOR INPUT",
    "op.heading": "Entry.batch",
    "op.panel_key": "[ FORM ]",
    "op.date": "Date",
    "op.lot": "Raw lot",
    "op.machine": "Machine",
    "op.shift_label": "Shift",
    "op.operator": "Operator",
    "op.units": "Units produced",
    "op.notes": "QC notes",
    "op.save": "SAVE BATCH",
    "op.queued": "QUEUED",
    "op.sync_now": "SYNC NOW",
    "op.online": "ONLINE",
    "op.offline": "OFFLINE",
    // ── Page-level (Dashboard) ───────────
    "dash.crumb": "// MODULE 04 / QUALITY METRICS",
    "dash.heading": "Dashboard.metrics",
    "dash.qc_pass": "QC Pass Rate",
    "dash.open_ca": "Open CA",
    "dash.top_fail": "Top failing machines",
    "dash.machine": "Machine",
    "dash.failures": "Failures",
    "dash.avg_defect_col": "Avg Defect",
    "dash.supplier_card": "Supplier scorecard",
    "dash.supplier_col": "Supplier",
    "dash.status": "Status",
    "dash.lots": "Lots",
    "dash.complaints": "Complaints",
    // ── Page-level (Import) ─────────────
    "import.crumb": "// MODULE 05 / SOURCE FILES",
    "import.heading": "Import.csv",
    "import.file_type": "File type",
    "import.csv_file": "CSV file",
    "import.upload_btn": "UPLOAD AND VALIDATE",
    "import.id": "ID",
    "import.file": "File",
    "import.type_col": "Type",
    "import.status": "Status",
    "import.rows": "Rows",
    "import.uploaded": "Uploaded",
    // ── Page-level (Review) ─────────────
    "review.crumb": "// MODULE 06 / UNRESOLVED LINKS",
    "review.heading": "Review.links",
    "review.batch": "Batch",
    "review.lot": "Lot",
    "review.reason": "Reason",
    "review.status": "Status",
    "review.action": "Action",
    // ── Page-level (Compliance) ──────────
    "comp.crumb": "// MODULE 07 / CORRECTIVE ACTION",
    "comp.heading": "Compliance.capa",
    "comp.triggered": "Triggered by",
    "comp.assigned": "Assigned to",
    "comp.due": "Due date",
    "comp.root": "Root cause",
    "comp.open_btn": "OPEN CORRECTIVE ACTION",
    "comp.id": "ID",
  },

  hi: {
    // ── App chrome ────────────────────────────
    "app.title": "ट्रेसलिंक",
    "app.subtitle": "विनिर्माण ट्रैसेबिलिटी सिस्टम",
    "app.tagline": "किसी भी डिस्पैच को फ़ैक्टरी से ग्राहक तक 30 सेकंड में ट्रैक करें",
    "lang.toggle": "English",

    // ── Navigation ────────────────────────────
    "nav.trace": "ट्रेस",
    "nav.alert": "अलर्ट",
    "nav.operator": "ऑपरेटर",
    "nav.dashboard": "डैशबोर्ड",
    "nav.import": "आयात",
    "nav.review": "समीक्षा",
    "nav.compliance": "अनुपालन",
    "nav.admin": "एडमिन",
    "nav.logout": "लॉगआउट",
    "nav.guide": "सहायता गाइड",

    // ── Page descriptions (for guide) ─────────
    "desc.trace": "किसी डिस्पैच ऑर्डर आईडी दर्ज करें और उस शिपमेंट से जुड़े हर बैच, कच्चे माल, सप्लायर और QC रिजल्ट का पता लगाएं।",
    "desc.alert": "एक कच्चा माल लॉट नंबर दर्ज करें और उस सामग्री का उपयोग करने वाले हर डिस्पैच ऑर्डर का पता लगाएं — रिकॉल के लिए ज़रूरी।",
    "desc.operator": "शॉप फ्लोर से नए उत्पादन बैच लॉग करें। ऑफ़लाइन भी काम करता है — डेटा अपने आप सिंक हो जाएगा।",
    "desc.dashboard": "फ़ैक्टरी प्रदर्शन एक नज़र में: कुल बैच, पास दरें, दोष रुझान और मशीन उपयोग।",
    "desc.import": "CSV फ़ाइलें अपलोड करें — उत्पादन बैच, QC निरीक्षण, या डिस्पैच रिकॉर्ड डेटाबेस में आयात करें।",
    "desc.review": "स्वचालित रूप से अनुमानित ट्रेस लिंक की समीक्षा करें जिन्हें मानव सत्यापन की आवश्यकता है।",
    "desc.compliance": "गुणवत्ता घटनाओं और ग्राहक शिकायतों के लिए सुधारात्मक कार्रवाई (CAPA/8D) बनाएं और प्रबंधित करें।",
    "desc.admin": "ऑडिट लॉग देखें, उपयोगकर्ताओं और भूमिकाओं को प्रबंधित करें, और सिस्टम स्वास्थ्य की निगरानी करें।",

    // ── Trace page ────────────────────────────
    "trace.title": "डिस्पैच ट्रेस",
    "trace.subtitle": "पूरी विनिर्माण श्रृंखला का पता लगाने के लिए डिस्पैच ऑर्डर आईडी दर्ज करें",
    "trace.input": "ऑर्डर आईडी (जैसे D-1000)",
    "trace.button": "ट्रेस करें",
    "trace.result_title": "ट्रेस परिणाम",
    "trace.batch_id": "बैच आईडी",
    "trace.raw_lot": "कच्चा माल लॉट",
    "trace.supplier": "सप्लायर",
    "trace.machine": "मशीन",
    "trace.qc_result": "QC परिणाम",
    "trace.defect_rate": "दोष दर",
    "trace.confidence": "लिंक विश्वसनीयता",
    "trace.export": "CSV निर्यात",
    "trace.no_batches": "इस ऑर्डर के लिए कोई बैच नहीं मिला।",
    "trace.timing": "क्वेरी {ms} मिलीसेकंड में पूरी हुई",

    // ── Alert page ────────────────────────────
    "alert.title": "लॉट अलर्ट",
    "alert.subtitle": "किसी विशिष्ट कच्चे माल लॉट से प्रभावित सभी डिस्पैच ऑर्डर खोजें",
    "alert.input": "लॉट नंबर (जैसे LOT-0001)",
    "alert.button": "खोजें",
    "alert.result_title": "प्रभावित ऑर्डर",
    "alert.export": "CSV निर्यात",

    // ── Operator page ─────────────────────────
    "op.title": "बैच प्रविष्टि",
    "op.subtitle": "शॉप फ्लोर से नया उत्पादन बैच लॉग करें",
    "op.batch_id": "बैच आईडी",
    "op.machine_id": "मशीन",
    "op.shift": "शिफ्ट",
    "op.operator_name": "ऑपरेटर का नाम",
    "op.input_lot": "इनपुट कच्चा लॉट",
    "op.submit": "प्रविष्टि सबमिट करें",
    "op.success": "बैच प्रविष्टि सफलतापूर्वक सबमिट हुई!",
    "op.recent": "हाल की प्रविष्टियाँ",
    "op.offline_note": "📡 आप ऑफ़लाइन हैं। प्रविष्टियाँ स्थानीय रूप से सहेजी गई हैं और पुनः कनेक्ट होने पर सिंक होंगी।",
    "op.sync_status": "सिंक स्थिति",
    "op.pending": "लंबित",
    "op.synced": "सिंक हो गया",

    // ── Dashboard ─────────────────────────────
    "dash.title": "डैशबोर्ड",
    "dash.subtitle": "फ़ैक्टरी प्रदर्शन का अवलोकन",
    "dash.batches": "कुल बैच",
    "dash.pass_rate": "पास दर (%)",
    "dash.dispatches": "डिस्पैच ऑर्डर",
    "dash.avg_defect": "औसत दोष दर",
    "dash.suppliers": "सक्रिय सप्लायर",
    "dash.unresolved": "अनसुलझे लिंक",

    // ── Import ────────────────────────────────
    "import.title": "डेटा आयात",
    "import.subtitle": "CSV फ़ाइलें अपलोड करें और रिकॉर्ड डेटाबेस में आयात करें",
    "import.dropzone": "CSV फ़ाइल यहाँ खींचें और छोड़ें, या ब्राउज़ करने के लिए क्लिक करें",
    "import.type": "आयात प्रकार",
    "import.type.production": "उत्पादन बैच",
    "import.type.qc": "QC निरीक्षण",
    "import.type.dispatch": "डिस्पैच ऑर्डर",
    "import.upload": "अपलोड और आयात करें",
    "import.result": "आयात परिणाम",
    "import.rows_imported": "आयातित पंक्तियाँ",
    "import.errors": "त्रुटियाँ",

    // ── Review ────────────────────────────────
    "review.title": "लिंक समीक्षा कतार",
    "review.subtitle": "स्वचालित रूप से अनुमानित ट्रेस लिंक को स्वीकृत या अस्वीकृत करें",
    "review.approve": "स्वीकृत करें",
    "review.reject": "अस्वीकृत करें",
    "review.total": "कुल अनसुलझे",
    "review.empty": "कोई अनसुलझे लिंक नहीं — सब ठीक! ✅",
    "review.confidence": "विश्वसनीयता",

    // ── Compliance ────────────────────────────
    "comp.title": "अनुपालन — सुधारात्मक कार्रवाई",
    "comp.subtitle": "गुणवत्ता घटना प्रतिक्रियाओं (CAPA / 8D) को ट्रैक और प्रबंधित करें",
    "comp.create": "नई कार्रवाई बनाएं",
    "comp.type": "कार्रवाई प्रकार",
    "comp.type.capa": "CAPA",
    "comp.type.8d": "8D",
    "comp.status": "स्थिति",
    "comp.status.open": "खुला",
    "comp.status.closed": "बंद",
    "comp.desc": "विवरण",
    "comp.empty": "अभी तक कोई सुधारात्मक कार्रवाई नहीं।",

    // ── Admin ─────────────────────────────────
    "admin.title": "एडमिन कंसोल",
    "admin.subtitle": "ऑडिट लॉग, उपयोगकर्ता प्रबंधन और सिस्टम स्वास्थ्य",
    "admin.audit": "ऑडिट इवेंट्स",
    "admin.users": "उपयोगकर्ता",
    "admin.health": "सिस्टम स्वास्थ्य",
    "admin.role": "भूमिका",

    // ── Onboarding / Guide ────────────────────
    "guide.title": "ट्रेसलिंक में आपका स्वागत है!",
    "guide.intro": "ट्रेसलिंक आपको किसी भी उत्पाद को फ़ैक्टरी से ग्राहक तक ट्रैक करने में मदद करता है। यहाँ हर सेक्शन क्या करता है:",
    "guide.close": "समझ गए, चलते हैं!",
    "guide.step": "चरण {n}",
    "guide.tip": "💡 सुझाव",
    "guide.tip.text": "इसे फिर से देखने के लिए साइडबार में सहायता गाइड बटन पर क्लिक करें।",

    // ── Common ────────────────────────────────
    "common.loading": "लोड हो रहा है…",
    "common.error": "कुछ गलत हो गया",
    "common.retry": "पुनः प्रयास करें",
    "common.back": "वापस",
    "common.save": "सहेजें",
    "common.cancel": "रद्द करें",
    "common.search": "खोजें",
    "common.nodata": "कोई डेटा उपलब्ध नहीं",
    "common.role": "भूमिका",
    "common.email": "ईमेल",
    "common.password": "पासवर्ड",

    // ── Login ─────────────────────────────────
    "login.title": "साइन इन करें",
    "login.subtitle": "सिस्टम तक पहुँचने के लिए अपनी जानकारी दर्ज करें",
    "login.email": "ईमेल",
    "login.password": "पासवर्ड",
    "login.submit": "साइन इन करें",
    "login.google": "Google से साइन इन करें",
    "login.register_link": "खाता नहीं है? पंजीकरण करें",
    "login.login_link": "पहले से खाता है? साइन इन करें",
    "login.register_title": "खाता बनाएं",
    "login.register_submit": "खाता बनाएं",
    "login.processing": "प्रोसेसिंग…",

    // ── Page-level (Trace) ────────────────
    "trace.crumb": "// मॉड्यूल 01 / डिस्पैच ट्रेस",
    "trace.heading": "Trace.dispatch",
    "trace.permalink": "पर्मालिंक सक्षम",
    "trace.panel_key": "[ इनपुट ]",
    "trace.resolve": "डिस्पैच ऑर्डर की अपस्ट्रीम चेन खोजें",
    "trace.execute": "ट्रेस करें",
    "trace.tracing": "ट्रेस हो रहा है...",
    // ── Page-level (Alert) ────────────────
    "alert.crumb": "// मॉड्यूल 02 / लॉट फैनआउट",
    "alert.heading": "Alert.lot",
    "alert.export_ready": "निर्यात तैयार",
    "alert.panel_key": "[ फैनआउट ]",
    "alert.resolve": "संदिग्ध कच्चे लॉट से प्रभावित सभी डिस्पैच ऑर्डर खोजें",
    "alert.scanning": "स्कैन हो रहा है...",
    "alert.simulate": "खोजें",
    // ── Page-level (Operator) ────────────
    "op.crumb": "// मॉड्यूल 03 / ऑपरेटर इनपुट",
    "op.heading": "Entry.batch",
    "op.panel_key": "[ फॉर्म ]",
    "op.date": "तारीख",
    "op.lot": "कच्चा लॉट",
    "op.machine": "मशीन",
    "op.shift_label": "शिफ्ट",
    "op.operator": "ऑपरेटर",
    "op.units": "उत्पादित इकाइयाँ",
    "op.notes": "QC नोट्स",
    "op.save": "बैच सहेजें",
    "op.queued": "कतार में",
    "op.sync_now": "अभी सिंक करें",
    "op.online": "ऑनलाइन",
    "op.offline": "ऑफ़लाइन",
    // ── Page-level (Dashboard) ───────────
    "dash.crumb": "// मॉड्यूल 04 / गुणवत्ता मेट्रिक्स",
    "dash.heading": "Dashboard.metrics",
    "dash.qc_pass": "QC पास दर",
    "dash.open_ca": "खुली CA",
    "dash.top_fail": "सबसे ज़्यादा फेल मशीनें",
    "dash.machine": "मशीन",
    "dash.failures": "विफलताएँ",
    "dash.avg_defect_col": "औसत दोष",
    "dash.supplier_card": "सप्लायर स्कोरकार्ड",
    "dash.supplier_col": "सप्लायर",
    "dash.status": "स्थिति",
    "dash.lots": "लॉट",
    "dash.complaints": "शिकायतें",
    // ── Page-level (Import) ─────────────
    "import.crumb": "// मॉड्यूल 05 / स्रोत फ़ाइलें",
    "import.heading": "Import.csv",
    "import.file_type": "फ़ाइल प्रकार",
    "import.csv_file": "CSV फ़ाइल",
    "import.upload_btn": "अपलोड और सत्यापित करें",
    "import.id": "आईडी",
    "import.file": "फ़ाइल",
    "import.type_col": "प्रकार",
    "import.status": "स्थिति",
    "import.rows": "पंक्तियाँ",
    "import.uploaded": "अपलोड किया",
    // ── Page-level (Review) ─────────────
    "review.crumb": "// मॉड्यूल 06 / अनसुलझे लिंक",
    "review.heading": "Review.links",
    "review.batch": "बैच",
    "review.lot": "लॉट",
    "review.reason": "कारण",
    "review.status": "स्थिति",
    "review.action": "कार्रवाई",
    // ── Page-level (Compliance) ──────────
    "comp.crumb": "// मॉड्यूल 07 / सुधारात्मक कार्रवाई",
    "comp.heading": "Compliance.capa",
    "comp.triggered": "ट्रिगर द्वारा",
    "comp.assigned": "सौंपा गया",
    "comp.due": "नियत तारीख",
    "comp.root": "मूल कारण",
    "comp.open_btn": "सुधारात्मक कार्रवाई खोलें",
    "comp.id": "आईडी",
  },

  mr: {
    // ── App chrome ────────────────────────────
    "app.title": "ट्रेसलिंक",
    "app.subtitle": "उत्पादन ट्रेसेबिलिटी सिस्टम",
    "app.tagline": "कोणत्याही डिस्पॅचला फॅक्टरीतून ग्राहकापर्यंत ३० सेकंदात ट्रॅक करा",
    "lang.toggle": "MR",

    // ── Navigation ────────────────────────────
    "nav.trace": "ट्रेस",
    "nav.alert": "अलर्ट",
    "nav.operator": "ऑपरेटर",
    "nav.dashboard": "डॅशबोर्ड",
    "nav.import": "आयात",
    "nav.review": "समीक्षा",
    "nav.compliance": "अनुपालन",
    "nav.admin": "ऍडमिन",
    "nav.logout": "लॉगआउट",
    "nav.guide": "मदत मार्गदर्शक",

    // ── Page descriptions (for guide) ─────────
    "desc.trace": "डिस्पॅच ऑर्डर आयडी टाका आणि त्या शिपमेंटशी जोडलेले प्रत्येक बॅच, कच्चा माल, पुरवठादार आणि QC निकाल शोधा.",
    "desc.alert": "कच्च्या मालाचा लॉट नंबर टाका आणि त्या सामग्रीचा वापर करणाऱ्या प्रत्येक डिस्पॅच ऑर्डरचा शोध घ्या — रिकॉलसाठी महत्त्वाचे.",
    "desc.operator": "शॉप फ्लोअरवरून नवीन उत्पादन बॅच लॉग करा. ऑफलाइन काम करते — डेटा पुन्हा कनेक्ट झाल्यावर आपोआप सिंक होतो.",
    "desc.dashboard": "फॅक्टरी कामगिरी एका नजरेत: एकूण बॅच, पास दर, दोष ट्रेंड आणि मशीन वापर.",
    "desc.import": "CSV फाइल्स अपलोड करा — उत्पादन बॅच, QC तपासणी, किंवा डिस्पॅच रेकॉर्ड डेटाबेसमध्ये आयात करा.",
    "desc.review": "स्वयंचलितपणे अनुमानित ट्रेस लिंक्सचे पुनरावलोकन करा ज्यांना मानवी सत्यापन आवश्यक आहे.",
    "desc.compliance": "गुणवत्ता घटना आणि ग्राहक तक्रारींसाठी सुधारात्मक कारवाई (CAPA/8D) तयार करा आणि व्यवस्थापित करा.",
    "desc.admin": "ऑडिट लॉग पहा, वापरकर्ते आणि भूमिका व्यवस्थापित करा, आणि सिस्टम आरोग्य मॉनिटर करा.",

    // ── Trace ──────────────────────────────────
    "trace.title": "डिस्पॅच ट्रेस",
    "trace.subtitle": "संपूर्ण उत्पादन साखळी शोधण्यासाठी डिस्पॅच ऑर्डर आयडी टाका",
    "trace.input": "ऑर्डर आयडी (उदा. D-1000)",
    "trace.button": "ट्रेस करा",
    "trace.export": "CSV निर्यात",
    "trace.no_batches": "या ऑर्डरसाठी कोणतेही बॅच सापडले नाहीत.",
    "trace.timing": "क्वेरी {ms} मिलिसेकंदात पूर्ण झाली",
    "trace.crumb": "// मॉड्यूल 01 / डिस्पॅच ट्रेस",
    "trace.heading": "Trace.dispatch",
    "trace.permalink": "पर्मालिंक सक्षम",
    "trace.panel_key": "[ इनपुट ]",
    "trace.resolve": "डिस्पॅच ऑर्डरची अपस्ट्रीम साखळी शोधा",
    "trace.execute": "ट्रेस करा",
    "trace.tracing": "ट्रेस होत आहे...",

    // ── Alert ──────────────────────────────────
    "alert.title": "लॉट अलर्ट",
    "alert.subtitle": "विशिष्ट कच्च्या मालाच्या लॉटमुळे प्रभावित सर्व डिस्पॅच ऑर्डर शोधा",
    "alert.input": "लॉट नंबर (उदा. LOT-0001)",
    "alert.button": "शोधा",
    "alert.export": "CSV निर्यात",
    "alert.crumb": "// मॉड्यूल 02 / लॉट फॅनआउट",
    "alert.heading": "Alert.lot",
    "alert.export_ready": "निर्यात तयार",
    "alert.panel_key": "[ फॅनआउट ]",
    "alert.resolve": "संशयित कच्च्या लॉटमुळे प्रभावित सर्व डिस्पॅच ऑर्डर शोधा",
    "alert.scanning": "स्कॅन होत आहे...",
    "alert.simulate": "शोधा",

    // ── Operator ───────────────────────────────
    "op.title": "बॅच नोंद",
    "op.subtitle": "शॉप फ्लोअरवरून नवीन उत्पादन बॅच लॉग करा",
    "op.submit": "नोंद सबमिट करा",
    "op.success": "बॅच नोंद यशस्वीरित्या सबमिट झाली!",
    "op.offline_note": "तुम्ही ऑफलाइन आहात. नोंदी स्थानिक पातळीवर जतन केल्या आहेत आणि पुन्हा कनेक्ट झाल्यावर सिंक होतील.",
    "op.crumb": "// मॉड्यूल 03 / ऑपरेटर इनपुट",
    "op.heading": "Entry.batch",
    "op.panel_key": "[ फॉर्म ]",
    "op.date": "तारीख",
    "op.lot": "कच्चा लॉट",
    "op.machine": "मशीन",
    "op.shift_label": "शिफ्ट",
    "op.operator": "ऑपरेटर",
    "op.units": "उत्पादित युनिट्स",
    "op.notes": "QC नोट्स",
    "op.save": "बॅच जतन करा",
    "op.queued": "रांगेत",
    "op.sync_now": "आता सिंक करा",
    "op.online": "ऑनलाइन",
    "op.offline": "ऑफलाइन",

    // ── Dashboard ─────────────────────────────
    "dash.title": "डॅशबोर्ड",
    "dash.subtitle": "फॅक्टरी कामगिरी आढावा",
    "dash.batches": "एकूण बॅच",
    "dash.pass_rate": "पास दर (%)",
    "dash.crumb": "// मॉड्यूल 04 / गुणवत्ता मेट्रिक्स",
    "dash.heading": "Dashboard.metrics",
    "dash.qc_pass": "QC पास दर",
    "dash.open_ca": "खुल्या CA",
    "dash.top_fail": "सर्वाधिक अयशस्वी मशीन्स",
    "dash.machine": "मशीन",
    "dash.failures": "अयशस्वी",
    "dash.avg_defect_col": "सरासरी दोष",
    "dash.supplier_card": "पुरवठादार स्कोरकार्ड",
    "dash.supplier_col": "पुरवठादार",
    "dash.status": "स्थिती",
    "dash.lots": "लॉट",
    "dash.complaints": "तक्रारी",

    // ── Import ────────────────────────────────
    "import.title": "डेटा आयात",
    "import.subtitle": "CSV फाइल्स अपलोड करून रेकॉर्ड डेटाबेसमध्ये आयात करा",
    "import.upload": "अपलोड आणि आयात करा",
    "import.crumb": "// मॉड्यूल 05 / स्रोत फाइल्स",
    "import.heading": "Import.csv",
    "import.file_type": "फाइल प्रकार",
    "import.csv_file": "CSV फाइल",
    "import.upload_btn": "अपलोड आणि सत्यापित करा",
    "import.id": "आयडी",
    "import.file": "फाइल",
    "import.type_col": "प्रकार",
    "import.status": "स्थिती",
    "import.rows": "रांगा",
    "import.uploaded": "अपलोड केले",

    // ── Review ────────────────────────────────
    "review.title": "लिंक समीक्षा रांग",
    "review.subtitle": "स्वयंचलितपणे अनुमानित ट्रेस लिंक्स मान्य किंवा नाकारा",
    "review.approve": "मान्य करा",
    "review.reject": "नाकारा",
    "review.empty": "कोणतेही न सोडवलेले लिंक्स नाहीत — सर्व ठीक!",
    "review.crumb": "// मॉड्यूल 06 / न सोडवलेले लिंक्स",
    "review.heading": "Review.links",
    "review.batch": "बॅच",
    "review.lot": "लॉट",
    "review.confidence": "विश्वासार्हता",
    "review.reason": "कारण",
    "review.status": "स्थिती",
    "review.action": "कारवाई",

    // ── Compliance ────────────────────────────
    "comp.title": "अनुपालन — सुधारात्मक कारवाई",
    "comp.subtitle": "गुणवत्ता घटना प्रतिसाद (CAPA / 8D) ट्रॅक आणि व्यवस्थापित करा",
    "comp.create": "नवीन कारवाई तयार करा",
    "comp.crumb": "// मॉड्यूल 07 / सुधारात्मक कारवाई",
    "comp.heading": "Compliance.capa",
    "comp.triggered": "ट्रिगर",
    "comp.assigned": "सोपवले",
    "comp.due": "देय तारीख",
    "comp.root": "मूळ कारण",
    "comp.open_btn": "सुधारात्मक कारवाई उघडा",
    "comp.id": "आयडी",
    "comp.status": "स्थिती",

    // ── Guide ─────────────────────────────────
    "guide.title": "ट्रेसलिंकमध्ये आपले स्वागत आहे!",
    "guide.intro": "ट्रेसलिंक तुम्हाला कोणत्याही उत्पादनाला फॅक्टरीतून ग्राहकापर्यंत ट्रॅक करण्यात मदत करते. प्रत्येक विभाग काय करतो ते येथे आहे:",
    "guide.close": "समजले, चला सुरू करूया!",
    "guide.tip": "टीप",
    "guide.tip.text": "हे पुन्हा पाहण्यासाठी साइडबारमधील मदत मार्गदर्शक बटणावर क्लिक करा.",

    // ── Common ────────────────────────────────
    "common.loading": "लोड होत आहे…",
    "common.error": "काहीतरी चूक झाली",

    // ── Login ─────────────────────────────────
    "login.title": "साइन इन करा",
    "login.subtitle": "सिस्टममध्ये प्रवेश करण्यासाठी तुमची माहिती प्रविष्ट करा",
    "login.email": "ईमेल",
    "login.password": "पासवर्ड",
    "login.submit": "साइन इन करा",
    "login.google": "Google ने साइन इन करा",
    "login.register_link": "खाते नाही? नोंदणी करा",
    "login.login_link": "आधीपासून खाते आहे? साइन इन करा",
    "login.register_title": "खाते तयार करा",
    "login.register_submit": "खाते तयार करा",
    "login.processing": "प्रक्रिया होत आहे…",
  },
};

// ── Context ────────────────────────────────────────
type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("tl_lang");
    if (saved === "hi" || saved === "mr") return saved;
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("tl_lang", l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = translations[lang]?.[key] ?? translations.en[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}
