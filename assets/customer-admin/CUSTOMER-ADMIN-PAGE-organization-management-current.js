// CUSTOMER-ADMIN-PAGE-organization-management-current.js
// Internal Version: 2026-06-14-114-A
// Purpose: Customer/organization-side Organization Management console shell. Full-width operations workbench with left navigation and links/placeholders for customer admin modules.

(function () {
  "use strict";

  const VERSION = "2026-06-14-114-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-organization-management-root, #syncetc-organization-admin-console-root, [data-syncetc-page='organization-management']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";

  let supabaseClient = null;

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
    activeSection: clean(new URLSearchParams(location.search).get("section")) || clean((location.hash || "").replace(/^#/, "")) || "overview",
    steps: [],
    lastResult: null
  };

  function root() { return document.querySelector(ROOT_SELECTOR); }
  function mark(label, detail) { state.steps.push({ ms: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function attr(value) { return esc(value); }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.supabase && typeof window.supabase.createClient === "function") return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        setTimeout(resolve, 25);
        return;
      }
      const script = document.createElement("script");
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
        platformAdmin: Boolean(row?.platform_admin)
      });
    } catch {}
  }

  function styleConfig() {
    const row = selectedRow();
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const effects = obj(profile.effects_json);
    const primary = clean(colors.brand_primary) || "#1f4f82";
    const secondary = clean(colors.brand_secondary) || "#eef3f8";
    const surface = clean(colors.surface) || "#ffffff";
    const text = clean(colors.text) || "#172033";
    const danger = clean(colors.alert_error) || "#b42318";
    const warning = clean(colors.alert_warning) || "#b7791f";
    const corners = clean(effects.corners) || "soft";
    return {
      primary,
      secondary,
      surface,
      text,
      muted: "#667085",
      ink: "#101828",
      line: "#d0d5dd",
      page: "#f8fafc",
      soft: hexToRgba(primary, 0.07),
      soft2: hexToRgba(primary, 0.12),
      danger,
      warning,
      radius: corners === "sharp" ? "8px" : corners === "pill" ? "24px" : "14px"
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
    { section: "overview", label: "Overview", short: "Console home", description: "Organization management home, admin notices, and setup shortcuts.", status: "active", href: "#overview" },

    { group: "People" },
    { section: "people", label: "Members", short: "Member records", description: "Manage organization people, member records, lifecycle, roster visibility, and access links.", status: "existing", href: "/organization-people" },
    { section: "administrators", label: "Administrators", short: "Admin access", description: "Customer administrators, organization super admins, and future delegated admin roles.", status: "planned", href: "#administrators" },
    { section: "groups", label: "Groups & roles", short: "Permissions", description: "Member groups, roles, instructor groupings, and future mention groups like Board or Maintenance.", status: "planned", href: "#groups" },
    { section: "instructors", label: "Instructors", short: "Instructor records", description: "Instructor/CFI roster and qualification groupings. Planned module.", status: "planned", href: "#instructors" },

    { group: "Assets" },
    { section: "asset-types", label: "Asset types", short: "Aircraft, boats, vehicles", description: "Configure what this organization calls and operates: aircraft, boats, vehicles, simulators, spaces, equipment, or other assets.", status: "planned", href: "#asset-types" },
    { section: "locations", label: "Bases & locations", short: "Operating bases", description: "Airport bases, locations, spaces, hangars, time zones, and address notes.", status: "active", href: "/aircraft-admin#locations" },
    { section: "assets", label: "Assets / Aircraft", short: "Fleet records", description: "Manage aircraft/asset identity, classification, status, visibility, and operational placeholders.", status: "active", href: "/aircraft-admin#assets" },
    { section: "rates", label: "Rates", short: "Rate setup", description: "Basic rate and usage-basis setup. Full billing/finance is not built yet.", status: "placeholder", href: "/aircraft-admin#rates" },
    { section: "usage", label: "Usage / meters", short: "Hobbs/Tach/usage", description: "Usage basis, Hobbs/Tach/current readings, and future hours logs.", status: "placeholder", href: "/aircraft-admin#usage" },
    { section: "maintenance-reminders", label: "Maintenance reminders", short: "Due items", description: "Recurring aircraft/asset reminders by date, hours, or other basis. Planned after asset foundation.", status: "placeholder", href: "/aircraft-admin#maintenance" },
    { section: "squawks", label: "Squawks / discrepancies", short: "Maintenance issues", description: "Operational discrepancy reporting and resolution workflow. Planned after asset foundation.", status: "planned", href: "#squawks" },

    { group: "Website & Portal" },
    { section: "header-nav", label: "Header & navigation", short: "Site navigation", description: "Manage public/member/admin nav labels, rows, visibility, and header recipes.", status: "existing", href: "/header-navigation-setup" },
    { section: "dashboard-settings", label: "Dashboard settings", short: "Quick links/weather", description: "Dashboard quick links, weather airports, and display preferences.", status: "existing", href: "/organization-settings#dashboard" },
    { section: "applicant-portal", label: "Applicant portal", short: "Applicant settings", description: "Applicant workflow, portal visibility, update permissions, and application settings.", status: "existing", href: "/applicant-tracker" },
    { section: "public-pages", label: "Public pages", short: "Page setup", description: "Page inventory, publishing status, and public/customer page controls.", status: "existing", href: "/page-setup" },

    { group: "Communication" },
    { section: "forum", label: "Message board", short: "Forum settings", description: "Member message board categories, discussion settings, mention groups, and moderation groundwork.", status: "existing", href: "/forum" },
    { section: "contact-tracker", label: "Contact tracker", short: "Public inquiries", description: "Customer contact requests, replies, and contact workflow.", status: "existing", href: "/contact-tracker" },
    { section: "notices", label: "Notices", short: "Announcements", description: "Member/admin notices and future internal announcements. Planned module.", status: "planned", href: "#notices" },

    { group: "Documents" },
    { section: "public-documents", label: "Public documents", short: "Public resources", description: "Documents/resources visible to visitors where enabled.", status: "existing", href: "/documents" },
    { section: "member-documents", label: "Member documents", short: "Member resources", description: "Member-only documents and resource library.", status: "existing", href: "/member-documents" },
    { section: "internal-documents", label: "Internal documents", short: "Admin documents", description: "Admin/internal documents, minutes, records, and restricted files.", status: "existing", href: "/internal-documents" },

    { group: "Store" },
    { section: "store-products", label: "Products / services", short: "Store catalog", description: "Placeholder for FBO/store product or service catalog.", status: "planned", href: "#store-products" },
    { section: "store-orders", label: "Orders / requests", short: "Store activity", description: "Placeholder for future orders, requests, and fulfillment.", status: "planned", href: "#store-orders" },
    { section: "store-settings", label: "Store settings", short: "Store controls", description: "Placeholder for store settings and customer-specific commerce controls.", status: "planned", href: "#store-settings" },

    { group: "Settings" },
    { section: "organization-basics", label: "Organization basics", short: "Name/details", description: "Organization-level settings and profile basics.", status: "existing", href: "/organization-settings#basics" },
    { section: "branding", label: "Branding / layout", short: "Colors/layout", description: "Brand colors, layout settings, dashboard recipes, and style controls.", status: "existing", href: "/organization-settings#style" },
    { section: "alert-colors", label: "Alert colors", short: "System colors", description: "Customer system alert colors for attention/warning/success states.", status: "existing", href: "/organization-settings#alerts" },
    { section: "integrations", label: "Integrations", short: "External services", description: "Email, weather, scheduling, accounting, and future integration controls.", status: "planned", href: "#integrations" }
  ];

  const GROUPS = (() => {
    const groups = [];
    let current = null;
    MODULES.forEach(item => {
      if (item.group) {
        current = { group: item.group, modules: [] };
        groups.push(current);
      } else if (!current && item.section === "overview") {
        groups.push({ group: "Home", modules: [item] });
      } else if (current) {
        current.modules.push(item);
      }
    });
    return groups;
  })();

  function findModule(key) {
    return MODULES.find(m => m.section === key) || MODULES.find(m => !m.group && m.section === "overview");
  }

  function sectionModules(section) {
    if (section === "overview") return MODULES.filter(m => !m.group && m.section !== "overview").slice(0, 12);
    const group = GROUPS.find(g => g.modules.some(m => m.section === section));
    return group ? group.modules : [];
  }

  async function boot() {
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
    const active = findModule(state.activeSection);
    const modules = sectionModules(active.section);
    el.innerHTML = `
      <style>${css(cfg)}</style>
      <div class="omg-wrap" style="--omg-primary:${cfg.primary};--omg-soft:${cfg.soft};--omg-soft2:${cfg.soft2};--omg-text:${cfg.text};--omg-surface:${cfg.surface};--omg-radius:${cfg.radius};">
        <section class="omg-hero">
          <div>
            <span class="omg-kicker">Organization Management</span>
            <h1>${esc(orgName)}</h1>
            <p>Customer-side operations console for people, assets, website, communication, documents, store placeholders, and organization settings.</p>
          </div>
          <div class="omg-hero-actions">
            ${renderOrgSelect()}
            <span class="omg-version">${esc(VERSION)}</span>
          </div>
        </section>
        <section class="omg-console">
          <aside class="omg-leftnav" aria-label="Organization management sections">
            ${renderLeftNav()}
          </aside>
          <main class="omg-main">
            ${renderModuleHeader(active)}
            ${active.section === "overview" ? renderOverview() : renderSection(active, modules)}
          </main>
        </section>
        ${state.status ? `<div class="omg-status">${esc(state.status)}</div>` : ""}
        ${debugPanel()}
      </div>`;
    bindEvents();
  }

  function renderOrgSelect() {
    if (state.orgOptions.length <= 1) return `<span class="omg-org-chip">${esc(state.orgOptions[0]?.display_name || "Selected organization")}</span>`;
    return `<label class="omg-org-select"><span>Organization</span><select id="omg-org-select">${state.orgOptions.map(o => `<option value="${attr(o.organization_id)}" ${o.organization_id === state.orgId ? "selected" : ""}>${esc(o.display_name)}</option>`).join("")}</select></label>`;
  }

  function renderLeftNav() {
    return GROUPS.map(group => `
      <div class="omg-nav-group">
        <div class="omg-nav-group-title">${esc(group.group)}</div>
        ${group.modules.map(m => `<button type="button" class="omg-nav-item ${m.section === state.activeSection ? "active" : ""}" data-section="${attr(m.section)}"><span>${esc(m.label)}</span>${statusPill(m.status)}</button>`).join("")}
      </div>`).join("");
  }

  function renderModuleHeader(active) {
    return `<div class="omg-module-header">
      <div>
        <span class="omg-kicker">${esc(active.short || "Module")}</span>
        <h2>${esc(active.section === "overview" ? "Management overview" : active.label)}</h2>
        <p>${esc(active.description || "")}</p>
      </div>
      <div class="omg-module-actions">
        ${active.href && active.href !== `#${active.section}` ? `<a class="omg-btn primary" href="${attr(active.href)}">Open module</a>` : ""}
        ${active.section !== "overview" ? `<button class="omg-btn" type="button" data-section="overview">Back to overview</button>` : ""}
      </div>
    </div>`;
  }

  function renderOverview() {
    const activeModules = MODULES.filter(m => !m.group && (m.status === "active" || m.status === "existing"));
    const planned = MODULES.filter(m => !m.group && (m.status === "planned" || m.status === "placeholder"));
    return `<div class="omg-grid two">
      <div class="omg-card">
        <h3>Operational modules</h3>
        <p class="omg-muted">Existing customer-admin modules and currently active foundations.</p>
        <div class="omg-mini-list">${activeModules.slice(0, 10).map(renderMiniModule).join("")}</div>
      </div>
      <div class="omg-card">
        <h3>Planned foundations</h3>
        <p class="omg-muted">Placeholders are shown here so the structure can grow without scattering admin pages.</p>
        <div class="omg-mini-list">${planned.slice(0, 10).map(renderMiniModule).join("")}</div>
      </div>
      <div class="omg-card wide">
        <h3>Management philosophy</h3>
        <p>This console is the customer-side workbench. It should be dense, clear, and consistent. Styling inherits organization colors for accents, but the structure is fixed for admin usability.</p>
        <div class="omg-note-row"><span>Daily landing page</span><strong>Member Dashboard</strong></div>
        <div class="omg-note-row"><span>Admin tasks</span><strong>Admin nav row and module pages</strong></div>
        <div class="omg-note-row"><span>Configuration</span><strong>Organization Management / Settings</strong></div>
      </div>
    </div>`;
  }

  function renderSection(active, modules) {
    return `<div class="omg-section-workbench">
      <div class="omg-toolbar">
        <input id="omg-module-search" type="search" placeholder="Filter this section" aria-label="Filter this section">
        <span class="omg-toolbar-count">${modules.length} items</span>
      </div>
      <div class="omg-tablelike">
        <div class="omg-row head"><div>Module</div><div>Purpose</div><div>Status</div><div>Action</div></div>
        ${modules.map(renderModuleRow).join("") || `<div class="omg-empty">No modules in this section yet.</div>`}
      </div>
      ${renderSectionGuidance(active.section)}
    </div>`;
  }

  function renderSectionGuidance(section) {
    const guidance = {
      assets: "Assets are stored generically underneath so the same structure can support aircraft, vehicles, boats, equipment, spaces, or other customer asset types. Aviation customers see Aircraft wording where appropriate.",
      people: "People management will eventually collect members, administrators, instructors, groups, roles, and permission workflows into this area.",
      "website-portal": "Website and portal controls should centralize customer-safe page, navigation, dashboard, applicant, and portal settings.",
      communication: "Communication modules include the member message board, contact tracker, notices, and future preference-driven alerts.",
      documents: "Document modules remain separate by visibility and operational purpose: public, member, and internal/admin documents.",
      store: "Store is a placeholder for FBO/customer product or service sales. No commerce engine is built yet.",
      settings: "Settings are customer-side controls. Platform-only seeding and global layout support remain separate."
    };
    const text = guidance[section];
    return text ? `<div class="omg-guidance">${esc(text)}</div>` : "";
  }

  function renderMiniModule(m) {
    return `<button type="button" class="omg-mini-module" data-section="${attr(m.section)}"><strong>${esc(m.label)}</strong><span>${esc(m.short || "")}</span>${statusPill(m.status)}</button>`;
  }

  function renderModuleRow(m) {
    return `<div class="omg-row" data-filter-text="${attr(`${m.label} ${m.short} ${m.description} ${m.status}`)}">
      <div><button type="button" class="omg-row-title" data-section="${attr(m.section)}">${esc(m.label)}</button><small>${esc(m.short || "")}</small></div>
      <div>${esc(m.description || "")}</div>
      <div>${statusPill(m.status)}</div>
      <div>${m.href && m.href !== `#${m.section}` ? `<a class="omg-link" href="${attr(m.href)}">Open</a>` : `<span class="omg-muted">Placeholder</span>`}</div>
    </div>`;
  }

  function statusPill(status) {
    const label = status === "active" ? "Active" : status === "existing" ? "Existing" : status === "placeholder" ? "Placeholder" : status === "planned" ? "Planned" : "";
    return label ? `<span class="omg-pill ${attr(status)}">${esc(label)}</span>` : "";
  }

  function bindEvents() {
    document.querySelectorAll("[data-section]").forEach(btn => {
      btn.addEventListener("click", () => {
        const section = clean(btn.getAttribute("data-section"));
        if (!section) return;
        state.activeSection = section;
        try { history.replaceState(null, "", `${location.pathname}?section=${encodeURIComponent(section)}${state.debug ? "&syncetc_debug=1" : ""}`); } catch {}
        render();
      });
    });
    const orgSelect = document.getElementById("omg-org-select");
    if (orgSelect) orgSelect.addEventListener("change", () => {
      const id = clean(orgSelect.value);
      const row = state.accessRows.find(r => clean(r.organization_id) === id);
      if (!row) return;
      state.orgId = id;
      state.accessRow = row;
      try { localStorage.setItem(SELECTED_ORG_KEY, id); } catch {}
      setShellState();
      render();
    });
    const search = document.getElementById("omg-module-search");
    if (search) search.addEventListener("input", () => {
      const q = lower(search.value);
      document.querySelectorAll(".omg-tablelike .omg-row[data-filter-text]").forEach(row => {
        const text = lower(row.getAttribute("data-filter-text"));
        row.style.display = !q || text.includes(q) ? "grid" : "none";
      });
    });
  }

  function debugPanel() {
    if (!state.debug) return "";
    return `<details class="omg-debug"><summary>Organization Management diagnostics</summary><pre>${esc(JSON.stringify({ version: VERSION, email: state.email, orgId: state.orgId, activeSection: state.activeSection, accessRows: state.accessRows.length, steps: state.steps, lastResult: state.lastResult }, null, 2))}</pre></details>`;
  }

  function css(cfg) {
    return `
      .omg-wrap{max-width:1540px;margin:0 auto;padding:22px clamp(14px,2vw,28px) 70px;color:${cfg.text};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
      .omg-loading,.omg-error{max-width:980px;margin:40px auto;padding:24px;border:1px solid ${cfg.line};border-radius:${cfg.radius};background:#fff;box-shadow:0 12px 30px rgba(16,24,40,.08);}
      .omg-error{border-color:#fca5a5;background:#fff7f7;color:#7f1d1d;}
      .omg-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border:1px solid ${cfg.line};border-radius:${cfg.radius};background:linear-gradient(135deg,${cfg.primary},${hexToRgba(cfg.primary,.78)});color:#fff;box-shadow:0 12px 30px rgba(16,24,40,.12);margin-bottom:16px;}
      .omg-hero h1{font-size:clamp(28px,3vw,44px);line-height:1.05;margin:8px 0 10px;color:#fff;}
      .omg-hero p{margin:0;max-width:920px;font-weight:750;color:rgba(255,255,255,.93);}
      .omg-kicker{display:inline-flex;padding:6px 10px;border-radius:999px;background:${cfg.soft};color:${cfg.primary};font-size:12px;text-transform:uppercase;font-weight:900;letter-spacing:.06em;}
      .omg-hero .omg-kicker{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.28);}
      .omg-hero-actions{display:flex;gap:10px;align-items:flex-end;flex-direction:column;min-width:220px;}
      .omg-version,.omg-org-chip{display:inline-flex;padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);font-weight:800;color:#fff;}
      .omg-org-select{display:grid;gap:5px;font-size:12px;font-weight:900;color:#fff;text-transform:uppercase;}
      .omg-org-select select{min-width:250px;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:9px 12px;background:#fff;color:${cfg.text};font-weight:800;}
      .omg-console{display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px;align-items:start;}
      .omg-leftnav{position:sticky;top:14px;max-height:calc(100vh - 30px);overflow:auto;border:1px solid ${cfg.line};border-radius:${cfg.radius};background:#fff;box-shadow:0 10px 28px rgba(16,24,40,.08);padding:12px;}
      .omg-nav-group{padding:7px 0 12px;border-bottom:1px solid #eef2f7;}
      .omg-nav-group:last-child{border-bottom:0;}
      .omg-nav-group-title{font-size:11px;font-weight:950;text-transform:uppercase;color:${cfg.muted};letter-spacing:.08em;margin:4px 8px 7px;}
      .omg-nav-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:${cfg.text};font-weight:850;text-align:left;cursor:pointer;}
      .omg-nav-item:hover{background:${cfg.soft};}
      .omg-nav-item.active{background:${cfg.primary};color:#fff;}
      .omg-nav-item.active .omg-pill{background:rgba(255,255,255,.18);color:#fff;border-color:rgba(255,255,255,.24);}
      .omg-main{min-width:0;display:grid;gap:16px;}
      .omg-module-header,.omg-card,.omg-section-workbench{border:1px solid ${cfg.line};border-radius:${cfg.radius};background:#fff;box-shadow:0 10px 28px rgba(16,24,40,.08);}
      .omg-module-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;}
      .omg-module-header h2{margin:8px 0 6px;font-size:28px;line-height:1.1;color:${cfg.ink};}
      .omg-module-header p{margin:0;color:${cfg.muted};font-weight:650;}
      .omg-module-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
      .omg-btn,.omg-link{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border-radius:999px;border:1px solid ${cfg.primary};background:#fff;color:${cfg.primary};padding:8px 13px;font-weight:900;text-decoration:none;cursor:pointer;}
      .omg-btn.primary{background:${cfg.primary};color:#fff;}
      .omg-grid{display:grid;gap:16px;}
      .omg-grid.two{grid-template-columns:1fr 1fr;}
      .omg-card{padding:18px 20px;}
      .omg-card.wide{grid-column:1 / -1;}
      .omg-card h3{margin:0 0 6px;font-size:22px;color:${cfg.ink};}
      .omg-muted{color:${cfg.muted};font-weight:650;}
      .omg-mini-list{display:grid;gap:9px;margin-top:12px;}
      .omg-mini-module{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;border:1px solid ${cfg.line};border-radius:12px;background:#fff;padding:10px 12px;text-align:left;cursor:pointer;}
      .omg-mini-module:hover{border-color:${cfg.primary};background:${cfg.soft};}
      .omg-mini-module strong{color:${cfg.primary};}
      .omg-mini-module span:not(.omg-pill){color:${cfg.muted};font-size:12px;font-weight:700;}
      .omg-pill{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;padding:5px 8px;border-radius:999px;border:1px solid ${cfg.line};background:#f2f4f7;color:${cfg.text};font-size:11px;font-weight:950;text-transform:uppercase;}
      .omg-pill.active,.omg-pill.existing{background:${cfg.soft};color:${cfg.primary};border-color:${cfg.soft2};}
      .omg-pill.placeholder{background:#fff7ed;color:#9a3412;border-color:#fed7aa;}
      .omg-pill.planned{background:#f2f4f7;color:#475467;}
      .omg-note-row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #eef2f7;padding:10px 0;font-weight:750;}
      .omg-section-workbench{padding:16px 18px;}
      .omg-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;}
      .omg-toolbar input{flex:1;min-height:40px;border:1px solid ${cfg.line};border-radius:12px;padding:9px 12px;font:inherit;}
      .omg-toolbar-count{font-weight:850;color:${cfg.muted};}
      .omg-tablelike{border:1px solid ${cfg.line};border-radius:12px;overflow:hidden;background:#fff;}
      .omg-row{display:grid;grid-template-columns:minmax(180px,1.1fr) minmax(260px,2fr) 130px 110px;gap:12px;align-items:center;border-bottom:1px solid #eef2f7;padding:12px 14px;}
      .omg-row:nth-child(even):not(.head){background:#fcfcfd;}
      .omg-row:last-child{border-bottom:0;}
      .omg-row.head{background:#f8fafc;color:${cfg.muted};text-transform:uppercase;font-size:12px;font-weight:950;letter-spacing:.04em;}
      .omg-row-title{border:0;background:transparent;color:${cfg.primary};font-size:15px;font-weight:950;text-align:left;padding:0;cursor:pointer;}
      .omg-row small{display:block;color:${cfg.muted};font-weight:700;margin-top:4px;}
      .omg-guidance{margin-top:14px;padding:14px 16px;border-radius:12px;background:${cfg.soft};border:1px solid ${cfg.soft2};font-weight:700;color:${cfg.text};}
      .omg-empty{padding:20px;color:${cfg.muted};font-weight:800;}
      .omg-status{margin-top:14px;display:inline-flex;padding:9px 12px;border-radius:999px;background:${cfg.soft};font-weight:850;color:${cfg.primary};}
      .omg-debug{margin-top:18px;border:1px solid #1f2937;border-radius:12px;background:#111827;color:#fff;padding:12px;}
      .omg-debug pre{white-space:pre-wrap;font-size:12px;}
      @media(max-width:980px){.omg-console{grid-template-columns:1fr}.omg-leftnav{position:static;max-height:none}.omg-grid.two{grid-template-columns:1fr}.omg-row{grid-template-columns:1fr}.omg-hero,.omg-module-header{display:grid}.omg-hero-actions,.omg-module-actions{align-items:flex-start;justify-content:flex-start}.omg-org-select select{min-width:0;width:100%;}}
    `;
  }

  window.addEventListener("syncetc:portal-auth-changed", () => {
    state.loading = true;
    boot().catch(err => { state.error = err?.message || String(err); state.loading = false; render(); });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
