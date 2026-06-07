// CUSTOMER-ADMIN-PAGE-dashboard-current.js
// Internal Version: 2026-06-07-013-A
// Purpose: Organization-admin dashboard foundation. Same Supabase Auth login as user dashboard; permissions decide organization-admin access; organization style inherited after access context resolves.

(function () {
  "use strict";

  const VERSION = "2026-06-07-013-A";
  const ROOT_ID = "syncetc-organization-admin-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let adminAccess = null;
  let selectedOrgId = "";
  let backend = null;
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const adminRows = () => access.filter((row) => row.is_organization_admin || obj(row.capabilities).can_view_organization_admin || (row.permission_keys || []).includes("organization.admin.open") || (row.permission_keys || []).includes("organization.view_admin"));
  const selectedRow = () => adminAccess || adminRows().find((r) => String(r.organization_id) === selectedOrgId) || adminRows()[0] || null;

  function loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`)); document.head.appendChild(s); }); }
  async function ensureSupabase() { if (supabaseClient) return supabaseClient; if (!window.supabase) await loadScript(SUPABASE_JS); supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return supabaseClient; }

  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 }; return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function styleConfig(row) { const profile = obj(row?.style_profile); const colors = obj(profile.colors_json); const effects = obj(profile.effects_json); const spacing = obj(profile.spacing_json); const layout = obj(profile.layout_json); const primary = getText(colors,"brand_primary","#1f4f82"); const secondary = getText(colors,"brand_secondary","#eef3f8"); const surface = getText(colors,"surface","#ffffff"); const text = getText(colors,"text","#172033"); const corners = getText(effects,"corners","soft"); const width = getText(spacing,"page_width",getText(layout,"default_width","wide")); return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius: corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px", pageWidth: width === "narrow" ? "880px" : width === "normal" ? "1040px" : "1180px" }; }
  function cssVars(cfg) { return `--org-primary:${cfg.primary};--org-secondary:${cfg.secondary};--org-surface:${cfg.surface};--org-text:${cfg.text};--org-muted:${cfg.muted};--org-border:${cfg.border};--org-soft:${cfg.soft};--org-shadow:${cfg.shadow};--org-radius:${cfg.radius};--org-page-width:${cfg.pageWidth};`; }

  function setShellState() { const row = selectedRow(); window.SyncEtcPortalShell?.setState?.({ authenticated: Boolean(token), email, mode: "org-admin", organizationName: row?.organization_name || "", organizationKey: row?.organization_key || "", styleProfile: row?.style_profile || null, accessRow: row || null, organizationOptions: adminRows(), selectedOrganizationId: selectedOrgId, platformAdmin }); }
  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  async function refreshAuth() { await ensureSupabase(); const { data } = await supabaseClient.auth.getSession(); token = data?.session?.access_token || ""; email = data?.session?.user?.email || ""; if (token) await loadAccess(); setShellState(); render(); }
  async function login() { await ensureSupabase(); const e = emailNorm($("orgadm-email")?.value); const p = $("orgadm-password")?.value || ""; if (!e || !p) throw new Error("Enter email and password."); const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p }); if (error) throw error; await refreshAuth(); setMessage(`Logged in as ${e}`, "ok"); }
  async function signUp() { await ensureSupabase(); const e = emailNorm($("orgadm-email")?.value); const p = $("orgadm-password")?.value || ""; if (!e || !p) throw new Error("Enter email and a password to create an account."); if (p.length < 8) throw new Error("Password should be at least 8 characters."); const { error } = await supabaseClient.auth.signUp({ email: e, password: p, options: { emailRedirectTo: `${window.location.origin}/organization-admin` } }); if (error) throw error; setMessage("Account request submitted. Check email if confirmation is required, then log in.", "ok"); }
  async function resetPassword() { await ensureSupabase(); const e = emailNorm($("orgadm-email")?.value); if (!e) throw new Error("Enter your email first."); const { error } = await supabaseClient.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/password-reset` }); if (error) throw error; setMessage("Password reset email requested. Check your inbox.", "ok"); }
  async function logout() { await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; access = []; adminAccess = null; selectedOrgId = ""; backend = null; setShellState(); render(); }
  async function call(action, payload = {}) { if (!token) throw new Error("Log in first."); const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) }); const json = await res.json().catch(() => ({})); backend = json; if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`); return json; }
  async function loadAccess() { const res = await call("get_my_access"); platformAdmin = Boolean(res.platform_admin); access = res.access || []; if (!selectedOrgId && adminRows()[0]) selectedOrgId = String(adminRows()[0].organization_id); if (selectedOrgId) await loadAdminDashboard(); setShellState(); }
  async function loadAdminDashboard() { if (!selectedOrgId) return; const res = await call("get_organization_admin_dashboard", { organization_id: selectedOrgId }); adminAccess = res.access || null; setShellState(); }
  async function runButton(id, label, fn) { const btn = $(id); const old = btn?.textContent || ""; try { if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); } catch (e) { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message === "Invalid login credentials" ? "Invalid login credentials. Use Forgot password? or Create account." : e.message || String(e), "warn"); } finally { if (btn) { btn.disabled = false; btn.textContent = old; } } }

  function renderLogin() { if (token) return ""; return `<div id="syncetc-page-login" class="orgadm-login"><input id="orgadm-email" type="email" placeholder="Email"><input id="orgadm-password" type="password" placeholder="Password"><button id="orgadm-login" class="orgadm-btn">Log in</button><button id="orgadm-signup" class="orgadm-btn secondary">Create account</button><button id="orgadm-reset" class="orgadm-link-btn" type="button">Forgot password?</button></div>`; }
  function badge(value, cls="") { return value ? `<span class="orgadm-mini ${esc(cls)}">${esc(value)}</span>` : ""; }
  function portalPage(row, pageKey) { return (Array.isArray(row?.portal_pages) ? row.portal_pages : []).find((page) => clean(page.page_key || page.template_key) === pageKey && page.show_in_nav !== false) || null; }
  function pagePath(page, fallback) { return clean(page?.path || (page?.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : "")) || fallback; }

  function moduleCard(label, permission, row) { const caps = obj(row.capabilities); const peopleEnabled = Boolean(portalPage(row, "organization-people")); const map = { events: caps.can_manage_events, documents: caps.can_manage_documents, gallery: caps.can_manage_gallery, roster: (caps.can_manage_people || caps.can_manage_applicants) && peopleEnabled, assets: caps.can_manage_assets, access: caps.can_manage_access, settings: caps.can_manage_settings }; const ok = Boolean(map[permission]); return `<span class="${ok ? "ok" : "off"}">${esc(label)}</span>`; }

  function renderDashboard() {
    if (!token) return `<div class="orgadm-card"><h2>Login required</h2><p>This page uses the same Supabase Auth login as the User Dashboard. The backend decides whether the logged-in user has organization-admin access.</p>${renderLogin()}</div>`;
    const rows = adminRows();
    if (!rows.length) return `<div class="orgadm-card"><h2>No organization admin access</h2><p>Your account is signed in but does not have organization-admin permissions for any organization.</p><p>If you believe this is wrong, have a platform admin check your person/organization affiliation, lifecycle status, roles, and permissions.</p></div>`;
    const row = selectedRow();
    const peoplePage = portalPage(row, "organization-people");
    const peopleAllowed = Boolean(peoplePage && (obj(row.capabilities).can_manage_people || obj(row.capabilities).can_manage_applicants || (row.permission_keys || []).includes("people.view_roster")));
    return `
      <div class="orgadm-card"><div class="orgadm-card-head"><div><h2>Current organization</h2><p class="orgadm-help">Change organizations from the header when your account has access to more than one.</p></div><button class="orgadm-btn small secondary" id="orgadm-refresh">Refresh</button></div></div>
      <div class="orgadm-grid"><div class="orgadm-card"><h2>${esc(row.organization_name)}</h2><div class="orgadm-pill-list">${badge(row.lifecycle_status_label || row.membership_status_label)}${badge(row.membership_class_label)}${badge(row.application_stage_label)}${(row.role_labels || row.role_keys || []).map((r) => badge(r)).join(" ")}</div><p><strong>Admin access:</strong> Allowed</p><p class="orgadm-help">Organization-branded customer-side admin shell. Platform-only diagnostic panels should stay in Platform Access Tools, not here.</p></div><div class="orgadm-card"><h2>Organization-admin modules</h2><div class="orgadm-actions">${moduleCard("Events", "events", row)}${moduleCard("Documents", "documents", row)}${moduleCard("Gallery", "gallery", row)}${moduleCard("Roster / People", "roster", row)}${moduleCard("Assets", "assets", row)}${moduleCard("Access", "access", row)}</div>${peopleAllowed ? `<p><a class="orgadm-btn secondary" href="${esc(pagePath(peoplePage, "/organization-people"))}">Open People & Access</a></p>` : ""}<p class="orgadm-help">Customer-side tools use this same access context. Platform-only diagnostic panels stay in Platform Access Tools.</p></div></div>
      <details class="orgadm-card"><summary>Effective permissions</summary><div class="orgadm-permissions">${(row.permission_keys || []).map((p) => `<span>${esc(p)}</span>`).join("")}</div></details>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID); if (!root) return;
    const cfg = styleConfig(selectedRow());
    root.innerHTML = `
      <style>
        .orgadm-wrap{${cssVars(cfg)}max-width:var(--org-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--org-text)}.orgadm-card{background:rgba(255,255,255,.94);border:1px solid var(--org-border);border-radius:var(--org-radius);box-shadow:var(--org-shadow);padding:20px;margin:16px 0}.orgadm-hero{background:linear-gradient(135deg,var(--org-primary),${rgba(cfg.primary,.78)});color:#fff}.orgadm-hero h1{margin:8px 0;color:#fff}.orgadm-hero p{color:rgba(255,255,255,.88)}.orgadm-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.orgadm-login{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px}.orgadm-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.orgadm-wrap input,.orgadm-wrap select{width:100%;min-height:42px;border:1px solid var(--org-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--org-text)}.orgadm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid var(--org-primary);background:var(--org-primary);color:#fff;font-weight:900;cursor:pointer}.orgadm-btn:hover{filter:brightness(.92);transform:translateY(-1px)}.orgadm-btn[disabled]{opacity:.62;cursor:wait;transform:none}.orgadm-btn.secondary{background:#fff;color:var(--org-primary)}.orgadm-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.orgadm-link-btn{border:none;background:transparent;color:var(--org-primary);text-decoration:underline;font-weight:900;cursor:pointer}.orgadm-pill,.orgadm-mini{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:var(--org-soft);color:var(--org-primary);font-size:12px;font-weight:900;margin:2px}.orgadm-pill.ok,.orgadm-actions .ok{background:#e7f6ec;color:#14532d}.orgadm-actions .off{background:#f3f4f6;color:#6b7280}.orgadm-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900}.orgadm-message.ok{background:#e7f6ec;color:#14532d}.orgadm-message.warn{background:#fff7ec;color:#8a4d00}.orgadm-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.orgadm-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.orgadm-pill-list,.orgadm-actions{display:flex;flex-wrap:wrap;gap:8px}.orgadm-actions span,.orgadm-permissions span{display:inline-flex;border-radius:999px;background:var(--org-soft);color:var(--org-primary);padding:6px 9px;margin:3px;font-size:12px;font-weight:800}.orgadm-help{color:var(--org-muted);font-size:13px}.orgadm-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}details summary{cursor:pointer;font-weight:900;color:var(--org-primary)}@media(max-width:920px){.orgadm-login,.orgadm-grid{grid-template-columns:1fr}}
      </style>
      <div class="orgadm-wrap"><section class="orgadm-card orgadm-hero"><div class="orgadm-eyebrow">Organization Admin</div><h1>Organization Admin Dashboard</h1><p>Customer-side administration using the same login as the User Dashboard.</p><div class="orgadm-message ${esc(messageKind)}">${esc(message)}</div></section>${renderDashboard()}<details class="orgadm-card"><summary>Backend result</summary><pre class="orgadm-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></details></div>`;
    $("orgadm-login")?.addEventListener("click", () => runButton("orgadm-login", "Logging in…", login));
    $("orgadm-signup")?.addEventListener("click", () => runButton("orgadm-signup", "Creating…", signUp));
    $("orgadm-reset")?.addEventListener("click", () => runButton("orgadm-reset", "Sending…", resetPassword));
    $("orgadm-logout")?.addEventListener("click", () => runButton("orgadm-logout", "Logging out…", logout));
    $("orgadm-refresh")?.addEventListener("click", () => runButton("orgadm-refresh", "Refreshing…", async () => { await loadAccess(); setMessage("Refreshed.", "ok"); render(); }));
    $("orgadm-org-select")?.addEventListener("change", async (e) => { selectedOrgId = e.target.value; adminAccess = null; try { await loadAdminDashboard(); } catch (err) { backend = { ok:false, message:err.message }; setMessage(err.message, "warn"); } render(); });
  }

  window.addEventListener("syncetc:portal-logout-request", () => {
    if (!token) return;
    logout().catch((e) => { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); });
  });

  window.addEventListener("syncetc:portal-login-request", () => {
    render();
    setTimeout(() => $("orgadm-email")?.focus(), 0);
  });

  window.addEventListener("syncetc:portal-organization-change", async (event) => {
    const nextOrgId = clean(event.detail?.organization_id);
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId;
    adminAccess = null;
    try { await loadAdminDashboard(); setMessage("Organization loaded.", "ok"); }
    catch (err) { backend = { ok:false, message:err.message || String(err) }; setMessage(err.message || String(err), "warn"); }
    render();
  });

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
