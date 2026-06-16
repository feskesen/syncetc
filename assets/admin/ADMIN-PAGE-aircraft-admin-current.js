// CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-15-115-G
// Purpose: Customer/organization-side Aircraft Admin foundation. Supports standalone page and embedded Organization Management module runtime.

(function () {
  "use strict";

  const VERSION = "2026-06-15-115-G";
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
  let aircraftSearchTimer = null;
  let locationSearchTimer = null;
  let assetTypeSearchTimer = null;


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
    assetTypes: [],
    selectedAircraftId: "",
    selectedLocationId: "",
    selectedAssetTypeId: "",
    includeArchived: true,
    search: "",
    aircraftSearchText: "",
    aircraftSearchRestore: null,
    aircraftOrderSaving: false,
    aircraftOrderStatus: "",
    aircraftOrderStatusKind: "",
    draggingAircraftId: "",
    locationSearch: "",
    locationSearchText: "",
    assetTypeSearch: "",
    assetTypeSearchText: "",
    assetTypeStatusFilter: "all",
    locationStatusFilter: "all",
    statusFilter: "all",
    activeTab: "identity",
    dirty: false,
    locationDirty: false,
    assetTypeDirty: false,
    draft: null,
    locationDraft: null,
    assetTypeDraft: null,
    locationSearchRestore: null,
    assetTypeSearchRestore: null,
    locationOrderSaving: false,
    locationOrderStatus: "",
    locationOrderStatusKind: "",
    assetTypeOrderSaving: false,
    assetTypeOrderStatus: "",
    assetTypeOrderStatusKind: "",
    draggingLocationId: "",
    draggingAssetTypeId: "",
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

  function restoreAircraftSearchFocus() {
    const restore = state.aircraftSearchRestore;
    if (!restore) return;
    state.aircraftSearchRestore = null;
    window.setTimeout(() => {
      const input = field("aircraft-search");
      if (!input) return;
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
      try {
        const start = Number.isFinite(restore.start) ? Math.min(restore.start, input.value.length) : input.value.length;
        const end = Number.isFinite(restore.end) ? Math.min(restore.end, input.value.length) : start;
        input.setSelectionRange(start, end);
      } catch {}
    }, 0);
  }

  function restoreLocationSearchFocus() {
    const restore = state.locationSearchRestore;
    if (!restore) return;
    state.locationSearchRestore = null;
    window.setTimeout(() => {
      const input = field("aircraft-location-search");
      if (!input) return;
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
      try {
        const start = Number.isFinite(restore.start) ? Math.min(restore.start, input.value.length) : input.value.length;
        const end = Number.isFinite(restore.end) ? Math.min(restore.end, input.value.length) : start;
        input.setSelectionRange(start, end);
      } catch {}
    }, 0);
  }

  function restoreAssetTypeSearchFocus() {
    const restore = state.assetTypeSearchRestore;
    if (!restore) return;
    state.assetTypeSearchRestore = null;
    window.setTimeout(() => {
      const input = field("aircraft-asset-type-search");
      if (!input) return;
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
      try {
        const start = Number.isFinite(restore.start) ? Math.min(restore.start, input.value.length) : input.value.length;
        const end = Number.isFinite(restore.end) ? Math.min(restore.end, input.value.length) : start;
        input.setSelectionRange(start, end);
      } catch {}
    }, 0);
  }

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
      badge.textContent = state.dirty || state.locationDirty || state.assetTypeDirty ? "Unsaved changes" : "Saved";
      badge.className = `aircraft-pill ${state.dirty || state.locationDirty || state.assetTypeDirty ? "warn" : "ok"}`;
    }
    if (window.SyncEtcPortalShell && typeof window.SyncEtcPortalShell.setDirty === "function") {
      window.SyncEtcPortalShell.setDirty(state.dirty || state.locationDirty || state.assetTypeDirty, DIRTY_MESSAGE);
    }
    try {
      if (typeof mountOptions.onDirtyChange === "function") mountOptions.onDirtyChange(state.dirty || state.locationDirty || state.assetTypeDirty, DIRTY_MESSAGE);
    } catch {}
  }
  function setLocationDirty(value) { state.locationDirty = !!value; setDirty(state.dirty); }
  function setAssetTypeDirty(value) { state.assetTypeDirty = !!value; setDirty(state.dirty); }
  function markDirty() { setDirty(true); }
  function markLocationDirty() { setLocationDirty(true); }
  function markAssetTypeDirty() { setAssetTypeDirty(true); }
  function confirmDiscard(message = DIRTY_MESSAGE) { return !(state.dirty || state.locationDirty || state.assetTypeDirty) || window.confirm(message); }
  function isDirty() { return !!(state.dirty || state.locationDirty || state.assetTypeDirty); }
  function setActiveView(view) {
    const v = clean(view);
    mountOptions.initialView = v || mountOptions.initialView || "identity";
    const tabMap = { "asset-types": "asset-types", locations: "operations", spaces: "operations", "spaces-locations": "operations", assets: "identity", aircraft: "identity", "assets-aircraft": "identity", rates: "rates", usage: "rates", maintenance: "maintenance" };
    if (tabMap[v]) state.activeTab = tabMap[v];
    else if (["asset-types", "identity", "classification", "operations", "rates", "media", "maintenance"].includes(v)) state.activeTab = v;
  }

  function activeModuleView() {
    return clean(mountOptions.initialView || mountOptions.activeView || mountOptions.aircraftView || "");
  }

  function isLocationsOnly() {
    const v = activeModuleView();
    return mountOptions.embedded && ["locations", "spaces", "spaces-locations", "locations-only"].includes(v);
  }

  function isAssetTypesOnly() {
    const v = activeModuleView();
    return mountOptions.embedded && ["asset-types", "types", "assets-types"].includes(v);
  }

  function isAircraftOnly() {
    const v = activeModuleView();
    return mountOptions.embedded && !isLocationsOnly() && !isAssetTypesOnly() && ["identity", "classification", "operations", "rates", "usage", "media", "maintenance", "assets", "aircraft", "assets-aircraft", "aircraft-only"].includes(v || "identity");
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
    state.assetTypes = arr(result.asset_types || result.assetTypes);
    if (state.selectedAircraftId && !state.aircraft.some(a => clean(a.operational_asset_id) === state.selectedAircraftId)) state.selectedAircraftId = "";
    if (!state.selectedAircraftId && state.aircraft.length) state.selectedAircraftId = clean(state.aircraft[0].operational_asset_id);
    const selected = selectedAircraft();
    state.draft = selected ? draftFromAircraft(selected) : emptyAircraftDraft();
    state.locationDraft = state.locations[0] ? draftFromLocation(state.locations[0]) : emptyLocationDraft();
    state.selectedLocationId = clean(state.locationDraft.organization_location_id);
    if (state.selectedAssetTypeId && !state.assetTypes.some(t => clean(t.asset_type_id) === state.selectedAssetTypeId)) state.selectedAssetTypeId = "";
    if (!state.selectedAssetTypeId && state.assetTypes.length) state.selectedAssetTypeId = clean(state.assetTypes[0].asset_type_id);
    const selectedAssetTypeRecord = selectedAssetType();
    state.assetTypeDraft = selectedAssetTypeRecord ? draftFromAssetType(selectedAssetTypeRecord) : emptyAssetTypeDraft();
    setDirty(false);
    setLocationDirty(false);
    setAssetTypeDirty(false);
    setStatus("", "");
    render();
  }

  function selectedAircraft() { return state.aircraft.find(a => clean(a.operational_asset_id) === state.selectedAircraftId) || null; }
  function selectedLocation() { return state.locations.find(l => clean(l.organization_location_id) === state.selectedLocationId) || null; }

  function selectedAssetType() { return state.assetTypes.find(t => clean(t.asset_type_id) === state.selectedAssetTypeId) || null; }

  function emptyAssetTypeDraft() {
    return { asset_type_id: "", asset_type_key: "", label: "", plural_label: "", category_key: "other", description: "", notes: "", status: "active", sort_order: "100" };
  }

  function draftFromAssetType(t) {
    return {
      asset_type_id: clean(t.asset_type_id),
      asset_type_key: clean(t.asset_type_key),
      label: clean(t.label || t.display_name),
      plural_label: clean(t.plural_label),
      category_key: clean(t.category_key || t.category || "other"),
      description: clean(t.description),
      notes: clean(t.notes),
      status: clean(t.status || "active"),
      sort_order: numberOrBlank(t.sort_order || 100)
    };
  }

  function assetTypeStatus(t) {
    const status = clean(t && t.status) || (t && t.archived_at ? "archived" : "active");
    if (t && t.archived_at) return "archived";
    return ["active", "inactive", "archived"].includes(status) ? status : "active";
  }

  function sortedAssetTypes(list = state.assetTypes) {
    const rank = { active: 0, inactive: 1, archived: 2 };
    return arr(list).slice().sort((a, b) => {
      const as = assetTypeStatus(a);
      const bs = assetTypeStatus(b);
      if ((rank[as] ?? 9) !== (rank[bs] ?? 9)) return (rank[as] ?? 9) - (rank[bs] ?? 9);
      const ao = Number(a.sort_order ?? (as === "archived" ? 999 : 100));
      const bo = Number(b.sort_order ?? (bs === "archived" ? 999 : 100));
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
      if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
      if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
      return clean(a.label || a.asset_type_key).localeCompare(clean(b.label || b.asset_type_key));
    });
  }

  function assetTypeRowsForCurrentSearch() {
    const query = lower(state.assetTypeSearch);
    const filter = clean(state.assetTypeStatusFilter || "all");
    return sortedAssetTypes().filter(t => {
      const status = assetTypeStatus(t);
      if (filter !== "all" && status !== filter) return false;
      if (!query) return true;
      const haystack = [t.label, t.plural_label, t.description, t.notes, status].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function renumberAssetTypes(list) {
    let activeIndex = 0;
    return arr(list).map(t => {
      const status = assetTypeStatus(t);
      if (status === "archived") return { ...t, sort_order: 999 };
      activeIndex += 1;
      return { ...t, sort_order: activeIndex * 10 };
    });
  }
  function assetTypePayloadFromRecord(t) { return { ...draftFromAssetType(t), organization_id: state.orgId }; }

  function setAssetTypeOrderStatus(message, kind = "") {
    state.assetTypeOrderStatus = message || "";
    state.assetTypeOrderStatusKind = kind || "";
    document.querySelectorAll("[data-asset-type-order-status]").forEach(el => {
      el.className = `aircraft-order-status ${state.assetTypeOrderStatusKind || ""}`;
      el.textContent = state.assetTypeOrderStatus;
      el.style.display = state.assetTypeOrderStatus ? "inline-flex" : "none";
    });
  }

  function moveAssetTypeInList(sourceId, targetId, afterTarget = false) {
    const list = sortedAssetTypes();
    const sourceIndex = list.findIndex(t => clean(t.asset_type_id) === clean(sourceId));
    if (sourceIndex < 0) return null;
    const [source] = list.splice(sourceIndex, 1);
    const targetIndex = list.findIndex(t => clean(t.asset_type_id) === clean(targetId));
    if (targetIndex < 0) return null;
    list.splice(afterTarget ? targetIndex + 1 : targetIndex, 0, source);
    return renumberAssetTypes(list);
  }

  function moveAssetTypeByStep(assetTypeId, direction) {
    const visible = assetTypeRowsForCurrentSearch();
    const index = visible.findIndex(t => clean(t.asset_type_id) === clean(assetTypeId));
    if (index < 0) return null;
    if (direction === "up" && index > 0) return moveAssetTypeInList(assetTypeId, visible[index - 1].asset_type_id, false);
    if (direction === "down" && index < visible.length - 1) return moveAssetTypeInList(assetTypeId, visible[index + 1].asset_type_id, true);
    return null;
  }

  function canReorderAssetTypes() {
    if (state.saving || state.assetTypeOrderSaving) return false;
    if (state.dirty || state.locationDirty || state.assetTypeDirty) {
      setStatus("Save or discard changes before reordering asset types.", "error");
      return false;
    }
    return true;
  }

  async function persistAssetTypeOrder(nextAssetTypes) {
    if (!nextAssetTypes || !nextAssetTypes.length || !canReorderAssetTypes()) return;
    const previousAssetTypes = state.assetTypes.map(t => ({ ...t }));
    const previousDraft = state.assetTypeDraft ? { ...state.assetTypeDraft } : null;
    const previousSelectedId = state.selectedAssetTypeId;
    const previousById = new Map(previousAssetTypes.map(t => [clean(t.asset_type_id), t]));
    const changed = nextAssetTypes.filter(t => {
      const prev = previousById.get(clean(t.asset_type_id));
      return prev && Number(prev.sort_order ?? 100) !== Number(t.sort_order ?? 100);
    });
    if (!changed.length) return;
    state.assetTypes = nextAssetTypes;
    const selected = selectedAssetType();
    if (selected) state.assetTypeDraft = draftFromAssetType(selected);
    state.assetTypeOrderSaving = true;
    setAssetTypeOrderStatus("Saving order...", "");
    render();
    try {
      let result = null;
      for (const assetType of changed) result = await callAccess("organization_save_asset_type", assetTypePayloadFromRecord(assetType));
      if (result) state.assetTypes = arr(result.asset_types || result.assetTypes);
      if (previousSelectedId) state.selectedAssetTypeId = previousSelectedId;
      const refreshed = selectedAssetType();
      if (refreshed) state.assetTypeDraft = draftFromAssetType(refreshed);
      state.assetTypeOrderSaving = false;
      setAssetTypeOrderStatus("Order saved.", "ok");
      render();
    } catch (error) {
      state.assetTypes = previousAssetTypes;
      state.selectedAssetTypeId = previousSelectedId;
      state.assetTypeDraft = previousDraft;
      state.assetTypeOrderSaving = false;
      setAssetTypeOrderStatus(error instanceof Error ? `Order could not be saved: ${error.message}` : "Order could not be saved.", "error");
      render();
    }
  }

  function locationStatus(l) {
    const status = clean(l && l.status) || (l && l.archived_at ? "archived" : "active");
    if (l && l.archived_at) return "archived";
    return ["active", "inactive", "archived"].includes(status) ? status : "active";
  }

  function sortedLocations(list = state.locations) {
    const rank = { active: 0, inactive: 1, archived: 2 };
    return arr(list).slice().sort((a, b) => {
      const as = locationStatus(a);
      const bs = locationStatus(b);
      if ((rank[as] ?? 9) !== (rank[bs] ?? 9)) return (rank[as] ?? 9) - (rank[bs] ?? 9);
      const ao = Number(a.sort_order ?? (as === "archived" ? 999 : 100));
      const bo = Number(b.sort_order ?? (bs === "archived" ? 999 : 100));
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
      if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
      if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
      return clean(a.display_name || a.airport_identifier).localeCompare(clean(b.display_name || b.airport_identifier));
    });
  }

  function locationPayloadFromRecord(location) {
    const d = draftFromLocation(location);
    return {
      ...d,
      sort_order: locationStatus(d) === "archived" ? "999" : d.sort_order,
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

  function setLocationOrderStatus(message, kind = "") {
    state.locationOrderStatus = message || "";
    state.locationOrderStatusKind = kind || "";
    document.querySelectorAll("[data-location-order-status]").forEach(el => {
      el.className = `aircraft-order-status ${state.locationOrderStatusKind || ""}`;
      el.textContent = state.locationOrderStatus;
      el.style.display = state.locationOrderStatus ? "inline-flex" : "none";
    });
  }

  function renumberLocations(list) {
    let activeIndex = 0;
    return arr(list).map(location => {
      const status = locationStatus(location);
      if (status === "archived") return { ...location, sort_order: 999 };
      activeIndex += 1;
      return { ...location, sort_order: activeIndex * 10 };
    });
  }

  function locationRowsForCurrentSearch() {
    const query = lower(state.locationSearch);
    const filter = clean(state.locationStatusFilter || "all");
    return sortedLocations().filter(l => {
      const status = locationStatus(l);
      if (filter !== "all" && status !== filter) return false;
      if (!query) return true;
      const haystack = [l.display_name, l.airport_identifier, l.location_type, l.city || obj(l.address_json).city, l.state_region || obj(l.address_json).state_region || obj(l.address_json).state, l.postal_code || obj(l.address_json).postal_code, status].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function moveLocationInList(sourceId, targetId, afterTarget = false) {
    const list = sortedLocations();
    const sourceIndex = list.findIndex(l => clean(l.organization_location_id) === clean(sourceId));
    if (sourceIndex < 0) return null;
    const [source] = list.splice(sourceIndex, 1);
    const targetIndex = list.findIndex(l => clean(l.organization_location_id) === clean(targetId));
    if (targetIndex < 0) return null;
    list.splice(afterTarget ? targetIndex + 1 : targetIndex, 0, source);
    return renumberLocations(list);
  }

  function moveLocationByStep(locationId, direction) {
    const visible = locationRowsForCurrentSearch();
    const index = visible.findIndex(l => clean(l.organization_location_id) === clean(locationId));
    if (index < 0) return null;
    if (direction === "up" && index > 0) return moveLocationInList(locationId, visible[index - 1].organization_location_id, false);
    if (direction === "down" && index < visible.length - 1) return moveLocationInList(locationId, visible[index + 1].organization_location_id, true);
    return null;
  }

  function canReorderLocations() {
    if (state.saving || state.locationOrderSaving) return false;
    if (state.dirty || state.locationDirty) {
      setStatus("Save or discard changes before reordering locations.", "error");
      return false;
    }
    return true;
  }

  async function persistLocationOrder(nextLocations) {
    if (!nextLocations || !nextLocations.length || !canReorderLocations()) return;
    const previousLocations = state.locations.map(l => ({ ...l }));
    const previousDraft = state.locationDraft ? { ...state.locationDraft } : null;
    const previousSelectedId = state.selectedLocationId;
    const previousById = new Map(previousLocations.map(l => [clean(l.organization_location_id), l]));
    const changed = nextLocations.filter(l => {
      const prev = previousById.get(clean(l.organization_location_id));
      return prev && Number(prev.sort_order ?? 100) !== Number(l.sort_order ?? 100);
    });
    if (!changed.length) return;

    state.locations = nextLocations;
    const selected = selectedLocation();
    if (selected) state.locationDraft = draftFromLocation(selected);
    state.locationOrderSaving = true;
    setLocationOrderStatus("Saving order...", "");
    render();

    try {
      let result = null;
      for (const location of changed) {
        result = await callAccess("organization_save_aircraft_location", locationPayloadFromRecord(location));
      }
      if (result) {
        state.locations = arr(result.locations);
        state.aircraft = arr(result.aircraft);
      }
      if (previousSelectedId) state.selectedLocationId = previousSelectedId;
      const refreshed = selectedLocation();
      if (refreshed) state.locationDraft = draftFromLocation(refreshed);
      state.locationOrderSaving = false;
      setLocationOrderStatus("Order saved.", "ok");
      render();
    } catch (error) {
      state.locations = previousLocations;
      state.selectedLocationId = previousSelectedId;
      state.locationDraft = previousDraft;
      state.locationOrderSaving = false;
      setLocationOrderStatus(error instanceof Error ? `Order could not be saved: ${error.message}` : "Order could not be saved.", "error");
      render();
    }
  }

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

  function setAssetTypeDraft(key, value) { if (!state.assetTypeDraft) state.assetTypeDraft = emptyAssetTypeDraft(); state.assetTypeDraft[key] = value; markAssetTypeDirty(); }

  function updateDraftStatus(status) {
    if (!state.draft) state.draft = emptyAircraftDraft();
    state.draft.asset_record_status = status;
    markDirty();
  }

  function updateLocationDraftStatus(status) {
    if (!state.locationDraft) state.locationDraft = emptyLocationDraft();
    state.locationDraft.status = status;
    markLocationDirty();
  }

  function updateAssetTypeDraftStatus(status) {
    if (!state.assetTypeDraft) state.assetTypeDraft = emptyAssetTypeDraft();
    state.assetTypeDraft.status = status;
    markAssetTypeDirty();
  }

  function collectAircraftPayload() {
    const d = state.draft || emptyAircraftDraft();
    return {
      ...d,
      organization_id: state.orgId,
      include_archived: true,
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
      sort_order: locationStatus(d) === "archived" ? "999" : d.sort_order,
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

  function collectAssetTypePayload(draft) {
    const d = draft || state.assetTypeDraft || emptyAssetTypeDraft();
    return { ...d, organization_id: state.orgId, category_key: d.category_key || "other" };
  }

  async function saveAssetType() {
    try {
      const d = state.assetTypeDraft || emptyAssetTypeDraft();
      if (!clean(d.label)) throw new Error("Enter an asset type name.");
      state.saving = true; clearError(); setStatus("Saving asset type..."); renderActionState();
      const result = await callAccess("organization_save_asset_type", collectAssetTypePayload());
      state.assetTypes = arr(result.asset_types || result.assetTypes);
      const saved = obj(result.asset_type);
      state.selectedAssetTypeId = clean(saved.asset_type_id || state.selectedAssetTypeId);
      state.assetTypeDraft = draftFromAssetType(saved);
      state.assetTypeStatusFilter = "all";
      setAssetTypeDirty(false);
      setStatus("Asset type saved.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  async function archiveAssetType(restore = false) {
    const selected = selectedAssetType();
    if (!selected) return;
    if (!restore && !window.confirm("Archive this asset type? Existing asset records are not deleted.")) return;
    try {
      state.saving = true; clearError(); renderActionState();
      const result = await callAccess(restore ? "organization_restore_asset_type" : "organization_archive_asset_type", { organization_id: state.orgId, asset_type_id: clean(selected.asset_type_id) });
      state.assetTypes = arr(result.asset_types || result.assetTypes);
      const saved = obj(result.asset_type);
      state.selectedAssetTypeId = clean(saved.asset_type_id || state.assetTypes[0]?.asset_type_id || "");
      const refreshed = selectedAssetType();
      state.assetTypeDraft = refreshed ? draftFromAssetType(refreshed) : emptyAssetTypeDraft();
      state.assetTypeStatusFilter = "all";
      setAssetTypeDirty(false);
      setStatus(restore ? "Asset type restored." : "Asset type archived.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  function newAssetType() { if (!confirmDiscard("You have unsaved asset type changes. Continue?")) return; state.assetTypeStatusFilter = "all"; state.selectedAssetTypeId = ""; state.assetTypeDraft = emptyAssetTypeDraft(); setAssetTypeDirty(false); render(); }
  function clearAssetType() {
    if (!confirmDiscard("Reset this asset type form? Unsaved changes will be discarded.")) return;
    const selected = selectedAssetType();
    state.assetTypeDraft = selected ? draftFromAssetType(selected) : emptyAssetTypeDraft();
    setAssetTypeDirty(false);
    render();
  }

  async function saveAircraft() {
    try {
      state.saving = true; clearError(); setStatus("Saving aircraft..."); renderActionState();
      const result = await callAccess("organization_save_aircraft", collectAircraftPayload());
      state.aircraft = arr(result.aircraft);
      state.locations = arr(result.locations);
      state.assetTypes = arr(result.asset_types || result.assetTypes || state.assetTypes);
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
      state.assetTypes = arr(result.asset_types || result.assetTypes || state.assetTypes);
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
      state.assetTypes = arr(result.asset_types || result.assetTypes || state.assetTypes);
      const saved = obj(result.location);
      state.selectedLocationId = clean(saved.organization_location_id || state.selectedLocationId);
      state.locationDraft = draftFromLocation(saved);
      state.locationStatusFilter = "all";
      setLocationDirty(false);
      setStatus("Location saved.", "ok");
      render();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { state.saving = false; renderActionState(); }
  }

  function newAircraft() { if (!confirmDiscard()) return; state.statusFilter = "all"; state.selectedAircraftId = ""; state.draft = emptyAircraftDraft(); setDirty(false); setStatus("New aircraft draft ready."); render(); }
  function clearAircraft() {
    if (!confirmDiscard("Reset this aircraft form? Unsaved changes will be discarded.")) return;
    const selected = selectedAircraft();
    state.draft = selected ? draftFromAircraft(selected) : emptyAircraftDraft();
    setDirty(false);
    render();
  }
  function newLocation() { if (!confirmDiscard("You have unsaved location changes. Continue?")) return; state.selectedLocationId = ""; state.locationDraft = emptyLocationDraft(); setLocationDirty(false); render(); }
  function clearLocation() {
    if (!confirmDiscard("Reset this location form? Unsaved changes will be discarded.")) return;
    const selected = selectedLocation();
    state.locationDraft = selected ? draftFromLocation(selected) : emptyLocationDraft();
    setLocationDirty(false);
    render();
  }
  function archiveLocation(restore = false) {
    const d = state.locationDraft || emptyLocationDraft();
    if (!d.organization_location_id) return;
    if (!restore && !window.confirm("Archive this location? It can be restored later.")) return;
    updateLocationDraftStatus(restore ? "active" : "archived");
    saveLocation();
  }

  function aircraftRecordStatus(a) {
    if (!a) return "available";
    if (a.archived_at || clean(a.asset_record_status) === "archived") return "archived";
    if (bool(a.do_not_dispatch)) return "do-not-dispatch";
    const key = clean(a.status_key || a.asset_record_status || "available");
    return ["available", "maintenance", "grounded", "do-not-dispatch", "inactive", "archived"].includes(key) ? key : "available";
  }

  function sortedAircraft(list = state.aircraft) {
    const rank = { available: 0, maintenance: 0, grounded: 0, "do-not-dispatch": 0, inactive: 1, archived: 2 };
    return arr(list).slice().sort((a, b) => {
      const as = aircraftRecordStatus(a);
      const bs = aircraftRecordStatus(b);
      if ((rank[as] ?? 9) !== (rank[bs] ?? 9)) return (rank[as] ?? 9) - (rank[bs] ?? 9);
      const ao = Number(a.sort_order ?? (as === "archived" ? 999 : 100));
      const bo = Number(b.sort_order ?? (bs === "archived" ? 999 : 100));
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
      if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
      if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
      return clean(a.tail_number || a.display_name || a.asset_key).localeCompare(clean(b.tail_number || b.display_name || b.asset_key));
    });
  }

  function aircraftRowsForCurrentSearch() {
    const q = lower(state.search);
    const filter = clean(state.statusFilter || "all");
    return sortedAircraft().filter(a => {
      const status = aircraftRecordStatus(a);
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      const haystack = [a.tail_number, a.display_name, a.aircraft_make, a.aircraft_model, a.icao_type_code, a.base_location_name, a.base_airport_identifier, status].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  function filteredAircraft() { return aircraftRowsForCurrentSearch(); }

  function renumberAircraft(list) {
    let activeIndex = 0;
    return arr(list).map(a => {
      const status = aircraftRecordStatus(a);
      if (status === "archived") return { ...a, sort_order: 999 };
      activeIndex += 1;
      return { ...a, sort_order: activeIndex * 10 };
    });
  }

  function aircraftPayloadFromRecord(a) {
    const d = draftFromAircraft(a);
    const features = featureKeys(d);
    return {
      ...d,
      organization_id: state.orgId,
      include_archived: true,
      display_name: d.display_name || d.preferred_name || d.tail_number,
      sort_order: aircraftRecordStatus(a) === "archived" ? "999" : numberOrBlank(a.sort_order || 100),
      specs_json: { source: "aircraft_admin_0115E", asset_type: "aircraft", features },
      operational_json: { status_note: d.dispatch_note || "" },
      usage_json: { usage_tracking_basis: d.usage_tracking_basis, current_tach: d.current_tach, current_hobbs: d.current_hobbs, current_airframe_hours: d.current_airframe_hours },
      billing_json: { billing_basis: d.billing_basis, fuel_included: !!d.fuel_included, tax_behavior: d.tax_behavior },
      maintenance_json: { placeholder: true, note: "Reminder and squawk systems are separate modules." },
      media_json: { primary_photo_url: d.primary_photo_url, panel_photo_url: d.panel_photo_url },
      settings_json: { saved_from: "aircraft_admin_0115F" }
    };
  }

  function setAircraftOrderStatus(message, kind = "") {
    state.aircraftOrderStatus = message || "";
    state.aircraftOrderStatusKind = kind || "";
    document.querySelectorAll("[data-aircraft-order-status]").forEach(el => {
      el.className = `aircraft-order-status ${state.aircraftOrderStatusKind || ""}`;
      el.textContent = state.aircraftOrderStatus;
      el.style.display = state.aircraftOrderStatus ? "inline-flex" : "none";
    });
  }

  function moveAircraftInList(sourceId, targetId, afterTarget = false) {
    const list = sortedAircraft();
    const sourceIndex = list.findIndex(a => clean(a.operational_asset_id) === clean(sourceId));
    if (sourceIndex < 0) return null;
    const [source] = list.splice(sourceIndex, 1);
    const targetIndex = list.findIndex(a => clean(a.operational_asset_id) === clean(targetId));
    if (targetIndex < 0) return null;
    list.splice(afterTarget ? targetIndex + 1 : targetIndex, 0, source);
    return renumberAircraft(list);
  }

  function moveAircraftByStep(aircraftId, direction) {
    const visible = aircraftRowsForCurrentSearch();
    const index = visible.findIndex(a => clean(a.operational_asset_id) === clean(aircraftId));
    if (index < 0) return null;
    if (direction === "up" && index > 0) return moveAircraftInList(aircraftId, visible[index - 1].operational_asset_id, false);
    if (direction === "down" && index < visible.length - 1) return moveAircraftInList(aircraftId, visible[index + 1].operational_asset_id, true);
    return null;
  }

  function canReorderAircraft() {
    if (state.saving || state.aircraftOrderSaving) return false;
    if (state.dirty || state.locationDirty || state.assetTypeDirty) {
      setStatus("Save or discard changes before reordering aircraft.", "error");
      return false;
    }
    return true;
  }

  async function persistAircraftOrder(nextAircraft) {
    if (!nextAircraft || !nextAircraft.length || !canReorderAircraft()) return;
    const previousAircraft = state.aircraft.map(a => ({ ...a }));
    const previousDraft = state.draft ? { ...state.draft } : null;
    const previousSelectedId = state.selectedAircraftId;
    const previousById = new Map(previousAircraft.map(a => [clean(a.operational_asset_id), a]));
    const changed = nextAircraft.filter(a => {
      const prev = previousById.get(clean(a.operational_asset_id));
      return prev && Number(prev.sort_order ?? 100) !== Number(a.sort_order ?? 100);
    });
    if (!changed.length) return;
    state.aircraft = nextAircraft;
    const selected = selectedAircraft();
    if (selected) state.draft = draftFromAircraft(selected);
    state.aircraftOrderSaving = true;
    setAircraftOrderStatus("Saving order...", "");
    render();
    try {
      let result = null;
      for (const aircraft of changed) result = await callAccess("organization_save_aircraft", aircraftPayloadFromRecord(aircraft));
      if (result) {
        state.aircraft = arr(result.aircraft);
        state.locations = arr(result.locations || state.locations);
        state.assetTypes = arr(result.asset_types || result.assetTypes || state.assetTypes);
      }
      if (previousSelectedId) state.selectedAircraftId = previousSelectedId;
      const refreshed = selectedAircraft();
      if (refreshed) state.draft = draftFromAircraft(refreshed);
      state.aircraftOrderSaving = false;
      setAircraftOrderStatus("Order saved.", "ok");
      render();
    } catch (error) {
      state.aircraft = previousAircraft;
      state.selectedAircraftId = previousSelectedId;
      state.draft = previousDraft;
      state.aircraftOrderSaving = false;
      setAircraftOrderStatus(error instanceof Error ? `Order could not be saved: ${error.message}` : "Order could not be saved.", "error");
      render();
    }
  }

  function statusBadge(statusKey, doNotDispatch) {
    const key = doNotDispatch ? "do-not-dispatch" : clean(statusKey || "available");
    const label = key === "do-not-dispatch" ? "Do Not Dispatch" : key ? key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Available";
    const cls = key === "available" ? "ok" : (key === "maintenance" ? "warn" : (key === "grounded" || key === "do-not-dispatch" ? "danger" : "neutral"));
    return `<span class="aircraft-pill ${cls}">${esc(label)}</span>`;
  }

  function renderStatus() {
    const cls = state.statusKind === "error" ? "error" : state.statusKind === "ok" ? "ok" : "";
    const legacy = field("aircraft-status");
    if (legacy) legacy.style.display = "none";
    document.querySelectorAll("[data-inline-status]").forEach(el => {
      el.className = `aircraft-inline-status ${cls}`;
      el.textContent = state.status || "";
      el.style.display = state.status ? "inline-flex" : "none";
    });
  }

  function renderActionState() {
    document.querySelectorAll("[data-save-button]").forEach(btn => { btn.disabled = state.saving; btn.textContent = state.saving ? "Saving..." : btn.dataset.label || "Save"; });
  }

  function dirtyBadgeHtml() {
    return `<span id="aircraft-dirty-badge" class="aircraft-pill ${state.dirty || state.locationDirty || state.assetTypeDirty ? "warn" : "ok"}">${state.dirty || state.locationDirty || state.assetTypeDirty ? "Unsaved changes" : "Saved"}</span>`;
  }

  function inlineStatusHtml() {
    const cls = state.statusKind === "error" ? "error" : state.statusKind === "ok" ? "ok" : "";
    return `<span data-inline-status class="aircraft-inline-status ${cls}" style="display:${state.status ? "inline-flex" : "none"}">${esc(state.status || "")}</span>`;
  }

  function renderOrgSelector() {
    if (state.organizations.length <= 1) return "";
    return `<label class="aircraft-field compact"><span>Organization</span><select id="aircraft-org-select">${state.organizations.map(o => `<option value="${attr(o.organization_id)}" ${o.organization_id === state.orgId ? "selected" : ""}>${esc(o.display_name)}</option>`).join("")}</select></label>`;
  }

  function renderList(hideHeader = false) {
    const rows = aircraftRowsForCurrentSearch();
    const statusFilters = [["all","All"],["available","Available"],["maintenance","Maintenance"],["grounded","Grounded"],["do-not-dispatch","Do Not Dispatch"],["inactive","Inactive"],["archived","Archived"]];
    const statusText = (a) => {
      const status = aircraftRecordStatus(a);
      if (status === "do-not-dispatch") return "Do Not Dispatch";
      return status.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };
    return `
      <section class="${hideHeader ? "aircraft-subpanel" : "aircraft-card"} aircraft-list-card">
        ${hideHeader ? "" : `<div class="aircraft-section-head compact">
          <div><h2>Assets / Aircraft</h2><p>Manage aircraft records, visibility, dispatch status, and operating details.</p></div>
          <button class="aircraft-button secondary" id="aircraft-new">New Aircraft</button>
        </div>
        <div class="aircraft-module-divider"></div>`}
        <div class="aircraft-filter-row asset-type-filter-row">
          <select id="aircraft-status-filter" aria-label="Filter aircraft by status">
            ${statusFilters.map(([value,label]) => `<option value="${value}" ${state.statusFilter === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <div class="aircraft-list-tools"><input id="aircraft-search" value="${attr(state.aircraftSearchText)}" placeholder="Search tail, model, base..."></div>
        <div class="aircraft-order-tools">
          <span class="aircraft-order-hint">Drag or use arrows to sort. Archived aircraft stay at the bottom.</span>
          <span data-aircraft-order-status class="aircraft-order-status ${state.aircraftOrderStatusKind}" style="display:${state.aircraftOrderStatus ? "inline-flex" : "none"}">${esc(state.aircraftOrderStatus)}</span>
        </div>
        <div class="aircraft-list aircraft-reorder-list">
          ${rows.length ? rows.map((a, index) => {
            const selected = clean(a.operational_asset_id) === state.selectedAircraftId;
            const id = attr(a.operational_asset_id);
            const sub = [a.aircraft_year, a.aircraft_make, a.aircraft_model, a.icao_type_code].filter(Boolean).join(" ");
            const base = clean(a.base_airport_identifier || a.home_base || a.base_location_name || "No base set");
            const status = aircraftRecordStatus(a);
            const canMove = status !== "archived" && !state.aircraftOrderSaving;
            return `<div class="aircraft-location-row aircraft-record-row ${selected ? "selected" : ""} ${state.aircraftOrderSaving ? "saving" : ""} ${status === "archived" ? "archived" : ""} ${status === "inactive" ? "inactive" : ""}" draggable="${canMove ? "true" : "false"}" data-aircraft-row data-aircraft-id="${id}">
              <button class="aircraft-location-main" type="button" data-aircraft-select="${id}">
                <span class="aircraft-drag-handle" aria-hidden="true">☰</span>
                <span class="aircraft-location-copy">
                  <strong>${esc(a.tail_number || a.display_name || "Aircraft")}</strong>
                  <span class="aircraft-location-meta">${esc([sub || "Aircraft details not complete", base].filter(Boolean).join(" · "))}</span>
                  <span class="aircraft-list-badge ${status === "archived" ? "archived" : status === "inactive" ? "inactive" : ""}">${esc(statusText(a))}</span>
                </span>
              </button>
              <span class="aircraft-order-buttons">
                <button type="button" class="aircraft-order-button" data-aircraft-move="${id}" data-direction="up" ${index === 0 || !canMove ? "disabled" : ""} aria-label="Move aircraft up">▲</button>
                <button type="button" class="aircraft-order-button" data-aircraft-move="${id}" data-direction="down" ${index === rows.length - 1 || !canMove ? "disabled" : ""} aria-label="Move aircraft down">▼</button>
              </span>
            </div>`;
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
      <section class="aircraft-subpanel aircraft-editor-card">
        <div class="aircraft-editor-head">
          <div>
            <h2>${d.operational_asset_id ? esc(d.tail_number || d.display_name || "Edit Aircraft") : "New Aircraft"}</h2>
          </div>
        </div>
        ${renderTabs()}
        <div class="aircraft-tab-panel">${renderActiveTab(d)}</div>
        <div class="aircraft-actions aircraft-save-row">
          <div class="aircraft-bottom-state">${dirtyBadgeHtml()}${inlineStatusHtml()}</div>
          <div class="aircraft-action-buttons">
            <button class="aircraft-button secondary" id="aircraft-reset">Reset</button>
            ${d.operational_asset_id ? `<button class="aircraft-button ${archived ? "secondary" : "danger"}" id="aircraft-archive">${archived ? "Restore" : "Archive"}</button>` : ""}
            <button class="aircraft-button" data-save-button data-label="Save Aircraft" id="aircraft-save">Save Aircraft</button>
          </div>
        </div>
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

  function renderAssetTypes() {
    const d = state.assetTypeDraft || emptyAssetTypeDraft();
    const rows = assetTypeRowsForCurrentSearch();
    const archived = clean(selectedAssetType()?.status) === "archived" || !!selectedAssetType()?.archived_at;
    const statusFilters = [["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"]];
    const statusLabel = (value) => ({ active: "Active", inactive: "Inactive", archived: "Archived" }[assetTypeStatus(value)] || "Active");
    return `
      <section class="aircraft-card aircraft-location-card aircraft-asset-type-card">
        <div class="aircraft-section-head compact">
          <div><h2>Asset Types</h2><p>Manage simple asset classifications. Rates, meters, maintenance, reservations, and billing belong on assets or later setup pages.</p></div>
          <button class="aircraft-button secondary" id="aircraft-new-asset-type">New Asset Type</button>
        </div>
        <div class="aircraft-module-divider"></div>
        <div class="aircraft-location-layout">
          <div class="aircraft-location-list-wrap">
            <div class="aircraft-filter-row asset-type-filter-row">
              <select id="aircraft-asset-type-status-filter" aria-label="Filter asset types by status">
                ${statusFilters.map(([value, label]) => `<option value="${value}" ${state.assetTypeStatusFilter === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </div>
            <div class="aircraft-list-tools"><input id="aircraft-asset-type-search" value="${attr(state.assetTypeSearchText)}" placeholder="Search asset types"></div>
            <div class="aircraft-order-tools">
              <span class="aircraft-order-hint">Drag or use arrows to sort. Archived types stay at the bottom.</span>
              <span data-asset-type-order-status class="aircraft-order-status ${state.assetTypeOrderStatusKind}" style="display:${state.assetTypeOrderStatus ? "inline-flex" : "none"}">${esc(state.assetTypeOrderStatus)}</span>
            </div>
            <div class="aircraft-location-list">
              ${rows.length ? rows.map((t, index) => {
                const selected = clean(t.asset_type_id) === state.selectedAssetTypeId;
                const id = attr(t.asset_type_id);
                const status = assetTypeStatus(t);
                const canMove = status !== "archived" && !state.assetTypeOrderSaving;
                return `<div class="aircraft-location-row aircraft-asset-type-row ${selected ? "selected" : ""} ${state.assetTypeOrderSaving ? "saving" : ""} ${status === "archived" ? "archived" : ""} ${status === "inactive" ? "inactive" : ""}" draggable="${canMove ? "true" : "false"}" data-asset-type-row data-asset-type-id="${id}">
                  <button class="aircraft-location-main" type="button" data-asset-type-select="${id}">
                    <span class="aircraft-drag-handle" aria-hidden="true">☰</span>
                    <span class="aircraft-location-copy">
                      <strong>${esc(t.label || t.asset_type_key || "Asset Type")}</strong>
                      <span class="aircraft-location-meta">${esc(t.plural_label || "")}</span>
                      <span class="aircraft-list-badge ${status}">${esc(statusLabel(t))}</span>
                    </span>
                  </button>
                  <span class="aircraft-order-buttons">
                    <button type="button" class="aircraft-order-button" data-asset-type-move="${id}" data-direction="up" ${index === 0 || !canMove ? "disabled" : ""} aria-label="Move asset type up">▲</button>
                    <button type="button" class="aircraft-order-button" data-asset-type-move="${id}" data-direction="down" ${index === rows.length - 1 || !canMove ? "disabled" : ""} aria-label="Move asset type down">▼</button>
                  </span>
                </div>`;
              }).join("") : `<div class="aircraft-empty">No asset types match the current filters.</div>`}
            </div>
          </div>
          <div class="aircraft-location-form">
            <div class="aircraft-form-grid compact">
              <label class="aircraft-field"><span>Name *</span><input data-asset-type-key="label" value="${attr(d.label)}" placeholder="Aircraft"></label>
              <label class="aircraft-field"><span>Plural label</span><input data-asset-type-key="plural_label" value="${attr(d.plural_label)}" placeholder="Aircraft"></label>
              <label class="aircraft-field"><span>Status</span><select data-asset-type-key="status"><option value="active" ${d.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${d.status === "inactive" ? "selected" : ""}>Inactive</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>Archived</option></select></label>
              <label class="aircraft-field full"><span>Description</span><textarea data-asset-type-key="description" placeholder="Short explanation for admins.">${esc(d.description)}</textarea></label>
              <label class="aircraft-field full"><span>Notes</span><textarea data-asset-type-key="notes" placeholder="Optional internal notes.">${esc(d.notes)}</textarea></label>
            </div>
            <div class="aircraft-actions aircraft-save-row">
              <div class="aircraft-bottom-state">${dirtyBadgeHtml()}${inlineStatusHtml()}</div>
              <div class="aircraft-action-buttons">
                <button class="aircraft-button secondary" id="aircraft-clear-asset-type">Reset</button>
                ${d.asset_type_id ? `<button class="aircraft-button ${archived ? "secondary" : "danger"}" id="aircraft-archive-asset-type">${archived ? "Restore" : "Archive"}</button>` : ""}
                <button class="aircraft-button" data-save-button data-label="Save Asset Type" id="aircraft-save-asset-type">Save Asset Type</button>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderLocations() {
    const d = state.locationDraft || emptyLocationDraft();
    const locationRows = locationRowsForCurrentSearch();
    const activeSearch = !!clean(state.locationSearch);
    const typeOptions = [
      ["airport", "Airport"],
      ["hangar", "Hangar"],
      ["meeting-room", "Meeting room"],
      ["office", "Office"],
      ["dock", "Dock"],
      ["storage", "Storage"],
      ["other", "Other"]
    ];
    const statusLabel = (value) => ({ active: "Active", inactive: "Inactive", archived: "Archived" }[locationStatus(value)] || "Active");
    const statusFilters = [["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"]];
    return `
      <section class="aircraft-card aircraft-location-card">
        <div class="aircraft-section-head compact">
          <div><h2>Spaces & Locations</h2><p>Manage shared locations such as airports, hangars, meeting rooms, offices, docks, storage, or other operating locations.</p></div>
          <button class="aircraft-button secondary" id="aircraft-new-location">New Location</button>
        </div>
        <div class="aircraft-module-divider"></div>
        <div class="aircraft-location-layout">
          <div class="aircraft-location-list-wrap">
            <div class="aircraft-filter-row asset-type-filter-row">
              <select id="aircraft-location-status-filter" aria-label="Filter spaces and locations by status">
                ${statusFilters.map(([value, label]) => `<option value="${value}" ${state.locationStatusFilter === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </div>
            <div class="aircraft-list-tools"><input id="aircraft-location-search" value="${attr(state.locationSearchText)}" placeholder="Search locations"></div>
            <div class="aircraft-order-tools">
              <span class="aircraft-order-hint">Drag or use arrows to sort.</span>
              <span data-location-order-status class="aircraft-order-status ${state.locationOrderStatusKind}" style="display:${state.locationOrderStatus ? "inline-flex" : "none"}">${esc(state.locationOrderStatus)}</span>
            </div>
            <div class="aircraft-location-list">
              ${locationRows.length ? locationRows.map((l, index) => {
                const selected = clean(l.organization_location_id) === state.selectedLocationId;
                const id = attr(l.organization_location_id);
                const status = locationStatus(l);
                const canMove = status !== "archived" && !state.locationOrderSaving;
                const meta = [l.airport_identifier, l.location_type, l.city || obj(l.address_json).city, l.state_region || obj(l.address_json).state_region || obj(l.address_json).state].filter(Boolean).join(" · ");
                return `<div class="aircraft-location-row ${selected ? "selected" : ""} ${state.locationOrderSaving ? "saving" : ""} ${status === "archived" ? "archived" : ""} ${status === "inactive" ? "inactive" : ""}" draggable="${canMove ? "true" : "false"}" data-location-row data-location-id="${id}">
                  <button class="aircraft-location-main" type="button" data-location-select="${id}">
                    <span class="aircraft-drag-handle" aria-hidden="true">☰</span>
                    <span class="aircraft-location-copy">
                      <strong>${esc(l.display_name || l.airport_identifier || "Location")}</strong>
                      <span class="aircraft-location-meta">${esc(meta)}</span>
                      ${status !== "active" ? `<span class="aircraft-list-badge ${status}">${esc(statusLabel(l))}</span>` : ""}
                    </span>
                  </button>
                  <span class="aircraft-order-buttons">
                    <button type="button" class="aircraft-order-button" data-location-move="${id}" data-direction="up" ${index === 0 || !canMove ? "disabled" : ""} aria-label="Move location up">▲</button>
                    <button type="button" class="aircraft-order-button" data-location-move="${id}" data-direction="down" ${index === locationRows.length - 1 || !canMove ? "disabled" : ""} aria-label="Move location down">▼</button>
                  </span>
                </div>`;
              }).join("") : `<div class="aircraft-empty">No locations match the current filters.</div>`}
            </div>
          </div>
          <div class="aircraft-location-form">
            <div class="aircraft-form-grid compact">
              <label class="aircraft-field"><span>Display name *</span><input data-location-key="display_name" value="${attr(d.display_name)}" placeholder="First Flight Airport"></label>
              <label class="aircraft-field"><span>Location type *</span><select data-location-key="location_type">${typeOptions.map(([value,label]) => `<option value="${value}" ${d.location_type === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label class="aircraft-field"><span>Airport / location identifier</span><input data-location-key="airport_identifier" value="${attr(d.airport_identifier)}" placeholder="KFFA, Hangar A, Room 2"></label>
              <label class="aircraft-field"><span>Time zone</span><input data-location-key="time_zone" value="${attr(d.time_zone)}" placeholder="America/New_York"></label>
              <label class="aircraft-field"><span>Address line 1</span><input data-location-key="address_line_1" value="${attr(d.address_line_1)}" placeholder="Street address or facility address"></label>
              <label class="aircraft-field"><span>Address line 2</span><input data-location-key="address_line_2" value="${attr(d.address_line_2)}" placeholder="Hangar, suite, unit, gate, or room"></label>
              <label class="aircraft-field"><span>City</span><input data-location-key="city" value="${attr(d.city)}"></label>
              <label class="aircraft-field"><span>State / region</span><input data-location-key="state_region" value="${attr(d.state_region)}"></label>
              <label class="aircraft-field"><span>Postal code</span><input data-location-key="postal_code" value="${attr(d.postal_code)}"></label>
              <label class="aircraft-field"><span>Country</span><input data-location-key="country" value="${attr(d.country)}" placeholder="US"></label>
              <label class="aircraft-field"><span>Status</span><select data-location-key="status"><option value="active" ${d.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${d.status === "inactive" ? "selected" : ""}>Inactive</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>Archived</option></select></label>
            </div>
            <label class="aircraft-field full"><span>Notes</span><textarea data-location-key="notes" placeholder="Optional operating notes, directions, access instructions, or internal location notes.">${esc(d.notes)}</textarea></label>
            <div class="aircraft-actions aircraft-save-row">
              <div class="aircraft-bottom-state">${dirtyBadgeHtml()}${inlineStatusHtml()}</div>
              <div class="aircraft-action-buttons">
                <button class="aircraft-button secondary" id="aircraft-clear-location">Reset</button>
                ${d.organization_location_id ? `<button class="aircraft-button ${locationStatus(d) === "archived" ? "secondary" : "danger"}" id="aircraft-archive-location">${locationStatus(d) === "archived" ? "Restore" : "Archive"}</button>` : ""}
                <button class="aircraft-button" data-save-button data-label="Save Location" id="aircraft-save-location">Save Location</button>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderAircraftModule() {
    return `
      <section class="aircraft-card aircraft-aircraft-module-card">
        <div class="aircraft-section-head compact">
          <div><h2>Assets / Aircraft</h2><p>Manage aircraft records, visibility, dispatch status, and operating details.</p></div>
          <button class="aircraft-button secondary" id="aircraft-new">New Aircraft</button>
        </div>
        <div class="aircraft-module-divider"></div>
        <div class="aircraft-grid aircraft-only">${renderList(true)}${renderEditor()}</div>
      </section>`;
  }

  function renderDebug() {
    if (!state.debug) return "";
    return `<section class="aircraft-card aircraft-debug"><h2>Debug</h2><pre>${esc(JSON.stringify({ version: VERSION, email: state.email, orgId: state.orgId, aircraft: state.aircraft.length, locations: state.locations.length, assetTypes: state.assetTypes.length, dirty: state.dirty, locationDirty: state.locationDirty, assetTypeDirty: state.assetTypeDirty, aircraftOrderSaving: state.aircraftOrderSaving, steps: state.steps, lastResult: state.lastResult }, null, 2))}</pre></section>`;
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
        .aircraft-wrap{max-width:1280px;margin:0 auto;padding:18px;min-width:0;}
        .aircraft-wrap.embedded{max-width:none;margin:0;padding:0;min-width:0;width:100%;overflow:hidden;}
        .aircraft-inline-state{display:none;}
        .aircraft-hero{background:linear-gradient(135deg,var(--air-primary),color-mix(in srgb,var(--air-primary) 82%,#000));color:#fff;border-radius:18px;padding:22px;margin-bottom:14px;}
        .aircraft-hero h1{margin:0 0 6px;font-size:34px;letter-spacing:-.03em;}.aircraft-hero p{margin:0;opacity:.9;line-height:1.45;}.aircraft-topline{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:14px;}
        .aircraft-card{background:var(--air-surface);border:1px solid color-mix(in srgb,var(--air-primary) 18%,#d6dee9);border-radius:12px;box-shadow:0 8px 24px rgba(10,30,55,.06);padding:14px;margin-bottom:12px;min-width:0;}
        .aircraft-subpanel{background:var(--air-surface);border:1px solid color-mix(in srgb,var(--air-primary) 18%,#d6dee9);border-radius:12px;padding:14px;min-width:0;overflow:hidden;}
        .aircraft-grid{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:12px;align-items:start;min-width:0;}.aircraft-grid.aircraft-only{grid-template-columns:minmax(260px,340px) minmax(0,1fr);}.aircraft-section-head,.aircraft-editor-head,.aircraft-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}.aircraft-save-row{border-top:1px solid #e6edf5;margin-top:8px;padding-top:10px;}.aircraft-bottom-state{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;}.aircraft-action-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.aircraft-inline-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;background:#eef3f8;color:#30435c;}.aircraft-inline-status.ok{background:#eaf7ef;color:#196f3b;}.aircraft-inline-status.error{background:#ffecec;color:var(--air-danger);}.aircraft-section-head.compact{padding-bottom:8px;}.aircraft-section-head h2,.aircraft-editor-head h2{margin:0;font-size:21px;}.aircraft-section-head p,.aircraft-editor-head p{margin:3px 0 0;color:var(--air-muted);font-size:13px;line-height:1.35;}.aircraft-module-divider{height:1px;background:#e6edf5;margin:0 0 12px;}
        .aircraft-button{border:1px solid var(--air-primary);background:var(--air-primary);color:#fff;border-radius:999px;padding:9px 13px;font-weight:800;cursor:pointer;font-size:13px;}.aircraft-button.secondary{background:#fff;color:var(--air-primary);}.aircraft-button.danger{background:#fff;color:var(--air-danger);border-color:var(--air-danger);}.aircraft-button:disabled{opacity:.55;cursor:wait;}
        .aircraft-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;background:color-mix(in srgb,var(--air-primary) 12%,#fff);color:var(--air-primary);}.aircraft-pill.ok{background:#eaf7ef;color:#196f3b;}.aircraft-pill.warn{background:#fff5d8;color:var(--air-warning);}.aircraft-pill.danger{background:#ffecec;color:var(--air-danger);}.aircraft-pill.neutral{background:#eef3f8;color:#30435c;}
        .aircraft-filter-row{display:grid;grid-template-columns:1fr 145px auto;gap:8px;margin:12px 0;align-items:center;}.aircraft-filter-row input,.aircraft-filter-row select,.aircraft-field input,.aircraft-field select,.aircraft-field textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;background:#fff;color:#172033;font-size:13px;}.aircraft-field textarea{min-height:82px;resize:vertical;font-family:Arial,Helvetica,sans-serif;}.aircraft-check{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#334155;}
        .aircraft-list{display:flex;flex-direction:column;gap:8px;}.aircraft-row,.aircraft-location-row{width:100%;border:1px solid #d7e0ea;background:#fff;border-radius:13px;padding:11px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:4px;}.aircraft-row.selected,.aircraft-location-row.selected{border-color:var(--air-primary);box-shadow:inset 4px 0 0 var(--air-primary);background:color-mix(in srgb,var(--air-secondary) 38%,#fff);}.aircraft-row-title{font-weight:900;font-size:15px;}.aircraft-row-sub,.aircraft-row-meta,.aircraft-location-row span{color:var(--air-muted);font-size:12px;}.aircraft-row-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
        .aircraft-location-row{padding:0;display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:stretch;overflow:hidden;cursor:grab;}.aircraft-location-row.dragging{opacity:.55;}.aircraft-location-row.drag-over{outline:2px dashed var(--air-primary);outline-offset:2px;}.aircraft-location-row.saving{opacity:.75;cursor:wait;}.aircraft-location-row.archived{background:#f1f5f9;opacity:.76;}.aircraft-location-row.inactive{background:#fafaf8;}.aircraft-location-row.archived .aircraft-location-copy strong,.aircraft-location-row.archived .aircraft-location-copy span{color:#64748b;}.aircraft-record-row{cursor:grab;}.aircraft-record-row .aircraft-list-badge{margin-top:2px;}.aircraft-location-main{border:0;background:transparent;text-align:left;padding:11px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:flex-start;cursor:pointer;min-width:0;color:inherit;}.aircraft-drag-handle{font-size:13px;line-height:1;color:var(--air-muted);padding-top:3px;}.aircraft-location-copy{display:flex;flex-direction:column;gap:4px;min-width:0;overflow:hidden;}.aircraft-location-copy strong{color:#172033;font-size:14px;white-space:normal;overflow-wrap:anywhere;line-height:1.25;}.aircraft-location-meta{color:var(--air-muted);font-size:12px;white-space:normal;overflow-wrap:anywhere;line-height:1.3;}.aircraft-order-buttons{display:flex;flex-direction:column;border-left:1px solid #e2e8f0;min-width:34px;}.aircraft-order-button{border:0;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:var(--air-primary);font-weight:900;width:34px;min-height:28px;cursor:pointer;}.aircraft-order-button:last-child{border-bottom:0;}.aircraft-order-button:disabled{opacity:.35;cursor:not-allowed;}.aircraft-order-tools{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin:-2px 0 8px;font-size:12px;color:var(--air-muted);flex-wrap:wrap;}.aircraft-order-status{display:inline-flex;border-radius:999px;padding:5px 8px;background:#eef3f8;color:#334155;font-weight:900;}.aircraft-order-status.ok{background:#eaf7ef;color:#196f3b;}.aircraft-order-status.error{background:#ffecec;color:var(--air-danger);}.aircraft-order-hint{white-space:normal;line-height:1.25;min-width:0;}.asset-type-filter-row{margin:0 0 8px;}.asset-type-filter-row select{width:100%;}.aircraft-list-badge{align-self:flex-start;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;background:#eaf7ef;color:#196f3b;white-space:nowrap;max-width:100%;}.aircraft-list-badge.inactive{background:#fff7ed;color:#9a3412;}.aircraft-list-badge.archived{background:#e2e8f0;color:#475569;}
        .aircraft-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0;}.aircraft-tabs button{border:1px solid #cbd5e1;background:#fff;color:#26344d;border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer;}.aircraft-tabs button.active{background:var(--air-primary);color:#fff;border-color:var(--air-primary);}
        .aircraft-form-grid{display:grid;grid-template-columns:repeat(2,minmax(min(260px,100%),1fr));gap:10px 12px;}.aircraft-form-grid.compact{gap:8px 12px;}.aircraft-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px;min-width:0;} .aircraft-field input,.aircraft-field select,.aircraft-field textarea{min-width:0;}.aircraft-field span{font-size:12px;font-weight:900;color:#334155;text-transform:uppercase;letter-spacing:.03em;}.aircraft-field.full{grid-column:1/-1;}.aircraft-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0 4px;}.aircraft-note{background:color-mix(in srgb,var(--air-secondary) 55%,#fff);border:1px solid color-mix(in srgb,var(--air-primary) 18%,#d6dee9);border-radius:12px;padding:12px;margin-bottom:12px;color:#334155;font-size:13px;line-height:1.45;}
        .aircraft-location-layout{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:12px;min-width:0;width:100%;overflow:hidden;}.aircraft-location-list-wrap{min-width:0;}.aircraft-list-tools{margin-bottom:8px;}.aircraft-list-tools input{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;background:#fff;color:#172033;font-size:13px;}.aircraft-location-list{display:flex;flex-direction:column;gap:8px;}.aircraft-location-form{min-width:0;overflow:hidden;}.aircraft-status{padding:12px;border-radius:12px;border:1px solid #d6e0ec;background:#eef3f8;color:#26344d;margin-bottom:14px;}.aircraft-status.ok{background:#eaf7ef;color:#196f3b}.aircraft-status.error{background:#ffecec;color:var(--air-danger);border-color:#ffc6c6;}.aircraft-empty{border:1px dashed #cbd5e1;border-radius:12px;padding:14px;color:var(--air-muted);background:#f8fafc;}.aircraft-debug pre{background:#101827;color:#e7edf6;border-radius:12px;padding:12px;overflow:auto;font-size:12px;}
        @media(max-width:1180px){.aircraft-grid,.aircraft-grid.aircraft-only,.aircraft-location-layout{grid-template-columns:1fr;}.aircraft-filter-row,.aircraft-form-grid,.aircraft-check-grid{grid-template-columns:1fr;}.aircraft-wrap{padding:12px;}}
      </style>
      <main class="aircraft-wrap ${mountOptions.embedded ? "embedded" : ""}">
        ${mountOptions.embedded ? `` : `
          <section class="aircraft-hero">
            <h1>Aircraft Admin</h1>
            <p>Manage ${esc(orgName)} aircraft, locations, dispatch status, rates, usage, and setup fields. Squawks, reminders, scheduling and billing are separate modules.</p>
            ${renderOrgSelector() ? `<div class="aircraft-topline">${renderOrgSelector()}</div>` : ""}
          </section>`}
        <div id="aircraft-status" class="aircraft-status" style="display:none"></div>
        ${isAssetTypesOnly() ? renderAssetTypes() : isLocationsOnly() ? renderLocations() : isAircraftOnly() ? renderAircraftModule() : `${renderLocations()}<div class="aircraft-grid">${renderList()}${renderEditor()}</div>`}
        ${renderDebug()}
      </main>`;
    bindEvents();
    renderStatus();
    renderActionState();
    setLocationOrderStatus(state.locationOrderStatus, state.locationOrderStatusKind);
    setAssetTypeOrderStatus(state.assetTypeOrderStatus, state.assetTypeOrderStatusKind);
    setAircraftOrderStatus(state.aircraftOrderStatus, state.aircraftOrderStatusKind);
    restoreAircraftSearchFocus();
    restoreLocationSearchFocus();
    restoreAssetTypeSearchFocus();
  }

  function bindEvents() {
    field("aircraft-org-select")?.addEventListener("change", async (e) => {
      if (!confirmDiscard("Changing organizations will discard unsaved aircraft changes. Continue?")) { e.target.value = state.orgId; return; }
      state.orgId = e.target.value; localStorage.setItem(SELECTED_ORG_KEY, state.orgId); state.accessRow = state.accessRows.find(r => clean(r.organization_id) === state.orgId) || state.accessRow; await loadAircraftAdmin();
    });
    field("aircraft-new")?.addEventListener("click", newAircraft);
    field("aircraft-reset")?.addEventListener("click", clearAircraft);
    field("aircraft-save")?.addEventListener("click", saveAircraft);
    field("aircraft-archive")?.addEventListener("click", () => archiveAircraft(clean(selectedAircraft()?.asset_record_status) === "archived" || !!selectedAircraft()?.archived_at));
    field("aircraft-status-filter")?.addEventListener("change", e => {
      const previous = state.statusFilter;
      const nextFilter = e.target.value;
      if (!confirmDiscard("Changing the aircraft filter will discard unsaved aircraft changes. Continue?")) { e.target.value = previous; return; }
      state.statusFilter = nextFilter;
      const rows = aircraftRowsForCurrentSearch();
      if (!rows.some(a => clean(a.operational_asset_id) === state.selectedAircraftId)) {
        state.selectedAircraftId = rows[0] ? clean(rows[0].operational_asset_id) : "";
        state.draft = selectedAircraft() ? draftFromAircraft(selectedAircraft()) : emptyAircraftDraft();
        setDirty(false);
      }
      render();
    });
    field("aircraft-search")?.addEventListener("input", e => {
      const input = e.target;
      state.aircraftSearchText = input.value;
      if (aircraftSearchTimer) window.clearTimeout(aircraftSearchTimer);
      aircraftSearchTimer = window.setTimeout(() => {
        state.search = state.aircraftSearchText;
        state.aircraftSearchRestore = {
          start: typeof input.selectionStart === "number" ? input.selectionStart : input.value.length,
          end: typeof input.selectionEnd === "number" ? input.selectionEnd : input.value.length
        };
        render();
      }, 350);
    });
    document.querySelectorAll("[data-aircraft-select]").forEach(btn => btn.addEventListener("click", () => { if (!confirmDiscard()) return; state.selectedAircraftId = btn.dataset.aircraftSelect; state.draft = draftFromAircraft(selectedAircraft()); setDirty(false); render(); }));
    document.querySelectorAll("[data-aircraft-move]").forEach(btn => btn.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const next = moveAircraftByStep(btn.dataset.aircraftMove, btn.dataset.direction);
      if (next) persistAircraftOrder(next);
    }));
    document.querySelectorAll("[data-aircraft-row]").forEach(row => {
      row.addEventListener("dragstart", (event) => {
        if (!canReorderAircraft()) { event.preventDefault(); return; }
        state.draggingAircraftId = row.dataset.aircraftId;
        row.classList.add("dragging");
        try { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", state.draggingAircraftId); } catch {}
      });
      row.addEventListener("dragend", () => {
        state.draggingAircraftId = "";
        row.classList.remove("dragging", "drag-over");
        document.querySelectorAll(".aircraft-location-row.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (event) => {
        if (!state.draggingAircraftId || state.draggingAircraftId === row.dataset.aircraftId) return;
        event.preventDefault(); row.classList.add("drag-over");
        try { event.dataTransfer.dropEffect = "move"; } catch {}
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (event) => {
        event.preventDefault(); row.classList.remove("drag-over");
        const sourceId = clean((event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.draggingAircraftId);
        const targetId = clean(row.dataset.aircraftId);
        if (!sourceId || !targetId || sourceId === targetId) return;
        const rect = row.getBoundingClientRect();
        const afterTarget = event.clientY > rect.top + rect.height / 2;
        const next = moveAircraftInList(sourceId, targetId, afterTarget);
        if (next) persistAircraftOrder(next);
      });
    });
    document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => { state.activeTab = btn.dataset.tab; render(); }));
    document.querySelectorAll("[data-draft-key]").forEach(el => {
      const key = el.dataset.draftKey;
      const handler = () => setDraft(key, el.type === "checkbox" ? !!el.checked : el.value);
      el.addEventListener("input", handler); el.addEventListener("change", handler);
    });
    field("aircraft-new-asset-type")?.addEventListener("click", newAssetType);
    field("aircraft-save-asset-type")?.addEventListener("click", saveAssetType);
    field("aircraft-clear-asset-type")?.addEventListener("click", clearAssetType);
    field("aircraft-archive-asset-type")?.addEventListener("click", () => archiveAssetType(clean(selectedAssetType()?.status) === "archived" || !!selectedAssetType()?.archived_at));
    field("aircraft-asset-type-status-filter")?.addEventListener("change", e => {
      const previous = state.assetTypeStatusFilter;
      const nextFilter = e.target.value;
      if (!confirmDiscard("Changing the asset type filter will discard unsaved asset type changes. Continue?")) { e.target.value = previous; return; }
      state.assetTypeStatusFilter = nextFilter;
      const rows = assetTypeRowsForCurrentSearch();
      if (!rows.some(t => clean(t.asset_type_id) === state.selectedAssetTypeId)) {
        state.selectedAssetTypeId = rows[0] ? clean(rows[0].asset_type_id) : "";
        state.assetTypeDraft = selectedAssetType() ? draftFromAssetType(selectedAssetType()) : emptyAssetTypeDraft();
        setAssetTypeDirty(false);
      }
      render();
    });
    field("aircraft-asset-type-search")?.addEventListener("input", e => {
      const input = e.target;
      state.assetTypeSearchText = input.value;
      if (assetTypeSearchTimer) window.clearTimeout(assetTypeSearchTimer);
      assetTypeSearchTimer = window.setTimeout(() => {
        state.assetTypeSearch = state.assetTypeSearchText;
        state.assetTypeSearchRestore = {
          start: typeof input.selectionStart === "number" ? input.selectionStart : input.value.length,
          end: typeof input.selectionEnd === "number" ? input.selectionEnd : input.value.length
        };
        render();
      }, 350);
    });
    document.querySelectorAll("[data-asset-type-select]").forEach(btn => btn.addEventListener("click", () => {
      if (!confirmDiscard("You have unsaved asset type changes. Continue?")) return;
      state.selectedAssetTypeId = clean(btn.dataset.assetTypeSelect);
      const selected = selectedAssetType();
      state.assetTypeDraft = selected ? draftFromAssetType(selected) : emptyAssetTypeDraft();
      setAssetTypeDirty(false);
      render();
    }));
    document.querySelectorAll("[data-asset-type-key]").forEach(el => {
      const key = el.dataset.assetTypeKey;
      const handler = () => setAssetTypeDraft(key, el.value);
      el.addEventListener("input", handler); el.addEventListener("change", handler);
    });
    document.querySelectorAll("[data-asset-type-move]").forEach(btn => btn.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const next = moveAssetTypeByStep(btn.dataset.assetTypeMove, btn.dataset.direction);
      if (next) persistAssetTypeOrder(next);
    }));
    document.querySelectorAll("[data-asset-type-row]").forEach(row => {
      row.addEventListener("dragstart", (event) => {
        if (!canReorderAssetTypes()) { event.preventDefault(); return; }
        state.draggingAssetTypeId = row.dataset.assetTypeId;
        row.classList.add("dragging");
        try { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", state.draggingAssetTypeId); } catch {}
      });
      row.addEventListener("dragend", () => {
        state.draggingAssetTypeId = "";
        row.classList.remove("dragging", "drag-over");
        document.querySelectorAll(".aircraft-location-row.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (event) => {
        if (!state.draggingAssetTypeId || state.draggingAssetTypeId === row.dataset.assetTypeId) return;
        event.preventDefault(); row.classList.add("drag-over");
        try { event.dataTransfer.dropEffect = "move"; } catch {}
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (event) => {
        event.preventDefault(); row.classList.remove("drag-over");
        const sourceId = clean((event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.draggingAssetTypeId);
        const targetId = clean(row.dataset.assetTypeId);
        if (!sourceId || !targetId || sourceId === targetId) return;
        const rect = row.getBoundingClientRect();
        const afterTarget = event.clientY > rect.top + rect.height / 2;
        const next = moveAssetTypeInList(sourceId, targetId, afterTarget);
        if (next) persistAssetTypeOrder(next);
      });
    });
    field("aircraft-new-location")?.addEventListener("click", newLocation);
    field("aircraft-save-location")?.addEventListener("click", saveLocation);
    field("aircraft-clear-location")?.addEventListener("click", clearLocation);
    field("aircraft-archive-location")?.addEventListener("click", () => archiveLocation(locationStatus(state.locationDraft || selectedLocation()) === "archived"));
    field("aircraft-location-status-filter")?.addEventListener("change", e => {
      const previous = state.locationStatusFilter;
      const nextFilter = e.target.value;
      if (!confirmDiscard("Changing the location filter will discard unsaved location changes. Continue?")) { e.target.value = previous; return; }
      state.locationStatusFilter = nextFilter;
      const rows = locationRowsForCurrentSearch();
      if (!rows.some(l => clean(l.organization_location_id) === state.selectedLocationId)) {
        state.selectedLocationId = rows[0] ? clean(rows[0].organization_location_id) : "";
        state.locationDraft = selectedLocation() ? draftFromLocation(selectedLocation()) : emptyLocationDraft();
        setLocationDirty(false);
      }
      render();
    });
    field("aircraft-location-search")?.addEventListener("input", e => {
      const input = e.target;
      state.locationSearchText = input.value;
      if (locationSearchTimer) window.clearTimeout(locationSearchTimer);
      locationSearchTimer = window.setTimeout(() => {
        state.locationSearch = state.locationSearchText;
        state.locationSearchRestore = {
          start: typeof input.selectionStart === "number" ? input.selectionStart : input.value.length,
          end: typeof input.selectionEnd === "number" ? input.selectionEnd : input.value.length
        };
        render();
      }, 350);
    });
    document.querySelectorAll("[data-location-select]").forEach(btn => btn.addEventListener("click", () => {
      if (!confirmDiscard("You have unsaved location changes. Continue?")) return;
      state.selectedLocationId = btn.dataset.locationSelect;
      state.locationDraft = draftFromLocation(selectedLocation());
      setLocationDirty(false);
      render();
    }));
    document.querySelectorAll("[data-location-move]").forEach(btn => btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = moveLocationByStep(btn.dataset.locationMove, btn.dataset.direction);
      if (next) persistLocationOrder(next);
    }));
    document.querySelectorAll("[data-location-row]").forEach(row => {
      row.addEventListener("dragstart", (event) => {
        if (!canReorderLocations()) { event.preventDefault(); return; }
        state.draggingLocationId = row.dataset.locationId;
        row.classList.add("dragging");
        try {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", state.draggingLocationId);
        } catch {}
      });
      row.addEventListener("dragend", () => {
        state.draggingLocationId = "";
        row.classList.remove("dragging", "drag-over");
        document.querySelectorAll(".aircraft-location-row.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (event) => {
        if (!state.draggingLocationId || state.draggingLocationId === row.dataset.locationId) return;
        event.preventDefault();
        row.classList.add("drag-over");
        try { event.dataTransfer.dropEffect = "move"; } catch {}
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drag-over");
        const sourceId = clean((event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.draggingLocationId);
        const targetId = clean(row.dataset.locationId);
        if (!sourceId || !targetId || sourceId === targetId) return;
        const rect = row.getBoundingClientRect();
        const afterTarget = event.clientY > rect.top + rect.height / 2;
        const next = moveLocationInList(sourceId, targetId, afterTarget);
        if (next) persistLocationOrder(next);
      });
    });
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
    hasUnsavedChanges: () => !!(state.dirty || state.locationDirty || state.assetTypeDirty),
    confirmDiscard
  };

  window.SyncEtcAircraftAdmin = {
    version: VERSION,
    mount,
    isDirty: () => !!(state.dirty || state.locationDirty || state.assetTypeDirty),
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
    if (state.dirty || state.locationDirty || state.assetTypeDirty) { event.preventDefault(); event.returnValue = DIRTY_MESSAGE; return DIRTY_MESSAGE; }
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
