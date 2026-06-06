// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-06-004-A
// Purpose: Shared shell for signed-in user and organization-admin pages. Uses one Supabase Auth login; roles decide access; organization pages inherit selected organization style after access resolves.

(function () {
  "use strict";

  const VERSION = "2026-06-06-004-A";
  const SHELL_ID = "syncetc-portal-shell";

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g," ").trim(); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 }; return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }

  let state = { authenticated: false, email: "", mode: "user", organizationName: "", organizationKey: "", styleProfile: null, accessRow: null };

  function setState(next = {}) { state = { ...state, ...next }; render(); }

  function config() {
    const profile = obj(state.styleProfile);
    const colors = obj(profile.colors_json);
    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    return { primary, secondary, surface, text, border: rgba(primary,.16), soft: rgba(primary,.08), shadow: `0 8px 22px ${rgba(primary,.10)}` };
  }

  function render() {
    let shell = document.getElementById(SHELL_ID);
    if (!shell) {
      shell = document.createElement("div");
      shell.id = SHELL_ID;
      document.body.insertBefore(shell, document.body.firstChild);
    }

    const cfg = config();
    const modeLabel = state.mode === "org-admin" ? "Organization Admin" : "User Portal";
    const brandText = clean(state.organizationName) ? state.organizationName : `SyncEtc ${modeLabel}`;
    const initials = clean(state.organizationName || "S").slice(0, 1).toUpperCase() || "S";
    const adminVisible = state.mode === "org-admin" || Boolean(obj(state.accessRow).is_organization_admin || obj(obj(state.accessRow).capabilities).can_view_organization_admin);

    shell.innerHTML = `
      <style>
        #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:1180px;box-sizing:border-box;color:${cfg.text}}#${SHELL_ID} *{box-sizing:border-box}.portal-shell-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;border-radius:18px;background:rgba(255,255,255,.94);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}.portal-shell-brand{display:flex;align-items:center;gap:10px;font-weight:900;color:${cfg.primary};min-width:0}.portal-shell-mark{width:34px;height:34px;border-radius:999px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.76)});color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.portal-shell-brand-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-shell-sub{display:block;color:${rgba(cfg.text,.62)};font-size:11px;font-weight:800;margin-top:2px}.portal-shell-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.portal-shell-nav a,.portal-shell-pill{display:inline-flex;align-items:center;min-height:32px;padding:7px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:900}.portal-shell-nav a:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.portal-shell-pill.ok{background:#e7f6ec;color:#14532d!important}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00!important}@media(max-width:720px){.portal-shell-bar{align-items:flex-start;flex-direction:column}.portal-shell-nav{width:100%;justify-content:flex-start}.portal-shell-nav a,.portal-shell-pill{width:100%;justify-content:center}}
      </style>
      <div class="portal-shell-bar" data-version="${esc(VERSION)}">
        <div class="portal-shell-brand"><span class="portal-shell-mark">${esc(initials)}</span><span class="portal-shell-brand-text">${esc(brandText)}<span class="portal-shell-sub">${esc(modeLabel)}${state.organizationKey ? ` · ${esc(state.organizationKey)}` : ""}</span></span></div>
        <nav class="portal-shell-nav">
          <a href="/home">Public Home</a>
          <a href="/calendar">Calendar</a>
          <a href="/documents">Documents</a>
          <a href="/user-dashboard">User Dashboard</a>
          ${adminVisible ? `<a href="/organization-admin">Organization Admin</a>` : ""}
          <span class="portal-shell-pill ${state.authenticated ? "ok" : "warn"}">${state.authenticated ? esc(state.email) : "Not logged in"}</span>
        </nav>
      </div>`;
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION };
  document.addEventListener("DOMContentLoaded", render);
})();
