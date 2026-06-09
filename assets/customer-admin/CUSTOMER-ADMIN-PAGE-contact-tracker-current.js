// CUSTOMER-ADMIN-PAGE-contact-tracker-current.js
// Internal Version: 2026-06-08-086-A
// Purpose: Organization-admin Contact Tracker for public website inquiries. Uses core-access-action; no Make webhooks.

(function () {
  "use strict";

  const VERSION = "2026-06-08-086-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-contact-tracker-root, [data-syncetc-page='contact-tracker']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";

  const state = {
    debug: new URLSearchParams(window.location.search).get("syncetc_debug") === "1",
    startedAt: performance.now(),
    steps: [],
    loading: true,
    token: "",
    email: "",
    platformAdmin: false,
    accessRows: [],
    selectedOrgId: "",
    accessRow: null,
    page: null,
    settings: {},
    templates: [],
    inquiries: [],
    summary: { open: 0, resolved: 0, spam_suspected: 0, total: 0 },
    activeTab: "open",
    search: "",
    selectedIds: new Set(),
    expandedIds: new Set(),
    replyContact: null,
    customContact: null,
    editingTemplate: null,
    lastBackend: null,
  };

  function mark(label, detail) {
    const t = Math.round(performance.now() - state.startedAt);
    state.steps.push({ t, label, detail: detail || "" });
    if (state.debug) console.info(`[SyncEtc contact tracker ${VERSION}] ${t}ms ${label}${detail ? " — " + detail : ""}`);
  }

  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function raw(value) { return String(value ?? "").trim(); }
  function key(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function esc(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function bool(value) { return value === true; }
  function templateId(t) { return clean(t?.contact_reply_template_id || t?.template_id || t?.template_key); }
  function activeTemplates() { return state.templates.filter((t) => clean(t.status || "active") === "active" && !t.archived_at); }
  function defaultTemplate() { return activeTemplates().find((t) => t.is_default === true) || activeTemplates()[0] || null; }
  function textToHtml(value) {
    const text = raw(value);
    if (!text) return "";
    return text.split(/\n{2,}/).map((part) => `<p>${esc(part).replace(/\n/g, "<br>")}</p>`).join("");
  }
  function htmlToText(html) {
    const div = document.createElement("div");
    div.innerHTML = sanitizeRichHtml(html || "");
    return clean(div.textContent || "");
  }
  function sanitizeRichHtml(html) {
    const allowed = new Set(["B", "STRONG", "I", "EM", "U", "A", "UL", "OL", "LI", "P", "BR", "DIV", "SPAN"]);
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    function walk(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) return;
        if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); return; }
        const tag = child.tagName;
        if (!allowed.has(tag)) {
          const text = document.createTextNode(child.textContent || "");
          child.replaceWith(text);
          return;
        }
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (tag === "A" && name === "href") {
            const href = String(attr.value || "").trim();
            if (/^(https?:|mailto:)/i.test(href)) {
              child.setAttribute("href", href);
              child.setAttribute("target", "_blank");
              child.setAttribute("rel", "noopener noreferrer");
            } else child.removeAttribute(attr.name);
          } else child.removeAttribute(attr.name);
        });
        walk(child);
      });
    }
    walk(template.content);
    return template.innerHTML;
  }

  function styleConfig() {
    const style = obj(state.accessRow?.style_profile || state.accessRow?.styleProfile || {});
    const colors = obj(style.colors_json || style.colors || {});
    const spacing = obj(style.spacing_json || {});
    const layout = obj(style.layout_json || {});
    return {
      primary: clean(colors.brand_primary || colors.primary || "#1f4f82"),
      secondary: clean(colors.brand_secondary || colors.secondary || "#eef3f8"),
      surface: clean(colors.surface || "#ffffff"),
      text: clean(colors.text || "#172033"),
      muted: "rgba(23,32,51,.68)",
      border: "rgba(31,79,130,.16)",
      soft: "rgba(31,79,130,.08)",
      pageWidth: clean(spacing.page_width || layout.default_width) === "wide" ? "1180px" : "1040px",
      radius: "22px",
      shadow: "0 14px 42px rgba(12,38,64,.14)",
    };
  }

  function css() {
    const cfg = styleConfig();
    return `
      .syncetc-contact-tracker{font-family:Arial,Helvetica,sans-serif;color:${cfg.text};max-width:${cfg.pageWidth};margin:18px auto 52px;padding:0 18px;box-sizing:border-box}
      .syncetc-contact-tracker *{box-sizing:border-box}.sct-card{background:rgba(255,255,255,.94);border:1px solid ${cfg.border};border-radius:${cfg.radius};box-shadow:${cfg.shadow};overflow:hidden}.sct-head{padding:24px 26px;background:linear-gradient(135deg,${cfg.primary},rgba(47,128,196,.88));color:#fff}.sct-eyebrow{display:inline-flex;margin-bottom:10px;padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.sct-head h1{margin:0;color:#fff;font-size:clamp(30px,4vw,48px);line-height:1;font-weight:950;letter-spacing:-.04em}.sct-head p{max-width:860px;margin:12px 0 0;color:rgba(255,255,255,.9);font-size:15px;line-height:1.6}.sct-body{padding:20px 22px 24px;background:linear-gradient(180deg,${cfg.secondary},rgba(255,255,255,.86))}.sct-info{margin:0 0 14px;padding:13px 15px;border-radius:16px;background:#fff;border:1px solid ${cfg.border};border-left:6px solid ${cfg.primary};color:${cfg.text};font-size:13px;font-weight:750;line-height:1.5}.sct-toolbar{display:grid;gap:10px;margin-bottom:14px;padding:12px;border-radius:20px;background:rgba(255,255,255,.86);border:1px solid ${cfg.border};box-shadow:0 8px 20px rgba(12,38,64,.08)}.sct-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.sct-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:${cfg.secondary};border:1px solid ${cfg.border}}.sct-tab,.sct-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:8px 13px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary};font:900 13px/1 Arial,Helvetica,sans-serif;text-decoration:none;cursor:pointer}.sct-tab.active,.sct-btn.primary{background:${cfg.primary};color:#fff;border-color:${cfg.primary}}.sct-tab-count{min-width:24px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.85);color:${cfg.primary};font-size:12px}.sct-tab.active .sct-tab-count{background:#fff;color:${cfg.primary}}.sct-btn.danger{background:#fee2e2;color:#991b1b;border-color:#fecaca}.sct-btn:disabled{opacity:.5;cursor:not-allowed}.sct-search{min-height:36px;min-width:260px;flex:1 1 300px;padding:9px 13px;border-radius:999px;border:1px solid ${cfg.border};font:800 13px/1 Arial,Helvetica,sans-serif;color:${cfg.text};outline:none}.sct-search:focus{border-color:${cfg.primary};box-shadow:0 0 0 3px rgba(47,128,196,.14)}.sct-list{display:grid;gap:11px}.sct-empty{padding:28px 18px;text-align:center;border-radius:20px;background:#fff;border:1px solid ${cfg.border};color:${cfg.muted};font-weight:850}.sct-item{background:#fff;border:1px solid ${cfg.border};border-radius:18px;box-shadow:0 5px 14px rgba(12,38,64,.07);overflow:hidden}.sct-item-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:center;padding:14px 16px;cursor:pointer}.sct-name{font-size:15px;font-weight:950;color:${cfg.primary};overflow-wrap:anywhere}.sct-email{margin-top:3px;color:#2f80c4;font-size:13px;font-weight:800;word-break:break-all}.sct-meta{text-align:right;color:${cfg.muted};font-size:12px;font-weight:800}.sct-pill{display:inline-flex;margin-top:5px;padding:5px 9px;border-radius:999px;background:${cfg.secondary};color:${cfg.primary};font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.sct-pill.resolved{background:#edf0f3;color:#4b5563}.sct-pill.spam{background:#fee2e2;color:#991b1b}.sct-details{display:none;padding:0 16px 15px;border-top:1px solid ${cfg.border}}.sct-item.open .sct-details{display:block}.sct-section-label{margin:13px 0 6px;color:${cfg.primary};font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.sct-box{padding:12px;border-radius:14px;background:${cfg.secondary};border:1px solid ${cfg.border};font-size:13px;line-height:1.5;white-space:pre-wrap}.sct-notes{width:100%;min-height:90px;padding:11px 12px;border-radius:14px;border:1px solid ${cfg.border};font:13px/1.45 Arial,Helvetica,sans-serif;color:${cfg.text};resize:vertical}.sct-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sct-status{margin-top:10px;font-size:13px;font-weight:850;color:${cfg.muted}}.sct-status.error{color:#991b1b}.sct-status.ok{color:#15803d}.sct-modal-cover{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:999999;padding:24px 16px;background:rgba(15,23,42,.58);overflow:hidden}.sct-modal-cover.active{display:flex}.sct-modal{width:100%;max-width:720px;max-height:calc(100vh - 48px);margin:0;background:#fff;border-radius:22px;box-shadow:0 18px 60px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column}.sct-modal h2{flex:0 0 auto;margin:0;padding:17px 20px;background:linear-gradient(135deg,${cfg.primary},rgba(47,128,196,.88));color:#fff;font-size:19px}.sct-modal-body{padding:18px 20px;display:grid;gap:11px;overflow:auto;min-height:0}.sct-label{display:grid;gap:5px;color:${cfg.primary};font-size:12px;font-weight:950}.sct-input,.sct-textarea,.sct-select{width:100%;padding:10px 12px;border-radius:13px;border:1px solid ${cfg.border};font:14px/1.45 Arial,Helvetica,sans-serif;color:${cfg.text}}.sct-textarea{min-height:180px;resize:vertical}.sct-modal-footer{flex:0 0 auto;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:14px 20px 18px;background:${cfg.secondary};border-top:1px solid ${cfg.border}}.sct-debug{margin-top:14px;padding:14px;border-radius:18px;background:#0f172a;color:#dbeafe;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}.sct-checkbox{width:18px;height:18px;accent-color:${cfg.primary}}.sct-template-panel{margin:0 0 14px;padding:14px;border-radius:20px;background:rgba(255,255,255,.9);border:1px solid ${cfg.border};box-shadow:0 8px 20px rgba(12,38,64,.08)}.sct-template-title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.sct-template-title h2{margin:0;color:${cfg.primary};font-size:18px;letter-spacing:-.02em}.sct-template-grid{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:center}.sct-template-help{margin-top:8px;color:${cfg.muted};font-size:12px;font-weight:800;line-height:1.45}.sct-editor-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.sct-editor{min-height:180px;padding:11px 12px;border:1px solid ${cfg.border};border-radius:14px;background:#fff;outline:none;font:14px/1.5 Arial,Helvetica,sans-serif;color:${cfg.text};overflow:visible}.sct-editor:focus{border-color:${cfg.primary};box-shadow:0 0 0 3px rgba(47,128,196,.14)}.sct-preview{max-height:none;overflow:visible;padding:12px;border-radius:14px;border:1px solid ${cfg.border};background:${cfg.secondary};font-size:14px;line-height:1.5}.sct-placeholder-row{display:flex;gap:6px;flex-wrap:wrap}.sct-muted{color:${cfg.muted};font-size:12px;font-weight:800}.sct-advanced{border:1px dashed ${cfg.border};border-radius:14px;padding:10px;background:rgba(255,255,255,.72)}.sct-advanced summary{cursor:pointer;color:${cfg.primary};font-size:12px;font-weight:950}.sct-readonly{background:${cfg.secondary};color:${cfg.muted}}@media(max-width:760px){.syncetc-contact-tracker{padding:0 10px}.sct-body{padding:14px}.sct-row{align-items:stretch;flex-direction:column}.sct-search,.sct-btn{width:100%}.sct-item-head{grid-template-columns:auto minmax(0,1fr)}.sct-meta{grid-column:2;text-align:left}.sct-actions,.sct-modal-footer{flex-direction:column}.sct-tabs{width:100%}.sct-tab{flex:1}}
    `;
  }

  function debugHtml() {
    if (!state.debug) return "";
    const lines = [
      `SyncEtc Contact Tracker Diagnostics ${VERSION}`,
      `Elapsed: ${Math.round(performance.now() - state.startedAt)}ms`,
      `Session: ${state.email || "none"}`,
      `Org: ${state.accessRow?.organization_key || "not selected"}`,
      `Open: ${state.summary.open || 0}`,
      "",
      "Steps:",
      ...state.steps.map((s) => `${String(s.t).padStart(6, " ")}ms  ${s.label}${s.detail ? " — " + s.detail : ""}`),
      "",
      state.lastBackend ? JSON.stringify(state.lastBackend, null, 2) : ""
    ];
    return `<pre class="sct-debug">${esc(lines.join("\n"))}</pre>`;
  }

  function findExistingScript(src) {
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    return scripts.find((script) => script.src === src || script.getAttribute("src") === src || script.src.includes("@supabase/supabase-js@2")) || null;
  }

  function waitForCondition(check, timeoutMs, label) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        try {
          if (check()) return resolve(true);
        } catch (_) {}
        if (Date.now() - started >= timeoutMs) return reject(new Error(`${label || "Required script"} did not become ready in time.`));
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  async function loadScript(src) {
    const existing = findExistingScript(src);
    if (existing) {
      mark("loadScript:existing", src);
      if (window.supabase?.createClient) return;
      await Promise.race([
        new Promise((resolve, reject) => {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
        }),
        waitForCondition(() => window.supabase?.createClient, 8000, "Supabase client library"),
      ]).catch(async () => {
        await waitForCondition(() => window.supabase?.createClient, 1500, "Supabase client library");
      });
      return;
    }

    mark("loadScript:start", src);
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Unable to load ${src}`));
      document.head.appendChild(script);
    });
    mark("loadScript:loaded", src);
  }

  async function ensureSupabase() {
    mark("ensureSupabase:start");
    if (!window.supabase?.createClient) await loadScript(SUPABASE_JS_URL);
    if (!window.supabase?.createClient) await waitForCondition(() => window.supabase?.createClient, 8000, "Supabase client library");
    if (!window.__syncetcContactSupabase) {
      window.__syncetcContactSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      mark("ensureSupabase:created-client");
    } else {
      mark("ensureSupabase:cached");
    }
    return window.__syncetcContactSupabase;
  }

  function setShellState() {
    if (!window.SyncEtcPortalShell || typeof window.SyncEtcPortalShell.setState !== "function") return;
    const row = state.accessRow || {};
    window.SyncEtcPortalShell.setState({
      authenticated: !!state.token,
      email: state.email,
      mode: "org-admin",
      organizationName: row.organization_name || "Organization",
      organizationKey: row.organization_key || "",
      organizationId: row.organization_id || state.selectedOrgId,
      selectedOrganizationId: row.organization_id || state.selectedOrgId,
      organizations: state.accessRows.map((r) => ({ organization_id: r.organization_id, display_name: r.organization_name, organization_key: r.organization_key })),
      styleProfile: row.style_profile || null,
      accessRow: row,
      platformAdmin: !!state.platformAdmin,
      navigationProfile: row.navigation_profile || null,
      navigationRows: arr(row.navigation_rows),
      navigationItems: arr(row.navigation_items),
      activePageKey: "contact-tracker",
    });
  }

  async function callAccess(action, body) {
    if (!state.token) throw new Error("No active Supabase login session. Log in first.");
    mark("call:start", action);
    const response = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY, "Authorization": `Bearer ${state.token}` },
      body: JSON.stringify({ action, ...body })
    });
    const result = await response.json().catch(() => ({ ok: false, message: "Non-JSON response" }));
    state.lastBackend = result;
    mark("call:response", `${action} HTTP ${response.status}`);
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `HTTP ${response.status}`);
    return result;
  }

  function chooseAccessRow(accessRows) {
    const saved = localStorage.getItem(SELECTED_ORG_KEY) || "";
    const usable = accessRows.filter((row) => row && !row.blocks_access && (row.is_organization_admin || row.platform_override || obj(row.capabilities).can_view_organization_admin || arr(row.permission_keys).includes("communications.manage")));
    return usable.find((row) => row.organization_id === saved) || usable[0] || accessRows[0] || null;
  }

  async function refresh() {
    state.loading = true;
    renderAll();
    mark("refresh:start");
    const supabase = await ensureSupabase();
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    state.token = session?.access_token || "";
    state.email = session?.user?.email || "";
    if (!state.token) throw new Error("No active Supabase login session. Log in first.");

    const accessResult = await callAccess("get_user_dashboard", { organization_id: state.selectedOrgId || "" });
    state.platformAdmin = accessResult.platform_admin === true;
    state.accessRows = arr(accessResult.access);
    state.accessRow = chooseAccessRow(state.accessRows);
    if (!state.accessRow?.organization_id) throw new Error("No organization-admin access was found for Contact Tracker.");
    state.selectedOrgId = state.accessRow.organization_id;
    localStorage.setItem(SELECTED_ORG_KEY, state.selectedOrgId);
    setShellState();

    const listResult = await callAccess("organization_list_contact_inquiries", { organization_id: state.selectedOrgId, status_filter: "all", include_spam: true });
    state.page = listResult.page || null;
    state.settings = listResult.settings || {};
    state.templates = arr(listResult.reply_templates);
    state.inquiries = arr(listResult.inquiries);
    state.summary = obj(listResult.summary);
    state.loading = false;
    setShellState();
    renderAll();
  }

  function filteredInquiries() {
    const tab = state.activeTab;
    const search = clean(state.search).toLowerCase();
    let list = state.inquiries.filter((item) => {
      if (tab === "open") return item.status === "open";
      if (tab === "resolved") return item.status === "resolved";
      if (tab === "spam") return item.status === "spam_suspected";
      return true;
    });
    if (search) {
      list = list.filter((item) => [item.name, item.email, item.phone, item.subject, item.reason_key, item.message, item.internal_notes].map((v) => clean(v).toLowerCase()).join(" ").includes(search));
    }
    return list;
  }

  function formatDate(value) {
    if (!value) return "Date unknown";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? clean(value) : d.toLocaleString();
  }

  function statusLabel(status) {
    if (status === "resolved") return "Resolved";
    if (status === "spam_suspected") return "Spam suspected";
    return "Open";
  }

  function inquiryCard(item, index) {
    const id = clean(item.contact_inquiry_id || item.id);
    const isExpanded = state.expandedIds.has(id) || (index === 0 && state.activeTab === "open" && !state.expandedIds.size);
    const isSelected = state.selectedIds.has(id);
    const pillClass = item.status === "resolved" ? "resolved" : item.status === "spam_suspected" ? "spam" : "";
    return `<article class="sct-item ${isExpanded ? "open" : ""}" data-contact-id="${esc(id)}">
      <div class="sct-item-head" data-action="toggle" data-contact-id="${esc(id)}">
        <input class="sct-checkbox" type="checkbox" data-action="select" data-contact-id="${esc(id)}" ${isSelected ? "checked" : ""}>
        <div><div class="sct-name">${esc(item.name || "No name")}</div><div class="sct-email">${esc(item.email || "No email")}</div></div>
        <div class="sct-meta"><div>${esc(formatDate(item.created_at))}</div><span class="sct-pill ${pillClass}">${esc(statusLabel(item.status))}</span></div>
      </div>
      <div class="sct-details">
        <div class="sct-section-label">Inquiry</div>
        <div class="sct-box"><strong>${esc(item.subject || item.reason_key || "General question")}</strong>${item.phone ? `\nPhone: ${esc(item.phone)}` : ""}${item.source_url ? `\nSource: ${esc(item.source_url)}` : ""}\n\n${esc(item.message || "No message on file.")}</div>
        <div class="sct-section-label">Internal notes</div>
        <textarea class="sct-notes" data-notes-for="${esc(id)}" placeholder="Add internal notes for board/admin users only...">${esc(item.internal_notes || "")}</textarea>
        <div class="sct-actions">
          <button class="sct-btn" data-action="save-notes" data-contact-id="${esc(id)}">Save Notes</button>
          ${item.status !== "resolved" ? `<button class="sct-btn danger" data-action="resolve" data-contact-id="${esc(id)}">Mark Resolved</button>` : `<button class="sct-btn" data-action="reopen" data-contact-id="${esc(id)}">Reopen</button>`}
          ${item.status === "open" ? `<button class="sct-btn primary" data-action="prefab" data-contact-id="${esc(id)}">Send Selected Prefab</button><button class="sct-btn" data-action="custom" data-contact-id="${esc(id)}">Send Custom Reply</button>` : ""}
        </div>
      </div>
    </article>`;
  }


  function templateManagerHtml() {
    const templates = activeTemplates();
    const selected = defaultTemplate();
    return `<section class="sct-template-panel">
      <div class="sct-template-title"><h2>Prefab Reply Templates</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="sct-btn primary" data-action="new-template">Add Template</button><button class="sct-btn" data-action="edit-template" ${selected ? "" : "disabled"}>Edit Selected</button><button class="sct-btn danger" data-action="archive-template" ${selected ? "" : "disabled"}>Archive Selected</button></div></div>
      <div class="sct-template-grid"><select class="sct-select" data-template-manager-select>${templateOptions(selected?.template_key || "")}</select><button class="sct-btn" data-action="template-manager-preview" ${selected ? "" : "disabled"}>Preview</button></div>
      <div class="sct-template-help">Use templates for common replies. Supported placeholders: <strong>{{name}}</strong>, <strong>{{organization_name}}</strong>, <strong>{{sender_name}}</strong>, <strong>{{sender_email}}</strong>. Archive hides a template without deleting history.</div>
    </section>`;
  }

  function mainHtml() {
    const list = filteredInquiries();
    const selectedCount = state.selectedIds.size;
    const open = Number(state.summary.open || 0);
    const resolved = Number(state.summary.resolved || 0);
    const spam = Number(state.summary.spam_suspected || 0);
    return `<div class="syncetc-contact-tracker">
      <style>${css()}</style>
      <section class="sct-card">
        <div class="sct-head"><div class="sct-eyebrow">Organization Admin</div><h1>Contact Tracker</h1><p>Review public website inquiries, add internal notes, send a reply when appropriate, and move completed contacts out of the active workflow.</p></div>
        <div class="sct-body">
          <div class="sct-info"><strong>Workflow note:</strong> New public contact submissions are saved here. The system does not email the board/admins for each submission. Suspected spam is separated from the Open count by default.</div>
          ${templateManagerHtml()}
          <div class="sct-toolbar">
            <div class="sct-row">
              <div class="sct-tabs">
                <button class="sct-tab ${state.activeTab === "open" ? "active" : ""}" data-tab="open"><span class="sct-tab-count">${open}</span> Open</button>
                <button class="sct-tab ${state.activeTab === "resolved" ? "active" : ""}" data-tab="resolved"><span class="sct-tab-count">${resolved}</span> Resolved</button>
                <button class="sct-tab ${state.activeTab === "spam" ? "active" : ""}" data-tab="spam"><span class="sct-tab-count">${spam}</span> Spam</button>
              </div>
              <button class="sct-btn" data-action="refresh">Refresh</button>
            </div>
            <div class="sct-row">
              <input class="sct-search" data-action="search" value="${esc(state.search)}" placeholder="Search name, email, subject, notes...">
              <span class="sct-btn" style="cursor:default">${selectedCount} selected</span>
            </div>
            <div class="sct-row">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="sct-btn" data-action="open-all">Open all visible</button>
                <button class="sct-btn" data-action="close-all">Close all visible</button>
                <button class="sct-btn" data-action="select-visible">Select visible</button>
                <button class="sct-btn" data-action="clear-selected">Clear selected</button>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${state.activeTab === "resolved" ? `<button class="sct-btn primary" data-action="bulk-reopen" ${selectedCount ? "" : "disabled"}>Reopen selected</button>` : `<button class="sct-btn danger" data-action="bulk-resolve" ${selectedCount ? "" : "disabled"}>Mark selected resolved</button>`}
              </div>
            </div>
          </div>
          <div class="sct-list">${state.loading ? `<div class="sct-empty">Loading contact inquiries...</div>` : list.length ? list.map(inquiryCard).join("") : `<div class="sct-empty">No contact inquiries in this tab.</div>`}</div>
          <div class="sct-status" data-status></div>
        </div>
      </section>
      ${modalHtml()}
      ${debugHtml()}
    </div>`;
  }

  function templateOptions(selectedKey = "") {
    return activeTemplates().map((t) => `<option value="${esc(t.template_key)}" ${clean(t.template_key) === clean(selectedKey) ? "selected" : ""}>${esc(t.template_name || t.template_key)}${t.is_default ? " • default" : ""}</option>`).join("");
  }

  function modalHtml() {
    return `<div class="sct-modal-cover" data-modal="reply"><div class="sct-modal"><h2>Send Prefab Reply</h2><div class="sct-modal-body"><label class="sct-label">Template<select class="sct-select" data-prefab-template>${templateOptions(defaultTemplate()?.template_key || "")}</select></label><div class="sct-preview" data-prefab-preview></div><label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:850"><input class="sct-checkbox" type="checkbox" data-prefab-resolve checked> Mark resolved after sending</label><div class="sct-status" data-prefab-status></div></div><div class="sct-modal-footer"><button class="sct-btn" data-action="close-modal">Cancel</button><button class="sct-btn" data-action="refresh-prefab-preview">Preview</button><button class="sct-btn primary" data-action="send-prefab">Send Selected Reply</button></div></div></div>
    <div class="sct-modal-cover" data-modal="custom"><div class="sct-modal"><h2>Send Custom Reply</h2><div class="sct-modal-body"><label class="sct-label">To<input class="sct-input" data-custom-to></label><label class="sct-label">Subject<input class="sct-input" data-custom-subject></label><label class="sct-label">Message<textarea class="sct-textarea" data-custom-body></textarea></label><label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:850"><input class="sct-checkbox" type="checkbox" data-custom-cc> Send me a copy</label><div class="sct-status" data-custom-status></div></div><div class="sct-modal-footer"><button class="sct-btn" data-action="close-modal">Cancel</button><button class="sct-btn primary" data-action="send-custom">Send Custom Reply</button></div></div></div>
    <div class="sct-modal-cover" data-modal="template"><div class="sct-modal"><h2 data-template-modal-title>Prefab Reply Template</h2><div class="sct-modal-body"><input type="hidden" data-template-id><input type="hidden" data-template-key><label class="sct-label">Template name<input class="sct-input" data-template-name placeholder="Application info"></label><label class="sct-label">Subject<input class="sct-input" data-template-subject placeholder="Information from {{organization_name}}"></label><label class="sct-label">Message<div class="sct-editor-toolbar"><button type="button" class="sct-btn" data-editor-command="bold"><b>B</b></button><button type="button" class="sct-btn" data-editor-command="italic"><i>I</i></button><button type="button" class="sct-btn" data-editor-command="insertUnorderedList">Bullets</button><button type="button" class="sct-btn" data-editor-command="insertOrderedList">Numbers</button><button type="button" class="sct-btn" data-editor-link>Link</button></div><div class="sct-editor" data-template-body-editor contenteditable="true"></div></label><div class="sct-placeholder-row"><button type="button" class="sct-btn" data-insert-token="{{name}}">contact name</button><button type="button" class="sct-btn" data-insert-token="{{organization_name}}">organization</button><button type="button" class="sct-btn" data-insert-token="{{sender_name}}">sender</button><button type="button" class="sct-btn" data-insert-token="{{sender_email}}">sender email</button></div><label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:850"><input class="sct-checkbox" type="checkbox" data-template-default> Make this the default prefab reply</label><label class="sct-label">Sort order<input class="sct-input" type="number" data-template-sort value="100"></label><details class="sct-advanced"><summary>Advanced</summary><label class="sct-label" style="margin-top:10px">Template key<input class="sct-input sct-readonly" data-template-key-display readonly placeholder="auto-generated on save"></label><div class="sct-muted">The template key is an internal slug. It is generated from the template name and should normally stay unchanged.</div></details><div class="sct-status" data-template-status></div></div><div class="sct-modal-footer"><button class="sct-btn" data-action="close-modal">Cancel</button><button class="sct-btn" data-action="preview-template-edit">Preview</button><button class="sct-btn primary" data-action="save-template">Save Template</button></div></div></div>
    <div class="sct-modal-cover" data-modal="preview"><div class="sct-modal"><h2>Template Preview</h2><div class="sct-modal-body"><div class="sct-preview" data-template-preview-box></div></div><div class="sct-modal-footer"><button class="sct-btn primary" data-action="close-modal">Close</button></div></div></div>`;
  }

  function renderAll() {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      root.innerHTML = mainHtml();
      bind(root);
    });
  }

  function findInquiry(id) { return state.inquiries.find((item) => clean(item.contact_inquiry_id || item.id) === clean(id)); }
  function setStatus(root, message, kind) { const el = root.querySelector("[data-status]"); if (el) { el.textContent = message || ""; el.className = `sct-status ${kind || ""}`.trim(); } }

  async function updateInquiry(id, patch) {
    const result = await callAccess("organization_update_contact_inquiry", { organization_id: state.selectedOrgId, contact_inquiry_id: id, ...patch });
    const updated = result.inquiry;
    state.inquiries = state.inquiries.map((item) => clean(item.contact_inquiry_id) === clean(id) ? updated : item);
    const listResult = await callAccess("organization_list_contact_inquiries", { organization_id: state.selectedOrgId, status_filter: "all", include_spam: true });
    state.summary = obj(listResult.summary);
    state.inquiries = arr(listResult.inquiries);
  }

  async function bulkUpdate(status) {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Apply this change to ${ids.length} selected contact inquiry item(s)?`)) return;
    await callAccess("organization_bulk_update_contact_inquiries", { organization_id: state.selectedOrgId, contact_inquiry_ids: ids, status });
    state.selectedIds.clear();
    const listResult = await callAccess("organization_list_contact_inquiries", { organization_id: state.selectedOrgId, status_filter: "all", include_spam: true });
    state.summary = obj(listResult.summary);
    state.inquiries = arr(listResult.inquiries);
    setShellState();
    renderAll();
  }


  function selectedManagerTemplate(root = document) {
    const keyVal = root.querySelector("[data-template-manager-select]")?.value || defaultTemplate()?.template_key || "";
    return activeTemplates().find((t) => clean(t.template_key) === clean(keyVal)) || defaultTemplate();
  }

  function sampleTokens(contact) {
    const name = contact?.name || "Frank Example";
    return {
      name: name,
      first_name: clean(name).split(/\s+/)[0] || "there",
      contact_name: name,
      organization_name: state.accessRow?.organization_name || "Organization",
      sender_name: state.email || "Organization Admin",
      sender_email: state.email || "admin@example.com",
    };
  }

  function replaceTokensClient(value, tokens) {
    return String(value || "").replace(/{{\s*([a-z0-9_:-]+)\s*}}/gi, (_m, k) => esc(tokens[key(k).replace(/-/g, "_")] ?? ""));
  }

  function renderTemplatePreview(template, contact) {
    if (!template) return "<em>No active prefab reply templates.</em>";
    const tokens = sampleTokens(contact);
    const subject = replaceTokensClient(template.subject || "", tokens);
    const html = replaceTokensClient(template.body_html || textToHtml(template.body_text || ""), tokens);
    return `<div class="sct-section-label">Subject</div><div class="sct-box">${subject || "(no subject)"}</div><div class="sct-section-label">Message</div><div class="sct-preview">${sanitizeRichHtml(html)}</div>`;
  }

  function openTemplateEditor(template) {
    state.editingTemplate = template || null;
    const cover = document.querySelector("[data-modal='template']");
    if (!cover) return;
    cover.querySelector("[data-template-modal-title]").textContent = template ? "Edit Prefab Reply Template" : "Add Prefab Reply Template";
    cover.querySelector("[data-template-id]").value = templateId(template || {});
    cover.querySelector("[data-template-name]").value = template?.template_name || "";
    cover.querySelector("[data-template-key]").value = template?.template_key || "";
    const keyDisplay = cover.querySelector("[data-template-key-display]");
    if (keyDisplay) keyDisplay.value = template?.template_key || "Auto-generated from template name";
    cover.querySelector("[data-template-subject]").value = template?.subject || "";
    cover.querySelector("[data-template-body-editor]").innerHTML = sanitizeRichHtml(template?.body_html || textToHtml(template?.body_text || ""));
    cover.querySelector("[data-template-default]").checked = template?.is_default === true || !activeTemplates().length;
    cover.querySelector("[data-template-sort]").value = template?.sort_order ?? 100;
    const status = cover.querySelector("[data-template-status]");
    if (status) { status.textContent = ""; status.className = "sct-status"; }
    cover.classList.add("active");
  }

  function insertAtSelection(html) {
    const editor = document.querySelector("[data-template-body-editor]");
    if (!editor) return;
    editor.focus();
    try { document.execCommand("insertHTML", false, html); } catch (_) { editor.innerHTML += html; }
  }

  async function saveTemplateFromModal() {
    const cover = document.querySelector("[data-modal='template']");
    const status = cover?.querySelector("[data-template-status]");
    try {
      const id = cover.querySelector("[data-template-id]").value;
      const templateName = cover.querySelector("[data-template-name]").value;
      const templateKey = cover.querySelector("[data-template-key]").value;
      const subject = cover.querySelector("[data-template-subject]").value;
      const bodyHtml = sanitizeRichHtml(cover.querySelector("[data-template-body-editor]").innerHTML);
      const bodyText = htmlToText(bodyHtml);
      const isDefault = !!cover.querySelector("[data-template-default]").checked;
      const sortOrder = Number(cover.querySelector("[data-template-sort]").value || 100);
      if (!clean(templateName)) throw new Error("Enter a template name.");
      if (!clean(subject)) throw new Error("Enter a subject.");
      if (!clean(bodyText)) throw new Error("Enter a message body.");
      if (status) { status.textContent = "Saving..."; status.className = "sct-status"; }
      await callAccess("organization_upsert_contact_reply_template", { organization_id: state.selectedOrgId, contact_reply_template_id: id || undefined, template_name: templateName, template_key: templateKey, subject, body_text: bodyText, body_html: bodyHtml, is_default: isDefault, sort_order: sortOrder });
      closeModals();
      await refresh();
    } catch (error) {
      if (status) { status.textContent = error.message || String(error); status.className = "sct-status error"; }
    }
  }

  async function archiveSelectedTemplate(root) {
    const template = selectedManagerTemplate(root);
    if (!template) return;
    if (!confirm(`Archive prefab template "${template.template_name || template.template_key}"?`)) return;
    await callAccess("organization_archive_contact_reply_template", { organization_id: state.selectedOrgId, contact_reply_template_id: template.contact_reply_template_id, template_key: template.template_key });
    await refresh();
  }

  function openModal(name, contact) {
    state.replyContact = contact;
    state.customContact = contact;
    const cover = document.querySelector(`[data-modal='${name}']`);
    if (!cover) return;
    cover.classList.add("active");
    if (name === "custom") {
      cover.querySelector("[data-custom-to]").value = contact.email || "";
      cover.querySelector("[data-custom-subject]").value = "";
      cover.querySelector("[data-custom-body]").value = "";
    }
    if (name === "reply") {
      const sel = cover.querySelector("[data-prefab-template]");
      const template = activeTemplates().find((t) => clean(t.template_key) === clean(sel?.value)) || defaultTemplate();
      const preview = cover.querySelector("[data-prefab-preview]");
      if (preview) preview.innerHTML = renderTemplatePreview(template, contact);
    }
  }

  function closeModals() { document.querySelectorAll(".sct-modal-cover").forEach((el) => el.classList.remove("active")); }

  async function sendPrefab(root) {
    const contact = state.replyContact;
    if (!contact) return;
    const templateKey = root.querySelector("[data-prefab-template]")?.value || defaultTemplate()?.template_key || "application-info";
    const resolveAfter = !!root.querySelector("[data-prefab-resolve]")?.checked;
    const status = root.querySelector("[data-prefab-status]");
    try {
      if (status) { status.textContent = "Sending..."; status.className = "sct-status"; }
      await callAccess("organization_send_contact_reply", { organization_id: state.selectedOrgId, contact_inquiry_id: contact.contact_inquiry_id, reply_kind: "prefab", template_key: templateKey, cc_self: false });
      if (resolveAfter) await updateInquiry(contact.contact_inquiry_id, { status: "resolved", note: "Resolved after prefab reply." });
      closeModals();
      await refresh();
    } catch (error) {
      if (status) { status.textContent = error.message || String(error); status.className = "sct-status error"; }
    }
  }

  async function sendCustom(root) {
    const contact = state.customContact;
    if (!contact) return;
    const cover = root.closest("[data-modal]") || document;
    const status = cover.querySelector("[data-custom-status]");
    try {
      const to = cover.querySelector("[data-custom-to]").value;
      const subject = cover.querySelector("[data-custom-subject]").value;
      const bodyText = cover.querySelector("[data-custom-body]").value;
      const ccSelf = !!cover.querySelector("[data-custom-cc]").checked;
      if (!bodyText.trim()) throw new Error("Enter a message before sending.");
      if (status) { status.textContent = "Sending..."; status.className = "sct-status"; }
      await callAccess("organization_send_contact_reply", { organization_id: state.selectedOrgId, contact_inquiry_id: contact.contact_inquiry_id, reply_kind: "custom", to, subject, body_text: bodyText, cc_self: ccSelf });
      closeModals();
      await refresh();
    } catch (error) {
      if (status) { status.textContent = error.message || String(error); status.className = "sct-status error"; }
    }
  }

  function bind(root) {
    root.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => { state.activeTab = btn.dataset.tab; state.selectedIds.clear(); renderAll(); }));
    root.querySelector("[data-action='refresh']")?.addEventListener("click", () => refresh().catch((e) => setStatus(root, e.message || String(e), "error")));
    root.querySelector("[data-action='search']")?.addEventListener("input", (e) => { state.search = e.target.value; renderAll(); });
    root.querySelector("[data-action='open-all']")?.addEventListener("click", () => { filteredInquiries().forEach((i) => state.expandedIds.add(clean(i.contact_inquiry_id))); renderAll(); });
    root.querySelector("[data-action='close-all']")?.addEventListener("click", () => { state.expandedIds.clear(); renderAll(); });
    root.querySelector("[data-action='select-visible']")?.addEventListener("click", () => { filteredInquiries().forEach((i) => state.selectedIds.add(clean(i.contact_inquiry_id))); renderAll(); });
    root.querySelector("[data-action='clear-selected']")?.addEventListener("click", () => { state.selectedIds.clear(); renderAll(); });
    root.querySelector("[data-action='bulk-resolve']")?.addEventListener("click", () => bulkUpdate("resolved").catch((e) => setStatus(root, e.message || String(e), "error")));
    root.querySelector("[data-action='bulk-reopen']")?.addEventListener("click", () => bulkUpdate("open").catch((e) => setStatus(root, e.message || String(e), "error")));
    root.querySelectorAll("[data-action='toggle']").forEach((el) => el.addEventListener("click", (e) => { if (e.target?.matches?.("input")) return; const id = el.dataset.contactId; state.expandedIds.has(id) ? state.expandedIds.delete(id) : state.expandedIds.add(id); renderAll(); }));
    root.querySelectorAll("[data-action='select']").forEach((el) => el.addEventListener("change", () => { const id = el.dataset.contactId; el.checked ? state.selectedIds.add(id) : state.selectedIds.delete(id); renderAll(); }));
    root.querySelectorAll("[data-action='save-notes']").forEach((btn) => btn.addEventListener("click", async () => { const id = btn.dataset.contactId; const notes = root.querySelector(`[data-notes-for='${CSS.escape(id)}']`)?.value || ""; try { await updateInquiry(id, { internal_notes: notes }); renderAll(); } catch (e) { setStatus(root, e.message || String(e), "error"); } }));
    root.querySelectorAll("[data-action='resolve']").forEach((btn) => btn.addEventListener("click", async () => { if (!confirm("Mark this contact resolved?")) return; try { await updateInquiry(btn.dataset.contactId, { status: "resolved" }); renderAll(); } catch (e) { setStatus(root, e.message || String(e), "error"); } }));
    root.querySelectorAll("[data-action='reopen']").forEach((btn) => btn.addEventListener("click", async () => { try { await updateInquiry(btn.dataset.contactId, { status: "open" }); renderAll(); } catch (e) { setStatus(root, e.message || String(e), "error"); } }));
    root.querySelectorAll("[data-action='prefab']").forEach((btn) => btn.addEventListener("click", () => openModal("reply", findInquiry(btn.dataset.contactId))));
    root.querySelectorAll("[data-action='custom']").forEach((btn) => btn.addEventListener("click", () => openModal("custom", findInquiry(btn.dataset.contactId))));

    root.querySelector("[data-action='new-template']")?.addEventListener("click", () => openTemplateEditor(null));
    root.querySelector("[data-action='edit-template']")?.addEventListener("click", () => openTemplateEditor(selectedManagerTemplate(root)));
    root.querySelector("[data-action='archive-template']")?.addEventListener("click", () => archiveSelectedTemplate(root).catch((e) => setStatus(root, e.message || String(e), "error")));
    root.querySelector("[data-action='template-manager-preview']")?.addEventListener("click", () => { const box = document.querySelector("[data-template-preview-box]"); if (box) box.innerHTML = renderTemplatePreview(selectedManagerTemplate(root)); document.querySelector("[data-modal='preview']")?.classList.add("active"); });
    root.querySelectorAll("[data-editor-command]").forEach((btn) => btn.addEventListener("click", () => { document.querySelector("[data-template-body-editor]")?.focus(); try { document.execCommand(btn.dataset.editorCommand, false, null); } catch (_) {} }));
    root.querySelector("[data-editor-link]")?.addEventListener("click", () => { const url = prompt("Enter link URL (https:// or mailto:)"); if (!url) return; if (!/^(https?:|mailto:)/i.test(url)) return alert("Use an https:// or mailto: link."); insertAtSelection(`<a href="${esc(url)}">${esc(url)}</a>`); });
    root.querySelectorAll("[data-insert-token]").forEach((btn) => btn.addEventListener("click", () => insertAtSelection(btn.dataset.insertToken || "")));
    root.querySelector("[data-action='save-template']")?.addEventListener("click", () => saveTemplateFromModal());
    root.querySelector("[data-action='preview-template-edit']")?.addEventListener("click", () => { const cover = document.querySelector("[data-modal='template']"); const tmp = { subject: cover?.querySelector("[data-template-subject]")?.value || "", body_html: sanitizeRichHtml(cover?.querySelector("[data-template-body-editor]")?.innerHTML || "") }; const box = document.querySelector("[data-template-preview-box]"); if (box) box.innerHTML = renderTemplatePreview(tmp); document.querySelector("[data-modal='preview']")?.classList.add("active"); });
    root.querySelector("[data-action='refresh-prefab-preview']")?.addEventListener("click", () => { const cover = document.querySelector("[data-modal='reply']"); const tkey = cover?.querySelector("[data-prefab-template]")?.value || ""; const template = activeTemplates().find((t) => clean(t.template_key) === clean(tkey)) || defaultTemplate(); const preview = cover?.querySelector("[data-prefab-preview]"); if (preview) preview.innerHTML = renderTemplatePreview(template, state.replyContact); });
    root.querySelector("[data-prefab-template]")?.addEventListener("change", () => { const cover = document.querySelector("[data-modal='reply']"); const tkey = cover?.querySelector("[data-prefab-template]")?.value || ""; const template = activeTemplates().find((t) => clean(t.template_key) === clean(tkey)) || defaultTemplate(); const preview = cover?.querySelector("[data-prefab-preview]"); if (preview) preview.innerHTML = renderTemplatePreview(template, state.replyContact); });
    root.querySelectorAll("[data-action='close-modal']").forEach((btn) => btn.addEventListener("click", closeModals));
    root.querySelector("[data-action='send-prefab']")?.addEventListener("click", () => sendPrefab(root.querySelector("[data-modal='reply']")).catch((e) => setStatus(root, e.message || String(e), "error")));
    root.querySelector("[data-action='send-custom']")?.addEventListener("click", (e) => sendCustom(e.target).catch((err) => setStatus(root, err.message || String(err), "error")));
  }

  function handleOrgChange(event) {
    const orgId = event?.detail?.organization_id || event?.detail?.organizationId || "";
    if (!orgId || orgId === state.selectedOrgId) return;
    state.selectedOrgId = orgId;
    localStorage.setItem(SELECTED_ORG_KEY, orgId);
    refresh().catch((error) => { state.loading = false; renderAll(); console.error(error); });
  }

  async function boot() {
    mark("boot:start", window.location.pathname);
    window.addEventListener("syncetc:portal-organization-change", handleOrgChange);
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => { root.innerHTML = `<div style="padding:18px;font-family:Arial,Helvetica,sans-serif;">Loading Contact Tracker...</div>`; });
    try {
      await refresh();
    } catch (error) {
      state.loading = false;
      document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
        root.innerHTML = `<div class="syncetc-contact-tracker"><style>${css()}</style><div class="sct-card"><div class="sct-head"><h1>Contact Tracker</h1></div><div class="sct-body"><div class="sct-info" style="border-left-color:#991b1b;color:#991b1b"><strong>Unable to load Contact Tracker.</strong><br>${esc(error.message || String(error))}</div></div></div>${debugHtml()}</div>`;
      });
      setShellState();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
