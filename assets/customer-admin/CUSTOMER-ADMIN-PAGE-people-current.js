// CUSTOMER-ADMIN-PAGE-people-current.js
// Internal Version: 2026-06-16-116-A
// Purpose: Organization Admin People / Members workbench. Supports standalone People page and embedded Organization Management module runtime.

(function () {
  "use strict";

  const VERSION = "2026-06-16-116-A";
  const ROOT_ID = "syncetc-organization-people-root";
  const ROOT_SELECTOR = "#syncetc-organization-people-root, #syncetc-organization-members-root, [data-syncetc-page='organization-people'], [data-syncetc-page='people-members']";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  const ROLE_ORDER = {
    "organization-super-admin": 10,
    "organization-admin": 20,
    "board-member": 30,
    "applicant-manager": 100,
    "asset-manager": 110,
    "content-editor": 120,
    "document-manager": 130,
    "event-manager": 140,
    "gallery-manager": 150,
    "non-member": 890,
    "limited-user": 895,
    "member": 900,
  };
  const SUPER_ADMIN_ROLES = new Set(["organization-super-admin"]);

  let supabaseClient = null;
  let externalRoot = null;
  let mountOptions = {};
  let autoStarted = false;
  let searchRestore = null;
  let token = "";
  let email = "";
  let authChecked = false;
  let allAccess = [];
  let adminAccess = null;
  let selectedOrgId = "";
  let platformAdmin = false;
  let options = { statuses: [], membership_classes: [], application_stages: [], roles: [] };
  let people = [];
  let pageConfig = null;
  let selected = null;
  let search = "";
  let filter = "all";
  let activeTab = "identity";
  let message = "";
  let messageKind = "";
  let busy = false;
  let backend = null;
  let debounceTimer = null;
  let fieldErrors = {};
  let dirty = false;

  const $ = (id) => document.getElementById(id);
  const rootElement = () => externalRoot || document.querySelector(ROOT_SELECTOR) || document.getElementById(ROOT_ID);
  const isEmbedded = () => !!mountOptions.embedded;
  const isDebug = () => mountOptions.debug === true || new URLSearchParams(location.search).get("syncetc_debug") === "1";
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function shouldWaitForSession() { try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; } catch { return false; } }
  function clearJustLoggedIn() { try { window.sessionStorage.removeItem("syncetc_just_logged_in"); } catch {} }
  const bool = (v) => v === true;
  const unique = (rows) => Array.from(new Set(arr(rows).map(key).filter(Boolean)));
  const hasPerm = (row, p) => arr(row?.permission_keys).includes(p);
  const isSuperAdminRole = (roleKey) => SUPER_ADMIN_ROLES.has(key(roleKey));
  const roleRank = (role) => ROLE_ORDER[key(role?.role_key)] ?? (200 + Number(role?.sort_order || 0));
  const sortRoles = (roles) => arr(roles).slice().sort((a,b) => roleRank(a) - roleRank(b) || clean(a.label || a.role_key).localeCompare(clean(b.label || b.role_key)));
  const canManagePeople = (row) => hasPerm(row,"people.manage_members") || hasPerm(row,"people.manage_applicants") || hasPerm(row,"access.manage_memberships") || hasPerm(row,"organization.manage_settings") || hasPerm(row,"organization.super_admin");
  const canManageSuperAdminRoles = (row) => arr(row?.role_keys).map(key).includes("organization-super-admin") || hasPerm(row,"organization.super_admin");
  const canManageSafeRoles = (row) => canManagePeople(row) || bool(obj(row?.capabilities).can_manage_access) || hasPerm(row,"access.manage_memberships");
  const isAdminRow = (row) => row?.is_organization_admin || bool(obj(row?.capabilities).can_view_organization_admin) || hasPerm(row,"organization.admin.open") || hasPerm(row,"organization.view_admin");
  const adminRows = () => allAccess.filter(isAdminRow);
  const selectedRow = () => adminAccess || adminRows().find((r) => String(r.organization_id) === selectedOrgId) || adminRows()[0] || null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (window.syncetcSupabase && window.syncetcSupabase.auth) {
      supabaseClient = window.syncetcSupabase;
      return supabaseClient;
    }
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.syncetcSupabase = supabaseClient;
    return supabaseClient;
  }

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 };
    return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, prop, fallback) { const v = obj(source)[prop]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function styleConfig(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const effects = obj(profile.effects_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors,"brand_primary","#1f4f82");
    const secondary = getText(colors,"brand_secondary","#eef3f8");
    const surface = getText(colors,"surface","#ffffff");
    const text = getText(colors,"text","#172033");
    const corners = getText(effects,"corners","soft");
    const width = getText(spacing,"page_width",getText(layout,"default_width","wide"));
    return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius: corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px", pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px" };
  }
  function cssVars(cfg) { return `--people-primary:${cfg.primary};--people-secondary:${cfg.secondary};--people-surface:${cfg.surface};--people-text:${cfg.text};--people-muted:${cfg.muted};--people-border:${cfg.border};--people-soft:${cfg.soft};--people-strong-soft:${cfg.strongSoft};--people-shadow:${cfg.shadow};--people-radius:${cfg.radius};--people-page-width:${cfg.pageWidth};`; }

  function setShellState() {
    const row = selectedRow();
    const rows = adminRows();
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: "org-admin",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      organizationId: row?.organization_id || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizationOptions: rows.map((r) => ({ organization_id: r.organization_id, organization_name: r.organization_name, organization_key: r.organization_key })),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
    });
  }

  function updateDirtyBadge() {
    const badge = $("people-dirty-badge");
    if (badge) {
      badge.textContent = dirty ? "Unsaved changes" : "Saved";
      badge.className = `people-save-state ${dirty ? "warn" : "ok"}`;
    }
    try { window.SyncEtcPortalShell?.setDirty?.(dirty, "You have unsaved People changes. Leave anyway?"); } catch {}
    try { if (typeof mountOptions.onDirtyChange === "function") mountOptions.onDirtyChange(dirty, "You have unsaved People changes. Leave anyway?"); } catch {}
  }
  function setMessage(text, kind = "") { message = clean(text || ""); messageKind = kind || ""; render(); }
  async function getStableSession() {
    const attempts = shouldWaitForSession() ? 14 : 3;
    for (let i = 0; i < attempts; i += 1) {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.access_token) { clearJustLoggedIn(); return data.session; }
      if (i < attempts - 1) await sleep(150);
    }
    clearJustLoggedIn();
    return null;
  }
  function setDirty(value = true) { dirty = Boolean(value); updateDirtyBadge(); }
  function confirmDiscard() {
    if (!dirty) return true;
    const ok = confirm("You have unsaved changes. Leave without saving?");
    if (ok) setDirty(false);
    return ok;
  }

  async function refreshAuth() {
    await ensureSupabase();
    const session = await getStableSession();
    token = session?.access_token || "";
    email = session?.user?.email || "";
    if (!token) { allAccess = []; adminAccess = null; selectedOrgId = ""; platformAdmin = false; people = []; selected = null; backend = null; }
    else { try { await loadAccess(); } catch (e) { backend = { ok:false, message:e.message || String(e) }; authChecked = true; setShellState(); setMessage(e.message || String(e), "warn"); return; } }
    authChecked = true;
    setShellState();
    render();
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function login() {
    await ensureSupabase();
    const loginEmail = clean($("people-login-email")?.value).toLowerCase();
    const password = $("people-login-password")?.value || "";
    if (!loginEmail || !password) throw new Error("Enter email and password.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: loginEmail, password });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
    token = data?.session?.access_token || "";
    email = data?.user?.email || loginEmail;
    await refreshAuth();
    setMessage("Logged in.", "ok");
  }
  async function logout() { if (!confirmDiscard()) return; setDirty(false); await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; allAccess = []; adminAccess = null; selectedOrgId = ""; people = []; selected = null; options = { statuses: [], membership_classes: [], application_stages: [], roles: [] }; authChecked = true; setShellState(); render(); }
  async function resetOwnPassword() { await ensureSupabase(); const loginEmail = clean($("people-login-email")?.value || email).toLowerCase(); if (!loginEmail) throw new Error("Enter email first."); const { error } = await supabaseClient.auth.resetPasswordForEmail(loginEmail, { redirectTo: "https://syncetc.webflow.io/password-reset" }); if (error) throw error; setMessage("Password reset email requested.", "ok"); }

  async function runButton(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { busy = true; if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { busy = false; if (btn) { btn.disabled = false; btn.textContent = old; } render(); }
  }

  async function loadAccess() {
    const res = await call("get_my_access");
    platformAdmin = Boolean(res.platform_admin);
    allAccess = res.access || [];
    if (!selectedOrgId && adminRows()[0]) selectedOrgId = String(adminRows()[0].organization_id);
    if (selectedOrgId) await loadOrgContext();
    setShellState();
  }

  async function loadOrgContext() {
    if (!selectedOrgId) return;
    const dash = await call("get_organization_admin_dashboard", { organization_id: selectedOrgId });
    adminAccess = dash.access || null;
    const vocab = await call("organization_list_access_vocabulary", { organization_id: selectedOrgId });
    options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: sortRoles(vocab.roles || []) };
    await loadPeople();
    setShellState();
  }

  async function loadPeople() {
    if (!selectedOrgId) return;
    const res = await call("organization_list_people", { organization_id: selectedOrgId, include_archived: true, filter: "all" });
    pageConfig = res.page || null;
    people = res.people || [];
    if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
  }

  async function loadSelectedPerson(personOrMembershipId) {
    if (!selectedOrgId || !personOrMembershipId) return;
    const row = people.find((p) => p.membership_id === personOrMembershipId || p.person_id === personOrMembershipId) || null;
    if (!row) return;
    const res = await call("organization_get_person", { organization_id: selectedOrgId, person_id: row.person_id, membership_id: row.membership_id });
    selected = res.person || row;
  }

  async function addPersonTimelineNote() {
    if (!selected?.person_id) throw new Error("Select a person first.");
    const note = clean($("people-timeline-note")?.value);
    if (!note) throw new Error("Enter a note first.");
    const res = await call("organization_add_person_note", { organization_id: selectedOrgId, person_id: selected.person_id, body: note, note_type: "general" });
    selected.timeline_notes = res.notes || [];
    setMessage("Note added.", "ok");
  }

  function getProfile(row = selected || {}) { return obj(row.profile_json); }
  function profileSection(section) { return obj(getProfile()[section]); }
  function profileName(row = selected || {}) { return obj(getProfile(row).name); }
  function calculatedDisplayName(firstName, preferredFirstName, middleName, lastName, suffix) {
    const first = clean(preferredFirstName) || clean(firstName);
    return [first, clean(middleName), clean(lastName), clean(suffix)].filter(Boolean).join(" ");
  }
  function finderDisplayName(row = {}) {
    const nameProfile = obj(obj(row.profile_json).name);
    const preferred = clean(row.preferred_first_name) || clean(nameProfile.preferred_first_name) || clean(nameProfile.preferred) || clean(row.first_name);
    const last = clean(row.last_name);
    if (last && preferred) return `${last}, ${preferred}`;
    if (last) return last;
    if (preferred) return preferred;
    return clean(row.display_name) || "Unnamed";
  }
  function isEndedStatus(statusKey) { return ["inactive", "former", "expelled", "archived", "blocked"].includes(key(statusKey)); }
  function todayIso() { return new Date().toISOString().slice(0,10); }
  function endReasonOptions(value) {
    const rows = [["", "No reason"], ["resigned", "Resigned"], ["expired", "Expired"], ["removed", "Removed"], ["expelled", "Expelled"], ["deceased", "Deceased"], ["duplicate-record", "Duplicate record"], ["other", "Other"]];
    return rows.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(value || "") ? "selected" : ""}>${esc(label)}</option>`).join("");
  }
  function updateAffiliationEndState(autoFill = false) {
    const statusKey = key($("people-status-key")?.value);
    const endDate = $("people-affiliation-end-date");
    const enabled = isEndedStatus(statusKey) || clean(endDate?.value);
    if (autoFill && isEndedStatus(statusKey) && endDate && !clean(endDate.value)) endDate.value = todayIso();
    ["people-affiliation-end-date", "people-affiliation-end-reason"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.disabled = !enabled;
      el.closest(".people-field")?.classList.toggle("disabled-field", !enabled);
      if (!enabled && id === "people-affiliation-end-reason") el.value = "";
    });
    const hint = $("people-affiliation-end-hint");
    if (hint) hint.textContent = enabled ? "Use when this organization affiliation has ended." : "Enabled when status is inactive, former, expelled, archived, or blocked.";
    const reasonHint = $("people-affiliation-end-reason-hint");
    if (reasonHint) reasonHint.textContent = "Use internal notes below if more detail is needed.";
  }
  function refreshDisplayNamePreview() {
    const value = calculatedDisplayName($("people-first-name")?.value, $("people-preferred-first-name")?.value, $("people-middle-name")?.value, $("people-last-name")?.value, $("people-suffix")?.value);
    const el = $("people-display-name-preview");
    if (el) el.value = value;
  }

  function optionList(items, selectedValue, keyProp, labelProp, blankLabel = "—") {
    const rows = [`<option value="">${esc(blankLabel)}</option>`];
    rows.push(...arr(items).map((item) => `<option value="${esc(item[keyProp])}" ${String(item[keyProp]) === String(selectedValue || "") ? "selected" : ""}>${esc(item[labelProp] || item[keyProp])}</option>`));
    return rows.join("");
  }

  function fieldError(id) { return fieldErrors[id] ? `<small class="field-error">${esc(fieldErrors[id])}</small>` : ""; }
  function input(id, label, value = "", type = "text", help = "", attrs = "") {
    return `<label class="people-field"><span>${esc(label)}</span><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${attrs}>${help ? `<small>${esc(help)}</small>` : ""}${fieldError(id)}</label>`;
  }
  function textarea(id, label, value = "", help = "") {
    return `<label class="people-field people-field-wide"><span>${esc(label)}</span><textarea id="${esc(id)}">${esc(value)}</textarea>${help ? `<small>${esc(help)}</small>` : ""}${fieldError(id)}</label>`;
  }
  function checkbox(id, label, checked = false, disabled = false, hint = "") {
    return `<label class="people-check ${disabled ? "disabled" : ""}"><input id="${esc(id)}" type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span></label>`;
  }
  function pill(text, cls = "") { return text ? `<span class="people-pill ${esc(cls)}">${esc(text)}</span>` : ""; }
  function linkPhone(phone) { const v = clean(phone); return v ? `<a href="tel:${esc(v.replace(/[^0-9+]/g,""))}">${esc(v)}</a>` : `<span class="muted">—</span>`; }
  function linkEmail(mail) { const v = clean(mail); return v ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : `<span class="muted">—</span>`; }
  function initialsFromName(name) { return clean(name).split(" ").filter(Boolean).slice(0,2).map((part) => part[0]).join("").toUpperCase() || "?"; }
  function photoUrl(row = selected || {}) {
    const profile = getProfile(row);
    const photo = obj(profile.photo);
    return clean(row.photo_url || profile.photo_url || profile.profile_photo_url || profile.avatar_url || photo.url || photo.public_url);
  }
  function renderPersonPhoto(row, mayEdit) {
    const url = photoUrl(row);
    const hasSavedPerson = Boolean(row.person_id && row.membership_id);
    const disabled = !mayEdit || !hasSavedPerson;
    const initials = initialsFromName(row.display_name || [row.first_name, row.last_name].filter(Boolean).join(" "));
    return `<div class="people-photo-panel people-field-wide" id="people-photo-dropzone" data-photo-disabled="${disabled ? "true" : "false"}"><div class="people-photo-preview">${url ? `<img src="${esc(url)}" alt="${esc(row.display_name || "Person photo")}">` : `<span>${esc(initials)}</span>`}</div><div class="people-photo-copy"><strong>Profile photo</strong><p>Shown to organization admins here and on the member roster when this person is roster-visible. Use JPG, PNG, or WebP under 4 MB.</p>${!hasSavedPerson ? `<small>Save the person before uploading a photo.</small>` : `<small>Drag a photo here or choose a file.</small>`}<div class="people-photo-actions"><button id="people-photo-choose" class="people-btn secondary" type="button" ${disabled ? "disabled" : ""}>Choose photo</button>${url ? `<button id="people-photo-remove" class="people-btn danger" type="button" ${disabled ? "disabled" : ""}>Remove photo</button>` : ""}<input id="people-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div></div>`;
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected photo."));
      reader.readAsDataURL(file);
    });
  }
  async function uploadSelectedPhoto(file) {
    if (!selected?.person_id || !selected?.membership_id) throw new Error("Save the person before uploading a photo.");
    if (!file) throw new Error("Choose a photo first.");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) throw new Error("Photo must be a JPG, PNG, or WebP image.");
    if (file.size > 4 * 1024 * 1024) throw new Error("Photo is too large. Use an image under 4 MB.");
    setMessage("Uploading photo…", "");
    const dataUrl = await readFileAsDataUrl(file);
    const res = await call("organization_upload_person_photo", { organization_id: selectedOrgId, person_id: selected.person_id, membership_id: selected.membership_id, file_name: file.name, content_type: file.type, data_url: dataUrl });
    await loadPeople();
    selected = people.find((p) => p.membership_id === (res.person?.membership_id || selected.membership_id)) || res.person || selected;
    setDirty(false);
    setMessage("Photo updated.", "ok");
  }
  async function removeSelectedPhoto() {
    if (!selected?.person_id || !selected?.membership_id) throw new Error("Select a saved person first.");
    if (!confirm("Remove this person's profile photo?")) return;
    const res = await call("organization_remove_person_photo", { organization_id: selectedOrgId, person_id: selected.person_id, membership_id: selected.membership_id });
    await loadPeople();
    selected = people.find((p) => p.membership_id === (res.person?.membership_id || selected.membership_id)) || res.person || selected;
    setDirty(false);
    setMessage("Photo removed.", "ok");
  }

  function sortPersonRows(rows) {
    return arr(rows).slice().sort((a, b) => {
      const aArchived = isArchivedRow(a) ? 1 : 0;
      const bArchived = isArchivedRow(b) ? 1 : 0;
      if (aArchived !== bArchived) return aArchived - bArchived;
      const aLast = clean(a.last_name || (clean(a.display_name).split(" ").slice(-1)[0]));
      const bLast = clean(b.last_name || (clean(b.display_name).split(" ").slice(-1)[0]));
      const aFirst = clean(a.first_name || clean(a.display_name).split(" ")[0]);
      const bFirst = clean(b.first_name || clean(b.display_name).split(" ")[0]);
      return aLast.localeCompare(bLast) || aFirst.localeCompare(bFirst) || clean(a.display_name).localeCompare(clean(b.display_name)) || clean(a.primary_email || a.email).localeCompare(clean(b.primary_email || b.email));
    });
  }

  function isArchivedRow(p) {
    const status = key(p.lifecycle_status_key);
    const lifecycle = key(p.lifecycle_category);
    return !!(p.membership_archived_at || p.person_archived_at || status === "archived" || lifecycle === "archived");
  }
  function isRestrictedRow(p) {
    const status = key(p.lifecycle_status_key);
    const lifecycle = key(p.lifecycle_category);
    return !!(p.blocks_access || ["suspended","expelled","blocked"].includes(status) || ["suspended","expelled","blocked"].includes(lifecycle));
  }
  function hasRole(p, roleKey) { return arr(p.role_keys).map(key).includes(roleKey); }
  function hasAnyRole(p, keys) { const set = new Set(arr(p.role_keys).map(key)); return keys.some((k) => set.has(k)); }
  function isManagerRole(roleKey) { return ["applicant-manager","asset-manager","content-editor","document-manager","event-manager","gallery-manager"].includes(key(roleKey)); }
  function isPlatformInternal(p) { return bool(p.is_platform_internal) || key(p.title).startsWith("platform-admin"); }

  const PEOPLE_FILTERS = [
    ["all","All"],["active","Active"],["applicants","Applicants"],["waitlist","Waitlist"],["onboarding","Onboarding"],["former","Former"],["restricted","Suspended / Expelled"],["admins","Admins"],["board","Board"],["managers","Managers"],["users","Members / Users"],["non-member","Non-member users"],["no-login","No Login"],["archived","Archived"]
  ];

  function rowMatchesFilter(p, filterKey) {
    const f = filterKey || "all";
    if (isPlatformInternal(p) && f !== "platform-internal") return false;
    const status = key(p.lifecycle_status_key);
    const stage = key(p.application_stage_key);
    const stageCat = key(p.application_stage_category);
    const lifecycle = key(p.lifecycle_category);
    const classKey = key(p.membership_class_key);
    const classCat = key(p.membership_class_category);
    const archived = isArchivedRow(p);
    const restricted = isRestrictedRow(p);
    if (f === "all") return true;
    if (f === "archived") return archived;
    if (archived) return false;
    if (f === "active") return status === "active";
    if (f === "applicants") return ["applicant","invited","pending"].includes(status) || ["applicant","prospect"].includes(stageCat);
    if (f === "waitlist") return stage === "waitlist";
    if (f === "onboarding") return stage === "onboarding" || stageCat === "onboarding" || ["invited","pending"].includes(status);
    if (f === "former") return ["former","inactive"].includes(status) || ["former","inactive"].includes(lifecycle);
    if (f === "restricted") return restricted;
    if (f === "admins") return hasAnyRole(p, ["organization-super-admin", "organization-admin"]);
    if (f === "board") return hasRole(p, "board-member");
    if (f === "managers") return arr(p.role_keys).some(isManagerRole);
    if (f === "users") return hasRole(p, "member") && !hasAnyRole(p, ["organization-super-admin", "organization-admin"]);
    if (f === "non-member") return classKey === "non-member" || classCat === "non-member" || classCat === "non_member";
    if (f === "no-login") return !bool(p.login_linked);
    if (f === "platform-internal") return isPlatformInternal(p);
    return true;
  }

  function rowMatchesSearch(p, term) {
    const s = lower(term);
    if (!s) return true;
    const hay = [p.display_name,p.first_name,p.last_name,p.primary_email,p.email,p.phone,p.primary_phone,p.member_number,p.title,p.lifecycle_status_label,p.lifecycle_status_key,p.membership_class_label,p.membership_class_key,p.application_stage_label,p.application_stage_key,...arr(p.role_labels),...arr(p.role_keys),...arr(p.login_emails)].map(clean).join(" ").toLowerCase();
    return hay.includes(s);
  }

  function filteredPeople(filterKey = filter, term = search) {
    return sortPersonRows(people.filter((p) => rowMatchesFilter(p, filterKey) && rowMatchesSearch(p, term)));
  }

  function counts() {
    const out = {};
    PEOPLE_FILTERS.forEach(([f]) => { out[f] = people.filter((p) => rowMatchesFilter(p, f)).length; });
    return out;
  }

  function renderLogin() {
    if (token) return "";
    return `<div id="syncetc-page-login" class="people-login"><input id="people-login-email" type="email" placeholder="Email"><input id="people-login-password" type="password" placeholder="Password"><button id="people-login" class="people-btn">Log in</button><button id="people-reset-own" class="people-link-btn" type="button">Forgot password?</button></div>`;
  }

  function renderOrgSelector() {
    if (isEmbedded()) return "";
    const rows = adminRows();
    if (!rows.length) return "";
    if (rows.length === 1) return `<div class="people-context-single">${esc(rows[0].organization_name)} <span>${esc(rows[0].organization_key)}</span></div>`;
    return `<label class="people-org-selector"><span>Organization</span><select id="people-org-select">${rows.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select></label>`;
  }

  function filterOptionsHtml() {
    const c = counts();
    return PEOPLE_FILTERS.map(([f,label]) => `<option value="${esc(f)}" ${filter === f ? "selected" : ""}>${esc(label)} (${c[f] || 0})</option>`).join("");
  }

  function renderWorkbenchHeader() {
    return `<section class="people-module-header">
      <div>
        <span class="people-kicker">People</span>
        <h2>Members / People</h2>
        <p>Manage people, membership lifecycle, contact information, access roles, and internal notes from one workbench.</p>
      </div>
      <div class="people-module-actions">
        ${renderOrgSelector()}
        <button id="people-refresh" class="people-btn secondary" type="button">Refresh</button>
        <button id="people-export" class="people-btn secondary" type="button">Export</button>
        <button id="people-print" class="people-btn secondary" type="button">Print</button>
        <button id="people-new" class="people-btn outline" type="button">New person</button>
      </div>
    </section>`;
  }

  function renderFinderPanel() {
    const rows = filteredPeople();
    return `<aside class="people-list-panel">
      <div class="people-list-tools">
        <label class="people-field"><span>Status / view</span><select id="people-filter-select">${filterOptionsHtml()}</select></label>
        <div class="people-search-wrap"><input id="people-search" value="${esc(search)}" placeholder="Search names, emails, phones, roles…" autocomplete="off"><button id="people-clear-search" class="people-icon-btn" title="Clear search" type="button">×</button></div>
        <small class="people-sort-hint">Sorted by last name. Archived records stay muted and move to the bottom of All.</small>
      </div>
      <div class="people-compact-list">${rows.length ? rows.map(renderPersonCard).join("") : `<div class="people-empty-row">No people match this search.</div>`}</div>
    </aside>`;
  }

  function renderPersonCard(p) {
    const selectedClass = selected?.membership_id === p.membership_id ? "selected" : "";
    const archived = isArchivedRow(p);
    const restricted = isRestrictedRow(p);
    const classes = [selectedClass, archived ? "archived" : "", restricted ? "restricted" : ""].filter(Boolean).join(" ");
    const status = clean(p.lifecycle_status_label || p.lifecycle_status_key);
    const klass = clean(p.membership_class_label || p.membership_class_key);
    const login = p.login_linked ? "Login" : "No login";
    const roles = arr(p.role_labels).slice(0, 2).join(", ");
    const emailOrPhone = clean(p.primary_email || p.email || p.primary_phone || p.phone);
    return `<button class="people-person-card ${classes}" data-open="${esc(p.membership_id)}" type="button">
      <span class="person-main"><strong>${esc(finderDisplayName(p))}</strong><small>${esc(emailOrPhone || "No contact on file")}</small></span>
      <span class="person-badges">${pill(status, restricted ? "warn" : archived ? "muted" : "")}${klass ? pill(klass) : ""}${roles ? pill(roles) : ""}${pill(login, p.login_linked ? "ok" : "warn")}</span>
    </button>`;
  }

  function renderPersonTimeline(row) {
    const notes = Array.isArray(row.timeline_notes) ? row.timeline_notes : [];
    return `<div class="people-timeline-box"><div class="people-form-grid one"><label class="people-field wide"><span>Add admin note</span><textarea id="people-timeline-note" placeholder="Add a dated admin note for this person. These notes are not visible to the person."></textarea><small>Notes added here can carry forward from applicant history and continue through the person/member lifecycle.</small></label></div><div class="people-inline-actions"><button id="people-add-timeline-note" class="people-btn secondary" type="button">Add note</button></div><div class="people-timeline-list">${notes.length ? notes.map((n) => `<div class="people-note-card"><strong>${esc((n.application_id && !String(n.title||'').toLowerCase().includes('applicant')) ? `Applicant history — ${n.title || n.note_type || 'Note'}` : (n.title || n.note_type || "Note"))}</strong><span>${esc(new Date(n.created_at || Date.now()).toLocaleString())}</span><p>${esc(n.body || "")}</p><small>${esc(n.actor_name || n.actor_email || "System")}${n.application_id ? ' • Applicant-origin history' : ''}</small></div>`).join("") : `<div class="muted">No admin timeline notes yet.</div>`}</div></div>`;
  }

  const PEOPLE_TABS = [
    ["identity", "Identity"],
    ["membership", "Membership"],
    ["contact", "Contact"],
    ["access", "Access & Roles"],
    ["aviation", "Aviation / Qualifications"],
    ["notes", "Notes / Timeline"]
  ];

  function renderTabButtons() {
    return `<div class="people-tabs" role="tablist">${PEOPLE_TABS.map(([tab,label]) => `<button type="button" class="people-tab ${activeTab === tab ? "active" : ""}" data-tab="${esc(tab)}" role="tab" aria-selected="${activeTab === tab ? "true" : "false"}">${esc(label)}</button>`).join("")}</div>`;
  }

  function renderTabPanel(tab, html) {
    return `<section class="people-tab-panel ${activeTab === tab ? "active" : ""}" data-tab-panel="${esc(tab)}" ${activeTab === tab ? "" : "hidden"}>${html}</section>`;
  }

  function renderIdentityTab(row, context) {
    const { mayEdit, preferred, middle, suffix, displayPreview } = context;
    return renderTabPanel("identity", `<div class="people-form-grid">${renderPersonPhoto(row, mayEdit)}${input("people-first-name","Legal first name",row.first_name)}${input("people-preferred-first-name","Preferred first name (optional)",preferred)}${input("people-middle-name","Middle name / initial (optional)",middle)}${input("people-last-name","Last name",row.last_name)}${input("people-suffix","Suffix (optional)",suffix)}${input("people-display-name-preview","Display name",displayPreview,"text","Calculated from preferred/legal first name and last name.","readonly")}${input("people-primary-email","Primary email",row.primary_email,"email","Used for login/contact when linked to an auth account.","inputmode=\"email\" autocomplete=\"email\"")}${input("people-member-number","Member / account number (optional)",row.member_number)}${input("people-title","Title / position (optional)",row.title)}</div>`);
  }

  function renderMembershipTab(row, context) {
    const { settings, endFieldsDisabled } = context;
    return renderTabPanel("membership", `<div class="people-form-grid people-access-status-grid"><label class="people-field"><span>Lifecycle status</span><select id="people-status-key">${optionList(options.statuses,row.lifecycle_status_key,"status_key","label","Select status")}</select><small>Status is the broad safety gate.</small></label><label class="people-field"><span>Membership class</span><select id="people-class-key">${optionList(options.membership_classes,row.membership_class_key,"class_key","label","No class")}</select><small>Class controls business rules like dues/privileges.</small></label><label class="people-field"><span>Application / onboarding stage</span><select id="people-stage-key">${optionList(options.application_stages,row.application_stage_key,"stage_key","label","No stage")}</select><small>Stage tracks applicants and onboarding.</small></label></div><div class="people-form-grid people-affiliation-grid">${input("people-joined-at","Affiliation start date (optional)",String(row.joined_at || "").slice(0,10),"date")}<label class="people-field ${endFieldsDisabled ? "disabled-field" : ""}"><span>Affiliation end date (optional)</span><input id="people-affiliation-end-date" type="date" value="${esc(String(row.left_at || "").slice(0,10))}" ${endFieldsDisabled ? "disabled" : ""}><small id="people-affiliation-end-hint">${endFieldsDisabled ? "Enabled when status is inactive, former, expelled, archived, or blocked." : "Use when this organization affiliation has ended."}</small></label><label class="people-field ${endFieldsDisabled ? "disabled-field" : ""}"><span>End reason (optional)</span><select id="people-affiliation-end-reason" ${endFieldsDisabled ? "disabled" : ""}>${endReasonOptions(settings.end_reason)}</select><small id="people-affiliation-end-reason-hint">Use internal notes if more detail is needed.</small></label></div>`);
  }

  function renderContactTab(row, context) {
    const { contact, emergency, primaryType } = context;
    return renderTabPanel("contact", `<p class="muted">Choose one primary phone. This avoids duplicating the same number in multiple places.</p><div class="phone-grid"><label class="primary-pick"><input name="primary-phone-type" type="radio" value="mobile" ${primaryType === "mobile" || primaryType === "primary" ? "checked" : ""}> Primary</label>${input("people-mobile-phone","Mobile phone (optional)",contact.mobile_phone || row.primary_phone || row.phone,"tel","","inputmode=\"tel\"")}<label class="primary-pick"><input name="primary-phone-type" type="radio" value="home" ${primaryType === "home" ? "checked" : ""}> Primary</label>${input("people-home-phone","Home phone (optional)",contact.home_phone,"tel","","inputmode=\"tel\"")}<label class="primary-pick"><input name="primary-phone-type" type="radio" value="work" ${primaryType === "work" ? "checked" : ""}> Primary</label>${input("people-work-phone","Work phone (optional)",contact.work_phone,"tel","","inputmode=\"tel\"")}</div><div class="people-form-grid">${input("people-alt-email","Alternate email (optional)",contact.alternate_email,"email","","inputmode=\"email\"")}${input("people-address","Street address (optional)",contact.address)}${input("people-city","City (optional)",contact.city)}${input("people-state","State (optional)",contact.state)}${input("people-zip","ZIP (optional)",contact.zip)}${input("people-emergency-name","Emergency contact (optional)",emergency.name)}${input("people-emergency-phone","Emergency phone (optional)",emergency.phone,"tel","","inputmode=\"tel\"")}${input("people-emergency-relation","Emergency relation (optional)",emergency.relation)}</div>`);
  }

  function renderAccessTab(row, context) {
    const { roles, mayEdit, mayEditAnyRole, mayEditSuperAdmin } = context;
    const savedPerson = Boolean(row.person_id && row.membership_id);
    return renderTabPanel("access", `<div class="people-access-actions"><div><strong>${row.login_linked ? "Login linked" : "No login linked yet"}</strong><p class="muted">Invite and password reset actions use the current primary email/login link where available.</p></div><div class="people-inline-actions"><button id="people-invite" class="people-btn secondary" ${mayEdit && savedPerson ? "" : "disabled"} type="button">Send invite</button><button id="people-reset-password" class="people-btn secondary" ${mayEdit && savedPerson ? "" : "disabled"} type="button">Password reset</button></div></div><p class="muted">Roles control what this person can do. Organization Super Admin remains protected.</p><div class="people-check-grid">${roles.map((role) => { const rk = key(role.role_key); const locked = !mayEditAnyRole || (isSuperAdminRole(rk) && !mayEditSuperAdmin); const hint = locked && isSuperAdminRole(rk) ? "Super Admin locked" : ""; return checkbox(`role-${rk}`, role.label || rk, arr(row.role_keys).map(key).includes(rk), locked, hint); }).join("")}</div>${!mayEditAnyRole ? `<p class="people-warning">Role editing is locked for your account.</p>` : !mayEditSuperAdmin ? `<p class="people-warning">Organization Super Admin is locked. You can manage ordinary roles and Organization Admin.</p>` : ""}`);
  }

  function renderAviationTab(row, context) {
    const { aviation, background, applicant } = context;
    return renderTabPanel("aviation", `<div class="people-check-grid">${checkbox("people-club-cfi","CFI / instructor",aviation.club_cfi)}${checkbox("people-maintenance","Maintenance crew",aviation.on_maintenance_crew)}${checkbox("people-ifr-rated","IFR rated",aviation.ifr_rated)}${checkbox("people-night-checkout","Night checkout",aviation.club_night_checkout)}</div><div class="people-form-grid">${input("people-bfr-expiry","Flight review / BFR expiry (optional)",aviation.bfr_expiry_date,"date")}${input("people-last-checkout","Last organization checkout (optional)",aviation.last_club_checkout,"date")}${input("people-medical-expiry","Medical expiry (optional)",aviation.medical_expiry_date,"date")}${input("people-last-medical","Last medical date (optional)",aviation.last_medical_date,"date")}${input("people-medical-class","Medical class (optional)",aviation.medical_class)}${input("people-application-date","Application date (optional)",aviation.application_date || applicant.application_date,"date")}${input("people-employer","Employer (optional)",background.employer)}${input("people-occupation","Occupation (optional)",background.occupation)}${input("people-ratings","Ratings (optional)",aviation.ratings)}${input("people-pilot-certificate","Pilot certificate # (optional)",aviation.pilot_certificate_number)}${input("people-aircraft-types","Aircraft types (optional)",aviation.aircraft_types)}${input("people-bfr-aircraft","BFR aircraft (optional)",aviation.bfr_aircraft)}${input("people-clubs-fbos","Prior clubs/FBOs (optional)",aviation.clubs_fbos)}${input("people-flying-type","Type of flying (optional)",aviation.flying_type)}${input("people-total-hours","Total hours (optional)",aviation.total_hours,"number")}${input("people-night-hours","Night hours (optional)",aviation.total_night_hours,"number")}${input("people-ifr-hours","IFR hours (optional)",aviation.total_ifr_hours,"number")}${input("people-complex-hours","Complex hours (optional)",aviation.total_complex_hours,"number")}</div>`);
  }

  function renderNotesTab(row, context) {
    const { applicant } = context;
    return renderTabPanel("notes", `<div class="people-form-grid">${textarea("people-notes","Internal notes — not visible to this person",row.notes)}${input("people-objectives","Objectives (optional)",applicant.objectives)}${input("people-how-hear","How they heard about us (optional)",applicant.how_hear_us)}${textarea("people-accident-details","Accident / incident details (optional)",applicant.accident_details)}${textarea("people-faa-details","FAA / regulatory details (optional)",applicant.faa_details)}</div>${renderPersonTimeline(row)}`);
  }

  function renderEditor() {
    const row = selected;
    const access = selectedRow();
    const mayEdit = canManagePeople(access);
    const mayEditAnyRole = canManageSafeRoles(access);
    const mayEditSuperAdmin = canManageSuperAdminRoles(access);
    if (!row) return `<section class="people-editor-shell people-empty"><h2>Select a person</h2><p>Choose a person from the list, or create a new person. This workbench covers members, applicants, onboarding users, administrators, former people, and restricted records without splitting the people database.</p></section>`;

    const contact = profileSection("contact");
    const emergency = profileSection("emergency");
    const aviation = profileSection("aviation");
    const background = profileSection("background");
    const applicant = profileSection("applicant");
    const name = profileName(row);
    const settings = obj(row.membership_settings_json);
    const primaryType = clean(contact.primary_phone_type || "primary");
    const roles = sortRoles(options.roles);
    const isArchived = Boolean(row.membership_archived_at || row.person_archived_at);
    const endFieldsDisabled = !isEndedStatus(row.lifecycle_status_key) && !clean(row.left_at);
    const archiveButton = isArchived ? `<button id="people-restore" class="people-btn secondary" ${mayEdit ? "" : "disabled"} type="button">Restore</button>` : `<button id="people-archive" class="people-btn danger" ${mayEdit ? "" : "disabled"} type="button">Archive</button>`;
    const preferred = clean(row.preferred_first_name || name.preferred_first_name || name.preferred_name);
    const middle = clean(row.middle_name || name.middle_name || name.middle_initial);
    const suffix = clean(row.suffix || name.suffix);
    const displayPreview = calculatedDisplayName(row.first_name, preferred, middle, row.last_name, suffix) || row.display_name || "New person";
    const context = { mayEdit, mayEditAnyRole, mayEditSuperAdmin, contact, emergency, aviation, background, applicant, name, settings, primaryType, roles, isArchived, endFieldsDisabled, preferred, middle, suffix, displayPreview };

    return `<section class="people-editor-shell people-editor"><div class="people-editor-head"><div><h2>${esc(displayPreview)}</h2><div class="people-pill-row">${pill(row.lifecycle_status_label || row.lifecycle_status_key, row.blocks_access ? "warn" : isArchived ? "muted" : "")}${pill(row.membership_class_label)}${pill(row.application_stage_label)}${row.login_linked ? pill("Login linked","ok") : pill("No login yet","warn")}</div></div></div>${!mayEdit ? `<p class="people-warning">You can view this roster, but you do not have permission to edit people.</p>` : ""}${renderTabButtons()}<div class="people-tab-panels">${renderIdentityTab(row, context)}${renderMembershipTab(row, context)}${renderContactTab(row, context)}${renderAccessTab(row, context)}${renderAviationTab(row, context)}${renderNotesTab(row, context)}</div><div class="people-editor-footer"><span id="people-dirty-badge" class="people-save-state ${dirty ? "warn" : "ok"}">${dirty ? "Unsaved changes" : "Saved"}</span>${message ? `<span class="people-inline-message ${esc(messageKind)}">${esc(message)}</span>` : ""}<span class="people-footer-spacer"></span><button id="people-reset-form" class="people-btn secondary" type="button">Reset</button>${archiveButton}<button id="people-save" class="people-btn primary" ${mayEdit ? "" : "disabled"} type="button">Save</button></div></section>`;
  }

  function renderContent() {
    if (!authChecked) return `<section class="people-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></section>`;
    if (!token) return `<section class="people-card"><h2>Login required</h2><p>This page uses the same login as the User Dashboard.</p>${renderLogin()}</section>`;
    const rows = adminRows();
    if (!rows.length) return `<section class="people-card"><h2>No organization admin access</h2><p>Your account is signed in, but it does not have organization-admin permission.</p></section>`;
    return `${renderWorkbenchHeader()}<section class="people-workbench">${renderFinderPanel()}${renderEditor()}</section>`;
  }

  function peopleCss(cfg) {
    return `
      .people-wrap{${cssVars(cfg)}max-width:var(--people-page-width);margin:24px auto;padding:0 18px 32px;font-family:Inter,Arial,Helvetica,sans-serif;color:var(--people-text);box-sizing:border-box}.people-wrap.embedded{max-width:none;margin:0;padding:0;min-width:0;width:100%;overflow:hidden}.people-wrap *{box-sizing:border-box}.people-card,.people-module-header,.people-list-panel,.people-editor-shell{background:rgba(255,255,255,.98);border:1px solid var(--people-border);border-radius:18px;box-shadow:0 8px 24px rgba(16,24,40,.07)}.people-card{padding:20px;margin:16px 0}.people-module-header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:14px 16px;margin:0 0 10px;border-top:3px solid var(--people-primary)}.people-module-header h2{margin:5px 0 4px;font-size:24px;line-height:1.1;color:#101828}.people-module-header p{margin:0;color:var(--people-muted);font-weight:650}.people-kicker{display:inline-flex;padding:5px 9px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:11px;text-transform:uppercase;font-weight:950;letter-spacing:.06em}.people-module-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.people-org-selector{display:grid;gap:4px;font-size:11px;font-weight:950;color:var(--people-muted);text-transform:uppercase}.people-workbench{display:grid;grid-template-columns:320px minmax(0,1fr);gap:10px;align-items:start;min-width:0}.people-list-panel{position:sticky;top:8px;max-height:calc(100vh - 24px);display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px;padding:12px;overflow:hidden}.people-list-tools{display:grid;gap:10px}.people-sort-hint{color:var(--people-muted);font-weight:750;line-height:1.35}.people-search-wrap{position:relative}.people-search-wrap input{padding-right:42px}.people-compact-list{display:grid;gap:7px;overflow:auto;min-height:260px;padding:2px 3px 8px;overscroll-behavior:contain}.people-person-card{text-align:left;border:1px solid var(--people-border);border-radius:14px;background:#fff;color:var(--people-text);padding:10px;display:grid;gap:8px;cursor:pointer;box-shadow:0 4px 14px ${rgba(cfg.primary,.045)}}.people-person-card:hover{border-color:var(--people-primary);background:var(--people-soft)}.people-person-card.selected{border-color:var(--people-primary);background:#fff;box-shadow:0 0 0 3px var(--people-strong-soft)}.people-person-card.archived{opacity:.62;background:#f8fafc}.people-person-card.restricted{border-color:#fed7aa}.person-main{display:grid;gap:2px;min-width:0}.person-main strong{font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-main small{color:var(--people-muted);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-badges,.people-pill-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.people-pill{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:10px;font-weight:950;max-width:100%;white-space:nowrap}.people-pill.ok{background:#ecfdf5;color:#047857}.people-pill.warn{background:#fff7ed;color:#9a3412}.people-pill.muted{background:#f2f4f7;color:#667085}.people-empty-row{border:1px dashed var(--people-border);border-radius:16px;padding:20px;text-align:center;color:var(--people-muted);background:#fff}.people-editor-shell{min-width:0;overflow:hidden}.people-empty{min-height:360px;display:grid;align-content:center;text-align:center;padding:24px}.people-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px 18px 10px;border-bottom:1px solid var(--people-border)}.people-editor-head h2{margin:0 0 7px;font-size:24px;color:#101828}.people-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--people-border);background:#fcfcfd}.people-tab{border:1px solid var(--people-border);border-radius:999px;background:#fff;color:var(--people-primary);font-weight:900;padding:8px 11px;cursor:pointer}.people-tab.active{background:var(--people-primary);color:#fff;border-color:var(--people-primary)}.people-tab-panels{padding:0}.people-tab-panel{padding:16px}.people-tab-panel[hidden]{display:none!important}.people-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}.people-form-grid.one{grid-template-columns:1fr}.people-access-status-grid{padding-bottom:8px}.people-affiliation-grid{padding-top:14px;border-top:1px solid var(--people-border)}.people-field{display:grid;gap:6px;font-weight:850}.people-field span{font-size:13px}.people-field small{font-weight:600;color:var(--people-muted);line-height:1.35}.people-field-wide,.people-field.wide{grid-column:1/-1}.field-error{color:#b91c1c!important;font-weight:900!important}.people-field input,.people-field select,.people-field textarea,.people-login input,#people-org-select{width:100%;border:1px solid var(--people-border);border-radius:12px;background:#fff;color:var(--people-text);padding:10px 12px;font:inherit;min-height:40px}.people-field textarea{min-height:110px;resize:vertical}.people-field input[readonly],.people-field input:disabled,.people-field select:disabled,.people-field.disabled-field input,.people-field.disabled-field select{background:#f8fafc;color:var(--people-muted);cursor:not-allowed}.people-field.disabled-field{opacity:.72}.people-btn,.people-icon-btn,.people-link-btn{border:0;border-radius:999px;background:var(--people-primary);color:#fff;font-weight:900;padding:9px 13px;cursor:pointer;min-height:36px}.people-btn.primary{background:var(--people-primary);color:#fff}.people-btn.secondary{background:var(--people-strong-soft);color:var(--people-primary)}.people-btn.outline{background:#fff;color:var(--people-primary);border:1px solid var(--people-primary)}.people-btn.danger{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.people-btn:disabled{opacity:.55;cursor:not-allowed}.people-link-btn{background:transparent;color:var(--people-primary);text-decoration:underline;padding:8px}.people-icon-btn{position:absolute;right:5px;top:5px;width:31px;height:31px;padding:0;background:var(--people-soft);color:var(--people-primary)}.people-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;margin-top:14px}.people-context-single{display:inline-flex;gap:8px;align-items:center;background:var(--people-soft);color:var(--people-primary);padding:8px 11px;border-radius:999px;font-weight:900}.people-context-single span{opacity:.82}.muted{color:var(--people-muted);font-weight:650}.people-warning{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:14px;padding:11px 13px;margin:12px 16px}.phone-grid{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;align-items:end;margin-bottom:14px}.primary-pick{min-height:40px;display:flex;gap:8px;align-items:center;justify-content:center;border:1px solid var(--people-border);border-radius:12px;background:var(--people-soft);font-weight:900;color:var(--people-primary)}.people-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.people-check{display:flex;gap:9px;align-items:flex-start;padding:11px 12px;border:1px solid var(--people-border);border-radius:14px;background:#fff;font-weight:900}.people-check.disabled{opacity:.62;background:#f8fafc}.people-check input{width:auto;min-height:0;margin-top:2px}.people-check small{display:block;font-size:11px;color:#9a3412;margin-top:2px}.people-photo-panel{grid-column:1/-1;display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px;align-items:center;border:1px dashed var(--people-border);border-radius:16px;background:var(--people-soft);padding:14px}.people-photo-panel.dragover{box-shadow:0 0 0 3px var(--people-strong-soft);border-color:var(--people-primary)}.people-photo-preview{width:120px;height:120px;border-radius:20px;background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--people-border);box-shadow:0 10px 26px ${rgba(cfg.primary,.16)}}.people-photo-preview img{width:100%;height:100%;object-fit:cover;display:block}.people-photo-preview span{font-size:34px;font-weight:950;letter-spacing:.03em}.people-photo-copy strong{display:block;color:var(--people-primary);font-size:15px;margin-bottom:4px}.people-photo-copy p{margin:0 0 8px;color:var(--people-muted);font-weight:750}.people-photo-copy small{display:block;color:var(--people-muted);font-weight:750;margin-bottom:10px}.people-photo-actions,.people-inline-actions{display:flex;gap:8px;flex-wrap:wrap}.people-access-actions{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid var(--people-border);border-radius:14px;padding:12px;margin-bottom:14px;background:var(--people-soft)}.people-access-actions p{margin:4px 0 0}.people-timeline-box{border-top:1px solid var(--people-border);margin-top:14px;padding-top:14px}.people-timeline-list{display:grid;gap:10px;margin-top:12px}.people-note-card{border-left:4px solid var(--people-primary);background:#f8fafc;border-radius:12px;padding:10px}.people-note-card strong{display:block;color:var(--people-primary)}.people-note-card span{font-size:12px;color:#64748b;font-weight:800}.people-note-card p{margin:6px 0;white-space:pre-wrap}.people-editor-footer{display:flex;align-items:center;gap:9px;flex-wrap:wrap;border-top:1px solid var(--people-border);padding:12px 16px;background:#fcfcfd}.people-footer-spacer{flex:1}.people-save-state{display:inline-flex;padding:7px 10px;border-radius:999px;font-weight:950}.people-save-state.ok{background:#ecfdf5;color:#047857}.people-save-state.warn{background:#fff7ed;color:#9a3412}.people-inline-message{font-weight:850;color:var(--people-primary)}.people-inline-message.ok{color:#047857}.people-inline-message.warn{color:#9a3412}.people-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}.people-debug{margin-top:10px;padding:12px;background:#111827;color:#fff;border-radius:14px}.people-debug summary{font-weight:900;cursor:pointer}@media(max-width:1100px){.people-workbench{grid-template-columns:1fr}.people-list-panel{position:static;max-height:none}.people-compact-list{max-height:320px}.people-module-header{display:grid}.people-module-actions{justify-content:flex-start}.people-form-grid,.people-check-grid{grid-template-columns:1fr 1fr}.people-login{grid-template-columns:1fr}.people-btn{flex:0 0 auto}.phone-grid{grid-template-columns:1fr}.primary-pick{justify-content:flex-start;padding:0 12px}}@media(max-width:640px){.people-form-grid,.people-check-grid{grid-template-columns:1fr}.people-photo-panel{grid-template-columns:1fr}.people-photo-preview{margin:auto}.people-btn{width:100%}.people-editor-footer{display:grid}.people-footer-spacer{display:none}.people-access-actions{display:grid}}
    `;
  }

  function preserveSelectedDraft() {
    if (!dirty || !selected) return;
    try {
      const payload = readForm();
      selected = {
        ...selected,
        first_name: payload.first_name,
        preferred_first_name: payload.preferred_first_name,
        middle_name: payload.middle_name,
        last_name: payload.last_name,
        suffix: payload.suffix,
        display_name: payload.display_name,
        primary_email: payload.primary_email,
        email: payload.primary_email || selected.email,
        primary_phone: payload.primary_phone,
        phone: payload.primary_phone || selected.phone,
        member_number: payload.member_number,
        title: payload.title,
        joined_at: payload.joined_at,
        left_at: payload.left_at,
        lifecycle_status_key: payload.status_key,
        membership_class_key: payload.membership_class_key,
        application_stage_key: payload.application_stage_key,
        notes: payload.notes,
        profile_json: payload.profile_json,
        membership_settings_json: payload.membership_settings_json,
        role_keys: Array.isArray(payload.role_keys) ? payload.role_keys : selected.role_keys
      };
    } catch {}
  }

  function render() {
    preserveSelectedDraft();
    let el = rootElement();
    if (!el && !isEmbedded()) { el = document.createElement("div"); el.id = ROOT_ID; document.body.appendChild(el); }
    if (!el) return;
    const cfg = styleConfig(selectedRow());
    const debugHtml = isDebug() ? `<details class="people-debug"><summary>People diagnostics</summary><pre class="people-backend">${esc(JSON.stringify({ version: VERSION, embedded: isEmbedded(), email, selectedOrgId, selected: selected?.membership_id || "", people: people.length, filter, activeTab, dirty, lastResult: backend || null }, null, 2))}</pre></details>` : "";
    el.innerHTML = `<style>${peopleCss(cfg)}</style><div class="people-wrap ${isEmbedded() ? "embedded" : ""}">${renderContent()}${debugHtml}</div>`;
    bindEvents();
    restoreSearchFocus();
    updateAffiliationEndState();
    refreshDisplayNamePreview();
    updateDirtyBadge();
  }

  function activateTab(tab) {
    activeTab = tab || "identity";
    document.querySelectorAll(".people-tab").forEach((btn) => {
      const active = btn.getAttribute("data-tab") === activeTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      const active = panel.getAttribute("data-tab-panel") === activeTab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function captureSearchFocus(el) {
    searchRestore = { start: el?.selectionStart ?? 0, end: el?.selectionEnd ?? 0 };
  }
  function restoreSearchFocus() {
    if (!searchRestore) return;
    const restore = searchRestore;
    searchRestore = null;
    setTimeout(() => {
      const inputEl = $("people-search");
      if (!inputEl) return;
      try { inputEl.focus({ preventScroll: true }); } catch { inputEl.focus(); }
      try { inputEl.setSelectionRange(Math.min(restore.start, inputEl.value.length), Math.min(restore.end, inputEl.value.length)); } catch {}
    }, 0);
  }

  async function resetSelected() {
    if (!selected) return;
    if (!confirm("Reset this person form? Unsaved changes will be discarded.")) return;
    const id = selected.membership_id || selected.person_id;
    setDirty(false);
    if (id && selected.person_id) await loadSelectedPerson(id);
    else selected = blankPerson();
    fieldErrors = {};
    render();
  }

  function bindEvents() {
    $("people-login")?.addEventListener("click", () => runButton("people-login", "Logging in…", login));
    $("people-logout")?.addEventListener("click", () => runButton("people-logout", "Logging out…", logout));
    $("people-reset-own")?.addEventListener("click", () => runButton("people-reset-own", "Sending…", resetOwnPassword));
    $("people-org-select")?.addEventListener("change", async (e) => { if (!confirmDiscard()) { e.target.value = selectedOrgId; return; } setDirty(false); selectedOrgId = e.target.value; adminAccess = null; selected = null; try { await loadOrgContext(); setMessage("Organization loaded.", "ok"); } catch (err) { setMessage(err.message || String(err), "warn"); } render(); });
    $("people-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = filter; return; } setDirty(false); filter = e.target.value || "all"; render(); });
    $("people-search")?.addEventListener("input", (e) => { captureSearchFocus(e.target); clearTimeout(debounceTimer); const next = e.target.value || ""; debounceTimer = setTimeout(() => { search = next; render(); }, 300); });
    $("people-clear-search")?.addEventListener("click", () => { searchRestore = { start: 0, end: 0 }; search = ""; render(); });
    document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => runButton("people-refresh", "Opening…", async () => { if (!confirmDiscard()) return; setDirty(false); const id = btn.getAttribute("data-open"); await loadSelectedPerson(id); fieldErrors = {}; activeTab = "identity"; render(); })));
    document.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab") || "identity")));
    $("people-new")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); selected = blankPerson(); fieldErrors = {}; activeTab = "identity"; render(); });
    $("people-refresh")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); runButton("people-refresh", "Refreshing…", async () => { await loadOrgContext(); setMessage("Refreshed.", "ok"); }); });
    $("people-export")?.addEventListener("click", exportForExcel);
    $("people-print")?.addEventListener("click", printPeopleList);
    $("people-save")?.addEventListener("click", () => runButton("people-save", "Saving…", saveSelected));
    $("people-reset-form")?.addEventListener("click", () => runButton("people-reset-form", "Resetting…", resetSelected));
    $("people-add-timeline-note")?.addEventListener("click", () => runButton("people-add-timeline-note", "Adding…", addPersonTimelineNote));
    $("people-invite")?.addEventListener("click", () => runButton("people-invite", "Sending…", sendInvite));
    $("people-reset-password")?.addEventListener("click", () => runButton("people-reset-password", "Sending…", sendPasswordReset));
    $("people-archive")?.addEventListener("click", () => runButton("people-archive", "Archiving…", archiveSelected));
    $("people-restore")?.addEventListener("click", () => runButton("people-restore", "Restoring…", restoreSelected));
    $("people-photo-choose")?.addEventListener("click", () => $("people-photo-input")?.click());
    $("people-photo-input")?.addEventListener("change", (event) => runButton("people-photo-choose", "Uploading…", () => uploadSelectedPhoto(event.target?.files?.[0])));
    $("people-photo-remove")?.addEventListener("click", () => runButton("people-photo-remove", "Removing…", removeSelectedPhoto));
    const photoDropZone = $("people-photo-dropzone");
    if (photoDropZone && photoDropZone.getAttribute("data-photo-disabled") !== "true") {
      photoDropZone.addEventListener("dragover", (event) => { event.preventDefault(); photoDropZone.classList.add("dragover"); });
      photoDropZone.addEventListener("dragleave", () => photoDropZone.classList.remove("dragover"));
      photoDropZone.addEventListener("drop", (event) => { event.preventDefault(); photoDropZone.classList.remove("dragover"); runButton("people-photo-choose", "Uploading…", () => uploadSelectedPhoto(event.dataTransfer?.files?.[0])); });
    }
    document.querySelectorAll(".people-editor input, .people-editor select, .people-editor textarea").forEach((inputEl) => {
      inputEl.addEventListener("input", () => { setDirty(true); refreshDisplayNamePreview(); });
      inputEl.addEventListener("change", () => { setDirty(true); updateAffiliationEndState(inputEl.id === "people-status-key"); refreshDisplayNamePreview(); });
    });
  }

  function blankPerson() {
    const applicant = arr(options.statuses).find((s) => s.status_key === "applicant") || arr(options.statuses)[0] || {};
    return { person_id:"", membership_id:"", display_name:"", first_name:"", last_name:"", primary_email:"", primary_phone:"", phone:"", member_number:"", title:"", joined_at:"", left_at:"", lifecycle_status_key:applicant.status_key || "applicant", membership_class_key:"", application_stage_key:"", role_keys:[], role_labels:[], profile_json:{ name:{}, contact:{ primary_phone_type:"mobile" }, emergency:{}, aviation:{}, background:{}, applicant:{}, admin:{} }, membership_settings_json:{}, notes:"", login_linked:false };
  }

  function isValidEmail(value) { const v = clean(value); return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isValidPhone(value) { const v = clean(value); if (!v) return true; const digits = v.replace(/\D/g,""); return digits.length >= 7 && /^[0-9+().\-\s extEXTx]+$/.test(v); }
  function selectedPrimaryPhoneType() { return document.querySelector('input[name="primary-phone-type"]:checked')?.value || "mobile"; }

  function validateForm() {
    fieldErrors = {};
    const emailValue = clean($("people-primary-email")?.value).toLowerCase();
    if (emailValue && !isValidEmail(emailValue)) fieldErrors["people-primary-email"] = "Enter a valid email address.";
    const altEmail = clean($("people-alt-email")?.value).toLowerCase();
    if (altEmail && !isValidEmail(altEmail)) fieldErrors["people-alt-email"] = "Enter a valid email address.";
    ["people-mobile-phone","people-home-phone","people-work-phone","people-emergency-phone"].forEach((id) => {
      if (!isValidPhone($(id)?.value)) fieldErrors[id] = "Enter a valid phone number.";
    });
    const primaryType = selectedPrimaryPhoneType();
    const phoneId = primaryType === "home" ? "people-home-phone" : primaryType === "work" ? "people-work-phone" : "people-mobile-phone";
    if (!clean($(phoneId)?.value) && (clean($("people-mobile-phone")?.value) || clean($("people-home-phone")?.value) || clean($("people-work-phone")?.value))) {
      fieldErrors[phoneId] = "Primary phone is selected here, so enter the number or choose a different primary.";
    }
    return Object.keys(fieldErrors).length === 0;
  }

  function readForm() {
    const roleKeys = [];
    arr(options.roles).forEach((role) => { const rk = key(role.role_key); const el = $(`role-${rk}`); if (el?.checked) roleKeys.push(rk); });
    const primaryType = selectedPrimaryPhoneType();
    const mobilePhone = clean($("people-mobile-phone")?.value);
    const homePhone = clean($("people-home-phone")?.value);
    const workPhone = clean($("people-work-phone")?.value);
    const primaryPhone = primaryType === "home" ? homePhone : primaryType === "work" ? workPhone : mobilePhone;
    const firstName = clean($("people-first-name")?.value);
    const preferredFirstName = clean($("people-preferred-first-name")?.value);
    const middleName = clean($("people-middle-name")?.value);
    const lastName = clean($("people-last-name")?.value);
    const suffix = clean($("people-suffix")?.value);
    const statusKey = clean($("people-status-key")?.value);
    const endEnabled = isEndedStatus(statusKey) || clean($("people-affiliation-end-date")?.value);
    const profile = {
      name: { preferred_first_name: preferredFirstName, middle_name: middleName, suffix },
      contact: { primary_phone_type: primaryType, mobile_phone: mobilePhone, home_phone: homePhone, work_phone: workPhone, alternate_email: clean($("people-alt-email")?.value).toLowerCase(), address: clean($("people-address")?.value), city: clean($("people-city")?.value), state: clean($("people-state")?.value), zip: clean($("people-zip")?.value) },
      emergency: { name: clean($("people-emergency-name")?.value), phone: clean($("people-emergency-phone")?.value), relation: clean($("people-emergency-relation")?.value) },
      aviation: { club_cfi: bool($("people-club-cfi")?.checked), on_maintenance_crew: bool($("people-maintenance")?.checked), ifr_rated: bool($("people-ifr-rated")?.checked), club_night_checkout: bool($("people-night-checkout")?.checked), bfr_expiry_date: clean($("people-bfr-expiry")?.value), last_club_checkout: clean($("people-last-checkout")?.value), medical_expiry_date: clean($("people-medical-expiry")?.value), last_medical_date: clean($("people-last-medical")?.value), medical_class: clean($("people-medical-class")?.value), application_date: clean($("people-application-date")?.value), ratings: clean($("people-ratings")?.value), pilot_certificate_number: clean($("people-pilot-certificate")?.value), aircraft_types: clean($("people-aircraft-types")?.value), bfr_aircraft: clean($("people-bfr-aircraft")?.value), clubs_fbos: clean($("people-clubs-fbos")?.value), flying_type: clean($("people-flying-type")?.value), total_hours: clean($("people-total-hours")?.value), total_night_hours: clean($("people-night-hours")?.value), total_ifr_hours: clean($("people-ifr-hours")?.value), total_complex_hours: clean($("people-complex-hours")?.value) },
      background: { employer: clean($("people-employer")?.value), occupation: clean($("people-occupation")?.value) },
      applicant: { application_date: clean($("people-application-date")?.value), objectives: clean($("people-objectives")?.value), how_hear_us: clean($("people-how-hear")?.value), accident_details: clean($("people-accident-details")?.value), faa_details: clean($("people-faa-details")?.value) },
      admin: obj(getProfile(selected).admin)
    };
    const membershipSettings = { ...obj(selected?.membership_settings_json), end_reason: endEnabled ? clean($("people-affiliation-end-reason")?.value) : "" };
    const payload = { organization_id: selectedOrgId, person_id: selected?.person_id || "", membership_id: selected?.membership_id || "", first_name: firstName, preferred_first_name: preferredFirstName, middle_name: middleName, last_name: lastName, suffix, display_name: calculatedDisplayName(firstName, preferredFirstName, middleName, lastName, suffix), primary_email: clean($("people-primary-email")?.value).toLowerCase(), primary_phone: primaryPhone, member_number: clean($("people-member-number")?.value), title: clean($("people-title")?.value), joined_at: clean($("people-joined-at")?.value), left_at: endEnabled ? clean($("people-affiliation-end-date")?.value) : "", status_key: statusKey, membership_class_key: clean($("people-class-key")?.value), application_stage_key: clean($("people-stage-key")?.value), notes: clean($("people-notes")?.value), profile_json: profile, membership_settings_json: membershipSettings };
    if (canManageSafeRoles(selectedRow())) payload.role_keys = unique(roleKeys);
    return payload;
  }

  async function saveSelected() {
    if (!validateForm()) { setMessage("Fix the highlighted fields before saving.", "warn"); return; }
    const payload = readForm();
    const restrictive = ["suspended","expelled","archived","blocked"].includes(key(payload.status_key));
    if (restrictive && !confirm("This status blocks or restricts access. Save anyway?")) return;
    payload.confirm_restrictive = restrictive;
    const res = await call("organization_save_person", payload);
    selected = res.person || selected;
    setDirty(false);
    await loadPeople();
    if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
    fieldErrors = {};
    setMessage("Person saved.", "ok");
  }

  async function sendInvite() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    const res = await call("organization_send_invite", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    await loadPeople();
    setMessage(res.message || "Invite requested.", "ok");
  }

  async function sendPasswordReset() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    const res = await call("organization_send_password_reset", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    setMessage(res.message || "Password reset requested.", res.sent === false ? "warn" : "ok");
  }

  async function archiveSelected() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    if (!confirm("Archive this person's organization affiliation? They will disappear from normal People views, but can be restored from the Archived filter.")) return;
    const res = await call("organization_archive_membership", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    setDirty(false);
    await loadPeople();
    selected = null;
    setMessage("Membership archived.", "ok");
  }

  async function restoreSelected() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    const res = await call("organization_restore_membership", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    setDirty(false);
    await loadPeople();
    selected = res.person || people.find((p) => p.membership_id === selected.membership_id) || null;
    setMessage("Membership restored.", "ok");
  }

  function printPeopleList() {
    const rows = filteredPeople();
    const org = selectedRow()?.organization_name || "Organization";
    const generated = new Date().toLocaleString();
    const htmlRows = rows.map((p) => `<tr><td><strong>${esc(p.display_name || "")}</strong>${p.title ? `<br><small>${esc(p.title)}</small>` : ""}</td><td>${esc(p.email || "")}</td><td>${esc(p.phone || "")}</td><td>${esc(p.lifecycle_status_label || p.lifecycle_status_key || "")}</td><td>${esc(p.membership_class_label || "")}</td><td>${esc(arr(p.role_labels).join(", "))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><title>${esc(org)} People</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111827}h1{margin:0 0 4px}p{margin:0 0 16px;color:#4b5563}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d1d5db;padding:7px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}small{color:#6b7280}@media print{button{display:none}}</style></head><body><h1>${esc(org)} People & Access</h1><p>Generated ${esc(generated)} · ${esc(rows.length)} records · current filter/search only</p><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Class</th><th>Roles</th></tr></thead><tbody>${htmlRows || `<tr><td colspan="6">No records match the current filter.</td></tr>`}</tbody></table><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),100));<\/script></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { window.print(); return; }
    win.document.open(); win.document.write(html); win.document.close();
    setMessage("Printable People list opened.", "ok");
  }

  function tsvCell(v) { return String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim(); }
  function exportForExcel() {
    const rows = filteredPeople();
    const headers = ["Name","Email","Phone","Member Number","Status","Class","Stage","Roles","Title","Affiliation Start","Affiliation End","End Reason"];
    const tsvRows = [headers.join("\t")];
    rows.forEach((p) => {
      const settings = obj(p.membership_settings_json);
      const vals = [p.display_name,p.email,p.phone,p.member_number,p.lifecycle_status_label,p.membership_class_label,p.application_stage_label,arr(p.role_labels).join("; "),p.title,String(p.joined_at || "").slice(0,10),String(p.left_at || "").slice(0,10),settings.end_reason || ""];
      tsvRows.push(vals.map(tsvCell).join("\t"));
    });
    const blob = new Blob([tsvRows.join("\r\n")], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `people-${selectedRow()?.organization_key || "organization"}.tsv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setMessage("Excel export created. The file is tab-separated so it pastes cleanly into spreadsheets.", "ok");
  }

  window.addEventListener("syncetc:portal-logout-request", () => {
    if (!token) return;
    logout().catch((e) => { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); });
  });

  window.addEventListener("syncetc:portal-login-request", () => {
    render();
    setTimeout(() => $("people-login-email")?.focus(), 0);
  });

  window.addEventListener("syncetc:portal-organization-change", async (event) => {
    const nextOrgId = String(event.detail?.organization_id || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    if (!confirmDiscard()) { setShellState(); return; }
    setDirty(false);
    selectedOrgId = nextOrgId;
    adminAccess = null;
    selected = null;
    pageConfig = null;
    try { await loadOrgContext(); setMessage("Organization loaded.", "ok"); }
    catch (err) { setMessage(err.message || String(err), "warn"); }
    render();
  });

  window.addEventListener("syncetc:portal-organization-change-request", async (event) => {
    const organizationId = clean(event.detail?.organizationId);
    if (!organizationId || organizationId === selectedOrgId) return;
    if (!confirmDiscard()) { setShellState(); return; }
    try {
      setDirty(false);
      selectedOrgId = organizationId;
      adminAccess = null;
      selected = null;
      await loadOrgContext();
      setMessage("Organization loaded.", "ok");
    } catch (e) {
      backend = { ok:false, message:e.message || String(e) };
      setMessage(e.message || String(e), "warn");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("syncetc:portal-auth-changed", () => {
    refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); });
  });

  function init(options = {}) {
    mountOptions = { ...mountOptions, ...obj(options) };
    if (options.organizationId) selectedOrgId = clean(options.organizationId);
    if (options.initialTab) activeTab = clean(options.initialTab) || activeTab;
    if (options.initialView === "admins") filter = "admins";
    if (options.filter) filter = clean(options.filter) || filter;
    authChecked = false;
    return refreshAuth().catch((e) => {
      backend = { ok:false, message:e?.message || String(e) };
      authChecked = true;
      try { setShellState(); } catch {}
      render();
    });
  }

  function mount(target, options = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("People module mount target was not found.");
    externalRoot = el;
    mountOptions = { ...obj(options), embedded: options.embedded !== false };
    if (options.organizationId) selectedOrgId = clean(options.organizationId);
    if (options.initialTab) activeTab = clean(options.initialTab) || activeTab;
    if (options.initialView === "admins") filter = "admins";
    return init(mountOptions);
  }

  function autoInit() {
    if (autoStarted) return;
    if (!document.querySelector(ROOT_SELECTOR)) return;
    autoStarted = true;
    mountOptions = { embedded: false };
    init(mountOptions);
  }

  window.SyncEtcPeopleAdmin = { version: VERSION, mount, boot: init, isDirty: () => !!dirty, hasUnsavedChanges: () => !!dirty, confirmDiscard, reload: init };
  window.SyncEtcPeopleAdminPage = window.SyncEtcPeopleAdmin;

  if (!window.SyncEtcPeopleAdminSuppressAutoBoot) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit);
    else autoInit();
  }
})();

