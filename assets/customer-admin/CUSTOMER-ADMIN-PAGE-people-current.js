// CUSTOMER-ADMIN-PAGE-people-current.js
// Internal Version: 2026-06-16-116-H
// Purpose: Organization Admin People workbench. Supports standalone page and embedded Organization Management module runtime.

(function () {
  "use strict";

  const VERSION = "2026-06-16-116-H";
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
  let options = { statuses: [], membership_classes: [], application_stages: [], roles: [] };
  let people = [];
  let pageConfig = null;
  let selected = null;
  let activeDefinitionKind = "";
  let definitionLists = { statuses: [], membership_classes: [], application_stages: [], groups_roles: [] };
  let selectedDefinition = null;
  let definitionSearch = "";
  let definitionFilter = "all";
  let definitionSearchRestore = null;
  let definitionDragId = "";
  let definitionRpcAvailable = true;
  let search = "";
  let filter = "all";
  let roleFilter = "all";
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
    peopleCacheByOrg[clean(orgId)] = { cached_at_ms: Date.now(), adminAccess, options, pageConfig, people: arr(people).slice(), definitionLists: { statuses: arr(definitionLists.statuses).slice(), membership_classes: arr(definitionLists.membership_classes).slice(), application_stages: arr(definitionLists.application_stages).slice(), groups_roles: arr(definitionLists.groups_roles).slice() } };
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
    return "";
  }
  function normalizePeopleLens(value) {
    const k = key(value);
    if (["admin-access", "admins-access", "administrators", "administrator", "access", "people-admins", "administrators-access"].includes(k)) return "admin-access";
    return "";
  }
  function isDefinitionMode() { return Boolean(activeDefinitionKind); }
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
  async function logout() { if (!confirmDiscard()) return; setDirty(false); await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; allAccess = []; adminAccess = null; selectedOrgId = ""; people = []; selected = null; options = { statuses: [], membership_classes: [], application_stages: [], roles: [] }; definitionLists = { statuses: [], membership_classes: [], application_stages: [], groups_roles: [] }; selectedDefinition = null; authChecked = true; setShellState(); render(); }
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
        options = cached.options || { statuses: [], membership_classes: [], application_stages: [], roles: [] };
        pageConfig = cached.pageConfig || null;
        people = arr(cached.people).slice();
        definitionLists = cached.definitionLists || definitionLists;
        if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
        markLoad("people context cache", `${people.length} people`, run);
        if (isDefinitionMode() && !arr(definitionLists[definitionConfig(activeDefinitionKind).rowsKey]).length) {
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
    const shouldLoadPeopleList = !isDefinitionMode();
    const peoplePromise = shouldLoadPeopleList ? fetchPeopleList(run) : Promise.resolve(null);
    const [dash, vocab, peopleResult] = await Promise.all([dashboardPromise, vocabularyPromise, peoplePromise]);
    adminAccess = dash.access || adminAccess || null;
    options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: sortRoles(vocab.roles || []) };
    if (peopleResult) applyPeopleListResult(peopleResult);
    if (isDefinitionMode()) await loadPeopleDefinitionLists(run);
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
    if (statuses.length || classes.length || stages.length || roles.length) definitionLists = { statuses, membership_classes: classes, application_stages: stages, groups_roles: roles };
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
        groups_roles: arr(options.roles).map((r) => normalizeDefinitionRow(r, "groups-roles"))
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
        helper: "Define organization roles and groups, then assign them to people from Members / People.",
        listTitle: "Roles", newLabel: "New role", itemLabel: "role", rowsKey: "groups_roles",
        idField: "role_id", keyField: "role_key", categoryField: "role_type", categoryLabel: "Role type", categoryTip: "Choose how this role is used in your organization.",
        categories: [["member","Member"],["board","Board"],["officer","Officer"],["committee","Committee"],["instructor","Instructor"],["manager","Manager"],["staff","Staff"],["admin","Admin / access"],["access","Admin / access"],["group","Group"],["custom","Custom"]]
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
    const hay = [row.label, row.description, row.lifecycle_category, row.class_category, row.stage_category, row.role_type, row.role_key, row.dues_behavior, row.default_lifecycle_status_key].map(clean).join(" ").toLowerCase();
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
    const current = key(value) || (cfg.kind === "membership-classes" ? "member" : "active");
    return cfg.categories.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
  }

  function duesBehaviorOptions(value) {
    const current = key(value || "standard");
    const rows = [["standard","Standard"],["included_family","Included family"],["honorary_conditional","Honorary / conditional"],["reduced","Reduced"],["none","None"],["custom","Custom"]];
    return rows.map(([k,label]) => `<option value="${esc(k)}" ${current === k ? "selected" : ""}>${esc(label)}</option>`).join("");
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

  function definitionUsageLabel(row, cfg = definitionConfig()) {
    if (cfg.kind === "groups-roles") {
      const rk = key(row.role_key || row.definition_key);
      if (!rk) return "";
      const count = people.filter((person) => hasRole(person, rk)).length;
      return count === 1 ? "1 person assigned" : `${count} people assigned`;
    }
    return "";
  }

  function renderDefinitionRow(row) {
    const cfg = definitionConfig();
    const id = selectedDefinitionId(row);
    const selectedClass = selectedDefinitionId() === id ? "selected" : "";
    const status = definitionUiStatus(row);
    const muted = status === "archived" ? "archived" : status === "inactive" ? "restricted" : "";
    const category = clean(row[cfg.categoryField]);
    const usage = definitionUsageLabel(row, cfg);
    const meta = [category, usage, row.description].filter(Boolean).join(" • ");
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
      options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: sortRoles(vocab.roles || []) };
      saveOrgContextCache(selectedOrgId);
    } catch {}
  }

  async function saveDefinitionPayload(payload) {
    const cfg = definitionConfig();
    const action = cfg.kind === "membership-classes" ? "organization_save_membership_class" : cfg.kind === "application-stages" ? "organization_save_application_stage" : cfg.kind === "groups-roles" ? "organization_save_role_definition" : "organization_save_lifecycle_status";
    const data = await call(action, { organization_id: selectedOrgId, ...obj(payload) });
    setDefinitionListsFromPayload(data);
    await refreshAccessVocabularyAfterDefinitionSave();
    return data;
  }

  async function saveDefinition() {
    const payload = collectDefinitionPayload();
    const data = await saveDefinitionPayload(payload);
    const cfg = definitionConfig();
    const saved = cfg.kind === "membership-classes" ? obj(data.membership_class || data.saved_definition) : cfg.kind === "application-stages" ? obj(data.application_stage || data.saved_definition) : cfg.kind === "groups-roles" ? obj(data.role_definition || data.organization_role || data.saved_definition) : obj(data.lifecycle_status || data.saved_definition);
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
      const action = cfg.kind === "membership-classes" ? "organization_reorder_membership_classes" : cfg.kind === "application-stages" ? "organization_reorder_application_stages" : cfg.kind === "groups-roles" ? "organization_reorder_role_definitions" : "organization_reorder_lifecycle_statuses";
      const payload = cfg.kind === "membership-classes"
        ? { organization_id: selectedOrgId, membership_class_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
        : cfg.kind === "application-stages"
          ? { organization_id: selectedOrgId, application_stage_definition_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
          : cfg.kind === "groups-roles"
            ? { organization_id: selectedOrgId, role_ids: reordered.map((r) => selectedDefinitionId(r)).filter(Boolean) }
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

  function roleDefinitionsForAssignment() {
    return sortRoles(arr(options.roles)).filter((role) => definitionUiStatus(role) !== "archived");
  }

  function roleDefinitionByKey(roleKey) {
    const wanted = key(roleKey);
    return roleDefinitionsForAssignment().find((role) => key(role.role_key) === wanted) || null;
  }

  function roleTypeLabel(value) {
    const v = key(value || "custom");
    const labels = { member:"Member", board:"Board", officer:"Officer", committee:"Committee", instructor:"Instructor", manager:"Manager", staff:"Staff", admin:"Admin / access", access:"Admin / access", group:"Group", custom:"Custom", other:"Other" };
    return labels[v] || clean(value || "Other");
  }

  function roleAssignmentGroupKey(role) {
    const rk = key(role?.role_key);
    if (["organization-super-admin", "organization-admin"].includes(rk) || isManagerRole(rk) || ["access", "admin"].includes(key(role?.role_type))) return "access";
    return key(role?.role_type || "custom") || "custom";
  }

  function roleAssignmentGroups(roles) {
    const groupOrder = ["access", "board", "officer", "manager", "committee", "instructor", "staff", "group", "member", "custom", "other"];
    const buckets = new Map();
    arr(roles).forEach((role) => {
      const g = roleAssignmentGroupKey(role);
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(role);
    });
    return Array.from(buckets.entries()).sort((a,b) => {
      const ai = groupOrder.indexOf(a[0]);
      const bi = groupOrder.indexOf(b[0]);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || roleTypeLabel(a[0]).localeCompare(roleTypeLabel(b[0]));
    }).map(([groupKey, rows]) => ({ groupKey, label: roleTypeLabel(groupKey), rows: sortRoles(rows) }));
  }

  function personRoleDisplayLabels(p, max = 2) {
    const defsByKey = new Map(roleDefinitionsForAssignment().map((role) => [key(role.role_key), role]));
    return arr(p.role_keys).map((roleKey, index) => {
      const role = defsByKey.get(key(roleKey));
      return clean(role?.label || arr(p.role_labels)[index] || roleKey);
    }).filter((label) => label && key(label) !== "member").slice(0, max);
  }

  function personMatchesRoleFilter(p) {
    const rf = key(roleFilter || "all");
    return !rf || rf === "all" || hasRole(p, rf);
  }

  function roleFilterOptions() {
    const rows = roleDefinitionsForAssignment();
    const basePeople = people.filter((p) => personMatchesSearch(p, search) && personMatchesLens(p, filter));
    const countFor = (roleKey) => basePeople.filter((p) => hasRole(p, roleKey)).length;
    return [["all", `All roles (${basePeople.length})`]].concat(rows.map((role) => [key(role.role_key), `${clean(role.label || role.role_key)} (${countFor(role.role_key)})`]));
  }

  function personMatchesSearch(p, searchText) {
    const s = lower(searchText);
    if (!s) return true;
    const hay = [p.display_name,p.first_name,p.last_name,p.primary_email,p.email,p.phone,p.primary_phone,p.member_number,p.title,p.lifecycle_status_label,p.lifecycle_status_key,p.membership_class_label,p.membership_class_key,p.application_stage_label,p.application_stage_key,...arr(p.role_labels),...arr(p.role_keys),...arr(p.login_emails)].map(clean).join(" ").toLowerCase();
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
    if (f === "board") return hasRole(p, "board-member");
    if (f === "managers") return arr(p.role_keys).some(isManagerRole);
    if (f === "users") return hasRole(p, "member") && !hasAnyRole(p, ["organization-super-admin", "organization-admin"]);
    if (f === "non-member") return classKey === "non-member" || classCat === "non-member" || classCat === "non_member";
    if (f === "no-login") return !bool(p.login_linked);
    if (f === "platform-internal") return isPlatformInternal(p);
    return true;
  }

  function filteredPeople() {
    const rows = people.filter((p) => personMatchesLens(p, filter) && personMatchesRoleFilter(p) && personMatchesSearch(p, search));
    return sortPersonRows(rows);
  }

  function counts() {
    const keys = ["all","active","applicants","waitlist","onboarding","former","restricted","admins-access","admins","board","managers","users","non-member","no-login","archived"];
    const out = Object.fromEntries(keys.map((f) => [f, 0]));
    people.forEach((p) => {
      if (!personMatchesSearch(p, search)) return;
      if (!personMatchesRoleFilter(p)) return;
      keys.forEach((f) => { if (personMatchesLens(p, f)) out[f] += 1; });
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

  function renderFinder() {
    const c = counts();
    const rows = filteredPeople();
    const roleOptions = roleFilterOptions();
    const showRoleFilter = !isAdminAccessLens() && roleDefinitionsForAssignment().length > 0;
    const adminLens = isAdminAccessLens();
    const filters = adminLens
      ? [["admins-access","Admins & access"],["admins","Organization admins"],["managers","Managers"],["board","Board"],["users","Members"],["no-login","No login"],["archived","Archived"],["all","All"]]
      : [["all","All"],["active","Active"],["applicants","Applicants"],["waitlist","Waitlist"],["onboarding","Onboarding"],["former","Former"],["restricted","Suspended / Expelled"],["admins","Admins"],["board","Board"],["managers","Managers"],["users","Members"],["non-member","Non-member"],["no-login","No Login"],["archived","Archived"]];
    return `<aside class="people-list-panel">
      <div class="people-list-head"><div><h3>${adminLens ? "Administrators & Access" : "People"}</h3><p>${adminLens ? "Find people with login, manager, board, or administrator access." : "Search and filter organization records."}</p></div></div>
      <div class="people-toolbar-row"><button id="people-export" class="people-btn secondary" type="button">Export</button><button id="people-print" class="people-btn secondary" type="button">Print</button><button id="people-refresh" class="people-btn secondary" type="button">Refresh</button></div>
      <label class="people-field people-status-filter"><span>${adminLens ? "Access lens" : "Status / lens"}</span><select id="people-filter-select">${filters.map(([f,label]) => `<option value="${esc(f)}" ${filter===f ? "selected" : ""}>${esc(label)} (${c[f] || 0})</option>`).join("")}</select></label>
      ${showRoleFilter ? `<label class="people-field people-status-filter"><span>Role / group</span><select id="people-role-filter-select">${roleOptions.map(([value,label]) => `<option value="${esc(value)}" ${roleFilter===value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>` : ""}
      <div class="people-search-wrap"><input id="people-search" value="${esc(search)}" placeholder="Search names, emails, phones, roles…"><button id="people-clear-search" class="people-icon-btn" title="Clear" type="button">×</button></div>
      <div class="people-sort-hint">Sorted by last name. Archived rows stay visible in All and are muted at the bottom.</div>
      <div class="people-compact-list">${rows.length ? rows.map(renderPersonCard).join("") : `<div class="people-empty-row">No people match this search.</div>`}</div>
    </aside>`;
  }



  function renderPersonCard(p) {
    const selectedClass = selected?.membership_id === p.membership_id ? "selected" : "";
    const archived = isArchivedRow(p) ? "archived" : "";
    const restricted = isRestrictedRow(p) ? "restricted" : "";
    const roleBadges = personRoleDisplayLabels(p, 2);
    const badges = [p.lifecycle_status_label || p.lifecycle_status_key, p.membership_class_label, ...roleBadges, p.login_linked ? "Login" : "No login"].filter(Boolean).slice(0, 5);
    return `<button class="people-person-card ${selectedClass} ${archived} ${restricted}" data-open="${esc(p.membership_id)}" type="button"><span class="person-main"><strong>${esc(finderDisplayName(p))}</strong><small>${esc(clean(p.primary_email || p.email || p.primary_phone || p.phone || "No contact on file"))}</small></span><span class="person-badges">${badges.map((b) => `<em>${esc(b)}</em>`).join("")}</span></button>`;
  }


  function renderPersonTimeline(row) {
    const notes = Array.isArray(row.timeline_notes) ? row.timeline_notes : [];
    return `<div class="people-form-grid"><label class="people-field people-field-wide"><span>Add admin note</span><textarea id="people-timeline-note" placeholder="Add a dated admin note for this person. These notes are not visible to the person."></textarea><small>Notes added here can carry forward from applicant history and continue through the person/member lifecycle.</small></label></div><div class="people-inline-actions"><button id="people-add-timeline-note" class="people-btn secondary" type="button">Add note</button></div><div class="people-timeline-list">${notes.length ? notes.map((n) => `<div class="people-note-card"><strong>${esc((n.application_id && !String(n.title||'').toLowerCase().includes('applicant')) ? `Applicant history — ${n.title || n.note_type || 'Note'}` : (n.title || n.note_type || "Note"))}</strong><span>${esc(new Date(n.created_at || Date.now()).toLocaleString())}</span><p>${esc(n.body || "")}</p><small>${esc(n.actor_name || n.actor_email || "System")}${n.application_id ? ' • Applicant-origin history' : ''}</small></div>`).join("") : `<div class="people-empty-row">No admin timeline notes yet.</div>`}</div>`;
  }


  function renderAccessTab(row, roles, mayEdit, mayEditAnyRole, mayEditSuperAdmin) {
    const rowRoleKeys = arr(row.role_keys).map(key);
    const rowRoleSet = new Set(rowRoleKeys);
    const roleRows = roleDefinitionsForAssignment();
    const selectedRoles = roleRows.filter((role) => rowRoleSet.has(key(role.role_key)));
    const selectedLabels = selectedRoles.map((role) => clean(role.label || role.role_key)).filter(Boolean);
    const adminLevel = hasSuperAdminRoleKeys(row) ? "Organization Super Admin" : hasAdminRoleKeys(row) ? "Organization Admin" : arr(row.role_keys).some(isManagerRole) ? "Manager access" : hasRole(row, "board-member") ? "Board access" : "Standard access";
    const ownWarning = isOwnSelectedPerson(row) ? `<p class="people-warning">You are editing your own access. Changes that would remove your organization admin access are blocked.</p>` : "";
    const accessSummary = `<div class="people-access-summary">
      <div><span>Login</span><strong>${row.login_linked ? "Linked" : "Not linked"}</strong></div>
      <div><span>Access level</span><strong>${esc(adminLevel)}</strong></div>
      <div><span>Groups / roles</span><strong>${esc(selectedLabels.length ? selectedLabels.join(", ") : "None assigned")}</strong></div>
    </div>`;
    const roleSections = roleAssignmentGroups(roleRows).map((group) => {
      const rows = group.rows.map((role) => {
        const rk = key(role.role_key);
        const locked = !mayEditAnyRole || (isSuperAdminRole(rk) && !mayEditSuperAdmin);
        const checked = rowRoleSet.has(rk);
        const description = clean(role.description || obj(role.settings_json).description || "");
        const hint = locked && isSuperAdminRole(rk) ? "Super Admin locked" : "";
        return `<label class="people-role-option ${checked ? "checked" : ""} ${locked ? "locked" : ""}"><input id="role-${esc(rk)}" type="checkbox" ${checked ? "checked" : ""} ${locked ? "disabled" : ""}><span><strong>${esc(role.label || rk)}</strong>${description ? `<small>${esc(description)}</small>` : hint ? `<small>${esc(hint)}</small>` : ""}</span></label>`;
      }).join("");
      return `<section class="people-role-group"><h4>${esc(group.label)}</h4><div class="people-role-grid">${rows}</div></section>`;
    }).join("");
    const emptyRoles = !roleRows.length ? `<div class="people-empty-row">No groups or roles are active yet. Define them under Groups / Roles, then return here to assign them.</div>` : "";
    return `<div class="people-access-callout"><div><strong>Access actions</strong><p>Send login help or update this person's groups and roles.</p></div><div class="people-inline-actions"><button id="people-invite" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Send invite</button><button id="people-reset-password" class="people-btn secondary" type="button" ${mayEdit ? "" : "disabled"}>Password reset</button></div></div>${accessSummary}${ownWarning}<div class="people-role-assignment-head"><div><strong>Groups & roles</strong><p>Choose the groups, committees, officer roles, instructor roles, or access roles this person belongs to.</p></div></div>${emptyRoles}${roleSections}${!mayEditAnyRole ? `<p class="people-warning">Role editing is locked for your account.</p>` : !mayEditSuperAdmin ? `<p class="people-warning">Organization Super Admin is locked. You can manage ordinary roles and Organization Admin.</p>` : ""}`;
  }


  function renderEditor() {
    const row = selected;
    const access = selectedRow();
    const mayEdit = canManagePeople(access);
    const mayEditAnyRole = canManageSafeRoles(access);
    const mayEditSuperAdmin = canManageSuperAdminRoles(access);
    if (!row) return `<section class="people-editor-panel people-empty"><h3>${isAdminAccessLens() ? "Select an access record" : "Select a person"}</h3><p>${isAdminAccessLens() ? "Choose someone on the left to review login status, invitations, and organization roles." : "Choose someone on the left, or create a new person. This single People workbench covers members, applicants, onboarding users, former people, restricted records, and administrators."}</p></section>`;

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
      <div class="people-tab-panel ${tab === "aviation" ? "active" : ""}" data-tab-panel="aviation" ${tab === "aviation" ? "" : "hidden"}><div class="people-check-grid">${checkbox("people-club-cfi","CFI / instructor",aviation.club_cfi)}${checkbox("people-maintenance","Maintenance crew",aviation.on_maintenance_crew)}${checkbox("people-ifr-rated","IFR rated",aviation.ifr_rated)}${checkbox("people-night-checkout","Night checkout",aviation.club_night_checkout)}</div><div class="people-form-grid">${input("people-bfr-expiry","Flight review / BFR expiry",aviation.bfr_expiry_date,"date")}${input("people-last-checkout","Last organization checkout",aviation.last_club_checkout,"date")}${input("people-medical-expiry","Medical expiry",aviation.medical_expiry_date,"date")}${input("people-last-medical","Last medical date",aviation.last_medical_date,"date")}${input("people-medical-class","Medical class",aviation.medical_class)}${input("people-application-date","Application date",aviation.application_date || applicant.application_date,"date")}${input("people-employer","Employer",background.employer)}${input("people-occupation","Occupation",background.occupation)}${input("people-ratings","Ratings",aviation.ratings)}${input("people-pilot-certificate","Pilot certificate #",aviation.pilot_certificate_number)}${input("people-aircraft-types","Aircraft types",aviation.aircraft_types)}${input("people-bfr-aircraft","BFR aircraft",aviation.bfr_aircraft)}${input("people-clubs-fbos","Prior clubs/FBOs",aviation.clubs_fbos)}${input("people-flying-type","Type of flying",aviation.flying_type)}${input("people-total-hours","Total hours",aviation.total_hours,"number")}${input("people-night-hours","Night hours",aviation.total_night_hours,"number")}${input("people-ifr-hours","IFR hours",aviation.total_ifr_hours,"number")}${input("people-complex-hours","Complex hours",aviation.total_complex_hours,"number")}</div></div>
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
    if (isDefinitionMode()) return renderDefinitionModule(warningMessage);
    const adminLens = isAdminAccessLens();
    const title = adminLens ? "Administrators & Access" : (clean(pageConfig?.title) || "Members / People");
    const intro = adminLens ? "Manage login status, invitations, password help, and organization roles." : (clean(pageConfig?.intro_text) || "Manage people, member lifecycle, contact details, access roles, and administrator flags from one workbench.");
    return `<section class="people-module-header"><div><span class="people-kicker">People</span><h2>${esc(title)}</h2><p>${esc(intro)}</p></div><div class="people-header-actions">${!embeddedMode ? renderOrgSelector() : ""}<button id="people-new" class="people-btn outline" type="button">New person</button></div></section>${warningMessage}<section class="people-workbench">${renderFinder()}${renderEditor()}</section>`;
  }

  function peopleStyles(cfg) {
    return `
      .people-wrap{${cssVars(cfg)}width:100%;max-width:${embeddedMode ? "none" : "var(--people-page-width)"};margin:${embeddedMode ? "0" : "24px auto"};padding:${embeddedMode ? "0" : "0 18px 24px"};font-family:Inter,Arial,Helvetica,sans-serif;color:var(--people-text);box-sizing:border-box;}
      .people-wrap *{box-sizing:border-box}.people-card,.people-module-header,.people-list-panel,.people-editor-panel{background:rgba(255,255,255,.98);border:1px solid var(--people-border);border-radius:14px;box-shadow:0 6px 18px rgba(16,24,40,.07)}
      .people-card{padding:18px;margin:12px 0}.people-hero{display:${embeddedMode ? "none" : "block"};background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.78)});color:#fff}.people-hero h1{margin:8px 0;color:#fff;font-size:clamp(28px,4vw,42px);letter-spacing:-.035em}.people-hero p{color:rgba(255,255,255,.9);max-width:900px}.people-eyebrow,.people-kicker{display:inline-flex;padding:5px 10px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.people-hero .people-eyebrow{background:rgba(255,255,255,.16);color:#fff}
      .people-module-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:15px 17px;margin:0 0 10px;border-top:3px solid var(--people-primary)}.people-module-header h2{margin:6px 0 4px;font-size:25px;line-height:1.1;color:#101828}.people-module-header p{margin:0;color:var(--people-muted);font-weight:650}.people-header-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .people-workbench{display:grid;grid-template-columns:330px minmax(0,1fr);gap:10px;align-items:start}.people-list-panel{padding:12px;position:sticky;top:10px;max-height:calc(100vh - 24px);overflow:auto}.people-list-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.people-list-head h3,.people-editor-head h3{margin:0;font-size:21px;color:#101828}.people-list-head p{margin:4px 0 0;color:var(--people-muted);font-weight:650}.people-toolbar-row,.people-inline-actions,.people-action-buttons,.people-pill-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.people-toolbar-row{margin:8px 0 10px}.people-btn,.people-icon-btn,.people-link-btn{border:0;border-radius:999px;background:var(--people-primary);color:#fff;font-weight:900;padding:10px 14px;cursor:pointer;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.people-btn:hover,.people-person-card:hover{transform:translateY(-1px)}.people-btn.secondary,.people-btn.outline{background:#fff;color:var(--people-primary);border:1px solid var(--people-primary)}.people-btn.danger{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.people-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}.people-link-btn{background:transparent;color:var(--people-primary);text-decoration:underline;padding:8px}.people-message{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--people-soft);color:var(--people-primary);font-weight:850}.people-message:empty{display:none}.people-message.ok{background:#ecfdf5;color:#047857}.people-message.warn,.people-warning{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:12px;padding:10px 12px}.people-action-status{display:block;margin-top:3px;color:var(--people-muted);font-size:12px;line-height:1.25}.people-context-single{display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.14);padding:9px 12px;border-radius:999px;font-weight:900}.muted{color:var(--people-muted)}
      .people-field{display:grid;gap:6px;font-weight:850}.people-field span{font-size:13px}.people-field small{font-weight:600;color:var(--people-muted);line-height:1.35}.people-field input,.people-field select,.people-field textarea,.people-search-wrap input,#people-org-select{width:100%;border:1px solid var(--people-border);border-radius:12px;background:#fff;color:var(--people-text);padding:10px 12px;font:inherit;min-height:42px}.people-field textarea{min-height:104px;resize:vertical}.people-field input[readonly],.people-field input:disabled,.people-field select:disabled{background:#f8fafc;color:var(--people-muted);cursor:not-allowed}.people-field-wide{grid-column:1/-1}.field-error{color:#b91c1c!important;font-weight:900!important}.people-field.disabled-field{opacity:.72}.people-status-filter{margin:10px 0}.people-search-wrap{position:relative;margin:10px 0}.people-search-wrap input{padding-right:44px}.people-icon-btn{position:absolute;right:6px;top:5px;width:32px;height:32px;padding:0;background:var(--people-soft);color:var(--people-primary)}.people-sort-hint{font-size:12px;color:var(--people-muted);font-weight:750;margin:8px 0 10px}.people-compact-list{display:grid;gap:7px;max-height:calc(100vh - 320px);min-height:240px;overflow:auto;padding:3px 2px 8px;overscroll-behavior:contain}.people-person-card{text-align:left;border:1px solid var(--people-border);border-radius:13px;background:#fff;color:var(--people-text);padding:10px;display:grid;gap:8px;cursor:pointer;box-shadow:0 3px 11px ${rgba(cfg.primary,.04)}}.people-person-card.selected{border-color:var(--people-primary);box-shadow:0 0 0 3px var(--people-strong-soft)}.people-person-card.archived{opacity:.58;background:#f8fafc}.people-person-card.restricted:not(.archived){border-color:#fed7aa;background:#fff7ed}.person-main{display:grid;gap:3px;min-width:0}.person-main strong{font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-main small{color:var(--people-muted);font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-badges{display:flex;gap:4px;flex-wrap:wrap}.person-badges em{font-style:normal;font-size:10px;font-weight:900;border-radius:999px;padding:3px 6px;background:var(--people-soft);color:var(--people-primary)}.people-empty-row{border:1px dashed var(--people-border);border-radius:13px;padding:18px;text-align:center;color:var(--people-muted);background:#fff}.people-empty{min-height:380px;display:grid;align-content:center;text-align:center;padding:24px}
      .people-editor-panel{min-width:0;padding:0;overflow:hidden}.people-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:15px 17px;border-bottom:1px solid var(--people-border)}.people-pill{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:var(--people-soft);color:var(--people-primary);font-size:12px;font-weight:900}.people-pill.ok{background:#ecfdf5;color:#047857}.people-pill.warn{background:#fff7ed;color:#9a3412}.people-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--people-border);background:#fcfcfd}.people-tab{border:1px solid var(--people-border);border-radius:999px;background:#fff;color:var(--people-primary);font-weight:900;padding:8px 11px;cursor:pointer}.people-tab.active{background:var(--people-primary);color:#fff;border-color:var(--people-primary)}.people-tab-panel{padding:16px}.people-tab-panel[hidden]{display:none!important}.people-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}.people-access-status-grid{padding-bottom:8px}.people-affiliation-grid{padding-top:8px;border-top:1px solid var(--people-border)}.phone-grid{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;align-items:end;margin:10px 0 14px}.primary-pick{min-height:42px;display:flex;gap:8px;align-items:center;justify-content:center;border:1px solid var(--people-border);border-radius:12px;background:var(--people-soft);font-weight:900;color:var(--people-primary)}.people-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.people-check{display:flex;gap:9px;align-items:flex-start;padding:10px 11px;border:1px solid var(--people-border);border-radius:12px;background:#fff;font-weight:900}.people-check.disabled{opacity:.62;background:#f8fafc}.people-check input{width:auto;min-height:0;margin-top:2px}.people-check small{display:block;font-size:11px;color:#9a3412;margin-top:2px}.people-access-callout{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid var(--people-border);border-radius:13px;background:var(--people-soft);padding:12px;margin-bottom:14px}.people-access-callout p{margin:4px 0 0;color:var(--people-muted);font-weight:650}.people-access-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}.people-access-summary>div{border:1px solid var(--people-border);border-radius:12px;background:#fff;padding:10px;display:grid;gap:3px}.people-access-summary span{font-size:11px;color:var(--people-muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}.people-access-summary strong{font-size:13px;line-height:1.25}.people-inline-actions{margin:10px 0}.people-action-row{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid var(--people-border);padding:12px 14px;background:#fcfcfd}.people-save-state{display:grid;gap:2px;font-weight:900;color:var(--people-muted)}.people-save-state.dirty{color:#9a3412}.people-photo-panel{grid-column:1/-1;display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;align-items:center;border:1px dashed var(--people-border);border-radius:14px;background:var(--people-soft);padding:14px}.people-photo-panel.dragover{box-shadow:0 0 0 3px var(--people-strong-soft);border-color:var(--people-primary)}.people-photo-preview{width:132px;height:132px;border-radius:18px;background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--people-border);box-shadow:0 10px 26px ${rgba(cfg.primary,.16)}}.people-photo-preview img{width:100%;height:100%;object-fit:cover;display:block}.people-photo-preview span{font-size:38px;font-weight:950;letter-spacing:.03em}.people-photo-copy strong{display:block;color:var(--people-primary);font-size:15px;margin-bottom:4px}.people-photo-copy p{margin:0 0 8px;color:var(--people-muted);font-weight:750}.people-photo-copy small{display:block;color:var(--people-muted);font-weight:750;margin-bottom:10px}.people-photo-actions{display:flex;gap:8px;flex-wrap:wrap}.people-timeline-list{display:grid;gap:10px;margin-top:10px}.people-note-card{border-left:4px solid var(--people-primary);background:#f8fafc;border-radius:12px;padding:10px}.people-note-card strong{display:block;color:var(--people-primary)}.people-note-card span{font-size:12px;color:#64748b;font-weight:800}.people-note-card p{margin:6px 0;white-space:pre-wrap}.people-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:12px;padding:14px;font-size:12px;max-height:260px;overflow:auto}.people-footer{margin:10px auto 0;text-align:center;color:var(--people-muted);font-size:12px;font-weight:800}.people-footer a{color:var(--people-primary);text-decoration:none;font-weight:950}.people-def-row{padding:0;display:grid;grid-template-columns:30px minmax(0,1fr) 34px;align-items:stretch;overflow:hidden;cursor:grab}.people-def-row.dragging{opacity:.55}.people-def-row.drag-over{outline:2px dashed var(--people-primary);outline-offset:2px}.people-def-drag-handle{display:flex;align-items:center;justify-content:center;color:var(--people-muted);font-weight:950;letter-spacing:-5px;background:#f8fafc;border-right:1px solid var(--people-border);cursor:grab;user-select:none}.people-def-row .people-def-main{border:0;background:transparent;text-align:left;padding:10px;display:grid;gap:7px;cursor:pointer;color:inherit}.people-def-order{display:flex;flex-direction:column;justify-content:space-between;border-left:1px solid var(--people-border);background:#f8fafc}.people-order-button{border:0;background:#f8fafc;color:var(--people-primary);font-weight:950;width:34px;min-height:32px;cursor:pointer}.people-order-button:first-child{border-bottom:1px solid var(--people-border)}.people-order-button:last-child{border-top:1px solid var(--people-border)}.people-order-button:disabled{opacity:.35;cursor:not-allowed}.people-info-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:5px;border:1px solid var(--people-border);border-radius:999px;background:#fff;color:var(--people-primary);font-size:11px;font-weight:950;line-height:1;vertical-align:middle;padding:0;cursor:help}.people-def-editor .people-tab-panel>.people-form-grid{grid-template-columns:1fr}.people-def-editor .people-form-grid .people-form-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.people-role-assignment-head{margin:16px 0 8px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.people-role-assignment-head strong{display:block;color:var(--people-primary);font-size:14px}.people-role-assignment-head p{margin:3px 0 0;color:var(--people-muted);font-size:12px;font-weight:800}.people-role-group{border:1px solid var(--people-border);border-radius:14px;padding:12px;margin:12px 0;background:#fff}.people-role-group h4{margin:0 0 9px;color:var(--people-primary);font-size:13px}.people-role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.people-role-option{border:1px solid var(--people-border);border-radius:12px;padding:10px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;background:#f8fafc;cursor:pointer}.people-role-option.checked{border-color:color-mix(in srgb,var(--people-primary) 45%,#fff);background:color-mix(in srgb,var(--people-primary) 8%,#fff)}.people-role-option.locked{opacity:.72;cursor:not-allowed}.people-role-option input{margin-top:2px}.people-role-option strong{display:block;color:#111827;font-size:13px}.people-role-option small{display:block;color:var(--people-muted);font-weight:750;margin-top:2px}.people-action-status.ok{color:#047857}.people-action-status.warn{color:#9a3412}
      @media(max-width:1100px){.people-workbench{grid-template-columns:1fr}.people-list-panel{position:static;max-height:none}.people-compact-list{max-height:320px;min-height:0}.people-form-grid,.people-check-grid,.people-access-summary{grid-template-columns:1fr 1fr}.people-module-header,.people-action-row,.people-access-callout{display:grid}.people-header-actions,.people-action-buttons{justify-content:flex-start}.phone-grid{grid-template-columns:1fr}.primary-pick{justify-content:flex-start;padding:0 12px}}
      @media(max-width:640px){.people-form-grid,.people-check-grid,.people-access-summary{grid-template-columns:1fr}.people-photo-panel{grid-template-columns:1fr}.people-photo-preview{margin:auto}.people-btn{width:100%}.people-action-buttons{width:100%}}
      @media print{#syncetc-portal-shell,.people-hero,.people-list-panel,.people-editor-panel,.people-message,.people-module-header{display:none!important}.people-wrap{max-width:none;margin:0;padding:0}.people-card{box-shadow:none;border:none}}
    `;
  }


  function render() {
    const el = ensureRoot();
    if (!el) return;
    const cfg = styleConfig(selectedRow());
    const diagnostics = currentDebugEnabled() ? `<details class="people-card"><summary>Diagnostics</summary><pre class="people-backend">${esc(JSON.stringify({ version: VERSION, embedded: embeddedMode, organization_id: selectedOrgId, active_tab: activeTab, active_people_lens: activePeopleLens, active_definition_kind: activeDefinitionKind, people_count: people.length, definition_counts: { statuses: arr(definitionLists.statuses).length, membership_classes: arr(definitionLists.membership_classes).length, application_stages: arr(definitionLists.application_stages).length, groups_roles: arr(definitionLists.groups_roles).length }, cache_ttl_ms: PEOPLE_CACHE_TTL_MS, parent_script_load_ms: mountOptions.scriptLoadMs || null, load_timings: loadTimings, backend: backend || {} }, null, 2))}</pre></details>` : "";
    el.innerHTML = `<style>${peopleStyles(cfg)}</style><div class="people-wrap"><section class="people-card people-hero"><div class="people-eyebrow">Organization Admin</div><h1>${esc(clean(pageConfig?.title) || "People & Access")}</h1><p>${esc(clean(pageConfig?.intro_text) || "Search the full people pool, manage members and applicants, keep contact information current, and handle safe access updates from one place.")}</p><div class="people-message ${esc(messageKind)}">${esc(message)}</div></section>${renderContent()}${diagnostics}</div>`;
    bindEvents();
    restorePeopleSearchFocus();
    restoreDefinitionSearchFocus();
    if (!isDefinitionMode()) activateTab(activeTab);
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

  function bindEvents() {
    $("people-login")?.addEventListener("click", () => runButton("people-login", "Logging in…", login));
    $("people-logout")?.addEventListener("click", () => runButton("people-logout", "Logging out…", logout));
    $("people-reset-own")?.addEventListener("click", () => runButton("people-reset-own", "Sending…", resetOwnPassword));
    $("people-org-select")?.addEventListener("change", async (e) => { if (!confirmDiscard()) { e.target.value = selectedOrgId; return; } setDirty(false); selectedOrgId = e.target.value; try { localStorage.setItem(SELECTED_ORG_KEY, selectedOrgId); } catch {} adminAccess = null; selected = null; selectedDefinition = null; try { await loadOrgContext({ force: true }); setMessage("Organization loaded.", "ok"); } catch (err) { setMessage(err.message || String(err), "warn"); } render(); });
    bindDefinitionEvents();
    $("people-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = filter; return; } setDirty(false); filter = e.target.value || "all"; render(); });
    $("people-role-filter-select")?.addEventListener("change", (e) => { if (!confirmDiscard()) { e.target.value = roleFilter; return; } setDirty(false); roleFilter = e.target.value || "all"; render(); });
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
    refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; message = e.message || String(e); messageKind = "warn"; render(); });
  });
  function bootOrganizationPeople(options = {}) {
    mountOptions = { ...mountOptions, ...obj(options) };
    embeddedMode = Boolean(mountOptions.embedded);
    if (mountOptions.organizationId) selectedOrgId = clean(mountOptions.organizationId);
    if (mountOptions.selectedOrganizationId) selectedOrgId = clean(mountOptions.selectedOrganizationId);
    activePeopleLens = normalizePeopleLens(mountOptions.initialLens || mountOptions.peopleLens || mountOptions.lens || "");
    if (mountOptions.initialFilter) filter = clean(mountOptions.initialFilter) || filter;
    else if (activePeopleLens === "admin-access") filter = "admins-access";
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
    if (options.initialFilter) filter = clean(options.initialFilter) || filter;
    else if (activePeopleLens === "admin-access") filter = "admins-access";
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
