// AUTH-PAGE-login-current.js
// Internal Version: 2026-06-13-110-D
// Purpose: Simple shared login page for /login route. Uses Supabase Auth and sends users to the portal after login.

(function () {
  "use strict";

  const VERSION = "2026-06-13-110-D";
  const ROOT_ID = "syncetc-login-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let email = "";
  let authenticated = false;
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const $ = (id) => document.getElementById(id);

  function rootEl() {
    let root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement("div"); root.id = ROOT_ID; document.body.appendChild(root); }
    return root;
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
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function normalizeLoginDestination(raw) {
    const value = String(raw || "").trim();
    if (!value || !value.startsWith("/") || value.startsWith("//") || value === "/login") return "/user-dashboard";
    const path = value.split("?")[0].replace(/\/$/, "") || "/";
    const publicPaths = new Set(["/", "/home", "/info", "/aircraft", "/calendar", "/events", "/gallery", "/documents", "/resources", "/contact", "/apply-now", "/apply"]);
    if (publicPaths.has(path)) return "/user-dashboard";
    return value;
  }
  function redirectTarget() {
    const params = new URLSearchParams(window.location.search);
    let target = clean(params.get("next") || params.get("returnTo") || params.get("redirect") || "");
    try { target = target || window.sessionStorage.getItem("syncetc_return_to") || ""; } catch {}
    if (target.startsWith("http")) target = "/user-dashboard";
    return normalizeLoginDestination(target);
  }
  async function waitForSession(client, attempts = 12, delay = 150) {
    for (let i = 0; i < attempts; i += 1) {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) return data.session;
      if (i < attempts - 1) await sleep(delay);
    }
    return null;
  }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function intendedDestination() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next") || params.get("redirect") || window.sessionStorage.getItem("syncetc_login_next") || "/user-dashboard";
    try { window.sessionStorage.removeItem("syncetc_login_next"); } catch {}
    return normalizeLoginDestination(raw);
  }
  async function waitForSession(client, maxAttempts = 18) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) return data.session;
      if (i < maxAttempts - 1) await sleep(150);
    }
    return null;
  }

  async function refreshAuth() {
    const client = await ensureSupabase();
    const session = await waitForSession(client, 3);
    authenticated = Boolean(session?.access_token);
    email = session?.user?.email || "";
    render();
  }

  async function login() {
    const client = await ensureSupabase();
    const e = clean($("login-email")?.value).toLowerCase();
    const p = $("login-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await client.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
    const session = await waitForSession(client, 20);
    if (!session?.access_token) throw new Error("Login succeeded, but the browser session did not finish loading. Please refresh and try again.");
    authenticated = true;
    email = session.user?.email || e;
    setMessage("Logged in. Opening portal…", "ok");
    window.location.replace(intendedDestination());
  }

  async function logout() {
    const client = await ensureSupabase();
    await client.auth.signOut();
    authenticated = false;
    email = "";
    try { window.sessionStorage.setItem("syncetc_just_logged_out", "1"); } catch {}
    window.location.assign("/");
  }

  async function reset() {
    const client = await ensureSupabase();
    const e = clean($("login-email")?.value || email).toLowerCase();
    if (!e) throw new Error("Enter your email first.");
    const { error } = await client.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested.", "ok");
  }

  async function run(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function render() {
    const root = rootEl();
    root.innerHTML = `<style>
      #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:42px auto;padding:0 18px;color:#172033;box-sizing:border-box}#${ROOT_ID} *{box-sizing:border-box}.login-card{background:#fff;border:1px solid #d9e2ef;border-radius:22px;box-shadow:0 18px 48px rgba(15,23,42,.12);padding:24px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}.mark{width:54px;height:54px;border-radius:16px;background:linear-gradient(135deg,#0b3f75,#ff7100);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:950}.brand h1{margin:0;font-size:30px;color:#102a56}.login-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center}.login-grid input{min-height:44px;border:1px solid #c8d4e4;border-radius:12px;padding:10px 12px}.btn{border:1px solid #102a56;background:#102a56;color:#fff;border-radius:999px;min-height:42px;padding:9px 15px;font-weight:950;cursor:pointer}.btn.secondary{background:#fff;color:#102a56}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.msg{display:inline-flex;margin-top:14px;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;background:${messageKind === "ok" ? "#e7f6ec" : messageKind === "warn" ? "#fff7ec" : "#eef3f8"};color:${messageKind === "ok" ? "#14532d" : messageKind === "warn" ? "#8a4d00" : "#102a56"}}.help{color:#5d6b82;line-height:1.45;font-weight:700}@media(max-width:760px){.login-grid{grid-template-columns:1fr}.btn{width:100%}}
    </style><div class="login-card"><div class="brand"><div class="mark">S</div><div><h1>SyncEtc Login</h1><div class="help">One login for user access, organization admin, and platform tools.</div></div></div>${authenticated ? `<p><strong>Logged in as ${esc(email)}</strong></p><div class="actions"><a class="btn" href="/user-dashboard" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Open Member Dashboard</a><a class="btn secondary" href="/organization-admin" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Open Organization Admin</a><button id="login-logout" class="btn secondary" type="button">Log out</button></div>` : `<div class="login-grid"><input id="login-email" type="email" placeholder="Email" autocomplete="username"><input id="login-password" type="password" placeholder="Password" autocomplete="current-password"><button id="login-submit" class="btn" type="button">Log in</button></div><div class="actions"><button id="login-reset" class="btn secondary" type="button">Send password reset</button></div>`}<div class="msg">${esc(message)}</div></div>`;
    $("login-submit")?.addEventListener("click", () => run("login-submit", "Logging in…", login));
    $("login-reset")?.addEventListener("click", () => run("login-reset", "Sending…", reset));
    $("login-logout")?.addEventListener("click", () => run("login-logout", "Logging out…", logout));
  }

  function bootLoginPage() {
    refreshAuth().catch((e) => {
      message = e?.message || String(e);
      messageKind = "warn";
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootLoginPage);
  else bootLoginPage();
})();
