// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-07-009-A
// Purpose: Shared shell for signed-in user and organization-admin pages. Header owns login/logout and organization context.

(function () {
  "use strict";

  const VERSION = "2026-06-07-009-A";
  const SHELL_ID = "syncetc-portal-shell";

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g," ").trim(); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 }; return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }

  let state = { authenticated: false, email: "", mode: "user", organizationName: "", organizationKey: "", organizationId: "", selectedOrganizationId: "", organizations: [], organizationOptions: [], styleProfile: null, accessRow: null };

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

  function selectedOrgId() {
    return clean(state.selectedOrganizationId || state.organizationId || obj(state.accessRow).organization_id || "");
  }

  function organizationOptions() {
    return arr(state.organizations).concat(arr(state.organizationOptions)).map((o) => ({
      id: clean(o.id || o.organization_id),
      name: clean(o.name || o.organization_name || "Organization"),
      key: clean(o.key || o.organization_key || "")
    })).filter((o, idx, list) => o.id && list.findIndex((x) => x.id === o.id) === idx);
  }

  function renderOrgContext() {
    const options = organizationOptions();
    if (!state.authenticated || !options.length) return "";
    if (options.length === 1) {
      const o = options[0];
      return `<span class="portal-shell-org-single">${esc(o.name || state.organizationName || "Organization")}${o.key ? `<small>${esc(o.key)}</small>` : ""}</span>`;
    }
    const selected = selectedOrgId();
    return `<label class="portal-shell-org"><span>Organization</span><select id="syncetc-portal-org-select">${options.map((o) => `<option value="${esc(o.id)}" ${String(o.id) === selected ? "selected" : ""}>${esc(o.name || "Organization")} (${esc(o.key || "")})</option>`).join("")}</select></label>`;
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
    const caps = obj(obj(state.accessRow).capabilities);
    const adminVisible = state.mode === "org-admin" || Boolean(obj(state.accessRow).is_organization_admin || caps.can_view_organization_admin);

    shell.innerHTML = `
      <style>
        #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:1180px;box-sizing:border-box;color:${cfg.text}}#${SHELL_ID} *{box-sizing:border-box}.portal-shell-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-radius:18px;background:rgba(255,255,255,.94);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}.portal-shell-brand{display:flex;align-items:center;gap:10px;font-weight:900;color:${cfg.primary};min-width:190px}.portal-shell-mark{width:34px;height:34px;border-radius:999px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.76)});color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.portal-shell-brand-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-shell-sub{display:block;color:${rgba(cfg.text,.62)};font-size:11px;font-weight:800;margin-top:2px}.portal-shell-context{display:flex;align-items:center;gap:10px;min-width:180px;flex:1;justify-content:center}.portal-shell-org{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:900;color:${rgba(cfg.text,.68)}}.portal-shell-org select{min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:#fff;color:${cfg.primary};font-weight:900;padding:7px 30px 7px 11px;max-width:280px}.portal-shell-org-single{display:inline-flex;align-items:center;gap:8px;border:1px solid ${cfg.border};background:${cfg.soft};color:${cfg.primary};border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900}.portal-shell-org-single small{font-size:11px;color:${rgba(cfg.text,.58)}}.portal-shell-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.portal-shell-nav a,.portal-shell-pill,.portal-shell-auth-btn{display:inline-flex;align-items:center;min-height:32px;padding:7px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:900}.portal-shell-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.portal-shell-auth-btn{cursor:pointer;font-family:inherit}.portal-shell-nav a:hover,.portal-shell-auth-btn:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.portal-shell-pill.ok{background:#e7f6ec;color:#14532d!important}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00!important}@media(max-width:920px){.portal-shell-bar{align-items:flex-start;flex-direction:column}.portal-shell-context{width:100%;justify-content:flex-start}.portal-shell-nav{width:100%;justify-content:flex-start}.portal-shell-nav a,.portal-shell-pill,.portal-shell-auth-btn,.portal-shell-org,.portal-shell-org select{width:100%;justify-content:center;max-width:none}.portal-shell-auth{width:100%}}
      </style>
      <div class="portal-shell-bar" data-version="${esc(VERSION)}">
        <div class="portal-shell-brand"><span class="portal-shell-mark">${esc(initials)}</span><span class="portal-shell-brand-text">${esc(brandText)}<span class="portal-shell-sub">${esc(modeLabel)}${state.organizationKey ? ` · ${esc(state.organizationKey)}` : ""}</span></span></div>
        <div class="portal-shell-context">${renderOrgContext()}</div>
        <nav class="portal-shell-nav">
          <a href="/home">Public Home</a>
          <a href="/documents">Documents</a>
          <a href="/user-dashboard">User Dashboard</a>
          ${adminVisible ? `<a href="/organization-admin">Organization Admin</a><a href="/organization-people">People</a>` : ""}
          <span class="portal-shell-auth">${state.authenticated ? `<span class="portal-shell-pill ok">${esc(state.email)}</span><button id="syncetc-portal-logout" class="portal-shell-auth-btn" type="button">Log out</button>` : `<button id="syncetc-portal-login" class="portal-shell-auth-btn" type="button">Log in</button>`}</span>
        </nav>
      </div>`;

    shell.querySelector("#syncetc-portal-logout")?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("syncetc:portal-logout-request"));
    });
    shell.querySelector("#syncetc-portal-login")?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("syncetc:portal-login-request"));
    });
    shell.querySelector("#syncetc-portal-org-select")?.addEventListener("change", (event) => {
      const organizationId = event.target.value;
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change-request", { detail: { organizationId, organization_id: organizationId } }));
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change", { detail: { organization_id: organizationId } }));
    });
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION };
  document.addEventListener("DOMContentLoaded", render);
})();
