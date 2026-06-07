// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-07-011-A
// Purpose: Shared shell for signed-in user and organization-admin pages. Header owns login/logout and organization context.

(function () {
  "use strict";

  const VERSION = "2026-06-07-011-A";
  const SHELL_ID = "syncetc-portal-shell";
  const FOOTER_ID = "syncetc-portal-footer";

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
    const effects = obj(profile.effects_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const width = getText(spacing, "page_width", getText(layout, "default_width", "wide"));
    const corners = getText(effects, "corners", "soft");
    return {
      primary, secondary, surface, text,
      border: rgba(primary,.16), soft: rgba(primary,.08), shadow: `0 8px 22px ${rgba(primary,.10)}`,
      radius: corners === "sharp" ? "10px" : corners === "pill" ? "28px" : "18px",
      pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px"
    };
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
    return `<label class="portal-shell-org"><span>Organization</span><select id="syncetc-portal-org-select" aria-label="Organization selector">${options.map((o) => `<option value="${esc(o.id)}" ${String(o.id) === selected ? "selected" : ""}>${esc(o.name || "Organization")}${o.key ? ` (${esc(o.key)})` : ""}</option>`).join("")}</select></label>`;
  }

  function renderFooter(cfg) {
    let footer = document.getElementById(FOOTER_ID);
    if (!footer) {
      footer = document.createElement("div");
      footer.id = FOOTER_ID;
      document.body.appendChild(footer);
    }
    const org = clean(state.organizationName || state.organizationKey || "");
    footer.innerHTML = `<style>#${FOOTER_ID}{font-family:Arial,Helvetica,sans-serif;max-width:${cfg.pageWidth};margin:10px auto 42px;padding:0 18px;color:${rgba(cfg.text,.62)};box-sizing:border-box}#${FOOTER_ID} .portal-footer-inner{border-top:1px solid ${cfg.border};padding-top:14px;font-size:12px;font-weight:800;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}#${FOOTER_ID} a{color:${cfg.primary};text-decoration:none;font-weight:950}</style><div class="portal-footer-inner"><span>${org ? esc(org) + " · " : ""}Powered by SyncEtc</span><span>Portal shell ${esc(VERSION)}</span></div>`;
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
    const rosterVisible = state.authenticated && Boolean(caps.can_view_roster || adminVisible);
    const nav = `<a href="/home">Public Home</a><a href="/documents">Documents</a><a href="/user-dashboard">User Dashboard</a>${rosterVisible ? `<a href="/roster">Roster</a>` : ""}${adminVisible ? `<a href="/organization-admin">Organization Admin</a><a href="/organization-people">People</a>` : ""}`;

    shell.innerHTML = `
      <style>
        #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:${cfg.pageWidth};box-sizing:border-box;color:${cfg.text}}#${SHELL_ID} *{box-sizing:border-box}.portal-shell-bar{display:grid;gap:10px;padding:12px 14px;border-radius:${cfg.radius};background:rgba(255,255,255,.95);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}.portal-shell-top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.portal-shell-brand{display:flex;align-items:center;gap:10px;font-weight:950;color:${cfg.primary};min-width:0;flex:1}.portal-shell-mark{width:34px;height:34px;border-radius:999px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.76)});color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.portal-shell-brand-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.portal-shell-sub{display:block;color:${rgba(cfg.text,.62)};font-size:11px;font-weight:850;margin-top:2px}.portal-shell-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.portal-shell-context-row{display:grid;grid-template-columns:minmax(230px,1fr) auto;align-items:center;gap:10px}.portal-shell-context{min-width:0}.portal-shell-org{display:block;position:relative;max-width:430px}.portal-shell-org span{display:block;font-size:10px;font-weight:950;color:${rgba(cfg.text,.62)};margin:0 0 3px 8px;text-transform:uppercase;letter-spacing:.04em}.portal-shell-org select{width:100%;min-height:36px;border:1px solid ${cfg.border};border-radius:999px;background:#fff;color:${cfg.primary};font-weight:950;padding:8px 34px 8px 12px;cursor:pointer}.portal-shell-org-single{display:inline-flex;align-items:center;gap:8px;max-width:430px;border:1px solid ${cfg.border};background:${cfg.soft};color:${cfg.primary};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-shell-org-single small{font-size:11px;color:${rgba(cfg.text,.58)};overflow:hidden;text-overflow:ellipsis}.portal-shell-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.portal-shell-nav a,.portal-shell-pill,.portal-shell-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:7px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:950;white-space:nowrap}.portal-shell-auth-btn{cursor:pointer;font-family:inherit}.portal-shell-nav a:hover,.portal-shell-auth-btn:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.portal-shell-pill.ok{background:#e7f6ec;color:#14532d!important;max-width:240px;overflow:hidden;text-overflow:ellipsis}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00!important}@media(max-width:940px){.portal-shell-top,.portal-shell-context-row{display:flex;align-items:stretch;flex-direction:column}.portal-shell-nav{justify-content:flex-start}.portal-shell-org,.portal-shell-org-single{max-width:none;width:100%}.portal-shell-nav a,.portal-shell-pill,.portal-shell-auth-btn{flex:1 1 160px}.portal-shell-auth{justify-content:flex-start}}@media(max-width:620px){#${SHELL_ID}{padding:10px}.portal-shell-nav a,.portal-shell-pill,.portal-shell-auth-btn{width:100%;flex-basis:100%}}
      </style>
      <div class="portal-shell-bar" data-version="${esc(VERSION)}">
        <div class="portal-shell-top">
          <div class="portal-shell-brand"><span class="portal-shell-mark">${esc(initials)}</span><span class="portal-shell-brand-text">${esc(brandText)}<span class="portal-shell-sub">${esc(modeLabel)}${state.organizationKey ? ` · ${esc(state.organizationKey)}` : ""}</span></span></div>
          <span class="portal-shell-auth">${state.authenticated ? `<span class="portal-shell-pill ok">${esc(state.email)}</span><button id="syncetc-portal-logout" class="portal-shell-auth-btn" type="button">Log out</button>` : `<button id="syncetc-portal-login" class="portal-shell-auth-btn" type="button">Log in</button>`}</span>
        </div>
        <div class="portal-shell-context-row"><div class="portal-shell-context">${renderOrgContext()}</div><nav class="portal-shell-nav">${nav}</nav></div>
      </div>`;

    shell.querySelector("#syncetc-portal-logout")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("syncetc:portal-logout-request")));
    shell.querySelector("#syncetc-portal-login")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("syncetc:portal-login-request")));
    shell.querySelector("#syncetc-portal-org-select")?.addEventListener("change", (event) => {
      const organizationId = event.target.value;
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change-request", { detail: { organizationId, organization_id: organizationId } }));
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change", { detail: { organization_id: organizationId } }));
    });
    renderFooter(cfg);
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION };
  document.addEventListener("DOMContentLoaded", render);
})();
