// CUSTOMER-ADMIN-PAGE-events-current.js
// Internal Version: 2026-06-09-092-B
// Purpose: Customer-admin Events Manager UX correction: event browser/editor panels, new-event workflow, sticky save controls, safer time controls, filters, and cleaner first-pass admin editing. Uses portal shell + core-access-action.

(function () {
  "use strict";

  const VERSION = "2026-06-09-092-B";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-organization-events-root, [data-syncetc-page='organization-events']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";
  const FALLBACK_COLORS = ["#265c2b", "#1f4f82", "#c81e1e", "#a16207", "#6d28d9", "#0369a1"];
  const MINUTE_VALUES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  let supabaseClient = null;
  const state = {
    debug: new URLSearchParams(location.search).get("syncetc_debug") === "1",
    startedAt: performance.now(),
    steps: [],
    loading: true,
    error: "",
    status: "",
    token: "",
    email: "",
    platformAdmin: false,
    accessRows: [],
    accessRow: null,
    orgId: "",
    events: [],
    eventTypes: [],
    locations: [],
    membershipClasses: [],
    roles: [],
    selectedId: "",
    creating: false,
    dirty: false,
    last: null,
    filters: { search: "", status: "active", type: "", date: "all" },
  };

  function root() { return document.querySelector(ROOT_SELECTOR); }
  function mark(label, detail) { state.steps.push({ ms: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function attr(value) { return esc(value); }
  function keyify(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function checkedValues(name) { return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value).filter(Boolean); }
  function pad2(value) { return String(value).padStart(2, "0"); }

  function styleConfig() {
    const style = obj(state.accessRow && state.accessRow.style_profile);
    const colors = obj(style.colors_json);
    return {
      primary: clean(colors.brand_primary) || "#265c2b",
      secondary: clean(colors.brand_secondary) || "#edf7ed",
      surface: clean(colors.surface) || "#ffffff",
      text: clean(colors.text) || "#142417",
      border: "rgba(38,92,43,.22)",
      soft: clean(colors.brand_secondary) || "#edf7ed",
      shadow: "0 18px 48px rgba(16, 42, 22, .12)",
      width: ((obj(style.spacing_json).page_width || obj(style.layout_json).default_width) === "wide") ? "1180px" : "1040px",
    };
  }

  function toLocalParts(value) {
    if (!value) return { date: "", hour: "6", minute: "00", ampm: "PM" };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: "", hour: "6", minute: "00", ampm: "PM" };
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const rawHour = d.getHours();
    const ampm = rawHour >= 12 ? "PM" : "AM";
    const hour12 = rawHour % 12 || 12;
    let minute = String(Math.round(d.getMinutes() / 5) * 5).padStart(2, "0");
    if (minute === "60") minute = "55";
    return { date, hour: String(hour12), minute, ampm };
  }

  function combineDateTime(prefix, options) {
    const date = val(`${prefix}-date`);
    if (!date) return "";
    const allDay = options && options.allDay;
    if (allDay) return new Date(`${date}T00:00:00`).toISOString();
    let hour = Number(val(`${prefix}-hour`) || 12);
    const minute = Number(val(`${prefix}-minute`) || 0);
    const ampm = val(`${prefix}-ampm`) || "PM";
    if (ampm === "AM" && hour === 12) hour = 0;
    if (ampm === "PM" && hour !== 12) hour += 12;
    return new Date(`${date}T${pad2(hour)}:${pad2(minute)}:00`).toISOString();
  }

  function hourOptions(current) {
    return Array.from({ length: 12 }, (_, i) => String(i + 1)).map(hour => `<option value="${hour}" ${hour === String(current || "") ? "selected" : ""}>${hour}</option>`).join("");
  }

  function minuteOptions(current) {
    const cur = MINUTE_VALUES.includes(String(current || "")) ? String(current) : "00";
    return MINUTE_VALUES.map(min => `<option value="${min}" ${min === cur ? "selected" : ""}>${min}</option>`).join("");
  }

  function ampmOptions(current) {
    const cur = current === "AM" ? "AM" : "PM";
    return `<option value="AM" ${cur === "AM" ? "selected" : ""}>AM</option><option value="PM" ${cur === "PM" ? "selected" : ""}>PM</option>`;
  }

  function dateTimeControls(prefix, label, value, options) {
    const parts = toLocalParts(value);
    const optional = options && options.optional;
    return `<div class="events-time-block" data-time-prefix="${attr(prefix)}"><div class="events-time-title">${esc(label)}</div><div class="events-time-grid"><label class="events-field">Date<input class="events-input" id="${attr(prefix)}-date" type="date" value="${attr(parts.date)}" ${optional ? "" : "required"}></label><label class="events-field events-time-select">Hour<select class="events-select" id="${attr(prefix)}-hour">${hourOptions(parts.hour)}</select></label><label class="events-field events-time-select">Minute<select class="events-select" id="${attr(prefix)}-minute">${minuteOptions(parts.minute)}</select></label><label class="events-field events-time-select">AM/PM<select class="events-select" id="${attr(prefix)}-ampm">${ampmOptions(parts.ampm)}</select></label></div></div>`;
  }

  function readableDate(value) {
    if (!value) return "No date";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "No date" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        let tries = 0;
        const timer = setInterval(() => {
          tries += 1;
          if (window.supabase && window.supabase.createClient) { clearInterval(timer); resolve(); }
          if (tries > 80) { clearInterval(timer); reject(new Error("Supabase library did not become ready.")); }
        }, 50);
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return;
    mark("ensureSupabase:start");
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase client library is not ready.");
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    mark("ensureSupabase:created-client");
  }

  async function call(action, payload) {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error("Log in first.");
    mark("call:start", action);
    const res = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Invalid JSON response." }));
    state.last = json;
    mark("call:response", `${action} HTTP ${res.status}`);
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Action failed.");
    return json;
  }

  function setShellState() {
    if (!state.accessRow || !window.SyncEtcPortalShell || !window.SyncEtcPortalShell.setState) return;
    window.SyncEtcPortalShell.setState({
      authenticated: true,
      email: state.email,
      mode: "organization-admin",
      organizationName: state.accessRow.organization_name,
      organizationKey: state.accessRow.organization_key,
      organizationId: state.accessRow.organization_id,
      selectedOrganizationId: state.orgId,
      styleProfile: state.accessRow.style_profile,
      accessRow: state.accessRow,
      platformAdmin: state.platformAdmin,
      navigationProfile: state.accessRow.navigation_profile,
      navigationRows: state.accessRow.navigation_rows,
      navigationItems: state.accessRow.navigation_items,
      activePageKey: "organization-events",
    });
  }

  function setDirty(value) {
    state.dirty = !!value;
    document.querySelectorAll(".events-dirty-flag").forEach(flag => { flag.textContent = state.dirty ? "Unsaved changes" : "No unsaved changes"; });
    window.onbeforeunload = state.dirty ? () => "You have unsaved event changes. Leave anyway?" : null;
    if (window.SyncEtcPortalShell && window.SyncEtcPortalShell.setDirty) {
      window.SyncEtcPortalShell.setDirty(state.dirty, "You have unsaved event changes. Leave anyway?");
    }
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    if (state.accessRow) render();
    try {
      await ensureSupabase();
      const { data } = await supabaseClient.auth.getSession();
      state.token = data && data.session && data.session.access_token || "";
      state.email = data && data.session && data.session.user && data.session.user.email || "";
      const dashboard = await call("get_user_dashboard", {});
      state.platformAdmin = !!dashboard.platform_admin;
      state.accessRows = arr(dashboard.access);
      state.orgId = localStorage.getItem(SELECTED_ORG_KEY) || clean(state.accessRows[0] && state.accessRows[0].organization_id);
      if (!state.orgId) throw new Error("No organization is selected.");
      const result = await call("organization_list_events_manager", { organization_id: state.orgId });
      state.accessRow = result.access;
      state.events = arr(result.events);
      state.eventTypes = arr(result.event_types);
      state.locations = arr(result.locations);
      state.membershipClasses = arr(result.membership_classes);
      state.roles = arr(result.roles);
      if (state.selectedId && !state.events.some(ev => clean(ev.event_id) === clean(state.selectedId))) state.selectedId = "";
      setShellState();
      setDirty(false);
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function selectedEvent() { return state.events.find(ev => clean(ev.event_id) === clean(state.selectedId)) || null; }
  function selectedType() { const key = val("event-type-key"); return state.eventTypes.find(t => clean(t.type_key) === key) || null; }
  function selectedLocation() { const key = val("event-location-key"); return state.locations.find(l => clean(l.location_key) === key) || null; }
  function classKey(row) { return clean(row.class_key || row.membership_class_key); }
  function roleKey(row) { return clean(row.role_key); }
  function activeEventForForm() {
    if (state.creating) return {
      status: "draft",
      visibility_audience: "public",
      timezone: "America/New_York",
      sort_order: 100,
      event_type_label: "General",
      category: "General",
      event_accent_color: styleConfig().primary || FALLBACK_COLORS[0],
      rsvp_enabled: true,
      rsvp_audience: "member",
      allow_guests: true,
      max_guests_per_rsvp: 0,
      rsvp_capacity_behavior: "waitlist",
      attendee_list_visibility: "eligible",
      show_attendee_list: true,
    };
    return selectedEvent();
  }

  function css() {
    const c = styleConfig();
    return `<style>
      .syncetc-events-page{max-width:${c.width};margin:28px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:${c.text}}
      .syncetc-events-page *{box-sizing:border-box}.events-shell{border:1px solid ${c.border};border-radius:26px;background:#fff;box-shadow:${c.shadow};overflow:hidden}.events-hero{padding:28px 32px;background:linear-gradient(135deg,${c.primary},color-mix(in srgb,${c.primary} 70%,#4b9bd4));color:#fff}.events-hero h1{margin:10px 0 0;font-size:clamp(32px,4vw,48px);line-height:1}.events-hero p{margin:10px 0 0;max-width:760px}.events-badge{display:inline-flex;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.events-main{display:grid;grid-template-columns:330px minmax(0,1fr);background:linear-gradient(180deg,${c.soft},rgba(255,255,255,.96));min-height:640px}.events-sidebar{padding:16px;border-right:1px solid ${c.border};background:#fff;max-height:calc(100vh - 190px);overflow:auto}.events-editor{padding:18px;max-height:calc(100vh - 190px);overflow:auto}.events-list{display:grid;gap:8px;padding-right:3px}.events-sidebar-head{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px}.events-filters{display:grid;gap:8px;margin-bottom:12px;padding:12px;border:1px solid ${c.border};border-radius:18px;background:${c.soft}}.event-record{display:block;width:100%;text-align:left;border:1px solid ${c.border};border-left:6px solid var(--event-accent,${c.primary});background:#fff;border-radius:16px;padding:12px;cursor:pointer;color:${c.text}}.event-record[hidden]{display:none}.event-record.selected{border-color:${c.primary};border-left-color:var(--event-accent,${c.primary});box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 13%,transparent)}.event-record.archived{opacity:.55}.event-record b{display:block}.event-record span,.event-record small{display:block;color:rgba(20,36,23,.70);font-size:12px;margin-top:4px}.events-card{background:#fff;border:1px solid ${c.border};border-radius:20px;padding:18px;margin-bottom:16px}.events-card h2,.events-card h3{margin:0 0 12px}.events-editor-toolbar{position:sticky;top:0;z-index:5;margin:-18px -18px 16px;padding:14px 18px;border-bottom:1px solid ${c.border};background:rgba(255,255,255,.96);backdrop-filter:blur(8px);display:grid;grid-template-columns:minmax(190px,1fr) auto;gap:12px;align-items:center}.events-toolbar-title{display:grid;gap:5px}.events-toolbar-title strong{font-size:18px}.events-toolbar-controls{display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.events-toolbar-controls .events-field{min-width:150px}.events-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.events-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.events-field{display:grid;gap:5px;font-size:12px;font-weight:900;color:${c.primary}}.events-input,.events-select,.events-textarea{width:100%;border:1px solid ${c.border};border-radius:12px;padding:10px 12px;font:inherit;color:${c.text};background:#fff}.events-input[readonly],.events-input:disabled,.events-select:disabled{background:#f3f7f3;color:rgba(20,36,23,.58);cursor:not-allowed}.events-textarea{min-height:88px;resize:vertical}.events-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;justify-content:flex-end;background:rgba(255,255,255,.94);border-top:1px solid ${c.border};padding:12px;margin:0 -18px -18px}.events-btn{border:1px solid ${c.border};border-radius:999px;background:#fff;color:${c.primary};padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}.events-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.08)}.events-btn.primary{background:${c.primary};color:#fff}.events-btn.danger{background:#fff7ec;color:#9a3412;border-color:#fed7aa}.events-btn:disabled{opacity:.55;cursor:not-allowed}.events-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px}.events-check,.events-inline-check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:${c.text}}.events-check input,.events-inline-check input{width:auto}.events-status{display:inline-flex;padding:9px 12px;border-radius:14px;background:${c.soft};font-weight:900}.events-error{padding:12px;border-radius:14px;background:#fee2e2;color:#991b1b;font-weight:900}.events-empty{padding:18px;border:1px dashed ${c.border};border-radius:16px;color:rgba(20,36,23,.65);background:#fff}.events-empty.big{padding:34px;text-align:center}.events-color-row{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;align-items:end}.events-color-picker{width:44px;height:42px;border:1px solid ${c.border};border-radius:12px;padding:3px;background:#fff;cursor:pointer}.events-muted{color:rgba(20,36,23,.62);font-size:12.5px;line-height:1.4}.events-topline{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.events-time-block{display:grid;gap:8px}.events-time-title{font-weight:900;color:${c.primary};font-size:12px;text-transform:uppercase;letter-spacing:.03em}.events-time-grid{display:grid;grid-template-columns:minmax(160px,1.4fr) 88px 98px 98px;gap:10px}.events-timing-flags{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 14px}.events-map-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.events-debug{max-width:${c.width};margin:16px auto;padding:14px;border-radius:16px;background:#0f172a;color:#dbeafe;overflow:auto;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
      @media(max-width:900px){.events-main{grid-template-columns:1fr;min-height:0}.events-sidebar,.events-editor{max-height:none;overflow:visible}.events-sidebar{border-right:none;border-bottom:1px solid ${c.border}}.events-editor-toolbar{position:static;margin:-18px -18px 16px;grid-template-columns:1fr}.events-toolbar-controls{justify-content:flex-start}.events-grid,.events-grid.three{grid-template-columns:1fr}.events-check-grid{grid-template-columns:1fr}.events-time-grid{grid-template-columns:1fr 1fr}.events-actions{justify-content:flex-start}}
      @media(max-width:560px){.events-time-grid{grid-template-columns:1fr}.events-hero{padding:24px 22px}.events-card{padding:14px}.events-editor{padding:14px}.events-editor-toolbar{margin:-14px -14px 14px;padding:12px 14px}.events-actions{margin:0 -14px -14px}.events-btn{width:100%}.events-sidebar-head{display:grid}}
    </style>`;
  }

  function typeOptions(ev) {
    const current = clean(ev.event_type_key || obj(ev.event_type_json).type_key);
    return `<option value="">Custom / one-off type</option>` + state.eventTypes.map(t => `<option value="${attr(t.type_key)}" ${clean(t.type_key) === current ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  }

  function locationOptions(ev) {
    const current = clean(ev.location_key || obj(ev.location_json).location_key);
    return `<option value="">Custom / one-off location</option>` + state.locations.map(l => `<option value="${attr(l.location_key)}" ${clean(l.location_key) === current ? "selected" : ""}>${esc(l.label || l.location_name)}</option>`).join("");
  }

  function checkboxList(name, rows, keyFn, labelFn, selected) {
    const set = new Set(arr(selected).map(clean));
    if (!rows.length) return `<div class="events-muted">No options configured yet.</div>`;
    return rows.map(row => {
      const key = keyFn(row);
      return `<label class="events-check"><input type="checkbox" name="${attr(name)}" value="${attr(key)}" ${set.has(key) ? "checked" : ""}> ${esc(labelFn(row))}</label>`;
    }).join("");
  }

  function eventStatus(ev) { return ev.status === "archived" || ev.archived_at ? "archived" : clean(ev.status || "draft"); }
  function eventDateClass(ev) {
    if (!ev.starts_at) return "none";
    const d = new Date(ev.starts_at);
    if (Number.isNaN(d.getTime())) return "none";
    return d.getTime() < Date.now() ? "past" : "upcoming";
  }

  function filteredEvents() {
    const q = clean(state.filters.search).toLowerCase();
    const statusFilter = clean(state.filters.status || "active");
    const typeFilter = clean(state.filters.type || "");
    const dateFilter = clean(state.filters.date || "all");
    return state.events.filter(ev => {
      const status = eventStatus(ev);
      const type = clean(ev.event_type_key || obj(ev.event_type_json).type_key || ev.event_type_label || ev.category);
      const searchable = [ev.title, ev.event_type_label, ev.category, ev.location_name, ev.location_address, ev.summary, ev.description].map(clean).join(" ").toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (statusFilter === "active" && status === "archived") return false;
      if (!["", "all", "active"].includes(statusFilter) && status !== statusFilter) return false;
      if (typeFilter && type !== typeFilter) return false;
      if (dateFilter !== "all" && eventDateClass(ev) !== dateFilter) return false;
      return true;
    });
  }

  function filterOptions() {
    const typeSet = new Map();
    state.events.forEach(ev => {
      const key = clean(ev.event_type_key || obj(ev.event_type_json).type_key || ev.event_type_label || ev.category);
      const label = clean(ev.event_type_label || ev.category || obj(ev.event_type_json).label || key);
      if (key) typeSet.set(key, label || key);
    });
    return `<div class="events-filters"><label class="events-field">Search<input class="events-input events-filter" id="events-filter-search" value="${attr(state.filters.search)}" placeholder="Search title, type, location..."></label><div class="events-grid" style="grid-template-columns:1fr 1fr"><label class="events-field">Status<select class="events-select events-filter" id="events-filter-status"><option value="active">Active</option><option value="all">All</option><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label><label class="events-field">Dates<select class="events-select events-filter" id="events-filter-date"><option value="all">All dates</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select></label></div><label class="events-field">Event type<select class="events-select events-filter" id="events-filter-type"><option value="">All types</option>${Array.from(typeSet.entries()).map(([key, label]) => `<option value="${attr(key)}">${esc(label)}</option>`).join("")}</select></label></div>`;
  }

  function eventListHtml() {
    if (!state.events.length) return `<div class="events-empty">No events yet. Create the first event.</div>`;
    const events = filteredEvents();
    if (!events.length) return `<div class="events-empty">No events match these filters.</div>`;
    return events.map(ev => {
      const accent = clean(ev.event_accent_color || (obj(ev.event_type_json).accent_color)) || styleConfig().primary;
      const status = eventStatus(ev);
      return `<button type="button" class="event-record ${clean(ev.event_id) === clean(state.selectedId) && !state.creating ? "selected" : ""} ${status === "archived" ? "archived" : ""}" style="--event-accent:${attr(accent)}" data-event-id="${attr(ev.event_id)}"><b>${esc(ev.title || "Untitled event")}</b><span>${esc(readableDate(ev.starts_at))}</span><small>${esc(ev.event_type_label || ev.category || "General")} • ${esc(status)}</small></button>`;
    }).join("");
  }

  function actionBarHtml(ev, bottom) {
    const title = state.creating ? "New event" : ev && ev.event_id ? (ev.title || "Untitled event") : "No event selected";
    const canSave = !!ev;
    const statusValue = clean(ev && ev.status) || "draft";
    return `<div class="${bottom ? "events-actions" : "events-editor-toolbar"}">${bottom ? "" : `<div class="events-toolbar-title"><strong>${esc(title)}</strong><span class="events-dirty-flag events-status">${state.dirty ? "Unsaved changes" : "No unsaved changes"}</span></div>`}<div class="events-toolbar-controls">${!bottom ? `<label class="events-field">Status<select class="events-select" id="event-status"><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label>` : `<span class="events-status event-status-message">${esc(state.status || "")}</span>`}<button type="button" class="events-btn event-save" data-save-status="draft" ${canSave ? "" : "disabled"}>Save Draft</button><button type="button" class="events-btn primary event-save" data-save-status="published" ${canSave ? "" : "disabled"}>Publish</button><button type="button" class="events-btn event-save" data-save-status="" ${canSave ? "" : "disabled"}>Save Changes</button>${(!bottom && ev && ev.event_id) ? `<button type="button" class="events-btn danger" id="event-archive">${ev.archived_at || ev.status === "archived" ? "Restore" : "Archive"}</button>` : ""}</div></div>`;
  }

  function editorEmptyHtml() {
    return `${actionBarHtml(null, false)}<div class="events-empty big"><h2>Select an event or create a new one</h2><p>Use the left panel to find an existing event, or start a new draft.</p><button type="button" class="events-btn primary event-new">New Event</button></div>`;
  }

  function formHtml() {
    const ev = activeEventForForm();
    if (!ev) return editorEmptyHtml();
    const typeJson = obj(ev.event_type_json);
    const locJson = obj(ev.location_json);
    const classKeys = arr(ev.allowed_membership_class_keys || ev.rsvp_allowed_membership_class_keys);
    const roleKeys = arr(ev.allowed_role_keys || ev.rsvp_allowed_role_keys);
    const accent = clean(ev.event_accent_color || typeJson.accent_color || styleConfig().primary || FALLBACK_COLORS[0]);
    const keyPreview = ev.event_id ? clean(ev.event_key) : "";
    const noEnd = !ev.ends_at;
    return `${actionBarHtml(ev, false)}<div class="events-card"><h2>${ev.event_id ? "Event details" : "New Event Draft"}</h2><div class="events-grid"><label class="events-field">Title<input class="events-input" id="event-title" value="${attr(ev.title || "")}" placeholder="Event title"></label><label class="events-field">Event key<input class="events-input" id="event-key" value="${attr(keyPreview)}" placeholder="Generated automatically from title and date" readonly></label><label class="events-field">Event visibility <span class="events-muted">Who can see the event listing.</span><select class="events-select" id="event-visibility"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="admin">Admins/board only</option></select></label><label class="events-field">Sort order<input class="events-input" id="event-sort" type="number" value="${attr(ev.sort_order ?? 100)}"></label></div></div>

    <div class="events-card"><h3>Timing</h3><div class="events-timing-flags"><label class="events-inline-check"><input type="checkbox" id="event-all-day" ${ev.all_day_event ? "checked" : ""}> All-day event</label><label class="events-inline-check"><input type="checkbox" id="event-no-end" ${noEnd ? "checked" : ""}> No end time</label></div>${dateTimeControls("event-start", "Starts", ev.starts_at, {})}${dateTimeControls("event-end", "Ends", ev.ends_at, { optional: true })}<label class="events-field" style="margin-top:12px">Timezone<input class="events-input" id="event-timezone" value="${attr(ev.timezone || "America/New_York")}"></label></div>

    <div class="events-card"><h3>Event type</h3><div class="events-grid"><label class="events-field">Saved type<select class="events-select" id="event-type-key">${typeOptions(ev)}</select></label><label class="events-field">Type label<input class="events-input" id="event-type-label" value="${attr(ev.event_type_label || ev.category || typeJson.label || "General")}"></label><label class="events-field">Accent color<div class="events-color-row"><input class="events-input" id="event-accent" value="${attr(accent)}"><input class="events-color-picker" id="event-color-picker" type="color" value="${attr(accent)}" title="Choose accent color"></div></label><label class="events-field">Image URL<input class="events-input" id="event-image" value="${attr(ev.event_image_url || ev.image_url || typeJson.image_url || "")}" placeholder="Image URL for now; upload support later"></label></div><label class="events-inline-check"><input type="checkbox" id="event-save-type"> Save/update this as a reusable event type</label><div class="events-muted">Event-type color is used as a subtle accent. Drag-and-drop image upload will be a later storage pass.</div></div>

    <div class="events-card"><h3>Location</h3><div class="events-grid"><label class="events-field">Saved location<select class="events-select" id="event-location-key">${locationOptions(ev)}</select></label><label class="events-field">Location name<input class="events-input" id="event-location-name" value="${attr(ev.location_name || locJson.location_name || locJson.label || "")}"></label></div><label class="events-field">Written address<input class="events-input" id="event-address" value="${attr(ev.location_address || locJson.location_address || "")}" placeholder="Always enter a written address when there is a physical location"></label><div class="events-grid"><label class="events-field">Map query<input class="events-input" id="event-map-query" value="${attr(ev.map_query || locJson.map_query || ev.location_address || "")}"></label><label class="events-field">Map embed URL optional<input class="events-input" id="event-map-embed" value="${attr(ev.map_embed_url || locJson.map_embed_url || "")}"></label></div><div class="events-map-actions"><button type="button" class="events-btn" id="event-use-address-map">Use address as map query</button><a class="events-btn" id="event-open-google-map" href="#" target="_blank" rel="noopener">Open address in Google Maps</a></div><label class="events-inline-check" style="margin-top:10px"><input type="checkbox" id="event-save-location"> Save/update this as a reusable location</label></div>

    <div class="events-card"><h3>Content</h3><label class="events-field">Short summary<textarea class="events-textarea" id="event-summary">${esc(ev.summary || "")}</textarea></label><label class="events-field">Full description / notes<textarea class="events-textarea" id="event-description">${esc(ev.description || "")}</textarea></label></div>

    <div class="events-card"><h3>RSVP rules</h3><div class="events-grid three"><label class="events-field">RSVP audience <span class="events-muted">Who may submit an RSVP.</span><select class="events-select" id="event-rsvp-audience"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="selected_classes">Selected classes</option><option value="selected_roles">Selected roles</option><option value="admin">Admins/board only</option></select></label><div>${dateTimeControls("event-deadline", "RSVP close", ev.rsvp_deadline_at, { optional: true })}</div><label class="events-field">Attendee list visibility<select class="events-select" id="event-attendee-vis"><option value="eligible">Eligible viewers</option><option value="members">Members/users</option><option value="admin">Admins only</option><option value="public">Public</option><option value="hidden">Hidden</option></select></label><label class="events-field">Capacity<input class="events-input" id="event-capacity" type="number" min="0" value="${attr(ev.capacity ?? "")}"></label><label class="events-field">Capacity behavior<select class="events-select" id="event-capacity-behavior"><option value="waitlist">Waitlist when full</option><option value="block">Block when full</option></select></label><label class="events-field">Max guests per RSVP<input class="events-input" id="event-max-guests" type="number" min="0" value="${attr(ev.max_guests_per_rsvp ?? 0)}"></label></div><div class="events-grid" style="margin-top:12px"><div><b>Eligible membership classes</b><div class="events-check-grid">${checkboxList("class-key", state.membershipClasses, classKey, row => row.label || row.class_label || row.class_key, classKeys)}</div></div><div><b>Eligible roles</b><div class="events-check-grid">${checkboxList("role-key", state.roles, roleKey, row => row.label || row.role_label || row.role_key, roleKeys)}</div></div></div><div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap"><label class="events-inline-check"><input type="checkbox" id="event-rsvp-enabled" ${ev.rsvp_enabled ? "checked" : ""}> RSVP enabled</label><label class="events-inline-check"><input type="checkbox" id="event-allow-guests" ${ev.allow_guests !== false ? "checked" : ""}> Allow guests</label><label class="events-inline-check"><input type="checkbox" id="event-show-attendees" ${ev.show_attendee_list !== false ? "checked" : ""}> Show attendee list when allowed</label><label class="events-inline-check"><input type="checkbox" id="event-featured" ${ev.featured ? "checked" : ""}> Featured</label></div></div>

    <div class="events-card"><div class="events-muted"><b>Checklist / bring-items is intentionally hidden in this pass.</b> Existing checklist records are preserved when saving. Full checklist claiming belongs in a later package.</div></div>

    ${actionBarHtml(ev, true)}`;
  }

  function bind() {
    document.querySelectorAll(".event-record").forEach(button => button.addEventListener("click", () => selectEvent(button.dataset.eventId || "")));
    document.getElementById("events-refresh")?.addEventListener("click", refresh);
    document.querySelectorAll(".event-new").forEach(button => button.addEventListener("click", newEvent));
    document.querySelectorAll(".event-save").forEach(button => button.addEventListener("click", () => saveEvent(button.dataset.saveStatus || "")));
    document.getElementById("event-archive")?.addEventListener("click", toggleArchive);
    document.getElementById("event-type-key")?.addEventListener("change", applyType);
    document.getElementById("event-location-key")?.addEventListener("change", applyLocation);
    document.getElementById("event-use-address-map")?.addEventListener("click", useAddressAsMapQuery);
    document.getElementById("event-open-google-map")?.addEventListener("click", updateGoogleMapLink);

    bindFilters();
    bindDefaults();
    bindColorPicker();
    bindTimingControls();
    bindMapControls();
    bindEditorDirty();
    updateEventKeyPreview();
    setDirty(state.dirty);
  }

  function bindFilters() {
    const search = document.getElementById("events-filter-search");
    const status = document.getElementById("events-filter-status");
    const type = document.getElementById("events-filter-type");
    const date = document.getElementById("events-filter-date");
    if (search) search.value = state.filters.search;
    if (status) status.value = state.filters.status;
    if (type) type.value = state.filters.type;
    if (date) date.value = state.filters.date;
    [search, status, type, date].forEach(el => el?.addEventListener("input", updateFilters));
    [status, type, date].forEach(el => el?.addEventListener("change", updateFilters));
  }

  function updateFilters() {
    state.filters.search = val("events-filter-search");
    state.filters.status = val("events-filter-status") || "active";
    state.filters.type = val("events-filter-type");
    state.filters.date = val("events-filter-date") || "all";
    const list = document.querySelector(".events-list");
    if (list) list.innerHTML = eventListHtml();
    document.querySelectorAll(".event-record").forEach(button => button.addEventListener("click", () => selectEvent(button.dataset.eventId || "")));
    const count = document.getElementById("events-visible-count");
    if (count) count.textContent = String(filteredEvents().length);
  }

  function bindDefaults() {
    const ev = activeEventForForm() || {};
    const defaults = {
      "event-status": ev.status || "draft",
      "event-visibility": ev.visibility_audience || ev.visibility || "public",
      "event-rsvp-audience": ev.rsvp_audience || "member",
      "event-capacity-behavior": ev.rsvp_capacity_behavior || (ev.waitlist_enabled === false ? "block" : "waitlist"),
      "event-attendee-vis": ev.attendee_list_visibility || "eligible",
    };
    Object.entries(defaults).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
  }

  function bindEditorDirty() {
    document.querySelectorAll(".events-editor input,.events-editor select,.events-editor textarea").forEach(el => {
      if (el.classList.contains("events-filter")) return;
      el.addEventListener("input", () => { updateEventKeyPreview(); setDirty(true); });
      el.addEventListener("change", () => { updateEventKeyPreview(); setDirty(true); });
    });
  }

  function bindColorPicker() {
    const text = document.getElementById("event-accent");
    const picker = document.getElementById("event-color-picker");
    if (!text || !picker) return;
    const normalize = value => /^#[0-9a-f]{6}$/i.test(clean(value)) ? clean(value) : FALLBACK_COLORS[0];
    picker.value = normalize(text.value);
    text.addEventListener("input", () => { picker.value = normalize(text.value); });
    picker.addEventListener("input", () => { text.value = picker.value; setDirty(true); });
  }

  function bindTimingControls() {
    const allDay = document.getElementById("event-all-day");
    const noEnd = document.getElementById("event-no-end");
    const sync = () => {
      const isAllDay = !!allDay?.checked;
      const isNoEnd = !!noEnd?.checked;
      ["event-start-hour", "event-start-minute", "event-start-ampm", "event-end-hour", "event-end-minute", "event-end-ampm"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = isAllDay; });
      ["event-end-date", "event-end-hour", "event-end-minute", "event-end-ampm"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = isNoEnd || isAllDay && id !== "event-end-date"; });
    };
    allDay?.addEventListener("change", sync);
    noEnd?.addEventListener("change", sync);
    sync();
  }

  function bindMapControls() {
    updateGoogleMapLink();
    ["event-address", "event-map-query", "event-location-name"].forEach(id => document.getElementById(id)?.addEventListener("input", updateGoogleMapLink));
  }

  function useAddressAsMapQuery() {
    const address = val("event-address") || val("event-location-name");
    const query = document.getElementById("event-map-query");
    if (query && address) query.value = address;
    updateGoogleMapLink();
    setDirty(true);
  }

  function updateGoogleMapLink(event) {
    const query = val("event-map-query") || val("event-address") || val("event-location-name");
    const link = document.getElementById("event-open-google-map");
    if (link) link.href = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "#";
    if (event && !query) event.preventDefault();
  }

  function updateEventKeyPreview() {
    const keyInput = document.getElementById("event-key");
    if (!keyInput || !state.creating) return;
    const title = val("event-title") || "event";
    const date = val("event-start-date") || "date";
    keyInput.value = keyify(`${title}-${date}`);
  }

  function applyType() {
    const type = selectedType();
    if (!type) return;
    const set = (id, value, force) => { const el = document.getElementById(id); if (el && (force || !el.value)) el.value = value || ""; };
    set("event-type-label", type.label, true);
    set("event-accent", type.accent_color, true);
    set("event-image", type.image_url, false);
    const picker = document.getElementById("event-color-picker"); if (picker && /^#[0-9a-f]{6}$/i.test(type.accent_color || "")) picker.value = type.accent_color;
    const vis = document.getElementById("event-visibility"); if (vis && type.default_visibility) vis.value = type.default_visibility;
    const aud = document.getElementById("event-rsvp-audience"); if (aud && type.default_rsvp_audience) aud.value = type.default_rsvp_audience;
    setDirty(true);
  }

  function applyLocation() {
    const loc = selectedLocation();
    if (!loc) return;
    const set = (id, value, force) => { const el = document.getElementById(id); if (el && (force || !el.value)) el.value = value || ""; };
    set("event-location-name", loc.location_name || loc.label, true);
    set("event-address", loc.location_address, true);
    set("event-map-query", loc.map_query || loc.location_address || loc.label, true);
    set("event-map-embed", loc.map_embed_url, false);
    updateGoogleMapLink();
    setDirty(true);
  }

  function selectedNeedsPayload() {
    const rows = Array.from(document.querySelectorAll(".events-needed-row"));
    if (!rows.length) return arr(selectedEvent()?.needed_items).map((item, index) => ({
      event_need_id: clean(item.event_need_id),
      item_key: clean(item.item_key) || keyify(item.label) || `item-${index + 1}`,
      label: clean(item.label),
      quantity_needed: Math.max(1, Number(item.quantity_needed || 1)),
      notes: clean(item.notes),
      sort_order: Number(item.sort_order || (index + 1) * 10),
      status: clean(item.status || "active") || "active",
    })).filter(item => item.label);
    return rows.map((row, index) => {
      const label = clean(row.querySelector(".need-label")?.value);
      if (!label) return null;
      return {
        event_need_id: clean(row.dataset.needId),
        item_key: keyify(label) || `item-${index + 1}`,
        label,
        quantity_needed: Math.max(1, Number(row.querySelector(".need-qty")?.value || 1)),
        notes: clean(row.querySelector(".need-notes")?.value),
        sort_order: (index + 1) * 10,
        status: "active",
      };
    }).filter(Boolean);
  }

  function makePayload() {
    const type = selectedType();
    const loc = selectedLocation();
    const allDay = checked("event-all-day");
    const noEnd = checked("event-no-end");
    return {
      organization_id: state.orgId,
      event_id: state.creating ? null : (state.selectedId || null),
      title: val("event-title"),
      event_key: val("event-key"),
      status: val("event-status") || "draft",
      visibility_audience: val("event-visibility"),
      starts_at: combineDateTime("event-start", { allDay }),
      ends_at: noEnd ? null : combineDateTime("event-end", { allDay }),
      timezone: val("event-timezone") || "America/New_York",
      all_day_event: allDay,
      no_end_time: noEnd,
      event_type_key: val("event-type-key") || keyify(val("event-type-label") || "general"),
      event_type_label: val("event-type-label") || (type && type.label) || "General",
      category: val("event-type-label") || (type && type.label) || "General",
      event_accent_color: val("event-accent") || (type && type.accent_color) || "",
      event_image_url: val("event-image") || (type && type.image_url) || "",
      save_event_type: checked("event-save-type"),
      location_key: val("event-location-key") || keyify(val("event-location-name") || val("event-address")),
      location_label: val("event-location-name") || (loc && loc.label) || "",
      location_name: val("event-location-name") || (loc && loc.location_name) || "",
      location_address: val("event-address") || (loc && loc.location_address) || "",
      map_query: val("event-map-query") || val("event-address") || "",
      map_embed_url: val("event-map-embed"),
      save_location: checked("event-save-location"),
      summary: val("event-summary"),
      description: val("event-description"),
      rsvp_enabled: checked("event-rsvp-enabled"),
      rsvp_audience: val("event-rsvp-audience"),
      rsvp_deadline_at: combineDateTime("event-deadline", {}),
      capacity: val("event-capacity") === "" ? null : Number(val("event-capacity")),
      allow_guests: checked("event-allow-guests"),
      max_guests_per_rsvp: Number(val("event-max-guests") || 0),
      rsvp_capacity_behavior: val("event-capacity-behavior"),
      waitlist_enabled: val("event-capacity-behavior") === "waitlist",
      attendee_list_visibility: val("event-attendee-vis"),
      show_attendee_list: checked("event-show-attendees"),
      allowed_membership_class_keys: checkedValues("class-key"),
      allowed_role_keys: checkedValues("role-key"),
      featured: checked("event-featured"),
      sort_order: Number(val("event-sort") || 100),
      event_needed_items: selectedNeedsPayload(),
    };
  }

  async function saveEvent(forcedStatus) {
    try {
      if (forcedStatus) {
        const status = document.getElementById("event-status");
        if (status) status.value = forcedStatus;
      }
      state.status = "Saving...";
      renderStatusOnly();
      const payload = makePayload();
      if (!payload.title) throw new Error("Event title is required.");
      if (!payload.starts_at) throw new Error("Start date is required.");
      const result = await call("organization_save_event", payload);
      state.accessRow = result.access;
      state.events = arr(result.events);
      state.eventTypes = arr(result.event_types);
      state.locations = arr(result.locations);
      state.membershipClasses = arr(result.membership_classes);
      state.roles = arr(result.roles);
      const found = state.events.find(ev => clean(ev.event_id) === clean(payload.event_id)) || state.events.find(ev => clean(ev.event_key) === clean(payload.event_key)) || state.events.find(ev => clean(ev.title) === clean(payload.title));
      if (found) state.selectedId = clean(found.event_id);
      state.creating = false;
      state.status = payload.status === "published" ? "Published and saved." : "Saved.";
      state.error = "";
      setShellState();
      setDirty(false);
      render();
    } catch (error) {
      state.error = error.message || String(error);
      render();
    }
  }

  async function toggleArchive() {
    const ev = selectedEvent();
    if (!ev || !ev.event_id) return;
    const archived = ev.archived_at || ev.status === "archived";
    if (!confirm(archived ? "Restore this event?" : "Archive this event?")) return;
    try {
      const result = await call(archived ? "organization_restore_event" : "organization_archive_event", { organization_id: state.orgId, event_id: ev.event_id });
      state.events = arr(result.events);
      state.status = archived ? "Restored." : "Archived.";
      state.error = "";
      setDirty(false);
      render();
    } catch (error) {
      state.error = error.message || String(error);
      render();
    }
  }

  function newEvent() {
    if (state.dirty && !confirm("You have unsaved event changes. Discard them?")) return;
    state.selectedId = "";
    state.creating = true;
    state.status = "";
    setDirty(false);
    render();
    setDirty(true);
    document.getElementById("event-title")?.focus();
  }

  function selectEvent(id) {
    if (state.dirty && !confirm("You have unsaved event changes. Discard them?")) return;
    state.selectedId = clean(id);
    state.creating = false;
    state.status = "";
    setDirty(false);
    render();
  }

  function renderStatusOnly() {
    document.querySelectorAll(".event-status-message").forEach(el => { el.textContent = state.status || ""; });
  }

  function render() {
    const r = root();
    if (!r) return;
    if (!state.accessRow && state.loading) {
      r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Loading organization event tools...</p></div><div class="events-editor">Loading...</div></div></div>`;
      return;
    }
    const visibleCount = filteredEvents().length;
    r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Create events, reuse event types and locations, configure RSVP rules, and prepare later checklist support.</p></div>${state.error ? `<div class="events-editor" style="max-height:none"><div class="events-error">${esc(state.error)}</div></div>` : ""}<div class="events-main"><aside class="events-sidebar"><div class="events-sidebar-head"><div><b><span id="events-visible-count">${visibleCount}</span> / ${state.events.length} events</b></div><button type="button" class="events-btn primary event-new">New Event</button><button type="button" class="events-btn" id="events-refresh">Refresh</button></div>${filterOptions()}<div class="events-list">${eventListHtml()}</div></aside><main class="events-editor">${formHtml()}</main></div></div>${state.debug ? `<pre class="events-debug">SyncEtc Events Manager Diagnostics ${VERSION}\nOrg: ${esc(state.accessRow && state.accessRow.organization_key || "")}\nEvents: ${state.events.length}\nTypes: ${state.eventTypes.length}\nLocations: ${state.locations.length}\nSelected: ${esc(state.selectedId || (state.creating ? "new" : "none"))}\n\n${esc(JSON.stringify(state.last, null, 2)).slice(0, 12000)}</pre>` : ""}</div>`;
    bind();
  }

  document.addEventListener("DOMContentLoaded", () => {
    mark("boot:start", location.pathname);
    refresh();
  });
})();
