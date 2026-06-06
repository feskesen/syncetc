// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-06-001
// Purpose: Lightweight shared shell for member/customer-admin test pages. True data access is enforced by Supabase Auth + core-access-action.

(function () {
  "use strict";

  const VERSION = "2026-06-06-001";
  const SHELL_ID = "syncetc-portal-shell";

  function esc(v) {
    return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  }

  let state = { authenticated: false, email: "", mode: "member" };

  function setState(next = {}) {
    state = { ...state, ...next };
    render();
  }

  function render() {
    let shell = document.getElementById(SHELL_ID);
    if (!shell) {
      shell = document.createElement("div");
      shell.id = SHELL_ID;
      document.body.insertBefore(shell, document.body.firstChild);
    }

    shell.innerHTML = `
      <style>
        #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:1180px;box-sizing:border-box;color:#172033}#${SHELL_ID} *{box-sizing:border-box}.portal-shell-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;border-radius:18px;background:rgba(255,255,255,.94);border:1px solid rgba(18,54,90,.14);box-shadow:0 8px 22px rgba(12,38,64,.10)}.portal-shell-brand{display:flex;align-items:center;gap:10px;font-weight:900;color:#12365a}.portal-shell-mark{width:34px;height:34px;border-radius:999px;background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff;display:flex;align-items:center;justify-content:center}.portal-shell-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.portal-shell-nav a,.portal-shell-pill{display:inline-flex;align-items:center;min-height:32px;padding:7px 11px;border-radius:999px;border:1px solid rgba(18,54,90,.18);background:#fff;color:#12365a;text-decoration:none;font-size:12px;font-weight:900}.portal-shell-pill.ok{background:#e7f6ec;color:#14532d}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00}@media(max-width:720px){.portal-shell-bar{align-items:flex-start;flex-direction:column}.portal-shell-nav a,.portal-shell-pill{width:100%;justify-content:center}}
      </style>
      <div class="portal-shell-bar" data-version="${esc(VERSION)}">
        <div class="portal-shell-brand"><span class="portal-shell-mark">S</span><span>SyncEtc ${state.mode === "org-admin" ? "Organization Admin" : "Member Portal"}</span></div>
        <nav class="portal-shell-nav">
          <a href="/home">Home</a>
          <a href="/calendar">Calendar</a>
          <a href="/documents">Documents</a>
          <a href="/member-dashboard">Member</a>
          <a href="/organization-admin">Org Admin</a>
          <span class="portal-shell-pill ${state.authenticated ? "ok" : "warn"}">${state.authenticated ? esc(state.email) : "Not logged in"}</span>
        </nav>
      </div>`;
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION };
  document.addEventListener("DOMContentLoaded", render);
})();
