// USER-PAGE-dashboard-current.js
// Internal Version: 2026-06-07-017-A
// Purpose: Signed-in User Dashboard foundation. Uses one Supabase Auth login, organization access context, separated lifecycle/class/stage fields, and organization style inheritance.

(function () {
  "use strict";

  const VERSION = "2026-06-07-017-A";
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
  let platformAdmin = false;
  let backend = null;
  let authChecked = false;
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();

  function rootEl() {
    let root = ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean);
    if (!root) { root = document.createElement("div"); root.id = ROOT_IDS[0]; document.body.appendChild(root); }
    return root;
  }
  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }

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

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r: 31, g: 79, b: 130 };
    return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, alpha) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${alpha})`; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }

  function styleConfig(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const spacing = obj(profile.spacing_json);
    const effects = obj(profile.effects_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const width = getText(spacing, "page_width", getText(layout, "default_width", "wide"));
    const corners = getText(effects, "corners", "soft");
    const radius = corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px";
    return { primary, secondary, surface, text, muted: rgba(text, .68), border: rgba(primary, .16), soft: rgba(primary, .08), shadow: `0 14px 42px ${rgba(primary, .14)}`, radius, pageWidth: width === "narrow" ? "880px" : width === "normal" ? "1040px" : "1180px" };
  }

  function cssVars(cfg) {
    return `--user-primary:${cfg.primary};--user-secondary:${cfg.secondary};--user-surface:${cfg.surface};--user-text:${cfg.text};--user-muted:${cfg.muted};--user-border:${cfg.border};--user-soft:${cfg.soft};--user-shadow:${cfg.shadow};--user-radius:${cfg.radius};--user-page-width:${cfg.pageWidth};`;
  }

  function setShellState() {
    const row = selectedAccess();
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: "user",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizations: access.map((a) => ({ id: a.organization_id, name: a.organization_name, key: a.organization_key })),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
    });
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function shouldWaitForSession() { try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; } catch { return false; } }
  function clearJustLoggedIn() { try { window.sessionStorage.removeItem("syncetc_just_logged_in"); } catch {} }
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

  async function refreshAuth() {
    await ensureSupabase();
    const session = await getStableSession();
    token = session?.access_token || "";
    email = session?.user?.email || "";
    if (!token) { access = []; selectedOrgId = ""; platformAdmin = false; backend = null; }
    else { try { await loadAccess(); } catch (e) { backend = { ok:false, message:e.message || String(e) }; authChecked = true; setShellState(); setMessage(e.message || String(e), "warn"); return; } }
    authChecked = true;
    setShellState();
    render();
  }

  async function login() {
    await ensureSupabase();
    const e = emailNorm($("user-email")?.value);
    const p = $("user-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
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

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    token = ""; email = ""; access = []; selectedOrgId = ""; backend = null;
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

  async function loadAccess() {
    const res = await call("get_user_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
    platformAdmin = Boolean(res.platform_admin);
    access = res.access || [];
    if (!selectedOrgId && access[0]) selectedOrgId = String(access[0].organization_id);
    setShellState();
  }

  async function runButton(buttonId, workingText, fn) {
    const btn = $(buttonId);
    const old = btn?.textContent || "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = workingText || "Working…"; }
      return await fn();
    } catch (e) {
      backend = { ok:false, message:e.message || String(e) };
      setMessage(e.message === "Invalid login credentials" ? "Invalid login credentials. Use Forgot password? or Create account." : e.message || String(e), "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  function pill(label, value, kind = "") {
    if (!clean(value)) return "";
    return `<span class="user-mini ${esc(kind)}"><strong>${esc(label)}:</strong>&nbsp;${esc(value)}</span>`;
  }

  function yesNo(value) { return value ? "Yes" : "No"; }

  function portalPage(row, pageKey) {
    return (Array.isArray(row?.portal_pages) ? row.portal_pages : []).find((page) => clean(page.page_key || page.template_key) === pageKey && page.show_in_nav !== false) || null;
  }
  function pagePath(page, fallback) { return clean(page?.path || (page?.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : "")) || fallback; }

  function renderLogin() {
    if (token) return "";
    return `<div class="user-login"><input id="user-email" type="email" placeholder="Email"><input id="user-password" type="password" placeholder="Password"><button id="user-login" class="user-btn">Log in</button><button id="user-signup" class="user-btn secondary">Create account</button><button id="user-reset" class="user-link-btn" type="button">Forgot password?</button></div>`;
  }

  function renderDashboard() {
    if (!authChecked) return `<div class="user-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></div>`;
    if (!token) return `<div class="user-card"><h2>Login required</h2><p>Use one login for user access and organization-admin access. The system will show what this account is allowed to see after login.</p>${renderLogin()}</div>`;
    if (!access.length) return `<div class="user-card"><h2>No organization access found</h2><p>Your login is valid, but this account is not yet linked to an active organization affiliation.</p><p>If you just created an account, ask the organization or platform admin to link your login email to your person record.</p></div>`;
    const row = selectedAccess();
    const caps = obj(row.capabilities);
    const rosterPage = portalPage(row, "roster");
    const rosterAllowed = Boolean(caps.can_view_roster && rosterPage);
    return `
      <div class="user-card"><div class="user-card-head"><h2>Current organization</h2><button id="user-refresh" class="user-btn small secondary">Refresh</button></div><p class="user-help">Use the organization selector in the header to switch context.</p></div>
      <div class="user-grid">
        <div class="user-card">
          <h2>${esc(row.organization_name)}</h2>
          <div class="user-pill-list">
            ${pill("Lifecycle", row.lifecycle_status_label || row.membership_status_label || row.lifecycle_status_key)}
            ${pill("Class", row.membership_class_label || row.membership_class_key)}
            ${pill("Stage", row.application_stage_label || row.application_stage_key)}
            ${(row.role_labels || row.role_keys || []).map((r) => `<span class="user-mini">${esc(r)}</span>`).join(" ")}
          </div>
          ${row.blocks_access ? `<p class="user-warning"><strong>Access blocked:</strong> this affiliation is restricted by lifecycle status.</p>` : ""}
          <p><strong>User dashboard:</strong> ${yesNo(caps.can_view_user_dashboard)}</p>
          <p><strong>Organization admin:</strong> ${yesNo(caps.can_view_organization_admin)}</p>
          ${row.membership_class_dues_behavior ? `<p><strong>Dues behavior:</strong> ${esc(row.membership_class_dues_behavior)}</p>` : ""}
          ${row.membership_class_privilege_notes ? `<p><strong>Privilege notes:</strong> ${esc(row.membership_class_privilege_notes)}</p>` : ""}
        </div>
        <div class="user-card">
          <h2>Available user areas</h2>
          <div class="user-action-list">
            <span class="${caps.can_view_user_dashboard ? "ok" : "off"}">Profile</span>
            ${rosterAllowed ? `<a class="ok" href="${esc(pagePath(rosterPage, "/roster"))}">Roster</a>` : `<span class="off">Roster</span>`}
            <span class="${caps.can_view_member_documents ? "ok" : "off"}">Documents</span>
            <span class="${caps.can_rsvp_when_event_allows ? "ok" : "off"}">Events / RSVP</span>
            <span class="${caps.can_submit_gallery ? "ok" : "off"}">Gallery Submission</span>
            <span class="${caps.can_reserve_assets ? "ok" : "off"}">Assets / Scheduling later</span>
          </div>
          <p class="user-help">This page is now reading separated lifecycle status, membership class, application stage, roles, permissions, and the organization style profile.</p>
        </div>
      </div>
      <details class="user-card"><summary>Effective permissions</summary><div class="user-permissions">${(row.permission_keys || []).map((p) => `<span>${esc(p)}</span>`).join("")}</div></details>`;
  }

  function render() {
    const root = rootEl();
    if (!root) return;
    const cfg = styleConfig(selectedAccess());
    root.innerHTML = `
      <style>
        .user-wrap{${cssVars(cfg)}max-width:var(--user-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--user-text)}.user-card{background:rgba(255,255,255,.94);border:1px solid var(--user-border);border-radius:var(--user-radius);box-shadow:var(--user-shadow);padding:20px;margin:16px 0}.user-hero{background:linear-gradient(135deg,var(--user-primary),${rgba(cfg.primary,.78)});color:#fff}.user-hero h1{margin:8px 0;color:#fff}.user-hero p{color:rgba(255,255,255,.88)}.user-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.user-login{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:center}.user-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.user-wrap input,.user-wrap select{width:100%;min-height:42px;border:1px solid var(--user-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--user-text)}.user-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid var(--user-primary);background:var(--user-primary);color:#fff;font-weight:900;cursor:pointer}.user-btn:hover{filter:brightness(.92);transform:translateY(-1px)}.user-btn[disabled]{opacity:.62;cursor:wait;transform:none}.user-btn.secondary{background:#fff;color:var(--user-primary)}.user-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.user-link-btn{border:none;background:transparent;color:#fff;text-decoration:underline;font-weight:900;cursor:pointer}.user-pill,.user-mini{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:var(--user-soft);color:var(--user-primary);font-size:12px;font-weight:900;margin:2px}.user-pill.ok,.user-action-list .ok{background:#e7f6ec;color:#14532d}.user-action-list .off{background:#f3f4f6;color:#6b7280}.user-pill-list{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0}.user-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900}.user-message.ok{background:#e7f6ec;color:#14532d}.user-message.warn,.user-warning{background:#fff7ec;color:#8a4d00;border-radius:12px;padding:10px 12px}.user-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.user-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.user-action-list{display:flex;flex-wrap:wrap;gap:8px}.user-action-list span,.user-action-list a,.user-permissions span{display:inline-flex;border-radius:999px;background:var(--user-soft);color:var(--user-primary);padding:6px 9px;margin:3px;font-size:12px;font-weight:800}.user-action-list a{text-decoration:none}.user-help{color:var(--user-muted);font-size:13px;line-height:1.45}.user-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}details summary{cursor:pointer;font-weight:900;color:var(--user-primary)}@media(max-width:920px){.user-login,.user-grid{grid-template-columns:1fr}}
      </style>
      <div class="user-wrap">
        <section class="user-card user-hero"><div class="user-eyebrow">User Access</div><h1>User Dashboard</h1><p>One login, organization-aware access, and organization-branded portal styling.</p><div class="user-message ${esc(messageKind)}">${esc(message)}</div></section>
        ${renderDashboard()}
        <details class="user-card"><summary>Backend result</summary><pre class="user-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></details>
      </div>`;
    $("user-login")?.addEventListener("click", () => runButton("user-login", "Logging in…", login));
    $("user-signup")?.addEventListener("click", () => runButton("user-signup", "Creating…", signUp));
    $("user-reset")?.addEventListener("click", () => runButton("user-reset", "Sending…", resetPassword));
    $("user-logout")?.addEventListener("click", () => runButton("user-logout", "Logging out…", logout));
    $("user-refresh")?.addEventListener("click", () => runButton("user-refresh", "Refreshing…", async () => { await loadAccess(); setMessage("Refreshed.", "ok"); render(); }));
  }

  window.addEventListener("syncetc:portal-logout-request", () => {
    if (!token) return;
    logout().catch((e) => { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); });
  });

  window.addEventListener("syncetc:portal-login-request", () => {
    render();
    setTimeout(() => $("user-email")?.focus(), 0);
  });

  async function handleOrganizationChange(nextOrgId) {
    nextOrgId = String(nextOrgId || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId;
    try { await loadAccess(); setMessage("Organization loaded.", "ok"); }
    catch (e) { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); }
    render();
  }

  window.addEventListener("syncetc:portal-organization-change-request", (event) => {
    handleOrganizationChange(event.detail?.organizationId || event.detail?.organization_id);
  });

  window.addEventListener("syncetc:portal-organization-change", (event) => {
    handleOrganizationChange(event.detail?.organization_id || event.detail?.organizationId);
  });

  window.addEventListener("syncetc:portal-auth-changed", () => {
    refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); });
  });

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
