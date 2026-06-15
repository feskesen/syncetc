// CUSTOMER-ADMIN-PAGE-organization-management-current.js
// Internal Version: 2026-06-14-114-H
// Purpose: Customer/organization-side Organization Management console runtime. Immutable admin workbench shell with left navigation and right-panel module loading.

(function () {
  "use strict";

  const VERSION = "2026-06-14-114-H";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const AIRCRAFT_ADMIN_SCRIPT_URL = "https://feskesen.github.io/syncetc/assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js";
  const ROOT_SELECTOR = "#syncetc-organization-management-root, #syncetc-organization-admin-console-root, [data-syncetc-page='organization-management']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";
  const DIRTY_MESSAGE = "You have unsaved module changes. Switch modules anyway?";

  let supabaseClient = null;
  let aircraftScriptLoading = null;

  const state = {
    debug: new URLSearchParams(location.search).get("syncetc_debug") === "1",
    startedAt: performance.now(),
    token: "",
    email: "",
    loading: true,
    error: "",
    status: "",
    accessRows: [],
    accessRow: null,
    orgId: "",
    orgOptions: [],
    activeModule: clean(new URLSearchParams(location.search).get("module")) || clean(new URLSearchParams(location.search).get("section")) || clean((location.hash || "").replace(/^#/, "")) || "overview",
    steps: [],
    lastResult: null,
    openGroup: null
  };

  function root() { return document.querySelector(ROOT_SELECTOR); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function attr(value) { return esc(value); }
  function mark(label, detail) { state.steps.push({ ms: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function markManagementWorkbenchPage() {
    try {
      document.documentElement.classList.add("syncetc-management-console-page");
      document.body.classList.add("syncetc-management-console-page");
    } catch {}
  }
  function ensureManagementPageMode() {
    try {
      document.documentElement.classList.add("syncetc-management-console-page");
      document.body?.classList?.add("syncetc-management-console-page");
    } catch {}
  }


  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (id) {
        const existingById = document.getElementById(id);
        if (existingById) {
          existingById.addEventListener("load", resolve, { once: true });
          existingById.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
          setTimeout(resolve, 25);
          return;
        }
      }
      if (!id && window.supabase && typeof window.supabase.createClient === "function" && src === SUPABASE_JS_URL) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        setTimeout(resolve, 25);
        return;
      }
      const script = document.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (window.syncetcSupabase && window.syncetcSupabase.auth) {
      supabaseClient = window.syncetcSupabase;
      return supabaseClient;
    }
    await loadScript(SUPABASE_JS_URL);
    const started = Date.now();
    while (!(window.supabase && typeof window.supabase.createClient === "function")) {
      if (Date.now() - started > 8000) throw new Error("Supabase JS did not load.");
      await wait(50);
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;
    return supabaseClient;
  }

  async function refreshToken() {
    await ensureSupabase();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data?.session?.access_token) throw new Error("Log in before using Organization Management.");
    state.token = data.session.access_token;
    state.email = data.session.user?.email || "";
    return state.token;
  }

  async function callAccess(action, payload = {}, retry = true) {
    const token = state.token || await refreshToken();
    const res = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action, ...payload })
    });
    let result = null;
    try { result = await res.json(); } catch { result = { ok: false, error: "non_json_response", text: await res.text() }; }
    state.lastResult = { action, http_status: res.status, result };
    const errText = lower(result && (result.error || result.message || ""));
    if (retry && (res.status === 401 || errText.includes("jwt") || errText.includes("auth"))) {
      await refreshToken();
      return callAccess(action, payload, false);
    }
    if (!res.ok || result?.ok === false) {
      const msg = clean(result?.message || result?.error || `HTTP ${res.status}`);
      throw new Error(msg || "Request failed.");
    }
    return result;
  }

  function hasOrgAdminAccess(row) {
    const perms = arr(row && row.permission_keys).map(String);
    const caps = obj(row && row.capabilities);
    return Boolean(row?.is_organization_admin)
      || Boolean(caps.can_view_organization_admin || caps.can_manage_settings || caps.can_manage_assets)
      || perms.includes("organization.view_admin")
      || perms.includes("organization.admin.open")
      || perms.includes("organization.manage_settings")
      || perms.includes("organization.super_admin")
      || perms.includes("assets.manage")
      || perms.includes("people.manage")
      || perms.includes("documents.manage");
  }

  function selectedRow() {
    return state.accessRow || state.accessRows.find(r => clean(r.organization_id) === state.orgId) || state.accessRows[0] || null;
  }

  function setShellState() {
    const row = selectedRow();
    try {
      window.SyncEtcPortalShell?.setState?.({
        authenticated: Boolean(state.token),
        email: state.email,
        mode: "org-admin",
        organizationName: row?.organization_name || row?.display_name || "",
        organizationKey: row?.organization_key || "",
        styleProfile: row?.style_profile || null,
        accessRow: row || null,
        organizationOptions: state.accessRows,
        selectedOrganizationId: state.orgId,
        platformAdmin: Boolean(row?.platform_admin),
        activePageKey: "organization-management"
      });
    } catch {}
  }

  function styleConfig() {
    const row = selectedRow();
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const primary = clean(colors.brand_primary) || "#1f4f82";
    const secondary = clean(colors.brand_secondary) || "#eef3f8";
    return {
      primary,
      secondary,
      text: "#172033",
      muted: "#667085",
      ink: "#101828",
      line: "#d0d5dd",
      page: "#f6f7f9",
      surface: "#ffffff",
      soft: hexToRgba(primary, 0.07),
      soft2: hexToRgba(primary, 0.12),
      danger: "#b42318",
      warning: "#b7791f",
      success: "#027a48",
      radius: "12px"
    };
  }

  function hexToRgba(hex, alpha) {
    const h = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(31,79,130,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  const MODULES = [
    { key: "overview", label: "Overview", short: "Console home", group: "Home", status: "active", kind: "overview", description: "Organization management home, module status map, and setup shortcuts." },

    { key: "people-members", label: "Members", short: "Member records", group: "People", status: "existing", href: "/organization-people", description: "Manage organization people, member records, lifecycle, roster visibility, and access links." },
    { key: "people-admins", label: "Administrators", short: "Admin access", group: "People", status: "placeholder", description: "Customer administrators, organization super admins, and delegated admin access." },
    { key: "people-groups", label: "Groups / Roles", short: "Permissions", group: "People", status: "placeholder", description: "Member groups, roles, permission bundles, and future mention groups." },
    { key: "people-instructors", label: "Instructors / Qualifications", short: "Qualifications", group: "People", status: "placeholder", description: "Instructor roster, checkouts, and qualification records." },

    { key: "assets-types", label: "Asset Types", short: "Aircraft, vehicles, spaces", group: "Assets", status: "placeholder", description: "Configure what this organization operates and what customer-facing word should be used." },
    { key: "assets-locations", label: "Spaces & Locations", short: "Locations", group: "Assets", status: "active", kind: "aircraft", aircraftView: "locations", description: "Manage shared locations such as airports, hangars, meeting rooms, offices, docks, storage, or other operating locations." },
    { key: "assets-aircraft", label: "Assets / Aircraft", short: "Fleet records", group: "Assets", status: "active", kind: "aircraft", aircraftView: "identity", description: "Manage aircraft identity, classification, status, visibility, usage, rates, media, and setup fields." },
    { key: "assets-rates", label: "Rates", short: "Rate setup", group: "Assets", status: "placeholder", href: "/aircraft-admin#rates", description: "Basic rate and usage-basis setup. Full billing/finance is not built yet." },
    { key: "assets-usage", label: "Usage / Meters", short: "Hobbs/Tach/usage", group: "Assets", status: "placeholder", href: "/aircraft-admin#usage", description: "Usage basis, Hobbs/Tach/current readings, and future hours logs." },
    { key: "assets-maintenance-reminders", label: "Maintenance Reminders", short: "Due items", group: "Assets", status: "placeholder", href: "/aircraft-admin#maintenance", description: "Recurring aircraft/asset reminders by date, hours, or other basis." },
    { key: "assets-squawks", label: "Squawks / Discrepancies", short: "Maintenance issues", group: "Assets", status: "placeholder", description: "Operational discrepancy reporting and resolution workflow. Maintenance/squawk system remains separate from forum discussions." },

    { key: "website-header-nav", label: "Header & Navigation", short: "Site navigation", group: "Website & Portal", status: "existing", href: "/header-navigation-setup", description: "Manage public/member/admin nav labels, rows, visibility, and header recipes." },
    { key: "website-dashboard", label: "Dashboard Settings", short: "Quick links/weather", group: "Website & Portal", status: "existing", href: "/organization-settings#dashboard", description: "Dashboard quick links, weather airports, and display preferences." },
    { key: "website-applicant", label: "Applicant Portal", short: "Applicant settings", group: "Website & Portal", status: "existing", href: "/applicant-tracker", description: "Applicant workflow, portal visibility, update permissions, and application settings." },
    { key: "website-public-pages", label: "Public Pages", short: "Page setup", group: "Website & Portal", status: "existing", href: "/page-setup", description: "Page inventory, publishing status, and public/customer page controls." },

    { key: "comm-forum", label: "Message Board / Forum", short: "Forum settings", group: "Communication", status: "existing", href: "/forum", description: "Member message board categories, discussion settings, mention groups, and moderation groundwork." },
    { key: "comm-contact", label: "Contact Tracker", short: "Public inquiries", group: "Communication", status: "existing", href: "/contact-tracker", description: "Customer contact requests, replies, and contact workflow." },
    { key: "comm-notices", label: "Notices", short: "Announcements", group: "Communication", status: "placeholder", description: "Member/admin notices and future internal announcements." },

    { key: "docs-public", label: "Public Documents", short: "Public resources", group: "Documents", status: "existing", href: "/documents", description: "Documents/resources visible to visitors where enabled." },
    { key: "docs-member", label: "Member Documents", short: "Member resources", group: "Documents", status: "existing", href: "/member-documents", description: "Member-only documents and resource library." },
    { key: "docs-internal", label: "Internal Documents", short: "Admin documents", group: "Documents", status: "existing", href: "/internal-documents", description: "Admin/internal documents, minutes, records, and restricted files." },

    { key: "store-products", label: "Products / Services", short: "Store catalog", group: "Store", status: "placeholder", description: "Placeholder for FBO/store product or service catalog." },
    { key: "store-orders", label: "Orders / Requests", short: "Store activity", group: "Store", status: "placeholder", description: "Placeholder for future orders, requests, and fulfillment." },
    { key: "store-settings", label: "Store Settings", short: "Store controls", group: "Store", status: "placeholder", description: "Placeholder for store settings and customer-specific commerce controls." },

    { key: "settings-basics", label: "Organization Basics", short: "Name/details", group: "Settings", status: "existing", href: "/organization-settings#basics", description: "Organization-level settings and profile basics." },
    { key: "settings-branding", label: "Branding / Layout", short: "Colors/layout", group: "Settings", status: "existing", href: "/organization-settings#style", description: "Brand colors, layout settings, dashboard recipes, and style controls." },
    { key: "settings-alerts", label: "Alert Colors", short: "System colors", group: "Settings", status: "existing", href: "/organization-settings#alerts", description: "Customer system alert colors for attention/warning/success states." },
    { key: "settings-integrations", label: "Integrations", short: "External services", group: "Settings", status: "placeholder", description: "Email, weather, scheduling, accounting, and future integration controls." }
  ];

  const GROUPS = (() => {
    const map = new Map();
    MODULES.forEach(m => {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group).push(m);
    });
    return Array.from(map.entries()).map(([group, modules]) => ({ group, modules }));
  })();

  function findModule(key) { return MODULES.find(m => m.key === key) || MODULES.find(m => m.key === "overview"); }
  function activeModule() { return findModule(state.activeModule); }
  function moduleCanEmbed(m) { return m && (m.kind === "overview" || m.kind === "aircraft"); }
  function activeGroupName() { return activeModule().group || "Home"; }
  function isKnownNonHomeGroup(group) {
    return Boolean(group && group !== "Home" && GROUPS.some(g => g.group === group));
  }

  function openGroupName() {
    if (state.openGroup !== null && state.openGroup !== undefined) return state.openGroup;
    const activeGroup = activeGroupName();
    return activeGroup && activeGroup !== "Home" ? activeGroup : "";
  }
  async function boot() {
    markManagementWorkbenchPage();
    const el = root();
    if (!el) return;
    renderLoading();
    try {
      mark("boot:start");
      await ensureSupabase();
      await refreshToken();
      await loadAccess();
      state.loading = false;
      setShellState();
      render();
    } catch (error) {
      state.loading = false;
      state.error = error?.message || String(error);
      render();
    }
  }

  async function loadAccess() {
    mark("loadAccess:start");
    const result = await callAccess("get_my_access");
    const rows = arr(result.access).filter(hasOrgAdminAccess);
    state.accessRows = rows;
    state.orgOptions = rows.map(row => ({
      organization_id: clean(row.organization_id),
      organization_key: clean(row.organization_key),
      display_name: clean(row.organization_name || row.display_name || row.organization_key || row.organization_id)
    }));
    const stored = localStorage.getItem(SELECTED_ORG_KEY) || "";
    const preferred = rows.find(row => clean(row.organization_id) === stored || clean(row.organization_key) === stored) || rows[0] || null;
    if (!preferred) throw new Error("You do not have organization admin access for Organization Management.");
    state.accessRow = preferred;
    state.orgId = clean(preferred.organization_id);
    try { localStorage.setItem(SELECTED_ORG_KEY, state.orgId); } catch {}
    mark("loadAccess:done", `${rows.length} organization admin rows`);
  }

  function renderLoading() {
    const el = root();
    if (!el) return;
    el.innerHTML = `<div class="omg-loading">Loading Organization Management…</div>`;
  }

  function render() {
    ensureManagementPageMode();
    const el = root();
    if (!el) return;
    const cfg = styleConfig();
    if (state.loading) return renderLoading();
    if (state.error) {
      el.innerHTML = `<style>${css(cfg)}</style><div class="omg-wrap"><div class="omg-error"><h2>Organization Management could not load</h2><p>${esc(state.error)}</p><small>Version ${VERSION}</small></div>${debugPanel()}</div>`;
      return;
    }
    const row = selectedRow();
    const orgName = clean(row?.organization_name || row?.display_name || row?.organization_key) || "Organization";
    const active = activeModule();
    el.innerHTML = `
      <style>${css(cfg)}</style>
      <div class="omg-wrap" style="--omg-primary:${cfg.primary};--omg-soft:${cfg.soft};--omg-soft2:${cfg.soft2};--omg-text:${cfg.text};--omg-surface:${cfg.surface};--omg-radius:${cfg.radius};">
        <section class="omg-topbar">
          <div class="omg-topbar-title">
            <div>
              <span class="omg-kicker">Organization Management</span>
            </div>
          </div>
          <div class="omg-topbar-actions">${renderOrgSelect()}</div>
        </section>
        <section class="omg-console">
          <aside class="omg-leftnav" aria-label="Organization management modules">${renderLeftNav()}</aside>
          <main class="omg-main">
            ${renderModuleBody(active)}
          </main>
        </section>
        ${state.status ? `<div class="omg-status">${esc(state.status)}</div>` : ""}
        ${debugPanel()}
      </div>`;
    bindEvents();
    mountActiveModule(active).catch(error => showModuleError(error));
  }

  function renderOrgSelect() {
    if (state.orgOptions.length <= 1) return `<span class="omg-org-chip">${esc(state.orgOptions[0]?.display_name || "Selected organization")}</span>`;
    return `<label class="omg-org-select"><span>Organization</span><select id="omg-org-select">${state.orgOptions.map(o => `<option value="${attr(o.organization_id)}" ${o.organization_id === state.orgId ? "selected" : ""}>${esc(o.display_name)}</option>`).join("")}</select></label>`;
  }

  function renderLeftNav() {
    const openGroup = openGroupName();
    return GROUPS.map(group => {
      const isHome = group.group === "Home";
      const isOpen = isHome || group.group === openGroup;
      const caret = isHome ? "" : `<span class="omg-caret" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>`;
      return `<div class="omg-nav-group ${isOpen ? "open" : "closed"}">
        <button type="button" class="omg-nav-group-title ${isOpen ? "open" : ""}" data-nav-group="${attr(group.group)}" aria-expanded="${isOpen ? "true" : "false"}" ${isHome ? 'aria-disabled="true"' : ""}>
          <span>${esc(group.group)}</span>
          ${caret}
        </button>
        <div class="omg-nav-items" ${isOpen ? "" : "hidden"}>
          ${group.modules.map(m => `<button type="button" class="omg-nav-item ${m.key === state.activeModule ? "active" : ""}" data-module="${attr(m.key)}"><span class="omg-nav-label">${esc(m.label)}<small>${esc(m.short || "")}</small></span>${statusPill(m.status)}</button>`).join("")}
        </div>
      </div>`;
    }).join("");
  }

  function renderModuleHeader(active) {
    const canOpen = active.href && active.status === "existing";
    return `<div class="omg-module-header">
      <div>
        <span class="omg-kicker">${esc(active.group || "Module")}</span>
        <h2>${esc(active.label)}</h2>
        <p>${esc(active.description || "")}</p>
      </div>
      <div class="omg-module-actions">
        ${statusPill(active.status)}
        ${canOpen ? `<a class="omg-btn primary" href="${attr(active.href)}">Open standalone</a>` : ""}
      </div>
    </div>`;
  }

  function renderModuleBody(active) {
    if (active.kind === "overview") return renderOverview();
    if (active.kind === "aircraft") {
      return `<section class="omg-embedded-panel">
        <div id="syncetc-organization-aircraft-admin-root" class="omg-module-host" data-syncetc-embedded-module="organization-management" data-syncetc-embedded-view="${attr(active.aircraftView || "identity")}"></div>
      </section>`;
    }
    if (active.status === "existing") return renderExistingPanel(active);
    return renderPlaceholderPanel(active);
  }

  function renderOverview() {
    const active = MODULES.filter(m => m.status === "active");
    const existing = MODULES.filter(m => m.status === "existing");
    const placeholder = MODULES.filter(m => m.status === "placeholder");
    return `<div class="omg-grid two">
      <div class="omg-card"><h3>Active modules</h3><p class="omg-muted">Ready to use in this management console.</p><div class="omg-mini-list">${active.map(renderMiniModule).join("")}</div></div>
      <div class="omg-card"><h3>Existing modules</h3><p class="omg-muted">Available organization tools that can be opened from here.</p><div class="omg-mini-list">${existing.slice(0, 10).map(renderMiniModule).join("")}</div></div>
      <div class="omg-card wide"><h3>Placeholder modules</h3><p class="omg-muted">Future management areas shown so the organization structure is easy to understand.</p><div class="omg-placeholder-grid">${placeholder.map(renderPlaceholderChip).join("")}</div></div>
      <div class="omg-card wide"><h3>Management structure</h3><p>This console organizes customer-side management into one consistent workbench. Use the navigation on the left to manage people, assets, website/portal settings, communications, documents, store placeholders, and organization settings.</p><div class="omg-note-row"><span>Daily member landing page</span><strong>Member Dashboard</strong></div><div class="omg-note-row"><span>Customer management</span><strong>Organization Management</strong></div><div class="omg-note-row"><span>Operational tasks</span><strong>Module pages and admin notices</strong></div></div>
    </div>`;
  }

  function renderExistingPanel(active) {
    return `<section class="omg-card module-state"><h3>${esc(active.label)}</h3><p>${esc(active.description || "")}</p>${active.href ? `<a class="omg-btn primary" href="${attr(active.href)}">Open ${esc(active.label)}</a>` : ""}</section>`;
  }

  function renderPlaceholderPanel(active) {
    return `<section class="omg-card module-state"><h3>${esc(active.label)}</h3><p>${esc(active.description || "")}</p><p>This management area is not available yet.</p></section>`;
  }

  function renderMiniModule(m) {
    return `<button type="button" class="omg-mini-module" data-module="${attr(m.key)}"><strong>${esc(m.label)}</strong><span>${esc(m.short || "")}</span>${statusPill(m.status)}</button>`;
  }

  function renderPlaceholderChip(m) {
    return `<button type="button" class="omg-placeholder-chip" data-module="${attr(m.key)}"><span>${esc(m.label)}</span><small>${esc(m.group)}</small></button>`;
  }

  function statusPill(status) {
    const label = status === "active" ? "Active" : status === "existing" ? "Existing" : status === "placeholder" ? "Placeholder" : "";
    return label ? `<span class="omg-pill ${attr(status)}">${esc(label)}</span>` : "";
  }

  function hasActiveModuleUnsavedChanges() {
    const active = activeModule();
    if (active.kind === "aircraft") {
      if (window.SyncEtcAircraftAdmin?.isDirty?.()) return true;
      if (window.SyncEtcAircraftAdminPage?.hasUnsavedChanges?.()) return true;
    }
    return false;
  }

  function confirmModuleSwitch() {
    const active = activeModule();
    if (active.kind === "aircraft") {
      const dirty = window.SyncEtcAircraftAdmin?.isDirty?.() || window.SyncEtcAircraftAdminPage?.hasUnsavedChanges?.();
      if (dirty) {
        if (typeof window.SyncEtcAircraftAdmin?.confirmDiscard === "function") return window.SyncEtcAircraftAdmin.confirmDiscard(DIRTY_MESSAGE);
        if (typeof window.SyncEtcAircraftAdminPage?.confirmDiscard === "function") return window.SyncEtcAircraftAdminPage.confirmDiscard(DIRTY_MESSAGE);
        return window.confirm(DIRTY_MESSAGE);
      }
    }
    return true;
  }

  function setActiveModule(key, replace = false) {
    const next = findModule(key);
    if (!next || next.key === state.activeModule) return;
    if (!confirmModuleSwitch()) return;
    state.activeModule = next.key;
    state.openGroup = next.group && next.group !== "Home" ? next.group : "";
    try {
      const params = new URLSearchParams(location.search);
      params.set("module", next.key);
      params.delete("section");
      if (state.debug) params.set("syncetc_debug", "1");
      const url = `${location.pathname}?${params.toString()}`;
      if (replace) history.replaceState(null, "", url); else history.pushState(null, "", url);
    } catch {}
    render();
  }

  async function mountActiveModule(active) {
    if (!active || active.kind !== "aircraft") return;
    const host = document.getElementById("syncetc-organization-aircraft-admin-root");
    if (!host) return;
    window.SyncEtcOrganizationManagementModuleContext = window.SyncEtcOrganizationManagementModuleContext || {};
    window.SyncEtcOrganizationManagementModuleContext.aircraft = {
      embedded: true,
      activeTab: active.aircraftView || "identity",
      organizationId: state.orgId,
      selectedOrganizationId: state.orgId,
      parentVersion: VERSION
    };
    host.innerHTML = `<div class="omg-module-loading">Loading Aircraft Admin…</div>`;
    window.SyncEtcAircraftAdminSuppressAutoBoot = true;
    const mountFn = () => window.SyncEtcAircraftAdmin?.mount || window.SyncEtcAircraftAdminPage?.mount;
    if (!mountFn()) {
      if (!aircraftScriptLoading) aircraftScriptLoading = loadScript(AIRCRAFT_ADMIN_SCRIPT_URL, "syncetc-aircraft-admin-module-script");
      await aircraftScriptLoading;
    }
    const started = Date.now();
    while (!mountFn()) {
      if (Date.now() - started > 8000) throw new Error("Aircraft Admin module did not become ready.");
      await wait(50);
    }
    await mountFn()(host, { embedded: true, organizationId: state.orgId, initialView: active.aircraftView || "identity", initialTab: active.aircraftView || "identity", parentVersion: VERSION });
  }

  function showModuleError(error) {
    const host = document.getElementById("syncetc-organization-aircraft-admin-root");
    if (host) host.innerHTML = `<div class="omg-error"><h3>Module could not load</h3><p>${esc(error?.message || String(error))}</p></div>`;
  }

  function bindEvents() {
    document.querySelectorAll("[data-nav-group]").forEach(btn => btn.addEventListener("click", () => {
      const group = clean(btn.getAttribute("data-nav-group"));
      if (!group || group === "Home") return;
      const currentlyOpen = group === openGroupName();
      if (!currentlyOpen) {
        state.openGroup = group;
        render();
        return;
      }
      if (activeGroupName() === group && state.activeModule !== "overview") {
        setActiveModule("overview");
        return;
      }
      state.openGroup = "";
      render();
    }));
    document.querySelectorAll("[data-module]").forEach(btn => btn.addEventListener("click", () => setActiveModule(clean(btn.getAttribute("data-module")))));
    const orgSelect = document.getElementById("omg-org-select");
    if (orgSelect) orgSelect.addEventListener("change", () => {
      if (!confirmModuleSwitch()) { orgSelect.value = state.orgId; return; }
      const id = clean(orgSelect.value);
      const row = state.accessRows.find(r => clean(r.organization_id) === id);
      if (!row) return;
      state.orgId = id;
      state.accessRow = row;
      try { localStorage.setItem(SELECTED_ORG_KEY, id); } catch {}
      setShellState();
      render();
    });
  }

  function debugPanel() {
    if (!state.debug) return "";
    return `<details class="omg-debug"><summary>Organization Management diagnostics</summary><pre>${esc(JSON.stringify({ version: VERSION, email: state.email, orgId: state.orgId, activeModule: state.activeModule, activeUnsaved: hasActiveModuleUnsavedChanges(), accessRows: state.accessRows.length, steps: state.steps, lastResult: state.lastResult }, null, 2))}</pre></details>`;
  }

  function css(cfg) {
    return `
      .syncetc-management-console-page #syncetc-organization-header .syncetc-org-header{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important;}
      .syncetc-management-console-page #syncetc-organization-header{width:100%!important;}
      ${ROOT_SELECTOR}{display:block;width:100vw;max-width:none;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);box-sizing:border-box;}
      .omg-wrap{width:100vw;max-width:none;margin:0;padding:8px clamp(8px,1vw,16px) 50px;color:${cfg.text};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:${cfg.page};box-sizing:border-box;min-width:0;}
      .omg-loading,.omg-error{max-width:980px;margin:40px auto;padding:24px;border:1px solid ${cfg.line};border-radius:${cfg.radius};background:#fff;box-shadow:0 12px 30px rgba(16,24,40,.08);}
      .omg-error{border-color:#fca5a5;background:#fff7f7;color:#7f1d1d;}
      .omg-topbar{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:8px 12px;border:1px solid ${cfg.line};border-radius:10px;background:#fff;box-shadow:0 4px 12px rgba(16,24,40,.07);margin-bottom:8px;border-top:3px solid ${cfg.primary};}
      .omg-topbar-title{display:flex;align-items:center;gap:10px;min-width:0;}
      .omg-topbar h1{font-size:20px;line-height:1.1;margin:3px 0 0;color:${cfg.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .omg-rail-toggle{width:34px;height:34px;border:1px solid ${cfg.line};border-radius:10px;background:#fff;color:${cfg.primary};font-size:20px;font-weight:900;cursor:pointer;}
      .omg-kicker{display:inline-flex;padding:5px 9px;border-radius:999px;background:${cfg.soft};color:${cfg.primary};font-size:11px;text-transform:uppercase;font-weight:950;letter-spacing:.06em;}
      .omg-topbar-actions{display:flex;gap:8px;align-items:center;flex-direction:row;min-width:0;flex-wrap:wrap;justify-content:flex-end;}
      .omg-version,.omg-org-chip{display:inline-flex;padding:8px 10px;border-radius:999px;background:${cfg.soft};border:1px solid ${cfg.soft2};font-weight:850;color:${cfg.primary};}
      .omg-org-select{display:grid;gap:5px;font-size:12px;font-weight:900;color:${cfg.muted};text-transform:uppercase;}
      .omg-org-select select{min-width:220px;border:1px solid ${cfg.line};border-radius:999px;padding:9px 12px;background:#fff;color:${cfg.text};font-weight:800;}
      .omg-console{display:grid;grid-template-columns:290px minmax(0,1fr);gap:10px;align-items:start;width:100%;min-width:0;}
      .omg-leftnav{position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto;border:1px solid ${cfg.line};border-radius:10px;background:#fff;box-shadow:0 6px 18px rgba(16,24,40,.07);padding:8px;}
      .omg-nav-group{padding:5px 0;border-bottom:1px solid #eef2f7;}.omg-nav-group:last-child{border-bottom:0;}
      .omg-nav-group-title{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;background:transparent;color:${cfg.muted};font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;margin:0;padding:7px 8px;border-radius:8px;text-align:left;cursor:pointer;}.omg-nav-group-title:hover{background:${cfg.soft};}.omg-nav-group-title[aria-disabled="true"]{cursor:default;opacity:1;}.omg-caret{font-size:14px;color:${cfg.primary};font-weight:950;line-height:1;display:inline-flex;min-width:16px;justify-content:center;}
      .omg-nav-items{display:grid;gap:4px;padding:2px 0 4px;}.omg-nav-items[hidden]{display:none!important;}.omg-nav-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px;border:0;border-radius:9px;background:transparent;color:${cfg.text};font-weight:850;text-align:left;cursor:pointer;}
      .omg-nav-item:hover{background:${cfg.soft};}.omg-nav-item.active{background:${cfg.primary};color:#fff;}.omg-nav-label{display:grid;gap:2px;min-width:0;}.omg-nav-label small{font-size:11px;opacity:.74;font-weight:750;}
      .omg-nav-item.active .omg-pill{background:rgba(255,255,255,.18);color:#fff;border-color:rgba(255,255,255,.24);}
      .omg-main{min-width:0;display:grid;gap:10px;overflow:hidden;}.omg-module-header,.omg-card,.omg-embedded-panel{border:1px solid ${cfg.line};border-radius:10px;background:#fff;box-shadow:0 6px 18px rgba(16,24,40,.07);}
      .omg-module-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:13px 16px;}
      .omg-module-header h2{margin:6px 0 4px;font-size:25px;line-height:1.1;color:${cfg.ink};}.omg-module-header p{margin:0;color:${cfg.muted};font-weight:650;}
      .omg-module-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
      .omg-btn,.omg-link{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border-radius:999px;border:1px solid ${cfg.primary};background:#fff;color:${cfg.primary};padding:8px 13px;font-weight:900;text-decoration:none;cursor:pointer;}.omg-btn.primary{background:${cfg.primary};color:#fff;}
      .omg-grid{display:grid;gap:14px;}.omg-grid.two{grid-template-columns:1fr 1fr;}.omg-card{padding:16px 18px;}.omg-card.wide{grid-column:1 / -1;}.omg-card h3{margin:0 0 6px;font-size:21px;color:${cfg.ink};}.omg-muted{color:${cfg.muted};font-weight:650;}
      .omg-mini-list{display:grid;gap:8px;margin-top:12px;}.omg-mini-module{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;border:1px solid ${cfg.line};border-radius:12px;background:#fff;padding:10px 12px;text-align:left;cursor:pointer;}.omg-mini-module:hover{border-color:${cfg.primary};background:${cfg.soft};}.omg-mini-module strong{color:${cfg.primary};}.omg-mini-module span:not(.omg-pill){color:${cfg.muted};font-size:12px;font-weight:700;}
      .omg-placeholder-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px;}.omg-placeholder-chip{border:1px dashed ${cfg.line};border-radius:12px;background:#fcfcfd;padding:10px;text-align:left;cursor:pointer;}.omg-placeholder-chip:hover{border-color:${cfg.primary};background:${cfg.soft};}.omg-placeholder-chip span{display:block;font-weight:900;color:${cfg.ink};}.omg-placeholder-chip small{color:${cfg.muted};font-weight:700;}
      .omg-pill{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:5px 8px;border-radius:999px;border:1px solid ${cfg.line};background:#f2f4f7;color:${cfg.text};font-size:10px;font-weight:950;text-transform:uppercase;}.omg-pill.active{background:${cfg.soft};color:${cfg.primary};border-color:${cfg.soft2};}.omg-pill.existing{background:#eef4ff;color:#3538cd;border-color:#c7d7fe;}.omg-pill.placeholder{background:#fff7ed;color:#9a3412;border-color:#fed7aa;}
      .omg-note-row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #eef2f7;padding:10px 0;font-weight:750;}.omg-embedded-panel{padding:10px;min-width:0;overflow:hidden;}.omg-embedded-note{display:none;}.omg-module-host{min-height:360px;}.omg-module-loading{padding:24px;border:1px dashed ${cfg.line};border-radius:12px;background:#fff;color:${cfg.muted};font-weight:800;}
      html.syncetc-management-console-page #syncetc-organization-header.syncetc-org-header,html.syncetc-management-console-page .syncetc-org-header{max-width:none!important;width:100vw!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important;padding:8px clamp(8px,1vw,16px)!important;}
      html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-card{border-radius:10px!important;padding:7px!important;box-shadow:0 4px 14px rgba(16,24,40,.08)!important;grid-template-columns:72px minmax(0,1fr)!important;}
      html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-logo{min-height:58px!important;padding:6px!important;}
      html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-logo img{max-width:54px!important;max-height:54px!important;}
      html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-mark{width:46px!important;height:46px!important;border-radius:12px!important;font-size:19px!important;}
      html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-title{font-size:clamp(17px,2vw,24px)!important;}
      .module-state p{color:${cfg.muted};font-weight:650;}.omg-status{margin-top:14px;display:inline-flex;padding:9px 12px;border-radius:999px;background:${cfg.soft};font-weight:850;color:${cfg.primary};}.omg-debug{margin-top:18px;border:1px solid #1f2937;border-radius:12px;background:#111827;color:#fff;padding:12px;}.omg-debug pre{white-space:pre-wrap;font-size:12px;}
      @media(max-width:1100px){html.syncetc-management-console-page #syncetc-organization-header .syncetc-org-header-card{grid-template-columns:1fr!important}.omg-console{grid-template-columns:1fr}.omg-leftnav{position:static;max-height:none}.omg-grid.two,.omg-placeholder-grid{grid-template-columns:1fr}.omg-topbar,.omg-module-header{display:grid}.omg-topbar-actions,.omg-module-actions{align-items:flex-start;justify-content:flex-start}.omg-org-select select{min-width:0;width:100%;}}
    `;
  }

  window.addEventListener("popstate", () => {
    const key = clean(new URLSearchParams(location.search).get("module")) || "overview";
    if (!confirmModuleSwitch()) return;
    state.activeModule = findModule(key).key;
    const nextGroup = activeModule().group;
    state.openGroup = nextGroup && nextGroup !== "Home" ? nextGroup : "";
    render();
  });

  window.addEventListener("beforeunload", (event) => {
    if (hasActiveModuleUnsavedChanges()) { event.preventDefault(); event.returnValue = DIRTY_MESSAGE; return DIRTY_MESSAGE; }
  });

  window.addEventListener("syncetc:portal-auth-changed", () => {
    state.loading = true;
    boot().catch(err => { state.error = err?.message || String(err); state.loading = false; render(); });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
