// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-07-016-A
// Purpose: Shared portal shell with tiered navigation, organization context, inline login/logout, and no blue pre-style flash.

(function () {
  "use strict";

  const VERSION = "2026-06-07-016-A";
  const SHELL_ID = "syncetc-portal-shell";
  const FOOTER_ID = "syncetc-portal-footer";
  const LOGIN_MODAL_ID = "syncetc-portal-login-modal";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  const PUBLIC_ORDER = ["home", "about", "info", "aircraft", "calendar", "events", "gallery", "documents", "documents-resources", "contact"];
  const MEMBER_ORDER = ["user-dashboard", "roster", "member-roster", "submit-gallery", "my-profile", "profile", "reference", "fun"];
  const ADMIN_ORDER = ["organization-admin", "organization-people", "people", "events-admin", "documents-admin", "gallery-admin", "aircraft-admin", "assets"];
  const PLATFORM_ORDER = ["platform-access-tools", "customer-builder", "page-setup", "layout-designer"];

  let shellSupabaseClient = null;
  let loginMessage = "";
  let loginMessageKind = "";
  let authSyncStarted = false;

  let state = {
    authenticated: false,
    email: "",
    mode: "user",
    organizationName: "",
    organizationKey: "",
    organizationId: "",
    selectedOrganizationId: "",
    organizations: [],
    organizationOptions: [],
    styleProfile: null,
    accessRow: null,
    platformAdmin: false,
    shellAuthChecked: false,
  };

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g," ").trim(); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function key(v) { return clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""); }
  function orderIndex(list, value, fallback) { const idx = list.indexOf(key(value)); return idx >= 0 ? idx : fallback; }
  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) return { r:54,g:74,b:99 }; return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }

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

  async function ensureShellSupabase() {
    if (shellSupabaseClient) return shellSupabaseClient;
    if (!window.supabase) await loadScript(SUPABASE_JS);
    shellSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return shellSupabaseClient;
  }

  function setState(next = {}) {
    state = { ...state, ...next, shellAuthChecked: next.shellAuthChecked ?? state.shellAuthChecked };
    render();
  }

  function config() {
    const profile = obj(state.styleProfile);
    const hasOrgStyle = Boolean(profile && (profile.colors_json || profile.spacing_json || profile.layout_json));
    const colors = obj(profile.colors_json);
    const effects = obj(profile.effects_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const primary = hasOrgStyle ? getText(colors, "brand_primary", "#365f37") : "#344966";
    const secondary = hasOrgStyle ? getText(colors, "brand_secondary", "#eef3f8") : "#f4f7fb";
    const surface = hasOrgStyle ? getText(colors, "surface", "#ffffff") : "#ffffff";
    const text = hasOrgStyle ? getText(colors, "text", "#172033") : "#172033";
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

    return { public: dedupeLinks(publicLinks), member: dedupeLinks(memberLinks), admin: dedupeLinks(adminLinks), platform: platformLinks };
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
    if (!footer) { footer = document.createElement("div"); footer.id = FOOTER_ID; document.body.appendChild(footer); }
    const org = clean(state.organizationName || state.organizationKey || "");
    footer.innerHTML = `<style>#${FOOTER_ID}{font-family:Arial,Helvetica,sans-serif;max-width:${cfg.pageWidth};margin:10px auto 42px;padding:0 18px;color:${rgba(cfg.text,.62)};box-sizing:border-box}#${FOOTER_ID} .portal-footer-inner{border-top:1px solid ${cfg.border};padding-top:14px;font-size:12px;font-weight:800;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}#${FOOTER_ID} a{color:${cfg.primary};text-decoration:none;font-weight:950}</style><div class="portal-footer-inner"><span>${org ? esc(org) + " · " : ""}Powered by SyncEtc</span><span>Portal shell ${esc(VERSION)}</span></div>`;
  }

  function renderLoginModal() {
    let modal = document.getElementById(LOGIN_MODAL_ID);
    if (!modal) { modal = document.createElement("div"); modal.id = LOGIN_MODAL_ID; document.body.appendChild(modal); }
    const cfg = config();
    modal.innerHTML = `<style>
      #${LOGIN_MODAL_ID}{display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.52);align-items:center;justify-content:center;padding:20px;font-family:Arial,Helvetica,sans-serif;color:#172033}
      #${LOGIN_MODAL_ID}.open{display:flex}
      #${LOGIN_MODAL_ID} .portal-login-box{width:min(560px,100%);background:#fff;border:1px solid ${cfg.border};border-radius:22px;box-shadow:0 24px 80px rgba(15,23,42,.28);padding:22px}
      #${LOGIN_MODAL_ID} h2{margin:0 0 6px;font-size:26px;color:${cfg.primary}}
      #${LOGIN_MODAL_ID} p{margin:0 0 14px;color:rgba(23,32,51,.72);font-weight:700;line-height:1.45}
      #${LOGIN_MODAL_ID} input{width:100%;min-height:44px;border:1px solid ${cfg.border};border-radius:12px;padding:10px 12px;margin:7px 0;font-size:15px}
      #${LOGIN_MODAL_ID} .portal-login-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
      #${LOGIN_MODAL_ID} button{border:1px solid ${cfg.primary};background:${cfg.primary};color:#fff;border-radius:999px;padding:10px 15px;font-weight:950;cursor:pointer}
      #${LOGIN_MODAL_ID} button.secondary{background:#fff;color:${cfg.primary}}
      #${LOGIN_MODAL_ID} .portal-login-msg{margin-top:12px;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;background:${loginMessageKind === "ok" ? "#e7f6ec" : "#fff7ec"};color:${loginMessageKind === "ok" ? "#14532d" : "#8a4d00"};display:${loginMessage ? "block" : "none"}}
    </style><div class="portal-login-box" role="dialog" aria-modal="true" aria-label="Log in"><h2>Log in</h2><p>Use the same login for user access, organization administration, and platform tools.</p><input id="portal-login-email" type="email" placeholder="Email" autocomplete="username"><input id="portal-login-password" type="password" placeholder="Password" autocomplete="current-password"><div class="portal-login-actions"><button id="portal-login-submit" type="button">Log in</button><button id="portal-login-reset" type="button" class="secondary">Send password reset</button><button id="portal-login-close" type="button" class="secondary">Close</button></div><div class="portal-login-msg">${esc(loginMessage)}</div></div>`;
    modal.querySelector("#portal-login-close")?.addEventListener("click", closeLoginModal);
    modal.querySelector("#portal-login-submit")?.addEventListener("click", () => shellLogin().catch((e) => setLoginMessage(e.message || String(e), "warn")));
    modal.querySelector("#portal-login-reset")?.addEventListener("click", () => shellReset().catch((e) => setLoginMessage(e.message || String(e), "warn")));
    modal.addEventListener("click", (event) => { if (event.target === modal) closeLoginModal(); });
  }

  function setLoginMessage(text, kind) { loginMessage = clean(text); loginMessageKind = kind || "warn"; renderLoginModal(); openLoginModal(false); }
  function openLoginModal(focus = true) { renderLoginModal(); const modal = document.getElementById(LOGIN_MODAL_ID); modal?.classList.add("open"); if (focus) setTimeout(() => document.getElementById("portal-login-email")?.focus(), 0); }
  function closeLoginModal() { document.getElementById(LOGIN_MODAL_ID)?.classList.remove("open"); }

  async function shellLogin() {
    const client = await ensureShellSupabase();
    const email = clean(document.getElementById("portal-login-email")?.value).toLowerCase();
    const password = document.getElementById("portal-login-password")?.value || "";
    if (!email || !password) throw new Error("Enter email and password.");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    closeLoginModal();
    await syncShellAuth(true);
    window.dispatchEvent(new CustomEvent("syncetc:portal-auth-changed", { detail: { authenticated: true, email } }));
  }

  async function shellReset() {
    const client = await ensureShellSupabase();
    const email = clean(document.getElementById("portal-login-email")?.value).toLowerCase();
    if (!email) throw new Error("Enter your email first.");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setLoginMessage("Password reset email requested.", "ok");
  }

  async function shellLogout() {
    const client = await ensureShellSupabase();
    await client.auth.signOut();
    setState({ authenticated: false, email: "", organizations: [], organizationOptions: [], organizationName: "", organizationKey: "", organizationId: "", selectedOrganizationId: "", accessRow: null, platformAdmin: false, styleProfile: null, shellAuthChecked: true });
    window.dispatchEvent(new CustomEvent("syncetc:portal-auth-changed", { detail: { authenticated: false, email: "" } }));
  }

  async function syncShellAuth(skipRender = false) {
    if (authSyncStarted && !skipRender) return;
    authSyncStarted = true;
    try {
      const client = await ensureShellSupabase();
      const { data } = await client.auth.getSession();
      const sessionEmail = data?.session?.user?.email || "";
      state = { ...state, authenticated: Boolean(data?.session?.access_token), email: sessionEmail || state.email, shellAuthChecked: true };
    } catch {
      state = { ...state, shellAuthChecked: true };
    }
    if (!skipRender) render();
  }

  function render() {
    let shell = document.getElementById(SHELL_ID);
    if (!shell) { shell = document.createElement("div"); shell.id = SHELL_ID; document.body.insertBefore(shell, document.body.firstChild); }

    const cfg = config();
    const modeLabel = state.mode === "org-admin" ? "Organization Admin" : "User Portal";
    const brandText = clean(state.organizationName) ? state.organizationName : `SyncEtc ${modeLabel}`;
    const initials = clean(state.organizationName || "S").slice(0, 1).toUpperCase() || "S";
    const caps = obj(obj(state.accessRow).capabilities);
    const adminVisible = state.mode === "org-admin" || Boolean(obj(state.accessRow).is_organization_admin || caps.can_view_organization_admin);
    const rosterVisible = state.authenticated && Boolean(caps.can_view_roster || adminVisible || state.platformAdmin) && portalPages().some((page) => key(page.key) === "roster");
    const groups = navGroups(adminVisible, rosterVisible);

    shell.innerHTML = `<style>
      #${SHELL_ID}{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:${cfg.pageWidth};box-sizing:border-box;color:${cfg.text}}
      #${SHELL_ID} *{box-sizing:border-box}.portal-shell-bar{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;padding:10px;border-radius:${cfg.radius};background:rgba(255,255,255,.95);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}
      .portal-shell-logo-panel{display:flex;align-items:center;justify-content:center;border:1px solid ${cfg.border};border-radius:14px;background:${rgba(cfg.surface,.96)};min-height:96px;padding:10px}.portal-shell-mark{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:950;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
      .portal-shell-main{display:grid;gap:7px;min-width:0}.portal-shell-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px;min-width:0}.portal-shell-title{min-width:0;color:${cfg.primary};font-size:clamp(20px,3vw,31px);font-weight:950;letter-spacing:-.035em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .portal-shell-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}.portal-shell-pill,.portal-shell-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:6px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:950;white-space:nowrap}.portal-shell-auth-btn{cursor:pointer;font-family:inherit}.portal-shell-auth-btn:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.portal-shell-pill.ok{background:#e7f6ec;color:#14532d!important;max-width:240px;overflow:hidden;text-overflow:ellipsis}.portal-shell-pill.warn{background:#fff7ec;color:#8a4d00!important}
      .portal-shell-org-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.portal-shell-org{display:block;position:relative;min-width:260px;max-width:460px;cursor:pointer}.portal-shell-org span{display:none}.portal-shell-org select{width:100%;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:#fff;color:${cfg.primary};font-weight:950;padding:8px 34px 8px 12px;cursor:pointer}.portal-shell-org-single{display:inline-flex;align-items:center;gap:8px;max-width:520px;border:1px solid ${cfg.border};background:${cfg.soft};color:${cfg.primary};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-shell-org-single small{font-size:11px;color:${rgba(cfg.text,.58)};overflow:hidden;text-overflow:ellipsis}
      .portal-shell-nav-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;align-items:center;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:${rgba(cfg.surface,.95)};padding:4px 7px}.portal-shell-nav-row.no-label{grid-template-columns:1fr}.portal-shell-nav-row.public{background:rgba(255,255,255,.92)}.portal-shell-nav-row.member{background:${cfg.soft}}.portal-shell-nav-row.admin{background:${rgba(cfg.secondary,.68)}}.portal-shell-nav-row.platform{background:linear-gradient(90deg,rgba(6,31,78,.08),rgba(255,113,0,.08))}.portal-shell-row-label{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;min-height:24px;padding:4px 9px;background:${cfg.primary};color:#fff;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.portal-shell-nav-row nav{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.portal-shell-nav-row a{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:5px 10px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:11px;font-weight:950;white-space:nowrap}.portal-shell-nav-row a:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}
      @media(max-width:900px){.portal-shell-bar{grid-template-columns:1fr}.portal-shell-logo-panel{min-height:72px}.portal-shell-mark{width:56px;height:56px;font-size:23px}.portal-shell-title-row{align-items:flex-start;flex-direction:column}.portal-shell-auth{justify-content:flex-start}.portal-shell-org,.portal-shell-org-single{max-width:none;width:100%}.portal-shell-nav-row{grid-template-columns:1fr;border-radius:18px}.portal-shell-row-label{justify-content:flex-start}.portal-shell-nav-row nav{align-items:stretch}.portal-shell-nav-row a,.portal-shell-pill,.portal-shell-auth-btn{flex:1 1 160px}}@media(max-width:620px){#${SHELL_ID}{padding:10px}.portal-shell-nav-row a,.portal-shell-pill,.portal-shell-auth-btn{width:100%;flex-basis:100%}.portal-shell-title{white-space:normal}}
    </style><div class="portal-shell-bar" data-version="${esc(VERSION)}"><div class="portal-shell-logo-panel"><span class="portal-shell-mark">${esc(initials)}</span></div><div class="portal-shell-main"><div class="portal-shell-title-row"><div class="portal-shell-title">${esc(brandText)}</div><span class="portal-shell-auth">${state.authenticated ? `<span class="portal-shell-pill ok">${esc(state.email || "Signed in")}</span><button id="syncetc-portal-logout" class="portal-shell-auth-btn" type="button">Log out</button>` : `<button id="syncetc-portal-login" class="portal-shell-auth-btn" type="button">Log in</button>`}</span></div><div class="portal-shell-org-row">${renderOrgContext()}</div>${renderNavRow(state.authenticated ? "Public" : "", groups.public, "public")}${state.authenticated ? renderNavRow("User", groups.member, "member") : ""}${adminVisible ? renderNavRow("Admin", groups.admin, "admin") : ""}${state.platformAdmin ? renderNavRow("Platform", groups.platform, "platform") : ""}</div></div>`;

    shell.querySelector("#syncetc-portal-logout")?.addEventListener("click", () => shellLogout().catch((e) => setLoginMessage(e.message || String(e), "warn")));
    shell.querySelector("#syncetc-portal-login")?.addEventListener("click", () => openLoginModal());
    shell.querySelector("#syncetc-portal-org-select")?.addEventListener("change", (event) => {
      const organizationId = event.target.value;
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change-request", { detail: { organizationId, organization_id: organizationId } }));
      window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change", { detail: { organization_id: organizationId } }));
    });
    renderLoginModal();
    renderFooter(cfg);
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION, openLogin: openLoginModal, logout: shellLogout };
  document.addEventListener("DOMContentLoaded", () => { syncShellAuth().catch(() => render()); });
})();
