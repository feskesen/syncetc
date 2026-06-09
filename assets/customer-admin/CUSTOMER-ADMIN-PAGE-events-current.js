// CUSTOMER-ADMIN-PAGE-events-current.js
// Internal Version: 2026-06-09-092-A
// Purpose: Customer-admin Events Manager for event details, reusable event types/locations, RSVP settings, and event checklist needs. Uses portal shell + core-access-action.

(function () {
  "use strict";

  const VERSION = "2026-06-09-092-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-organization-events-root, [data-syncetc-page='organization-events']";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";
  const FALLBACK_COLORS = ["#265c2b", "#1f4f82", "#c81e1e", "#a16207", "#6d28d9", "#0369a1"];

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
    dirty: false,
    last: null,
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

  function isoLocal(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocal(value) {
    const raw = clean(value);
    if (!raw) return "";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toISOString();
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
    const flag = document.getElementById("events-dirty-flag");
    if (flag) flag.textContent = state.dirty ? "Unsaved changes" : "No unsaved changes";
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
      if (!state.selectedId && state.events.length) state.selectedId = clean(state.events[0].event_id);
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

  function css() {
    const c = styleConfig();
    return `<style>
      .syncetc-events-page{max-width:${c.width};margin:28px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:${c.text}}
      .syncetc-events-page *{box-sizing:border-box}.events-shell{border:1px solid ${c.border};border-radius:26px;background:#fff;box-shadow:${c.shadow};overflow:hidden}.events-hero{padding:28px 32px;background:linear-gradient(135deg,${c.primary},color-mix(in srgb,${c.primary} 70%,#4b9bd4));color:#fff}.events-hero h1{margin:10px 0 0;font-size:clamp(32px,4vw,48px);line-height:1}.events-hero p{margin:10px 0 0;max-width:760px}.events-badge{display:inline-flex;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.events-main{display:grid;grid-template-columns:330px minmax(0,1fr);background:linear-gradient(180deg,${c.soft},rgba(255,255,255,.96))}.events-sidebar{padding:16px;border-right:1px solid ${c.border};background:#fff}.events-list{display:grid;gap:8px;max-height:740px;overflow:auto;padding-right:3px}.event-record{display:block;width:100%;text-align:left;border:1px solid ${c.border};border-left:6px solid var(--event-accent,${c.primary});background:#fff;border-radius:16px;padding:12px;cursor:pointer;color:${c.text}}.event-record.selected{border-color:${c.primary};border-left-color:var(--event-accent,${c.primary});box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 13%,transparent)}.event-record.archived{opacity:.55}.event-record b{display:block}.event-record span,.event-record small{display:block;color:rgba(20,36,23,.70);font-size:12px;margin-top:4px}.events-editor{padding:18px}.events-card{background:#fff;border:1px solid ${c.border};border-radius:20px;padding:18px;margin-bottom:16px}.events-card h2,.events-card h3{margin:0 0 12px}.events-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.events-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.events-field{display:grid;gap:5px;font-size:12px;font-weight:900;color:${c.primary}}.events-input,.events-select,.events-textarea{width:100%;border:1px solid ${c.border};border-radius:12px;padding:10px 12px;font:inherit;color:${c.text};background:#fff}.events-textarea{min-height:88px;resize:vertical}.events-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;justify-content:flex-end;position:sticky;bottom:0;background:rgba(255,255,255,.94);border-top:1px solid ${c.border};padding:12px;z-index:3}.events-btn{border:1px solid ${c.border};border-radius:999px;background:#fff;color:${c.primary};padding:10px 14px;font-weight:900;cursor:pointer}.events-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.08)}.events-btn.primary{background:${c.primary};color:#fff}.events-btn.danger{background:#fff7ec;color:#9a3412;border-color:#fed7aa}.events-btn:disabled{opacity:.55;cursor:not-allowed}.events-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px}.events-check,.events-inline-check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:${c.text}}.events-check input,.events-inline-check input{width:auto}.events-status{display:inline-flex;padding:9px 12px;border-radius:14px;background:${c.soft};font-weight:900}.events-error{padding:12px;border-radius:14px;background:#fee2e2;color:#991b1b;font-weight:900}.events-empty{padding:18px;border:1px dashed ${c.border};border-radius:16px;color:rgba(20,36,23,.65)}.events-color-row{display:flex;gap:8px;align-items:center}.events-color-swatch{width:38px;height:38px;border-radius:12px;border:1px solid ${c.border};background:${c.primary}}.events-needed-list{display:grid;gap:10px}.events-needed-row{display:grid;grid-template-columns:1.1fr 90px 1fr auto;gap:10px;align-items:end;padding:10px;border:1px solid ${c.border};border-radius:16px;background:${c.soft}}.events-needed-row .events-field{margin:0}.events-muted{color:rgba(20,36,23,.62);font-size:12.5px;line-height:1.4}.events-topline{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.events-debug{max-width:${c.width};margin:16px auto;padding:14px;border-radius:16px;background:#0f172a;color:#dbeafe;overflow:auto;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
      @media(max-width:900px){.events-main{grid-template-columns:1fr}.events-sidebar{border-right:none;border-bottom:1px solid ${c.border}}.events-grid,.events-grid.three{grid-template-columns:1fr}.events-check-grid{grid-template-columns:1fr}.events-needed-row{grid-template-columns:1fr}.events-actions{position:static}}
    </style>`;
  }

  function eventListHtml() {
    if (!state.events.length) return `<div class="events-empty">No events yet. Create the first event on the right.</div>`;
    return state.events.map(ev => {
      const date = ev.starts_at ? new Date(ev.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "No date";
      const accent = clean(ev.event_accent_color || (obj(ev.event_type_json).accent_color)) || styleConfig().primary;
      const status = ev.status === "archived" || ev.archived_at ? "archived" : ev.status || "draft";
      return `<button type="button" class="event-record ${clean(ev.event_id) === clean(state.selectedId) ? "selected" : ""} ${status === "archived" ? "archived" : ""}" style="--event-accent:${attr(accent)}" data-event-id="${attr(ev.event_id)}"><b>${esc(ev.title || "Untitled event")}</b><span>${esc(date)}</span><small>${esc(ev.event_type_label || ev.category || "General")} • ${esc(status)}</small></button>`;
    }).join("");
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

  function needRowsHtml(ev) {
    const needs = arr(ev.needed_items);
    if (!needs.length) return `<div class="events-muted" id="event-needed-empty">No needed items yet. Add things like ladders, chairs, food, supplies, or equipment.</div>`;
    return needs.map((item, index) => needRowHtml(item, index)).join("");
  }

  function needRowHtml(item, index) {
    const id = clean(item.event_need_id);
    return `<div class="events-needed-row" data-need-index="${index}" data-need-id="${attr(id)}"><label class="events-field">Item needed<input class="events-input need-label" value="${attr(item.label || "")}" placeholder="e.g., Ladder"></label><label class="events-field">Qty<input class="events-input need-qty" type="number" min="1" value="${attr(item.quantity_needed || 1)}"></label><label class="events-field">Notes<input class="events-input need-notes" value="${attr(item.notes || "")}" placeholder="optional"></label><button type="button" class="events-btn danger need-remove">Remove</button></div>`;
  }

  function formHtml() {
    const ev = selectedEvent() || {};
    const typeJson = obj(ev.event_type_json);
    const locJson = obj(ev.location_json);
    const classKeys = arr(ev.allowed_membership_class_keys || ev.rsvp_allowed_membership_class_keys);
    const roleKeys = arr(ev.allowed_role_keys || ev.rsvp_allowed_role_keys);
    return `<div class="events-card"><div class="events-topline"><h2>${ev.event_id ? "Edit Event" : "New Event"}</h2><span id="events-dirty-flag" class="events-status">No unsaved changes</span></div><div class="events-grid"><label class="events-field">Title<input class="events-input" id="event-title" value="${attr(ev.title || "")}"></label><label class="events-field">Event key<input class="events-input" id="event-key" value="${attr(ev.event_key || "")}" placeholder="auto-generated if blank"></label><label class="events-field">Status<select class="events-select" id="event-status"><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label><label class="events-field">Event visibility<select class="events-select" id="event-visibility"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="admin">Admins/board only</option></select></label><label class="events-field">Starts<input class="events-input" id="event-start" type="datetime-local" value="${attr(isoLocal(ev.starts_at))}"></label><label class="events-field">Ends<input class="events-input" id="event-end" type="datetime-local" value="${attr(isoLocal(ev.ends_at))}"></label><label class="events-field">Timezone<input class="events-input" id="event-timezone" value="${attr(ev.timezone || "America/New_York")}"></label><label class="events-field">Sort order<input class="events-input" id="event-sort" type="number" value="${attr(ev.sort_order ?? 100)}"></label></div></div>

    <div class="events-card"><h3>Event type</h3><div class="events-grid"><label class="events-field">Saved type<select class="events-select" id="event-type-key">${typeOptions(ev)}</select></label><label class="events-field">Type label<input class="events-input" id="event-type-label" value="${attr(ev.event_type_label || ev.category || typeJson.label || "General")}"></label><label class="events-field">Accent color<div class="events-color-row"><input class="events-input" id="event-accent" value="${attr(ev.event_accent_color || typeJson.accent_color || FALLBACK_COLORS[0])}"><span class="events-color-swatch" id="event-color-swatch"></span></div></label><label class="events-field">Image URL<input class="events-input" id="event-image" value="${attr(ev.event_image_url || ev.image_url || typeJson.image_url || "")}" placeholder="upload support later; URL for now"></label></div><label class="events-inline-check"><input type="checkbox" id="event-save-type"> Save/update this as a reusable event type</label><div class="events-muted">Event-type color is used as a subtle accent. Later this can include uploaded icons/images.</div></div>

    <div class="events-card"><h3>Location</h3><div class="events-grid"><label class="events-field">Saved location<select class="events-select" id="event-location-key">${locationOptions(ev)}</select></label><label class="events-field">Location name<input class="events-input" id="event-location-name" value="${attr(ev.location_name || locJson.location_name || locJson.label || "")}"></label></div><label class="events-field">Written address<input class="events-input" id="event-address" value="${attr(ev.location_address || locJson.location_address || "")}" placeholder="Always enter a written address when there is a physical location"></label><div class="events-grid"><label class="events-field">Map query<input class="events-input" id="event-map-query" value="${attr(ev.map_query || locJson.map_query || ev.location_address || "")}"></label><label class="events-field">Map embed URL optional<input class="events-input" id="event-map-embed" value="${attr(ev.map_embed_url || locJson.map_embed_url || "")}"></label></div><label class="events-inline-check"><input type="checkbox" id="event-save-location"> Save/update this as a reusable location</label></div>

    <div class="events-card"><h3>Content</h3><label class="events-field">Short summary<textarea class="events-textarea" id="event-summary">${esc(ev.summary || "")}</textarea></label><label class="events-field">Full description / notes<textarea class="events-textarea" id="event-description">${esc(ev.description || "")}</textarea></label></div>

    <div class="events-card"><h3>RSVP rules</h3><div class="events-grid three"><label class="events-field">RSVP audience<select class="events-select" id="event-rsvp-audience"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="selected_classes">Selected classes</option><option value="selected_roles">Selected roles</option><option value="admin">Admins/board only</option></select></label><label class="events-field">RSVP close date<input class="events-input" id="event-deadline" type="datetime-local" value="${attr(isoLocal(ev.rsvp_deadline_at))}"></label><label class="events-field">Attendee list visibility<select class="events-select" id="event-attendee-vis"><option value="eligible">Eligible viewers</option><option value="members">Members/users</option><option value="admin">Admins only</option><option value="public">Public</option><option value="hidden">Hidden</option></select></label><label class="events-field">Capacity<input class="events-input" id="event-capacity" type="number" min="0" value="${attr(ev.capacity ?? "")}"></label><label class="events-field">Capacity behavior<select class="events-select" id="event-capacity-behavior"><option value="waitlist">Waitlist when full</option><option value="block">Block when full</option></select></label><label class="events-field">Max guests per RSVP<input class="events-input" id="event-max-guests" type="number" min="0" value="${attr(ev.max_guests_per_rsvp ?? 0)}"></label></div><div class="events-grid" style="margin-top:12px"><div><b>Eligible membership classes</b><div class="events-check-grid">${checkboxList("class-key", state.membershipClasses, classKey, row => row.label || row.class_label || row.class_key, classKeys)}</div></div><div><b>Eligible roles</b><div class="events-check-grid">${checkboxList("role-key", state.roles, roleKey, row => row.label || row.role_label || row.role_key, roleKeys)}</div></div></div><div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap"><label class="events-inline-check"><input type="checkbox" id="event-rsvp-enabled" ${ev.rsvp_enabled ? "checked" : ""}> RSVP enabled</label><label class="events-inline-check"><input type="checkbox" id="event-allow-guests" ${ev.allow_guests !== false ? "checked" : ""}> Allow guests</label><label class="events-inline-check"><input type="checkbox" id="event-show-attendees" ${ev.show_attendee_list !== false ? "checked" : ""}> Show attendee list when allowed</label><label class="events-inline-check"><input type="checkbox" id="event-featured" ${ev.featured ? "checked" : ""}> Featured</label></div></div>

    <div class="events-card"><div class="events-topline"><div><h3>Event needs / checklist groundwork</h3><div class="events-muted">Define items the event needs, such as ladders, chairs, food, coolers, or supplies. RSVP claiming will be connected in a later package.</div></div><button type="button" class="events-btn" id="event-add-need">Add needed item</button></div><div class="events-needed-list" id="event-needed-list">${needRowsHtml(ev)}</div></div>

    <div class="events-actions"><span class="events-status" id="event-status-message">${esc(state.status || "")}</span><button type="button" class="events-btn" id="event-new">New Event</button><button type="button" class="events-btn danger" id="event-archive">${ev.archived_at || ev.status === "archived" ? "Restore" : "Archive"}</button><button type="button" class="events-btn primary" id="event-save">Save Event</button></div>`;
  }

  function bind() {
    document.querySelectorAll(".event-record").forEach(button => button.addEventListener("click", () => selectEvent(button.dataset.eventId || "")));
    document.getElementById("events-refresh")?.addEventListener("click", refresh);
    document.getElementById("event-save")?.addEventListener("click", saveEvent);
    document.getElementById("event-archive")?.addEventListener("click", toggleArchive);
    document.getElementById("event-new")?.addEventListener("click", () => selectEvent(""));
    document.getElementById("event-add-need")?.addEventListener("click", addNeedRow);
    document.querySelectorAll(".need-remove").forEach(button => button.addEventListener("click", () => { button.closest(".events-needed-row")?.remove(); setDirty(true); }));
    document.getElementById("event-type-key")?.addEventListener("change", applyType);
    document.getElementById("event-location-key")?.addEventListener("change", applyLocation);

    const ev = selectedEvent() || {};
    const defaults = {
      "event-status": ev.status || "draft",
      "event-visibility": ev.visibility_audience || ev.visibility || "public",
      "event-rsvp-audience": ev.rsvp_audience || "member",
      "event-capacity-behavior": ev.rsvp_capacity_behavior || (ev.waitlist_enabled === false ? "block" : "waitlist"),
      "event-attendee-vis": ev.attendee_list_visibility || "eligible",
    };
    Object.entries(defaults).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
    const swatch = document.getElementById("event-color-swatch");
    const color = document.getElementById("event-accent");
    if (swatch && color) {
      swatch.style.background = color.value || FALLBACK_COLORS[0];
      color.addEventListener("input", () => { swatch.style.background = color.value || FALLBACK_COLORS[0]; });
    }
    document.querySelectorAll(".syncetc-events-page input,.syncetc-events-page select,.syncetc-events-page textarea").forEach(el => {
      el.addEventListener("input", () => setDirty(true));
      el.addEventListener("change", () => setDirty(true));
    });
  }

  function addNeedRow() {
    const list = document.getElementById("event-needed-list");
    if (!list) return;
    const empty = document.getElementById("event-needed-empty");
    if (empty) empty.remove();
    const temp = document.createElement("div");
    const index = document.querySelectorAll(".events-needed-row").length;
    temp.innerHTML = needRowHtml({ label: "", quantity_needed: 1, notes: "", sort_order: (index + 1) * 10 }, index);
    const row = temp.firstElementChild;
    list.appendChild(row);
    row.querySelector(".need-remove")?.addEventListener("click", () => { row.remove(); setDirty(true); });
    row.querySelectorAll("input").forEach(el => { el.addEventListener("input", () => setDirty(true)); el.addEventListener("change", () => setDirty(true)); });
    setDirty(true);
    row.querySelector(".need-label")?.focus();
  }

  function applyType() {
    const type = selectedType();
    if (!type) return;
    const set = (id, value, force) => { const el = document.getElementById(id); if (el && (force || !el.value)) el.value = value || ""; };
    set("event-type-label", type.label, true);
    set("event-accent", type.accent_color, true);
    set("event-image", type.image_url, false);
    const vis = document.getElementById("event-visibility"); if (vis && type.default_visibility) vis.value = type.default_visibility;
    const aud = document.getElementById("event-rsvp-audience"); if (aud && type.default_rsvp_audience) aud.value = type.default_rsvp_audience;
    const swatch = document.getElementById("event-color-swatch"); if (swatch) swatch.style.background = type.accent_color || FALLBACK_COLORS[0];
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
    setDirty(true);
  }

  function selectedNeedsPayload() {
    return Array.from(document.querySelectorAll(".events-needed-row")).map((row, index) => {
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
    return {
      organization_id: state.orgId,
      event_id: state.selectedId || null,
      title: val("event-title"),
      event_key: val("event-key"),
      status: val("event-status"),
      visibility_audience: val("event-visibility"),
      starts_at: fromLocal(val("event-start")),
      ends_at: fromLocal(val("event-end")),
      timezone: val("event-timezone") || "America/New_York",
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
      rsvp_deadline_at: fromLocal(val("event-deadline")),
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

  async function saveEvent() {
    try {
      state.status = "Saving...";
      renderStatusOnly();
      const payload = makePayload();
      if (!payload.title) throw new Error("Event title is required.");
      if (!payload.starts_at) throw new Error("Start date/time is required.");
      const result = await call("organization_save_event", payload);
      state.accessRow = result.access;
      state.events = arr(result.events);
      state.eventTypes = arr(result.event_types);
      state.locations = arr(result.locations);
      state.membershipClasses = arr(result.membership_classes);
      state.roles = arr(result.roles);
      const found = state.events.find(ev => clean(ev.event_id) === clean(payload.event_id)) || state.events.find(ev => clean(ev.title) === clean(payload.title));
      if (found) state.selectedId = clean(found.event_id);
      state.status = "Saved.";
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

  function selectEvent(id) {
    if (state.dirty && !confirm("You have unsaved event changes. Discard them?")) return;
    state.selectedId = clean(id);
    state.status = "";
    setDirty(false);
    render();
  }

  function renderStatusOnly() {
    const el = document.getElementById("event-status-message");
    if (el) el.textContent = state.status || "";
  }

  function render() {
    const r = root();
    if (!r) return;
    if (!state.accessRow && state.loading) {
      r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Loading organization event tools...</p></div><div class="events-editor">Loading...</div></div></div>`;
      return;
    }
    r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Create events, reuse event types and locations, configure RSVP rules, and define checklist needs.</p></div>${state.error ? `<div class="events-editor"><div class="events-error">${esc(state.error)}</div></div>` : ""}<div class="events-main"><aside class="events-sidebar"><div class="events-topline" style="margin-bottom:12px"><b>${state.events.length} events</b><button type="button" class="events-btn" id="events-refresh">Refresh</button></div><div class="events-list">${eventListHtml()}</div></aside><main class="events-editor">${formHtml()}</main></div></div>${state.debug ? `<pre class="events-debug">SyncEtc Events Manager Diagnostics ${VERSION}\nOrg: ${esc(state.accessRow && state.accessRow.organization_key || "")}\nEvents: ${state.events.length}\nTypes: ${state.eventTypes.length}\nLocations: ${state.locations.length}\n\n${esc(JSON.stringify(state.last, null, 2)).slice(0, 12000)}</pre>` : ""}</div>`;
    bind();
  }

  document.addEventListener("DOMContentLoaded", () => {
    mark("boot:start", location.pathname);
    refresh();
  });
})();
