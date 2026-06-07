// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-07-015-A
// Purpose: Shared portal shell for signed-in user and organization-admin pages. Page links are permission-aware and Page Setup-aware.

(function () {
  "use strict";

  const VERSION = "2026-06-07-015-A";
  const SHELL_ID = "syncetc-portal-shell";
  const FOOTER_ID = "syncetc-portal-footer";

  const PUBLIC_ORDER = ["home", "about", "info", "aircraft", "calendar", "events", "gallery", "documents", "documents-resources", "contact"];
  const MEMBER_ORDER = ["user-dashboard", "roster", "member-roster", "submit-gallery", "my-profile", "profile", "reference", "fun"];
  const ADMIN_ORDER = ["organization-admin", "organization-people", "people", "events-admin", "documents-admin", "gallery-admin", "aircraft-admin", "assets"];
  const PLATFORM_ORDER = ["platform-access-tools", "customer-builder", "page-setup", "layout-designer"];

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g," ").trim(); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 }; return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function key(v) { return clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""); }
  function orderIndex(list, value, fallback) { const idx = list.indexOf(key(value)); return idx >= 0 ? idx : fallback; }

  let state = { authenticated: false, email: "", mode: "user", organizationName: "", organizationKey: "", organizationId: "", selectedOrganizationId: "", organizations: [], organizationOptions: [], styleProfile: null, accessRow: null, platformAdmin: false };

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
      border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 8px 22px ${rgba(primary,.10)}`,
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

  function portalPages() {
    const pages = arr(obj(state.accessRow).portal_pages);
    return pages.map((page) => ({
      key: key(page.page_key || page.template_key),
      label: clean(page.nav_label || page.title || page.template_name || page.page_key),
      path: clean(page.path || (page.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : "")),
      show: page.show_in_nav !== false,
      category: key(page.template_category),
      module: key(page.module_key || page.module_category),
      access: key(page.access_default),
      sort: Number(page.sort_order || 100),
    })).filter((page) => page.key && page.path && page.show).sort((a,b) => a.sort - b.sort || a.label.localeCompare(b.label));
  }

  function navLabelForPage(page) {
    const k = key(page.key);
    if (k === "home") return "Home";
    if (k === "documents") return "Documents";
    if (k === "organization-people") return "People";
    if (k === "roster") return "Roster";
    if (k === "user-dashboard") return "Dashboard";
    if (k === "organization-admin") return "Admin Dashboard";
    return page.label || k;
  }

  function pageZone(page) {
    const k = key(page.key);
    if (k === "organization-people" || k.includes("admin") || page.category === "organization-admin" || page.access === "organization-admin") return "admin";
    if (k === "roster" || page.category === "user" || page.category === "member" || page.access === "member" || page.access === "user") return "member";
    return "public";
  }

  function makeLink(keyValue, href, label, order) {
    return { key: key(keyValue), href: clean(href), label: clean(label), order: Number(order || 100) };
  }

  function dedupeLinks(links) {
    const seen = new Set();
    return links.filter((link) => {
      const id = `${link.key}:${link.href}`;
      if (!link.href || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a,b) => a.order - b.order || a.label.localeCompare(b.label));
  }

  function navGroups(adminVisible, rosterVisible) {
    const pages = portalPages();
    const publicLinks = [];
    const memberLinks = [];
    const adminLinks = [];

    for (const page of pages) {
      const zone = pageZone(page);
      if (zone === "public") publicLinks.push(makeLink(page.key, page.path, navLabelForPage(page), orderIndex(PUBLIC_ORDER, page.key, page.sort)));
      if (zone === "member" && rosterVisible) memberLinks.push(makeLink(page.key, page.path, navLabelForPage(page), orderIndex(MEMBER_ORDER, page.key, page.sort)));
      if (zone === "admin" && adminVisible) adminLinks.push(makeLink(page.key, page.path, navLabelForPage(page), orderIndex(ADMIN_ORDER, page.key, page.sort)));
    }

    if (state.authenticated) memberLinks.push(makeLink("user-dashboard", "/user-dashboard", "Dashboard", orderIndex(MEMBER_ORDER, "user-dashboard", 5)));
    if (adminVisible) adminLinks.push(makeLink("organization-admin", "/organization-admin", "Admin Dashboard", orderIndex(ADMIN_ORDER, "organization-admin", 5)));

    const platformLinks = Boolean(state.platformAdmin) ? dedupeLinks([
      makeLink("platform-access-tools", "/access-admin", "Platform Access Tools", orderIndex(PLATFORM_ORDER, "platform-access-tools", 10)),
      makeLink("customer-builder", "/customer-builder", "Customer Builder", orderIndex(PLATFORM_ORDER, "customer-builder", 20)),
      makeLink("page-setup", "/page-setup", "Page Setup", orderIndex(PLATFORM_ORDER, "page-setup", 30)),
      makeLink("layout-designer", "/layout-designer", "Layout Designer", orderIndex(PLATFORM_ORDER, "layout-designer", 40)),
    ]) : [];

    return {
      public: dedupeLinks(publicLinks),
      member: dedupeLinks(memberLinks),
      admin: dedupeLinks(adminLinks),
      platform: platformLinks,
    };
  }

  function renderNavRow(label, links, className) {
    if (!links.length) return "";
    const hasLabel = clean(label);
    return `<div class="portal-shell-nav-row ${esc(className)} ${hasLabel ? "" : "no-label"}">${hasLabel ? `<span class="portal-shell-row-label">${esc(label)}</span>` : ""}<nav>${links.map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join("")}</nav></div>`;
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
    const rosterVisible = state.authenticated && Boolean(caps.can_view_roster || adminVisible) && portalPages().some((page) => key(page.key) === "roster");
    const isPlatformAdmin = Boolean(state.platformAdmin);
    const groups = navGroups(adminVisible, rosterVisible);

    shell.innerHTML = `
      <style>
        #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:${cfg.pageWidth};box-sizing:border-box;color:${cfg.text}}
        #${SHELL_ID} *{box-sizing:border-box}
        .portal-shell-bar{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;padding:10px;border-radius:${cfg.radius};background:rgba(255,255,255,.95);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}
        .portal-shell-logo-panel{display:flex;align-items:center;justify-content:center;border:1px solid ${cfg.border};border-radius:14px;background:${rgba(cfg.surface,.96)};min-height:96px;padding:10px}
        .portal-shell-mark{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:950;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
        .portal-shell-main{display:grid;gap:7px;min-width:0}
        .portal-shell-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px;min-width:0}
        .portal-shell-title{min-width:0;color:${cfg.primary};font-size:clamp(20px,3vw,31px);font-weight:950;letter-spacing:-.035em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .portal-shell-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
        .portal-shell-pill,.portal-shell-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:6px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:950;white-space:nowrap}
        .portal-shell-auth-btn{cursor:pointer;font-family:inherit}
        .portal-shell-auth-btn:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}
        .portal-shell-pill.ok{background:#e7f6ec;color:#14532d!important;max-width:240px;overflow:hidden;text-overflow:ellipsis}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00!important}
        .portal-shell-org-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
        .portal-shell-org{display:block;position:relative;min-width:260px;max-width:460px;cursor:pointer}.portal-shell-org span{display:none}.portal-shell-org select{width:100%;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:#fff;color:${cfg.primary};font-weight:950;padding:8px 34px 8px 12px;cursor:pointer}
        .portal-shell-org-single{display:inline-flex;align-items:center;gap:8px;max-width:520px;border:1px solid ${cfg.border};background:${cfg.soft};color:${cfg.primary};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-shell-org-single small{font-size:11px;color:${rgba(cfg.text,.58)};overflow:hidden;text-overflow:ellipsis}
        .portal-shell-nav-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;align-items:center;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:${rgba(cfg.surface,.95)};padding:4px 7px}.portal-shell-nav-row.no-label{grid-template-columns:1fr}
        .portal-shell-nav-row.public{background:rgba(255,255,255,.92)}.portal-shell-nav-row.member{background:${cfg.soft}}.portal-shell-nav-row.admin{background:${rgba(cfg.secondary,.68)}}.portal-shell-nav-row.platform{background:linear-gradient(90deg,rgba(6,31,78,.08),rgba(255,113,0,.08))}
        .portal-shell-row-label{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;min-height:24px;padding:4px 9px;background:${cfg.primary};color:#fff;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
        .portal-shell-nav-row nav{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.portal-shell-nav-row a{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:5px 10px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:11px;font-weight:950;white-space:nowrap}.portal-shell-nav-row a:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}
        @media(max-width:900px){.portal-shell-bar{grid-template-columns:1fr}.portal-shell-logo-panel{min-height:72px}.portal-shell-mark{width:56px;height:56px;font-size:23px}.portal-shell-title-row{align-items:flex-start;flex-direction:column}.portal-shell-auth{justify-content:flex-start}.portal-shell-org,.portal-shell-org-single{max-width:none;width:100%}.portal-shell-nav-row{grid-template-columns:1fr;border-radius:18px}.portal-shell-row-label{justify-content:flex-start}.portal-shell-nav-row nav{align-items:stretch}.portal-shell-nav-row a,.portal-shell-pill,.portal-shell-auth-btn{flex:1 1 160px}}
        @media(max-width:620px){#${SHELL_ID}{padding:10px}.portal-shell-nav-row a,.portal-shell-pill,.portal-shell-auth-btn{width:100%;flex-basis:100%}.portal-shell-title{white-space:normal}}
      </style>
      <div class="portal-shell-bar" data-version="${esc(VERSION)}">
        <div class="portal-shell-logo-panel"><span class="portal-shell-mark">${esc(initials)}</span></div>
        <div class="portal-shell-main">
          <div class="portal-shell-title-row"><div class="portal-shell-title">${esc(brandText)}</div><span class="portal-shell-auth">${state.authenticated ? `<span class="portal-shell-pill ok">${esc(state.email)}</span><button id="syncetc-portal-logout" class="portal-shell-auth-btn" type="button">Log out</button>` : `<button id="syncetc-portal-login" class="portal-shell-auth-btn" type="button">Log in</button>`}</span></div>
          <div class="portal-shell-org-row">${renderOrgContext()}</div>
          ${renderNavRow(state.authenticated ? "Public" : "", groups.public, "public")}
          ${state.authenticated ? renderNavRow("User", groups.member, "member") : ""}
          ${adminVisible ? renderNavRow("Admin", groups.admin, "admin") : ""}
          ${isPlatformAdmin ? renderNavRow("Platform", groups.platform, "platform") : ""}
        </div>
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
