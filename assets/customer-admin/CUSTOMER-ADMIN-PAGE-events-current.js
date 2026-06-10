// CUSTOMER-ADMIN-PAGE-events-current.js
// Internal Version: 2026-06-09-094-E
// Purpose: Customer-admin Events Manager cleanup: compact draft reminder, event-list-only scrolling, saved-location dirty detection, no-end default restoration, and inline timing validation. Uses portal shell + core-access-action.

(function () {
  "use strict";

  const VERSION = "2026-06-09-094-E";
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
    statusKind: "",
    draftNotice: false,
    saving: false,
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
    formDraft: null,
    lastValidationSnapshot: null,
    lastValidationMessage: "",
  };

  function root() { return document.querySelector(ROOT_SELECTOR); }
  function mark(label, detail) { state.steps.push({ ms: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function attr(value) { return esc(value); }
  function help(text) { return `<span class="events-help" tabindex="0" aria-label="${attr(text)}" title="${attr(text)}" data-tip="${attr(text)}">i</span>`; }
  function keyify(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function checkedValues(name) { return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value).filter(Boolean); }
  function sameText(a, b) { return clean(a).toLowerCase() === clean(b).toLowerCase(); }
  function sameKey(a, b) { return keyify(a) === keyify(b); }
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
    const flagHtml = options && options.flagHtml ? options.flagHtml : "";
    return `<div class="events-time-block" data-time-prefix="${attr(prefix)}"><div class="events-time-title"><span>${esc(label)}</span>${flagHtml ? `<span class="events-time-flag">${flagHtml}</span>` : ""}</div><div class="events-time-grid"><label class="events-field">Date<input class="events-input" id="${attr(prefix)}-date" type="date" value="${attr(parts.date)}" ${optional ? "" : "required"}></label><label class="events-field events-time-select">Hour<select class="events-select" id="${attr(prefix)}-hour">${hourOptions(parts.hour)}</select></label><label class="events-field events-time-select">Minute<select class="events-select" id="${attr(prefix)}-minute">${minuteOptions(parts.minute)}</select></label><label class="events-field events-time-select">AM/PM<select class="events-select" id="${attr(prefix)}-ampm">${ampmOptions(parts.ampm)}</select></label></div></div>`;
  }

  function readableDate(value) {
    if (!value) return "No date";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "No date" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function mapPreviewUrl(query, embedUrl) {
    const embed = clean(embedUrl);
    if (embed && /^https?:\/\//i.test(embed)) return embed;
    const q = clean(query);
    return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : "";
  }



  function dateSearchTokens(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = [
      d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
      d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
      d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }),
      `${d.getMonth() + 1}/${d.getDate()}`,
      `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      String(d.getFullYear()),
    ];
    return parts.join(" ").toLowerCase();
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

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read selected image."));
      reader.readAsDataURL(file);
    });
  }

  function imagePreviewHtml(url) {
    const cleanUrl = clean(url);
    if (!cleanUrl) return `<div class="events-image-empty">No image selected</div>`;
    return `<img src="${attr(cleanUrl)}" alt="Event image preview" loading="lazy">`;
  }

  function imageDropHtml(prefix, label, url, path, helpText) {
    return `<div class="events-image-widget" data-image-prefix="${attr(prefix)}"><div class="events-topline"><label class="events-field" style="margin:0"><span>${esc(label)}</span><input class="events-input events-image-url" id="${attr(prefix)}-url" value="${attr(url || "")}" placeholder="Image URL or upload below"></label></div><input type="hidden" id="${attr(prefix)}-path" value="${attr(path || "")}"><div class="events-image-drop" data-image-prefix="${attr(prefix)}" tabindex="0"><div class="events-image-preview" id="${attr(prefix)}-preview">${imagePreviewHtml(url)}</div><div><b>Drop image here</b><span>or click to choose JPG, PNG, or WebP.</span><small>${esc(helpText || "")}</small></div><input class="events-image-file" id="${attr(prefix)}-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div><div class="events-image-actions"><button type="button" class="events-btn events-image-choose" data-image-prefix="${attr(prefix)}">Choose image</button><button type="button" class="events-btn events-image-clear" data-image-prefix="${attr(prefix)}">Clear image</button><span class="events-muted events-image-status" id="${attr(prefix)}-status"></span></div></div>`;
  }

  async function uploadImageFile(file, kind, prefix) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB.");
    const status = document.getElementById(`${prefix}-status`);
    if (status) status.textContent = "Uploading...";
    const dataUrl = await fileToDataUrl(file);
    const result = await call("organization_upload_event_image", {
      organization_id: state.orgId,
      image_kind: kind,
      file_name: file.name,
      content_type: file.type,
      data_url: dataUrl,
      event_id: state.creating ? "" : state.selectedId,
      event_type_key: val("event-type-key") || keyify(val("event-type-label")),
    });
    const uploaded = obj(result.uploaded);
    const urlEl = document.getElementById(`${prefix}-url`);
    const pathEl = document.getElementById(`${prefix}-path`);
    const preview = document.getElementById(`${prefix}-preview`);
    if (urlEl) urlEl.value = clean(uploaded.public_url || uploaded.url);
    if (pathEl) pathEl.value = clean(uploaded.storage_path || uploaded.path);
    if (preview) preview.innerHTML = imagePreviewHtml(clean(uploaded.public_url || uploaded.url));
    if (status) status.textContent = "Uploaded.";
    setDirty(true);
    updateReuseControls();
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
      state.draftNotice = false;
      state.saving = false;
      state.formDraft = null;
      state.lastValidationMessage = "";
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
  function typeDisplayName(type) { return clean(type && (type.label || type.type_label || type.type_key)); }
  function locationDisplayName(loc) { return clean(loc && (loc.label || loc.location_name || loc.location_key)); }
  function typeImageUrl(type) { return clean(type && (type.image_url || type.default_image_url || obj(type.image_asset_json).public_url || obj(type.image_asset_json).url)); }
  function typeImagePath(type) { return clean(type && (type.image_storage_path || type.default_image_path || obj(type.image_asset_json).storage_path || obj(type.image_asset_json).path)); }
  function typeChangedFromSaved(type) {
    if (!type) return false;
    const labelValue = val("event-type-label") || val("event-title");
    return !sameText(labelValue, typeDisplayName(type)) || clean(val("event-accent")) !== clean(type.accent_color) || clean(val("event-image-url")) !== typeImageUrl(type);
  }
  function locationChangedFromSaved(loc) {
    if (!loc) return false;
    const enteredName = clean(val("event-location-name"));
    const savedNames = [loc.location_name, loc.label, loc.location_label, loc.location_key].map(clean).filter(Boolean);
    const nameChanged = enteredName && savedNames.length && !savedNames.some(name => sameText(enteredName, name));
    const addressChanged = clean(val("event-address")) !== clean(loc.location_address);
    const savedQuery = clean(loc.map_query || loc.location_address || loc.location_name || loc.label || "");
    const queryChanged = clean(val("event-map-query")) !== savedQuery;
    const embedChanged = clean(val("event-map-embed")) !== clean(loc.map_embed_url);
    return !!(nameChanged || addressChanged || queryChanged || embedChanged);
  }
  function reuseMode(kind) {
    const box = document.getElementById(kind === "type" ? "event-type-reuse-box" : "event-location-reuse-box");
    return clean(box && box.dataset && box.dataset.mode);
  }
  function classKey(row) { return clean(row.class_key || row.membership_class_key); }
  function roleKey(row) { return clean(row.role_key); }
  function defaultNewEvent() {
    return {
      status: "draft",
      visibility_audience: "public",
      timezone: "America/New_York",
      sort_order: 100,
      event_type_key: "",
      event_type_label: "",
      category: "",
      event_accent_color: styleConfig().primary || FALLBACK_COLORS[0],
      rsvp_enabled: true,
      rsvp_audience: "public",
      allow_guests: true,
      max_guests_per_rsvp: 0,
      rsvp_capacity_behavior: "waitlist",
      attendee_list_visibility: "members",
      show_attendee_list: true,
      all_day_event: false,
      no_end_time: true,
    };
  }

  function currentFormToEvent(payload) {
    const p = payload || {};
    const type = selectedType();
    const loc = selectedLocation();
    return {
      ...(state.creating ? defaultNewEvent() : (selectedEvent() || {})),
      event_id: state.creating ? null : (state.selectedId || p.event_id || null),
      title: p.title ?? val("event-title"),
      event_key: p.event_key ?? val("event-key"),
      status: p.status ?? (val("event-status") || "draft"),
      visibility_audience: p.visibility_audience ?? val("event-visibility"),
      starts_at: p.starts_at ?? combineDateTime("event-start", { allDay: checked("event-all-day") }),
      ends_at: (p.no_end_time ?? checked("event-no-end")) ? null : (p.ends_at ?? combineDateTime("event-end", { allDay: checked("event-all-day") })),
      timezone: p.timezone ?? (val("event-timezone") || "America/New_York"),
      all_day_event: p.all_day_event ?? checked("event-all-day"),
      no_end_time: p.no_end_time ?? checked("event-no-end"),
      event_type_key: p.event_type_key ?? (val("event-type-key") || keyify(val("event-type-label"))),
      event_type_label: p.event_type_label ?? (val("event-type-label") || (type && type.label) || ""),
      category: p.category ?? (val("event-type-label") || (type && type.label) || ""),
      event_accent_color: p.event_accent_color ?? (val("event-accent") || (type && type.accent_color) || ""),
      event_image_url: p.event_image_url ?? (val("event-image-url") || (type && type.image_url) || ""),
      event_image_path: p.event_image_path ?? val("event-image-path"),
      location_key: p.location_key ?? (val("event-location-key") || keyify(val("event-location-name") || val("event-address"))),
      location_label: p.location_label ?? (val("event-location-name") || (loc && loc.label) || ""),
      location_name: p.location_name ?? (val("event-location-name") || (loc && loc.location_name) || ""),
      location_address: p.location_address ?? (val("event-address") || (loc && loc.location_address) || ""),
      map_query: p.map_query ?? (val("event-map-query") || val("event-address") || ""),
      map_embed_url: p.map_embed_url ?? val("event-map-embed"),
      summary: p.summary ?? val("event-summary"),
      description: p.description ?? val("event-description"),
      rsvp_enabled: p.rsvp_enabled ?? checked("event-rsvp-enabled"),
      rsvp_audience: p.rsvp_audience ?? val("event-rsvp-audience"),
      rsvp_deadline_at: p.rsvp_deadline_at ?? (checked("event-no-rsvp-close") ? null : combineDateTime("event-deadline", {})),
      capacity: p.capacity ?? (val("event-capacity") === "" ? null : Number(val("event-capacity"))),
      allow_guests: p.allow_guests ?? checked("event-allow-guests"),
      max_guests_per_rsvp: p.max_guests_per_rsvp ?? Number(val("event-max-guests") || 0),
      rsvp_capacity_behavior: p.rsvp_capacity_behavior ?? val("event-capacity-behavior"),
      waitlist_enabled: p.waitlist_enabled ?? (val("event-capacity-behavior") === "waitlist"),
      attendee_list_visibility: p.attendee_list_visibility ?? (checked("event-show-attendees") ? "members" : "admin"),
      show_attendee_list: p.show_attendee_list ?? checked("event-show-attendees"),
      allowed_membership_class_keys: p.allowed_membership_class_keys ?? (val("event-rsvp-audience") === "selected_classes" ? checkedValues("class-key") : []),
      allowed_role_keys: p.allowed_role_keys ?? (val("event-rsvp-audience") === "selected_roles" ? checkedValues("role-key") : []),
      featured: p.featured ?? checked("event-featured"),
      sort_order: p.sort_order ?? Number((selectedEvent() && selectedEvent().sort_order) || 100),
      needed_items: p.event_needed_items ?? selectedNeedsPayload(),
    };
  }

  function captureFormDraft(payload) {
    if (!state.creating && !state.selectedId) return;
    try { state.formDraft = currentFormToEvent(payload); } catch (_) { /* keep current draft if capture fails */ }
  }

  function activeEventForForm() {
    if (state.formDraft && (state.creating || state.dirty)) return state.formDraft;
    if (state.creating) return defaultNewEvent();
    return selectedEvent();
  }

  function css() {
    const c = styleConfig();
    return `<style>
      .syncetc-events-page{max-width:${c.width};margin:28px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:${c.text}}
      .syncetc-events-page *{box-sizing:border-box}.events-shell{border:1px solid ${c.border};border-radius:26px;background:#fff;box-shadow:${c.shadow};overflow:hidden}.events-hero{padding:28px 32px;background:linear-gradient(135deg,${c.primary},color-mix(in srgb,${c.primary} 70%,#4b9bd4));color:#fff}.events-hero h1{margin:10px 0 0;font-size:clamp(32px,4vw,48px);line-height:1}.events-hero p{margin:10px 0 0;max-width:760px}.events-badge{display:inline-flex;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
      .events-main{display:grid;grid-template-columns:330px minmax(0,1fr);background:linear-gradient(180deg,${c.soft},rgba(255,255,255,.96));min-height:640px}.events-sidebar{padding:16px;border-right:1px solid ${c.border};background:#fff;overflow:visible}.events-editor{padding:18px;overflow:visible;min-width:0}.events-list{display:grid;gap:8px;padding-right:3px;max-height:315px;overflow-y:auto;overscroll-behavior:contain}.events-sidebar-head{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-bottom:12px}.events-side-buttons{display:flex;gap:8px;flex-wrap:wrap}.events-filters{display:grid;gap:8px;margin-bottom:12px;padding:12px;border:1px solid ${c.border};border-radius:18px;background:${c.soft}}
      .events-control-panel{display:grid;gap:10px;margin:0 0 12px;padding:14px;border:1px solid ${c.border};border-radius:20px;background:linear-gradient(180deg,#fff,${c.soft})}.events-control-title{display:grid;gap:5px}.events-control-title strong{font-size:17px}.events-control-actions{display:flex;gap:8px;flex-wrap:wrap}.events-control-panel .events-btn{width:100%}.events-control-panel .events-status{justify-content:center}.events-status{display:inline-flex;padding:9px 12px;border-radius:14px;background:${c.soft};font-weight:900}.events-status.good{background:#e7f6e7;color:${c.primary}}.event-status-message.error{color:#991b1b;font-weight:900}.event-status-message.warn{color:#713f12;font-weight:900}.event-status-message.good{color:${c.primary};font-weight:900}.events-draft-notice{padding:10px 12px;border:1px solid #facc15;border-radius:14px;background:#fffbeb;color:#713f12;font-size:12.5px;font-weight:800;line-height:1.35}.events-draft-actions{display:flex;gap:8px;margin-top:9px}.events-draft-actions .events-btn{width:auto;padding:8px 11px;font-size:12px}
      .event-record{display:block;width:100%;text-align:left;border:1px solid ${c.border};border-left:6px solid var(--event-accent,${c.primary});background:#fff;border-radius:16px;padding:12px;cursor:pointer;color:${c.text}}.event-record[hidden]{display:none}.event-record.selected{border-color:${c.primary};border-left-color:var(--event-accent,${c.primary});box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 13%,transparent)}.event-record.archived{opacity:.55}.event-record b{display:block}.event-record span,.event-record small{display:block;color:rgba(20,36,23,.70);font-size:12px;margin-top:4px}
      .events-card{background:#fff;border:1px solid ${c.border};border-radius:20px;padding:18px;margin-bottom:16px}.events-card h2,.events-card h3{margin:0 0 12px}.events-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.events-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.events-field{display:grid;gap:5px;font-size:12px;font-weight:900;color:${c.primary}}.events-label-line{display:flex;align-items:center;gap:6px}.events-input,.events-select,.events-textarea{width:100%;border:1px solid ${c.border};border-radius:12px;padding:10px 12px;font:inherit;color:${c.text};background:#fff}.events-input[readonly],.events-input:disabled,.events-select:disabled{background:#f3f7f3;color:rgba(20,36,23,.58);cursor:not-allowed}.events-textarea{min-height:88px;resize:vertical}.events-btn{border:1px solid ${c.border};border-radius:999px;background:#fff;color:${c.primary};padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}.events-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.08)}.events-btn.primary{background:${c.primary};color:#fff}.events-btn.danger{background:#fff7ec;color:#9a3412;border-color:#fed7aa}.events-btn:disabled{opacity:.55;cursor:not-allowed}
      .events-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px}.events-check,.events-inline-check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:${c.text}}.events-check input,.events-inline-check input{width:auto}.events-error{padding:12px;border-radius:14px;background:#fee2e2;color:#991b1b;font-weight:900}.events-empty{padding:18px;border:1px dashed ${c.border};border-radius:16px;color:rgba(20,36,23,.65);background:#fff}.events-empty.big{padding:34px;text-align:center}.events-color-row{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;align-items:end}.events-color-picker{width:44px;height:42px;border:1px solid ${c.border};border-radius:12px;padding:3px;background:#fff;cursor:pointer}.events-muted{color:rgba(20,36,23,.62);font-size:12.5px;line-height:1.4}.events-topline{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.events-time-block{display:grid;gap:8px;margin-top:10px}.events-time-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:900;color:${c.primary};font-size:12px;text-transform:uppercase;letter-spacing:.03em}.events-time-flag{text-transform:none;letter-spacing:0;font-size:13px;color:${c.text}}.events-time-grid{display:grid;grid-template-columns:minmax(160px,1.4fr) 88px 98px 98px;gap:10px}.events-timing-flags{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 14px}.events-map-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.events-map-preview{margin-top:12px;border:1px solid ${c.border};border-radius:16px;overflow:hidden;background:${c.soft};min-height:170px;display:grid;place-items:center}.events-map-preview iframe{width:100%;height:220px;border:0;display:block}.events-map-preview .events-muted{padding:18px;text-align:center}.events-reuse-box{margin-top:12px;padding:12px;border:1px dashed ${c.border};border-radius:14px;background:#fbfdfb}.events-reuse-box[hidden]{display:none!important}.events-featured-check{align-self:end;min-height:42px}.events-image-widget{display:grid;gap:10px}.events-image-drop{display:grid;grid-template-columns:128px minmax(0,1fr);gap:12px;align-items:center;padding:12px;border:1px dashed ${c.border};border-radius:16px;background:#fbfdfb;cursor:pointer}.events-image-drop:hover,.events-image-drop.dragover{border-color:${c.primary};box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 12%,transparent)}.events-image-preview{width:128px;height:86px;border-radius:12px;background:${c.soft};border:1px solid ${c.border};overflow:hidden;display:grid;place-items:center;contain:paint}.events-image-preview img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:block}.events-image-empty{font-size:12px;font-weight:900;color:rgba(20,36,23,.55);text-align:center;padding:8px}.events-image-drop b{display:block;color:${c.primary};font-size:14px}.events-image-drop span{display:block;font-size:13px;color:${c.text};margin-top:2px}.events-image-drop small{display:block;font-size:12px;color:rgba(20,36,23,.62);margin-top:3px}.events-image-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.events-needed-toolbar{margin-bottom:12px}.events-needed-list{display:grid;gap:10px}.events-needed-row{display:grid;grid-template-columns:minmax(160px,1.2fr) 82px minmax(160px,1fr) auto;gap:8px;align-items:end;padding:10px;border:1px solid ${c.border};border-radius:14px;background:#fbfdfb}.events-needed-row .events-btn{padding:9px 11px}.events-list-note{padding:8px 2px}.events-details{margin-top:12px}.events-details summary{cursor:pointer;font-weight:900;color:${c.primary};margin-bottom:10px}.events-rsvp-flags{margin:0 0 14px;display:flex;gap:14px;flex-wrap:wrap}.events-rsvp-row{margin-top:12px}.events-conditional[hidden]{display:none!important}.events-advanced{border-style:dashed}.events-debug{max-width:${c.width};margin:16px auto;padding:14px;border-radius:16px;background:#0f172a;color:#dbeafe;overflow:auto;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
      .events-help{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:999px;border:1px solid ${c.border};background:#fff;color:${c.primary};font-size:11px;font-weight:900;cursor:help}.events-fixed-tip{position:fixed;max-width:min(320px,calc(100vw - 28px));padding:10px 12px;border-radius:12px;background:#102a16;color:#fff;font-size:12px;line-height:1.35;font-weight:800;box-shadow:0 12px 30px rgba(0,0,0,.22);z-index:2147483000;pointer-events:none}
      @media(max-width:900px){.events-main{grid-template-columns:1fr;min-height:0}.events-sidebar,.events-editor{max-height:none;overflow:visible}.events-list{max-height:none;overflow:visible}.events-sidebar{border-right:none;border-bottom:1px solid ${c.border}}.events-grid,.events-grid.three{grid-template-columns:1fr}.events-check-grid{grid-template-columns:1fr}.events-time-grid{grid-template-columns:1fr 1fr}.events-sidebar-head{grid-template-columns:1fr}.events-control-panel .events-btn{width:auto}.events-control-actions{justify-content:flex-start}.events-needed-row{grid-template-columns:1fr}.events-image-drop{grid-template-columns:1fr}.events-image-preview{width:100%;height:160px}}
      @media(max-width:560px){.events-time-grid{grid-template-columns:1fr}.events-hero{padding:24px 22px}.events-card{padding:14px}.events-editor{padding:14px}.events-btn{width:100%}.events-control-panel .events-btn{width:100%}.events-side-buttons{display:grid}}

      .events-compact-status{padding:8px 10px;border:1px solid ${c.border};border-radius:12px;background:#fff;font-size:12.5px;line-height:1.35}.events-compact-status.draft{border-color:#f59e0b;background:#fffbeb;color:#713f12}.events-compact-status.published{border-color:rgba(38,92,43,.25);background:#f0f9f0;color:${c.primary}}.events-compact-status.archived{border-color:#cbd5e1;background:#f8fafc;color:#475569}.events-time-inline-error{margin-top:8px;color:#991b1b;font-weight:900;font-size:13px}.events-time-inline-error[hidden]{display:none!important}
      .events-accordion{padding:0;overflow:visible;clear:both}.events-accordion summary{list-style:none}.events-accordion summary::-webkit-details-marker{display:none}.events-accordion-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;cursor:pointer;font-weight:950;color:${c.primary};border-bottom:1px solid transparent}.events-accordion-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.events-section-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:11px;line-height:1;font-weight:950;border:1px solid ${c.border};background:${c.soft};color:${c.primary}}.events-section-badge.missing{background:#fff7ed;color:#9a3412;border-color:#fed7aa}.events-section-badge.complete{background:#e7f6e7;color:${c.primary};border-color:color-mix(in srgb,${c.primary} 30%,#fff)}.events-section-badge.optional{background:#f8fafc;color:#475569}.events-accordion[open]>.events-accordion-summary{border-bottom:1px solid ${c.border};background:linear-gradient(180deg,#fff,${c.soft})}.events-accordion-cue{font-size:15px;transition:transform .15s ease}.events-accordion[open] .events-accordion-cue{transform:rotate(180deg)}.events-accordion-body{padding:18px}.events-accordion-body>.events-muted:last-child{margin-bottom:0}.events-section-nav{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid ${c.border};margin-top:18px;padding-top:14px;clear:both;position:static;z-index:1}.events-section-nav .events-btn{min-width:120px}.events-section-nav .events-btn.next{margin-left:auto}.events-final-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid ${c.border};padding-top:14px;clear:both;position:static;z-index:1}.events-final-actions .events-muted{margin-right:auto}.events-final-actions .events-btn{min-width:140px}.events-final-actions .events-btn:hover,.events-section-nav .events-btn:hover{transform:none}
    </style>`;
  }

  function typeOptions(ev) {
    const current = clean(ev.event_type_key || obj(ev.event_type_json).type_key);
    return `<option value="">Select event type...</option>` + state.eventTypes.map(t => `<option value="${attr(t.type_key)}" ${clean(t.type_key) === current ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  }

  function locationOptions(ev) {
    const current = clean(ev.location_key || obj(ev.location_json).location_key);
    return `<option value="">Select saved location or enter custom below</option>` + state.locations.map(l => `<option value="${attr(l.location_key)}" ${clean(l.location_key) === current ? "selected" : ""}>${esc(l.label || l.location_name)}</option>`).join("");
  }

  function checkboxList(name, rows, keyFn, labelFn, selected) {
    const set = new Set(arr(selected).map(clean));
    if (!rows.length) return `<div class="events-muted">No options configured yet.</div>`;
    return rows.map(row => {
      const key = keyFn(row);
      return `<label class="events-check"><input type="checkbox" name="${attr(name)}" value="${attr(key)}" ${set.has(key) ? "checked" : ""}> ${esc(labelFn(row))}</label>`;
    }).join("");
  }

  function eventStatus(ev) { const status = clean(ev.status || "draft"); return status === "archived" || ev.archived_at ? "archived" : (status === "hidden" ? "draft" : status); }
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
      const searchable = [ev.title, ev.event_key, ev.event_type_label, ev.category, ev.location_name, ev.location_address, ev.map_query, ev.summary, ev.description, dateSearchTokens(ev.starts_at), dateSearchTokens(ev.ends_at)].map(clean).join(" ").toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (statusFilter === "active" && status === "archived") return false;
      if (!["", "all", "active"].includes(statusFilter) && status !== statusFilter) return false;
      if (typeFilter && type !== typeFilter) return false;
      if (dateFilter !== "all" && eventDateClass(ev) !== dateFilter) return false;
      return true;
    }).sort((a, b) => {
      const ad = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      return (Number.isFinite(ad) ? ad : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bd) ? bd : Number.MAX_SAFE_INTEGER);
    });
  }

  function filterOptions() {
    const typeSet = new Map();
    state.events.forEach(ev => {
      const key = clean(ev.event_type_key || obj(ev.event_type_json).type_key || ev.event_type_label || ev.category);
      const label = clean(ev.event_type_label || ev.category || obj(ev.event_type_json).label || key);
      if (key) typeSet.set(key, label || key);
    });
    return `<div class="events-filters"><label class="events-field">Search<input class="events-input events-filter" id="events-filter-search" value="${attr(state.filters.search)}" placeholder="Search title, date, type, location..."></label><div class="events-grid" style="grid-template-columns:1fr 1fr"><label class="events-field">Status<select class="events-select events-filter" id="events-filter-status"><option value="active">Active</option><option value="all">All</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label class="events-field">Dates<select class="events-select events-filter" id="events-filter-date"><option value="all">All dates</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select></label></div><label class="events-field">Event type<select class="events-select events-filter" id="events-filter-type"><option value="">All types</option>${Array.from(typeSet.entries()).map(([key, label]) => `<option value="${attr(key)}">${esc(label)}</option>`).join("")}</select></label></div>`;
  }

  function eventListHtml() {
    if (!state.events.length) return `<div class="events-empty">No events yet. Create the first event.</div>`;
    const events = filteredEvents();
    if (!events.length) return `<div class="events-empty">No events match these filters.</div>`;
    const limit = 100;
    const shown = events.slice(0, limit);
    const note = events.length > limit ? `<div class="events-muted events-list-note">Showing first ${limit} of ${events.length} matching events. Use search or filters to narrow the list.</div>` : "";
    return note + shown.map(ev => {
      const accent = clean(ev.event_accent_color || (obj(ev.event_type_json).accent_color)) || styleConfig().primary;
      const status = eventStatus(ev);
      return `<button type="button" class="event-record ${clean(ev.event_id) === clean(state.selectedId) && !state.creating ? "selected" : ""} ${status === "archived" ? "archived" : ""}" style="--event-accent:${attr(accent)}" data-event-id="${attr(ev.event_id)}"><b>${esc(ev.title || "Untitled event")}</b><span>${esc(readableDate(ev.starts_at))}</span><small>${esc(ev.event_type_label || ev.category || "General")} • ${esc(status)}</small></button>`;
    }).join("");
  }

  function sidebarControlsHtml() {
    const ev = activeEventForForm();
    const title = state.creating ? "New event" : ev && ev.event_id ? (ev.title || "Untitled event") : "No event selected";
    const canSave = !!ev;
    const currentStatus = clean(ev && ev.status) || "draft";
    const archived = !!(ev && (ev.archived_at || ev.status === "archived"));
    const normalizedStatus = archived ? "archived" : (currentStatus === "hidden" ? "draft" : currentStatus);
    const statusText = normalizedStatus === "published"
      ? "Visible according to Event Visibility."
      : normalizedStatus === "archived"
        ? "Hidden from active calendar/list views."
        : "Not visible on the public calendar.";
    const draftNotice = state.draftNotice && normalizedStatus === "draft" ? `<div class="events-draft-notice">Draft saved. This event will not appear on the public calendar until it is published.<div class="events-draft-actions"><button type="button" class="events-btn primary" id="event-publish-now">Publish now</button><button type="button" class="events-btn" id="event-keep-draft">Keep as draft</button></div></div>` : "";
    const currentStatusBadge = `<div class="events-compact-status ${attr(normalizedStatus || "draft")}"><b>Current status:</b> ${esc(normalizedStatus || "draft")}<br>${esc(statusText)}</div><input type="hidden" id="event-status" value="${attr(normalizedStatus || "draft")}">`;
    return `<div class="events-control-panel"><div class="events-control-title"><strong>${esc(title)}</strong><span class="events-dirty-flag events-status ${state.dirty ? "" : "good"}">${state.dirty ? "Unsaved changes" : "No unsaved changes"}</span><span class="event-status-message events-muted ${attr(state.statusKind || "")}">${esc(state.status || "")}</span>${currentStatusBadge}</div>${draftNotice}<div class="events-control-actions"><button type="button" class="events-btn event-save" data-save-status="draft" data-default-label="Save as Draft" ${canSave ? "" : "disabled"}>${state.saving ? "Saving..." : "Save as Draft"}</button><button type="button" class="events-btn primary event-save" data-save-status="published" data-default-label="Save & Publish" ${canSave ? "" : "disabled"}>${state.saving ? "Saving..." : "Save & Publish"}</button>${(ev && ev.event_id) ? `<button type="button" class="events-btn danger" id="event-archive">${archived ? "Restore" : "Archive"}</button>` : ""}</div></div>`;
  }

  function editorEmptyHtml() {
    return `<div class="events-empty big"><h2>Select an event or create a new one</h2><p>Use the left panel to find an existing event, or start a new draft.</p><button type="button" class="events-btn primary event-new">New Event</button></div>`;
  }

  function neededRowHtml(item, index) {
    const row = obj(item);
    const id = clean(row.event_need_id);
    return `<div class="events-needed-row" data-need-id="${attr(id)}"><label class="events-field">Item needed<input class="events-input need-label" value="${attr(row.label || "")}" placeholder="Example: Ladder, cooler, dessert"></label><label class="events-field">Qty<input class="events-input need-qty" type="number" min="1" value="${attr(row.quantity_needed || 1)}"></label><label class="events-field">Optional note<input class="events-input need-notes" value="${attr(row.notes || "")}" placeholder="Size, details, or preference"></label><button type="button" class="events-btn danger events-needed-remove">Remove</button></div>`;
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
    const noEnd = ev.no_end_time === true || !ev.ends_at;
    const rsvpAudience = clean(ev.rsvp_audience || "public");
    const showRsvpList = ev.show_attendee_list !== false && clean(ev.attendee_list_visibility || "members") !== "admin";
    const sectionStatus = (key) => sectionStatusForEvent(key, ev);
    const accordion = (section, index, total) => {
      const status = sectionStatus(section.key);
      const open = index === 0;
      const prev = index > 0 ? `<button type="button" class="events-btn events-section-step" data-section-target="${attr(index - 1)}">← Back to ${esc(sectionShortTitle(sectionDefs[index - 1].title))}</button>` : `<span></span>`;
      const next = index < total - 1 ? `<button type="button" class="events-btn primary next events-section-step" data-section-target="${attr(index + 1)}">Continue to ${esc(sectionShortTitle(sectionDefs[index + 1].title))} →</button>` : `<span></span>`;
      const nav = `<div class="events-section-nav">${prev}${next}</div>`;
      return `<details class="events-card events-accordion ${attr(section.extra || "")}" data-section-key="${attr(section.key)}" data-section-index="${attr(index)}" ${open ? "open" : ""}><summary class="events-accordion-summary"><span class="events-accordion-title"><span>${esc(section.title)}</span><span class="events-section-badge ${attr(status.kind)}" data-section-badge="${attr(section.key)}">${esc(status.label)}</span></span><span class="events-accordion-cue">▾</span></summary><div class="events-accordion-body">${section.body}${nav}</div></details>`;
    };

    const eventImageUrl = ev.event_image_url || ev.image_url || typeImageUrl(typeJson) || "";
    const eventImagePath = ev.event_image_path || obj(ev.event_image_asset_json).storage_path || typeImagePath(typeJson) || "";
    const basicsBody = `<div class="events-grid"><label class="events-field"><span class="events-label-line">Event type ${help("The reusable category/template, such as Board Meeting, BBQ, Fly-in, or Safety Seminar. If you type a new type name, you can save it for future events.")}</span><select class="events-select" id="event-type-key">${typeOptions(ev)}</select></label><label class="events-field">Event title<input class="events-input" id="event-title" value="${attr(ev.title || "")}" placeholder="Example: Fall Wash and Wax"></label><label class="events-field"><span class="events-label-line">Event visibility ${help("Who can see the event listing at all.")}</span><select class="events-select" id="event-visibility"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="admin">Admins/board only</option></select></label><label class="events-field"><span class="events-label-line">Event key ${help("Auto-generated identifier used internally and in URLs. Users should not edit this directly.")}</span><input class="events-input" id="event-key" value="${attr(keyPreview)}" placeholder="Generated automatically from title and date" readonly></label></div><div class="events-muted" style="margin-top:10px">Event type is the reusable category. Event title is the name of this particular event. If the title is blank, selecting a type will suggest a title.</div><div class="events-grid" style="margin-top:12px"><label class="events-field">Event type name<input class="events-input" id="event-type-label" value="${attr(ev.event_type_label || ev.category || typeJson.label || "")}" placeholder="Example: BBQ, Board Meeting, Wash and Wax"></label><label class="events-field">Accent color<div class="events-color-row"><input class="events-input" id="event-accent" value="${attr(accent)}"><input class="events-color-picker" id="event-color-picker" type="color" value="${attr(accent)}" title="Choose accent color"></div></label><label class="events-inline-check events-featured-check"><input type="checkbox" id="event-featured" ${ev.featured ? "checked" : ""}> Featured ${help("Marks this event for possible homepage or featured-event displays later. It does not change calendar sort order.")}</label></div><div style="margin-top:12px">${imageDropHtml("event-image", "Event image", eventImageUrl, eventImagePath, "Uses the selected event type image by default. Replace it here only for this event; check Update saved event type if this should become the reusable type image.")}</div><div class="events-reuse-box" id="event-type-reuse-box"><label class="events-inline-check"><input type="checkbox" id="event-save-type"> <span id="event-type-reuse-label"></span></label><div class="events-muted" id="event-type-reuse-help"></div></div>`;

    const timingBody = `${dateTimeControls("event-start", "Starts", ev.starts_at, { flagHtml: `<label class="events-inline-check"><input type="checkbox" id="event-all-day" ${ev.all_day_event ? "checked" : ""}> All-day event ${help("For events without a specific start time. Time selectors are disabled when this is checked.")}</label>` })}${dateTimeControls("event-end", "Ends", ev.ends_at, { optional: true, flagHtml: `<label class="events-inline-check"><input type="checkbox" id="event-no-end" ${noEnd ? "checked" : ""}> No end time ${help("Use when the event has a start time but no listed ending time. End controls are disabled when this is checked.")}</label>` })}<div class="events-time-inline-error" id="event-time-inline-error" hidden></div><label class="events-field" style="margin-top:12px">Timezone<input class="events-input" id="event-timezone" value="${attr(ev.timezone || "America/New_York")}"></label>`;

    const locationBody = `<div class="events-grid"><label class="events-field">Saved location<select class="events-select" id="event-location-key">${locationOptions(ev)}</select></label><label class="events-field">Location name<input class="events-input" id="event-location-name" value="${attr(ev.location_name || locJson.location_name || locJson.label || "")}"></label></div><label class="events-field">Written address<input class="events-input" id="event-address" value="${attr(ev.location_address || locJson.location_address || "")}" placeholder="Always enter a written address when there is a physical location"></label><div class="events-map-actions"><button type="button" class="events-btn" id="event-preview-map">Preview map from address</button></div><div class="events-map-preview" id="event-map-preview"></div><details class="events-details"><summary>Advanced map options</summary><div class="events-grid"><label class="events-field">Map search text / query<input class="events-input" id="event-map-query" value="${attr(ev.map_query || locJson.map_query || ev.location_address || "")}" placeholder="Usually the written address"></label><label class="events-field">Map embed URL optional<input class="events-input" id="event-map-embed" value="${attr(ev.map_embed_url || locJson.map_embed_url || "")}"></label></div><div class="events-muted">Use these only if the automatic map preview does not find the right place.</div></details><div class="events-reuse-box" id="event-location-reuse-box"><label class="events-inline-check"><input type="checkbox" id="event-save-location"> <span id="event-location-reuse-label"></span></label><div class="events-muted" id="event-location-reuse-help"></div></div>`;

    const contentBody = `<label class="events-field">Short summary<textarea class="events-textarea" id="event-summary" placeholder="Example: Fall wash and wax for the club fleet.">${esc(ev.summary || "")}</textarea><span class="events-muted">Short text for calendar cards or quick previews.</span></label><label class="events-field">Full description<textarea class="events-textarea" id="event-description" placeholder="Example: Come join us for our fall wash and wax. Help keep the fleet looking sharp and ready for the season.">${esc(ev.description || "")}</textarea><span class="events-muted">Longer event details for the event page or RSVP view.</span></label>`;

    const rsvpBody = `<div class="events-rsvp-flags"><label class="events-inline-check"><input type="checkbox" id="event-rsvp-enabled" ${ev.rsvp_enabled ? "checked" : ""}> RSVP enabled</label><label class="events-inline-check"><input type="checkbox" id="event-allow-guests" ${ev.allow_guests !== false ? "checked" : ""}> Allow guests</label><label class="events-inline-check"><input type="checkbox" id="event-show-attendees" ${showRsvpList ? "checked" : ""}> Show RSVP list to logged-in users ${help("Organizers/admins can always see RSVP details. When checked, logged-in users may see the attendee list. When unchecked, only admins/organizers see it.")}</label></div><div class="events-grid three"><label class="events-field">Capacity<input class="events-input" id="event-capacity" type="number" min="0" value="${attr(ev.capacity ?? "")}"></label><label class="events-field"><span class="events-label-line">Capacity behavior ${help("What happens if the event reaches capacity.")}</span><select class="events-select" id="event-capacity-behavior"><option value="waitlist">Waitlist when full</option><option value="block">Block when full</option></select></label><label class="events-field">Max guests per RSVP<input class="events-input" id="event-max-guests" type="number" min="0" value="${attr(ev.max_guests_per_rsvp ?? 0)}"></label></div><div class="events-rsvp-row"><label class="events-inline-check" style="min-height:42px"><input type="checkbox" id="event-no-rsvp-close" ${ev.rsvp_deadline_at ? "" : "checked"}> No RSVP close date ${help("Leave checked when RSVPs do not have a separate cutoff date. Uncheck to set a close date and time.")}</label></div><div class="events-rsvp-row">${dateTimeControls("event-deadline", "RSVP close", ev.rsvp_deadline_at, { optional: true })}</div><div class="events-rsvp-row"><label class="events-field"><span class="events-label-line">RSVP audience ${help("Who is allowed to submit an RSVP. To change who can see the event listing, use Event Visibility in Event Basics.")}</span><select class="events-select" id="event-rsvp-audience"><option value="public">Public</option><option value="logged_in">Logged-in users</option><option value="member">Members/users</option><option value="selected_classes">Selected classes</option><option value="selected_roles">Selected roles</option><option value="admin">Admins/board only</option></select></label></div><div class="events-grid" style="margin-top:12px"><div class="events-conditional events-class-filter" ${rsvpAudience === "selected_classes" ? "" : "hidden"}><b>Eligible membership classes</b><div class="events-check-grid">${checkboxList("class-key", state.membershipClasses, classKey, row => row.label || row.class_label || row.class_key, classKeys)}</div></div><div class="events-conditional events-role-filter" ${rsvpAudience === "selected_roles" ? "" : "hidden"}><b>Eligible roles</b><div class="events-check-grid">${checkboxList("role-key", state.roles, roleKey, row => row.label || row.role_label || row.role_key, roleKeys)}</div></div></div>`;

    const needRows = arr(ev.needed_items || ev.event_needed_items).filter(item => !item.archived_at && clean(item.status || "active") !== "archived");
    const needRowsHtml = needRows.length ? needRows.map((item, index) => neededRowHtml(item, index)).join("") : neededRowHtml({}, 0);
    const checklistBody = `<div class="events-muted" style="margin-bottom:12px">Define items needed for this event. RSVP claiming will use these in a later RSVP-page pass.</div><div class="events-needed-toolbar"><button type="button" class="events-btn" id="event-add-needed-item">Add needed item</button></div><div class="events-needed-list" id="events-needed-list">${needRowsHtml}</div>`;

    const sectionDefs = [
      { key: "basics", title: "Event basics", body: basicsBody, required: true },
      { key: "timing", title: "Timing", body: timingBody, required: true },
      { key: "location", title: "Location", body: locationBody, required: true },
      { key: "content", title: "Content", body: contentBody, required: false },
      { key: "rsvp", title: "RSVP rules", body: rsvpBody, required: false },
      { key: "checklist", title: "Checklist / bring-items", body: checklistBody, required: false },
    ];

    const finalActions = `<div class="events-card"><div class="events-final-actions"><span class="events-muted">Final save actions. Drafts remain hidden from the public calendar until published.</span><button type="button" class="events-btn event-save" data-save-status="draft" data-default-label="Save as Draft">Save as Draft</button><button type="button" class="events-btn primary event-save" data-save-status="published" data-default-label="Save & Publish">Save & Publish</button></div></div>`;
    return sectionDefs.map((section, index) => accordion(section, index, sectionDefs.length)).join("") + finalActions;
  }


  function sectionShortTitle(title) {
    return String(title || "section").replace("Future checklist / bring-items", "Checklist");
  }

  function sectionStatusForEvent(key, ev) {
    const required = new Set(["basics", "timing", "location"]);
    if (!required.has(key)) return { label: "Optional", kind: "optional" };
    let complete = false;
    if (key === "basics") complete = !!(clean(ev.title) && clean(ev.visibility_audience || ev.visibility || "public") && (clean(ev.event_type_key) || clean(ev.event_type_label) || clean(ev.category)));
    if (key === "timing") complete = !!clean(ev.starts_at);
    if (key === "location") complete = !!(clean(ev.location_key) || clean(ev.location_name) || clean(ev.location_address) || clean(ev.location_label));
    return complete ? { label: "Complete", kind: "complete" } : { label: "Missing", kind: "missing" };
  }

  function liveSectionStatus(key) {
    if (key === "basics") return (val("event-title") && val("event-visibility") && (val("event-type-key") || val("event-type-label"))) ? { label: "Complete", kind: "complete" } : { label: "Missing", kind: "missing" };
    if (key === "timing") return val("event-start-date") ? { label: "Complete", kind: "complete" } : { label: "Missing", kind: "missing" };
    if (key === "location") return (val("event-location-key") || val("event-location-name") || val("event-address")) ? { label: "Complete", kind: "complete" } : { label: "Missing", kind: "missing" };
    return { label: "Optional", kind: "optional" };
  }

  function updateSectionBadges() {
    ["basics", "timing", "location", "content", "rsvp", "checklist"].forEach(key => {
      const badge = document.querySelector(`[data-section-badge="${key}"]`);
      if (!badge) return;
      const status = liveSectionStatus(key);
      badge.textContent = status.label;
      badge.className = `events-section-badge ${status.kind}`;
    });
  }

  function openSection(targetIndexOrKey) {
    const selector = Number.isInteger(Number(targetIndexOrKey)) ? `[data-section-index="${targetIndexOrKey}"]` : `[data-section-key="${targetIndexOrKey}"]`;
    const target = document.querySelector(`.events-accordion${selector}`);
    if (!target) return;
    document.querySelectorAll(".events-accordion").forEach(section => { section.open = section === target; });
    requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function sectionForValidationMessage(message) {
    const text = clean(message).toLowerCase();
    if (text.includes("title")) return "basics";
    if (text.includes("start date") || text.includes("end date") || text.includes("time")) return "timing";
    if (text.includes("event type") || text.includes("reusable event type")) return "basics";
    if (text.includes("location")) return "location";
    return "basics";
  }

  function updateImagePreview(prefix) {
    const preview = document.getElementById(`${prefix}-preview`);
    const url = val(`${prefix}-url`);
    if (preview) preview.innerHTML = imagePreviewHtml(url);
  }

  function bindImageUploads() {
    document.querySelectorAll(".events-image-drop").forEach(zone => {
      const prefix = zone.dataset.imagePrefix || "";
      const file = document.getElementById(`${prefix}-file`);
      zone.addEventListener("click", () => file && file.click());
      zone.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); file && file.click(); } });
      zone.addEventListener("dragover", event => { event.preventDefault(); zone.classList.add("dragover"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
      zone.addEventListener("drop", event => {
        event.preventDefault(); zone.classList.remove("dragover");
        const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!dropped) return;
        uploadImageFile(dropped, prefix === "event-type-image" ? "event_type" : "event", prefix).catch(error => {
          const status = document.getElementById(`${prefix}-status`);
          if (status) status.textContent = error.message || String(error);
        });
      });
      if (file) file.addEventListener("change", () => {
        const chosen = file.files && file.files[0];
        if (!chosen) return;
        uploadImageFile(chosen, prefix === "event-type-image" ? "event_type" : "event", prefix).catch(error => {
          const status = document.getElementById(`${prefix}-status`);
          if (status) status.textContent = error.message || String(error);
        });
      });
    });
    document.querySelectorAll(".events-image-choose").forEach(btn => btn.addEventListener("click", () => {
      const file = document.getElementById(`${btn.dataset.imagePrefix}-file`);
      if (file) file.click();
    }));
    document.querySelectorAll(".events-image-clear").forEach(btn => btn.addEventListener("click", () => {
      const prefix = btn.dataset.imagePrefix || "";
      const url = document.getElementById(`${prefix}-url`);
      const path = document.getElementById(`${prefix}-path`);
      const status = document.getElementById(`${prefix}-status`);
      if (url) url.value = "";
      if (path) path.value = "";
      if (status) status.textContent = "Cleared.";
      updateImagePreview(prefix);
      setDirty(true);
      updateReuseControls();
    }));
    document.querySelectorAll(".events-image-url").forEach(input => input.addEventListener("input", () => {
      const prefix = input.id.replace(/-url$/, "");
      updateImagePreview(prefix);
      setDirty(true);
      updateReuseControls();
    }));
  }

  function bindNeededItems() {
    const list = document.getElementById("events-needed-list");
    document.getElementById("event-add-needed-item")?.addEventListener("click", () => {
      if (!list) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = neededRowHtml({}, list.querySelectorAll(".events-needed-row").length).trim();
      const row = wrap.firstElementChild;
      if (row) list.appendChild(row);
      setDirty(true);
    });
    if (list) {
      list.addEventListener("click", event => {
        const btn = event.target && event.target.closest ? event.target.closest(".events-needed-remove") : null;
        if (!btn) return;
        event.preventDefault();
        const row = btn.closest(".events-needed-row");
        if (row) row.remove();
        setDirty(true);
      });
      list.addEventListener("input", event => {
        if (event.target && event.target.closest && event.target.closest(".events-needed-row")) setDirty(true);
      });
    }
  }

  function bind() {
    document.querySelectorAll(".event-record").forEach(button => button.addEventListener("click", () => selectEvent(button.dataset.eventId || "")));
    document.getElementById("events-refresh")?.addEventListener("click", refresh);
    document.querySelectorAll(".event-new").forEach(button => button.addEventListener("click", newEvent));
    document.querySelectorAll(".event-save").forEach(button => button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); captureFormDraft(); saveEvent(button.dataset.saveStatus || ""); }));
    document.getElementById("event-archive")?.addEventListener("click", toggleArchive);
    document.getElementById("event-type-key")?.addEventListener("change", applyType);
    document.getElementById("event-location-key")?.addEventListener("change", applyLocation);
    updateReuseControls();
    document.getElementById("event-use-address-map")?.addEventListener("click", useAddressAsMapQuery);
    document.getElementById("event-preview-map")?.addEventListener("click", () => { syncMapQueryFromAddress(true); updateMapPreview(true); setDirty(true); });
    document.getElementById("event-publish-now")?.addEventListener("click", () => { const st = document.getElementById("event-status"); if (st) st.value = "published"; state.draftNotice = false; setDirty(true); saveEvent("published"); });
    document.getElementById("event-keep-draft")?.addEventListener("click", () => { state.draftNotice = false; captureFormDraft(); renderStatusOnly(); });

    guardNativeSubmit();
    bindFilters();
    bindDefaults();
    bindColorPicker();
    bindTimingControls();
    bindMapControls();
    bindTooltipControls();
    bindRsvpConditional();
    bindRsvpDeadlineControls();
    bindImageUploads();
    bindNeededItems();
    bindAccordionNavigation();
    updateSectionBadges();
    bindDraftReminderControls();
    bindEditorDirty();
    updateEventKeyPreview();
    setDirty(state.dirty);
  }

  function guardNativeSubmit() {
    const r = root();
    const forms = [];
    if (r) {
      forms.push(...Array.from(r.querySelectorAll("form")));
      const parentForm = r.closest && r.closest("form");
      if (parentForm) forms.push(parentForm);
    }
    Array.from(new Set(forms)).forEach(form => {
      if (form.dataset.syncetcEventsGuarded === "1") return;
      form.dataset.syncetcEventsGuarded = "1";
      form.addEventListener("submit", event => {
        event.preventDefault();
        event.stopPropagation();
        captureFormDraft();
        state.status = "Use Save as Draft or Save & Publish to save this event.";
        state.statusKind = "warn";
        renderStatusOnly();
      });
    });
  }


  function bindAccordionNavigation() {
    document.querySelectorAll(".events-section-step").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        captureFormDraft();
        updateSectionBadges();
        openSection(button.dataset.sectionTarget || "0");
      });
    });
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
      "event-status": ev.status === "hidden" ? "draft" : (ev.status || "draft"),
      "event-visibility": ev.visibility_audience || ev.visibility || "public",
      "event-rsvp-audience": ev.rsvp_audience || "public",
      "event-capacity-behavior": ev.rsvp_capacity_behavior || (ev.waitlist_enabled === false ? "block" : "waitlist"),
    };
    Object.entries(defaults).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
  }

  function bindRsvpConditional() {
    const audience = document.getElementById("event-rsvp-audience");
    const sync = () => {
      const value = audience ? audience.value : "";
      document.querySelectorAll(".events-class-filter").forEach(el => { el.hidden = value !== "selected_classes"; });
      document.querySelectorAll(".events-role-filter").forEach(el => { el.hidden = value !== "selected_roles"; });
    };
    audience?.addEventListener("change", sync);
    sync();
  }

  function bindDraftReminderControls() {
    // Status is now shown as a compact reminder. Save buttons set Draft/Published explicitly.
  }

  function bindEditorDirty() {
    document.querySelectorAll(".events-editor input,.events-editor select,.events-editor textarea,.events-control-panel .events-control-input").forEach(el => {
      if (el.classList.contains("events-filter")) return;
      el.addEventListener("input", () => { state.draftNotice = false; updateEventKeyPreview(); captureFormDraft(); updateSectionBadges(); updateReuseControls(); setDirty(true); });
      el.addEventListener("change", () => { state.draftNotice = false; updateEventKeyPreview(); captureFormDraft(); updateSectionBadges(); updateReuseControls(); setDirty(true); });
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

  function currentTimingInlineMessage() {
    const noEnd = checked("event-no-end");
    if (noEnd) return "";
    const startDateValue = val("event-start-date");
    const endDateValue = val("event-end-date");
    if (!startDateValue || !endDateValue) return "";
    const allDay = checked("event-all-day");
    const startsAt = combineDateTime("event-start", { allDay });
    const endsAt = combineDateTime("event-end", { allDay });
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) return "End date/time cannot be before the start date/time.";
    if (!allDay && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs === startMs) return "End time must be after the start time, or check No end time.";
    return "";
  }

  function updateTimingInlineWarning() {
    const box = document.getElementById("event-time-inline-error");
    if (!box) return;
    const message = currentTimingInlineMessage();
    box.textContent = message;
    box.hidden = !message;
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
    const syncAndWarn = () => { sync(); updateTimingInlineWarning(); };
    allDay?.addEventListener("change", syncAndWarn);
    noEnd?.addEventListener("change", syncAndWarn);
    ["event-start-date", "event-start-hour", "event-start-minute", "event-start-ampm", "event-end-date", "event-end-hour", "event-end-minute", "event-end-ampm"].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener("input", updateTimingInlineWarning);
      el?.addEventListener("change", updateTimingInlineWarning);
    });
    syncAndWarn();
  }

  function bindMapControls() {
    ["event-address", "event-map-query", "event-map-embed", "event-location-name"].forEach(id => document.getElementById(id)?.addEventListener("input", () => updateMapPreview(false)));
    updateMapPreview(false);
  }

  function syncMapQueryFromAddress(force) {
    const address = val("event-address") || val("event-location-name");
    const query = document.getElementById("event-map-query");
    if (query && address && (force || !query.value)) query.value = address;
  }

  function useAddressAsMapQuery() {
    syncMapQueryFromAddress(true);
    updateMapPreview(true);
    setDirty(true);
  }

  function updateMapPreview(force) {
    const box = document.getElementById("event-map-preview");
    if (!box) return;
    syncMapQueryFromAddress(false);
    const query = val("event-map-query") || val("event-address") || val("event-location-name");
    const src = mapPreviewUrl(query, val("event-map-embed"));
    if (!src) {
      box.innerHTML = `<div class="events-muted">Enter an address, then preview the map.</div>`;
      return;
    }
    if (!force && box.dataset.src === src) return;
    box.dataset.src = src;
    box.innerHTML = `<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${attr(src)}"></iframe>`;
  }

  function bindTooltipControls() {
    let tip = document.getElementById("syncetc-events-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "syncetc-events-tooltip";
      tip.className = "events-fixed-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    const show = el => {
      const text = el.getAttribute("data-tip") || "";
      if (!text) return;
      tip.textContent = text;
      tip.hidden = false;
      const rect = el.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 28);
      tip.style.maxWidth = `${width}px`;
      const left = Math.max(14, Math.min(window.innerWidth - width - 14, rect.left + rect.width / 2 - width / 2));
      let top = rect.top - 12;
      tip.style.left = `${left}px`;
      tip.style.top = `0px`;
      const height = tip.offsetHeight || 60;
      if (top - height < 8) top = rect.bottom + 12 + height;
      tip.style.top = `${Math.max(8, top - height)}px`;
    };
    const hide = () => { if (tip) tip.hidden = true; };
    document.querySelectorAll(".events-help").forEach(el => {
      el.addEventListener("mouseenter", () => show(el));
      el.addEventListener("focus", () => show(el));
      el.addEventListener("mouseleave", hide);
      el.addEventListener("blur", hide);
      el.addEventListener("click", event => { event.preventDefault(); tip.hidden ? show(el) : hide(); });
    });
  }

  function bindRsvpDeadlineControls() {
    const noClose = document.getElementById("event-no-rsvp-close");
    const sync = () => {
      const disabled = !!noClose?.checked;
      ["event-deadline-date", "event-deadline-hour", "event-deadline-minute", "event-deadline-ampm"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = disabled; });
    };
    noClose?.addEventListener("change", sync);
    sync();
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
    const suggested = typeDisplayName(type);
    set("event-type-label", suggested, true);
    set("event-title", suggested, true);
    set("event-accent", type.accent_color, true);
    set("event-image-url", typeImageUrl(type), true);
    set("event-image-path", typeImagePath(type), true);
    updateImagePreview("event-image");
    const picker = document.getElementById("event-color-picker"); if (picker && /^#[0-9a-f]{6}$/i.test(type.accent_color || "")) picker.value = type.accent_color;
    const vis = document.getElementById("event-visibility"); if (vis && type.default_visibility) vis.value = type.default_visibility;
    const aud = document.getElementById("event-rsvp-audience"); if (aud && type.default_rsvp_audience) aud.value = type.default_rsvp_audience;
    updateSectionBadges();
    updateEventKeyPreview();
    updateReuseControls();
    setDirty(true);
  }

  function applyLocation() {
    const loc = selectedLocation();
    if (!loc) return;
    const set = (id, value, force) => { const el = document.getElementById(id); if (el && (force || !el.value)) el.value = value || ""; };
    set("event-location-name", loc.location_name || loc.label, true);
    set("event-address", loc.location_address, true);
    set("event-map-query", loc.map_query || loc.location_address || loc.label, true);
    set("event-map-embed", loc.map_embed_url, true);
    updateMapPreview(true);
    updateSectionBadges();
    updateReuseControls();
    setDirty(true);
  }

  function updateReuseControls() {
    const typeBox = document.getElementById("event-type-reuse-box");
    const typeCheck = document.getElementById("event-save-type");
    const typeLabel = document.getElementById("event-type-reuse-label");
    const typeHelp = document.getElementById("event-type-reuse-help");
    const type = selectedType();
    const typeName = clean(val("event-type-label") || (!val("event-type-key") ? val("event-title") : ""));
    if (typeBox && typeCheck && typeLabel && typeHelp) {
      let mode = "";
      let label = "";
      let helpText = "";
      if (!typeName) {
        mode = "";
      } else if (type) {
        const nameChanged = !sameText(typeName, typeDisplayName(type));
        const changed = typeChangedFromSaved(type);
        if (nameChanged) {
          mode = "new";
          label = "Save as new reusable event type";
          helpText = "The type name changed, so this will be treated as a new reusable type instead of overwriting the selected one.";
        } else if (changed) {
          mode = "update";
          label = "Update saved event type";
          helpText = "Updates the selected reusable type color/image defaults for future events that use it.";
        }
      } else {
        mode = "new";
        label = "Save as new reusable event type";
        helpText = "Creates this event type so future events can select it from the dropdown.";
      }
      typeBox.dataset.mode = mode;
      typeLabel.textContent = label;
      typeHelp.textContent = helpText;
      typeBox.hidden = !mode;
      if (!mode) typeCheck.checked = false;
    }

    const locBox = document.getElementById("event-location-reuse-box");
    const locCheck = document.getElementById("event-save-location");
    const locLabel = document.getElementById("event-location-reuse-label");
    const locHelp = document.getElementById("event-location-reuse-help");
    const loc = selectedLocation();
    const locName = clean(val("event-location-name"));
    const locAddress = clean(val("event-address"));
    if (locBox && locCheck && locLabel && locHelp) {
      let mode = "";
      let label = "";
      let helpText = "";
      if (!locName && !locAddress) {
        mode = "";
      } else if (loc) {
        const nameChanged = locName && !sameText(locName, locationDisplayName(loc));
        const changed = locationChangedFromSaved(loc);
        if (nameChanged) {
          mode = "new";
          label = "Save as new reusable location";
          helpText = "The location name changed, so this will be saved as a new reusable location instead of overwriting the selected one.";
        } else if (changed) {
          mode = "update";
          label = "Update saved location";
          helpText = "Updates the selected reusable location address/map details for future events that use it.";
        }
      } else {
        mode = "new";
        label = "Save this as a reusable location";
        helpText = "Creates a reusable location so future events can select it from the dropdown.";
      }
      locBox.dataset.mode = mode;
      locLabel.textContent = label;
      locHelp.textContent = helpText;
      locBox.hidden = !mode;
      if (!mode) locCheck.checked = false;
    }
  }

  function selectedNeedsPayload() {
    const rows = Array.from(document.querySelectorAll(".events-needed-row"));
    if (!rows.length) return [];
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
    const typeMode = reuseMode("type");
    const locationMode = reuseMode("location");
    const typeLabelValue = val("event-type-label") || (!val("event-type-key") ? val("event-title") : "") || (type && type.label) || "";
    const locationNameValue = val("event-location-name") || (loc && loc.location_name) || "";
    const typeKeyValue = checked("event-save-type") && typeMode === "new" ? keyify(typeLabelValue) : (val("event-type-key") || keyify(typeLabelValue));
    const locationKeyValue = checked("event-save-location") && locationMode === "new" ? keyify(locationNameValue || val("event-address")) : (val("event-location-key") || keyify(locationNameValue || val("event-address")));
    const payload = {
      organization_id: state.orgId,
      event_id: state.creating ? null : (state.selectedId || null),
      title: val("event-title"),
      event_key: val("event-key"),
      status: (val("event-status") === "hidden" ? "draft" : (val("event-status") || "draft")),
      visibility_audience: val("event-visibility"),
      starts_at: combineDateTime("event-start", { allDay }),
      ends_at: noEnd ? null : combineDateTime("event-end", { allDay }),
      timezone: val("event-timezone") || "America/New_York",
      all_day_event: allDay,
      no_end_time: noEnd,
      event_type_key: typeKeyValue,
      event_type_label: typeLabelValue,
      category: typeLabelValue,
      event_accent_color: val("event-accent") || (type && type.accent_color) || "",
      event_image_url: val("event-image-url") || "",
      event_image_path: val("event-image-path"),
      event_type_image_url: checked("event-save-type") ? (val("event-image-url") || "") : typeImageUrl(type),
      event_type_image_path: checked("event-save-type") ? val("event-image-path") : typeImagePath(type),
      save_event_type: checked("event-save-type"),
      location_key: locationKeyValue,
      location_label: locationNameValue || (loc && loc.label) || "",
      location_name: locationNameValue,
      location_address: val("event-address") || (loc && loc.location_address) || "",
      map_query: val("event-map-query") || val("event-address") || "",
      map_embed_url: val("event-map-embed"),
      save_location: checked("event-save-location"),
      summary: val("event-summary"),
      description: val("event-description"),
      rsvp_enabled: checked("event-rsvp-enabled"),
      rsvp_audience: val("event-rsvp-audience"),
      rsvp_deadline_at: checked("event-no-rsvp-close") ? null : combineDateTime("event-deadline", {}),
      capacity: val("event-capacity") === "" ? null : Number(val("event-capacity")),
      allow_guests: checked("event-allow-guests"),
      max_guests_per_rsvp: Number(val("event-max-guests") || 0),
      rsvp_capacity_behavior: val("event-capacity-behavior"),
      waitlist_enabled: val("event-capacity-behavior") === "waitlist",
      attendee_list_visibility: checked("event-show-attendees") ? "members" : "admin",
      show_attendee_list: checked("event-show-attendees"),
      allowed_membership_class_keys: val("event-rsvp-audience") === "selected_classes" ? checkedValues("class-key") : [],
      allowed_role_keys: val("event-rsvp-audience") === "selected_roles" ? checkedValues("role-key") : [],
      featured: checked("event-featured"),
      sort_order: Number((selectedEvent() && selectedEvent().sort_order) || 100),
      event_needed_items: selectedNeedsPayload(),
    };
    captureFormDraft(payload);
    return payload;
  }

  function validationError(message, payload) {
    captureFormDraft(payload);
    state.lastValidationMessage = message || "";
    state.status = message;
    state.statusKind = "error";
    state.saving = false;
    setDirty(true);
    renderStatusOnly();
    updateSectionBadges();
    openSection(sectionForValidationMessage(message));
    return false;
  }

  function validatePayload(payload) {
    const startDateValue = val("event-start-date");
    const endDateValue = val("event-end-date");
    state.lastValidationSnapshot = {
      title: payload.title || "",
      allDay: !!payload.all_day_event,
      noEnd: !!payload.no_end_time,
      startDateValue,
      endDateValue,
      startsAt: payload.starts_at || "",
      endsAt: payload.ends_at || "",
      status: payload.status || "",
      typeLabel: payload.event_type_label || "",
      locationName: payload.location_name || payload.location_address || payload.location_key || "",
      selectedId: state.selectedId || "",
      creating: !!state.creating,
    };
    if (!payload.title) return "Event title is required.";
    if (!startDateValue || !payload.starts_at) return "Start date is required.";
    if (!payload.no_end_time && !endDateValue) return "Either check No end time or enter an end date.";
    if (!payload.no_end_time && payload.starts_at && payload.ends_at) {
      const startMs = new Date(payload.starts_at).getTime();
      const endMs = new Date(payload.ends_at).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) return "End date/time cannot be before the start date/time.";
      if (!payload.all_day_event && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs === startMs) return "End time must be after the start time, or check No end time.";
    }
    if (!clean(payload.event_type_key) && !clean(payload.event_type_label)) return "Event type is required.";
    if (!clean(payload.location_key) && !clean(payload.location_name) && !clean(payload.location_address)) return "Location is required.";
    if (checked("event-save-type")) {
      const selectedKey = reuseMode("type") === "new" ? "" : val("event-type-key");
      const label = val("event-type-label");
      if (!label) return "Reusable event type name is required.";
      const duplicate = state.eventTypes.find(t => clean(t.type_key) !== selectedKey && (sameText(t.label || t.type_label || t.type_key, label) || sameKey(t.type_key, label)));
      if (duplicate) return `A reusable event type named "${label}" already exists. Select it from Saved type to update it, or use a different name.`;
    }
    if (checked("event-save-location")) {
      const selectedKey = reuseMode("location") === "new" ? "" : val("event-location-key");
      const label = val("event-location-name") || val("event-address");
      if (!label) return "Reusable location name or address is required.";
      const duplicate = state.locations.find(l => clean(l.location_key) !== selectedKey && (sameText(l.label || l.location_name || l.location_key, label) || sameText(l.location_name, label) || sameKey(l.location_key, label)));
      if (duplicate) return `A reusable location named "${label}" already exists. Select it from Saved location to update it, or use a different name.`;
    }
    return "";
  }

  async function saveEvent(forcedStatus) {
    if (forcedStatus) {
      const status = document.getElementById("event-status");
      if (status) status.value = forcedStatus;
    }
    const payload = makePayload();
    const validationMessage = validatePayload(payload);
    if (validationMessage) {
      validationError(validationMessage, payload);
      return;
    }
    try {
      state.status = "Saving...";
      state.statusKind = "";
      state.saving = true;
      state.draftNotice = false;
      renderStatusOnly();
      document.querySelectorAll(".event-save").forEach(btn => { btn.textContent = "Saving..."; btn.disabled = true; });
      const result = await call("organization_save_event", payload);
      state.accessRow = result.access;
      state.events = arr(result.events);
      state.eventTypes = arr(result.event_types);
      state.locations = arr(result.locations);
      state.membershipClasses = arr(result.membership_classes);
      state.roles = arr(result.roles);
      const found = state.events.find(ev => clean(ev.event_id) === clean(payload.event_id)) || state.events.find(ev => clean(ev.event_key) === clean(payload.event_key)) || state.events.find(ev => clean(ev.title) === clean(payload.title));
      if (found) state.selectedId = "";
      state.creating = false;
      state.status = payload.status === "published" ? "Published and closed." : (payload.status === "draft" ? "Draft saved and closed." : "Saved and closed.");
      state.statusKind = payload.status === "draft" ? "warn" : "good";
      state.draftNotice = payload.status === "draft";
      state.saving = false;
      state.formDraft = null;
      state.lastValidationMessage = "";
      state.error = "";
      setShellState();
      setDirty(false);
      render();
    } catch (error) {
      captureFormDraft(payload);
      state.status = error.message || String(error);
      state.statusKind = "error";
      state.saving = false;
      renderStatusOnly();
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
      state.selectedId = "";
      state.creating = false;
      state.formDraft = null;
      state.status = archived ? "Restored and closed." : "Archived and closed.";
      state.statusKind = "good";
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
    state.formDraft = defaultNewEvent();
    state.status = "";
    state.statusKind = "";
    state.draftNotice = false;
    setDirty(false);
    render();
    setDirty(true);
    document.getElementById("event-title")?.focus();
  }

  function selectEvent(id) {
    if (state.dirty && !confirm("You have unsaved event changes. Discard them?")) return;
    state.selectedId = clean(id);
    state.creating = false;
    state.formDraft = null;
    state.status = "";
    state.statusKind = "";
    state.draftNotice = false;
    setDirty(false);
    render();
  }

  function renderStatusOnly() {
    document.querySelectorAll(".event-status-message").forEach(el => { el.textContent = state.status || ""; });
    document.querySelectorAll(".event-save").forEach(btn => { btn.textContent = state.saving ? "Saving..." : (btn.dataset.defaultLabel || "Save Changes"); btn.disabled = !!state.saving; });
    document.querySelectorAll(".event-status-message").forEach(el => { el.classList.remove("error", "warn", "good"); if (state.statusKind) el.classList.add(state.statusKind); });
  }

  function render() {
    const r = root();
    if (!r) return;
    if (!state.accessRow && state.loading) {
      r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Loading organization event tools...</p></div><div class="events-editor">Loading...</div></div></div>`;
      return;
    }
    const visibleCount = filteredEvents().length;
    r.innerHTML = `${css()}<div class="syncetc-events-page"><div class="events-shell"><div class="events-hero"><span class="events-badge">Organization Admin</span><h1>Events Manager</h1><p>Create events, reuse event types and locations, configure RSVP rules, and prepare later checklist support.</p></div>${state.error ? `<div class="events-editor" style="max-height:none"><div class="events-error">${esc(state.error)}</div></div>` : ""}<div class="events-main"><aside class="events-sidebar"><div class="events-sidebar-head"><div><b><span id="events-visible-count">${visibleCount}</span> / ${state.events.length} events</b></div><div class="events-side-buttons"><button type="button" class="events-btn primary event-new">New Event</button><button type="button" class="events-btn" id="events-refresh">Refresh</button></div></div>${sidebarControlsHtml()}${filterOptions()}<div class="events-list">${eventListHtml()}</div></aside><main class="events-editor">${formHtml()}</main></div></div>${state.debug ? `<pre class="events-debug">SyncEtc Events Manager Diagnostics ${VERSION}\nOrg: ${esc(state.accessRow && state.accessRow.organization_key || "")}\nEvents: ${state.events.length}\nTypes: ${state.eventTypes.length}\nLocations: ${state.locations.length}\nSelected: ${esc(state.selectedId || (state.creating ? "new" : "none"))}\nDirty: ${state.dirty ? "yes" : "no"}\nForm draft: ${state.formDraft ? "yes" : "no"}\nLast validation: ${esc(state.lastValidationMessage || "")}\nValidation snapshot: ${esc(JSON.stringify(state.lastValidationSnapshot || {}, null, 2))}\n\n${esc(JSON.stringify(state.last, null, 2)).slice(0, 12000)}</pre>` : ""}</div>`;
    bind();
  }

  document.addEventListener("DOMContentLoaded", () => {
    mark("boot:start", location.pathname);
    refresh();
  });
})();
