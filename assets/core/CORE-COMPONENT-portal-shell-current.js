// CORE-COMPONENT-portal-shell-current.js
// Internal Version: 2026-06-07-021-N
// Purpose: Portal shell render gate: no visible header/page shell until organization style and shared header are ready. Diagnostics remain behind ?syncetc_debug=1.

(function () {
  "use strict";

  const VERSION = "2026-06-07-021-N";
  const SHELL_ID = "syncetc-organization-header";
  const FOOTER_ID = "syncetc-portal-footer";
  const LOGIN_MODAL_ID = "syncetc-portal-login-modal";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ORGANIZATION_HEADER_URL = "https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-organization-header-current.js";

  const PUBLIC_ORDER = ["home", "about", "info", "aircraft", "calendar", "events", "gallery", "documents", "documents-resources", "contact"];
  const USER_ORDER = ["user-dashboard", "dashboard", "roster", "member-roster", "documents", "events", "gallery-submission", "submit-gallery", "my-profile", "profile"];
  const ADMIN_ORDER = ["organization-admin", "admin-dashboard", "organization-people", "people", "events-admin", "documents-admin", "gallery-admin", "aircraft-admin", "assets"];
  const PLATFORM_ORDER = ["platform-access-tools", "access-admin", "customer-builder", "page-setup", "layout-designer"];

  let shellSupabaseClient = null;
  let authListenerStarted = false;
  let loginMessage = "";
  let loginMessageKind = "";

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
    publicNavItems: [],
    logo: null,
    activePageKey: "",
    shellAuthChecked: false,
  };

  const DEBUG = new URLSearchParams(window.location.search).get("syncetc_debug") === "1";
  const DEBUG_START = performance.now();
  const debugEvents = [];
  let visibleRenderMs = null;
  let lastRenderMs = null;
  let styleReadyMs = null;
  let sessionCheckMs = null;

  function elapsedMs() { return Math.round(performance.now() - DEBUG_START); }
  function mark(step, detail = "") {
    if (!DEBUG) return;
    debugEvents.push({ ms: elapsedMs(), step, detail: String(detail || "") });
    if (window.console && typeof window.console.debug === "function") {
      window.console.debug(`[SyncEtc portal ${VERSION}] ${step}`, detail || "");
    }
  }

  function debugStatusLine() {
    const bits = [];
    bits.push(`Session: ${state.authenticated ? `logged in as ${state.email || "active session"}` : state.shellAuthChecked ? "not logged in" : "checking"}`);
    bits.push(`Org: ${state.organizationKey || state.organizationName || "not selected"}`);
    bits.push(`Style: ${hasRequiredOrganizationStyle() ? "loaded" : "missing/not ready"}`);
    if (styleReadyMs !== null) bits.push(`Style ready: ${styleReadyMs}ms`);
    if (sessionCheckMs !== null) bits.push(`Session check: ${sessionCheckMs}ms`);
    if (visibleRenderMs !== null) bits.push(`Visible render: ${visibleRenderMs}ms`);
    if (lastRenderMs !== null) bits.push(`Last render: ${lastRenderMs}ms`);
    return bits.join(" | ");
  }

  function renderDebugPanel() {
    if (!DEBUG) return;
    let panel = document.getElementById("syncetc-portal-shell-diagnostics");
    if (!panel) {
      panel = document.createElement("pre");
      panel.id = "syncetc-portal-shell-diagnostics";
      panel.style.cssText = "max-width:1180px;margin:18px auto;padding:12px 14px;border:1px solid #c7d2e2;border-radius:12px;background:#0f172a;color:#e5edf8;font:12px/1.45 Consolas,Monaco,monospace;white-space:pre-wrap;overflow:auto;box-sizing:border-box;";
      document.body.appendChild(panel);
    }
    const lines = [
      `SyncEtc Portal Shell Diagnostics ${VERSION}`,
      `Elapsed: ${elapsedMs()}ms`,
      `Path: ${window.location.pathname}`,
      debugStatusLine(),
      "",
      "Steps:",
      ...debugEvents.map((e) => `${String(e.ms).padStart(6)}ms  ${e.step}${e.detail ? ` — ${e.detail}` : ""}`)
    ];
    panel.textContent = lines.join("\n");
  }

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g," ").trim(); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function key(v) { return clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""); }
  function getText(source, field, fallback = "") { const v = obj(source)[field]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function orderIndex(list, value, fallback) { const idx = list.indexOf(key(value)); return idx >= 0 ? idx : fallback; }
  function hexToRgb(hex) { const c = String(hex || "").replace("#", "").trim(); if (!/^[0-9a-f]{6}$/i.test(c)) throw new Error("Missing required organization style color."); return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) }; }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }

  const SCRIPT_PROMISES = window.__syncetcScriptPromises || (window.__syncetcScriptPromises = {});

  function loadScript(src) {
    if (SCRIPT_PROMISES[src]) {
      mark("loadScript:in-flight", src);
      return SCRIPT_PROMISES[src];
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.syncetcLoaded === "true") {
        mark("loadScript:cached", src);
        return Promise.resolve();
      }
      mark("loadScript:existing-wait", src);
      SCRIPT_PROMISES[src] = new Promise((resolve, reject) => {
        existing.addEventListener("load", () => { existing.dataset.syncetcLoaded = "true"; mark("loadScript:loaded-existing", src); resolve(); }, { once: true });
        existing.addEventListener("error", () => { mark("loadScript:error-existing", src); reject(new Error(`Failed to load ${src}`)); }, { once: true });
      });
      return SCRIPT_PROMISES[src];
    }

    mark("loadScript:start", src);
    SCRIPT_PROMISES[src] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => { script.dataset.syncetcLoaded = "true"; mark("loadScript:loaded", src); resolve(); };
      script.onerror = () => { mark("loadScript:error", src); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(script);
    });
    return SCRIPT_PROMISES[src];
  }

  function hasSharedOrganizationHeader() {
    return Boolean(window.SyncEtcOrganizationHeader && typeof window.SyncEtcOrganizationHeader.render === "function");
  }

  let sharedHeaderPromise = null;

  async function ensureSharedOrganizationHeader() {
    mark("ensureOrganizationHeader:start");
    if (hasSharedOrganizationHeader()) {
      mark("ensureOrganizationHeader:cached", window.SyncEtcOrganizationHeader.VERSION || "unknown version");
      return window.SyncEtcOrganizationHeader;
    }
    if (!sharedHeaderPromise) {
      sharedHeaderPromise = loadScript(ORGANIZATION_HEADER_URL).then(() => {
        if (!hasSharedOrganizationHeader()) throw new Error("Shared organization header did not load correctly.");
        mark("ensureOrganizationHeader:ready", window.SyncEtcOrganizationHeader.VERSION || "unknown version");
        return window.SyncEtcOrganizationHeader;
      }).catch((error) => {
        sharedHeaderPromise = null;
        throw error;
      });
    } else {
      mark("ensureOrganizationHeader:in-flight");
    }
    return sharedHeaderPromise;
  }

  async function ensureShellSupabase() {
    mark("ensureSupabase:start");
    if (shellSupabaseClient) { mark("ensureSupabase:cached"); return shellSupabaseClient; }
    if (!window.supabase) await loadScript(SUPABASE_JS);
    shellSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    mark("ensureSupabase:created-client");
    startAuthListener();
    return shellSupabaseClient;
  }

  function startAuthListener() {
    if (authListenerStarted || !shellSupabaseClient?.auth?.onAuthStateChange) return;
    authListenerStarted = true;
    shellSupabaseClient.auth.onAuthStateChange((event, session) => {
      mark("authStateChange", event);
      if (!["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) return;
      const nextAuth = Boolean(session?.access_token);
      const nextEmail = session?.user?.email || "";
      const changed = nextAuth !== state.authenticated || nextEmail !== state.email;
      if (nextAuth) {
        state = { ...state, authenticated: true, email: nextEmail || state.email, shellAuthChecked: true };
      } else {
        state = { ...state, authenticated: false, email: "", accessRow: null, organizations: [], organizationOptions: [], platformAdmin: false, shellAuthChecked: true };
      }
      render();
      if (changed) window.dispatchEvent(new CustomEvent("syncetc:portal-auth-changed", { detail: { authenticated: nextAuth, email: nextEmail } }));
    });
  }

  function setState(next = {}) {
    mark("setState", Object.keys(next || {}).join(",") || "empty");
    const keepPublicNav = next.publicNavItems === undefined ? state.publicNavItems : arr(next.publicNavItems);
    state = { ...state, ...next, publicNavItems: keepPublicNav, shellAuthChecked: next.shellAuthChecked ?? state.shellAuthChecked };
    render();
  }

  function config() {
    const profile = obj(state.styleProfile);
    const colors = obj(profile.colors_json);
    const effects = obj(profile.effects_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors, "brand_primary", "");
    const secondary = getText(colors, "brand_secondary", "");
    const surface = getText(colors, "surface", "");
    const text = getText(colors, "text", "");
    const width = getText(spacing, "page_width", getText(layout, "default_width", ""));
    const corners = getText(effects, "corners", "soft");
    return {
      primary, secondary, surface, text,
      border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 8px 22px ${rgba(primary,.10)}`,
      radius: corners === "sharp" ? "10px" : corners === "pill" ? "28px" : "18px",
      pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px"
    };
  }

  function hasRequiredOrganizationStyle() {
    const profile = obj(state.styleProfile);
    const colors = obj(profile.colors_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const hasColorSet = Boolean(colors.brand_primary && colors.brand_secondary && colors.surface && colors.text);
    const hasWidth = Boolean(spacing.page_width || layout.default_width || layout.page_width);
    return hasColorSet && hasWidth;
  }

  function holdPortalShellHidden(shell, reason) {
    mark("render:held", reason || "waiting");
    shell.style.visibility = "hidden";
    shell.style.minHeight = "0";
    shell.innerHTML = "";
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

  function normalizePath(path, pageKey) {
    const k = key(pageKey);
    if (k === "home") return "/";
    const p = clean(path);
    if (!p) return k ? `/${k}` : "#";
    if (/^https?:\/\//i.test(p) || p.startsWith("#") || /^mailto:/i.test(p) || /^tel:/i.test(p)) return p;
    return p.startsWith("/") ? p : `/${p}`;
  }

  function normalizeLink(raw, fallbackOrder = 100) {
    const r = obj(raw);
    const pageKey = key(r.key || r.page_key || r.template_key || r.slug || r.href || r.path || "");
    let label = clean(r.label || r.nav_label || r.title || r.template_name || r.page_key || pageKey || "Page");
    const k = pageKey === "" && label ? key(label) : pageKey;
    if (k === "home") label = "Home";
    if (k === "organization-people") label = "People";
    if (k === "user-dashboard") label = "Dashboard";
    if (k === "organization-admin") label = "Admin Dashboard";
    if (k === "roster") label = "Roster";
    const href = normalizePath(r.href || r.path || r.url || (r.page_slug ? `/${String(r.page_slug).replace(/^\/+/, "")}` : ""), k);
    const order = k === "home" ? 0 : Number(r.order ?? r.sort ?? r.sort_order ?? r.nav_order ?? fallbackOrder);
    return { key: k || key(label), href, label, order, zone: key(r.zone || r.access_zone || r.template_category || r.access_default || "") };
  }

  function publicLinks() {
    const links = arr(state.publicNavItems).map((item, i) => normalizeLink(item, i + 10));
    links.push({ key: "home", href: "/", label: "Home", order: 0, zone: "public" });
    return dedupeLinks(links, PUBLIC_ORDER);
  }

  function portalPages() {
    const pages = arr(obj(state.accessRow).portal_pages);
    return pages.map((page) => ({
      key: key(page.page_key || page.template_key),
      label: clean(page.nav_label || page.title || page.template_name || page.page_key),
      path: normalizePath(page.path || (page.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : ""), page.page_key || page.template_key),
      show: page.show_in_nav !== false,
      category: key(page.template_category),
      module: key(page.module_key || page.module_category),
      access: key(page.access_default),
      sort: Number(page.sort_order || page.nav_order || 100),
    })).filter((page) => page.key && page.path && page.show);
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
    if (k === "roster" || page.category === "user" || page.category === "member" || page.access === "member" || page.access === "user") return "user";
    return "public";
  }

  function makeLink(keyValue, href, label, order) {
    const k = key(keyValue);
    return { key: k, href: normalizePath(href, k), label: clean(label || k), order: k === "home" ? 0 : Number(order || 100) };
  }

  function dedupeLinks(links, orderList = []) {
    const byKey = new Map();
    for (const link of links) {
      const k = key(link.key || link.label || link.href);
      if (!k || !link.href) continue;
      const normalized = { ...link, key: k, href: normalizePath(link.href, k), order: k === "home" ? 0 : Number(link.order || 100) };
      const existing = byKey.get(k);
      if (!existing || normalized.order < existing.order || (k === "home" && normalized.href === "/")) byKey.set(k, normalized);
    }
    return Array.from(byKey.values()).sort((a,b) => {
      const ai = orderIndex(orderList, a.key, 9999);
      const bi = orderIndex(orderList, b.key, 9999);
      if (ai !== bi) return ai - bi;
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
  }

  function navGroups() {
    const caps = obj(obj(state.accessRow).capabilities);
    const adminVisible = Boolean(state.platformAdmin || obj(state.accessRow).is_organization_admin || caps.can_view_organization_admin);
    const userVisible = Boolean(state.authenticated && (state.platformAdmin || obj(state.accessRow).organization_id || caps.can_view_user_dashboard));
    const pages = portalPages();
    const publicRow = publicLinks();
    const userRow = [];
    const adminRow = [];

    for (const page of pages) {
      const zone = pageZone(page);
      if (zone === "public") publicRow.push(makeLink(page.key, page.path, navLabelForPage(page), page.sort));
      if (zone === "user" && userVisible) userRow.push(makeLink(page.key, page.path, navLabelForPage(page), page.sort));
      if (zone === "admin" && adminVisible) adminRow.push(makeLink(page.key, page.path, navLabelForPage(page), page.sort));
    }

    if (userVisible) userRow.push(makeLink("user-dashboard", "/user-dashboard", "Dashboard", orderIndex(USER_ORDER, "user-dashboard", 5)));
    if (adminVisible) adminRow.push(makeLink("organization-admin", "/organization-admin", "Admin Dashboard", orderIndex(ADMIN_ORDER, "organization-admin", 5)));

    const platformRow = Boolean(state.platformAdmin) ? dedupeLinks([
      makeLink("platform-access-tools", "/access-admin", "Platform Access Tools", orderIndex(PLATFORM_ORDER, "platform-access-tools", 10)),
      makeLink("customer-builder", "/customer-builder", "Customer Builder", orderIndex(PLATFORM_ORDER, "customer-builder", 20)),
      makeLink("page-setup", "/page-setup", "Page Setup", orderIndex(PLATFORM_ORDER, "page-setup", 30)),
      makeLink("layout-designer", "/layout-designer", "Layout Designer", orderIndex(PLATFORM_ORDER, "layout-designer", 40)),
    ], PLATFORM_ORDER) : [];

    return {
      public: dedupeLinks(publicRow, PUBLIC_ORDER),
      user: dedupeLinks(userRow, USER_ORDER),
      admin: dedupeLinks(adminRow, ADMIN_ORDER),
      platform: platformRow,
      adminVisible,
      userVisible,
    };
  }

  function activeKey() {
    const explicit = key(state.activePageKey);
    if (explicit) return explicit;
    const path = clean(window.location.pathname).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!path) return "home";
    if (path === "organization-admin") return "organization-admin";
    if (path === "organization-people") return "organization-people";
    if (path === "user-dashboard") return "user-dashboard";
    return key(path);
  }

  function renderNavRow(label, links, className) {
    if (!links.length) return "";
    const labelHtml = label ? `<span class="portal-shell-row-label">${esc(label)}</span>` : "";
    const active = activeKey();
    return `<div class="portal-shell-nav-row ${esc(className)} ${label ? "" : "no-label"}">${labelHtml}<nav>${links.map((link) => `<a href="${esc(link.href)}" class="${key(link.key) === active ? "is-active" : ""}">${esc(link.label)}</a>`).join("")}</nav></div>`;
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

  function logoHtml(orgName, cfg) {
    const logo = obj(state.logo);
    const url = clean(logo.url || logo.src || "");
    if (url) return `<img src="${esc(url)}" alt="${esc(logo.alt_text || orgName || "Organization logo")}" loading="lazy" decoding="async">`;
    const initials = clean(orgName || state.organizationName || "S").split(/\s+/).filter(Boolean).slice(0,2).map((p) => p.charAt(0)).join("").toUpperCase() || "S";
    return `<span class="portal-shell-mark">${esc(initials)}</span>`;
  }

  function renderFooter(cfg) {
    let footer = document.getElementById(FOOTER_ID);
    if (!footer) { footer = document.createElement("div"); footer.id = FOOTER_ID; document.body.appendChild(footer); }
    const org = clean(state.organizationName || state.organizationKey || "");
    footer.innerHTML = `<style>#${FOOTER_ID}{font-family:Arial,Helvetica,sans-serif;max-width:${cfg.pageWidth};margin:10px auto 42px;padding:0 18px;color:${rgba(cfg.text,.62)};box-sizing:border-box}#${FOOTER_ID} .portal-footer-inner{border-top:1px solid ${cfg.border};padding-top:14px;font-size:12px;font-weight:800;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}</style><div class="portal-footer-inner"><span>${org ? esc(org) + " · " : ""}Powered by SyncEtc</span><span>Portal shell ${esc(VERSION)}</span></div>`;
  }

  function renderLoginModal() {
    let modal = document.getElementById(LOGIN_MODAL_ID);
    if (!modal) { modal = document.createElement("div"); modal.id = LOGIN_MODAL_ID; document.body.appendChild(modal); }
    const cfg = config();
    modal.innerHTML = `<style>
      #${LOGIN_MODAL_ID}{display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.52);align-items:center;justify-content:center;padding:20px;font-family:Arial,Helvetica,sans-serif;color:#172033}
      #${LOGIN_MODAL_ID}.open{display:flex}#${LOGIN_MODAL_ID} .portal-login-box{width:min(560px,100%);background:#fff;border:1px solid ${cfg.border};border-radius:22px;box-shadow:0 24px 80px rgba(15,23,42,.28);padding:22px}
      #${LOGIN_MODAL_ID} h2{margin:0 0 6px;font-size:26px;color:${cfg.primary}}#${LOGIN_MODAL_ID} p{margin:0 0 14px;color:rgba(23,32,51,.72);font-weight:700;line-height:1.45}
      #${LOGIN_MODAL_ID} input{width:100%;min-height:44px;border:1px solid ${cfg.border};border-radius:12px;padding:10px 12px;margin:7px 0;font-size:15px}
      #${LOGIN_MODAL_ID} .portal-login-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}#${LOGIN_MODAL_ID} button{border:1px solid ${cfg.primary};background:${cfg.primary};color:#fff;border-radius:999px;padding:10px 15px;font-weight:950;cursor:pointer}#${LOGIN_MODAL_ID} button.secondary{background:#fff;color:${cfg.primary}}
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
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
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
    setState({ authenticated: false, email: "", organizations: [], organizationOptions: [], accessRow: null, platformAdmin: false, shellAuthChecked: true });
    window.dispatchEvent(new CustomEvent("syncetc:portal-auth-changed", { detail: { authenticated: false, email: "" } }));
  }

  async function syncShellAuth(skipRender = false) {
    mark("syncAuth:start", skipRender ? "skipRender" : "render");
    const authStart = performance.now();
    const wasAuthenticated = state.authenticated;
    const wasEmail = state.email;
    let sessionEmail = "";
    try {
      const client = await ensureShellSupabase();
      mark("getSession:start");
      const { data } = await client.auth.getSession();
      sessionEmail = data?.session?.user?.email || "";
      sessionCheckMs = Math.round(performance.now() - authStart);
      mark("getSession:done", data?.session?.access_token ? `logged in as ${sessionEmail || "active session"} in ${sessionCheckMs}ms` : `not logged in in ${sessionCheckMs}ms`);
      state = { ...state, authenticated: Boolean(data?.session?.access_token), email: sessionEmail || state.email, shellAuthChecked: true };
    } catch (error) {
      sessionCheckMs = Math.round(performance.now() - authStart);
      mark("getSession:error", error?.message || String(error));
      state = { ...state, shellAuthChecked: true };
    }
    if (!skipRender) render();
    if (state.authenticated !== wasAuthenticated || state.email !== wasEmail) {
      window.dispatchEvent(new CustomEvent("syncetc:portal-auth-changed", { detail: { authenticated: state.authenticated, email: sessionEmail || state.email } }));
    }
  }

  function render() {
    mark("render:start");
    const renderStart = performance.now();
    let shell = document.getElementById(SHELL_ID);
    if (!shell) { shell = document.createElement("div"); shell.id = SHELL_ID; document.body.insertBefore(shell, document.body.firstChild); mark("shell:created"); }

    if (!hasRequiredOrganizationStyle()) {
      mark("styleConfig:missing", state.organizationKey || state.organizationName || "no organization style yet");
      holdPortalShellHidden(shell, "waiting for organization style");
      renderDebugPanel();
      return;
    }
    if (styleReadyMs === null) styleReadyMs = elapsedMs();
    mark("styleConfig:ready", `first ready at ${styleReadyMs}ms`);

    const cfg = config();
    const groups = navGroups();
    const modeLabel = state.mode === "org-admin" ? "Organization Admin" : "User Portal";
    const organizationName = clean(state.organizationName) ? state.organizationName : `SyncEtc ${modeLabel}`;
    const selected = selectedOrgId();
    const orgOptions = organizationOptions();

    if (!hasSharedOrganizationHeader()) {
      mark("header:not-ready");
      holdPortalShellHidden(shell, "waiting for shared organization header");
      renderDebugPanel();
      ensureSharedOrganizationHeader().then(() => render()).catch((error) => {
        mark("header:load-error", error?.message || String(error));
        shell.style.visibility = "visible";
        shell.innerHTML = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:${cfg.pageWidth};margin:0 auto;padding:12px 18px;color:#8a1f1f;box-sizing:border-box"><div style="border:3px solid #dc2626;border-radius:14px;background:#fff7f7;padding:18px;font-size:18px;font-weight:950">HEADER CONFIGURATION ERROR<br><span style="font-size:13px;font-weight:800">The shared organization header could not be loaded: ${esc(error.message || String(error))}</span></div></div>`;
        renderDebugPanel();
      });
      return;
    }

    shell.style.visibility = "visible";
    shell.style.minHeight = "";
    mark("headerRender:start");
    window.SyncEtcOrganizationHeader.render(shell, {
      organizationName,
      organization: {
        organization_id: state.organizationId || selected,
        organization_key: state.organizationKey,
        display_name: organizationName
      },
      organizations: orgOptions.map((o) => ({ organization_id: o.id, display_name: o.name, organization_key: o.key })),
      selectedOrganizationId: selected,
      authenticated: state.authenticated,
      auth: { authenticated: state.authenticated, email: state.email },
      email: state.email,
      styleProfile: state.styleProfile,
      primaryColor: cfg.primary,
      secondaryColor: cfg.secondary,
      pageWidth: cfg.pageWidth,
      logo: state.logo,
      activePageKey: state.activePageKey,
      access: {
        can_view_user_dashboard: groups.userVisible,
        can_view_organization_admin: groups.adminVisible,
        is_platform_admin: Boolean(state.platformAdmin)
      },
      nav: {
        public: groups.public,
        user: groups.user,
        admin: groups.admin,
        platform: groups.platform
      },
      loginUrl: `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      onLogin: () => openLoginModal(true),
      onLogout: () => shellLogout().catch((e) => setLoginMessage(e.message || String(e), "warn")),
      onOrganizationChange: (organizationId) => {
        window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change-request", { detail: { organizationId, organization_id: organizationId } }));
        window.dispatchEvent(new CustomEvent("syncetc:portal-organization-change", { detail: { organization_id: organizationId } }));
      }
    });

    renderLoginModal();
    renderFooter(cfg);
    lastRenderMs = Math.round(performance.now() - renderStart);
    if (visibleRenderMs === null) visibleRenderMs = elapsedMs();
    mark("headerRender:done", `${lastRenderMs}ms`);
    renderDebugPanel();
  }

  window.SyncEtcPortalShell = { setState, render, version: VERSION, openLogin: openLoginModal, logout: shellLogout, syncAuth: syncShellAuth };

  function bootPortalShell() {
    mark("boot:start", window.location.pathname);
    syncShellAuth().catch((error) => { mark("boot:syncAuth:error", error?.message || String(error)); render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootPortalShell);
  else bootPortalShell();
})();
