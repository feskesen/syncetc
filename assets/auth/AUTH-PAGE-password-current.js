// AUTH-PAGE-password-current.js
// Internal Version: 2026-06-06-001
// Purpose: Supabase Auth password reset page. Handles sending reset links and setting a new password after recovery link.

(function () {
  "use strict";

  const VERSION = "2026-06-06-001";
  const ROOT_ID = "syncetc-password-reset-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let session = null;
  let message = `Version ${VERSION}`;
  let kind = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();

  function loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`)); document.head.appendChild(s); }); }
  async function ensureSupabase() { if (supabaseClient) return supabaseClient; if (!window.supabase) await loadScript(SUPABASE_JS); supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return supabaseClient; }
  function setMessage(text, nextKind = "") { message = text || `Version ${VERSION}`; kind = nextKind; render(); }

  async function refreshSession() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    session = data?.session || null;
    render();
  }

  async function sendReset() {
    await ensureSupabase();
    const email = emailNorm($("reset-email")?.value);
    if (!email) throw new Error("Enter your email address first.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested. Check your inbox.", "ok");
  }

  async function updatePassword() {
    await ensureSupabase();
    const p1 = $("reset-password")?.value || "";
    const p2 = $("reset-password-confirm")?.value || "";
    if (p1.length < 8) throw new Error("Password should be at least 8 characters.");
    if (p1 !== p2) throw new Error("Passwords do not match.");
    const { error } = await supabaseClient.auth.updateUser({ password: p1 });
    if (error) throw error;
    setMessage("Password updated. You can now log in.", "ok");
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = `
      <style>
        .reset-wrap{max-width:720px;margin:36px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.reset-card{background:rgba(255,255,255,.95);border:1px solid rgba(18,54,90,.16);border-radius:24px;box-shadow:0 14px 34px rgba(12,38,64,.14);overflow:hidden}.reset-head{padding:24px;background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.reset-head h1{margin:8px 0;color:#fff}.reset-head p{color:rgba(255,255,255,.88)}.reset-body{padding:22px}.reset-body label{display:block;font-size:12px;font-weight:900;color:#24435f;margin-top:12px}.reset-body input{width:100%;min-height:44px;border:1px solid rgba(18,54,90,.22);border-radius:13px;padding:10px 12px;margin:6px 0 10px;background:#fff;color:#172033}.reset-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer}.reset-btn:hover{background:#0b2744;transform:translateY(-1px)}.reset-message{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:#eaf5ff;color:#12365a;font-weight:900}.reset-message.ok{background:#e7f6ec;color:#14532d}.reset-message.warn{background:#fff7ec;color:#8a4d00}.reset-help{color:#5d6b78;line-height:1.5;font-size:14px}.reset-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
      </style>
      <div class="reset-wrap"><section class="reset-card"><div class="reset-head"><div>Password Access</div><h1>Reset Password</h1><p>One Supabase Auth login is used for user and organization-admin access.</p></div><div class="reset-body">
        ${session ? `
          <p class="reset-help">Enter a new password for ${esc(session.user?.email || "this account")}.</p>
          <label>New password</label><input id="reset-password" type="password" placeholder="New password">
          <label>Confirm new password</label><input id="reset-password-confirm" type="password" placeholder="Confirm password">
          <div class="reset-actions"><button id="reset-update" class="reset-btn">Update Password</button><a class="reset-btn" href="/member/dashboard">Go to Member Dashboard</a></div>` : `
          <p class="reset-help">Enter your email and we will request a password reset email through Supabase Auth. If you arrived here from a reset email, wait a moment and refresh if the new password fields do not appear.</p>
          <label>Email</label><input id="reset-email" type="email" placeholder="you@example.com">
          <button id="reset-send" class="reset-btn">Send Password Reset Email</button>`}
        <div class="reset-message ${esc(kind)}">${esc(message)}</div>
      </div></section></div>`;
    $("reset-send")?.addEventListener("click", () => sendReset().catch((e) => setMessage(e.message, "warn")));
    $("reset-update")?.addEventListener("click", () => updatePassword().catch((e) => setMessage(e.message, "warn")));
  }

  document.addEventListener("DOMContentLoaded", () => refreshSession().catch((e) => { render(); setMessage(e.message, "warn"); }));
})();
