// ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-14-114-C
// Purpose: Platform/support-compatible Aircraft Admin wrapper using the same customer-side module. Supports standalone page and embedded Organization Management module runtime.

(function () {
  "use strict";

  const VERSION = "2026-06-14-114-C";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-organization-aircraft-admin-root, #syncetc-aircraft-admin-root, [data-syncetc-page='aircraft-admin']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";
  const DIRTY_MESSAGE = "You have unsaved aircraft admin changes. Leave anyway?";

  let supabaseClient = null;
  let externalRoot = null;
  let mountOptions = {};
  let autoStarted = false;

  const state = {
    debug: new URLSearchParams(location.search).get("syncetc_debug") === "1",
    embedded: false,
    mountOptions: {},
    startedAt: performance.now(),
    token: "",
    email: "",
    loading: true,
    saving: false,
    error: "",
    status: "",
    statusKind: "",
    accessRows: [],
    accessRow: null,
    orgId: "",
    organizations: [],
    aircraft: [],
    locations: [],
    selectedAircraftId: "",
    selectedLocationId: "",
    includeArchived: false,
    search: "",
    statusFilter: "all",
    activeTab: "identity",
    dirty: false,
    locationDirty: false,
    draft: null,
    locationDraft: null,
    lastResult: null,
    steps: []
  };

  function root() { return externalRoot || document.querySelector(ROOT_SELECTOR); }
  function mark(label, detail) { state.steps.push({ ms: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function attr(value) { return esc(value); }
  function lower(value) { return clean(value).toLowerCase(); }
  function keyify(value) { return lower(value).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function money(value) { const n = Number(value); return Number.isFinite(n) ? `$${n.toFixed(2)}` : ""; }
  function numberOrBlank(value) { return value === null || value === undefined ? "" : String(value); }
  function bool(value) { return value === true || value === "true" || value === 1 || value === "1"; }

  function styleConfig() {
    const style = obj(state.accessRow && state.accessRow.style_profile);
    const colors = obj(style.colors_json);
    return {
      primary: clean(colors.brand_primary) || "#1f4f82",
      secondary: clean(colors.brand_secondary) || "#eef3f8",
      surface: clean(colors.surface) || "#ffffff",
      text: clean(colors.text) || "#172033",
      muted: clean(colors.muted) || "#5d6b82",
      danger: clean(colors.alert_error) || "#9b1c1c",
      warning: clean(colors.alert_warning) || "#8a5b00"
    };
  }

  function setStatus(message, kind = "") { state.status = message || ""; state.statusKind = kind || ""; renderStatus(); }
  function setError(message) { state.error = message || ""; setStatus(message || "", "error"); }
  function clearError() { state.error = ""; }
  function field(id) { return document.getElementById(id); }
  function value(id) { const el = field(id); return el ? String(el.value || "").trim() : ""; }
  function setValue(id, v) { const el = field(id); if (el) el.value = v ?? ""; }
  function checked(id) { const el = field(id); return !!(el && el.checked); }
  function setChecked(id, v) { const el = field(id); if (el) el.checked = !!v; }

  function setDirty(value) {
    state.dirty = !!value;
    const badge = field("aircraft-dirty-badge");
    if (badge) {
      badge.textContent = state.dirty || state.locationDirty ? "Unsaved changes" : "Saved";
      badge.className = `aircraft-pill ${state.dirty || state.locationDirty ? "warn" : "ok"}`;
    }
    if (window.SyncEtcPortalShell && typeof window.SyncEtcPortalShell.setDirty === "function") {
      window.SyncEtcPortalShell.setDirty(state.dirty || state.locationDirty, DIRTY_MESSAGE);
    }
    try {
      if (typeof mountOptions.onDirtyChange === "function") mountOptions.onDirtyChange(state.dirty || state.locationDirty, DIRTY_MESSAGE);
    } catch {}
  }
  function setLocationDirty(value) { state.locationDirty = !!value; setDirty(state.dirty); }
  function markDirty() { setDirty(true); }
  function markLocationDirty() { setLocationDirty(true); }
  function confirmDiscard(message = DIRTY_MESSAGE) { return !(state.dirty || state.locationDirty) || window.confirm(message); }
  function isDirty() { return !!(state.dirty || state.locationDirty); }
  function setActiveView(view) {
    const v = clean(view);
    mountOptions.initialView = v || mountOptions.initialView || "identity";
    const tabMap = { locations: "operations", spaces: "operations", "spaces-locations": "operations", assets: "identity", aircraft: "identity", "assets-aircraft": "identity", rates: "rates", usage: "rates", maintenance: "maintenance" };
    if (tabMap[v]) state.activeTab = tabMap[v];
    else if (["identity", "classification", "operations", "rates", "media", "maintenance"].includes(v)) state.activeTab = v;
  }

  function activeModuleView() {
    return clean(mountOptions.initialView || mountOptions.activeView || mountOptions.aircraftView || "");
  }

  function isLocationsOnly() {
    const v = activeModuleView();
    return mountOptions.embedded && ["locations", "spaces", "spaces-locations", "locations-only"].includes(v);
  }

  function isAircraftOnly() {
    const v = activeModuleView();
    return mountOptions.embedded && !isLocationsOnly() && ["identity", "classification", "operations", "rates", "usage", "media", "maintenance", "assets", "aircraft", "assets-aircraft", "aircraft-only"].includes(v || "identity");
  }

  function waitForSupabaseLibrary(timeoutMs = 8000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.supabase && typeof window.supabase.createClient === "function") return resolve();
        if (Date.now() - started > timeoutMs) return reject(new Error("Supabase JS did not load."));
        setTimeout(check, 50);
      };
      check();
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        // If another shell has already loaded the library, resolve immediately; otherwise let waitForSupabaseLibrary handle readiness.
        if (window.supabase && typeof window.supabase.createClient === "function") return resolve();
        return resolve();
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    if (window.syncetcSupabase && window.syncetcSupabase.auth && typeof window.syncetcSupabase.auth.getSession === "function") {
      supabaseClient = window.syncetcSupabase;
    } else {
      await loadScript(SUPABASE_JS_URL);
      await waitForSupabaseLibrary();
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      window.syncetcSupabase = supabaseClient;
    }
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session?.access_token) throw new Error("Log in before using Aircraft Admin.");
    state.token = data.session.access_token;
    state.email = data.session.user?.email || "";
  }

  async function refreshToken() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data?.session?.access_token) throw new Error("Your session has expired. Please log in again.");
    state.token = data.session.access_token;
    state.email = data.session.user?.email || state.email;
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

  function canManageAircraft(row) {
    const perms = arr(row && row.permission_keys).map(String);
    const caps = obj(row && row.capabilities);
    return Boolean(caps.can_manage_assets || caps.can_view_organization_admin || caps.can_manage_settings)
      || perms.includes("assets.manage")
      || perms.includes("organization.view_admin")
      || perms.includes("organization.admin.open")
      || perms.includes("organization.manage_settings")
      || perms.includes("organization.super_admin");
  }

  async function loadAccess() {
    mark("loadAccess");
    const result = await callAccess("get_my_access");
    const rows = arr(result.access);
    state.accessRows = rows.filter(row => canManageAircraft(row));
    state.organizations = state.accessRows.map(row => ({
      organization_id: clean(row.organization_id),
      organization_key: clean(row.organization_key),
      display_name: clean(row.organization_name || row.display_name || row.organization_key || row.organization_id)
    }));
    const stored = state.orgId || localStorage.getItem(SELECTED_ORG_KEY) || "";
    const preferred = state.accessRows.find(row => clean(row.organization_id) === stored || clean(row.organization_key) === stored) || state.accessRows[0];
    if (!preferred) throw new Error("You do not have Aircraft Admin access for any organization.");
    state.accessRow = preferred;
    state.orgId = clean(preferred.organization_id);
    localStorage.setItem(SELECTED_ORG_KEY, state.orgId);
  }

  async function loadAircraftAdmin() {
    if (!state.orgId) return;
    mark("loadAircraftAdmin", state.orgId);
    setStatus("Loading aircraft admin data...");
    const result = await callAccess("organization_list_aircraft_admin", { organization_id: state.orgId, include_archived: state.includeArchived });
    state.aircraft = arr(result.aircraft);
    state.locations = arr(result.locations);
    if (state.selectedAircraftId && !state.aircraft.some(a => clean(a.operational_asset_id) === state.selectedAircraftId)) state.selectedAircraftId = "";
    if (!state.selectedAircraftId && state.aircraft.length) state.selectedAircraftId = clean(state.aircraft[0].operational_asset_id);
    const selected = selectedAircraft();
    state.draft = selected ? draftFromAircraft(selected) : emptyAircraftDraft();
    state.locationDraft = state.locations[0] ? draftFromLocation(state.locations[0]) : emptyLocationDraft();
    state.selectedLocationId = clean(state.locationDraft.organization_location_id);
    setDirty(false);
    setLocationDirty(false);
    setStatus("Aircraft admin data loaded.", "ok");
    render();
  }

  function selectedAircraft() { return state.aircraft.find(a => clean(a.operational_asset_id) === state.selectedAircraftId) || null; }
  function selectedLocation() { return state.locations.find(l => clean(l.organization_location_id) === state.selectedLocationId) || null; }

  function emptyAircraftDraft() {
    return {
      operational_asset_id: "", asset_key: "", tail_number: "", preferred_name: "", display_name: "", aircraft_year: "", aircraft_make: "", aircraft_model: "", icao_type_code: "", serial_number: "", asset_type_key: "aircraft",
      category_class: "airplane-single-engine-land", engine_count: "1", seat_count: "", fuel_type: "", fuel_burn_gph: "", organization_location_id: "", home_base: "",
      status_key: "available", visibility: "members", do_not_dispatch: false, dispatch_note: "", sort_order: "100",
      is_complex: false, is_high_performance: false, is_tailwheel: false, is_ifr_equipped: false, is_night_equipped: false, is_multi_engine: false,
      primary_photo_url: "", panel_photo_url: "", summary: "", description: "", internal_notes: "",
      current_tach: "", tach_date: "", current_hobbs: "", hobbs_date: "", current_airframe_hours: "", airframe_hours_date: "", usage_tracking_basis: "hobbs", billing_basis: "hobbs", hobbs_factor: "", round_to_decimals: "2",
      hourly_rate: "", fuel_included: true, tax_behavior: "not_taxed", annual_due: "",
      engine_make_model: "", engine_serial_numbers: "", propeller_details: "", engine_notes: "", maintenance_notes_general: "", oil_change_due_tach: ""
    };
  }

  function draftFromAircraft(a) {
    const draft = emptyAircraftDraft();
    Object.keys(draft).forEach(k => {
      if (Object.prototype.hasOwnProperty.call(a, k) && a[k] !== null && a[k] !== undefined) draft[k] = a[k];
    });
    draft.operational_asset_id = clean(a.operational_asset_id);
    draft.asset_key = clean(a.asset_key);
    draft.tail_number = clean(a.tail_number || a.identifier || a.short_name);
    draft.preferred_name = clean(a.preferred_name || a.display_name);
    draft.display_name = clean(a.display_name || a.preferred_name || a.tail_number);
    draft.aircraft_year = numberOrBlank(a.aircraft_year || a.model_year);
    draft.aircraft_make = clean(a.aircraft_make || a.manufacturer);
    draft.aircraft_model = clean(a.aircraft_model || a.model);
    draft.organization_location_id = clean(a.home_base_location_id || a.organization_location_id);
    draft.home_base = clean(a.home_base || a.base_airport_identifier || a.base_location_name);
    draft.summary = clean(a.aircraft_description_plain || a.summary);
    draft.description = clean(a.description);
    draft.hourly_rate = numberOrBlank(a.hourly_rate);
    draft.annual_due = numberOrBlank(a.annual_due);
    draft.fuel_included = a.hourly_fuel_included !== false;
    draft.tax_behavior = clean(a.hourly_tax_behavior || a.tax_rate_behavior || "not_taxed");
    return draft;
  }

  function emptyLocationDraft() {
    return { organization_location_id: "", location_key: "", location_type: "airport", airport_identifier: "", display_name: "", time_zone: "", address_line_1: "", address_line_2: "", city: "", state_region: "", postal_code: "", country: "", notes: "", sort_order: "100", status: "active" };
  }

  function draftFromLocation(l) {
    const address = obj(l.address_json);
    return {
      organization_location_id: clean(l.organization_location_id),
      location_key: clean(l.location_key),
      location_type: clean(l.location_type || "airport"),
      airport_identifier: clean(l.airport_identifier),
      display_name: clean(l.display_name),
      time_zone: clean(l.time_zone || ""),
      address_line_1: clean(l.address_line_1 || address.address_line_1 || address.street || address.address_1),
      address_line_2: clean(l.address_line_2 || address.address_line_2 || address.address_2),
      city: clean(l.city || address.city),
      state_region: clean(l.state_region || address.state_region || address.state),
      postal_code: clean(l.postal_code || address.postal_code || address.zip),
      country: clean(l.country || address.country),
      notes: clean(l.notes),
      sort_order: numberOrBlank(l.sort_order || 100),
      status: clean(l.status || "active")
    };
  }

  function setDraft(key, value) { if (!state.draft) state.draft = emptyAircraftDraft(); state.draft[key] = value; markDirty(); }
  function setLocationDraft(key, value) { if (!state.locationDraft) state.locationDraft = emptyLocationDraft(); state.locationDraft[key] = value; markLocationDirty(); }

  function collectAircraftPayload() {
    const d = state.draft || emptyAircraftDraft();
    return {
      ...d,
      organization_id: state.orgId,
      include_archived: state.includeArchived,
      display_name: d.display_name || d.preferred_name || d.tail_number,
      specs_json: { source: "aircraft_admin_0113A", asset_type: "aircraft", features: featureKeys(d) },
      operational_json: { status_note: d.dispatch_note || "" },
      usage_json: { usage_tracking_basis: d.usage_tracking_basis, current_tach: d.current_tach, current_hobbs: d.current_hobbs, current_airframe_hours: d.current_airframe_hours },
      billing_json: { billing_basis: d.billing_basis, fuel_included: !!d.fuel_included, tax_behavior: d.tax_behavior },
      maintenance_json: { placeholder: true, note: "Reminder and squawk systems are future modules." },
      media_json: { primary_photo_url: d.primary_photo_url, panel_photo_url: d.panel_photo_url },
      settings_json: { saved_from: "aircraft_admin_0113A" }
    };
  }

  function featureKeys(d) {
    const keys = [];
    if (d.is_complex) keys.push("complex");
    if (d.is_high_performance) keys.push("high_performance");
    if (d.is_tailwheel) keys.push("tailwheel");
    if (d.is_ifr_equipped) keys.push("ifr_equipped");
    if (d.is_night_equipped) keys.push("night_equipped");
    if (d.is_multi_engine) keys.push("multi_engine");
    return keys;
  }

  function collectLocationPayload() {
    const d = state.locationDraft || emptyLocationDraft();
    return {
      ...d,
      organization_id: state.orgId,
      address_json: {
        address_line_1: d.address_line_1,
        address_line_2: d.address_line_2,
        city: d.city,
        state_region: d.state_region,
        postal_code: d.postal_code,
        country: d.country
      }
    };
  }

  async function saveAircraft() {
    try {
      state.saving = true; clearError(); setStatus("Saving aircraft..."); renderActionState();
      const result = await callAccess("organization_save_aircraft", collectAircraftPayload());
      state.aircraft = arr(result.aircraft);
      state.locations = arr(result.locations);
      const saved = obj(result.aircraft_record);
      state.selectedAircraftId = clean(saved.operational_asset_id || state.selectedAircraftId);
      state.draft = draftFromAircraft(saved);
      setDirty(false);
      setStatus("Aircraft saved.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  async function archiveAircraft(restore = false) {
    const id = clean(state.draft && state.draft.operational_asset_id);
    if (!id) return;
    if (!restore && !window.confirm("Archive this aircraft? It can be restored later.")) return;
    try {
      state.saving = true; clearError(); renderActionState();
      const result = await callAccess(restore ? "organization_restore_aircraft" : "organization_archive_aircraft", { organization_id: state.orgId, operational_asset_id: id });
      state.aircraft = arr(result.aircraft);
      state.locations = arr(result.locations);
      state.includeArchived = true;
      const saved = obj(result.aircraft_record);
      state.selectedAircraftId = clean(saved.operational_asset_id || id);
      state.draft = draftFromAircraft(saved);
      setDirty(false);
      setStatus(restore ? "Aircraft restored." : "Aircraft archived.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  async function saveLocation() {
    try {
      const d = state.locationDraft || emptyLocationDraft();
      if (!clean(d.display_name)) throw new Error("Enter a display name for this location.");
      if (!clean(d.location_type)) throw new Error("Choose a location type.");
      state.saving = true; clearError(); setStatus("Saving location..."); renderActionState();
      const result = await callAccess("organization_save_aircraft_location", collectLocationPayload());
      state.locations = arr(result.locations);
      state.aircraft = arr(result.aircraft);
      const saved = obj(result.location);
      state.selectedLocationId = clean(saved.organization_location_id || state.selectedLocationId);
      state.locationDraft = draftFromLocation(saved);
      setLocationDirty(false);
      setStatus("Location saved.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  function newAircraft() { if (!confirmDiscard()) return; state.selectedAircraftId = ""; state.draft = emptyAircraftDraft(); setDirty(false); setStatus("New aircraft draft ready."); render(); }
  function clearAircraft() { if (!confirmDiscard()) return; state.draft = emptyAircraftDraft(); state.selectedAircraftId = ""; setDirty(false); render(); }
  function newLocation() { if (!confirmDiscard("You have unsaved location changes. Continue?")) return; state.selectedLocationId = ""; state.locationDraft = emptyLocationDraft(); setLocationDirty(false); render(); }

  function filteredAircraft() {
    const q = lower(state.search);
    return state.aircraft.filter(a => {
      const archived = !!a.archived_at || clean(a.asset_record_status) === "archived";
      if (!state.includeArchived && archived) return false;
      if (state.statusFilter !== "all" && clean(a.status_key) !== state.statusFilter) return false;
      if (!q) return true;
      return [a.tail_number, a.display_name, a.aircraft_make, a.aircraft_model, a.icao_type_code, a.base_location_name, a.base_airport_identifier].some(v => lower(v).includes(q));
    });
  }

  function statusBadge(statusKey, doNotDispatch) {
    const key = doNotDispatch ? "do-not-dispatch" : clean(statusKey || "available");
    const label = key === "do-not-dispatch" ? "Do Not Dispatch" : key ? key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Available";
    const cls = key === "available" ? "ok" : (key === "maintenance" ? "warn" : (key === "grounded" || key === "do-not-dispatch" ? "danger" : "neutral"));
    return `<span class="aircraft-pill ${cls}">${esc(label)}</span>`;
  }

  function renderStatus() {
    const el = field("aircraft-status");
    if (!el) return;
    const cls = state.statusKind === "error" ? "error" : state.statusKind === "ok" ? "ok" : "";
    el.className = `aircraft-status ${cls}`;
    el.textContent = state.status || "";
    el.style.display = state.status ? "block" : "none";
  }

  function renderActionState() {
    document.querySelectorAll("[data-save-button]").forEach(btn => { btn.disabled = state.saving; btn.textContent = state.saving ? "Saving..." : btn.dataset.label || "Save"; });
  }

  function renderOrgSelector() {
    if (state.organizations.length <= 1) return "";
    return `<label class="aircraft-field compact"><span>Organization</span><select id="aircraft-org-select">${state.organizations.map(o => `<option value="${attr(o.organization_id)}" ${o.organization_id === state.orgId ? "selected" : ""}>${esc(o.display_name)}</option>`).join("")}</select></label>`;
  }

  function renderList() {
    const rows = filteredAircraft();
    return `
      <section class="aircraft-card aircraft-list-card">
        <div class="aircraft-section-head">
          <div><h2>Aircraft</h2><p>${rows.length} shown${state.includeArchived ? " including archived" : ""}.</p></div>
          <button class="aircraft-button" id="aircraft-new">New Aircraft</button>
        </div>
        <div class="aircraft-filter-row">
          <input id="aircraft-search" value="${attr(state.search)}" placeholder="Search tail, model, base...">
          <select id="aircraft-status-filter">
            ${["all","available","maintenance","grounded","do-not-dispatch","inactive"].map(v => `<option value="${v}" ${state.statusFilter === v ? "selected" : ""}>${v === "all" ? "All status" : esc(v.replace(/-/g," "))}</option>`).join("")}
          </select>
          <label class="aircraft-check"><input id="aircraft-include-archived" type="checkbox" ${state.includeArchived ? "checked" : ""}> Include archived</label>
        </div>
        <div class="aircraft-list">
          ${rows.length ? rows.map(a => {
            const selected = clean(a.operational_asset_id) === state.selectedAircraftId;
            const sub = [a.aircraft_year, a.aircraft_make, a.aircraft_model, a.icao_type_code].filter(Boolean).join(" ");
            const base = clean(a.base_airport_identifier || a.home_base || a.base_location_name || "No base set");
            return `<button class="aircraft-row ${selected ? "selected" : ""}" data-aircraft-id="${attr(a.operational_asset_id)}">
              <span class="aircraft-row-title">${esc(a.tail_number || a.display_name || "Aircraft")}</span>
              <span class="aircraft-row-sub">${esc(sub || "Aircraft details not complete")}</span>
              <span class="aircraft-row-meta">${esc(base)} ${statusBadge(a.status_key, a.do_not_dispatch)}</span>
            </button>`;
          }).join("") : `<div class="aircraft-empty">No aircraft match the current filters.</div>`}
        </div>
      </section>`;
  }

  function renderTabs() {
    const tabs = [
      ["identity", "Identity"], ["classification", "Classification"], ["operations", "Operations"], ["rates", "Rates / Usage"], ["media", "Media / Notes"], ["maintenance", "Maintenance Setup"]
    ];
    return `<div class="aircraft-tabs">${tabs.map(([k,l]) => `<button class="${state.activeTab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>`;
  }

  function locationOptions(selectedId) {
    return `<option value="">No base selected</option>` + state.locations.filter(l => clean(l.status) !== "archived").map(l => `<option value="${attr(l.organization_location_id)}" ${clean(l.organization_location_id) === clean(selectedId) ? "selected" : ""}>${esc(l.airport_identifier ? `${l.airport_identifier} — ${l.display_name}` : l.display_name)}</option>`).join("");
  }

  function renderEditor() {
    const d = state.draft || emptyAircraftDraft();
    const archived = clean(selectedAircraft()?.asset_record_status) === "archived" || !!selectedAircraft()?.archived_at;
    return `
      <section class="aircraft-card aircraft-editor-card">
        <div class="aircraft-editor-head">
          <div>
            <h2>${d.operational_asset_id ? esc(d.tail_number || d.display_name || "Edit Aircraft") : "New Aircraft"}</h2>
            <p>Generated slug/SKU: <strong>${esc(d.asset_key || "generated on save")}</strong></p>
          </div>
          <div class="aircraft-actions">
            <button class="aircraft-button secondary" id="aircraft-clear">Clear</button>
            ${d.operational_asset_id ? `<button class="aircraft-button ${archived ? "secondary" : "danger"}" id="aircraft-archive">${archived ? "Restore" : "Archive"}</button>` : ""}
            <button class="aircraft-button" data-save-button data-label="Save Aircraft" id="aircraft-save">Save Aircraft</button>
          </div>
        </div>
        ${renderTabs()}
        <div class="aircraft-tab-panel">${renderActiveTab(d)}</div>
      </section>`;
  }

  function inputHtml(label, key, type = "text", placeholder = "") {
    const d = state.draft || emptyAircraftDraft();
    return `<label class="aircraft-field"><span>${esc(label)}</span><input data-draft-key="${attr(key)}" type="${attr(type)}" value="${attr(numberOrBlank(d[key]))}" placeholder="${attr(placeholder)}"></label>`;
  }
  function textHtml(label, key, placeholder = "") {
    const d = state.draft || emptyAircraftDraft();
    return `<label class="aircraft-field full"><span>${esc(label)}</span><textarea data-draft-key="${attr(key)}" placeholder="${attr(placeholder)}">${esc(d[key])}</textarea></label>`;
  }
  function selectHtml(label, key, options) {
    const d = state.draft || emptyAircraftDraft();
    return `<label class="aircraft-field"><span>${esc(label)}</span><select data-draft-key="${attr(key)}">${options.map(([v,l]) => `<option value="${attr(v)}" ${clean(d[key]) === clean(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  }
  function checkHtml(label, key) {
    const d = state.draft || emptyAircraftDraft();
    return `<label class="aircraft-check"><input data-draft-key="${attr(key)}" type="checkbox" ${d[key] ? "checked" : ""}> ${esc(label)}</label>`;
  }

  function renderActiveTab(d) {
    if (state.activeTab === "identity") return `
      <div class="aircraft-form-grid">
        ${inputHtml("Tail number", "tail_number", "text", "N123AB")}
        ${inputHtml("Preferred/display name", "preferred_name", "text", "Club Skyhawk")}
        ${inputHtml("Year", "aircraft_year", "number", "1978")}
        ${inputHtml("Make", "aircraft_make", "text", "Cessna")}
        ${inputHtml("Model", "aircraft_model", "text", "172N")}
        ${inputHtml("ICAO type code", "icao_type_code", "text", "C172")}
        ${inputHtml("Serial number", "serial_number", "text", "Optional")}
        ${inputHtml("Sort order", "sort_order", "number", "100")}
      </div>`;
    if (state.activeTab === "classification") return `
      <div class="aircraft-form-grid">
        ${selectHtml("Category / class", "category_class", [["airplane-single-engine-land","Airplane Single-Engine Land"],["airplane-multi-engine-land","Airplane Multi-Engine Land"],["simulator","Simulator / Training Device"],["other","Other"]])}
        ${inputHtml("Engine count", "engine_count", "number", "1")}
        ${inputHtml("Seats", "seat_count", "number", "4")}
        ${inputHtml("Fuel type", "fuel_type", "text", "100LL")}
        ${inputHtml("Fuel burn GPH", "fuel_burn_gph", "number", "9.0")}
        ${inputHtml("Engine make/model", "engine_make_model", "text", "Optional")}
        ${inputHtml("Engine serial number(s)", "engine_serial_numbers", "text", "Optional")}
        ${inputHtml("Propeller details", "propeller_details", "text", "Optional")}
      </div>
      <div class="aircraft-check-grid">
        ${checkHtml("Complex", "is_complex")}${checkHtml("High performance", "is_high_performance")}${checkHtml("Tailwheel", "is_tailwheel")}${checkHtml("IFR equipped", "is_ifr_equipped")}${checkHtml("Night equipped", "is_night_equipped")}${checkHtml("Multi-engine", "is_multi_engine")}
      </div>`;
    if (state.activeTab === "operations") return `
      <div class="aircraft-form-grid">
        <label class="aircraft-field"><span>Base/location</span><select data-draft-key="organization_location_id">${locationOptions(d.organization_location_id)}</select></label>
        ${inputHtml("Home base text", "home_base", "text", "KFFA / Hangar A")}
        ${selectHtml("Operational status", "status_key", [["available","Available"],["maintenance","Maintenance"],["grounded","Grounded"],["do-not-dispatch","Do Not Dispatch"],["inactive","Inactive"]])}
        ${selectHtml("Visibility", "visibility", [["public","Public"],["members","Members"],["admins","Admins only"],["hidden","Hidden"]])}
      </div>
      <div class="aircraft-check-grid">${checkHtml("Do Not Dispatch", "do_not_dispatch")}</div>
      ${textHtml("Dispatch/status note", "dispatch_note", "Short internal note when dispatch status needs explanation.")}`;
    if (state.activeTab === "rates") return `
      <div class="aircraft-note"><strong>Rate and usage groundwork.</strong> This records the basics needed later for scheduling/billing. It is not a full finance engine yet.</div>
      <div class="aircraft-form-grid">
        ${inputHtml("Hourly rate", "hourly_rate", "number", "155.00")}
        ${selectHtml("Billing basis", "billing_basis", [["hobbs","Hobbs"],["tach","Tach"],["airframe","Airframe / total time"],["flat","Flat / not hourly"],["manual","Manual"]])}
        ${selectHtml("Usage tracking basis", "usage_tracking_basis", [["hobbs","Hobbs"],["tach","Tach"],["airframe","Airframe / total time"],["manual","Manual"]])}
        ${inputHtml("Current Hobbs", "current_hobbs", "number", "1234.5")}
        ${inputHtml("Hobbs reading date", "hobbs_date", "date")}
        ${inputHtml("Current Tach", "current_tach", "number", "987.6")}
        ${inputHtml("Tach reading date", "tach_date", "date")}
        ${inputHtml("Current airframe hours", "current_airframe_hours", "number", "Optional")}
        ${inputHtml("Airframe hours date", "airframe_hours_date", "date")}
        ${inputHtml("Hobbs factor", "hobbs_factor", "number", "Optional")}
        ${inputHtml("Round decimals", "round_to_decimals", "number", "2")}
        ${selectHtml("Tax behavior", "tax_behavior", [["not_taxed","Not taxed"],["taxed","Taxed"],["included","Tax included"],["unknown","Not configured"]])}
        ${inputHtml("Annual due / fixed fee", "annual_due", "number", "Optional")}
      </div>
      <div class="aircraft-check-grid">${checkHtml("Fuel included in rate", "fuel_included")}</div>`;
    if (state.activeTab === "media") return `
      <div class="aircraft-form-grid">
        ${inputHtml("Primary image URL", "primary_photo_url", "url", "Image URL or storage URL")}
        ${inputHtml("Panel image URL", "panel_photo_url", "url", "Optional")}
      </div>
      ${textHtml("Member/public summary", "summary", "Short plain-language summary.")}
      ${textHtml("Longer description", "description", "Optional description shown where aircraft details are displayed.")}
      ${textHtml("Internal notes", "internal_notes", "Admin-only notes placeholder.")}`;
    return `
      <div class="aircraft-note"><strong>Maintenance setup placeholder.</strong> Reminders, squawks/discrepancies, dispatch grounding workflow, and maintenance history will be built as separate modules on top of this aircraft foundation.</div>
      <div class="aircraft-form-grid">
        ${inputHtml("Hobbs at last major overhaul", "hobbs_at_last_major_overhaul", "number", "Optional")}
        ${inputHtml("Oil change due tach", "oil_change_due_tach", "number", "Optional")}
      </div>
      ${textHtml("Engine notes", "engine_notes", "Engine details or maintenance setup notes.")}
      ${textHtml("General maintenance notes", "maintenance_notes_general", "Admin-only maintenance setup notes. Not a squawk log.")}`;
  }

  function renderLocations() {
    const d = state.locationDraft || emptyLocationDraft();
    const typeOptions = [
      ["airport", "Airport"],
      ["hangar", "Hangar"],
      ["meeting-room", "Meeting room"],
      ["office", "Office"],
      ["dock", "Dock"],
      ["storage", "Storage"],
      ["other", "Other"]
    ];
    return `
      <section class="aircraft-card aircraft-location-card">
        <div class="aircraft-section-head">
          <div><h2>Spaces & Locations</h2><p>Manage shared locations such as airports, hangars, meeting rooms, offices, docks, storage, or other operating locations.</p></div>
          <button class="aircraft-button secondary" id="aircraft-new-location">New Location</button>
        </div>
        <div class="aircraft-location-layout">
          <div class="aircraft-location-list">
            ${state.locations.length ? state.locations.map(l => `<button class="aircraft-location-row ${clean(l.organization_location_id) === state.selectedLocationId ? "selected" : ""}" data-location-id="${attr(l.organization_location_id)}"><strong>${esc(l.display_name || l.airport_identifier || "Location")}</strong><span>${esc([l.airport_identifier, l.location_type, l.city || obj(l.address_json).city, l.state_region || obj(l.address_json).state_region || obj(l.address_json).state].filter(Boolean).join(" · "))}</span></button>`).join("") : `<div class="aircraft-empty">No locations yet.</div>`}
          </div>
          <div class="aircraft-location-form">
            <div class="aircraft-form-grid">
              <label class="aircraft-field"><span>Display name *</span><input data-location-key="display_name" value="${attr(d.display_name)}" placeholder="First Flight Airport"></label>
              <label class="aircraft-field"><span>Location type *</span><select data-location-key="location_type">${typeOptions.map(([value,label]) => `<option value="${value}" ${d.location_type === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label class="aircraft-field"><span>Airport / location identifier</span><input data-location-key="airport_identifier" value="${attr(d.airport_identifier)}" placeholder="KFFA, Hangar A, Room 2"></label>
              <label class="aircraft-field"><span>Time zone</span><input data-location-key="time_zone" value="${attr(d.time_zone)}" placeholder="America/New_York"></label>
              <label class="aircraft-field full"><span>Address line 1</span><input data-location-key="address_line_1" value="${attr(d.address_line_1)}" placeholder="Street address or facility address"></label>
              <label class="aircraft-field full"><span>Address line 2</span><input data-location-key="address_line_2" value="${attr(d.address_line_2)}" placeholder="Hangar, suite, unit, gate, or room"></label>
              <label class="aircraft-field"><span>City</span><input data-location-key="city" value="${attr(d.city)}"></label>
              <label class="aircraft-field"><span>State / region</span><input data-location-key="state_region" value="${attr(d.state_region)}"></label>
              <label class="aircraft-field"><span>Postal code</span><input data-location-key="postal_code" value="${attr(d.postal_code)}"></label>
              <label class="aircraft-field"><span>Country</span><input data-location-key="country" value="${attr(d.country)}" placeholder="US"></label>
              <label class="aircraft-field"><span>Sort order</span><input data-location-key="sort_order" type="number" value="${attr(d.sort_order)}"></label>
              <label class="aircraft-field"><span>Status</span><select data-location-key="status"><option value="active" ${d.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${d.status === "inactive" ? "selected" : ""}>Inactive</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>Archived</option></select></label>
            </div>
            <label class="aircraft-field full"><span>Notes</span><textarea data-location-key="notes" placeholder="Optional operating notes, directions, access instructions, or internal location notes.">${esc(d.notes)}</textarea></label>
            <div class="aircraft-actions"><button class="aircraft-button" data-save-button data-label="Save Location" id="aircraft-save-location">Save Location</button></div>
          </div>
        </div>
      </section>`;
  }

  function renderDebug() {
    if (!state.debug) return "";
    return `<section class="aircraft-card aircraft-debug"><h2>Debug</h2><pre>${esc(JSON.stringify({ version: VERSION, email: state.email, orgId: state.orgId, aircraft: state.aircraft.length, locations: state.locations.length, dirty: state.dirty, locationDirty: state.locationDirty, steps: state.steps, lastResult: state.lastResult }, null, 2))}</pre></section>`;
  }

  function render() {
    const el = root();
    if (!el) return;
    const c = styleConfig();
    const orgName = clean(state.accessRow && (state.accessRow.organization_name || state.accessRow.display_name || state.accessRow.organization_key)) || "organization";
    el.innerHTML = `
      <style>
        ${ROOT_SELECTOR}{--air-primary:${c.primary};--air-secondary:${c.secondary};--air-surface:${c.surface};--air-text:${c.text};--air-muted:${c.muted};--air-danger:${c.danger};--air-warning:${c.warning};font-family:Arial,Helvetica,sans-serif;color:var(--air-text);}
        ${ROOT_SELECTOR} *{box-sizing:border-box;}
        .aircraft-wrap{max-width:1280px;margin:0 auto;padding:18px;}
        .aircraft-wrap.embedded{max-width:none;margin:0;padding:0;}
        .aircraft-inline-state{display:flex;justify-content:flex-end;margin-bottom:8px;}
        .aircraft-hero{background:linear-gradient(135deg,var(--air-primary),color-mix(in srgb,var(--air-primary) 82%,#000));color:#fff;border-radius:18px;padding:22px;margin-bottom:14px;}
        .aircraft-hero h1{margin:0 0 6px;font-size:34px;letter-spacing:-.03em;}.aircraft-hero p{margin:0;opacity:.9;line-height:1.45;}.aircraft-topline{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:14px;}
        .aircraft-card{background:var(--air-surface);border:1px solid color-mix(in srgb,var(--air-primary) 18%,#d6dee9);border-radius:16px;box-shadow:0 8px 24px rgba(10,30,55,.06);padding:16px;margin-bottom:14px;}
        .aircraft-grid{display:grid;grid-template-columns:370px minmax(0,1fr);gap:14px;align-items:start;}.aircraft-grid.aircraft-only{grid-template-columns:360px minmax(720px,1fr);}.aircraft-section-head,.aircraft-editor-head,.aircraft-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}.aircraft-section-head h2,.aircraft-editor-head h2{margin:0;font-size:21px;}.aircraft-section-head p,.aircraft-editor-head p{margin:3px 0 0;color:var(--air-muted);font-size:13px;}
        .aircraft-button{border:1px solid var(--air-primary);background:var(--air-primary);color:#fff;border-radius:999px;padding:9px 13px;font-weight:800;cursor:pointer;font-size:13px;}.aircraft-button.secondary{background:#fff;color:var(--air-primary);}.aircraft-button.danger{background:#fff;color:var(--air-danger);border-color:var(--air-danger);}.aircraft-button:disabled{opacity:.55;cursor:wait;}
        .aircraft-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;background:color-mix(in srgb,var(--air-primary) 12%,#fff);color:var(--air-primary);}.aircraft-pill.ok{background:#eaf7ef;color:#196f3b;}.aircraft-pill.warn{background:#fff5d8;color:var(--air-warning);}.aircraft-pill.danger{background:#ffecec;color:var(--air-danger);}.aircraft-pill.neutral{background:#eef3f8;color:#30435c;}
        .aircraft-filter-row{display:grid;grid-template-columns:1fr 145px auto;gap:8px;margin:12px 0;align-items:center;}.aircraft-filter-row input,.aircraft-filter-row select,.aircraft-field input,.aircraft-field select,.aircraft-field textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;background:#fff;color:#172033;font-size:13px;}.aircraft-field textarea{min-height:82px;resize:vertical;font-family:Arial,Helvetica,sans-serif;}.aircraft-check{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#334155;}
        .aircraft-list{display:flex;flex-direction:column;gap:8px;}.aircraft-row,.aircraft-location-row{width:100%;border:1px solid #d7e0ea;background:#fff;border-radius:13px;padding:11px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:4px;}.aircraft-row.selected,.aircraft-location-row.selected{border-color:var(--air-primary);box-shadow:inset 4px 0 0 var(--air-primary);background:color-mix(in srgb,var(--air-secondary) 38%,#fff);}.aircraft-row-title{font-weight:900;font-size:15px;}.aircraft-row-sub,.aircraft-row-meta,.aircraft-location-row span{color:var(--air-muted);font-size:12px;}.aircraft-row-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
        .aircraft-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0;}.aircraft-tabs button{border:1px solid #cbd5e1;background:#fff;color:#26344d;border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer;}.aircraft-tabs button.active{background:var(--air-primary);color:#fff;border-color:var(--air-primary);}
        .aircraft-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}.aircraft-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}.aircraft-field span{font-size:12px;font-weight:900;color:#334155;text-transform:uppercase;letter-spacing:.03em;}.aircraft-field.full{grid-column:1/-1;}.aircraft-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0 4px;}.aircraft-note{background:color-mix(in srgb,var(--air-secondary) 55%,#fff);border:1px solid color-mix(in srgb,var(--air-primary) 18%,#d6dee9);border-radius:12px;padding:12px;margin-bottom:12px;color:#334155;font-size:13px;line-height:1.45;}
        .aircraft-location-layout{display:grid;grid-template-columns:310px minmax(760px,1fr);gap:14px;}.aircraft-location-list{display:flex;flex-direction:column;gap:8px;}.aircraft-status{padding:12px;border-radius:12px;border:1px solid #d6e0ec;background:#eef3f8;color:#26344d;margin-bottom:14px;}.aircraft-status.ok{background:#eaf7ef;color:#196f3b}.aircraft-status.error{background:#ffecec;color:var(--air-danger);border-color:#ffc6c6;}.aircraft-empty{border:1px dashed #cbd5e1;border-radius:12px;padding:14px;color:var(--air-muted);background:#f8fafc;}.aircraft-debug pre{background:#101827;color:#e7edf6;border-radius:12px;padding:12px;overflow:auto;font-size:12px;}
        @media(max-width:980px){.aircraft-grid,.aircraft-location-layout{grid-template-columns:1fr;}.aircraft-filter-row,.aircraft-form-grid,.aircraft-check-grid{grid-template-columns:1fr;}.aircraft-wrap{padding:12px;}}
      </style>
      <main class="aircraft-wrap ${mountOptions.embedded ? "embedded" : ""}">
        ${mountOptions.embedded ? `
          <div class="aircraft-inline-state"><span id="aircraft-dirty-badge" class="aircraft-pill ${state.dirty || state.locationDirty ? "warn" : "ok"}">${state.dirty || state.locationDirty ? "Unsaved changes" : "Saved"}</span></div>` : `
          <section class="aircraft-hero">
            <h1>Aircraft Admin</h1>
            <p>Manage ${esc(orgName)} aircraft, locations, dispatch status, rates, usage, and setup fields. Squawks, reminders, scheduling and billing are separate modules.</p>
            <div class="aircraft-topline">${renderOrgSelector()}<span id="aircraft-dirty-badge" class="aircraft-pill ${state.dirty || state.locationDirty ? "warn" : "ok"}">${state.dirty || state.locationDirty ? "Unsaved changes" : "Saved"}</span></div>
          </section>`}
        <div id="aircraft-status" class="aircraft-status" style="display:none"></div>
        ${isLocationsOnly() ? renderLocations() : isAircraftOnly() ? `<div class="aircraft-grid aircraft-only">${renderList()}${renderEditor()}</div>` : `${renderLocations()}<div class="aircraft-grid">${renderList()}${renderEditor()}</div>`}
        ${renderDebug()}
      </main>`;
    bindEvents();
    renderStatus();
    renderActionState();
  }

  function bindEvents() {
    field("aircraft-org-select")?.addEventListener("change", async (e) => {
      if (!confirmDiscard("Changing organizations will discard unsaved aircraft changes. Continue?")) { e.target.value = state.orgId; return; }
      state.orgId = e.target.value; localStorage.setItem(SELECTED_ORG_KEY, state.orgId); state.accessRow = state.accessRows.find(r => clean(r.organization_id) === state.orgId) || state.accessRow; await loadAircraftAdmin();
    });
    field("aircraft-new")?.addEventListener("click", newAircraft);
    field("aircraft-clear")?.addEventListener("click", clearAircraft);
    field("aircraft-save")?.addEventListener("click", saveAircraft);
    field("aircraft-archive")?.addEventListener("click", () => archiveAircraft(clean(selectedAircraft()?.asset_record_status) === "archived" || !!selectedAircraft()?.archived_at));
    field("aircraft-search")?.addEventListener("input", e => { state.search = e.target.value; render(); });
    field("aircraft-status-filter")?.addEventListener("change", e => { state.statusFilter = e.target.value; render(); });
    field("aircraft-include-archived")?.addEventListener("change", async e => { state.includeArchived = !!e.target.checked; await loadAircraftAdmin(); });
    document.querySelectorAll("[data-aircraft-id]").forEach(btn => btn.addEventListener("click", () => { if (!confirmDiscard()) return; state.selectedAircraftId = btn.dataset.aircraftId; state.draft = draftFromAircraft(selectedAircraft()); setDirty(false); render(); }));
    document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => { state.activeTab = btn.dataset.tab; render(); }));
    document.querySelectorAll("[data-draft-key]").forEach(el => {
      const key = el.dataset.draftKey;
      const handler = () => setDraft(key, el.type === "checkbox" ? !!el.checked : el.value);
      el.addEventListener("input", handler); el.addEventListener("change", handler);
    });
    field("aircraft-new-location")?.addEventListener("click", newLocation);
    field("aircraft-save-location")?.addEventListener("click", saveLocation);
    document.querySelectorAll("[data-location-id]").forEach(btn => btn.addEventListener("click", () => { if (!confirmDiscard("You have unsaved location changes. Continue?")) return; state.selectedLocationId = btn.dataset.locationId; state.locationDraft = draftFromLocation(selectedLocation()); setLocationDirty(false); render(); }));
    document.querySelectorAll("[data-location-key]").forEach(el => {
      const key = el.dataset.locationKey;
      const handler = () => setLocationDraft(key, el.value);
      el.addEventListener("input", handler); el.addEventListener("change", handler);
    });
  }

  function renderError(error) {
    const el = root();
    if (!el) return;
    const message = error instanceof Error ? error.message : String(error || "Aircraft Admin failed to load.");
    el.innerHTML = `<div style="max-width:960px;margin:24px auto;padding:18px;border:1px solid #ffc6c6;background:#fff3f3;border-radius:14px;color:#7f1d1d;font-family:Arial,Helvetica,sans-serif"><h2>Aircraft Admin could not load</h2><p>${esc(message)}</p><p style="font-size:13px;color:#555">Version ${esc(VERSION)}</p></div>`;
  }

  async function init(options = {}) {
    mountOptions = { ...mountOptions, ...obj(options) };
    if (mountOptions.initialView) setActiveView(mountOptions.initialView);
    if (mountOptions.initialTab) setActiveView(mountOptions.initialTab);
    const el = root();
    if (!el) return;
    el.innerHTML = `<div style="max-width:900px;margin:0 auto;padding:18px;border:1px solid #d7e0ea;border-radius:14px;font-family:Arial,Helvetica,sans-serif">Loading Aircraft Admin...</div>`;
    try {
      await initSupabase();
      await loadAccess();
      await loadAircraftAdmin();
    } catch (error) {
      renderError(error);
    }
  }

  function mount(target, options = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("Aircraft Admin mount target was not found.");
    externalRoot = el;
    mountOptions = { ...obj(options), embedded: options.embedded !== false };
    if (options.initialView) setActiveView(options.initialView);
    if (options.initialTab) setActiveView(options.initialTab);
    if (options.organizationId) state.orgId = clean(options.organizationId);
    state.startedAt = performance.now();
    state.error = "";
    state.status = "";
    state.statusKind = "";
    return init(mountOptions);
  }

  window.SyncEtcAircraftAdminPage = {
    version: VERSION,
    mount,
    hasUnsavedChanges: () => !!(state.dirty || state.locationDirty),
    confirmDiscard
  };

  window.SyncEtcAircraftAdmin = {
    version: VERSION,
    mount,
    isDirty: () => !!(state.dirty || state.locationDirty),
    confirmDiscard
  };


  window.SyncEtcAircraftAdminPage = {
    version: VERSION,
    boot: init,
    isDirty,
    confirmDiscard,
    setActiveView,
    reload: init
  };

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty || state.locationDirty) { event.preventDefault(); event.returnValue = DIRTY_MESSAGE; return DIRTY_MESSAGE; }
  });

  function autoInit() {
    if (autoStarted) return;
    if (!document.querySelector(ROOT_SELECTOR)) return;
    autoStarted = true;
    init({ embedded: false });
  }

  if (!window.SyncEtcAircraftAdminSuppressAutoBoot) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit); else autoInit();
  }
})();
