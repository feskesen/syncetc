// CUSTOMER-ADMIN-PAGE-people-current.js
// Internal Version: 2026-06-16-116-P
// Purpose: Organization Admin People workbench. Supports standalone page and embedded Organization Management module runtime.

(function () {
  "use strict";

  const VERSION = "2026-06-16-116-P";
  const ROOT_ID = "syncetc-organization-people-root";
  const ROOT_SELECTOR = "#syncetc-organization-people-root, #syncetc-people-admin-root, [data-syncetc-page=\"organization-people\"]";
  const SELECTED_ORG_KEY = "syncetc.selectedOrganizationId";
  const DIRTY_MESSAGE = "You have unsaved people changes. Leave anyway?";
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
  let embeddedMode = false;
  let autoStarted = false;
  let peopleSearchRestore = null;
  let activeTab = "identity";
  let activePeopleLens = "";
  let token = "";
  let email = "";
  let authChecked = false;
  let allAccess = [];
  let adminAccess = null;
  let selectedOrgId = "";
  let platformAdmin = false;
  let options = { statuses: [], membership_classes: [], application_stages: [], roles: [], permissions: [], qualifications: [] };
  let people = [];
  let pageConfig = null;
  let selected = null;
  let activeDefinitionKind = "";
  let definitionLists = { statuses: [], membership_classes: [], application_stages: [], groups_roles: [], permissions: [], qualifications: [] };
  let selectedDefinition = null;
  let definitionSearch = "";
  let definitionFilter = "all";
  let definitionSearchRestore = null;
  let definitionDragId = "";
  let definitionRpcAvailable = true;
  let selectedPermissionRoleId = "";
  let permissionDraftKeys = null;
  let permissionSearch = "";
  let permissionSearchRestore = null;
  let search = "";
  let filter = "all";
  let roleFilter = "all";
  let loginFilter = "all";
  let advancedFiltersOpen = false;
  let message = "";
  let messageKind = "";
  let busy = false;
  let backend = null;
  let debounceTimer = null;
  let fieldErrors = {};
  let dirty = false;
  let loadRunCounter = 0;
  let activeLoadRun = null;
  let loadTimings = [];

  const PEOPLE_CACHE_TTL_MS = 45000;
  const peopleCacheByOrg = {};

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const lower = (v) => clean(v).toLowerCase();
  const key = (v) => lower(v).replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function shouldWaitForSession() { try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; } catch { return false; } }
  function clearJustLoggedIn() { try { window.sessionStorage.removeItem("syncetc_just_logged_in"); } catch {} }
  function nowMs() { try { return performance.now(); } catch { return Date.now(); } }
  function beginLoadTrace(label) {
    const run = { id: ++loadRunCounter, label: label || "load", started_at: new Date().toISOString(), started_ms: nowMs(), duration_ms: 0, status: "running", steps: [] };
    activeLoadRun = run;
    loadTimings.unshift(run);
    loadTimings = loadTimings.slice(0, 5);
    return run;
  }
  function markLoad(label, detail = "", run = activeLoadRun) {
    if (!run) return;
    run.steps.push({ ms: Math.round(nowMs() - run.started_ms), label: clean(label), detail: detail ? clean(detail) : "" });
  }
  function finishLoad(status = "ok", run = activeLoadRun) {
    if (!run) return;
    run.status = status;
    run.duration_ms = Math.round(nowMs() - run.started_ms);
  }
  async function timedLoad(label, fn, run = activeLoadRun) {
    const started = nowMs();
    try {
      const result = await fn();
      markLoad(label, `${Math.round(nowMs() - started)}ms`, run);
      return result;
    } catch (error) {
      markLoad(label, `failed after ${Math.round(nowMs() - started)}ms: ${error?.message || error}`, run);
      throw error;
    }
  }
  function getCachedOrgContext(orgId) {
    const cached = peopleCacheByOrg[clean(orgId)];
    if (!cached) return null;
    const age = Date.now() - Number(cached.cached_at_ms || 0);
    return age >= 0 && age < PEOPLE_CACHE_TTL_MS ? cached : null;
  }
  function saveOrgContextCache(orgId) {
    if (!orgId) return;
    peopleCacheByOrg[clean(orgId)] = { cached_at_ms: Date.now(), adminAccess, options, pageConfig, people: arr(people).slice(), definitionLists: { statuses: arr(definitionLists.statuses).slice(), membership_classes: arr(definitionLists.membership_classes).slice(), application_stages: arr(definitionLists.application_stages).slice(), groups_roles: arr(definitionLists.groups_roles).slice(), permissions: arr(definitionLists.permissions).slice(), qualifications: arr(definitionLists.qualifications).slice() } };
  }
  function hydrateFromMountOptions() {
    if (!embeddedMode) return false;
    const ctx = obj(window.SyncEtcOrganizationManagementModuleContext?.people);
    const parentToken = clean(mountOptions.token || mountOptions.authToken || ctx.token || ctx.authToken);
    if (parentToken) token = parentToken;
    const parentEmail = clean(mountOptions.email || mountOptions.authEmail || ctx.email || ctx.authEmail);
    if (parentEmail) email = parentEmail;
    const parentAccessRows = arr(mountOptions.accessRows).length ? arr(mountOptions.accessRows) : arr(ctx.accessRows);
    if (parentAccessRows.length) allAccess = parentAccessRows;
    const parentAccessRow = obj(mountOptions.accessRow).organization_id ? obj(mountOptions.accessRow) : obj(ctx.accessRow);
    if (parentAccessRow.organization_id) {
      adminAccess = parentAccessRow;
      if (!allAccess.length) allAccess = [parentAccessRow];
      if (!selectedOrgId) selectedOrgId = clean(parentAccessRow.organization_id);
    }
    if (mountOptions.platformAdmin !== undefined || ctx.platformAdmin !== undefined) platformAdmin = Boolean(mountOptions.platformAdmin ?? ctx.platformAdmin);
    const requestedDefinition = normalizeDefinitionKind(mountOptions.initialDefinition || mountOptions.definitionKind || mountOptions.initialView || mountOptions.view || ctx.initialDefinition || ctx.definitionKind || ctx.initialView || ctx.view || "");
    if (requestedDefinition) activeDefinitionKind = requestedDefinition;
    const requestedLens = normalizePeopleLens(mountOptions.initialLens || mountOptions.peopleLens || mountOptions.lens || ctx.initialLens || ctx.peopleLens || ctx.lens || "");
    if (requestedLens) activePeopleLens = requestedLens;
    return Boolean(token);
  }
  const bool = (v) => v === true;
  function normalizeDefinitionKind(value) {
    const k = key(value);
    if (["lifecycle-statuses", "lifecycle-status", "statuses", "status", "membership-statuses"].includes(k)) return "lifecycle-statuses";
    if (["membership-classes", "membership-class", "classes", "class"].includes(k)) return "membership-classes";
    if (["application-stages", "application-stage", "applicant-stages", "onboarding-stages", "stages", "stage", "people-stages"].includes(k)) return "application-stages";
    if (["groups-roles", "group-roles", "groups", "group", "roles", "role", "groups-and-roles", "people-groups", "people-roles", "organization-roles"].includes(k)) return "groups-roles";
    if (["permissions", "permission", "capabilities", "capability", "people-permissions", "access-permissions", "role-permissions"].includes(k)) return "permissions";
    if (["qualifications", "qualification", "checkouts", "checkout", "qualification-checkouts", "people-qualifications", "people-instructors", "instructors", "instructor-qualifications"].includes(k)) return "qualifications";
    return "";
  }
  function normalizePeopleLens(value) {
    const k = key(value);
    if (["admin-access", "admins-access", "administrators", "administrator", "access", "people-admins", "administrators-access"].includes(k)) return "admin-access";
    return "";
  }
  function isPermissionsMode() { return activeDefinitionKind === "permissions"; }
  function isDefinitionMode() { return Boolean(activeDefinitionKind) && !isPermissionsMode(); }
  function isAdminAccessLens() { return activePeopleLens === "admin-access" && !isDefinitionMode(); }
  try {
    if (typeof window !== "undefined" && typeof window.lower !== "function") {
      Object.defineProperty(window, "lower", { value: lower, configurable: true });
    }
  } catch {}
  const unique = (rows) => Array.from(new Set(arr(rows).map(key).filter(Boolean)));
  const hasPerm = (row, p) => arr(row?.permission_keys).includes(p);
  const isSuperAdminRole = (roleKey) => SUPER_ADMIN_ROLES.has(key(roleKey));
  const roleRank = (role) => ROLE_ORDER[key(role?.role_key)] ?? (200 + Number(role?.sort_order || 0));
  const sortRoles = (roles) => arr(roles).slice().sort((a,b) => roleRank(a) - roleRank(b) || clean(a.label || a.role_key).localeCompare(clean(b.label || b.role_key)));
  const PERMISSION_GROUPS_0116L = [
    { key: "member", label: "Member experience", capabilities: [
      ["member.portal.view", "Open member portal"],
      ["member.profile.view", "View own profile"],
      ["member.profile.update_self", "Edit own profile"],
      ["people.view_roster", "View member roster"],
      ["documents.view_member", "View member documents"],
      ["events.view_member", "View member events"],
      ["events.rsvp_self", "RSVP to events"],
      ["gallery.submit", "Submit gallery items"],
      ["reservations.use", "Use or reserve assets"]
    ]},
    { key: "people", label: "People & onboarding", capabilities: [
      ["people.manage_applicants", "Manage applicants"],
      ["people.manage_members", "Manage people records"],
      ["access.manage_memberships", "Manage access and roles"]
    ]},
    { key: "operations", label: "Operations", capabilities: [
      ["events.manage", "Manage events"],
      ["documents.manage", "Manage documents"],
      ["assets.manage", "Manage assets"],
      ["reservations.manage", "Manage reservations"],
      ["gallery.manage", "Manage gallery"],
      ["media.manage", "Manage media"],
      ["communications.manage", "Send communications"],
      ["reports.view", "View reports"]
    ]},
    { key: "admin", label: "Administration", capabilities: [
      ["organization.admin.open", "Open admin workbench"],
      ["organization.view_admin", "View admin areas"],
      ["content.manage_pages", "Manage website content"],
      ["organization.manage_settings", "Manage organization settings"]
    ]}
  ];
  const PERMISSION_LABELS_0116L = new Map(PERMISSION_GROUPS_0116L.flatMap((group) => group.capabilities.map(([k,label]) => [k, label])));
  const LOCKED_PERMISSION_ROLE_KEYS_0116L = new Set(["organization-super-admin", "organization-admin", "member"]);
  const LOCKED_PERMISSION_KEYS_0116L = new Set(["organization.super_admin", "organization.manage_settings", "access.manage_memberships"]);
  function permissionRoleIsLocked0116L(role) { return LOCKED_PERMISSION_ROLE_KEYS_0116L.has(key(role?.role_key || role?.definition_key)); }
  function permissionCapabilityIsLocked0116L(permissionKey) { return LOCKED_PERMISSION_KEYS_0116L.has(clean(permissionKey)); }
  function permissionRoleRows0116L() { const source = allDefinitionRows("groups-roles"); const rows = source.length ? source : arr(options.roles).map((role) => normalizeDefinitionRow(role, "groups-roles")); return sortedDefinitionRows(rows).filter((role) => definitionUiStatus(role) !== "archived"); }
  function selectedPermissionRole0116L() { const rows = permissionRoleRows0116L(); if (!selectedPermissionRoleId && rows.length) selectedPermissionRoleId = selectedDefinitionId(rows[0]); return rows.find((role) => selectedDefinitionId(role) === selectedPermissionRoleId) || rows[0] || null; }
  function permissionKeysForSelectedRole0116L() { const role = selectedPermissionRole0116L(); if (!role) return []; if (permissionDraftKeys) return permissionDraftKeys.slice(); return unique(role.permission_keys || []); }
  const canManagePeople = (row) => hasPerm(row,"people.manage_members") || hasPerm(row,"people.manage_applicants") || hasPerm(row,"access.manage_memberships") || hasPerm(row,"organization.manage_settings") || hasPerm(row,"organization.super_admin");
  const canManageSuperAdminRoles = (row) => arr(row?.role_keys).map(key).includes("organization-super-admin") || hasPerm(row,"organization.super_admin");
  const canManageSafeRoles = (row) => canManagePeople(row) || bool(obj(row?.capabilities).can_manage_access) || hasPerm(row,"access.manage_memberships");
  const isAdminRow = (row) => row?.is_organization_admin || bool(obj(row?.capabilities).can_view_organization_admin) || hasPerm(row,"organization.admin.open") || hasPerm(row,"organization.view_admin");
  const adminRows = () => allAccess.filter(isAdminRow);
  const selectedRow = () => adminAccess || adminRows().find((r) => String(r.organization_id) === selectedOrgId) || adminRows()[0] || null;

  function root() {
    return externalRoot || document.querySelector(ROOT_SELECTOR) || document.getElementById(ROOT_ID);
  }

  function ensureRoot() {
    let el = root();
    if (!el && !externalRoot) {
      el = document.createElement("div");
      el.id = ROOT_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function currentDebugEnabled() {
    try { return new URLSearchParams(location.search).get("syncetc_debug") === "1"; } catch { return false; }
  }

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
    if (mountOptions.supabaseClient && mountOptions.supabaseClient.auth) {
      supabaseClient = mountOptions.supabaseClient;
      return supabaseClient;
    }
    if (window.syncetcSupabase && window.syncetcSupabase.auth) {
      supabaseClient = window.syncetcSupabase;
      return supabaseClient;
    }
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    try { window.syncetcSupabase = window.syncetcSupabase || supabaseClient; } catch {}
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

  function setMessage(text, kind = "") { message = text || ""; messageKind = kind; render(); }
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
  function setDirty(value = true) { dirty = Boolean(value); }
  function isDirty() { return !!dirty; }
  function confirmDiscard(message = DIRTY_MESSAGE) {
    if (!dirty) return true;
    return confirm(message || DIRTY_MESSAGE);
  }

  function restorePeopleSearchFocus() {
    const restore = peopleSearchRestore;
    if (!restore) return;
    peopleSearchRestore = null;
    window.setTimeout(() => {
      const inputEl = $("people-search");
      if (!inputEl) return;
      try { inputEl.focus({ preventScroll: true }); } catch { inputEl.focus(); }
      try {
        const start = Number.isFinite(restore.start) ? Math.min(restore.start, inputEl.value.length) : inputEl.value.length;
        const end = Number.isFinite(restore.end) ? Math.min(restore.end, inputEl.value.length) : start;
        inputEl.setSelectionRange(start, end);
      } catch {}
    }, 0);
  }

  function restoreDefinitionSearchFocus() {
    if (permissionSearchRestore) {
      const restore = permissionSearchRestore;
      permissionSearchRestore = null;
      requestAnimationFrame(() => {
        const inputEl = $("people-permission-search");
        if (!inputEl) return;
        inputEl.focus();
        const start = restore.start ?? inputEl.value.length;
        const end = restore.end ?? start;
        try { inputEl.setSelectionRange(start, end); } catch {}
      });
      return;
    }
    const restore = definitionSearchRestore;
    if (!restore) return;
    definitionSearchRestore = null;
    window.setTimeout(() => {
      const inputEl = $("people-def-search");
      if (!inputEl) return;
      try { inputEl.focus({ preventScroll: true }); } catch { inputEl.focus(); }
      try {
        const start = Number.isFinite(restore.start) ? Math.min(restore.start, inputEl.value.length) : inputEl.value.length;
        const end = Number.isFinite(restore.end) ? Math.min(restore.end, inputEl.value.length) : start;
        inputEl.setSelectionRange(start, end);
      } catch {}
    }, 0);
  }

  function activateTab(tabKey) {
    const next = key(tabKey || "identity") || "identity";
    activeTab = next;
    document.querySelectorAll(".people-tab").forEach((btn) => {
      const on = key(btn.getAttribute("data-tab")) === next;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".people-tab-panel").forEach((panel) => {
      const on = key(panel.getAttribute("data-tab-panel")) === next;
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
  }

  async function refreshAuth(loadOptions = {}) {
    const run = beginLoadTrace(loadOptions.force ? "force refresh" : "initial refresh");
    try {
      await timedLoad("ensure Supabase", ensureSupabase, run);
      const hydrated = hydrateFromMountOptions();
      if (hydrated) {
        markLoad("parent context", "token/access reused from Organization Management", run);
      } else {
        const session = await timedLoad("session check", getStableSession, run);
        token = session?.access_token || "";
        email = session?.user?.email || "";
      }
      if (!token) {
        allAccess = []; adminAccess = null; selectedOrgId = ""; platformAdmin = false; people = []; selected = null; selectedDefinition = null; backend = null;
      } else {
        await loadAccess({ ...obj(loadOptions), run });
      }
      authChecked = true;
      setShellState();
      markLoad("render", `${arr(people).length} people`, run);
      finishLoad("ok", run);
      render();
    } catch (e) {
      backend = { ok:false, message:e.message || String(e) };
      authChecked = true;
      try { setShellState(); } catch {}
      markLoad("error", e.message || String(e), run);
      finishLoad("error", run);
      throw e;
    }
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const started = nowMs();
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    markLoad(`edge ${action}`, `${Math.round(nowMs() - started)}ms • HTTP ${res.status}`);
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
  async function logout() { if (!confirmDiscard()) return; setDirty(false); await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; allAccess = []; adminAccess = null; selectedOrgId = ""; people = []; selected = null; roleFilter = "all"; loginFilter = "all"; options = { statuses: [], membership_classes: [], application_stages: [], roles: [], permissions: [], qualifications: [] }; definitionLists = { statuses: [], membership_classes: [], application_stages: [], groups_roles: [], permissions: [], qualifications: [] }; selectedDefinition = null; selectedPermissionRoleId = ""; permissionDraftKeys = null; authChecked = true; setShellState(); render(); }
  async function resetOwnPassword() { await ensureSupabase(); const loginEmail = clean($("people-login-email")?.value || email).toLowerCase(); if (!loginEmail) throw new Error("Enter email first."); const { error } = await supabaseClient.auth.resetPasswordForEmail(loginEmail, { redirectTo: "https://syncetc.webflow.io/password-reset" }); if (error) throw error; setMessage("Password reset email requested.", "ok"); }

  async function runButton(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { busy = true; if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { busy = false; if (btn) { btn.disabled = false; btn.textContent = old; } render(); }
  }

  async function loadAccess(loadOptions = {}) {
    hydrateFromMountOptions();
    const run = loadOptions.run || activeLoadRun;
    const parentHasAccess = embeddedMode && (obj(mountOptions.accessRow).organization_id || arr(mountOptions.accessRows).length || obj(window.SyncEtcOrganizationManagementModuleContext?.people?.accessRow).organization_id);
    if (!parentHasAccess) {
      const res = await timedLoad("get_my_access", () => call("get_my_access"), run);
      platformAdmin = Boolean(res.platform_admin);
      allAccess = res.access || [];
    }
    const rows = adminRows();
    if (!selectedOrgId) {
      let stored = "";
      try { stored = localStorage.getItem(SELECTED_ORG_KEY) || ""; } catch {}
      const preferred = rows.find((r) => clean(r.organization_id) === stored || clean(r.organization_key) === stored) || adminAccess || rows[0] || null;
      if (preferred) selectedOrgId = String(preferred.organization_id);
    }
    if (selectedOrgId && rows.length && !rows.some((r) => String(r.organization_id) === selectedOrgId) && rows[0]) selectedOrgId = String(rows[0].organization_id);
    if (selectedOrgId) {
      try { localStorage.setItem(SELECTED_ORG_KEY, selectedOrgId); } catch {}
      await loadOrgContext({ ...obj(loadOptions), run });
    }
    setShellState();
  }

  function applyPeopleListResult(res) {
    pageConfig = res?.page || null;
    people = res?.people || [];
    if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
  }

  async function fetchPeopleList(run = activeLoadRun) {
    return timedLoad("people list", () => call("organization_list_people", { organization_id: selectedOrgId, include_archived: true, filter: "all" }), run);
  }

  async function loadOrgContext(loadOptions = {}) {
    if (!selectedOrgId) return;
    const run = loadOptions.run || activeLoadRun;
    if (!loadOptions.force) {
      const cached = getCachedOrgContext(selectedOrgId);
      if (cached) {
        adminAccess = adminAccess || cached.adminAccess || null;
        options = cached.options || { statuses: [], membership_classes: [], application_stages: [], roles: [], permissions: [], qualifications: [] };
        pageConfig = cached.pageConfig || null;
        people = arr(cached.people).slice();
        definitionLists = cached.definitionLists || definitionLists;
        if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
        markLoad("people context cache", `${people.length} people`, run);
        if ((isDefinitionMode() && !arr(definitionLists[definitionConfig(activeDefinitionKind).rowsKey]).length) || (isPermissionsMode() && !arr(definitionLists.groups_roles).length)) {
          await loadPeopleDefinitionLists(run);
          saveOrgContextCache(selectedOrgId);
        }
        setShellState();
        return;
      }
    }
    const dashboardPromise = (embeddedMode && (adminAccess || obj(mountOptions.accessRow).organization_id))
      ? Promise.resolve({ access: adminAccess || obj(mountOptions.accessRow) })
      : timedLoad("admin dashboard", () => call("get_organization_admin_dashboard", { organization_id: selectedOrgId }), run);
    const vocabularyPromise = timedLoad("access vocabulary", () => call("organization_list_access_vocabulary", { organization_id: selectedOrgId }), run);
    const shouldLoadPeopleList = !isDefinitionMode() && !isPermissionsMode();
    const peoplePromise = shouldLoadPeopleList ? fetchPeopleList(run) : Promise.resolve(null);
    const [dash, vocab, peopleResult] = await Promise.all([dashboardPromise, vocabularyPromise, peoplePromise]);
    adminAccess = dash.access || adminAccess || null;
    options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: sortRoles(vocab.roles || []), permissions: vocab.permissions || [], qualifications: vocab.qualifications || [] };
    if (peopleResult) applyPeopleListResult(peopleResult);
    if (isDefinitionMode() || isPermissionsMode()) await loadPeopleDefinitionLists(run);
    saveOrgContextCache(selectedOrgId);
    setShellState();
  }

  async function loadPeople(loadOptions = {}) {
    if (!selectedOrgId) return;
    const res = await fetchPeopleList(loadOptions.run || activeLoadRun);
    applyPeopleListResult(res);
    saveOrgContextCache(selectedOrgId);
  }


  function normalizeDefinitionRow(row, type) {
    const r = { ...obj(row) };
    if (type === "lifecycle-statuses") {
      r.definition_type = "lifecycle-statuses";
      r.definition_id = clean(r.status_definition_id);
      r.definition_key = clean(r.status_key);
      r.label = clean(r.label || r.status_key || "Untitled status");
      r.description = clean(r.description || obj(r.settings_json).description || obj(r.settings_json).notes || "");
      r.ui_status = definitionUiStatus(r);
      r.sort_order = Number(r.sort_order || 100);
    } else if (type === "membership-classes") {
      r.definition_type = "membership-classes";
      r.definition_id = clean(r.membership_class_definition_id);
      r.definition_key = clean(r.class_key);
      r.label = clean(r.label || r.class_key || "Untitled class");
      r.description = clean(r.description || "");
      r.ui_status = definitionUiStatus(r);
      r.sort_order = Number(r.sort_order || 100);
    } else if (type === "application-stages") {
      r.definition_type = "application-stages";
      r.definition_id = clean(r.application_stage_definition_id);
      r.definition_key = clean(r.stage_key);
      r.label = clean(r.label || r.stage_key || "Untitled stage");
      r.description = clean(r.description || "");
      r.ui_status = definitionUiStatus(r);
      r.sort_order = Number(r.sort_order || 100);
    } else if (type === "qualifications") {
      const settings = obj(r.settings_json);
      r.definition_type = "qualifications";
      r.definition_id = clean(r.qualification_definition_id);
      r.definition_key = clean(r.qualification_key);
      r.qualification_type = clean(r.qualification_type || settings.qualification_type || "other");
      r.applies_to = clean(r.applies_to || settings.applies_to || "member");
      r.label = clean(r.label || r.qualification_key || "Untitled qualification");
      r.description = clean(r.description || settings.description || settings.notes || "");
      r.field_style = key(settings.field_style || settings.input_style || defaultQualificationFieldStyle0116O(r));
      r.input_style = r.field_style;
      r.option_values = splitOptionLines0116O(settings.option_values || settings.options || settings.choices || defaultQualificationOptions0116O(r));
      r.show_on_profile = settings.show_on_profile !== false;
      r.ui_status = definitionUiStatus(r);
      r.sort_order = Number(r.sort_order || 100);
    } else {
      const settings = obj(r.settings_json);
      r.definition_type = "groups-roles";
      r.definition_id = clean(r.role_id);
      r.definition_key = clean(r.role_key);
      r.role_type = clean(r.role_type || settings.role_type || settings.group_type || "custom");
      r.label = clean(r.label || r.role_key || "Untitled role");
      r.description = clean(r.description || settings.description || settings.notes || "");
      r.ui_status = definitionUiStatus(r);
      r.sort_order = Number(r.sort_order || 100);
    }
    return r;
  }

  function isProtectedRoleDefinition(row) {
    const rk = key(row?.role_key || row?.definition_key);
    return Boolean(row?.is_system_role) || ["organization-super-admin", "organization-admin", "member"].includes(rk);
  }

  function settingsBool(row, field, fallback = false) {
    const v = obj(row?.settings_json)[field];
    if (v === true || v === false) return v;
    const text = lower(v);
    if (["true", "1", "yes", "on"].includes(text)) return true;
    if (["false", "0", "no", "off"].includes(text)) return false;
    return fallback;
  }

  function definitionUiStatus(row) {
    const status = key(row?.ui_status || row?.status || "active");
    if (row?.archived_at || status === "archived") return "archived";
    if (["inactive", "paused"].includes(status)) return "inactive";
    return "active";
  }

  function setDefinitionListsFromPayload(payload) {
    const data = obj(payload);
    const statuses = arr(data.lifecycle_statuses || data.statuses).map((r) => normalizeDefinitionRow(r, "lifecycle-statuses"));
    const classes = arr(data.membership_classes).map((r) => normalizeDefinitionRow(r, "membership-classes"));
    const stages = arr(data.application_stages || data.stages).map((r) => normalizeDefinitionRow(r, "application-stages"));
    const roles = arr(data.groups_roles || data.organization_roles || data.roles).map((r) => normalizeDefinitionRow(r, "groups-roles"));
    const permissions = arr(data.permissions || data.permission_definitions).slice();
    const qualifications = arr(data.qualifications || data.qualification_definitions).map((r) => normalizeDefinitionRow(r, "qualifications"));
    if (statuses.length || classes.length || stages.length || roles.length || permissions.length || qualifications.length) definitionLists = { statuses, membership_classes: classes, application_stages: stages, groups_roles: roles, permissions, qualifications };
  }

  async function loadPeopleDefinitionLists(run = activeLoadRun) {
    if (!selectedOrgId) return;
    try {
      const data = await timedLoad("people definitions", () => call("organization_list_people_definitions", { organization_id: selectedOrgId, include_archived: true }), run);
      definitionRpcAvailable = true;
      setDefinitionListsFromPayload(data);
    } catch (e) {
      definitionRpcAvailable = false;
      definitionLists = {
        statuses: arr(options.statuses).map((r) => normalizeDefinitionRow(r, "lifecycle-statuses")),
        membership_classes: arr(options.membership_classes).map((r) => normalizeDefinitionRow(r, "membership-classes")),
        application_stages: arr(options.application_stages).map((r) => normalizeDefinitionRow(r, "application-stages")),
        groups_roles: arr(options.roles).map((r) => normalizeDefinitionRow(r, "groups-roles")),
        permissions: arr(options.permissions).slice(),
        qualifications: arr(options.qualifications).map((r) => normalizeDefinitionRow(r, "qualifications"))
      };
      if (isDefinitionMode()) {
        message = e.message || "People definitions could not be loaded.";
        messageKind = "warn";
      }
      markLoad("people definitions fallback", e.message || String(e), run);
    }
  }

  function definitionConfig(kind = activeDefinitionKind) {
    const k = normalizeDefinitionKind(kind) || "lifecycle-statuses";
    if (k === "membership-classes") {
      return {
        kind: k, title: "Membership Classes", kicker: "People",
        helper: "Define the membership or user classes your organization assigns to people.",
        listTitle: "Classes", newLabel: "New class", itemLabel: "class", rowsKey: "membership_classes",
        idField: "membership_class_definition_id", keyField: "class_key", categoryField: "class_category", categoryLabel: "Class type", categoryTip: "Choose the general type this class belongs to.",
        categories: [["member","Member"],["probationary","Probationary"],["family","Family / household"],["honorary","Honorary"],["student","Student"],["non_member","Non-member / limited user"],["user","Generic user"],["external","External / vendor"],["other","Other"]]
      };
    }
    if (k === "groups-roles") {
      return {
        kind: k, title: "Groups / Roles", kicker: "People",
        helper: "Define organization roles and groups before assigning them to people.",
        listTitle: "Roles", newLabel: "New role", itemLabel: "role", rowsKey: "groups_roles",
        idField: "role_id", keyField: "role_key", categoryField: "role_type", categoryLabel: "Role type", categoryTip: "Choose how this role is used in your organization.",
        categories: [["member","Member"],["board","Board"],["officer","Officer"],["committee","Committee"],["instructor","Instructor"],["manager","Manager"],["staff","Staff"],["access","Admin / access"],["group","Group"],["custom","Custom"]]
      };
    }

    if (k === "qualifications") {
      return {
        kind: k, title: "Qualifications", kicker: "People",
        helper: "Set up the qualification and checkout fields that appear on people records.",
        listTitle: "Qualification fields", newLabel: "New qualification field", itemLabel: "qualification field", rowsKey: "qualifications",
        idField: "qualification_definition_id", keyField: "qualification_key", categoryField: "qualification_type", categoryLabel: "Kind", categoryTip: "Choose the general kind of field this is.",
        categories: [["certificate","Certificate"],["rating","Rating"],["checkout","Checkout"],["currency","Currency"],["medical","Medical"],["training","Training"],["endorsement","Endorsement"],["instructor","Instructor"],["other","Other"]]
      };
    }
    if (k === "application-stages") {
      return {
        kind: k, title: "Application / Onboarding Stages", kicker: "People",
        helper: "Define the application and onboarding steps your organization uses before assigning them to people.",
        listTitle: "Stages", newLabel: "New stage", itemLabel: "stage", rowsKey: "application_stages",
        idField: "application_stage_definition_id", keyField: "stage_key", categoryField: "stage_category", categoryLabel: "Stage type", categoryTip: "Choose the general part of the application or onboarding process this stage belongs to.",
        categories: [["application","Application"],["review","Review"],["onboarding","Onboarding"],["terminal","Final step"],["other","Other"]]
      };
    }
    return {
      kind: "lifecycle-statuses", title: "Lifecycle Statuses", kicker: "People",
      helper: "Define the member journey labels your organization uses before assigning them to people.",
      listTitle: "Statuses", newLabel: "New status", itemLabel: "status", rowsKey: "statuses",
      idField: "status_definition_id", keyField: "status_key", categoryField: "lifecycle_category", categoryLabel: "Journey category", categoryTip: "Choose the general part of the member journey this status belongs to.",
      categories: [["prospect","Prospect"],["applicant","Applicant"],["onboarding","Onboarding"],["invited","Invited"],["pending","Pending review"],["active","Active"],["inactive","Inactive"],["suspended","Suspended"],["expelled","Expelled"],["former","Former"],["blocked","Blocked"]]
    };
  }

  function allDefinitionRows(kind = activeDefinitionKind) {
    const cfg = definitionConfig(kind);
    return arr(definitionLists[cfg.rowsKey]).map((r) => normalizeDefinitionRow(r, cfg.kind));
  }

  function sortedDefinitionRows(rows) {
    const rank = { active: 0, inactive: 1, archived: 2 };
    return arr(rows).slice().sort((a,b) => {
      const as = definitionUiStatus(a), bs = definitionUiStatus(b);
      const ar = rank[as] ?? 9, br = rank[bs] ?? 9;
      if (ar !== br) return ar - br;
      const ao = Number(a.sort_order || (as === "archived" ? 999 : 100));
      const bo = Number(b.sort_order || (bs === "archived" ? 999 : 100));
      if (ao !== bo) return ao - bo;
      return clean(a.label).localeCompare(clean(b.label));
    });
  }

  function definitionMatchesSearch(row) {
    const q = lower(definitionSearch);
    if (!q) return true;
    const hay = [row.label, row.description, row.lifecycle_category, row.class_category, row.stage_category, row.role_type, row.role_key, row.qualification_type, row.applies_to, row.dues_behavior, row.default_lifecycle_status_key].map(clean).join(" ").toLowerCase();
    return hay.includes(q);
  }

  function definitionMatchesFilter(row) {
    const f = key(definitionFilter || "all");
    const status = definitionUiStatus(row);
    return f === "all" || f === status;
  }

  function visibleDefinitionRows() {
    return sortedDefinitionRows(allDefinitionRows()).filter((r) => definitionMatchesSearch(r) && definitionMatchesFilter(r));
  }

  function nextDefinitionSortOrder() {
    const rows = allDefinitionRows().filter((r) => definitionUiStatus(r) !== "archived");
    const max = rows.reduce((m, r) => Math.max(m, Number(r.sort_order || 0)), 0);
    return Math.max(10, max + 10);
  }

  function blankDefinition(kind = activeDefinitionKind) {
    const cfg = definitionConfig(kind);
    if (cfg.kind === "membership-classes") {
      return { membership_class_definition_id: "", class_key: "", label: "", description: "", class_category: "member", dues_behavior: "standard", billing_notes: "", privilege_notes: "", default_can_reserve_assets: false, default_can_view_member_documents: true, requires_admin_review: false, is_default: false, status: "active", ui_status: "active", sort_order: nextDefinitionSortOrder() };
    }
    if (cfg.kind === "application-stages") {
      return { application_stage_definition_id: "", stage_key: "", label: "", description: "", stage_category: "application", default_lifecycle_status_key: "applicant", default_can_login: false, default_can_view_portal: false, default_requires_admin_review: true, is_terminal: false, is_default: false, status: "active", ui_status: "active", sort_order: nextDefinitionSortOrder() };
    }
    if (cfg.kind === "qualifications") {
      return { qualification_definition_id: "", qualification_key: "", label: "", description: "", qualification_type: "checkout", applies_to: "member", requires_expiration_date: true, requires_document: false, requires_approval: false, is_default: false, status: "active", ui_status: "active", sort_order: nextDefinitionSortOrder(), settings_json: { field_style: "checkbox_expiration", show_on_profile: true, option_values: [] } };
    }
    if (cfg.kind === "groups-roles") {
      return { role_id: "", role_key: "", label: "", description: "", role_type: "custom", permission_keys: [], is_system_role: false, settings_json: { is_group: true }, status: "active", ui_status: "active", sort_order: nextDefinitionSortOrder() };
    }
    return { status_definition_id: "", status_key: "", label: "", description: "", lifecycle_category: "active", is_active_member: true, can_login: true, can_view_member_portal: true, can_reserve_assets: true, requires_admin_review: false, is_default: false, status: "active", ui_status: "active", sort_order: nextDefinitionSortOrder() };
  }

  function selectedDefinitionId(row = selectedDefinition) {
    const cfg = definitionConfig();
    return clean(row?.[cfg.idField] || row?.definition_id || row?.[cfg.keyField] || row?.definition_key);
  }

  function slugFromLabel(label, fallback = "item") {
    const raw = lower(label || fallback).replace(/[^a-z0-9]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
    return raw || fallback;
  }

  function definitionStatusOptions(value) {
    const v = definitionUiStatus({ status: value });
    const selected = v === "inactive" || v === "archived" ? "paused" : "active";
    const rows = [["active","Active"],["paused","Inactive"]];
    return rows.map(([optionValue, label]) => `<option value="${esc(optionValue)}" ${selected === optionValue ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function definitionCategoryOptions(cfg, value) {
    const current = key(value) || (cfg.kind === "membership-classes" ? "member" : cfg.kind === "groups-roles" ? "custom" : cfg.kind === "application-stages" ? "application" : cfg.kind === "qualifications" ? "checkout" : "active");
    return cfg.categories.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function duesBehaviorOptions(value) {
    const current = key(value || "standard");
    const rows = [["standard","Standard"],["included_family","Included family"],["honorary_conditional","Honorary / conditional"],["reduced","Reduced"],["none","None"],["custom","Custom"]];
    return rows.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function qualificationAppliesToOptions(value) {
    const current = key(value || "member");
    const rows = [["member","Member"],["instructor","Instructor"],["asset","Asset / aircraft"],["general","General"],["other","Other"]];
    return rows.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
  }


  const QUALIFICATION_FIELD_STYLE_OPTIONS_0116O = [
    ["checkbox", "Checkbox"],
    ["checkbox_expiration", "Checkbox + expiration"],
    ["date_expiration", "Completion date + expiration"],
    ["class_expiration", "Class / option + expiration"],
    ["status_expiration", "Status + expiration"],
    ["notes", "Notes only"]
  ];

  function splitOptionLines0116O(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    return clean(value).split(/\r?\n|,/).map(clean).filter(Boolean);
  }

  function defaultQualificationFieldStyle0116O(row = {}) {
    const qk = qualificationDefinitionKey(row);
    const qt = key(row.qualification_type || obj(row.settings_json).qualification_type);
    if (qk === "medical-certificate") return "class_expiration";
    if (["flight-review", "instrument-proficiency-check", "organization-checkout"].includes(qk)) return "date_expiration";
    if (["cfi", "cfii", "mei"].includes(qk)) return "checkbox_expiration";
    if (qk === "ifr-rated") return "checkbox";
    if (["night-checkout", "ifr-checkout", "high-performance-checkout", "complex-checkout", "tailwheel-checkout", "club-instructor", "safety-pilot-approved"].includes(qk)) return "checkbox_expiration";
    if (qt === "medical") return "class_expiration";
    if (qt === "currency") return "date_expiration";
    if (["checkout", "instructor", "certificate", "rating", "endorsement"].includes(qt)) return "checkbox_expiration";
    return "checkbox";
  }

  function defaultQualificationOptions0116O(row = {}) {
    const qk = qualificationDefinitionKey(row);
    if (qk === "medical-certificate") return ["First Class", "Second Class", "Third Class", "BasicMed", "None"];
    return [];
  }

  function instructorQualificationKeys0116P(row = {}) {
    const qk = qualificationDefinitionKey(row);
    return ["cfi", "cfii", "mei"].includes(qk);
  }

  function defaultQualificationIssuedLabel0116P(row = {}, style = "") {
    const qk = qualificationDefinitionKey(row);
    if (style === "date_expiration") return "Completed";
    if (qk === "medical-certificate") return "Last medical date";
    if (instructorQualificationKeys0116P(row)) return "Credential issued";
    return "Issued";
  }

  function defaultQualificationExpirationLabel0116P(row = {}) {
    const qk = qualificationDefinitionKey(row);
    if (instructorQualificationKeys0116P(row)) return "Privileges current through";
    if (qk === "club-instructor") return "Approval current through";
    if (qk === "medical-certificate") return "Medical expires";
    if (qk === "flight-review") return "Flight review expires";
    if (qk === "instrument-proficiency-check") return "IPC expires";
    if (["night-checkout", "ifr-checkout", "high-performance-checkout", "complex-checkout", "tailwheel-checkout"].includes(qk)) return "Checkout expires";
    if (qk === "safety-pilot-approved") return "Approval expires";
    return "Expires";
  }

  function qualificationSettings0116O(row = {}) {
    const settings = obj(row.settings_json);
    const style = key(settings.field_style || settings.input_style || defaultQualificationFieldStyle0116O(row)) || "checkbox";
    const normalizedStyle = QUALIFICATION_FIELD_STYLE_OPTIONS_0116O.some(([k]) => k === style) ? style : "checkbox";
    const optionValues = splitOptionLines0116O(settings.option_values || settings.options || settings.choices || defaultQualificationOptions0116O(row));
    const rawExpirationLabel = clean(settings.expiration_label);
    const rawIssuedLabel = clean(settings.issued_label);
    return {
      field_style: normalizedStyle,
      option_values: optionValues,
      issued_label: rawIssuedLabel || defaultQualificationIssuedLabel0116P(row, normalizedStyle),
      expiration_label: rawExpirationLabel && !(instructorQualificationKeys0116P(row) && lower(rawExpirationLabel) === "certificate expires") ? rawExpirationLabel : defaultQualificationExpirationLabel0116P(row),
      notes_label: clean(settings.notes_label || "Notes"),
      show_on_profile: settings.show_on_profile !== false
    };
  }

  function qualificationFieldStyleOptions0116O(value) {
    const current = key(value || "checkbox");
    return QUALIFICATION_FIELD_STYLE_OPTIONS_0116O.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function definitionFieldLabel(label, tip = "") {
    return `${esc(label)}${tip ? ` <button class="people-info-btn" type="button" tabindex="0" aria-label="${esc(tip)}" title="${esc(tip)}">?</button>` : ""}`;
  }

  function lifecycleStatusOptions(value) {
    const current = key(value || "applicant");
    const rows = arr(options.statuses).filter((r) => !r.archived_at && definitionUiStatus(r) !== "archived");
    if (!rows.length) {
      return [["applicant","Applicant"],["invited","Invited"],["pending","Pending"],["active","Active"],["inactive","Inactive"]].map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
    }
    return rows.map((r) => { const k = clean(r.status_key || r.definition_key); return `<option value="${esc(k)}" ${current === key(k) ? "selected" : ""}>${esc(clean(r.label || k))}</option>`; }).join("");
  }

  function renderDefinitionList() {
    const cfg = definitionConfig();
    const rows = visibleDefinitionRows();
    const allRows = allDefinitionRows();
    const counts = { all: 0, active: 0, inactive: 0, archived: 0 };
    allRows.forEach((r) => { if (!definitionMatchesSearch(r)) return; counts.all += 1; counts[definitionUiStatus(r)] = (counts[definitionUiStatus(r)] || 0) + 1; });
    const filters = [["all","All"],["active","Active"],["inactive","Inactive"],["archived","Archived"]];
    return `<aside class="people-list-panel">
      <div class="people-list-head"><div><h3>${esc(cfg.listTitle)}</h3><p>Search, filter, and reorder ${esc(cfg.itemLabel)} items.</p></div></div>
      <div class="people-toolbar-row"><button id="people-def-refresh" class="people-btn secondary" type="button">Refresh</button></div>
      <label class="people-field people-status-filter"><span>Status filter</span><select id="people-def-filter">${filters.map(([f,label]) => `<option value="${esc(f)}" ${definitionFilter===f ? "selected" : ""}>${esc(label)} (${counts[f] || 0})</option>`).join("")}</select></label>
      <div class="people-search-wrap"><input id="people-def-search" value="${esc(definitionSearch)}" placeholder="Search labels, notes, categories…"><button id="people-def-clear-search" class="people-icon-btn" title="Clear" type="button">×</button></div>
      <div class="people-sort-hint">Drag rows or use arrows to set display order. Archived rows stay at the bottom.</div>
      <div class="people-compact-list people-def-list">${rows.length ? rows.map(renderDefinitionRow).join("") : `<div class="people-empty-row">No ${esc(cfg.itemLabel)} items match this search.</div>`}</div>
    </aside>`;
  }

  function renderDefinitionRow(row) {
    const cfg = definitionConfig();
    const id = selectedDefinitionId(row);
    const selectedClass = selectedDefinitionId() === id ? "selected" : "";
    const status = definitionUiStatus(row);
    const muted = status === "archived" ? "archived" : status === "inactive" ? "restricted" : "";
    const category = clean(row[cfg.categoryField]);
    const meta = [category, row.description].filter(Boolean).join(" • ");
    const canMove = status !== "archived";
    return `<div class="people-def-row people-person-card ${selectedClass} ${muted}" data-def-row data-def-id="${esc(id)}" draggable="${canMove ? "true" : "false"}">
      <span class="people-def-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
      <button class="people-def-main" data-def-open="${esc(id)}" type="button"><span class="person-main"><strong>${esc(row.label || "Untitled")}</strong><small>${esc(meta || "No notes")}</small></span><span class="person-badges">${status === "archived" ? "<em>Archived</em>" : status === "inactive" ? "<em>Inactive</em>" : ""}${row.is_default ? "<em>Default</em>" : ""}</span></button>
      <span class="people-def-order"><button class="people-order-button" data-def-move="up" data-def-id="${esc(id)}" type="button" ${canMove ? "" : "disabled"} title="Move up">↑</button><button class="people-order-button" data-def-move="down" data-def-id="${esc(id)}" type="button" ${canMove ? "" : "disabled"} title="Move down">↓</button></span>
    </div>`;
  }

  function renderDefinitionEditor() {
    const cfg = definitionConfig();
    const row = selectedDefinition;
    const mayEdit = canManagePeople(selectedRow());
    if (!row) return `<section class="people-editor-panel people-empty"><h3>Select a ${esc(cfg.itemLabel)}</h3><p>Choose an item on the left, or create a new one.</p>${!definitionRpcAvailable ? `<p class="people-warning">This list could not be edited right now.</p>` : ""}</section>`;
    const status = definitionUiStatus(row);
    const archived = status === "archived";
    const protectedRole = cfg.kind === "groups-roles" && isProtectedRoleDefinition(row);
    const archiveButton = archived ? `<button id="people-def-restore" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Restore</button>` : `<button id="people-def-archive" class="people-btn danger" type="button" ${mayEdit && !protectedRole ? "" : "disabled"}>Archive</button>`;
    const statusValue = status === "inactive" || archived ? "paused" : "active";
    const statusDisabled = archived || protectedRole;
    const statusHelp = archived ? `<small>Restore this item before changing active/inactive.</small>` : protectedRole ? `<small>This built-in role is protected from archive/inactive changes.</small>` : "";
    const categoryTip = cfg.categoryTip || "Choose the general category for this item.";
    const commonTop = `${input("people-def-label", "Display name", row.label)}<label class="people-field"><span>Status</span><select id="people-def-ui-status" ${statusDisabled ? "disabled" : ""}>${definitionStatusOptions(statusValue)}</select>${statusHelp}</label><label class="people-field"><span>${definitionFieldLabel(cfg.categoryLabel, categoryTip)}</span><select id="people-def-category" ${archived ? "disabled" : ""}>${definitionCategoryOptions(cfg, row[cfg.categoryField])}</select></label>${textarea("people-def-description", "Description / notes", row.description || obj(row.settings_json).description || "")}`;
    let body = "";
    if (cfg.kind === "membership-classes") {
      body = `${commonTop}<div class="people-form-grid"><label class="people-field"><span>${definitionFieldLabel("Dues behavior", "Choose the broad dues treatment for this class.")}</span><select id="people-def-dues-behavior" ${archived ? "disabled" : ""}>${duesBehaviorOptions(row.dues_behavior)}</select></label>${textarea("people-def-privilege-notes", "Privilege notes", row.privilege_notes || "")}${textarea("people-def-billing-notes", "Billing notes", row.billing_notes || "")}</div><div class="people-check-grid">${checkbox("people-def-can-reserve", "Default can reserve/use assets", row.default_can_reserve_assets)}${checkbox("people-def-view-docs", "Default can view member documents", row.default_can_view_member_documents)}${checkbox("people-def-review", "Requires admin review", row.requires_admin_review)}${checkbox("people-def-default", "Default class", row.is_default)}</div>`;
    } else if (cfg.kind === "application-stages") {
      body = `${commonTop}<div class="people-form-grid"><label class="people-field"><span>${definitionFieldLabel("Suggested lifecycle status", "Choose the lifecycle status normally associated with this stage.")}</span><select id="people-def-lifecycle-status" ${archived ? "disabled" : ""}>${lifecycleStatusOptions(row.default_lifecycle_status_key)}</select></label></div><div class="people-check-grid">${checkbox("people-def-stage-login", "Allow login during this stage", row.default_can_login)}${checkbox("people-def-stage-portal", "Allow portal during this stage", row.default_can_view_portal)}${checkbox("people-def-stage-review", "Requires admin review", row.default_requires_admin_review)}${checkbox("people-def-stage-terminal", "Final step", row.is_terminal)}${checkbox("people-def-default", "Default stage", row.is_default)}</div>`;
    } else if (cfg.kind === "qualifications") {
      const qSettings = qualificationSettings0116O(row);
      const optionText = qSettings.option_values.join("\n");
      body = `${commonTop}<div class="people-form-grid"><label class="people-field"><span>${definitionFieldLabel("Applies to", "Choose where this qualification is normally used.")}</span><select id="people-def-applies-to" ${archived ? "disabled" : ""}>${qualificationAppliesToOptions(row.applies_to)}</select></label><label class="people-field"><span>${definitionFieldLabel("Profile field", "Choose the row style shown on the person profile.")}</span><select id="people-def-field-style" ${archived ? "disabled" : ""}>${qualificationFieldStyleOptions0116O(qSettings.field_style)}</select></label><label class="people-field"><span>${definitionFieldLabel("Expires/current-through label", "Optional label for the expiration or current-through date column.")}</span><input id="people-def-expiration-label" type="text" value="${esc(qSettings.expiration_label)}" ${archived ? "disabled" : ""}></label>${textarea("people-def-option-values", "Options", optionText, "Use one line per option when the profile field uses a class or dropdown.")}<label class="people-field"><span>${definitionFieldLabel("Completed/issued label", "Optional label for the completed or issued date column.")}</span><input id="people-def-issued-label" type="text" value="${esc(qSettings.issued_label)}" ${archived ? "disabled" : ""}></label></div><div class="people-check-grid">${checkbox("people-def-show-profile", "Show on person profile", qSettings.show_on_profile)}${checkbox("people-def-requires-expiration", "Uses current-through / expiration date", row.requires_expiration_date)}${checkbox("people-def-requires-document", "Allow document later", row.requires_document)}${checkbox("people-def-requires-approval", "Requires approval", row.requires_approval)}</div>`;
    } else if (cfg.kind === "groups-roles") {
      body = `${commonTop}<div class="people-check-grid">${checkbox("people-def-show-public", "Show on public information pages", settingsBool(row, "show_on_public_info", false))}${checkbox("people-def-is-group", "Available as a group", settingsBool(row, "is_group", true))}</div>`;
    } else {
      body = `${commonTop}<div class="people-check-grid">${checkbox("people-def-active-member", "Counts as active member", row.is_active_member)}${checkbox("people-def-can-login", "Can log in", row.can_login)}${checkbox("people-def-view-portal", "Can view member portal", row.can_view_member_portal)}${checkbox("people-def-can-reserve", "Can reserve/use assets", row.can_reserve_assets)}${checkbox("people-def-review", "Requires admin review", row.requires_admin_review)}${checkbox("people-def-default", "Default status", row.is_default)}</div>`;
    }
    const saveDisabled = !mayEdit || archived;
    return `<section class="people-editor-panel people-editor people-def-editor">
      <div class="people-editor-head"><div><h3>${esc(row.label || `New ${cfg.itemLabel}`)}</h3><div class="people-pill-row">${pill(status === "inactive" ? "Inactive" : archived ? "Archived" : "Active", archived || status === "inactive" ? "warn" : "ok")}${pill(row[cfg.categoryField])}${row.is_default ? pill("Default") : ""}</div></div></div>
      ${!mayEdit ? `<p class="people-warning">You can view these items, but you do not have permission to edit them.</p>` : ""}
      <div class="people-tab-panel active"><div class="people-form-grid">${body}</div></div>
      <div class="people-action-row"><div class="people-save-state ${dirty ? "dirty" : ""}"><span>${dirty ? "Unsaved changes" : "Saved"}</span>${message ? `<small class="people-action-status ${esc(messageKind)}">${esc(message)}</small>` : ""}</div><div class="people-action-buttons"><button id="people-def-reset" class="people-btn secondary" type="button">Reset</button>${archiveButton}<button id="people-def-save" class="people-btn" type="button" ${saveDisabled ? "disabled" : ""}>Save</button></div></div>
    </section>`;
  }


  function renderPermissionsList0116L() {
    const rows = permissionRoleRows0116L().filter((role) => {
      const q = lower(permissionSearch);
      if (!q) return true;
      return [role.label, role.description, role.role_type, role.role_key].map(clean).join(" ").toLowerCase().includes(q);
    });
    const selectedId = selectedDefinitionId(selectedPermissionRole0116L());
    return `<aside class="people-list-panel people-permission-list-panel">
      <div class="people-list-head"><div><h3>Roles</h3><p>Choose a role or group, then select what it can do.</p></div></div>
      <div class="people-toolbar-row"><button id="people-permission-refresh" class="people-btn secondary" type="button">Refresh</button></div>
      <div class="people-search-wrap"><input id="people-permission-search" value="${esc(permissionSearch)}" placeholder="Search roles and groups…"><button id="people-permission-clear-search" class="people-icon-btn" title="Clear" type="button">×</button></div>
      <div class="people-sort-hint">Capabilities apply when this role is assigned to a person.</div>
      <div class="people-compact-list people-permission-role-list">${rows.length ? rows.map((role) => {
        const id = selectedDefinitionId(role);
        const locked = permissionRoleIsLocked0116L(role);
        const count = unique(role.permission_keys || []).length;
        return `<button class="people-person-card people-permission-role-card ${selectedId === id ? "selected" : ""}" data-permission-role="${esc(id)}" type="button"><span class="person-main"><strong>${esc(role.label || role.role_key || "Untitled role")}</strong><small>${esc(clean(role.role_type || "Role"))}</small></span><span class="person-badges">${locked ? "<em>Built-in</em>" : ""}<em>${esc(String(count))} selected</em></span></button>`;
      }).join("") : `<div class="people-empty-row">No roles match this search.</div>`}</div>
    </aside>`;
  }

  function renderPermissionCheckbox0116L(permissionKey, label, selectedKeys, locked) {
    const checked = selectedKeys.includes(permissionKey);
    const capabilityLocked = locked || permissionCapabilityIsLocked0116L(permissionKey);
    return `<label class="people-permission-capability ${checked ? "enabled" : ""} ${capabilityLocked ? "locked" : ""}"><input type="checkbox" data-permission-key="${esc(permissionKey)}" ${checked ? "checked" : ""} ${capabilityLocked ? "disabled" : ""}><span>${esc(label)}${permissionCapabilityIsLocked0116L(permissionKey) ? `<small>Protected</small>` : ""}</span></label>`;
  }

  function renderPermissionsEditor0116L() {
    const role = selectedPermissionRole0116L();
    const mayEdit = canManageSafeRoles(selectedRow());
    if (!role) return `<section class="people-editor-panel people-empty"><h3>Select a role</h3><p>Choose a role on the left to review its capabilities.</p></section>`;
    const selectedKeys = permissionKeysForSelectedRole0116L();
    const locked = permissionRoleIsLocked0116L(role);
    const grouped = PERMISSION_GROUPS_0116L.map((group) => `<section class="people-permission-group"><h4>${esc(group.label)}</h4><div class="people-permission-grid">${group.capabilities.map(([permissionKey,label]) => renderPermissionCheckbox0116L(permissionKey, label, selectedKeys, locked || !mayEdit)).join("")}</div></section>`).join("");
    const status = definitionUiStatus(role);
    const saveDisabled = !mayEdit || locked || status === "archived";
    const help = locked ? `<p class="people-warning">This built-in role is protected. Use Groups / Roles for custom roles, then assign those roles from Members / People.</p>` : `<p class="people-soft-note">Select the capabilities this role should grant. Some administrator access is protected.</p>`;
    return `<section class="people-editor-panel people-editor people-permission-editor">
      <div class="people-editor-head"><div><h3>${esc(role.label || role.role_key || "Role")}</h3><div class="people-pill-row">${pill(status === "inactive" ? "Inactive" : "Active", status === "inactive" ? "warn" : "ok")}${pill(role.role_type || "Role")}${locked ? pill("Built-in") : ""}</div></div></div>
      ${!mayEdit ? `<p class="people-warning">You can view capabilities, but you do not have permission to change them.</p>` : help}
      <div class="people-permission-groups">${grouped}</div>
      <div class="people-action-row"><div class="people-save-state ${dirty ? "dirty" : ""}"><span>${dirty ? "Unsaved changes" : "Saved"}</span>${message ? `<small class="people-action-status ${esc(messageKind)}">${esc(message)}</small>` : ""}</div><div class="people-action-buttons"><button id="people-permission-reset" class="people-btn secondary" type="button">Reset</button><button id="people-permission-save" class="people-btn" type="button" ${saveDisabled ? "disabled" : ""}>Save</button></div></div>
    </section>`;
  }

  function renderPermissionsModule0116L(warningMessage = "") {
    return `<section class="people-module-header"><div><span class="people-kicker">People</span><h2>Permissions / Capabilities</h2><p>Choose what each role or group can do across the organization.</p></div><div class="people-header-actions">${!embeddedMode ? renderOrgSelector() : ""}</div></section>${warningMessage}<section class="people-workbench">${renderPermissionsList0116L()}${renderPermissionsEditor0116L()}</section>`;
  }

  function collectPermissionKeys0116L() {
    const visibleKeys = new Set(PERMISSION_GROUPS_0116L.flatMap((group) => group.capabilities.map(([permissionKey]) => clean(permissionKey))));
    const role = selectedPermissionRole0116L();
    const preserved = unique(role?.permission_keys || []).filter((permissionKey) => !visibleKeys.has(permissionKey));
    const selectedVisible = Array.from(document.querySelectorAll("[data-permission-key]")).filter((el) => el.checked).map((el) => clean(el.getAttribute("data-permission-key"))).filter(Boolean);
    return unique([...preserved, ...selectedVisible]).sort();
  }

  async function saveRolePermissions0116L() {
    const role = selectedPermissionRole0116L();
    if (!role) throw new Error("Select a role first.");
    if (permissionRoleIsLocked0116L(role)) throw new Error("This built-in role cannot be changed here.");
    const data = await call("organization_save_role_permissions", { organization_id: selectedOrgId, role_id: selectedDefinitionId(role), permission_keys: collectPermissionKeys0116L() });
    setDefinitionListsFromPayload(data);
    await refreshAccessVocabularyAfterDefinitionSave();
    const match = allDefinitionRows("groups-roles").find((r) => selectedDefinitionId(r) === selectedDefinitionId(role));
    if (match) selectedPermissionRoleId = selectedDefinitionId(match);
    permissionDraftKeys = null;
    setDirty(false);
    setMessage("Capabilities saved.", "ok");
  }

  function resetRolePermissions0116L() {
    if (!confirmDiscard("Reset unsaved capability changes?")) return;
    permissionDraftKeys = null;
    setDirty(false);
    setMessage("Changes reset.", "ok");
    render();
  }

  function renderDefinitionModule(warningMessage = "") {
    const cfg = definitionConfig();
    return `<section class="people-module-header"><div><span class="people-kicker">${esc(cfg.kicker)}</span><h2>${esc(cfg.title)}</h2><p>${esc(cfg.helper)}</p></div><div class="people-header-actions">${!embeddedMode ? renderOrgSelector() : ""}<button id="people-def-new" class="people-btn outline" type="button">${esc(cfg.newLabel)}</button></div></section>${warningMessage}<section class="people-workbench">${renderDefinitionList()}${renderDefinitionEditor()}</section>`;
  }

  function collectDefinitionPayload() {
    const cfg = definitionConfig();
    const original = obj(selectedDefinition);
    if (definitionUiStatus(original) === "archived") throw new Error(`Restore this ${cfg.itemLabel} before saving changes.`);
    const label = clean($("people-def-label")?.value);
    if (!label) throw new Error(`Enter a display name for this ${cfg.itemLabel}.`);
    const uiStatus = key($("people-def-ui-status")?.value || "active");
    const base = {
      [cfg.idField]: clean(original[cfg.idField] || original.definition_id),
      [cfg.keyField]: clean(original[cfg.keyField] || original.definition_key) || slugFromLabel(label, cfg.itemLabel),
      label, description: clean($("people-def-description")?.value), status: uiStatus, ui_status: uiStatus,
      is_default: bool($("people-def-default")?.checked),
      sort_order: Number(original.sort_order || nextDefinitionSortOrder() || 100)
    };
    if (cfg.kind === "membership-classes") {
      base.class_category = clean($("people-def-category")?.value) || "member";
      base.dues_behavior = clean($("people-def-dues-behavior")?.value) || "standard";
      base.billing_notes = clean($("people-def-billing-notes")?.value);
      base.privilege_notes = clean($("people-def-privilege-notes")?.value);
      base.default_can_reserve_assets = bool($("people-def-can-reserve")?.checked);
      base.default_can_view_member_documents = bool($("people-def-view-docs")?.checked);
      base.requires_admin_review = bool($("people-def-review")?.checked);
    } else if (cfg.kind === "application-stages") {
      base.stage_category = clean($("people-def-category")?.value) || "application";
      base.default_lifecycle_status_key = clean($("people-def-lifecycle-status")?.value) || "applicant";
      base.default_can_login = bool($("people-def-stage-login")?.checked);
      base.default_can_view_portal = bool($("people-def-stage-portal")?.checked);
      base.default_requires_admin_review = bool($("people-def-stage-review")?.checked);
      base.is_terminal = bool($("people-def-stage-terminal")?.checked);
    } else if (cfg.kind === "qualifications") {
      const originalSettings = qualificationSettings0116O(original);
      const optionValues = splitOptionLines0116O($("people-def-option-values")?.value || originalSettings.option_values || []);
      base.qualification_type = clean($("people-def-category")?.value) || "checkout";
      base.applies_to = clean($("people-def-applies-to")?.value) || "member";
      base.requires_expiration_date = bool($("people-def-requires-expiration")?.checked);
      base.requires_document = bool($("people-def-requires-document")?.checked);
      base.requires_approval = bool($("people-def-requires-approval")?.checked);
      base.settings_json = {
        ...obj(original.settings_json),
        field_style: key($("people-def-field-style")?.value || originalSettings.field_style) || "checkbox",
        input_style: key($("people-def-field-style")?.value || originalSettings.field_style) || "checkbox",
        option_values: optionValues,
        issued_label: clean($("people-def-issued-label")?.value || originalSettings.issued_label || "Issued"),
        expiration_label: clean($("people-def-expiration-label")?.value || originalSettings.expiration_label || "Expires"),
        show_on_profile: bool($("people-def-show-profile")?.checked)
      };
    } else if (cfg.kind === "groups-roles") {
      base.role_type = clean($("people-def-category")?.value) || "custom";
      base.show_on_public_info = bool($("people-def-show-public")?.checked);
      base.is_group = bool($("people-def-is-group")?.checked);
      if (isProtectedRoleDefinition(original)) base.status = "active";
    } else {
      base.lifecycle_category = clean($("people-def-category")?.value) || "active";
      base.is_active_member = bool($("people-def-active-member")?.checked);
      base.can_login = bool($("people-def-can-login")?.checked);
      base.can_view_member_portal = bool($("people-def-view-portal")?.checked);
      base.can_reserve_assets = bool($("people-def-can-reserve")?.checked);
      base.requires_admin_review = bool($("people-def-review")?.checked);
    }
    return base;
  }

  async function refreshAccessVocabularyAfterDefinitionSave() {
    try {
      const vocab = await call("organization_list_access_vocabulary", { organization_id: selectedOrgId });
      options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: sortRoles(vocab.roles || []), permissions: vocab.permissions || [], qualifications: vocab.qualifications || [] };
      saveOrgContextCache(selectedOrgId);
    } catch {}
  }

  async function saveDefinitionPayload(payload) {
    const cfg = definitionConfig();
    const action = cfg.kind === "membership-classes" ? "organization_save_membership_class" : cfg.kind === "application-stages" ? "organization_save_application_stage" : cfg.kind === "groups-roles" ? "organization_save_role_definition" : cfg.kind === "qualifications" ? "organization_save_qualification_definition" : "organization_save_lifecycle_status";
    const data = await call(action, { organization_id: selectedOrgId, ...obj(payload) });
    setDefinitionListsFromPayload(data);
    await refreshAccessVocabularyAfterDefinitionSave();
    return data;
  }

  async function saveDefinition() {
    const payload = collectDefinitionPayload();
    const data = await saveDefinitionPayload(payload);
    const cfg = definitionConfig();
    const saved = cfg.kind === "membership-classes" ? obj(data.membership_class || data.saved_definition) : cfg.kind === "application-stages" ? obj(data.application_stage || data.saved_definition) : cfg.kind === "groups-roles" ? obj(data.role_definition || data.organization_role || data.saved_definition) : cfg.kind === "qualifications" ? obj(data.qualification_definition || data.qualification || data.saved_definition) : obj(data.lifecycle_status || data.saved_definition);
    selectedDefinition = normalizeDefinitionRow(saved[cfg.idField] || saved[cfg.keyField] ? saved : payload, cfg.kind);
    const match = allDefinitionRows().find((r) => selectedDefinitionId(r) === selectedDefinitionId(selectedDefinition));
    if (match) selectedDefinition = { ...match };
    setDirty(false);
    setMessage(`${cfg.itemLabel.charAt(0).toUpperCase() + cfg.itemLabel.slice(1)} saved.`, "ok");
  }

  async function resetDefinition() {
    if (!confirmDiscard("Reset unsaved definition changes?")) return;
    const id = selectedDefinitionId();
    selectedDefinition = id ? (allDefinitionRows().find((r) => selectedDefinitionId(r) === id) || selectedDefinition) : blankDefinition();
    setDirty(false);
    setMessage("Changes reset.", "ok");
  }

  async function archiveDefinition(restore = false) {
    if (!selectedDefinition) throw new Error("Select an item first.");
    const cfg = definitionConfig();
    if (!restore && !confirm(`Archive this ${cfg.itemLabel}? Existing people can keep their current value, but it should no longer be assigned to new records.`)) return;
    const id = clean(selectedDefinition[cfg.idField] || selectedDefinition.definition_id);
    if (!id) throw new Error(`Save this ${cfg.itemLabel} before archiving it.`);
    let action = "";
    let payload = { organization_id: selectedOrgId };
    if (cfg.kind === "membership-classes") {
      action = restore ? "organization_restore_membership_class" : "organization_archive_membership_class";
      payload = { organization_id: selectedOrgId, membership_class_definition_id: id };
    } else if (cfg.kind === "application-stages") {
      action = restore ? "organization_restore_application_stage" : "organization_archive_application_stage";
      payload = { organization_id: selectedOrgId, application_stage_definition_id: id };
    } else if (cfg.kind === "groups-roles") {
      action = restore ? "organization_restore_role_definition" : "organization_archive_role_definition";
      payload = { organization_id: selectedOrgId, role_id: id };
    } else if (cfg.kind === "qualifications") {
      action = restore ? "organization_restore_qualification_definition" : "organization_archive_qualification_definition";
      payload = { organization_id: selectedOrgId, qualification_definition_id: id };
    } else {
      action = restore ? "organization_restore_lifecycle_status" : "organization_archive_lifecycle_status";
      payload = { organization_id: selectedOrgId, status_definition_id: id };
    }
    const data = await call(action, payload);
    setDefinitionListsFromPayload(data);
    await refreshAccessVocabularyAfterDefinitionSave();
    const match = allDefinitionRows().find((r) => selectedDefinitionId(r) === id);
    selectedDefinition = match ? { ...match } : null;
    setDirty(false);
    setMessage(restore ? `${cfg.itemLabel.charAt(0).toUpperCase() + cfg.itemLabel.slice(1)} restored.` : `${cfg.itemLabel.charAt(0).toUpperCase() + cfg.itemLabel.slice(1)} archived.`, "ok");
  }

  async function moveDefinitionTo(sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (dirty && !confirmDiscard("Save or discard changes before reordering definitions.")) return;
    setDirty(false);
    const cfg = definitionConfig();
    const allRows = allDefinitionRows();
    const movable = sortedDefinitionRows(allRows).filter((r) => definitionUiStatus(r) !== "archived");
    const sourceIndex = movable.findIndex((r) => selectedDefinitionId(r) === sourceId);
    if (sourceIndex < 0) return;
    const [sourceRow] = movable.splice(sourceIndex, 1);
    let insertAt = movable.findIndex((r) => selectedDefinitionId(r) === targetId);
    if (insertAt < 0) return;
    if (placeAfter) insertAt += 1;
    movable.splice(Math.max(0, insertAt), 0, sourceRow);
    const reordered = movable.map((r, index) => ({ ...r, sort_order: (index + 1) * 10 }));
    const byId = new Map(reordered.map((r) => [selectedDefinitionId(r), r]));
    definitionLists[cfg.rowsKey] = allRows.map((r) => byId.get(selectedDefinitionId(r)) || r);
    render();
    try {
      const action = cfg.kind === "membership-classes" ? "organization_reorder_membership_classes" : cfg.kind === "application-stages" ? "organization_reorder_application_stages" : cfg.kind === "groups-roles" ? "organization_reorder_role_definitions" : cfg.kind === "qualifications" ? "organization_reorder_qualification_definitions" : "organization_reorder_lifecycle_statuses";
      const payload = cfg.kind === "membership-classes"
        ? { organization_id: selectedOrgId, membership_class_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
        : cfg.kind === "application-stages"
          ? { organization_id: selectedOrgId, application_stage_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
          : cfg.kind === "groups-roles"
            ? { organization_id: selectedOrgId, role_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
            : cfg.kind === "qualifications"
              ? { organization_id: selectedOrgId, qualification_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
              : { organization_id: selectedOrgId, status_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) };
      const data = await call(action, payload);
      setDefinitionListsFromPayload(data);
      saveOrgContextCache(selectedOrgId);
      setMessage("Order saved.", "ok");
    } catch (e) {
      setMessage(e.message || String(e), "warn");
      await loadPeopleDefinitionLists();
    }
  }

  async function moveDefinitionByButton(id, direction) {
    const rows = sortedDefinitionRows(allDefinitionRows()).filter((r) => definitionUiStatus(r) !== "archived");
    const index = rows.findIndex((r) => selectedDefinitionId(r) === id);
    if (index < 0) return;
    const target = direction === "up" ? rows[index - 1] : rows[index + 1];
    if (!target) return;
    await moveDefinitionTo(id, selectedDefinitionId(target), direction === "down");
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
      return aLast.localeCompare(bLast) || aFirst.localeCompare(bFirst) || clean(a.display_name).localeCompare(clean(b.display_name)) || clean(a.primary_email).localeCompare(clean(b.primary_email));
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
  function roleKeySet(keysOrRow) { return new Set((Array.isArray(keysOrRow) ? keysOrRow : arr(keysOrRow?.role_keys)).map(key).filter(Boolean)); }
  function roleKeyArrayHasAny(keys, expected) { const set = roleKeySet(keys); return arr(expected).some((roleKey) => set.has(key(roleKey))); }
  function hasAdminRoleKeys(keysOrRow) { return roleKeyArrayHasAny(Array.isArray(keysOrRow) ? keysOrRow : arr(keysOrRow?.role_keys), ["organization-super-admin", "organization-admin"]); }
  function hasSuperAdminRoleKeys(keysOrRow) { return roleKeyArrayHasAny(Array.isArray(keysOrRow) ? keysOrRow : arr(keysOrRow?.role_keys), ["organization-super-admin"]); }
  function isManagerRole(roleKey) { return ["applicant-manager","asset-manager","content-editor","document-manager","event-manager","gallery-manager"].includes(key(roleKey)); }
  function isAccessRelevantRole(roleKey) { const rk = key(roleKey); return ["organization-super-admin", "organization-admin", "board-member"].includes(rk) || isManagerRole(rk) || rk.endsWith("-admin") || rk.endsWith("-manager") || rk.endsWith("-editor"); }
  function roleSettings(role) { return obj(role?.settings_json); }
  function roleTypeOf(role) {
    const rk = key(role?.role_key || role?.definition_key);
    const explicit = key(role?.role_type || roleSettings(role).role_type || roleSettings(role).group_type);
    if (explicit) return explicit;
    if (["organization-super-admin", "organization-admin"].includes(rk) || rk.endsWith("-admin")) return "admin";
    if (["board-member", "director", "president", "vice-president", "secretary", "treasurer"].includes(rk)) return "board";
    if (isManagerRole(rk) || rk.endsWith("-manager") || rk.endsWith("-editor")) return "manager";
    if (rk.includes("instructor") || rk.includes("cfi")) return "instructor";
    if (rk === "member") return "member";
    return "custom";
  }
  function roleDefinitionByKey(roleKey) { const rk = key(roleKey); return sortRoles(options.roles).find((role) => key(role.role_key) === rk) || null; }
  function roleTypeOfKey(roleKey) { return roleTypeOf(roleDefinitionByKey(roleKey) || { role_key: roleKey }); }
  function personHasRoleType(p, types) { const wanted = new Set(arr(types).map(key)); return arr(p.role_keys).map(key).some((rk) => wanted.has(roleTypeOfKey(rk))); }
  function roleTypeLabel(type) {
    const t = key(type || "custom");
    return ({ admin: "Administrative access", access: "Administrative access", board: "Board / officers", officer: "Board / officers", committee: "Committees", instructor: "Instructors", manager: "Managers", staff: "Staff", member: "Member roles", group: "Groups", custom: "Other roles" })[t] || "Other roles";
  }
  function roleTypeSortValue(type) {
    const t = key(type || "custom");
    return ({ admin: 10, access: 15, board: 20, officer: 25, manager: 30, instructor: 40, committee: 50, staff: 60, member: 70, group: 80, custom: 90 })[t] || 95;
  }
  function activeAssignableRoles() { return sortRoles(options.roles).filter((role) => !role.archived_at && key(role.status || "active") !== "archived"); }
  function sortedQualificationDefinitions() {
    const fromDefinitions = arr(definitionLists.qualifications).length ? arr(definitionLists.qualifications) : arr(options.qualifications).map((r) => normalizeDefinitionRow(r, "qualifications"));
    return fromDefinitions.slice().filter((row) => !row.archived_at && key(row.status || row.ui_status || "active") !== "archived").sort((a,b) => Number(a.sort_order || 100) - Number(b.sort_order || 100) || clean(a.label || a.qualification_key).localeCompare(clean(b.label || b.qualification_key)));
  }
  function qualificationDefinitionId(row) { return clean(row?.qualification_definition_id || row?.definition_id); }
  function qualificationDefinitionKey(row) { return key(row?.qualification_key || row?.definition_key || row?.label); }
  function assignmentQualificationId(row) { return clean(row?.qualification_definition_id || row?.definition_id); }
  function assignmentQualificationKey(row) { return key(row?.qualification_key || row?.definition_key); }
  function qualificationAssignmentsFor(row = selected || {}) { return arr(row.qualification_assignments).map(obj); }
  function qualificationAssignmentFor(definition, row = selected || {}) {
    const id = qualificationDefinitionId(definition);
    const k = qualificationDefinitionKey(definition);
    return qualificationAssignmentsFor(row).find((assignment) => (id && assignmentQualificationId(assignment) === id) || (k && assignmentQualificationKey(assignment) === k)) || null;
  }
  function qualificationLabel(row) { return clean(row?.label || row?.qualification_label || row?.qualification_key || row?.definition_key || "Qualification"); }
  function safeDomId(value) { return key(value || "item") || "item"; }
  function isQualificationChecked(definition, row = selected || {}) {
    const assignment = qualificationAssignmentFor(definition, row);
    if (!assignment) return false;
    const status = key(assignment.assignment_status || assignment.status || "active");
    return status === "active" || status === "waived";
  }
  function isAdminAccessRelevant(p) { return hasAdminRoleKeys(p) || arr(p.role_keys).some(isAccessRelevantRole) || bool(p.login_linked); }
  function isOwnSelectedPerson(row = selected || {}) {
    const actor = selectedRow() || {};
    const actorPersonId = clean(actor.person_id || actor.core_person_id);
    if (actorPersonId && clean(row.person_id) === actorPersonId) return true;
    const actorEmail = lower(email || actor.email || actor.primary_email);
    const rowEmail = lower(row.primary_email || row.email);
    return Boolean(actorEmail && rowEmail && actorEmail === rowEmail);
  }
  function isPlatformInternal(p) { return bool(p.is_platform_internal) || key(p.title).startsWith("platform-admin"); }

  function personMatchesSearch(p, searchText) {
    const s = lower(searchText);
    if (!s) return true;
    const hay = [p.display_name,p.first_name,p.last_name,p.primary_email,p.email,p.phone,p.primary_phone,p.member_number,p.title,p.lifecycle_status_label,p.lifecycle_status_key,p.membership_class_label,p.membership_class_key,p.application_stage_label,p.application_stage_key,...arr(p.role_labels),...arr(p.role_keys),...arr(p.qualification_labels),...arr(p.qualification_keys),...arr(p.login_emails)].map(clean).join(" ").toLowerCase();
    return hay.includes(s);
  }

  function personMatchesLens(p, lens) {
    const f = key(lens || "all") || "all";
    if (isPlatformInternal(p) && f !== "platform-internal") return false;
    const status = key(p.lifecycle_status_key);
    const stage = key(p.application_stage_key);
    const stageCat = key(p.application_stage_category);
    const lifecycle = key(p.lifecycle_category);
    const classKey = key(p.membership_class_key);
    const classCat = key(p.membership_class_category);
    const archived = isArchivedRow(p);
    const restricted = isRestrictedRow(p);
    if (f === "archived") return archived;
    if (f === "all") return true;
    if (archived) return false;
    if (f === "active") return status === "active";
    if (f === "applicants") return ["applicant","invited","pending"].includes(status) || ["applicant","prospect"].includes(stageCat);
    if (f === "waitlist") return stage === "waitlist";
    if (f === "onboarding") return stage === "onboarding" || stageCat === "onboarding" || ["invited","pending"].includes(status);
    if (f === "former") return ["former","inactive"].includes(status) || ["former","inactive"].includes(lifecycle);
    if (f === "restricted") return restricted;
    if (["admins-access", "admin-access", "access"].includes(f)) return isAdminAccessRelevant(p);
    if (f === "admins") return hasAnyRole(p, ["organization-super-admin", "organization-admin"]);
    if (f === "board") return hasRole(p, "board-member") || personHasRoleType(p, ["board", "officer"]);
    if (f === "managers") return arr(p.role_keys).some(isManagerRole) || personHasRoleType(p, ["manager"]);
    if (f === "users") return hasRole(p, "member") && !hasAnyRole(p, ["organization-super-admin", "organization-admin"]);
    if (f === "non-member") return classKey === "non-member" || classCat === "non-member" || classCat === "non_member";
    if (f === "no-login") return !bool(p.login_linked);
    if (f === "platform-internal") return isPlatformInternal(p);
    return true;
  }

  function personMatchesRoleFilter(p, selectedRole = roleFilter) {
    const rf = key(selectedRole || "all");
    return rf === "all" || arr(p.role_keys).map(key).includes(rf);
  }

  function personMatchesLoginFilter(p, selectedLogin = loginFilter) {
    const lf = key(selectedLogin || "all");
    if (lf === "all") return true;
    if (lf === "has-login") return bool(p.login_linked);
    if (lf === "no-login") return !bool(p.login_linked);
    return true;
  }

  function filteredPeople() {
    const rows = people.filter((p) => personMatchesLens(p, filter) && personMatchesRoleFilter(p) && personMatchesLoginFilter(p) && personMatchesSearch(p, search));
    return sortPersonRows(rows);
  }

  function primaryPeopleFilterKeys() {
    return ["all","active","applicants","waitlist","onboarding","former","restricted","archived"];
  }

  function normalizePrimaryPeopleFilter(value) {
    const f = key(value || "all") || "all";
    return primaryPeopleFilterKeys().includes(f) ? f : "all";
  }

  function counts() {
    const keys = primaryPeopleFilterKeys();
    const out = Object.fromEntries(keys.map((f) => [f, 0]));
    people.forEach((p) => {
      if (!personMatchesSearch(p, search)) return;
      keys.forEach((f) => { if (personMatchesLens(p, f)) out[f] += 1; });
    });
    return out;
  }

  function roleFilterCounts() {
    const out = { all: 0 };
    activeAssignableRoles().forEach((role) => { out[key(role.role_key)] = 0; });
    people.forEach((p) => {
      if (!personMatchesSearch(p, search) || !personMatchesLens(p, filter) || !personMatchesLoginFilter(p)) return;
      out.all += 1;
      arr(p.role_keys).map(key).forEach((rk) => { if (Object.prototype.hasOwnProperty.call(out, rk)) out[rk] += 1; });
    });
    return out;
  }

  function loginFilterCounts() {
    const out = { all: 0, "has-login": 0, "no-login": 0 };
    people.forEach((p) => {
      if (!personMatchesSearch(p, search) || !personMatchesLens(p, filter) || !personMatchesRoleFilter(p)) return;
      out.all += 1;
      if (bool(p.login_linked)) out["has-login"] += 1;
      else out["no-login"] += 1;
    });
    return out;
  }

  function renderLogin() {
    if (token) return "";
    return `<div id="syncetc-page-login" class="people-login"><input id="people-login-email" type="email" placeholder="Email"><input id="people-login-password" type="password" placeholder="Password"><button id="people-login" class="people-btn">Log in</button><button id="people-reset-own" class="people-link-btn" type="button">Forgot password?</button></div>`;
  }

  function renderOrgSelector() {
    const rows = adminRows();
    if (!rows.length) return "";
    if (rows.length === 1) return `<div class="people-context-single">${esc(rows[0].organization_name)} <span>${esc(rows[0].organization_key)}</span></div>`;
    return `<select id="people-org-select">${rows.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select>`;
  }

  function activeRoleFilterLabel() {
    const rf = key(roleFilter || "all");
    if (rf === "all") return "";
    const role = roleDefinitionByKey(rf) || {};
    return clean(role.label || role.name || rf.replace(/-/g, " ")) || "Selected role";
  }

  function activeLoginFilterLabel() {
    const lf = key(loginFilter || "all");
    if (lf === "has-login") return "Has login";
    if (lf === "no-login") return "No login";
    return "";
  }

  function renderAdvancedPeopleFilters() {
    const roleCounts = roleFilterCounts();
    const loginCounts = loginFilterCounts();
    const roleRows = activeAssignableRoles();
    const hasRoleFilter = key(roleFilter || "all") !== "all";
    const hasLoginFilter = key(loginFilter || "all") !== "all";
    const hasAdvanced = hasRoleFilter || hasLoginFilter;
    const chips = [
      hasRoleFilter ? `<button class="people-filter-chip" data-clear-role-filter type="button">Group / role: ${esc(activeRoleFilterLabel())} ×</button>` : "",
      hasLoginFilter ? `<button class="people-filter-chip" data-clear-login-filter type="button">Login: ${esc(activeLoginFilterLabel())} ×</button>` : ""
    ].filter(Boolean).join("");
    const roleOptions = [`<option value="all" ${key(roleFilter)==="all" ? "selected" : ""}>Any group / role (${roleCounts.all || 0})</option>`].concat(roleRows.map((role) => {
      const rk = key(role.role_key);
      const label = clean(role.label || role.name || role.role_key || "Role");
      return `<option value="${esc(rk)}" ${key(roleFilter)===rk ? "selected" : ""}>${esc(label)} (${roleCounts[rk] || 0})</option>`;
    })).join("");
    const loginOptions = [
      ["all", "Any login status", loginCounts.all || 0],
      ["has-login", "Has login", loginCounts["has-login"] || 0],
      ["no-login", "No login", loginCounts["no-login"] || 0]
    ].map(([value,label,count]) => `<option value="${esc(value)}" ${key(loginFilter)===value ? "selected" : ""}>${esc(label)} (${count})</option>`).join("");
    return `<div class="people-advanced-filters">
      <button id="people-advanced-filters-toggle" class="people-link-btn people-advanced-toggle" type="button">${advancedFiltersOpen ? "Hide advanced filters" : "Advanced filters"}</button>
      ${hasAdvanced ? `<div class="people-active-filters"><span>Active filters:</span>${chips}<button id="people-clear-advanced-filters" class="people-link-btn" type="button">Clear all</button></div>` : ""}
      ${advancedFiltersOpen ? `<div class="people-advanced-panel"><label class="people-field people-role-filter"><span>Group / role</span><select id="people-role-filter-select">${roleOptions}</select></label><label class="people-field people-login-filter"><span>Login</span><select id="people-login-filter-select">${loginOptions}</select></label></div>` : ""}
    </div>`;
  }


  function renderFinder() {
    filter = normalizePrimaryPeopleFilter(filter);
    const c = counts();
    const rows = filteredPeople();
    const filters = [["all","All"],["active","Active"],["applicants","Applicants"],["waitlist","Waitlist"],["onboarding","Onboarding"],["former","Former"],["restricted","Suspended / Expelled"],["archived","Archived"]];
    return `<aside class="people-list-panel">
      <div class="people-list-head"><div><h3>People</h3><p>Search and filter organization records.</p></div></div>
      <div class="people-toolbar-row"><button id="people-export" class="people-btn secondary" type="button">Export</button><button id="people-print" class="people-btn secondary" type="button">Print</button><button id="people-refresh" class="people-btn secondary" type="button">Refresh</button></div>
      <label class="people-field people-status-filter"><span>Status</span><select id="people-filter-select">${filters.map(([f,label]) => `<option value="${esc(f)}" ${filter===f ? "selected" : ""}>${esc(label)} (${c[f] || 0})</option>`).join("")}</select></label>
      ${renderAdvancedPeopleFilters()}
      <div class="people-search-wrap"><input id="people-search" value="${esc(search)}" placeholder="Search names, emails, phones, roles…"><button id="people-clear-search" class="people-icon-btn" title="Clear" type="button">×</button></div>
      <div class="people-sort-hint">Sorted by last name. Archived rows stay visible in All and are muted at the bottom.</div>
      <div class="people-compact-list">${rows.length ? rows.map(renderPersonCard).join("") : `<div class="people-empty-row">No people match this search.</div>`}</div>
    </aside>`;
  }



  function renderPersonCard(p) {
    const selectedClass = selected?.membership_id === p.membership_id ? "selected" : "";
    const archived = isArchivedRow(p) ? "archived" : "";
    const restricted = isRestrictedRow(p) ? "restricted" : "";
    const primaryRole = hasSuperAdminRoleKeys(p) ? "Super Admin" : hasAnyRole(p, ["organization-admin"]) ? "Admin" : arr(p.role_keys).some(isManagerRole) || personHasRoleType(p, ["manager"]) ? "Manager" : hasRole(p, "board-member") || personHasRoleType(p, ["board", "officer"]) ? "Board" : (arr(p.role_labels).find(Boolean) || "");
    const badges = [p.lifecycle_status_label || p.lifecycle_status_key, p.membership_class_label, primaryRole, p.login_linked ? "Login" : "No login"].filter(Boolean).slice(0, 4);
    return `<button class="people-person-card ${selectedClass} ${archived} ${restricted}" data-open="${esc(p.membership_id)}" type="button"><span class="person-main"><strong>${esc(finderDisplayName(p))}</strong><small>${esc(clean(p.primary_email || p.email || p.primary_phone || p.phone || "No contact on file"))}</small></span><span class="person-badges">${badges.map((b) => `<em>${esc(b)}</em>`).join("")}</span></button>`;
  }



  function qualificationStatusOptions(value, includeBlank = false) {
    const current = key(value || "");
    const rows = [["inactive","Not current"],["active","Active / approved"],["pending","Pending"],["expired","Expired"],["revoked","Revoked"],["waived","Waived"]];
    const blank = includeBlank ? `<option value="" ${!current ? "selected" : ""}>Not set</option>` : "";
    return blank + rows.map(([v,label]) => `<option value="${esc(v)}" ${current === v ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function qualificationAssignmentSetting0116O(assignment, ...keys) {
    const settings = obj(assignment?.settings_json);
    for (const k of keys) {
      const direct = clean(assignment?.[k]);
      if (direct) return direct;
      const nested = clean(settings[k]);
      if (nested) return nested;
    }
    return "";
  }

  function qualificationChoiceOptions0116O(definition, assignment = {}) {
    const settings = qualificationSettings0116O(definition);
    const selectedValue = qualificationAssignmentSetting0116O(assignment, "option_value", "value", "level");
    const options = settings.option_values.length ? settings.option_values : defaultQualificationOptions0116O(definition);
    const rows = [`<option value="" ${!selectedValue ? "selected" : ""}>Not set</option>`];
    rows.push(...options.map((option) => `<option value="${esc(option)}" ${selectedValue === option ? "selected" : ""}>${esc(option)}</option>`));
    if (selectedValue && !options.includes(selectedValue)) rows.push(`<option value="${esc(selectedValue)}" selected>${esc(selectedValue)}</option>`);
    return rows.join("");
  }

  function visibleQualificationDefinitions0116P() {
    return sortedQualificationDefinitions().filter((definition) => {
      const status = definitionUiStatus(definition);
      const settings = qualificationSettings0116O(definition);
      return status === "active" && settings.show_on_profile !== false;
    });
  }

  function qualificationCellInput0116P(html) {
    return `<div class="people-qualification-cell-input">${html || `<span class="people-qualification-empty">—</span>`}</div>`;
  }

  function qualificationDateInput0116P(id, label, value, disabled) {
    return `<label class="people-field people-qualification-grid-field"><span>${esc(label)}</span><input id="${esc(id)}" type="date" value="${esc(value || "")}" ${disabled}></label>`;
  }

  function renderQualificationAssignmentRows(row, mayEdit) {
    const definitions = visibleQualificationDefinitions0116P();
    if (!definitions.length) {
      return `<section class="people-qualification-panel"><div class="people-empty-row compact">No active qualification fields are set to show on person profiles.</div></section>`;
    }
    return `<section class="people-qualification-panel people-qualification-grid-panel"><div class="people-role-section-head"><h4>Qualifications</h4><span>${esc(definitions.length)} fields</span></div><div class="people-qualification-table-wrap" tabindex="0" aria-label="Qualification fields"><div class="people-qualification-table" role="table"><div class="people-qualification-table-row people-qualification-table-head" role="row"><div role="columnheader">Qualification</div><div role="columnheader">Status / value</div><div role="columnheader">Completed / issued</div><div role="columnheader">Expires / current through</div><div role="columnheader">Notes</div></div>${definitions.map((definition) => {
      const id = qualificationDefinitionId(definition);
      const domId = safeDomId(id || qualificationDefinitionKey(definition));
      const assignment = qualificationAssignmentFor(definition, row) || {};
      const settings = qualificationSettings0116O(definition);
      const fieldStyle = key(settings.field_style || "checkbox") || "checkbox";
      const assignmentSettings = obj(assignment.settings_json);
      const assigned = isQualificationChecked(definition, row);
      const status = key(assignment.assignment_status || assignment.status || (assigned ? "active" : ""));
      const issued = clean(assignment.issued_date || assignment.issued_at || "").slice(0,10);
      const expires = clean(assignment.expiration_date || assignment.expires_at || "").slice(0,10);
      const notes = clean(assignment.notes || "");
      const optionValue = clean(assignmentSettings.option_value || assignment.option_value || assignment.class_value || "");
      const disabled = mayEdit ? "" : "disabled";
      const checkLabel = fieldStyle === "checkbox" ? "Yes" : "Current / approved";
      let valueCell = `<span class="people-qualification-empty">—</span>`;
      let issuedCell = `<span class="people-qualification-empty">—</span>`;
      let expiresCell = `<span class="people-qualification-empty">—</span>`;
      let notesCell = `<label class="people-field people-qualification-grid-field"><span>Notes</span><input id="people-qual-notes-${esc(domId)}" type="text" value="${esc(notes)}" ${disabled}></label>`;

      if (fieldStyle === "class_expiration") {
        const options = [`<option value="">Not recorded</option>`].concat(settings.option_values.map((option) => `<option value="${esc(option)}" ${optionValue === option ? "selected" : ""}>${esc(option)}</option>`));
        if (optionValue && !settings.option_values.includes(optionValue)) options.push(`<option value="${esc(optionValue)}" selected>${esc(optionValue)}</option>`);
        valueCell = `<label class="people-field people-qualification-grid-field"><span>Class / level</span><select id="people-qual-option-${esc(domId)}" ${disabled}>${options.join("")}</select></label>`;
        issuedCell = qualificationDateInput0116P(`people-qual-issued-${domId}`, settings.issued_label || "Issued", issued, disabled);
        expiresCell = qualificationDateInput0116P(`people-qual-expires-${domId}`, settings.expiration_label || "Expires", expires, disabled);
      } else if (fieldStyle === "date_expiration") {
        issuedCell = qualificationDateInput0116P(`people-qual-issued-${domId}`, settings.issued_label || "Completed", issued, disabled);
        expiresCell = qualificationDateInput0116P(`people-qual-expires-${domId}`, settings.expiration_label || "Expires", expires, disabled);
      } else if (fieldStyle === "status_expiration") {
        valueCell = `<label class="people-field people-qualification-grid-field"><span>Status</span><select id="people-qual-status-${esc(domId)}" ${disabled}>${qualificationStatusOptions(status || "inactive")}</select></label>`;
        expiresCell = qualificationDateInput0116P(`people-qual-expires-${domId}`, settings.expiration_label || "Expires", expires, disabled);
      } else if (fieldStyle === "notes") {
        notesCell = `<label class="people-field people-qualification-grid-field"><span>${esc(settings.notes_label || "Notes")}</span><input id="people-qual-notes-${esc(domId)}" type="text" value="${esc(notes)}" ${disabled}></label>`;
      } else if (fieldStyle === "checkbox_expiration") {
        valueCell = `<label class="people-qualification-check compact"><input id="people-qual-checked-${esc(domId)}" type="checkbox" ${assigned ? "checked" : ""} ${disabled}><span><strong>${esc(checkLabel)}</strong></span></label>`;
        expiresCell = qualificationDateInput0116P(`people-qual-expires-${domId}`, settings.expiration_label || "Expires", expires, disabled);
      } else {
        valueCell = `<label class="people-qualification-check compact"><input id="people-qual-checked-${esc(domId)}" type="checkbox" ${assigned ? "checked" : ""} ${disabled}><span><strong>${esc(checkLabel)}</strong></span></label>`;
      }

      return `<div class="people-qualification-table-row people-qualification-profile-field" role="row" data-qualification-field="${esc(domId)}" data-qualification-definition-id="${esc(id)}" data-qualification-key="${esc(qualificationDefinitionKey(definition))}" data-field-style="${esc(fieldStyle)}" data-assignment-id="${esc(clean(assignment.person_qualification_assignment_id || assignment.qualification_assignment_id || ""))}">
        <div class="people-qualification-title" role="cell"><strong>${esc(qualificationLabel(definition))}</strong>${definition.description ? `<small>${esc(definition.description)}</small>` : ""}</div>
        <div role="cell">${qualificationCellInput0116P(valueCell)}</div>
        <div role="cell">${qualificationCellInput0116P(issuedCell)}</div>
        <div role="cell">${qualificationCellInput0116P(expiresCell)}</div>
        <div role="cell">${qualificationCellInput0116P(notesCell)}</div>
      </div>`;
    }).join("")}</div></div></section>`;
  }

  function normalizeExistingQualificationAssignmentForSave0116P(assignment = {}) {
    const a = obj(assignment);
    const settings = obj(a.settings_json);
    return {
      person_qualification_assignment_id: clean(a.person_qualification_assignment_id || a.qualification_assignment_id || a.assignment_id),
      qualification_assignment_id: clean(a.person_qualification_assignment_id || a.qualification_assignment_id || a.assignment_id),
      qualification_definition_id: clean(a.qualification_definition_id || a.definition_id),
      qualification_key: key(a.qualification_key || a.definition_key),
      assignment_status: key(a.assignment_status || a.status || "active") || "active",
      status: key(a.assignment_status || a.status || "active") || "active",
      issued_at: clean(a.issued_at || a.issued_date || "").slice(0,10),
      issued_date: clean(a.issued_date || a.issued_at || "").slice(0,10),
      expires_at: clean(a.expires_at || a.expiration_date || "").slice(0,10),
      expiration_date: clean(a.expiration_date || a.expires_at || "").slice(0,10),
      notes: clean(a.notes || ""),
      settings_json: settings,
    };
  }

  function collectQualificationAssignments() {
    const visibleFields = Array.from(document.querySelectorAll("[data-qualification-field]"));
    const renderedIds = new Set();
    const renderedKeys = new Set();
    const visibleAssignments = visibleFields.map((field) => {
      const domId = clean(field.getAttribute("data-qualification-field"));
      const definitionId = clean(field.getAttribute("data-qualification-definition-id"));
      const definitionKey = key(field.getAttribute("data-qualification-key"));
      if (definitionId) renderedIds.add(definitionId);
      if (definitionKey) renderedKeys.add(definitionKey);
      const fieldStyle = key(field.getAttribute("data-field-style"));
      const assignmentId = clean(field.getAttribute("data-assignment-id"));
      const notes = clean($(`people-qual-notes-${domId}`)?.value);
      const issued = clean($(`people-qual-issued-${domId}`)?.value);
      const expires = clean($(`people-qual-expires-${domId}`)?.value);
      const optionValue = clean($(`people-qual-option-${domId}`)?.value);
      const checked = bool($(`people-qual-checked-${domId}`)?.checked);
      const explicitStatus = key($(`people-qual-status-${domId}`)?.value || "");
      let include = false;
      let assignmentStatus = explicitStatus || "active";
      const settings = { field_style: fieldStyle };
      if (optionValue) settings.option_value = optionValue;
      if (["checkbox", "checkbox_expiration"].includes(fieldStyle)) {
        include = checked || Boolean(expires || notes);
        assignmentStatus = checked ? "active" : include ? "inactive" : "inactive";
        settings.checked = checked;
      } else if (fieldStyle === "class_expiration") {
        include = Boolean(optionValue || issued || expires || notes);
        assignmentStatus = include ? "active" : "inactive";
      } else if (fieldStyle === "date_expiration") {
        include = Boolean(issued || expires || notes);
        assignmentStatus = include ? "active" : "inactive";
      } else if (fieldStyle === "status_expiration") {
        include = Boolean(explicitStatus && explicitStatus !== "inactive" || expires || notes);
        assignmentStatus = explicitStatus || (include ? "active" : "inactive");
      } else if (fieldStyle === "notes") {
        include = Boolean(notes);
        assignmentStatus = include ? "active" : "inactive";
      } else {
        include = checked || Boolean(notes);
        assignmentStatus = checked ? "active" : include ? "inactive" : "inactive";
        settings.checked = checked;
      }
      if (!definitionId || !include) return null;
      return {
        person_qualification_assignment_id: assignmentId,
        qualification_assignment_id: assignmentId,
        qualification_definition_id: definitionId,
        qualification_key: definitionKey,
        assignment_status: assignmentStatus,
        status: assignmentStatus,
        issued_at: issued,
        issued_date: issued,
        expires_at: expires,
        expiration_date: expires,
        notes,
        settings_json: settings,
      };
    }).filter(Boolean);

    const hiddenExisting = qualificationAssignmentsFor(selected || {}).filter((assignment) => {
      const id = assignmentQualificationId(assignment);
      const k = assignmentQualificationKey(assignment);
      if (id && renderedIds.has(id)) return false;
      if (k && renderedKeys.has(k)) return false;
      return Boolean(id || k);
    }).map(normalizeExistingQualificationAssignmentForSave0116P).filter((assignment) => assignment.qualification_definition_id || assignment.qualification_key);

    return visibleAssignments.concat(hiddenExisting);
  }

  function hasCollectedQualificationKey(assignments, keys) {
    const wanted = new Set(arr(keys).map(key));
    return arr(assignments).some((assignment) => wanted.has(key(assignment.qualification_key)));
  }

  function checkboxValue(id, fallback = false) {
    const el = $(id);
    return el ? bool(el.checked) : Boolean(fallback);
  }

  function bindQualificationAssignmentEvents() {
    document.querySelectorAll("[data-qualification-field] input, [data-qualification-field] select, [data-qualification-field] textarea").forEach((input) => {
      input.addEventListener("input", () => setDirty(true));
      input.addEventListener("change", () => setDirty(true));
    });
  }


  function renderPersonTimeline(row) {
    const notes = Array.isArray(row.timeline_notes) ? row.timeline_notes : [];
    return `<div class="people-form-grid"><label class="people-field people-field-wide"><span>Add admin note</span><textarea id="people-timeline-note" placeholder="Add a dated admin note for this person. These notes are not visible to the person."></textarea><small>Notes added here can carry forward from applicant history and continue through the person/member lifecycle.</small></label></div><div class="people-inline-actions"><button id="people-add-timeline-note" class="people-btn secondary" type="button">Add note</button></div><div class="people-timeline-list">${notes.length ? notes.map((n) => `<div class="people-note-card"><strong>${esc((n.application_id && !String(n.title||'').toLowerCase().includes('applicant')) ? `Applicant history — ${n.title || n.note_type || 'Note'}` : (n.title || n.note_type || "Note"))}</strong><span>${esc(new Date(n.created_at || Date.now()).toLocaleString())}</span><p>${esc(n.body || "")}</p><small>${esc(n.actor_name || n.actor_email || "System")}${n.application_id ? ' • Applicant-origin history' : ''}</small></div>`).join("") : `<div class="people-empty-row">No admin timeline notes yet.</div>`}</div>`;
  }


  function renderRoleAssignmentCheckbox(role, rowRoleKeys, mayEditAnyRole, mayEditSuperAdmin) {
    const rk = key(role.role_key);
    const protectedAdminRole = isSuperAdminRole(rk);
    const locked = !mayEditAnyRole || (protectedAdminRole && !mayEditSuperAdmin);
    const hint = protectedAdminRole && !mayEditSuperAdmin ? "Super Admin locked" : "";
    return checkbox(`role-${rk}`, role.label || rk, rowRoleKeys.includes(rk), locked, hint);
  }

  function renderRoleAssignmentSection(title, roles, rowRoleKeys, mayEditAnyRole, mayEditSuperAdmin, emptyText = "No roles in this section yet.") {
    const visible = arr(roles).filter(Boolean);
    return `<section class="people-role-section"><div class="people-role-section-head"><h4>${esc(title)}</h4><span>${esc(visible.length)} available</span></div>${visible.length ? `<div class="people-role-grid">${visible.map((role) => renderRoleAssignmentCheckbox(role, rowRoleKeys, mayEditAnyRole, mayEditSuperAdmin)).join("")}</div>` : `<div class="people-empty-row compact">${esc(emptyText)}</div>`}</section>`;
  }

  function renderAccessTab(row, roles, mayEdit, mayEditAnyRole, mayEditSuperAdmin) {
    const rowRoleKeys = arr(row.role_keys).map(key);
    const roleLabels = arr(row.role_labels).length ? arr(row.role_labels) : rowRoleKeys;
    const activeRoles = activeAssignableRoles();
    const adminRoles = activeRoles.filter((role) => ["admin", "access"].includes(roleTypeOf(role)) || hasAdminRoleKeys([role.role_key]) || isAccessRelevantRole(role.role_key));
    const nonAdminRoles = activeRoles.filter((role) => !adminRoles.some((adminRole) => key(adminRole.role_key) === key(role.role_key)));
    const roleGroups = Array.from(nonAdminRoles.reduce((map, role) => {
      const type = roleTypeOf(role);
      const label = roleTypeLabel(type);
      if (!map.has(label)) map.set(label, { label, order: roleTypeSortValue(type), roles: [] });
      map.get(label).roles.push(role);
      return map;
    }, new Map()).values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const adminLevel = hasSuperAdminRoleKeys(row) ? "Organization Super Admin" : hasAdminRoleKeys(row) ? "Organization Admin" : arr(row.role_keys).some(isManagerRole) || personHasRoleType(row, ["manager"]) ? "Manager access" : hasRole(row, "board-member") || personHasRoleType(row, ["board", "officer"]) ? "Board access" : "Standard access";
    const ownWarning = isOwnSelectedPerson(row) ? `<p class="people-warning">You are editing your own access. Changes that would remove your organization admin access are blocked.</p>` : "";
    const accessSummary = `<div class="people-access-summary">
      <div><span>Login</span><strong>${row.login_linked ? "Linked" : "Not linked"}</strong></div>
      <div><span>Access level</span><strong>${esc(adminLevel)}</strong></div>
      <div><span>Assigned groups / roles</span><strong>${esc(roleLabels.length ? roleLabels.join(", ") : "No groups or roles assigned")}</strong></div>
    </div>`;
    const adminSection = renderRoleAssignmentSection("Administrative access", adminRoles, rowRoleKeys, mayEditAnyRole, mayEditSuperAdmin, "No administrative roles are available.");
    const groupSections = roleGroups.length ? roleGroups.map((group) => renderRoleAssignmentSection(group.label, group.roles, rowRoleKeys, mayEditAnyRole, mayEditSuperAdmin)).join("") : `<section class="people-role-section"><div class="people-empty-row compact">Create groups or roles in Groups / Roles, then assign them here.</div></section>`;
    return `<div class="people-access-callout"><div><strong>Login actions</strong><p>Send login help or password reset instructions for this person.</p></div><div class="people-inline-actions"><button id="people-invite" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Send invite</button><button id="people-reset-password" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Password reset</button></div></div>${accessSummary}${ownWarning}<div class="people-role-assignment-wrap"><p class="muted">Assign the organization hats this person should hold. Most groups are for organization lists, communication, and workflow routing. Admin roles should be limited to trusted people.</p>${adminSection}${groupSections}</div>${!mayEditAnyRole ? `<p class="people-warning">Role editing is locked for your account.</p>` : !mayEditSuperAdmin ? `<p class="people-warning">Organization Super Admin is locked. You can manage ordinary groups, roles, and Organization Admin.</p>` : ""}`;
  }


  function renderAviationDetails0116O(aviation, applicant, background) {
    return `<section class="people-aviation-details"><div class="people-section-head"><div><h4>Flight profile</h4><p>General aviation background that is not controlled by qualification definitions.</p></div></div><div class="people-form-grid">${input("people-application-date","Application date",aviation.application_date || applicant.application_date,"date")}${input("people-employer","Employer",background.employer)}${input("people-occupation","Occupation",background.occupation)}${input("people-ratings","Ratings",aviation.ratings)}${input("people-pilot-certificate","Pilot certificate #",aviation.pilot_certificate_number)}${input("people-aircraft-types","Aircraft types",aviation.aircraft_types)}${input("people-bfr-aircraft","Flight review aircraft",aviation.bfr_aircraft)}${input("people-clubs-fbos","Prior clubs/FBOs",aviation.clubs_fbos)}${input("people-flying-type","Type of flying",aviation.flying_type)}${input("people-total-hours","Total hours",aviation.total_hours,"number")}${input("people-night-hours","Night hours",aviation.total_night_hours,"number")}${input("people-ifr-hours","IFR hours",aviation.total_ifr_hours,"number")}${input("people-complex-hours","Complex hours",aviation.total_complex_hours,"number")}</div></section>`;
  }


  function renderEditor() {
    const row = selected;
    const access = selectedRow();
    const mayEdit = canManagePeople(access);
    const mayEditAnyRole = canManageSafeRoles(access);
    const mayEditSuperAdmin = canManageSuperAdminRoles(access);
    if (!row) return `<section class="people-editor-panel people-empty"><h3>Select a person</h3><p>Choose someone on the left, or create a new person. This single People workbench covers members, applicants, onboarding users, former people, restricted records, and administrators.</p></section>`;

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
    const archiveButton = isArchived ? `<button id="people-restore" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Restore</button>` : `<button id="people-archive" class="people-btn danger" type="button" ${mayEdit ? "" : "disabled"}>Archive</button>`;
    const preferred = clean(row.preferred_first_name || name.preferred_first_name || name.preferred_name);
    const middle = clean(row.middle_name || name.middle_name || name.middle_initial);
    const suffix = clean(row.suffix || name.suffix);
    const displayPreview = calculatedDisplayName(row.first_name, preferred, middle, row.last_name, suffix) || row.display_name || "New person";
    const tabRows = [["identity", "Identity"],["membership", "Membership"],["contact", "Contact"],["access", "Access & Roles"],["aviation", "Aviation / Qualifications"],["notes", "Notes / Timeline"]];
    const tab = key(activeTab || "identity") || "identity";

    return `<section class="people-editor-panel people-editor">
      <div class="people-editor-head"><div><h3>${esc(displayPreview)}</h3><div class="people-pill-row">${pill(row.lifecycle_status_label || row.lifecycle_status_key, row.blocks_access ? "warn" : "")}${pill(row.membership_class_label)}${pill(row.application_stage_label)}${hasAnyRole(row, ["organization-super-admin", "organization-admin"]) ? pill("Admin", "ok") : ""}${row.login_linked ? pill("Login linked","ok") : pill("No login yet","warn")}</div></div></div>
      ${!mayEdit ? `<p class="people-warning">You can view this roster, but you do not have permission to edit people.</p>` : ""}
      <div class="people-tabs" role="tablist">${tabRows.map(([id,label]) => `<button class="people-tab ${tab === id ? "active" : ""}" data-tab="${esc(id)}" type="button" role="tab" aria-selected="${tab === id ? "true" : "false"}">${esc(label)}</button>`).join("")}</div>
      <div class="people-tab-panel ${tab === "identity" ? "active" : ""}" data-tab-panel="identity" ${tab === "identity" ? "" : "hidden"}><div class="people-form-grid">${renderPersonPhoto(row, mayEdit)}${input("people-first-name","Legal first name",row.first_name)}${input("people-preferred-first-name","Preferred first name",preferred)}${input("people-middle-name","Middle name / initial",middle)}${input("people-last-name","Last name",row.last_name)}${input("people-suffix","Suffix",suffix)}${input("people-display-name-preview","Display name",displayPreview,"text","Calculated from preferred/legal first name and last name.","readonly")}${input("people-primary-email","Primary email",row.primary_email,"email","Used for login/contact when linked to an auth account.","inputmode=\"email\" autocomplete=\"email\"")}${input("people-member-number","Member / account number",row.member_number)}${input("people-title","Title / position",row.title)}</div></div>
      <div class="people-tab-panel ${tab === "membership" ? "active" : ""}" data-tab-panel="membership" ${tab === "membership" ? "" : "hidden"}><div class="people-form-grid people-access-status-grid"><label class="people-field"><span>Lifecycle status</span><select id="people-status-key">${optionList(options.statuses,row.lifecycle_status_key,"status_key","label","Select status")}</select><small>Where this person is in their membership journey.</small></label><label class="people-field"><span>Membership class</span><select id="people-class-key">${optionList(options.membership_classes,row.membership_class_key,"class_key","label","No class")}</select><small>The type of membership or user relationship.</small></label><label class="people-field"><span>Application / onboarding stage</span><select id="people-stage-key">${optionList(options.application_stages,row.application_stage_key,"stage_key","label","No stage")}</select><small>The current application or onboarding step.</small></label></div><div class="people-form-grid people-affiliation-grid">${input("people-joined-at","Affiliation start date",String(row.joined_at || "").slice(0,10),"date")}<label class="people-field ${endFieldsDisabled ? "disabled-field" : ""}"><span>Affiliation end date</span><input id="people-affiliation-end-date" type="date" value="${esc(String(row.left_at || "").slice(0,10))}" ${endFieldsDisabled ? "disabled" : ""}><small id="people-affiliation-end-hint">${endFieldsDisabled ? "Enabled when status is inactive, former, expelled, archived, or blocked." : "Use when this organization affiliation has ended."}</small></label><label class="people-field ${endFieldsDisabled ? "disabled-field" : ""}"><span>End reason</span><select id="people-affiliation-end-reason" ${endFieldsDisabled ? "disabled" : ""}>${endReasonOptions(settings.end_reason)}</select><small id="people-affiliation-end-reason-hint">Use internal notes below if more detail is needed.</small></label>${textarea("people-notes","Internal notes — not visible to this person",row.notes)}</div></div>
      <div class="people-tab-panel ${tab === "contact" ? "active" : ""}" data-tab-panel="contact" ${tab === "contact" ? "" : "hidden"}><p class="muted">Choose one primary phone. This avoids duplicating the same number in multiple places.</p><div class="phone-grid"><label class="primary-pick"><input name="primary-phone-type" type="radio" value="mobile" ${primaryType === "mobile" || primaryType === "primary" ? "checked" : ""}> Primary</label>${input("people-mobile-phone","Mobile phone",contact.mobile_phone || row.primary_phone || row.phone,"tel","","inputmode=\"tel\"")}<label class="primary-pick"><input name="primary-phone-type" type="radio" value="home" ${primaryType === "home" ? "checked" : ""}> Primary</label>${input("people-home-phone","Home phone",contact.home_phone,"tel","","inputmode=\"tel\"")}<label class="primary-pick"><input name="primary-phone-type" type="radio" value="work" ${primaryType === "work" ? "checked" : ""}> Primary</label>${input("people-work-phone","Work phone",contact.work_phone,"tel","","inputmode=\"tel\"")}</div><div class="people-form-grid">${input("people-alt-email","Alternate email",contact.alternate_email,"email","","inputmode=\"email\"")}${input("people-address","Street address",contact.address)}${input("people-city","City",contact.city)}${input("people-state","State",contact.state)}${input("people-zip","ZIP",contact.zip)}${input("people-emergency-name","Emergency contact",emergency.name)}${input("people-emergency-phone","Emergency phone",emergency.phone,"tel","","inputmode=\"tel\"")}${input("people-emergency-relation","Emergency relation",emergency.relation)}</div></div>
      <div class="people-tab-panel ${tab === "access" ? "active" : ""}" data-tab-panel="access" ${tab === "access" ? "" : "hidden"}>${renderAccessTab(row, roles, mayEdit, mayEditAnyRole, mayEditSuperAdmin)}</div>
      <div class="people-tab-panel ${tab === "aviation" ? "active" : ""}" data-tab-panel="aviation" ${tab === "aviation" ? "" : "hidden"}>${renderQualificationAssignmentRows(row, mayEdit)}<section class="people-aviation-details"><div class="people-role-section-head"><h4>Pilot background</h4><span>Optional</span></div><div class="people-form-grid">${input("people-application-date","Application date",aviation.application_date || applicant.application_date,"date")}${input("people-employer","Employer",background.employer)}${input("people-occupation","Occupation",background.occupation)}${input("people-ratings","Ratings / certificates",aviation.ratings)}${input("people-pilot-certificate","Pilot certificate #",aviation.pilot_certificate_number)}${input("people-aircraft-types","Aircraft types",aviation.aircraft_types)}${input("people-clubs-fbos","Prior clubs/FBOs",aviation.clubs_fbos)}${input("people-flying-type","Type of flying",aviation.flying_type)}${input("people-total-hours","Total hours",aviation.total_hours,"number")}${input("people-night-hours","Night hours",aviation.total_night_hours,"number")}${input("people-ifr-hours","IFR hours",aviation.total_ifr_hours,"number")}${input("people-complex-hours","Complex hours",aviation.total_complex_hours,"number")}</div></section></div>
      <div class="people-tab-panel ${tab === "notes" ? "active" : ""}" data-tab-panel="notes" ${tab === "notes" ? "" : "hidden"}><div class="people-form-grid">${input("people-objectives","Objectives",applicant.objectives)}${input("people-how-hear","How they heard about us",applicant.how_hear_us)}${textarea("people-accident-details","Accident / incident details",applicant.accident_details)}${textarea("people-faa-details","FAA / regulatory details",applicant.faa_details)}</div>${renderPersonTimeline(row)}</div>
      <div class="people-action-row"><div class="people-save-state ${dirty ? "dirty" : ""}"><span>${dirty ? "Unsaved changes" : "Saved"}</span>${message ? `<small class="people-action-status ${esc(messageKind)}">${esc(message)}</small>` : ""}</div><div class="people-action-buttons"><button id="people-reset" class="people-btn secondary" type="button">Reset</button>${archiveButton}<button id="people-save" class="people-btn" type="button" ${mayEdit ? "" : "disabled"}>Save</button></div></div>
    </section>`;
  }


  function renderContent() {
    if (!authChecked) return `<section class="people-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></section>`;
    if (!token) return `<section class="people-card"><h2>Login required</h2><p>This page uses the same login as the User Dashboard.</p>${renderLogin()}</section>`;
    const rows = adminRows();
    if (!rows.length && !adminAccess) return `<section class="people-card"><h2>No organization admin access</h2><p>Your account is signed in, but it does not have organization-admin permission.</p></section>`;
    const warningMessage = message && messageKind === "warn" ? `<div class="people-message warn">${esc(message)}</div>` : "";
    if (isPermissionsMode()) return renderPermissionsModule0116L(warningMessage);
    if (isDefinitionMode()) return renderDefinitionModule(warningMessage);
    const adminLens = isAdminAccessLens();
    const title = clean(pageConfig?.title) || "Members / People";
    const intro = clean(pageConfig?.intro_text) || "Manage people, member lifecycle, contact details, group assignments, access roles, and qualifications from one workbench.";
    return `<section class="people-module-header"><div><span class="people-kicker">People</span><h2>${esc(title)}</h2><p>${esc(intro)}</p></div><div class="people-header-actions">${!embeddedMode ? renderOrgSelector() : ""}<button id="people-new" class="people-btn outline" type="button">New person</button></div></section>${warningMessage}<section class="people-workbench">${renderFinder()}${renderEditor()}</section>`;
  }

  function peopleStyles(cfg) {
    return `
      .people-wrap{${cssVars(cfg)}width:100%;max-width:${embeddedMode ? "none" : "var(--people-page-width)"};margin:${embeddedMode ? "0" : "24px auto"};padding:${embeddedMode ? "0" : "0 18px 24px"};font-family:Inter,Arial,Helvetica,sans-serif;color:var(--people-text);box-sizing:border-box;}
      .people-wrap *{box-sizing:border-box}.people-card,.people-module-header,.people-list-panel,.people-editor-panel{background:rgba(255,255,255,.98);border:1px solid var(--people-border);border-radius:14px;box-shadow:0 6px 18px rgba(16,24,40,.07)}
      .people-card{padding:18px;margin:12px 0}.people-hero{display:${embeddedMode ? "none" : "block"};background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.78)});color:#fff}.people-hero h1{margin:8px 0;color:#fff;font-size:clamp(28px,4vw,42px);letter-spacing:-.035em}.people-hero p{color:rgba(255,255,255,.9);max-width:900px}.people-eyebrow,.people-kicker{display:inline-flex;padding:5px 10px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.people-hero .people-eyebrow{background:rgba(255,255,255,.16);color:#fff}
      .people-module-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:15px 17px;margin:0 0 10px;border-top:3px solid var(--people-primary)}.people-module-header h2{margin:6px 0 4px;font-size:25px;line-height:1.1;color:#101828}.people-module-header p{margin:0;color:var(--people-muted);font-weight:650}.people-header-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .people-workbench{display:grid;grid-template-columns:330px minmax(0,1fr);gap:10px;align-items:start}.people-list-panel{padding:12px;position:sticky;top:10px;max-height:calc(100vh - 24px);overflow:auto}.people-list-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.people-list-head h3,.people-editor-head h3{margin:0;font-size:21px;color:#101828}.people-list-head p{margin:4px 0 0;color:var(--people-muted);font-weight:650}.people-toolbar-row,.people-inline-actions,.people-action-buttons,.people-pill-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.people-toolbar-row{margin:8px 0 10px}.people-btn,.people-icon-btn,.people-link-btn{border:0;border-radius:999px;background:var(--people-primary);color:#fff;font-weight:900;padding:10px 14px;cursor:pointer;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.people-btn:hover,.people-person-card:hover{transform:translateY(-1px)}.people-btn.secondary,.people-btn.outline{background:#fff;color:var(--people-primary);border:1px solid var(--people-primary)}.people-btn.danger{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.people-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}.people-link-btn{background:transparent;color:var(--people-primary);text-decoration:underline;padding:8px}.people-message{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--people-soft);color:var(--people-primary);font-weight:850}.people-message:empty{display:none}.people-message.ok{background:#ecfdf5;color:#047857}.people-message.warn,.people-warning{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:12px;padding:10px 12px}.people-action-status{display:block;margin-top:3px;color:var(--people-muted);font-size:12px;line-height:1.25}.people-action-status.ok{color:#047857}.people-action-status.warn{color:#9a3412}.people-context-single{display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.14);padding:9px 12px;border-radius:999px;font-weight:900}.muted{color:var(--people-muted)}
      .people-field{display:grid;gap:6px;font-weight:850}.people-field span{font-size:13px}.people-field small{font-weight:600;color:var(--people-muted);line-height:1.35}.people-field input,.people-field select,.people-field textarea,.people-search-wrap input,#people-org-select{width:100%;border:1px solid var(--people-border);border-radius:12px;background:#fff;color:var(--people-text);padding:10px 12px;font:inherit;min-height:42px}.people-field textarea{min-height:104px;resize:vertical}.people-field input[readonly],.people-field input:disabled,.people-field select:disabled{background:#f8fafc;color:var(--people-muted);cursor:not-allowed}.people-field-wide{grid-column:1/-1}.field-error{color:#b91c1c!important;font-weight:900!important}.people-field.disabled-field{opacity:.72}.people-status-filter,.people-role-filter,.people-login-filter{margin:10px 0}.people-advanced-filters{display:grid;gap:8px;margin:6px 0 10px}.people-advanced-toggle{justify-self:start;padding-left:0}.people-active-filters{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--people-muted);font-weight:850}.people-filter-chip{border:1px solid var(--people-border);border-radius:999px;background:var(--people-soft);color:var(--people-primary);font:inherit;font-size:12px;font-weight:900;padding:5px 9px;cursor:pointer}.people-advanced-panel{border:1px solid var(--people-border);border-radius:13px;background:#fff;padding:10px}.people-search-wrap{position:relative;margin:10px 0}.people-search-wrap input{padding-right:44px}.people-icon-btn{position:absolute;right:6px;top:5px;width:32px;height:32px;padding:0;background:var(--people-soft);color:var(--people-primary)}.people-sort-hint{font-size:12px;color:var(--people-muted);font-weight:750;margin:8px 0 10px}.people-compact-list{display:grid;gap:7px;max-height:calc(100vh - 320px);min-height:240px;overflow:auto;padding:3px 2px 8px;overscroll-behavior:contain;align-content:start;grid-auto-rows:max-content}.people-person-card{text-align:left;border:1px solid var(--people-border);border-radius:13px;background:#fff;color:var(--people-text);padding:10px;display:grid;gap:8px;cursor:pointer;box-shadow:0 3px 11px ${rgba(cfg.primary,.04)};align-self:start}.people-person-card .person-badges{align-items:flex-start}.people-person-card .person-badges em{align-self:flex-start}.people-person-card.selected{border-color:var(--people-primary);box-shadow:0 0 0 3px var(--people-strong-soft)}.people-person-card.archived{opacity:.58;background:#f8fafc}.people-person-card.restricted:not(.archived){border-color:#fed7aa;background:#fff7ed}.person-main{display:grid;gap:3px;min-width:0}.person-main strong{font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-main small{color:var(--people-muted);font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-badges{display:flex;gap:4px;flex-wrap:wrap}.person-badges em{font-style:normal;font-size:10px;font-weight:900;border-radius:999px;padding:3px 6px;background:var(--people-soft);color:var(--people-primary)}.people-empty-row{border:1px dashed var(--people-border);border-radius:13px;padding:18px;text-align:center;color:var(--people-muted);background:#fff}.people-empty-row.compact{padding:12px;text-align:left}.people-empty{min-height:380px;display:grid;align-content:center;text-align:center;padding:24px}
      .people-editor-panel{min-width:0;padding:0;overflow:hidden}.people-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:15px 17px;border-bottom:1px solid var(--people-border)}.people-pill{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:12px;font-weight:900}.people-pill.ok{background:#ecfdf5;color:#047857}.people-pill.warn{background:#fff7ed;color:#9a3412}.people-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--people-border);background:#fcfcfd}.people-tab{border:1px solid var(--people-border);border-radius:999px;background:#fff;color:var(--people-primary);font-weight:900;padding:8px 11px;cursor:pointer}.people-tab.active{background:var(--people-primary);color:#fff;border-color:var(--people-primary)}.people-tab-panel{padding:16px}.people-tab-panel[hidden]{display:none!important}.people-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}.people-access-status-grid{padding-bottom:8px}.people-affiliation-grid{padding-top:8px;border-top:1px solid var(--people-border)}.phone-grid{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;align-items:end;margin:10px 0 14px}.primary-pick{min-height:42px;display:flex;gap:8px;align-items:center;justify-content:center;border:1px solid var(--people-border);border-radius:12px;background:var(--people-soft);font-weight:900;color:var(--people-primary)}.people-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.people-check{display:flex;gap:9px;align-items:flex-start;padding:10px 11px;border:1px solid var(--people-border);border-radius:12px;background:#fff;font-weight:900}.people-check.disabled{opacity:.62;background:#f8fafc}.people-check input{width:auto;min-height:0;margin-top:2px}.people-check small{display:block;font-size:11px;color:#9a3412;margin-top:2px}.people-access-callout{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid var(--people-border);border-radius:13px;background:var(--people-soft);padding:12px;margin-bottom:14px}.people-access-callout p{margin:4px 0 0;color:var(--people-muted);font-weight:650}.people-access-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}.people-access-summary>div{border:1px solid var(--people-border);border-radius:12px;background:#fff;padding:10px;display:grid;gap:3px}.people-access-summary span{font-size:11px;color:var(--people-muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}.people-access-summary strong{font-size:13px;line-height:1.25}.people-role-assignment-wrap{display:grid;gap:12px}.people-role-section{border:1px solid var(--people-border);border-radius:13px;background:#fff;padding:12px}.people-role-section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.people-role-section-head h4{margin:0;color:#101828;font-size:15px}.people-role-section-head span{font-size:11px;color:var(--people-muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}.people-role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.people-qualification-panel,.people-aviation-details{border:1px solid var(--people-border);border-radius:13px;background:#fff;padding:12px;margin-bottom:14px}.people-qualification-list{display:grid;gap:10px}.people-qualification-row{display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(120px,.8fr) minmax(120px,.8fr) minmax(120px,.8fr) minmax(160px,1fr);gap:10px;align-items:end;border:1px solid var(--people-border);border-radius:13px;background:#fff;padding:10px}.people-qualification-row.selected{background:var(--people-soft);border-color:var(--people-primary)}.people-qualification-check{display:flex;gap:9px;align-items:flex-start;font-weight:900;color:var(--people-primary)}.people-qualification-check input{width:auto;margin-top:3px}.people-qualification-check span{display:grid;gap:3px}.people-qualification-check small{font-weight:750;color:var(--people-muted);line-height:1.25}.people-qualification-notes{min-width:0}.people-inline-actions{margin:10px 0}.people-action-row{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid var(--people-border);padding:12px 14px;background:#fcfcfd}.people-save-state{display:grid;gap:2px;font-weight:900;color:var(--people-muted)}.people-save-state.dirty{color:#9a3412}.people-photo-panel{grid-column:1/-1;display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;align-items:center;border:1px dashed var(--people-border);border-radius:14px;background:var(--people-soft);padding:14px}.people-photo-panel.dragover{box-shadow:0 0 0 3px var(--people-strong-soft);border-color:var(--people-primary)}.people-photo-preview{width:132px;height:132px;border-radius:18px;background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--people-border);box-shadow:0 10px 26px ${rgba(cfg.primary,.16)}}.people-photo-preview img{width:100%;height:100%;object-fit:cover;display:block}.people-photo-preview span{font-size:38px;font-weight:950;letter-spacing:.03em}.people-photo-copy strong{display:block;color:var(--people-primary);font-size:15px;margin-bottom:4px}.people-photo-copy p{margin:0 0 8px;color:var(--people-muted);font-weight:750}.people-photo-copy small{display:block;color:var(--people-muted);font-weight:750;margin-bottom:10px}.people-photo-actions{display:flex;gap:8px;flex-wrap:wrap}.people-timeline-list{display:grid;gap:10px;margin-top:10px}.people-note-card{border-left:4px solid var(--people-primary);background:#f8fafc;border-radius:12px;padding:10px}.people-note-card strong{display:block;color:var(--people-primary)}.people-note-card span{font-size:12px;color:#64748b;font-weight:800}.people-note-card p{margin:6px 0;white-space:pre-wrap}.people-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:12px;padding:14px;font-size:12px;max-height:260px;overflow:auto}.people-footer{margin:10px auto 0;text-align:center;color:var(--people-muted);font-size:12px;font-weight:800}.people-footer a{color:var(--people-primary);text-decoration:none;font-weight:950}.people-def-row{padding:0;display:grid;grid-template-columns:30px minmax(0,1fr) 34px;align-items:stretch;overflow:hidden;cursor:grab}.people-def-row.dragging{opacity:.55}.people-def-row.drag-over{outline:2px dashed var(--people-primary);outline-offset:2px}.people-def-drag-handle{display:flex;align-items:center;justify-content:center;color:var(--people-muted);font-weight:950;letter-spacing:-5px;background:#f8fafc;border-right:1px solid var(--people-border);cursor:grab;user-select:none}.people-def-row .people-def-main{border:0;background:transparent;text-align:left;padding:10px;display:grid;gap:7px;cursor:pointer;color:inherit}.people-def-order{display:flex;flex-direction:column;justify-content:space-between;border-left:1px solid var(--people-border);background:#f8fafc}.people-order-button{border:0;background:#f8fafc;color:var(--people-primary);font-weight:950;width:34px;min-height:32px;cursor:pointer}.people-order-button:first-child{border-bottom:1px solid var(--people-border)}.people-order-button:last-child{border-top:1px solid var(--people-border)}.people-order-button:disabled{opacity:.35;cursor:not-allowed}.people-info-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:5px;border:1px solid var(--people-border);border-radius:999px;background:#fff;color:var(--people-primary);font-size:11px;font-weight:950;line-height:1;vertical-align:middle;padding:0;cursor:help}.people-def-editor .people-tab-panel>.people-form-grid{grid-template-columns:1fr}.people-def-editor .people-form-grid .people-form-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.people-action-status.ok{color:#047857}.people-action-status.warn{color:#9a3412}.people-soft-note{background:var(--people-soft);color:var(--people-primary);border:1px solid var(--people-border);border-radius:12px;padding:10px 12px;font-weight:750}.people-permission-role-list{min-height:240px}.people-permission-groups{display:grid;gap:12px}.people-permission-group{border:1px solid var(--people-border);border-radius:13px;background:#fff;padding:12px}.people-permission-group h4{margin:0 0 10px;font-size:16px;color:#101828}.people-permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.people-permission-capability{display:flex;align-items:center;gap:9px;border:1px solid var(--people-border);border-radius:12px;background:#fff;padding:10px;font-weight:850;min-height:44px}.people-permission-capability.enabled{background:var(--people-soft);border-color:var(--people-primary);color:var(--people-primary)}.people-permission-capability.locked{opacity:.72}.people-permission-capability input{width:16px;height:16px;accent-color:var(--people-primary)}.people-qualification-profile-list{display:grid;gap:10px}.people-qualification-profile-field{display:grid;grid-template-columns:minmax(160px,.65fr) minmax(0,1.5fr);gap:12px;align-items:start}.people-qualification-label strong{display:block;color:#101828;font-size:14px}.people-qualification-label small{display:block;color:var(--people-muted);font-weight:700;margin-top:3px}.people-qualification-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}.people-qualification-check.compact{align-self:end;min-height:44px}.people-qualification-notes{min-width:0}.people-qualification-title{display:grid;gap:3px;min-width:180px}.people-qualification-title strong{font-size:14px;color:#101828}.people-qualification-title small{color:var(--people-muted);font-weight:750}.people-qualification-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;flex:1}.people-qualification-row{display:flex;gap:12px;align-items:flex-start}.people-qualification-row.selected{border-color:var(--people-primary);background:var(--people-soft)}.people-qualification-toggle{margin:0;min-height:42px}.people-aviation-details{border:1px solid var(--people-border);border-radius:14px;background:#fff;padding:12px;margin-top:14px}.people-qualification-grid-panel{overflow:hidden}.people-qualification-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}.people-qualification-table{min-width:1040px;display:grid;border:1px solid var(--people-border);border-radius:13px;overflow:hidden;background:#fff}.people-qualification-table-row{display:grid;grid-template-columns:minmax(190px,1.12fr) minmax(165px,.85fr) minmax(155px,.8fr) minmax(190px,.9fr) minmax(185px,1fr);align-items:center;border-bottom:1px solid var(--people-border);background:#fff}.people-qualification-table-row:last-child{border-bottom:0}.people-qualification-table-row>div{min-width:0;padding:9px 10px}.people-qualification-table-head{background:#f8fafc;color:var(--people-muted);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.045em}.people-qualification-title{display:grid;gap:3px}.people-qualification-title strong{font-size:13px;color:#101828;line-height:1.25}.people-qualification-title small{color:var(--people-muted);font-weight:750;line-height:1.25}.people-qualification-cell-input{min-width:0}.people-qualification-cell-input .people-field{margin:0}.people-qualification-cell-input .people-field>span{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important}.people-qualification-cell-input input,.people-qualification-cell-input select{width:100%;min-height:36px}.people-qualification-cell-input .people-qualification-check{min-height:36px;align-items:center}.people-qualification-empty{display:inline-flex;align-items:center;min-height:36px;color:var(--people-muted);font-weight:850}.people-qualification-grid-field input,.people-qualification-grid-field select{font-size:13px}
      @media(max-width:1100px){.people-workbench{grid-template-columns:1fr}.people-list-panel{position:static;max-height:none}.people-compact-list{max-height:320px;min-height:0}.people-form-grid,.people-check-grid,.people-role-grid,.people-access-summary,.people-qualification-profile-fields{grid-template-columns:1fr 1fr}.people-qualification-row{grid-template-columns:1fr 1fr}.people-module-header,.people-action-row,.people-access-callout{display:grid}.people-header-actions,.people-action-buttons{justify-content:flex-start}.phone-grid{grid-template-columns:1fr}.primary-pick{justify-content:flex-start;padding:0 12px}}
      @media(max-width:640px){.people-form-grid,.people-check-grid,.people-role-grid,.people-access-summary,.people-qualification-row,.people-qualification-profile-row,.people-qualification-profile-fields{grid-template-columns:1fr}.people-photo-panel{grid-template-columns:1fr}.people-photo-preview{margin:auto}.people-btn{width:100%}.people-action-buttons{width:100%}}
      @media print{#syncetc-portal-shell,.people-hero,.people-list-panel,.people-editor-panel,.people-message,.people-module-header{display:none!important}.people-wrap{max-width:none;margin:0;padding:0}.people-card{box-shadow:none;border:none}}
    `;
  }


  function render() {
    const el = ensureRoot();
    if (!el) return;
    const cfg = styleConfig(selectedRow());
    const diagnostics = currentDebugEnabled() ? `<details class="people-card"><summary>Diagnostics</summary><pre class="people-backend">${esc(JSON.stringify({ version: VERSION, embedded: embeddedMode, organization_id: selectedOrgId, active_tab: activeTab, active_people_lens: activePeopleLens, active_definition_kind: activeDefinitionKind, selected_permission_role_id: selectedPermissionRoleId, role_filter: roleFilter, login_filter: loginFilter, people_count: people.length, definition_counts: { statuses: arr(definitionLists.statuses).length, membership_classes: arr(definitionLists.membership_classes).length, application_stages: arr(definitionLists.application_stages).length, groups_roles: arr(definitionLists.groups_roles).length, permissions: arr(definitionLists.permissions).length, qualifications: arr(definitionLists.qualifications).length }, cache_ttl_ms: PEOPLE_CACHE_TTL_MS, parent_script_load_ms: mountOptions.scriptLoadMs || null, load_timings: loadTimings, backend: backend || {} }, null, 2))}</pre></details>` : "";
    el.innerHTML = `<style>${peopleStyles(cfg)}</style><div class="people-wrap"><section class="people-card people-hero"><div class="people-eyebrow">Organization Admin</div><h1>${esc(clean(pageConfig?.title) || "People & Access")}</h1><p>${esc(clean(pageConfig?.intro_text) || "Search the full people pool, manage members and applicants, keep contact information current, and handle safe access updates from one place.")}</p><div class="people-message ${esc(messageKind)}">${esc(message)}</div></section>${renderContent()}${diagnostics}</div>`;
    bindEvents();
    restorePeopleSearchFocus();
    restoreDefinitionSearchFocus();
    if (!isDefinitionMode() && !isPermissionsMode()) activateTab(activeTab);
  }



  function bindDefinitionEvents() {
    $("people-def-filter")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = definitionFilter; return; } setDirty(false); definitionFilter = e.target.value || "all"; render(); });
    $("people-def-search")?.addEventListener("input", (e) => { clearTimeout(debounceTimer); definitionSearchRestore = { start: e.target.selectionStart, end: e.target.selectionEnd }; debounceTimer = setTimeout(() => { definitionSearch = e.target.value || ""; render(); }, 300); });
    $("people-def-clear-search")?.addEventListener("click", () => { definitionSearch = ""; render(); });
    $("people-def-new")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); selectedDefinition = blankDefinition(); message = ""; messageKind = ""; render(); });
    $("people-def-refresh")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); runButton("people-def-refresh", "Refreshing…", async () => { const run = beginLoadTrace("definition refresh"); await loadPeopleDefinitionLists(run); finishLoad("ok", run); setMessage("Updated.", "ok"); }); });
    document.querySelectorAll("[data-def-open]").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); const id = clean(btn.getAttribute("data-def-open")); selectedDefinition = allDefinitionRows().find((r) => selectedDefinitionId(r) === id) || null; message = ""; messageKind = ""; render(); }));
    document.querySelectorAll("[data-def-move]").forEach((btn) => btn.addEventListener("click", () => runButton("people-def-refresh", "Saving order…", () => moveDefinitionByButton(clean(btn.getAttribute("data-def-id")), clean(btn.getAttribute("data-def-move"))))));
    document.querySelectorAll("[data-def-row]").forEach((row) => {
      row.addEventListener("dragstart", (event) => { definitionDragId = clean(row.getAttribute("data-def-id")); row.classList.add("dragging"); try { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", definitionDragId); } catch {} });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); document.querySelectorAll(".people-def-row.drag-over").forEach((el) => el.classList.remove("drag-over")); });
      row.addEventListener("dragover", (event) => { if (!definitionDragId) return; event.preventDefault(); row.classList.add("drag-over"); });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (event) => { event.preventDefault(); row.classList.remove("drag-over"); const targetId = clean(row.getAttribute("data-def-id")); const after = event.offsetY > row.getBoundingClientRect().height / 2; runButton("people-def-refresh", "Saving order…", () => moveDefinitionTo(definitionDragId, targetId, after)); });
    });
    $("people-def-save")?.addEventListener("click", () => runButton("people-def-save", "Saving…", saveDefinition));
    $("people-def-reset")?.addEventListener("click", () => runButton("people-def-reset", "Resetting…", resetDefinition));
    $("people-def-archive")?.addEventListener("click", () => runButton("people-def-archive", "Archiving…", () => archiveDefinition(false)));
    $("people-def-restore")?.addEventListener("click", () => runButton("people-def-restore", "Restoring…", () => archiveDefinition(true)));
    document.querySelectorAll(".people-def-editor input, .people-def-editor select, .people-def-editor textarea").forEach((el) => {
      el.addEventListener("input", () => setDirty(true));
      el.addEventListener("change", () => setDirty(true));
    });
  }


  function bindPermissionEvents0116L() {
    $("people-permission-refresh")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); runButton("people-permission-refresh", "Refreshing…", async () => { const run = beginLoadTrace("permissions refresh"); await Promise.all([loadPeopleDefinitionLists(run), refreshAccessVocabularyAfterDefinitionSave()]); finishLoad("ok", run); setMessage("Updated.", "ok"); }); });
    $("people-permission-search")?.addEventListener("input", (e) => { clearTimeout(debounceTimer); permissionSearchRestore = { start: e.target.selectionStart, end: e.target.selectionEnd }; debounceTimer = setTimeout(() => { permissionSearch = e.target.value || ""; render(); }, 250); });
    $("people-permission-clear-search")?.addEventListener("click", () => { permissionSearch = ""; render(); });
    document.querySelectorAll("[data-permission-role]").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); selectedPermissionRoleId = clean(btn.getAttribute("data-permission-role")); permissionDraftKeys = null; message = ""; messageKind = ""; render(); }));
    document.querySelectorAll("[data-permission-key]").forEach((box) => box.addEventListener("change", () => { permissionDraftKeys = collectPermissionKeys0116L(); setDirty(true); }));
    $("people-permission-save")?.addEventListener("click", () => runButton("people-permission-save", "Saving…", saveRolePermissions0116L));
    $("people-permission-reset")?.addEventListener("click", () => runButton("people-permission-reset", "Resetting…", resetRolePermissions0116L));
  }

  function bindEvents() {
    $("people-login")?.addEventListener("click", () => runButton("people-login", "Logging in…", login));
    $("people-logout")?.addEventListener("click", () => runButton("people-logout", "Logging out…", logout));
    $("people-reset-own")?.addEventListener("click", () => runButton("people-reset-own", "Sending…", resetOwnPassword));
    $("people-org-select")?.addEventListener("change", async (e) => { if (!confirmDiscard()) { e.target.value = selectedOrgId; return; } setDirty(false); selectedOrgId = e.target.value; try { localStorage.setItem(SELECTED_ORG_KEY, selectedOrgId); } catch {} adminAccess = null; selected = null; selectedDefinition = null; try { await loadOrgContext({ force: true }); setMessage("Organization loaded.", "ok"); } catch (err) { setMessage(err.message || String(err), "warn"); } render(); });
    if (isPermissionsMode()) { bindPermissionEvents0116L(); return; }
    if (isDefinitionMode()) { bindDefinitionEvents(); return; }
    bindDefinitionEvents();
    $("people-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = filter; return; } setDirty(false); filter = normalizePrimaryPeopleFilter(e.target.value || "all"); render(); });
    $("people-advanced-filters-toggle")?.addEventListener("click", () => { advancedFiltersOpen = !advancedFiltersOpen; render(); });
    document.querySelectorAll("[data-clear-role-filter]").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); roleFilter = "all"; render(); }));
    document.querySelectorAll("[data-clear-login-filter]").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); loginFilter = "all"; render(); }));
    $("people-clear-advanced-filters")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); roleFilter = "all"; loginFilter = "all"; advancedFiltersOpen = false; render(); });
    $("people-role-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = roleFilter; return; } setDirty(false); roleFilter = key(e.target.value || "all") || "all"; advancedFiltersOpen = roleFilter !== "all" || loginFilter !== "all"; render(); });
    $("people-login-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = loginFilter; return; } setDirty(false); loginFilter = key(e.target.value || "all") || "all"; advancedFiltersOpen = roleFilter !== "all" || loginFilter !== "all"; render(); });
    $("people-search")?.addEventListener("input", (e) => { clearTimeout(debounceTimer); peopleSearchRestore = { start: e.target.selectionStart, end: e.target.selectionEnd }; debounceTimer = setTimeout(() => { search = e.target.value || ""; render(); }, 300); });
    $("people-clear-search")?.addEventListener("click", () => { search = ""; render(); });
    document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => runButton("people-refresh", "Opening…", async () => { if (!confirmDiscard()) return; setDirty(false); message = ""; messageKind = ""; const id = btn.getAttribute("data-open"); await loadSelectedPerson(id); fieldErrors = {}; render(); })));
    $("people-new")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); activeTab = "identity"; selected = blankPerson(); fieldErrors = {}; message = ""; render(); });
    $("people-refresh")?.addEventListener("click", () => { if (!confirmDiscard()) return; setDirty(false); runButton("people-refresh", "Refreshing…", async () => { const run = beginLoadTrace("manual refresh"); await loadOrgContext({ force: true, run }); finishLoad("ok", run); setMessage("Updated.", "ok"); }); });
    $("people-export")?.addEventListener("click", exportForExcel);
    $("people-print")?.addEventListener("click", printPeopleList);
    $("people-save")?.addEventListener("click", () => runButton("people-save", "Saving…", saveSelected));
    $("people-reset")?.addEventListener("click", () => runButton("people-reset", "Resetting…", resetSelected));
    $("people-add-timeline-note")?.addEventListener("click", () => runButton("people-add-timeline-note", "Adding…", addPersonTimelineNote));
    $("people-invite")?.addEventListener("click", () => runButton("people-invite", "Sending…", sendInvite));
    $("people-reset-password")?.addEventListener("click", () => runButton("people-reset-password", "Sending…", sendPasswordReset));
    $("people-archive")?.addEventListener("click", () => runButton("people-archive", "Archiving…", archiveSelected));
    $("people-restore")?.addEventListener("click", () => runButton("people-restore", "Restoring…", restoreSelected));
    document.querySelectorAll(".people-tab").forEach((btn) => btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab") || "identity")));
    $("people-photo-choose")?.addEventListener("click", () => $("people-photo-input")?.click());
    $("people-photo-input")?.addEventListener("change", (event) => runButton("people-photo-choose", "Uploading…", () => uploadSelectedPhoto(event.target?.files?.[0])));
    $("people-photo-remove")?.addEventListener("click", () => runButton("people-photo-remove", "Removing…", removeSelectedPhoto));
    const photoDropZone = $("people-photo-dropzone");
    if (photoDropZone && photoDropZone.getAttribute("data-photo-disabled") !== "true") {
      photoDropZone.addEventListener("dragover", (event) => { event.preventDefault(); photoDropZone.classList.add("dragover"); });
      photoDropZone.addEventListener("dragleave", () => photoDropZone.classList.remove("dragover"));
      photoDropZone.addEventListener("drop", (event) => { event.preventDefault(); photoDropZone.classList.remove("dragover"); runButton("people-photo-choose", "Uploading…", () => uploadSelectedPhoto(event.dataTransfer?.files?.[0])); });
    }
    document.querySelectorAll(".people-editor input, .people-editor select, .people-editor textarea").forEach((el) => {
      el.addEventListener("input", () => { setDirty(true); refreshDisplayNamePreview(); });
      el.addEventListener("change", () => { setDirty(true); updateAffiliationEndState(el.id === "people-status-key"); refreshDisplayNamePreview(); });
    });
    bindQualificationAssignmentEvents();
    updateAffiliationEndState();
    refreshDisplayNamePreview();
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
    const qualificationAssignments = collectQualificationAssignments();
    const currentProfile = getProfile(selected);
    const currentAviation = obj(currentProfile.aviation);
    const { club_cfi, on_maintenance_crew, ifr_rated, club_night_checkout, bfr_expiry_date, last_club_checkout, medical_expiry_date, last_medical_date, medical_class, bfr_aircraft, qualification_assignments, ...aviationBase } = currentAviation;
    const profile = {
      name: { preferred_first_name: preferredFirstName, middle_name: middleName, suffix },
      contact: { primary_phone_type: primaryType, mobile_phone: mobilePhone, home_phone: homePhone, work_phone: workPhone, alternate_email: clean($("people-alt-email")?.value).toLowerCase(), address: clean($("people-address")?.value), city: clean($("people-city")?.value), state: clean($("people-state")?.value), zip: clean($("people-zip")?.value) },
      emergency: { name: clean($("people-emergency-name")?.value), phone: clean($("people-emergency-phone")?.value), relation: clean($("people-emergency-relation")?.value) },
      aviation: { ...aviationBase, application_date: clean($("people-application-date")?.value), ratings: clean($("people-ratings")?.value), pilot_certificate_number: clean($("people-pilot-certificate")?.value), aircraft_types: clean($("people-aircraft-types")?.value), clubs_fbos: clean($("people-clubs-fbos")?.value), flying_type: clean($("people-flying-type")?.value), total_hours: clean($("people-total-hours")?.value), total_night_hours: clean($("people-night-hours")?.value), total_ifr_hours: clean($("people-ifr-hours")?.value), total_complex_hours: clean($("people-complex-hours")?.value) },
      background: { employer: clean($("people-employer")?.value), occupation: clean($("people-occupation")?.value) },
      applicant: { application_date: clean($("people-application-date")?.value), objectives: clean($("people-objectives")?.value), how_hear_us: clean($("people-how-hear")?.value), accident_details: clean($("people-accident-details")?.value), faa_details: clean($("people-faa-details")?.value) },
      admin: obj(currentProfile.admin)
    };
    const membershipSettings = { ...obj(selected?.membership_settings_json), end_reason: endEnabled ? clean($("people-affiliation-end-reason")?.value) : "" };
    const payload = { organization_id: selectedOrgId, person_id: selected?.person_id || "", membership_id: selected?.membership_id || "", first_name: firstName, preferred_first_name: preferredFirstName, middle_name: middleName, last_name: lastName, suffix, display_name: calculatedDisplayName(firstName, preferredFirstName, middleName, lastName, suffix), primary_email: clean($("people-primary-email")?.value).toLowerCase(), primary_phone: primaryPhone, member_number: clean($("people-member-number")?.value), title: clean($("people-title")?.value), joined_at: clean($("people-joined-at")?.value), left_at: endEnabled ? clean($("people-affiliation-end-date")?.value) : "", status_key: statusKey, membership_class_key: clean($("people-class-key")?.value), application_stage_key: clean($("people-stage-key")?.value), notes: clean($("people-notes")?.value), profile_json: profile, membership_settings_json: membershipSettings };
    if (canManageSafeRoles(selectedRow())) payload.role_keys = unique(roleKeys);
    payload.qualification_assignments = qualificationAssignments;
    return payload;
  }

  async function resetSelected() {
    if (!confirmDiscard("Reset unsaved people changes?")) return;
    fieldErrors = {};
    setDirty(false);
    if (selected?.membership_id) await loadSelectedPerson(selected.membership_id);
    else selected = blankPerson();
    setMessage("Changes reset.", "ok");
  }


  function confirmAccessRoleChanges(payload) {
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, "role_keys") || !selected?.membership_id) return true;
    const before = arr(selected.role_keys).map(key);
    const after = arr(payload.role_keys).map(key);
    const beforeAdmin = hasAdminRoleKeys(before);
    const afterAdmin = hasAdminRoleKeys(after);
    const beforeSuper = hasSuperAdminRoleKeys(before);
    const afterSuper = hasSuperAdminRoleKeys(after);
    const own = isOwnSelectedPerson(selected);
    if (own && beforeAdmin && !afterAdmin) { setMessage("You cannot remove your own Organization Admin access from this page.", "warn"); return false; }
    if (own && beforeSuper && !afterSuper) { setMessage("You cannot remove your own Organization Super Admin access from this page.", "warn"); return false; }
    if (!beforeAdmin && afterAdmin && !confirm("Give this person Organization Admin access?")) return false;
    if (beforeAdmin && !afterAdmin && !confirm("Remove Organization Admin access from this person?")) return false;
    if (!beforeSuper && afterSuper && !confirm("Give this person Organization Super Admin access?")) return false;
    if (beforeSuper && !afterSuper && !confirm("Remove Organization Super Admin access from this person?")) return false;
    return true;
  }


  async function saveSelected() {
    if (!validateForm()) { setMessage("Fix the highlighted fields before saving.", "warn"); return; }
    const payload = readForm();
    const restrictive = ["suspended","expelled","archived","blocked"].includes(key(payload.status_key));
    if (restrictive && isOwnSelectedPerson(selected)) { setMessage("You cannot restrict your own organization access from this page.", "warn"); return; }
    if (restrictive && !confirm("This status blocks or restricts access. Save anyway?")) return;
    if (!confirmAccessRoleChanges(payload)) return;
    payload.confirm_restrictive = restrictive;
    const res = await call("organization_save_person", payload);
    const savedMembershipId = clean(res.person?.membership_id || selected?.membership_id);
    selected = res.person || selected;
    setDirty(false);
    await loadPeople();
    if (savedMembershipId) await loadSelectedPerson(savedMembershipId);
    else if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
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
    refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; message = e.message || String(e); messageKind = "warn"; render(); });
  });
  function bootOrganizationPeople(options = {}) {
    mountOptions = { ...mountOptions, ...obj(options) };
    embeddedMode = Boolean(mountOptions.embedded);
    if (mountOptions.organizationId) selectedOrgId = clean(mountOptions.organizationId);
    if (mountOptions.selectedOrganizationId) selectedOrgId = clean(mountOptions.selectedOrganizationId);
    activePeopleLens = normalizePeopleLens(mountOptions.initialLens || mountOptions.peopleLens || mountOptions.lens || "");
    if (mountOptions.initialFilter) filter = normalizePrimaryPeopleFilter(mountOptions.initialFilter);
    else if (activePeopleLens === "admin-access") filter = "all";
    if (mountOptions.initialTab) activeTab = key(mountOptions.initialTab) || activeTab;
    else if (activePeopleLens === "admin-access") activeTab = "access";
    activeDefinitionKind = normalizeDefinitionKind(mountOptions.initialDefinition || mountOptions.definitionKind || mountOptions.initialView || mountOptions.view || activeDefinitionKind || "");
    if (activeDefinitionKind) { selectedDefinition = null; message = ""; messageKind = ""; }
    refreshAuth().catch((e) => {
      backend = { ok:false, message:e?.message || String(e) };
      message = e?.message || String(e);
      messageKind = "warn";
      authChecked = true;
      try { setShellState(); } catch {}
      render();
    });
  }

  function mount(target, options = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("People workbench mount target was not found.");
    externalRoot = el;
    mountOptions = { ...obj(options), embedded: options.embedded !== false };
    embeddedMode = Boolean(mountOptions.embedded);
    if (options.organizationId) selectedOrgId = clean(options.organizationId);
    if (options.selectedOrganizationId) selectedOrgId = clean(options.selectedOrganizationId);
    activePeopleLens = normalizePeopleLens(options.initialLens || options.peopleLens || options.lens || "");
    if (options.initialFilter) filter = normalizePrimaryPeopleFilter(options.initialFilter);
    else if (activePeopleLens === "admin-access") filter = "all";
    if (options.initialTab) activeTab = key(options.initialTab) || activeTab;
    else if (activePeopleLens === "admin-access") activeTab = "access";
    activeDefinitionKind = normalizeDefinitionKind(options.initialDefinition || options.definitionKind || options.initialView || options.view || "");
    if (activeDefinitionKind) { selectedDefinition = null; message = ""; messageKind = ""; }
    authChecked = false;
    backend = null;
    return refreshAuth().catch((e) => {
      backend = { ok:false, message:e?.message || String(e) };
      message = e?.message || String(e);
      messageKind = "warn";
      authChecked = true;
      render();
    });
  }

  window.SyncEtcPeopleAdmin = {
    version: VERSION,
    mount,
    boot: bootOrganizationPeople,
    isDirty,
    hasUnsavedChanges: isDirty,
    confirmDiscard,
    reload: () => refreshAuth()
  };

  window.SyncEtcPeopleAdminPage = window.SyncEtcPeopleAdmin;

  function autoInit() {
    if (autoStarted) return;
    if (!document.querySelector(ROOT_SELECTOR)) return;
    autoStarted = true;
    bootOrganizationPeople({ embedded: false });
  }

  if (!window.SyncEtcPeopleAdminSuppressAutoBoot) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit);
    else autoInit();
  }

})();
