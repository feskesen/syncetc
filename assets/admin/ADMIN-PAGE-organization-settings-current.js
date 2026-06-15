// ADMIN-PAGE-organization-settings-current.js
// Internal Version: 2026-06-14-112-A
// Purpose: Platform-admin Organization Settings Hub foundation. Centralizes dashboard quick links, weather airports, profile requirement hints, alert colors, and settings links.
// Uses core-admin-action backend actions: organization_settings_list_organizations, organization_settings_get, organization_settings_save, organization_settings_reset_defaults.

(function () {
  "use strict";

  const VERSION = "2026-06-14-112-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-organization-settings-root";

  let supabaseClient = null;
  let authenticatedEmail = "";
  let organizations = [];
  let selectedOrganizationId = "";
  let settings = null;
  let loading = false;
  let dirty = false;
  let lastError = "";
  let lastSavedAt = "";

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

  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function key(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function bool(value) { return value === true; }

  function defaultQuickLinks() {
    return [
      { key: "my-profile", label: "My Profile", description: "Update contact details and photo", href: "/my-profile", sort_order: 10, status: "active", placeholder: false, open_in_new_tab: false },
      { key: "member-documents", label: "Member Documents", description: "Member-only documents and resources", href: "/member-documents", sort_order: 20, status: "active", placeholder: false, open_in_new_tab: false },
      { key: "roster", label: "Roster", description: "Member directory", href: "/roster", sort_order: 30, status: "active", placeholder: false, open_in_new_tab: false },
      { key: "calendar-events", label: "Calendar / Events", description: "Open the full club calendar", href: "/calendar", sort_order: 40, status: "active", placeholder: false, open_in_new_tab: false },
      { key: "submit-gallery", label: "Submit to Gallery", description: "Photos and media links", href: "/submit-gallery", sort_order: 50, status: "active", placeholder: false, open_in_new_tab: false },
      { key: "flight-scheduler", label: "Flight Scheduler", description: "Reservations and aircraft schedule", href: "#", sort_order: 60, status: "active", placeholder: true, open_in_new_tab: false },
      { key: "maintenance-squawk", label: "Report Maintenance Squawk", description: "Aircraft maintenance reporting", href: "#", sort_order: 70, status: "active", placeholder: true, open_in_new_tab: false },
      { key: "forum", label: "Message Board", description: "Member discussions, polls, and trip planning", href: "/forum", sort_order: 80, status: "active", placeholder: false, open_in_new_tab: false },
    ];
  }

  function defaultAirports() {
    return [
      { station: "KFFA", label: "First Flight Airport", time_zone: "America/New_York", sort_order: 10, status: "active" },
      { station: "KICT", label: "Wichita Dwight D. Eisenhower National Airport", time_zone: "America/Chicago", sort_order: 20, status: "active" },
    ];
  }

  function ensureSettingsShape(raw) {
    const s = obj(raw);
    return {
      organization_settings_id: clean(s.organization_settings_id),
      organization_id: clean(s.organization_id || selectedOrganizationId),
      dashboard_settings_json: { dashboard_recipe_key: "flying_club_default", show_next_event: true, show_weather: true, show_profile_update_card: true, ...obj(s.dashboard_settings_json) },
      dashboard_quick_links_json: arr(s.dashboard_quick_links_json).length ? arr(s.dashboard_quick_links_json) : defaultQuickLinks(),
      dashboard_weather_airports_json: arr(s.dashboard_weather_airports_json).length ? arr(s.dashboard_weather_airports_json) : defaultAirports(),
      profile_requirements_json: { member_editable_required_fields: ["name", "email", "phone", "address", "profile_photo"], admin_managed_fields: ["pilot_certificate", "medical_basicmed"], ...obj(s.profile_requirements_json) },
      alert_colors_json: { attention: "#dc2626", warning: "#d97706", success: "#16a34a", info: "#2563eb", ...obj(s.alert_colors_json) },
      forum_settings_json: { default_category_model: "organization_admin_managed", member_topics_enabled: true, mentions_enabled: true, email_alerts_enabled: false, ...obj(s.forum_settings_json) },
      settings_json: obj(s.settings_json),
      updated_at: clean(s.updated_at),
    };
  }

  function setDirty(value) {
    dirty = !!value;
    if (window.SyncEtcAdminShell) {
      if (dirty && typeof window.SyncEtcAdminShell.setDirty === "function") window.SyncEtcAdminShell.setDirty(true, "You have unsaved Organization Settings changes. Leave anyway?");
      if (!dirty && typeof window.SyncEtcAdminShell.clearDirty === "function") window.SyncEtcAdminShell.clearDirty();
    }
    const el = document.getElementById("se-orgset-unsaved");
    if (el) el.textContent = dirty ? "Unsaved changes" : "";
  }

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "You have unsaved Organization Settings changes.";
  });

  function errorText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    if (typeof value === "object") {
      const parts = [value.message, value.details, value.hint, value.code].filter((part) => typeof part === "string" && part.trim());
      if (parts.length) return parts.join(" | ");
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}`, apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok === false) {
      const err = new Error(result?.message || errorText(result?.error) || `HTTP ${response.status}`);
      err.backendResult = result;
      throw err;
    }
    return result;
  }

  async function loadOrganizations() {
    const result = await callAdmin("organization_settings_list_organizations");
    organizations = arr(result.organizations);
    if (!selectedOrganizationId && organizations[0]) selectedOrganizationId = clean(organizations[0].organization_id);
  }

  async function loadSettings() {
    if (!selectedOrganizationId) return;
    loading = true;
    render();
    const result = await callAdmin("organization_settings_get", { organization_id: selectedOrganizationId });
    organizations = arr(result.organizations).length ? arr(result.organizations) : organizations;
    settings = ensureSettingsShape(result.settings);
    loading = false;
    setDirty(false);
    render();
  }

  function selectedOrg() {
    return organizations.find((o) => clean(o.organization_id) === selectedOrganizationId) || {};
  }

  function orgOption(org) {
    const selected = clean(org.organization_id) === selectedOrganizationId ? "selected" : "";
    return `<option value="${esc(org.organization_id)}" ${selected}>${esc(org.display_name || org.legal_name || org.organization_key || org.organization_id)}</option>`;
  }

  function updateNested(section, field, value) {
    settings = ensureSettingsShape(settings);
    settings[section] = { ...obj(settings[section]), [field]: value };
    setDirty(true);
  }

  function updateQuickLink(index, field, value) {
    const links = arr(settings?.dashboard_quick_links_json).map((link) => ({ ...obj(link) }));
    if (!links[index]) return;
    links[index][field] = value;
    if (field === "label" && !clean(links[index].key)) links[index].key = key(value);
    settings.dashboard_quick_links_json = links;
    setDirty(true);
  }

  function addQuickLink() {
    settings.dashboard_quick_links_json = [...arr(settings?.dashboard_quick_links_json), { key: `link-${Date.now()}`, label: "New link", description: "", href: "#", sort_order: (arr(settings?.dashboard_quick_links_json).length + 1) * 10, status: "active", placeholder: true, open_in_new_tab: false }];
    setDirty(true);
    render();
  }

  function removeQuickLink(index) {
    settings.dashboard_quick_links_json = arr(settings?.dashboard_quick_links_json).filter((_, i) => i !== index);
    setDirty(true);
    render();
  }

  function updateAirport(index, field, value) {
    const airports = arr(settings?.dashboard_weather_airports_json).map((airport) => ({ ...obj(airport) }));
    if (!airports[index]) return;
    airports[index][field] = field === "station" ? clean(value).toUpperCase() : value;
    settings.dashboard_weather_airports_json = airports;
    setDirty(true);
  }

  function addAirport() {
    settings.dashboard_weather_airports_json = [...arr(settings?.dashboard_weather_airports_json), { station: "", label: "", time_zone: "America/New_York", sort_order: (arr(settings?.dashboard_weather_airports_json).length + 1) * 10, status: "active" }];
    setDirty(true);
    render();
  }

  function removeAirport(index) {
    settings.dashboard_weather_airports_json = arr(settings?.dashboard_weather_airports_json).filter((_, i) => i !== index);
    setDirty(true);
    render();
  }

  async function saveSettings() {
    if (!settings || !selectedOrganizationId) return;
    loading = true;
    render();
    const result = await callAdmin("organization_settings_save", {
      organization_id: selectedOrganizationId,
      dashboard_settings_json: obj(settings.dashboard_settings_json),
      dashboard_quick_links_json: arr(settings.dashboard_quick_links_json),
      dashboard_weather_airports_json: arr(settings.dashboard_weather_airports_json),
      profile_requirements_json: obj(settings.profile_requirements_json),
      alert_colors_json: obj(settings.alert_colors_json),
      forum_settings_json: obj(settings.forum_settings_json),
      settings_json: obj(settings.settings_json),
    });
    settings = ensureSettingsShape(result.settings);
    loading = false;
    lastSavedAt = new Date().toLocaleString();
    setDirty(false);
    render();
  }

  async function resetDefaults() {
    if (!selectedOrganizationId) return;
    if (!window.confirm("Reset this organization's settings to the SyncEtc defaults?")) return;
    loading = true;
    render();
    const result = await callAdmin("organization_settings_reset_defaults", { organization_id: selectedOrganizationId });
    settings = ensureSettingsShape(result.settings);
    loading = false;
    lastSavedAt = new Date().toLocaleString();
    setDirty(false);
    render();
  }

  function renderQuickLinks() {
    const links = arr(settings?.dashboard_quick_links_json);
    return `
      <div class="se-section-head"><div><h2>Dashboard quick links</h2><p>These are high-value member dashboard buttons. They should not duplicate every header item.</p></div><button id="se-add-link" type="button">Add link</button></div>
      <div class="se-list">
        ${links.map((link, index) => `
          <div class="se-row-card">
            <div class="se-grid four">
              <label>Label<input data-link-index="${index}" data-field="label" value="${esc(link.label || "")}"></label>
              <label>Description<input data-link-index="${index}" data-field="description" value="${esc(link.description || "")}"></label>
              <label>URL / Path<input data-link-index="${index}" data-field="href" value="${esc(link.href || "#")}"></label>
              <label>Sort<input type="number" data-link-index="${index}" data-field="sort_order" value="${esc(link.sort_order || (index + 1) * 10)}"></label>
            </div>
            <div class="se-row-actions">
              <label class="se-inline"><input type="checkbox" data-link-index="${index}" data-field="placeholder" ${bool(link.placeholder) ? "checked" : ""}> Placeholder / future feature</label>
              <label class="se-inline"><input type="checkbox" data-link-index="${index}" data-field="open_in_new_tab" ${bool(link.open_in_new_tab) ? "checked" : ""}> Opens new tab</label>
              <label>Status<select data-link-index="${index}" data-field="status"><option value="active" ${link.status === "active" ? "selected" : ""}>Active</option><option value="hidden" ${link.status === "hidden" ? "selected" : ""}>Hidden</option><option value="inactive" ${link.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>
              <button class="secondary" data-remove-link="${index}" type="button">Remove</button>
            </div>
          </div>
        `).join("") || `<p class="se-muted">No dashboard quick links configured.</p>`}
      </div>
    `;
  }

  function renderAirports() {
    const airports = arr(settings?.dashboard_weather_airports_json);
    return `
      <div class="se-section-head"><div><h2>Dashboard weather airports</h2><p>Member dashboard METAR stations. The weather cache uses these station rows.</p></div><button id="se-add-airport" type="button">Add airport</button></div>
      <div class="se-list">
        ${airports.map((airport, index) => `
          <div class="se-row-card">
            <div class="se-grid four">
              <label>Station<input data-airport-index="${index}" data-field="station" value="${esc(airport.station || "")}" placeholder="KFFA"></label>
              <label>Display name<input data-airport-index="${index}" data-field="label" value="${esc(airport.label || "")}"></label>
              <label>Time zone<input data-airport-index="${index}" data-field="time_zone" value="${esc(airport.time_zone || "America/New_York")}"></label>
              <label>Sort<input type="number" data-airport-index="${index}" data-field="sort_order" value="${esc(airport.sort_order || (index + 1) * 10)}"></label>
            </div>
            <div class="se-row-actions">
              <label>Status<select data-airport-index="${index}" data-field="status"><option value="active" ${airport.status === "active" ? "selected" : ""}>Active</option><option value="hidden" ${airport.status === "hidden" ? "selected" : ""}>Hidden</option><option value="inactive" ${airport.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>
              <button class="secondary" data-remove-airport="${index}" type="button">Remove</button>
            </div>
          </div>
        `).join("") || `<p class="se-muted">No weather airports configured.</p>`}
      </div>
    `;
  }

  function renderBasics() {
    const dash = obj(settings?.dashboard_settings_json);
    const alerts = obj(settings?.alert_colors_json);
    const profile = obj(settings?.profile_requirements_json);
    const forum = obj(settings?.forum_settings_json);
    return `
      <div class="se-grid two">
        <section class="se-card">
          <h2>Dashboard display</h2>
          <label class="se-inline"><input type="checkbox" id="show-next-event" ${dash.show_next_event !== false ? "checked" : ""}> Show next event</label>
          <label class="se-inline"><input type="checkbox" id="show-weather" ${dash.show_weather !== false ? "checked" : ""}> Show weather/METAR cards</label>
          <label class="se-inline"><input type="checkbox" id="show-profile-update" ${dash.show_profile_update_card !== false ? "checked" : ""}> Show profile needs update card</label>
          <label>Dashboard recipe key<input id="dashboard-recipe" value="${esc(dash.dashboard_recipe_key || "flying_club_default")}"></label>
        </section>
        <section class="se-card">
          <h2>System alert colors</h2>
          <p class="se-muted">Normal pages use organization styling. These are semantic alert colors for future attention/warning states.</p>
          <div class="se-grid two">
            <label>Attention<input type="color" id="alert-attention" value="${esc(alerts.attention || "#dc2626")}"></label>
            <label>Warning<input type="color" id="alert-warning" value="${esc(alerts.warning || "#d97706")}"></label>
            <label>Success<input type="color" id="alert-success" value="${esc(alerts.success || "#16a34a")}"></label>
            <label>Info<input type="color" id="alert-info" value="${esc(alerts.info || "#2563eb")}"></label>
          </div>
        </section>
        <section class="se-card">
          <h2>Profile update rules</h2>
          <p class="se-muted">For now, the member dashboard should only flag fields the member can update on My Profile.</p>
          <label>Member-editable required fields<textarea id="profile-member-fields">${esc(arr(profile.member_editable_required_fields).join(", "))}</textarea></label>
          <label>Admin-managed fields<textarea id="profile-admin-fields">${esc(arr(profile.admin_managed_fields).join(", "))}</textarea></label>
        </section>
        <section class="se-card">
          <h2>Forum / message board settings</h2>
          <p class="se-muted">Categories remain organization-admin managed. Mention email alerts are future groundwork.</p>
          <label class="se-inline"><input type="checkbox" id="forum-member-topics" ${forum.member_topics_enabled !== false ? "checked" : ""}> Members may start topics in member-posting categories</label>
          <label class="se-inline"><input type="checkbox" id="forum-mentions" ${forum.mentions_enabled !== false ? "checked" : ""}> Mentions enabled</label>
          <label class="se-inline"><input type="checkbox" id="forum-email-alerts" ${forum.email_alerts_enabled === true ? "checked" : ""}> Email alerts enabled later</label>
        </section>
      </div>
    `;
  }

  function debugPayload() {
    return {
      frontend_version: VERSION,
      backend_version: settings ? "loaded" : null,
      authenticated_email: authenticatedEmail || null,
      selected_organization_id: selectedOrganizationId || null,
      selected_organization_name: selectedOrg().display_name || null,
      quick_links: arr(settings?.dashboard_quick_links_json).length,
      airports: arr(settings?.dashboard_weather_airports_json).length,
      dirty,
      last_error: lastError || null,
    };
  }

  function css() {
    return `
      #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;max-width:1180px;margin:22px auto 60px;padding:0 18px;color:#172033;box-sizing:border-box}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:18px;box-shadow:0 12px 30px rgba(23,32,51,.08);padding:18px;margin:14px 0}
      #${ROOT_ID} .se-hero{background:linear-gradient(135deg,#1f4f82,#4879aa);color:#fff;border:0}
      #${ROOT_ID} .se-hero h1{font-size:34px;line-height:1.05;letter-spacing:-.04em;margin:8px 0 6px;color:#fff}
      #${ROOT_ID} .se-hero p{color:rgba(255,255,255,.9);font-weight:800;margin:0}
      #${ROOT_ID} .se-title{font-size:28px;font-weight:950;letter-spacing:-.04em;color:#1f4f82;margin:0 0 6px}
      #${ROOT_ID} h2{margin:0 0 8px;color:#172033;font-size:20px;letter-spacing:-.02em}
      #${ROOT_ID} .se-muted{font-size:13px;line-height:1.45;color:#58657a;font-weight:750;margin:0 0 12px}
      #${ROOT_ID} .se-eyebrow{display:inline-flex;border-radius:999px;background:#eef3f8;color:#1f4f82;padding:6px 10px;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}
      #${ROOT_ID} .se-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:14px}
      #${ROOT_ID} .se-toolbar label{min-width:280px;flex:1}
      #${ROOT_ID} label{display:grid;gap:5px;font-size:12px;font-weight:950;color:#334155}
      #${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{min-height:38px;border:1px solid #cbd5e1;border-radius:12px;padding:8px 10px;font:inherit;font-size:13px;background:#fff;color:#172033}
      #${ROOT_ID} input[type="color"]{padding:3px;min-height:42px}
      #${ROOT_ID} textarea{min-height:72px;width:100%}
      #${ROOT_ID} button{border:0;border-radius:999px;background:#1f4f82;color:#fff;font-weight:950;padding:10px 14px;cursor:pointer;white-space:nowrap}
      #${ROOT_ID} button.secondary{background:#eef3f8;color:#1f4f82;border:1px solid #cbd5e1}
      #${ROOT_ID} button.warn{background:#991b1b;color:#fff}
      #${ROOT_ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ROOT_ID} .se-grid{display:grid;gap:12px}
      #${ROOT_ID} .se-grid.two{grid-template-columns:1fr 1fr}
      #${ROOT_ID} .se-grid.four{grid-template-columns:1.2fr 1.5fr 1.3fr .55fr}
      #${ROOT_ID} .se-section-head{display:flex;justify-content:space-between;gap:14px;align-items:start;margin-bottom:10px}
      #${ROOT_ID} .se-list{display:grid;gap:10px}
      #${ROOT_ID} .se-row-card{border:1px solid #d9e0ea;background:#fbfdff;border-radius:16px;padding:12px}
      #${ROOT_ID} .se-row-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:10px}
      #${ROOT_ID} .se-inline{display:inline-flex;grid-auto-flow:column;grid-template-columns:auto 1fr;align-items:center;gap:7px;font-size:13px;color:#334155}
      #${ROOT_ID} .se-status{min-height:32px;border-radius:999px;background:#eef3f8;color:#1f4f82;padding:8px 12px;font-size:12px;font-weight:950;display:inline-flex;align-items:center;width:max-content}
      #${ROOT_ID} .se-status.warn{background:#fee2e2;color:#991b1b}
      #${ROOT_ID} .se-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      #${ROOT_ID} .se-links a{display:inline-flex;border-radius:999px;border:1px solid #cbd5e1;color:#1f4f82;text-decoration:none;padding:8px 10px;font-size:12px;font-weight:950;background:#fff}
      #${ROOT_ID} details summary{cursor:pointer;font-weight:950;color:#1f4f82}
      #${ROOT_ID} pre{background:#111827;color:#e5e7eb;border-radius:14px;padding:14px;overflow:auto;font-size:12px}
      @media (max-width:900px){#${ROOT_ID} .se-grid.two,#${ROOT_ID} .se-grid.four{grid-template-columns:1fr}#${ROOT_ID} .se-toolbar{align-items:stretch}#${ROOT_ID} .se-toolbar label{min-width:0}}
    `;
  }

  function render() {
    const r = root();
    const org = selectedOrg();
    r.innerHTML = `
      <style>${css()}</style>
      <section class="se-card se-hero">
        <span class="se-eyebrow">Platform admin</span>
        <h1>Organization Settings Hub</h1>
        <p>Central place for organization-level settings that should not stay hard-coded in pages.</p>
      </section>
      <section class="se-card">
        <h2>Choose organization</h2>
        <p class="se-muted">First version is platform-admin only. Later passes can expose limited controls to organization admins.</p>
        <div class="se-toolbar">
          <label>Organization<select id="se-org-select">${organizations.map(orgOption).join("")}</select></label>
          <button id="se-load" type="button">Load settings</button>
          <button id="se-save" type="button" ${!settings || loading ? "disabled" : ""}>Save settings</button>
          <button id="se-reset" class="secondary" type="button" ${!settings || loading ? "disabled" : ""}>Reset defaults</button>
          <span id="se-orgset-unsaved" class="se-status ${dirty ? "warn" : ""}">${dirty ? "Unsaved changes" : (lastSavedAt ? `Saved ${esc(lastSavedAt)}` : "")}</span>
        </div>
        <div class="se-links">
          <a href="/header-navigation-setup">Header & Navigation Manager</a>
          <a href="/layout-designer">Layout Designer</a>
          <a href="/applicant-tracker">Applicant Settings / Tracker</a>
          <a href="/forum">View Message Board</a>
          <a href="/user-dashboard">View Member Dashboard</a>
        </div>
      </section>
      ${lastError ? `<section class="se-card"><span class="se-status warn">${esc(lastError)}</span></section>` : ""}
      ${loading ? `<section class="se-card"><h2>Loading…</h2><p class="se-muted">Please wait.</p></section>` : ""}
      ${settings ? `
        <section class="se-card"><span class="se-eyebrow">${esc(org.organization_key || "organization")}</span><h2>${esc(org.display_name || org.legal_name || "Organization settings")}</h2><p class="se-muted">These settings are saved in Supabase and are intended to become the source of truth for dashboard and organization-level behavior.</p></section>
        ${renderBasics()}
        <section class="se-card">${renderQuickLinks()}</section>
        <section class="se-card">${renderAirports()}</section>
        <details class="se-card"><summary>Debug</summary><pre>${esc(JSON.stringify(debugPayload(), null, 2))}</pre></details>
      ` : `<section class="se-card"><h2>No settings loaded</h2><p class="se-muted">Choose an organization and load settings.</p></section>`}
      <span style="display:none">ADMIN-PAGE-organization-settings-current.js ${esc(VERSION)}</span>
    `;
    bindEvents();
  }

  function bindEvents() {
    const orgSelect = document.getElementById("se-org-select");
    if (orgSelect) orgSelect.onchange = async (event) => {
      if (dirty && !window.confirm("You have unsaved Organization Settings changes. Switch organizations anyway?")) { orgSelect.value = selectedOrganizationId; return; }
      selectedOrganizationId = event.target.value;
      setDirty(false);
      await safe(loadSettings);
    };
    const loadBtn = document.getElementById("se-load");
    if (loadBtn) loadBtn.onclick = () => safe(loadSettings);
    const saveBtn = document.getElementById("se-save");
    if (saveBtn) saveBtn.onclick = () => safe(saveSettings);
    const resetBtn = document.getElementById("se-reset");
    if (resetBtn) resetBtn.onclick = () => safe(resetDefaults);
    const addLink = document.getElementById("se-add-link");
    if (addLink) addLink.onclick = addQuickLink;
    const addAirportBtn = document.getElementById("se-add-airport");
    if (addAirportBtn) addAirportBtn.onclick = addAirport;

    document.querySelectorAll("[data-link-index]").forEach((el) => {
      el.oninput = (event) => {
        const t = event.currentTarget;
        const index = Number(t.dataset.linkIndex);
        const field = t.dataset.field;
        const value = t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value;
        updateQuickLink(index, field, value);
      };
      el.onchange = el.oninput;
    });
    document.querySelectorAll("[data-remove-link]").forEach((el) => { el.onclick = () => removeQuickLink(Number(el.dataset.removeLink)); });
    document.querySelectorAll("[data-airport-index]").forEach((el) => {
      el.oninput = (event) => {
        const t = event.currentTarget;
        const index = Number(t.dataset.airportIndex);
        const field = t.dataset.field;
        const value = t.type === "number" ? Number(t.value) : t.value;
        updateAirport(index, field, value);
      };
      el.onchange = el.oninput;
    });
    document.querySelectorAll("[data-remove-airport]").forEach((el) => { el.onclick = () => removeAirport(Number(el.dataset.removeAirport)); });

    const showNext = document.getElementById("show-next-event");
    if (showNext) showNext.onchange = (event) => updateNested("dashboard_settings_json", "show_next_event", event.target.checked);
    const showWeather = document.getElementById("show-weather");
    if (showWeather) showWeather.onchange = (event) => updateNested("dashboard_settings_json", "show_weather", event.target.checked);
    const showProfile = document.getElementById("show-profile-update");
    if (showProfile) showProfile.onchange = (event) => updateNested("dashboard_settings_json", "show_profile_update_card", event.target.checked);
    const dashRecipe = document.getElementById("dashboard-recipe");
    if (dashRecipe) dashRecipe.oninput = (event) => updateNested("dashboard_settings_json", "dashboard_recipe_key", event.target.value);

    [["alert-attention","attention"],["alert-warning","warning"],["alert-success","success"],["alert-info","info"]].forEach(([id, field]) => {
      const el = document.getElementById(id);
      if (el) el.oninput = (event) => updateNested("alert_colors_json", field, event.target.value);
    });

    const memberFields = document.getElementById("profile-member-fields");
    if (memberFields) memberFields.oninput = (event) => updateNested("profile_requirements_json", "member_editable_required_fields", event.target.value.split(",").map(clean).filter(Boolean));
    const adminFields = document.getElementById("profile-admin-fields");
    if (adminFields) adminFields.oninput = (event) => updateNested("profile_requirements_json", "admin_managed_fields", event.target.value.split(",").map(clean).filter(Boolean));

    const forumTopics = document.getElementById("forum-member-topics");
    if (forumTopics) forumTopics.onchange = (event) => updateNested("forum_settings_json", "member_topics_enabled", event.target.checked);
    const forumMentions = document.getElementById("forum-mentions");
    if (forumMentions) forumMentions.onchange = (event) => updateNested("forum_settings_json", "mentions_enabled", event.target.checked);
    const forumEmail = document.getElementById("forum-email-alerts");
    if (forumEmail) forumEmail.onchange = (event) => updateNested("forum_settings_json", "email_alerts_enabled", event.target.checked);
  }

  async function safe(fn) {
    try { lastError = ""; await fn(); }
    catch (error) { loading = false; lastError = errorText(error); render(); }
  }

  async function boot() {
    render();
    await initSupabase();
    await loadOrganizations();
    await loadSettings();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => safe(boot));
  else safe(boot);

  window.SyncEtcOrganizationSettingsAdmin = { version: VERSION, reload: () => safe(loadSettings) };
})();
