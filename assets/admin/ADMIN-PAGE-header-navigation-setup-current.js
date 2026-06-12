// ADMIN-PAGE-header-navigation-setup-current.js
// Internal Version: 2026-06-12-108-A
// Purpose: Platform-admin Header / Navigation Setup Foundation. Configures labels, rows, order, visibility, and privacy-first access settings.
// Uses core-admin-action backend actions: navigation_list_organizations, navigation_get_setup, navigation_save_setup.

(function () {
  "use strict";

  const VERSION = "2026-06-12-108-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-header-navigation-setup-root";

  const ACCESS_OPTIONS = [
    ["public", "Public"],
    ["logged_in", "Logged-in only"],
    ["user", "User / member"],
    ["organization_admin", "Organization admin"],
    ["platform_admin", "Platform admin"],
    ["disabled", "Disabled"]
  ];

  const ROW_OPTIONS = ["public", "user", "admin", "platform"];
  const SENSITIVE_RISKS = new Set(["sensitive_user_data", "sensitive_admin_data", "platform_system"]);
  const HARD_BLOCK_PUBLIC_RISKS = new Set(["sensitive_admin_data", "platform_system"]);

  let supabaseClient = null;
  let authenticatedEmail = "";
  let organizations = [];
  let setup = null;
  let selectedOrganizationId = "";
  let lastErrorMessage = "";
  let hasUnsavedChanges = false;

  function root() {
    let el = document.getElementById(ROOT_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = ROOT_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function setStatus(message, type = "info") {
    const el = document.getElementById("se-nav-status");
    if (!el) return;
    el.innerHTML = esc(message);
    el.dataset.type = type;
  }

  function loginUrl() {
    return `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }

  function markDirty() {
    hasUnsavedChanges = true;
    const el = document.getElementById("se-unsaved-flag");
    if (el) el.textContent = "Unsaved changes";
  }

  function clearDirty() {
    hasUnsavedChanges = false;
    const el = document.getElementById("se-unsaved-flag");
    if (el) el.textContent = "";
  }

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "You have unsaved Header/Nav Setup changes.";
  });

  function setOutput(value) {
    const el = document.getElementById("se-nav-output");
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase JS did not load correctly.");
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;
    const { data } = await supabaseClient.auth.getSession();
    authenticatedEmail = data?.session?.user?.email || "";
    if (!authenticatedEmail) throw new Error("No active Supabase login session. Log in first.");
    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setAuthState === "function") {
      window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: true, email: authenticatedEmail });
    }
  }

  async function token() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const t = data?.session?.access_token || "";
    if (!t) throw new Error("No active Supabase login token.");
    return t;
  }

  async function callAdmin(action, payload = {}) {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok === false) throw new Error(result?.message || result?.error || `HTTP ${response.status}`);
    return result;
  }

  function css() {
    return `
      #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;max-width:1180px;margin:22px auto 60px;padding:0 18px;color:#172033;box-sizing:border-box}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:18px;box-shadow:0 12px 30px rgba(23,32,51,.08);padding:18px;margin:14px 0}
      #${ROOT_ID} .se-title{font-size:32px;font-weight:950;letter-spacing:-.04em;color:#1f4f82;margin:0 0 6px}
      #${ROOT_ID} .se-sub{font-size:14px;line-height:1.45;color:#58657a;font-weight:750;margin:0}
      #${ROOT_ID} .se-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
      #${ROOT_ID} label{display:grid;gap:5px;font-size:12px;font-weight:950;color:#334155}
      #${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{min-height:34px;border:1px solid #cbd5e1;border-radius:10px;padding:7px 9px;font:inherit;font-size:13px;background:#fff;color:#172033}
      #${ROOT_ID} textarea{min-height:70px;width:100%}
      #${ROOT_ID} button{border:0;border-radius:999px;background:#1f4f82;color:#fff;font-weight:950;padding:10px 14px;cursor:pointer}
      #${ROOT_ID} button.secondary{background:#eef3f8;color:#1f4f82;border:1px solid #cbd5e1}
      #${ROOT_ID} button.warn{background:#991b1b;color:#fff}
      #${ROOT_ID} button:disabled{opacity:.5;cursor:not-allowed}
      #${ROOT_ID} a.se-login-link{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#1f4f82;color:#fff;font-weight:950;padding:10px 14px;text-decoration:none}
      #${ROOT_ID} .se-unsaved{color:#9a3412;font-size:12px;font-weight:950}
      #${ROOT_ID} .se-status{border-radius:14px;padding:10px 12px;background:#eef3f8;color:#1f4f82;font-weight:850;margin-top:12px}
      #${ROOT_ID} .se-status[data-type='success']{background:#e7f6ec;color:#14532d}
      #${ROOT_ID} .se-status[data-type='warn']{background:#fff7ed;color:#9a3412}
      #${ROOT_ID} .se-status[data-type='error']{background:#fee2e2;color:#991b1b}
      #${ROOT_ID} .se-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${ROOT_ID} .se-table-wrap{overflow:auto;border:1px solid #d9e0ea;border-radius:14px}
      #${ROOT_ID} table{width:100%;border-collapse:collapse;min-width:900px;background:#fff}
      #${ROOT_ID} th,#${ROOT_ID} td{border-bottom:1px solid #edf2f7;padding:8px;text-align:left;font-size:12px;vertical-align:top}
      #${ROOT_ID} th{background:#f8fafc;color:#334155;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      #${ROOT_ID} .pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:950;background:#eef3f8;color:#1f4f82;white-space:nowrap}
      #${ROOT_ID} .pill.warn{background:#fff7ed;color:#9a3412}.pill.danger{background:#fee2e2;color:#991b1b}.pill.ok{background:#e7f6ec;color:#14532d}
      #${ROOT_ID} .privacy-box{border:3px solid #991b1b;background:#fff7f7;color:#7f1d1d;border-radius:16px;padding:14px;font-weight:850;line-height:1.45}
      #${ROOT_ID} .preview-row{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin:7px 0}.preview-row strong{background:#1f4f82;color:#fff;border-radius:999px;padding:6px 9px;text-align:center;font-size:11px}.preview-row span a{display:inline-flex;margin:2px 3px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:999px;text-decoration:none;color:#1f4f82;font-weight:900;font-size:11px;background:#fff}
      #${ROOT_ID} pre{white-space:pre-wrap;background:#0f172a;color:#dbeafe;border-radius:14px;padding:12px;max-height:260px;overflow:auto;font-size:12px}
      @media(max-width:800px){#${ROOT_ID} .se-grid{grid-template-columns:1fr}}
    `;
  }

  function riskBadge(risk) {
    const k = key(risk).replace(/-/g, "_");
    if (k === "low_public") return `<span class="pill ok">low public</span>`;
    if (k === "normal_restricted") return `<span class="pill warn">normal restricted</span>`;
    return `<span class="pill danger">${esc(k.replaceAll("_", " "))}</span>`;
  }

  function accessByPageId() {
    const map = new Map();
    for (const setting of arr(setup?.access_settings)) map.set(clean(setting.customer_page_id), setting);
    return map;
  }

  function pageById() {
    const map = new Map();
    for (const page of arr(setup?.pages)) map.set(clean(page.customer_page_id), page);
    return map;
  }

  function canMakePublic(setting) {
    const risk = key(setting.risk_level).replace(/-/g, "_");
    if (!SENSITIVE_RISKS.has(risk)) return true;
    if (HARD_BLOCK_PUBLIC_RISKS.has(risk)) return false;
    return setting.public_renderer_enabled === true && setting.dangerous_public_allowed === true;
  }

  function renderAccessOptions(setting) {
    const current = clean(setting.access_level || "user");
    return ACCESS_OPTIONS.map(([value, label]) => {
      const disabled = value === "public" && current !== "public" && !canMakePublic(setting);
      return `<option value="${esc(value)}" ${value === current ? "selected" : ""} ${disabled ? "disabled" : ""}>${esc(label)}${disabled ? " — blocked" : ""}</option>`;
    }).join("");
  }

  function input(name, value, attrs = "") {
    return `<input data-field="${esc(name)}" value="${esc(value ?? "")}" ${attrs}>`;
  }

  function select(name, value, options, attrs = "") {
    return `<select data-field="${esc(name)}" ${attrs}>${options.map((opt) => {
      const v = Array.isArray(opt) ? opt[0] : opt;
      const l = Array.isArray(opt) ? opt[1] : opt;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`;
    }).join("")}</select>`;
  }

  function checked(value) {
    return value === false ? "" : "checked";
  }

  function renderRowsTable() {
    const rows = arr(setup?.rows);
    return `<div class="se-table-wrap"><table><thead><tr><th>Row key</th><th>Row label</th><th>Sort</th><th>Visibility</th><th>Enabled</th></tr></thead><tbody>${rows.map((row) => `
      <tr data-row-id="${esc(row.navigation_row_id)}">
        <td><span class="pill">${esc(row.row_key)}</span></td>
        <td>${input("row_label", row.row_label)}</td>
        <td>${input("sort_order", row.sort_order, "type='number' step='1'")}</td>
        <td>${select("visibility_rule", row.visibility_rule, [["always","Always"],["authenticated_user","Logged-in user"],["organization_admin","Organization admin"],["platform_admin","Platform admin"],["hidden","Hidden"]])}</td>
        <td><input data-field="is_enabled" type="checkbox" ${checked(row.is_enabled)}></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderItemsTable() {
    const accessMap = accessByPageId();
    const items = arr(setup?.items);
    return `<div class="se-table-wrap"><table><thead><tr><th>Link</th><th>Header label</th><th>Row</th><th>Sort</th><th>Shown</th><th>Actual access</th><th>Risk</th></tr></thead><tbody>${items.map((item) => {
      const setting = accessMap.get(clean(item.customer_page_id)) || obj(item.settings_json);
      return `<tr data-item-id="${esc(item.navigation_item_id)}">
        <td><strong>${esc(item.item_key)}</strong><br><span class="pill">${esc(item.href || "")}</span></td>
        <td>${input("nav_label", item.nav_label)}</td>
        <td>${select("row_key", item.row_key, ROW_OPTIONS.map((r) => [r, r.toUpperCase()]))}</td>
        <td>${input("sort_order", item.sort_order, "type='number' step='1'")}</td>
        <td><input data-field="show_in_header" type="checkbox" ${checked(item.show_in_header)}></td>
        <td>${esc(setting.access_level || obj(item.settings_json).access_level || "")}</td>
        <td>${riskBadge(setting.risk_level || obj(item.settings_json).risk_level || "")}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderAccessTable() {
    const settings = arr(setup?.access_settings);
    const pages = pageById();
    return `<div class="se-table-wrap"><table><thead><tr><th>Page</th><th>Actual access/security</th><th>Risk</th><th>Public-safe renderer</th><th>Commercial safeguard</th></tr></thead><tbody>${settings.map((setting) => {
      const page = pages.get(clean(setting.customer_page_id)) || {};
      const risk = key(setting.risk_level).replace(/-/g, "_");
      const blocked = !canMakePublic(setting) && setting.access_level !== "public" && SENSITIVE_RISKS.has(risk);
      return `<tr data-access-id="${esc(setting.page_access_setting_id)}" data-risk="${esc(risk)}" data-page-key="${esc(setting.page_key)}">
        <td><strong>${esc(setting.page_key)}</strong><br><span class="pill">${esc(page.nav_label || page.page_slug || "")}</span></td>
        <td><select data-field="access_level">${renderAccessOptions(setting)}</select></td>
        <td>${riskBadge(setting.risk_level)}<input data-field="risk_level" type="hidden" value="${esc(setting.risk_level)}"></td>
        <td>${setting.public_renderer_enabled ? `<span class="pill ok">enabled</span>` : `<span class="pill warn">not approved</span>`}</td>
        <td>${blocked ? `<span class="pill danger">public blocked</span>` : `<span class="pill ok">safe boundary</span>`}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderPreview() {
    const rowLabels = new Map(arr(setup?.rows).map((row) => [key(row.row_key), clean(row.row_label || row.row_key)]));
    const items = arr(setup?.items).filter((item) => item.show_in_header !== false && key(item.status || "published") === "published");
    const byRow = new Map();
    for (const item of items) {
      const row = key(item.row_key || "public");
      const list = byRow.get(row) || [];
      list.push(item);
      byRow.set(row, list);
    }
    return ["public", "user", "admin", "platform"].map((row) => {
      const links = (byRow.get(row) || []).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      if (!links.length) return "";
      return `<div class="preview-row"><strong>${esc(rowLabels.get(row) || row.toUpperCase())}</strong><span>${links.map((item) => `<a>${esc(item.nav_label || item.item_key)}</a>`).join("")}</span></div>`;
    }).join("");
  }

  function render() {
    const r = root();
    const selectedOrg = organizations.find((o) => clean(o.organization_id) === selectedOrganizationId) || {};
    const needsLogin = !authenticatedEmail && /No active Supabase login session/i.test(lastErrorMessage || "");
    r.innerHTML = `<style>${css()}</style>
      <section class="se-card">
        <h1 class="se-title">Header / Navigation Setup</h1>
        <p class="se-sub">Platform-admin configuration for header recipes, row labels, page/link labels, row placement, order, show/hide, and privacy-first access boundaries. Unknown and sensitive pages are private by default.</p>
        <div class="se-toolbar">
          <label>Organization<select id="se-org-select">${organizations.map((org) => `<option value="${esc(org.organization_id)}" ${clean(org.organization_id) === selectedOrganizationId ? "selected" : ""}>${esc(org.display_name || org.organization_key)}</option>`).join("")}</select></label>
          <button id="se-refresh" class="secondary" type="button">Refresh</button>
          <button id="se-save" type="button" ${setup ? "" : "disabled"}>Save Header/Nav Setup</button>
          ${authenticatedEmail ? `<span class="pill">${esc(authenticatedEmail)}</span>` : `<a class="se-login-link" href="${esc(loginUrl())}">Log in</a>`}
          <span id="se-unsaved-flag" class="se-unsaved"></span>
          <span class="pill">${esc(VERSION)}</span>
        </div>
        <div id="se-nav-status" class="se-status">${needsLogin ? `No active Supabase login session. <a href="${esc(loginUrl())}">Log in here</a>, then return to this page.` : setup ? `Loaded ${esc(selectedOrg.display_name || "organization")}` : "Loading..."}</div>
      </section>

      ${setup ? `<section class="se-card">
        <h2>Header layout</h2>
        <div class="se-grid">
          <label>Profile name${input("profile_name", setup.profile?.profile_name || "", "data-profile='true'")}</label>
          <label>Header recipe${select("header_layout_key", setup.profile?.header_layout_key || setup.profile?.header_recipe_key || "standard_horizontal", [["standard_horizontal","Standard horizontal"],["compact_horizontal","Compact horizontal"],["two_row","Two row"],["dropdowns","Dropdown groups"],["minimal_login_only","Minimal login only + menu"],["side_menu","Side menu"],["hybrid_top_and_side","Hybrid top + side"]], "data-profile='true'")}</label>
          <label><span>Show organization context sub-row <small>(the duplicate org-name/key row)</small></span><input data-profile="true" data-field="show_org_context_row" type="checkbox" ${setup.profile?.show_org_context_row ? "checked" : ""}></label>
          <label><span>Show login / logout button</span><input data-profile="true" data-field="show_logout_button" type="checkbox" ${checked(setup.profile?.show_logout_button)}></label>
        </div>
      </section>

      <section class="se-card"><h2>Row setup</h2>${renderRowsTable()}</section>
      <section class="se-card"><h2>Navigation links</h2>${renderItemsTable()}</section>
      <section class="se-card"><h2>Actual page access / security</h2><div class="privacy-box">Commercial safeguard: moving a link to the Public row does not make its data public. Sensitive pages cannot become public unless a public-safe renderer is explicitly approved by the backend.</div>${renderAccessTable()}</section>
      <section class="se-card"><h2>Preview</h2>${renderPreview()}</section>
      <section class="se-card"><h2>Save note and dangerous-change confirmation</h2><label>Reason/note<textarea id="se-note" placeholder="Why are you changing this header/navigation setup?"></textarea></label><label>Dangerous confirmation, only when required<input id="se-danger-confirmation" placeholder="Type I AM SURE when required"></label></section>` : ""}

      <section class="se-card"><h2>Backend result</h2><pre id="se-nav-output"></pre></section>`;

    bindEvents();
  }

  function cellValue(tr, field) {
    const el = tr.querySelector(`[data-field='${field}']`);
    if (!el) return undefined;
    if (el.type === "checkbox") return !!el.checked;
    if (el.type === "number") return Number(el.value || 0);
    return el.value;
  }

  function collectProfile() {
    const out = { navigation_profile_id: setup.profile.navigation_profile_id };
    root().querySelectorAll("[data-profile='true'][data-field]").forEach((el) => {
      out[el.dataset.field] = el.type === "checkbox" ? !!el.checked : el.value;
    });
    return out;
  }

  function collectRows() {
    return Array.from(root().querySelectorAll("tr[data-row-id]")).map((tr) => ({
      navigation_row_id: tr.dataset.rowId,
      row_label: cellValue(tr, "row_label"),
      sort_order: cellValue(tr, "sort_order"),
      visibility_rule: cellValue(tr, "visibility_rule"),
      is_enabled: cellValue(tr, "is_enabled"),
    }));
  }

  function collectItems() {
    return Array.from(root().querySelectorAll("tr[data-item-id]")).map((tr) => ({
      navigation_item_id: tr.dataset.itemId,
      nav_label: cellValue(tr, "nav_label"),
      row_key: cellValue(tr, "row_key"),
      sort_order: cellValue(tr, "sort_order"),
      show_in_header: cellValue(tr, "show_in_header"),
    }));
  }

  function collectAccessSettings() {
    return Array.from(root().querySelectorAll("tr[data-access-id]")).map((tr) => ({
      page_access_setting_id: tr.dataset.accessId,
      page_key: tr.dataset.pageKey,
      access_level: cellValue(tr, "access_level"),
      risk_level: cellValue(tr, "risk_level"),
    }));
  }

  function detectDangerousAttempt(accessSettings) {
    return accessSettings.find((setting) => {
      const existing = arr(setup.access_settings).find((row) => clean(row.page_access_setting_id) === clean(setting.page_access_setting_id));
      const risk = key(setting.risk_level || existing?.risk_level).replace(/-/g, "_");
      return setting.access_level === "public" && existing?.access_level !== "public" && SENSITIVE_RISKS.has(risk);
    });
  }

  async function save() {
    if (!setup) return;
    const accessSettings = collectAccessSettings();
    const dangerous = detectDangerousAttempt(accessSettings);
    const dangerousConfirmation = clean(document.getElementById("se-danger-confirmation")?.value || "");
    if (dangerous && dangerousConfirmation.toLowerCase() !== "i am sure") {
      setStatus(`Dangerous access change for ${dangerous.page_key}. Type I AM SURE to continue. Backend may still block it if no public-safe renderer exists.`, "error");
      return;
    }

    setStatus("Saving Header/Nav Setup...", "info");
    const result = await callAdmin("navigation_save_setup", {
      organization_id: selectedOrganizationId,
      profile: collectProfile(),
      rows: collectRows(),
      items: collectItems(),
      access_settings: accessSettings,
      dangerous_confirmation: dangerousConfirmation,
      note: clean(document.getElementById("se-note")?.value || "Header/Nav Setup save"),
    });
    setup = result.setup;
    setOutput(result);
    clearDirty();
    setStatus("Header/Nav Setup saved. Review live pages with ?syncetc_debug=1 after upload.", "success");
    render();
  }

  async function loadSetup(orgId) {
    selectedOrganizationId = orgId || selectedOrganizationId;
    setStatus("Loading navigation setup...", "info");
    const result = await callAdmin("navigation_get_setup", { organization_id: selectedOrganizationId });
    organizations = arr(result.organizations);
    setup = result.setup;
    selectedOrganizationId = clean(setup?.organization?.organization_id || selectedOrganizationId);
    setOutput(result);
    clearDirty();
    render();
  }

  function bindEvents() {
    document.getElementById("se-org-select")?.addEventListener("change", (event) => {
      if (hasUnsavedChanges && !window.confirm("Discard unsaved Header/Nav Setup changes and switch organization?")) return;
      loadSetup(event.target.value).catch(showError);
    });
    document.getElementById("se-refresh")?.addEventListener("click", () => {
      if (hasUnsavedChanges && !window.confirm("Discard unsaved Header/Nav Setup changes and refresh?")) return;
      loadSetup(selectedOrganizationId).catch(showError);
    });
    document.getElementById("se-save")?.addEventListener("click", () => save().catch(showError));
    root().querySelectorAll("input[data-field], select[data-field], textarea").forEach((el) => {
      if (el.id === "se-note" || el.id === "se-danger-confirmation") return;
      el.addEventListener("change", markDirty);
      el.addEventListener("input", markDirty);
    });
  }

  function showError(error) {
    console.error(error);
    lastErrorMessage = error?.message || String(error);
    if (/No active Supabase login session/i.test(lastErrorMessage)) render();
    setStatus(lastErrorMessage, "error");
    setOutput({ error: lastErrorMessage });
  }

  async function boot() {
    try {
      render();
      await initSupabase();
      const orgResult = await callAdmin("navigation_list_organizations");
      organizations = arr(orgResult.organizations);
      selectedOrganizationId = clean(organizations[0]?.organization_id || "");
      if (!selectedOrganizationId) throw new Error("No organizations found.");
      await loadSetup(selectedOrganizationId);
    } catch (error) {
      lastErrorMessage = error?.message || String(error);
      render();
      showError(error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
