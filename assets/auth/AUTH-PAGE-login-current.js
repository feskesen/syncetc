// AUTH-PAGE-login-current.js
// Internal Version: 2026-06-07-016-A
// Purpose: Shared login page for SyncEtc portal/auth routes.

(function () {
  "use strict";

  const VERSION = "2026-06-07-016-A";
  const ROOT_ID = "syncetc-login-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let client = null;
  let session = null;
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();
  const $ = (id) => document.getElementById(id);

  function root() {
    let el = document.getElementById(ROOT_ID);
    if (!el) { el = document.createElement("div"); el.id = ROOT_ID; document.body.appendChild(el); }
    return el;
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

  async function ensureClient() {
    if (client) return client;
    if (!window.supabase) await loadScript(SUPABASE_JS);
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  function redirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("redirect") || params.get("return") || "/user-dashboard";
    return raw.startsWith("/") ? raw : "/user-dashboard";
  }

  async function refresh() {
    await ensureClient();
    const { data } = await client.auth.getSession();
    session = data?.session || null;
    window.SyncEtcPortalShell?.setState?.({ initialized: true, authenticated: Boolean(session), email: session?.user?.email || "", mode: "user" });
    render();
  }

  async function login() {
    const email = emailNorm($("login-email")?.value);
    const password = $("login-password")?.value || "";
    if (!email || !password) throw new Error("Enter email and password.");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.href = redirectTarget();
  }

  async function resetPassword() {
    const email = emailNorm($("login-email")?.value);
    if (!email) throw new Error("Enter your email first.");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested. Check your inbox.", "ok");
  }

  async function signUp() {
    const email = emailNorm($("login-email")?.value);
    const password = $("login-password")?.value || "";
    if (!email || !password) throw new Error("Enter email and a password.");
    if (password.length < 8) throw new Error("Password should be at least 8 characters.");
    const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/user-dashboard` } });
    if (error) throw error;
    setMessage("Account request submitted. Check email if confirmation is required, then log in.", "ok");
  }

  async function logout() {
    await client.auth.signOut();
    session = null;
    window.SyncEtcPortalShell?.setState?.({ initialized: true, authenticated: false, email: "", mode: "user" });
    setMessage("Logged out.", "ok");
  }

  async function run(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function render() {
    const signedIn = Boolean(session?.access_token);
    const email = session?.user?.email || "";
    root().innerHTML = `<style>
      #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:32px auto 56px;padding:0 18px;color:#172033;box-sizing:border-box}#${ROOT_ID} *{box-sizing:border-box}.login-card{background:#fff;border:1px solid #d9e0ea;border-radius:22px;box-shadow:0 14px 42px rgba(31,79,130,.14);padding:24px;margin:16px 0}.login-hero{background:linear-gradient(135deg,#163264,#f97316);color:#fff}.login-hero h1{margin:8px 0 6px;font-size:36px;letter-spacing:-.035em}.login-hero p{color:rgba(255,255,255,.9);font-weight:800}.login-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.login-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.login-input{width:100%;min-height:44px;border:1px solid #c7d2e2;border-radius:14px;padding:12px 13px;font:inherit}.login-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.login-btn{border:1px solid #163264;background:#163264;color:#fff;border-radius:999px;min-height:40px;padding:9px 15px;font-weight:950;cursor:pointer}.login-btn.secondary{background:#fff;color:#163264}.login-btn[disabled]{opacity:.62;cursor:wait}.login-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900;background:#eef3f8;color:#163264}.login-message.ok{background:#e7f6ec;color:#14532d}.login-message.warn{background:#fff7ec;color:#8a4d00}.login-link-row{display:flex;flex-wrap:wrap;gap:8px}.login-link-row a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 12px;border-radius:999px;border:1px solid #c7d2e2;color:#163264;text-decoration:none;font-weight:950}@media(max-width:700px){.login-grid{grid-template-columns:1fr}.login-btn,.login-link-row a{flex:1 1 100%}}
    </style><section class="login-card login-hero"><div class="login-eyebrow">SyncEtc Login</div><h1>Log in</h1><p>One login for user, organization-admin, and platform access.</p><div class="login-message ${esc(messageKind)}">${esc(message)}</div></section>${signedIn ? `<section class="login-card"><h2>You are logged in</h2><p><strong>${esc(email)}</strong></p><div class="login-link-row"><a href="/user-dashboard">User Dashboard</a><a href="/organization-admin">Organization Admin</a><a href="/access-admin">Platform Access Tools</a></div><div class="login-actions"><button id="login-logout" class="login-btn secondary" type="button">Log out</button></div></section>` : `<section id="syncetc-page-login" class="login-card"><h2>Enter your login</h2><div class="login-grid"><input id="login-email" class="login-input" type="email" placeholder="Email" autocomplete="username"><input id="login-password" class="login-input" type="password" placeholder="Password" autocomplete="current-password"></div><div class="login-actions"><button id="login-submit" class="login-btn" type="button">Log in</button><button id="login-reset" class="login-btn secondary" type="button">Forgot password?</button><button id="login-signup" class="login-btn secondary" type="button">Create account</button></div></section>`}`;
    $("login-submit")?.addEventListener("click", () => run("login-submit", "Logging in…", login));
    $("login-reset")?.addEventListener("click", () => run("login-reset", "Sending…", resetPassword));
    $("login-signup")?.addEventListener("click", () => run("login-signup", "Creating…", signUp));
    $("login-logout")?.addEventListener("click", () => run("login-logout", "Logging out…", logout));
  }

  window.addEventListener("syncetc:portal-logout-request", () => { if (session) logout().catch(() => {}); });
  document.addEventListener("DOMContentLoaded", () => refresh().catch((e) => setMessage(e.message || String(e), "warn")));
})();
