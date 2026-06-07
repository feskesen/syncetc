// PUBLIC-COMPONENT-site-shell-current.js
// Internal Version: 2026-06-07-018-A
// Purpose: Public page shell using the same organization header model as the portal shell.

(function () {
  "use strict";

  const VERSION = "2026-06-07-018-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;

  const PUBLIC_ORDER = ["home", "about", "info", "aircraft", "calendar", "events", "gallery", "documents", "documents-resources", "contact"];
  const MEMBER_ORDER = ["user-dashboard", "roster", "member-roster", "submit-gallery", "my-profile", "profile", "reference", "fun"];
  const ADMIN_ORDER = ["organization-admin", "organization-people", "people", "events-admin", "documents-admin", "gallery-admin", "aircraft-admin", "assets"];
  const PLATFORM_ORDER = ["platform-access-tools", "customer-builder", "page-setup", "layout-designer"];

  let supabaseClient = null;
  let context = null;
  let authState = {
    checked: false,
    authenticated: false,
    email: "",
    platformAdmin: false,
    accessRow: null,
    accessRows: [],
  };

  function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function hasText(value) { return cleanText(value).length > 0; }
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function getJson(source, key) { const value = source && typeof source === "object" ? source[key] : null; return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function getText(source, key, fallback = "") { const value = source && typeof source === "object" ? source[key] : undefined; return typeof value === "string" && value.trim() ? value.trim() : fallback; }
  function key(value) { return cleanText(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function orderIndex(list, value, fallback) { const idx = list.indexOf(key(value)); return idx >= 0 ? idx : fallback; }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 31, g: 79, b: 130 };
    return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
  }
  function rgba(hex, alpha) { const rgb = hexToRgb(hex); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`; }

  function safeHref(value, fallback = "#") {
    const url = String(value || "").trim();
    if (!url) return fallback;
    if (url.startsWith("/") || url.startsWith("#")) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return fallback;
  }

  function styleConfig(payload) {
    const profile = payload?.style_profile || {};
    const colors = getJson(profile, "colors_json");
    const spacing = getJson(profile, "spacing_json");
    const layout = getJson(profile, "layout_json");
    const effects = getJson(profile, "effects_json");
    const typography = getJson(profile, "typography_json");

    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const density = getText(profile, "density", "normal");
    const cardStyle = getText(profile, "card_style", "standard");
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const width = getText(spacing, "page_width", getText(layout, "default_width", "normal"));
    const headingScale = getText(typography, "heading_scale", "normal");

    return {
      primary,
      secondary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      pageWidth: width === "wide" ? "1180px" : width === "narrow" ? "880px" : "1040px",
      radius: corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px",
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "hairline" ? "0 1px 0 rgba(12,38,64,.14)" : shadows === "strong" ? "0 24px 70px rgba(12,38,64,.28)" : "0 14px 42px rgba(12,38,64,.14)",
      density,
      navFontSize: density === "compact" ? "12px" : "13px",
      titleSize: headingScale === "compact" ? "26px" : "30px",
    };
  }

  function buildCss(config) {
    return `
      .syncetc-public-site{max-width:${config.pageWidth};margin:22px auto 56px auto;padding:0 16px;color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
      .syncetc-public-site *{box-sizing:border-box;}
      .syncetc-unified-header{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;padding:10px;border-radius:${config.radiusLarge};background:rgba(255,255,255,.95);border:1px solid ${config.border};box-shadow:${config.shadow};backdrop-filter:blur(8px);}
      .syncetc-unified-logo-panel{display:flex;align-items:center;justify-content:center;border:1px solid ${config.border};border-radius:${config.radius};background:${rgba(config.surface,.96)};min-height:96px;padding:10px;}
      .syncetc-unified-logo-panel img{display:block;max-width:92px;max-height:92px;width:auto;height:auto;object-fit:contain;border-radius:${config.radius};}
      .syncetc-unified-mark{width:72px;height:72px;border-radius:${config.radius};background:linear-gradient(135deg,${config.primary},${rgba(config.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:950;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);}
      .syncetc-unified-main{display:grid;gap:7px;min-width:0;}
      .syncetc-unified-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px;min-width:0;}
      .syncetc-unified-title{min-width:0;color:${config.primary};font-size:clamp(20px,3vw,31px);font-weight:950;letter-spacing:-.035em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .syncetc-unified-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto;}
      .syncetc-unified-pill,.syncetc-unified-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:6px 11px;border-radius:999px;border:1px solid ${config.border};background:#fff;color:${config.primary}!important;text-decoration:none;font-size:12px;font-weight:950;white-space:nowrap;}
      .syncetc-unified-auth-btn{cursor:pointer;font-family:inherit;}
      .syncetc-unified-auth-btn:hover{background:${config.primary};color:#fff!important;transform:translateY(-1px);}
      .syncetc-unified-pill.ok{background:#e7f6ec;color:#14532d!important;max-width:240px;overflow:hidden;text-overflow:ellipsis;}
      .syncetc-unified-org-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;}
      .syncetc-unified-org-single{display:inline-flex;align-items:center;gap:8px;max-width:520px;border:1px solid ${config.border};background:${config.softPrimary};color:${config.primary};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .syncetc-unified-org-single small{font-size:11px;color:${rgba(config.text,.58)};overflow:hidden;text-overflow:ellipsis;}
      .syncetc-unified-nav-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;align-items:center;min-height:34px;border:1px solid ${config.border};border-radius:999px;background:${rgba(config.surface,.95)};padding:4px 7px;}
      .syncetc-unified-nav-row.no-label{grid-template-columns:1fr;}
      .syncetc-unified-nav-row.public{background:rgba(255,255,255,.92);}
      .syncetc-unified-nav-row.member{background:${config.softPrimary};}
      .syncetc-unified-nav-row.admin{background:${rgba(config.secondary,.68)};}
      .syncetc-unified-nav-row.platform{background:linear-gradient(90deg,rgba(6,31,78,.08),rgba(255,113,0,.08));}
      .syncetc-unified-row-label{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;min-height:24px;padding:4px 9px;background:${config.primary};color:#fff;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;}
      .syncetc-unified-nav-row nav{display:flex;gap:7px;flex-wrap:wrap;align-items:center;}
      .syncetc-unified-nav-row a{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:5px 10px;border-radius:999px;border:1px solid ${config.border};background:#fff;color:${config.primary}!important;text-decoration:none;font-size:11px;font-weight:950;white-space:nowrap;}
      .syncetc-unified-nav-row a:hover,.syncetc-unified-nav-row a.is-active{background:${config.primary};color:#fff!important;transform:translateY(-1px);}
      .syncetc-public-page-slot{margin-top:26px;}
      .syncetc-public-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.8fr);gap:18px;margin-top:34px;padding:22px;border-radius:${config.radiusLarge};background:${rgba(config.surface,.94)};border:1px solid ${config.border};box-shadow:${config.shadow};backdrop-filter:blur(8px);}
      .syncetc-public-footer-brand{display:flex;align-items:center;gap:14px;min-width:0;}
      .syncetc-public-footer-logo img{display:block;max-width:58px;max-height:58px;object-fit:contain;border-radius:${config.radius};}
      .syncetc-public-footer h2{margin:0;color:${config.primary};font-size:22px;line-height:1.1;font-weight:900;letter-spacing:-.02em;}
      .syncetc-public-footer p{margin:8px 0 0 0;color:${config.muted};font-size:13px;line-height:1.55;}
      .syncetc-public-footer-links{display:flex;align-content:start;justify-content:flex-start;gap:8px;flex-wrap:wrap;}
      .syncetc-public-footer-links a{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;border:1px solid ${config.border};background:${rgba(config.surface,.95)};color:${config.primary}!important;text-decoration:none;font-size:12px;font-weight:850;}
      .syncetc-public-error{max-width:${config.pageWidth};margin:24px auto;padding:18px;border-radius:${config.radius};background:#fff4f4;border:1px solid #ffb4b4;color:#8a1f1f;font-family:Arial,Helvetica,sans-serif;}
      @media(max-width:900px){.syncetc-unified-header{grid-template-columns:1fr}.syncetc-unified-logo-panel{min-height:72px}.syncetc-unified-mark{width:56px;height:56px;font-size:23px}.syncetc-unified-title-row{align-items:flex-start;flex-direction:column}.syncetc-unified-auth{justify-content:flex-start}.syncetc-unified-org-single{max-width:none;width:100%}.syncetc-unified-nav-row{grid-template-columns:1fr;border-radius:18px}.syncetc-unified-row-label{justify-content:flex-start}.syncetc-unified-nav-row nav{align-items:stretch}.syncetc-unified-nav-row a,.syncetc-unified-pill,.syncetc-unified-auth-btn{flex:1 1 160px}.syncetc-public-footer{grid-template-columns:1fr}.syncetc-public-footer-links{justify-content:flex-start}}
      @media(max-width:620px){.syncetc-public-site{margin-top:12px;padding:0 12px}.syncetc-unified-nav-row a,.syncetc-unified-pill,.syncetc-unified-auth-btn{width:100%;flex-basis:100%}.syncetc-unified-title{white-space:normal}}
    `;
  }

  function initials(name) {
    const parts = cleanText(name).split(" ").filter(Boolean);
    return ((parts[0]?.[0] || "S") + (parts[1]?.[0] || "")).toUpperCase();
  }

  function logoHtml(logo, orgName) {
    if (logo && logo.url) return `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt_text || orgName || "Organization logo")}" loading="eager" decoding="async">`;
    return `<div class="syncetc-unified-mark" aria-hidden="true">${escapeHtml(initials(orgName).slice(0,2))}</div>`;
  }

  function normalizeHrefForKey(keyValue, href) {
    const k = key(keyValue);
    if (k === "home") return "/";
    const h = safeHref(href, "");
    return h || (k ? `/${k}` : "#");
  }

  function makeLink(keyValue, href, label, order) {
    return { key: key(keyValue), href: normalizeHrefForKey(keyValue, href), label: cleanText(label), order: Number(order || 100) };
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

  function publicLinksFromShell(shell) {
    const items = arr(shell.nav_items).map((item) => {
      const pageKey = item.page_key || item.template_key || item.nav_label;
      return makeLink(pageKey, item.href, item.nav_label || item.page_key || "Page", orderIndex(PUBLIC_ORDER, pageKey, Number(item.sort_order || 100)));
    });
    items.push(makeLink("home", "/", "Home", orderIndex(PUBLIC_ORDER, "home", 1)));
    return dedupeLinks(items);
  }

  function portalPages() {
    const row = obj(authState.accessRow);
    return arr(row.portal_pages).map((page) => ({
      key: key(page.page_key || page.template_key),
      label: cleanText(page.nav_label || page.title || page.template_name || page.page_key),
      path: normalizeHrefForKey(page.page_key || page.template_key, page.path || (page.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : "")),
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

  function navGroups(shell) {
    const caps = obj(obj(authState.accessRow).capabilities);
    const adminVisible = Boolean(authState.platformAdmin || obj(authState.accessRow).is_organization_admin || caps.can_view_organization_admin);
    const pages = portalPages();
    const publicLinks = publicLinksFromShell(shell);
    const memberLinks = [];
    const adminLinks = [];

    for (const page of pages) {
      const zone = pageZone(page);
      if (zone === "member") memberLinks.push(makeLink(page.key, page.path, navLabelForPage(page), orderIndex(MEMBER_ORDER, page.key, page.sort)));
      if (zone === "admin" && adminVisible) adminLinks.push(makeLink(page.key, page.path, navLabelForPage(page), orderIndex(ADMIN_ORDER, page.key, page.sort)));
    }

    if (authState.authenticated && obj(authState.accessRow).organization_id) memberLinks.push(makeLink("user-dashboard", "/user-dashboard", "Dashboard", orderIndex(MEMBER_ORDER, "user-dashboard", 5)));
    if (adminVisible) adminLinks.push(makeLink("organization-admin", "/organization-admin", "Admin Dashboard", orderIndex(ADMIN_ORDER, "organization-admin", 5)));

    const platformLinks = authState.platformAdmin ? dedupeLinks([
      makeLink("platform-access-tools", "/access-admin", "Platform Access Tools", orderIndex(PLATFORM_ORDER, "platform-access-tools", 10)),
      makeLink("customer-builder", "/customer-builder", "Customer Builder", orderIndex(PLATFORM_ORDER, "customer-builder", 20)),
      makeLink("page-setup", "/page-setup", "Page Setup", orderIndex(PLATFORM_ORDER, "page-setup", 30)),
      makeLink("layout-designer", "/layout-designer", "Layout Designer", orderIndex(PLATFORM_ORDER, "layout-designer", 40)),
    ]) : [];

    return { public: publicLinks, member: dedupeLinks(memberLinks), admin: dedupeLinks(adminLinks), platform: platformLinks };
  }

  function renderNavRow(label, links, className, activePageKey) {
    if (!links.length) return "";
    const hasLabel = cleanText(label);
    return `<div class="syncetc-unified-nav-row ${escapeHtml(className)} ${hasLabel ? "" : "no-label"}">${hasLabel ? `<span class="syncetc-unified-row-label">${escapeHtml(label)}</span>` : ""}<nav>${links.map((link) => `<a href="${escapeHtml(link.href)}" class="${key(link.key) === key(activePageKey) ? "is-active" : ""}">${escapeHtml(link.label)}</a>`).join("")}</nav></div>`;
  }

  function renderHeader(payload, activePageKey) {
    const shell = payload.site_shell || {};
    const org = payload.organization || {};
    const orgName = shell.organization_name || org.display_name || "Organization";
    const orgKey = shell.organization_key || org.organization_key || "";
    const logo = shell.logo || null;
    const groups = navGroups(shell);
    const loginHref = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    const orgContext = authState.authenticated ? `<span class="syncetc-unified-org-single">${escapeHtml(orgName)}${orgKey ? `<small>${escapeHtml(orgKey)}</small>` : ""}</span>` : "";
    return `<header class="syncetc-unified-header" data-syncetc-public-shell-version="${escapeHtml(VERSION)}">
      <div class="syncetc-unified-logo-panel">${logoHtml(logo, orgName)}</div>
      <div class="syncetc-unified-main">
        <div class="syncetc-unified-title-row"><div class="syncetc-unified-title">${escapeHtml(orgName)}</div><span class="syncetc-unified-auth">${authState.authenticated ? `<span class="syncetc-unified-pill ok">${escapeHtml(authState.email || "Signed in")}</span><button id="syncetc-public-logout" class="syncetc-unified-auth-btn" type="button">Log out</button>` : `<a class="syncetc-unified-auth-btn" href="${escapeHtml(loginHref)}">Log in</a>`}</span></div>
        <div class="syncetc-unified-org-row">${orgContext}</div>
        ${renderNavRow(authState.authenticated ? "Public" : "", groups.public, "public", activePageKey)}
        ${authState.authenticated ? renderNavRow("User", groups.member, "member", activePageKey) : ""}
        ${renderNavRow("Admin", groups.admin, "admin", activePageKey)}
        ${renderNavRow("Platform", groups.platform, "platform", activePageKey)}
      </div>
    </header>`;
  }

  function footerLogoHtml(logo, orgName) {
    if (logo && logo.url) return `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt_text || orgName || "Organization logo")}" loading="lazy" decoding="async">`;
    return `<div class="syncetc-unified-mark" style="width:58px;height:58px;font-size:22px">${escapeHtml(initials(orgName).slice(0,2))}</div>`;
  }

  function renderAll() {
    if (!context) return;
    const { root, payload, activePageKey, bodyHtml, beforeBodyHtml, extraCss } = context;
    const shell = payload.site_shell || {};
    const orgName = shell.organization_name || payload.organization?.display_name || "Organization";
    const logo = shell.logo || null;
    const footerMode = shell.footer_mode || "enabled";
    const footerNote = shell.footer_note || "";
    const config = styleConfig(payload);
    const publicLinks = publicLinksFromShell(shell);

    root.innerHTML = `
      <style>${buildCss(config)}${extraCss || ""}</style>
      <div class="syncetc-public-site" data-syncetc-shell-version="${VERSION}">
        ${renderHeader(payload, activePageKey)}
        <main class="syncetc-public-page-slot">${beforeBodyHtml || ""}${bodyHtml || ""}</main>
        ${footerMode === "disabled" ? "" : `<footer class="syncetc-public-footer"><div class="syncetc-public-footer-brand"><div class="syncetc-public-footer-logo">${footerLogoHtml(logo, orgName)}</div><div><h2>${escapeHtml(orgName)}</h2>${hasText(footerNote) ? `<p>${escapeHtml(footerNote)}</p>` : ""}</div></div><div class="syncetc-public-footer-links">${publicLinks.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}</div></footer>`}
      </div>`;

    root.querySelector("#syncetc-public-logout")?.addEventListener("click", () => logout().catch(() => {}));
  }

  function render(options) {
    context = {
      root: options.root,
      payload: options.payload || {},
      activePageKey: options.activePageKey || options.payload?.page?.page_key || "",
      bodyHtml: options.bodyHtml || "",
      beforeBodyHtml: options.beforeBodyHtml || "",
      extraCss: options.extraCss || "",
    };
    renderAll();
    refreshAuthContext().catch(() => {});
  }

  function renderError(root, message, payload) {
    const config = styleConfig(payload || {});
    root.innerHTML = `<style>${buildCss(config)}</style><div class="syncetc-public-error"><strong>Unable to load page.</strong><br>${escapeHtml(message || "Unknown error")}</div>`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient.auth.onAuthStateChange(() => refreshAuthContext().catch(() => {}));
    return supabaseClient;
  }

  async function callAccess(action, payload = {}) {
    const client = await ensureSupabase();
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const response = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok === false) return null;
    return result;
  }

  async function refreshAuthContext() {
    if (!context) return;
    const client = await ensureSupabase();
    const { data } = await client.auth.getSession();
    const session = data?.session || null;
    if (!session?.access_token) {
      authState = { checked: true, authenticated: false, email: "", platformAdmin: false, accessRow: null, accessRows: [] };
      renderAll();
      return;
    }

    const organizationId = cleanText(context.payload?.organization?.organization_id || "");
    const result = await callAccess("get_user_dashboard", organizationId ? { organization_id: organizationId } : {});
    const rows = arr(result?.access);
    const row = organizationId ? rows.find((r) => cleanText(r.organization_id) === organizationId) || rows[0] || null : rows[0] || null;
    authState = {
      checked: true,
      authenticated: true,
      email: session.user?.email || result?.user?.email || "",
      platformAdmin: Boolean(result?.platform_admin),
      accessRow: row,
      accessRows: rows,
    };
    renderAll();
  }

  async function logout() {
    const client = await ensureSupabase();
    await client.auth.signOut();
    authState = { checked: true, authenticated: false, email: "", platformAdmin: false, accessRow: null, accessRows: [] };
    renderAll();
  }

  window.SyncEtcPublicShell = {
    version: VERSION,
    render,
    renderError,
    styleConfig,
    escapeHtml,
    safeHref,
  };
})();
