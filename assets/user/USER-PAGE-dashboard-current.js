// USER-PAGE-dashboard-current.js
// Internal Version: 2026-06-06-002
// Purpose: Signed-in user dashboard smoke test for Supabase Auth -> person -> organization affiliation -> roles/permissions.

(function () {
  "use strict";

  const VERSION = "2026-06-06-002";
  const ROOT_IDS = ["syncetc-user-dashboard-root", "syncetc-member-dashboard-root"];
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
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();

  function rootEl() { return ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean); }

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

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    window.SyncEtcPortalShell?.setState?.({ authenticated: Boolean(token), email, mode: "user" });
    if (token) await loadAccess();
    render();
  }

  async function login() {
    await ensureSupabase();
    const e = emailNorm($("user-email")?.value);
    const p = $("user-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    await refreshAuth();
    setMessage(`Logged in as ${e}`, "ok");
  }

  async function signUp() {
    await ensureSupabase();
    const e = emailNorm($("user-email")?.value);
    const p = $("user-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and a password to create an account.");
    if (p.length < 8) throw new Error("Password should be at least 8 characters.");
    const { error } = await supabaseClient.auth.signUp({ email: e, password: p, options: { emailRedirectTo: `${window.location.origin}/user-dashboard` } });
    if (error) throw error;
    setMessage("Account request submitted. Check email if confirmation is required, then log in.", "ok");
  }

  async function resetPassword() {
    await ensureSupabase();
    const e = emailNorm($("user-email")?.value);
    if (!e) throw new Error("Enter your email first.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested. Check your inbox.", "ok");
  }

  async function logout() { await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; access = []; backend = null; render(); }

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
    if (token) return `<div class="user-auth"><span class="user-pill ok">Logged in as ${esc(email)}</span><button id="user-logout" class="user-btn secondary">Log out</button></div>`;
    return `<div class="user-login"><input id="user-email" type="email" placeholder="Email"><input id="user-password" type="password" placeholder="Password"><button id="user-login" class="user-btn">Log in</button><button id="user-signup" class="user-btn secondary">Create account</button><button id="user-reset" class="user-link-btn" type="button">Forgot password?</button></div>`;
  }

  function renderDashboard() {
    if (!token) return `<div class="user-card"><h2>Login required</h2><p>Use one login for user access and organization-admin access. The system will show what this account is allowed to see after login.</p></div>`;
    if (!access.length) return `<div class="user-card"><h2>No organization access found</h2><p>Your login is valid, but this account is not yet linked to an active organization affiliation.</p><p>If you just created an account, ask the organization or platform admin to link your login email to your person record.</p></div>`;
    const row = selectedAccess();
    return `
      <div class="user-card">
        <div class="user-card-head"><h2>My Organizations</h2><button id="user-refresh" class="user-btn small secondary">Refresh</button></div>
        <select id="user-org-select">${access.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select>
      </div>
      <div class="user-grid">
        <div class="user-card">
          <h2>${esc(row.organization_name)}</h2>
          <p><strong>Status:</strong> ${esc(row.membership_status_label || row.membership_status_key || "")}</p>
          <p><strong>Roles:</strong> ${(row.role_labels || row.role_keys || []).map((r) => `<span class="user-mini">${esc(r)}</span>`).join(" ")}</p>
          <p><strong>User portal:</strong> ${row.is_member ? "Allowed" : "Not allowed"}</p>
          <p><strong>Organization admin:</strong> ${row.is_organization_admin ? "Yes" : "No"}</p>
        </div>
        <div class="user-card">
          <h2>Available future user areas</h2>
          <div class="user-action-list"><span>Profile</span><span>Documents</span><span>Events / RSVP</span><span>Gallery Submission</span><span>Assets / Scheduling later</span></div>
          <p class="user-help">This page proves access only. The full user dashboard comes later.</p>
        </div>
      </div>
      <div class="user-card"><h2>Effective permissions</h2><div class="user-permissions">${(row.permission_keys || []).map((p) => `<span>${esc(p)}</span>`).join("")}</div></div>`;
  }

  function render() {
    const root = rootEl();
    if (!root) return;
    root.innerHTML = `
      <style>
        .user-wrap{max-width:1180px;margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.user-card{background:rgba(255,255,255,.94);border:1px solid rgba(18,54,90,.14);border-radius:22px;box-shadow:0 10px 26px rgba(12,38,64,.12);padding:20px;margin:16px 0}.user-hero{background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.user-hero h1{margin:8px 0;color:#fff}.user-hero p{color:rgba(255,255,255,.88)}.user-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.user-login{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:center}.user-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.user-wrap input,.user-wrap select{width:100%;min-height:42px;border:1px solid rgba(18,54,90,.22);border-radius:12px;padding:10px 12px;background:#fff;color:#172033}.user-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer}.user-btn:hover{background:#0b2744;transform:translateY(-1px)}.user-btn.secondary{background:#fff;color:#12365a}.user-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.user-link-btn{border:none;background:transparent;color:#fff;text-decoration:underline;font-weight:900;cursor:pointer}.user-pill,.user-mini{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#eaf5ff;color:#12365a;font-size:12px;font-weight:900;margin:2px}.user-pill.ok{background:#e7f6ec;color:#14532d}.user-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900}.user-message.ok{background:#e7f6ec;color:#14532d}.user-message.warn{background:#fff7ec;color:#8a4d00}.user-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.user-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.user-action-list{display:flex;flex-wrap:wrap;gap:8px}.user-action-list span,.user-permissions span{display:inline-flex;border-radius:999px;background:#eef6ff;color:#12365a;padding:6px 9px;margin:3px;font-size:12px;font-weight:800}.user-help{color:#5d6b78;font-size:13px;line-height:1.45}.user-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}@media(max-width:920px){.user-login,.user-grid{grid-template-columns:1fr}}
      </style>
      <div class="user-wrap">
        <section class="user-card user-hero"><div class="user-eyebrow">User Access</div><h1>User Dashboard</h1><p>Verifies signed-in user identity, person link, organization affiliations, roles, and permissions.</p>${renderLogin()}<div class="user-message ${esc(messageKind)}">${esc(message)}</div></section>
        ${renderDashboard()}
        <div class="user-card"><h2>Backend result</h2><pre class="user-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></div>
      </div>`;
    $("user-login")?.addEventListener("click", () => login().catch((e) => { backend = { ok:false, message:e.message }; setMessage(e.message === "Invalid login credentials" ? "Invalid login credentials. Use Forgot password? or Create account." : e.message, "warn"); }));
    $("user-signup")?.addEventListener("click", () => signUp().catch((e) => { backend = { ok:false, message:e.message }; setMessage(e.message, "warn"); }));
    $("user-reset")?.addEventListener("click", () => resetPassword().catch((e) => { backend = { ok:false, message:e.message }; setMessage(e.message, "warn"); }));
    $("user-logout")?.addEventListener("click", () => logout().catch((e) => { backend = { ok:false, message:e.message }; setMessage(e.message, "warn"); }));
    $("user-refresh")?.addEventListener("click", () => loadAccess().then(() => { setMessage("Refreshed.", "ok"); render(); }).catch((e) => { backend = { ok:false, message:e.message }; setMessage(e.message, "warn"); }));
    $("user-org-select")?.addEventListener("change", (e) => { selectedOrgId = e.target.value; render(); });
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
