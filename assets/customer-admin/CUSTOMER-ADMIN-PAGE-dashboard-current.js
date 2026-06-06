// CUSTOMER-ADMIN-PAGE-dashboard-current.js
// Internal Version: 2026-06-06-001
// Purpose: Organization/customer-admin access diagnostic dashboard. This is the future customer-admin shell entry point.

(function () {
  "use strict";

  const VERSION = "2026-06-06-001";
  const ROOT_ID = "syncetc-organization-admin-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let adminAccess = null;
  let backend = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const adminRows = () => access.filter((row) => row.is_organization_admin);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`)); document.head.appendChild(s);
    });
  }
  async function ensureSupabase() { if (supabaseClient) return supabaseClient; if (!window.supabase) await loadScript(SUPABASE_JS); supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return supabaseClient; }
  async function refreshAuth() { await ensureSupabase(); const { data } = await supabaseClient.auth.getSession(); token = data?.session?.access_token || ""; email = data?.session?.user?.email || ""; window.SyncEtcPortalShell?.setState?.({ authenticated: Boolean(token), email, mode: "org-admin" }); if (token) await loadAccess(); render(); }
  async function login() { await ensureSupabase(); const { error } = await supabaseClient.auth.signInWithPassword({ email: $("orgadm-email").value, password: $("orgadm-password").value }); if (error) throw error; await refreshAuth(); }
  async function logout() { await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; access = []; adminAccess = null; render(); }
  async function call(action, payload = {}) { if (!token) throw new Error("Log in first."); const res = await fetch(EDGE_URL, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body:JSON.stringify({ action, ...payload }) }); const json = await res.json().catch(() => ({})); backend = json; if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`); return json; }
  async function loadAccess() { const res = await call("get_my_access"); access = res.access || []; if (!selectedOrgId && adminRows()[0]) selectedOrgId = String(adminRows()[0].organization_id); if (selectedOrgId) await loadAdminDashboard(); }
  async function loadAdminDashboard() { if (!selectedOrgId) return; const res = await call("get_customer_admin_dashboard", { organization_id: selectedOrgId }); adminAccess = res.access || null; }

  function renderLogin() {
    if (token) return `<div class="orgadm-auth"><span class="orgadm-pill ok">Logged in as ${esc(email)}</span><button id="orgadm-logout" class="orgadm-btn secondary">Log out</button></div>`;
    return `<div class="orgadm-login"><input id="orgadm-email" type="email" placeholder="Email"><input id="orgadm-password" type="password" placeholder="Password"><button id="orgadm-login" class="orgadm-btn">Log in</button></div>`;
  }

  function renderDashboard() {
    if (!token) return `<div class="orgadm-card"><h2>Login required</h2><p>This page is for organization/customer admins. The backend decides whether the logged-in user has admin access.</p></div>`;
    const rows = adminRows();
    if (!rows.length) return `<div class="orgadm-card"><h2>No organization admin access</h2><p>Your account is signed in but does not have organization admin permissions for any organization.</p></div>`;
    const row = adminAccess || rows.find((r) => String(r.organization_id) === selectedOrgId) || rows[0];
    return `
      <div class="orgadm-card">
        <div class="orgadm-card-head"><h2>Organization Admin Context</h2><button class="orgadm-btn small secondary" id="orgadm-refresh">Refresh</button></div>
        <select id="orgadm-org-select">${rows.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select>
      </div>
      <div class="orgadm-grid">
        <div class="orgadm-card"><h2>${esc(row.organization_name)}</h2><p><strong>Roles:</strong> ${(row.role_labels || row.role_keys || []).map((r) => `<span class="orgadm-mini">${esc(r)}</span>`).join(" ")}</p><p><strong>Admin access:</strong> Allowed</p></div>
        <div class="orgadm-card"><h2>Future customer-admin modules</h2><div class="orgadm-actions"><span>Events</span><span>Documents</span><span>Gallery</span><span>Roster</span><span>Aircraft</span><span>FAQ</span></div><p class="orgadm-help">This page proves the organization-admin gate. Real customer admin module pages should use this same access check.</p></div>
      </div>
      <div class="orgadm-card"><h2>Effective permissions</h2><div class="orgadm-permissions">${(row.permission_keys || []).map((p) => `<span>${esc(p)}</span>`).join("")}</div></div>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID); if (!root) return;
    root.innerHTML = `
      <style>
        .orgadm-wrap{max-width:1180px;margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.orgadm-card{background:rgba(255,255,255,.94);border:1px solid rgba(18,54,90,.14);border-radius:22px;box-shadow:0 10px 26px rgba(12,38,64,.12);padding:20px;margin:16px 0}.orgadm-hero{background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.orgadm-hero h1{margin:8px 0;color:#fff}.orgadm-hero p{color:rgba(255,255,255,.88)}.orgadm-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.orgadm-login{display:grid;grid-template-columns:1fr 1fr auto;gap:10px}.orgadm-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.orgadm-wrap input,.orgadm-wrap select{width:100%;min-height:42px;border:1px solid rgba(18,54,90,.22);border-radius:12px;padding:10px 12px;background:#fff;color:#172033}.orgadm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer}.orgadm-btn:hover{background:#0b2744;transform:translateY(-1px)}.orgadm-btn.secondary{background:#fff;color:#12365a}.orgadm-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.orgadm-pill,.orgadm-mini{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#eaf5ff;color:#12365a;font-size:12px;font-weight:900;margin:2px}.orgadm-pill.ok{background:#e7f6ec;color:#14532d}.orgadm-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.orgadm-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.orgadm-actions{display:flex;flex-wrap:wrap;gap:8px}.orgadm-actions span,.orgadm-permissions span{display:inline-flex;border-radius:999px;background:#eef6ff;color:#12365a;padding:6px 9px;margin:3px;font-size:12px;font-weight:800}.orgadm-help{color:#5d6b78;font-size:13px}.orgadm-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}@media(max-width:800px){.orgadm-login,.orgadm-grid{grid-template-columns:1fr}}
      </style>
      <div class="orgadm-wrap"><section class="orgadm-card orgadm-hero"><div class="orgadm-eyebrow">Customer Admin Gate</div><h1>Organization Admin Dashboard</h1><p>Verifies that a logged-in user has customer-side administrative permissions before showing organization admin tools.</p>${renderLogin()}</section>${renderDashboard()}<div class="orgadm-card"><h2>Backend result</h2><pre class="orgadm-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></div></div>`;
    $("orgadm-login")?.addEventListener("click", () => login().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("orgadm-logout")?.addEventListener("click", () => logout().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("orgadm-refresh")?.addEventListener("click", () => loadAccess().then(render).catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("orgadm-org-select")?.addEventListener("change", async (e) => { selectedOrgId = e.target.value; try { await loadAdminDashboard(); } catch (err) { backend = { ok:false, message:err.message }; } render(); });
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
