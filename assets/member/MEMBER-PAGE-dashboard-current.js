// MEMBER-PAGE-dashboard-current.js
// Internal Version: 2026-06-06-001
// Purpose: Signed-in member access diagnostic/dashboard. Proves Supabase Auth -> person -> organization membership -> role/permission flow.

(function () {
  "use strict";

  const VERSION = "2026-06-06-001";
  const ROOT_ID = "syncetc-member-dashboard-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let backend = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();

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
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    window.SyncEtcPortalShell?.setState?.({ authenticated: Boolean(token), email, mode: "member" });
    if (token) await loadAccess();
    render();
  }

  async function login() {
    await ensureSupabase();
    const { error } = await supabaseClient.auth.signInWithPassword({ email: $("member-email").value, password: $("member-password").value });
    if (error) throw error;
    await refreshAuth();
  }

  async function logout() { await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; access = []; render(); }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function loadAccess() {
    const res = await call("get_member_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
    access = res.access || [];
    if (!selectedOrgId && access[0]) selectedOrgId = String(access[0].organization_id);
  }

  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }

  function renderLogin() {
    if (token) return `<div class="member-auth"><span class="member-pill ok">Logged in as ${esc(email)}</span><button id="member-logout" class="member-btn secondary">Log out</button></div>`;
    return `<div class="member-login"><input id="member-email" type="email" placeholder="Email"><input id="member-password" type="password" placeholder="Password"><button id="member-login" class="member-btn">Log in</button></div>`;
  }

  function renderDashboard() {
    if (!token) return `<div class="member-card"><h2>Login required</h2><p>This page is gated by Supabase Auth and the new membership access layer.</p></div>`;
    if (!access.length) return `<div class="member-card"><h2>No member organizations found</h2><p>Your login is valid, but this account is not linked to an active organization membership yet.</p><p>Use platform Access Admin to link this email to a person and organization.</p></div>`;
    const row = selectedAccess();
    return `
      <div class="member-card">
        <div class="member-card-head"><h2>My Organizations</h2><button id="member-refresh" class="member-btn small secondary">Refresh</button></div>
        <select id="member-org-select">${access.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select>
      </div>
      <div class="member-grid">
        <div class="member-card">
          <h2>${esc(row.organization_name)}</h2>
          <p><strong>Status:</strong> ${esc(row.membership_status_label || row.membership_status_key || "")}</p>
          <p><strong>Roles:</strong> ${(row.role_labels || row.role_keys || []).map((r) => `<span class="member-mini">${esc(r)}</span>`).join(" ")}</p>
          <p><strong>Member portal:</strong> ${row.is_member ? "Allowed" : "Not allowed"}</p>
          <p><strong>Organization admin:</strong> ${row.is_organization_admin ? "Yes" : "No"}</p>
        </div>
        <div class="member-card">
          <h2>Available future member areas</h2>
          <div class="member-action-list">
            <span>Roster / Profile</span><span>Documents</span><span>Events / RSVP</span><span>Gallery Submission</span><span>Aircraft / Scheduling later</span>
          </div>
          <p class="member-help">This page proves access only. The full member dashboard comes later.</p>
        </div>
      </div>
      <div class="member-card">
        <h2>Effective permissions</h2>
        <div class="member-permissions">${(row.permission_keys || []).map((p) => `<span>${esc(p)}</span>`).join("")}</div>
      </div>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = `
      <style>
        .member-wrap{max-width:1180px;margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.member-card{background:rgba(255,255,255,.94);border:1px solid rgba(18,54,90,.14);border-radius:22px;box-shadow:0 10px 26px rgba(12,38,64,.12);padding:20px;margin:16px 0}.member-hero{background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.member-hero h1{margin:8px 0;color:#fff}.member-hero p{color:rgba(255,255,255,.88)}.member-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.member-login{display:grid;grid-template-columns:1fr 1fr auto;gap:10px}.member-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.member-wrap input,.member-wrap select{width:100%;min-height:42px;border:1px solid rgba(18,54,90,.22);border-radius:12px;padding:10px 12px;background:#fff;color:#172033}.member-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer}.member-btn:hover{background:#0b2744;transform:translateY(-1px)}.member-btn.secondary{background:#fff;color:#12365a}.member-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.member-pill,.member-mini{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#eaf5ff;color:#12365a;font-size:12px;font-weight:900;margin:2px}.member-pill.ok{background:#e7f6ec;color:#14532d}.member-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.member-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.member-action-list{display:flex;flex-wrap:wrap;gap:8px}.member-action-list span,.member-permissions span{display:inline-flex;border-radius:999px;background:#eef6ff;color:#12365a;padding:6px 9px;margin:3px;font-size:12px;font-weight:800}.member-help{color:#5d6b78;font-size:13px;line-height:1.45}.member-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}@media(max-width:800px){.member-login,.member-grid{grid-template-columns:1fr}}
      </style>
      <div class="member-wrap">
        <section class="member-card member-hero"><div class="member-eyebrow">Member Access Test</div><h1>Member Dashboard</h1><p>Verifies signed-in user identity, person link, organization memberships, roles, and member permissions.</p>${renderLogin()}</section>
        ${renderDashboard()}
        <div class="member-card"><h2>Backend result</h2><pre class="member-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></div>
      </div>`;
    $("member-login")?.addEventListener("click", () => login().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("member-logout")?.addEventListener("click", () => logout().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("member-refresh")?.addEventListener("click", () => loadAccess().then(render).catch((e) => { backend = { ok:false, message:e.message }; render(); }));
    $("member-org-select")?.addEventListener("change", (e) => { selectedOrgId = e.target.value; render(); });
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
