// PUBLIC-COMPONENT-site-shell-current.js
// Internal Version: 2026-06-07-021-C
// Purpose: Public page wrapper. It never renders its own header; it feeds context to the single organization header engine.

(function () {
  "use strict";

  const VERSION = "2026-06-07-021-C";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const ORGANIZATION_HEADER_URL = "https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-organization-header-current.js";
  const HEADER_ID = "syncetc-organization-header";

  let supabaseClient = null;
  let context = null;
  let authListenerStarted = false;

  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function hasText(value) { return clean(value).length > 0; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function key(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function getJson(source, field) { const value = obj(source)[field]; return obj(value); }
  function getText(source, field, fallback = "") { const value = obj(source)[field]; return typeof value === "string" && value.trim() ? value.trim() : fallback; }

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 };
    return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, alpha) { const rgb = hexToRgb(hex); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`; }

  function safeHref(value, fallback = "#") {
    const url = String(value || "").trim();
    if (!url) return fallback;
    if (url.startsWith("/") || url.startsWith("#")) return url;
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return fallback;
  }

  function styleConfig(payload) {
    const profile = obj(payload?.style_profile);
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
      .syncetc-public-page-slot{margin-top:26px;}
      .syncetc-public-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.8fr);gap:18px;margin-top:34px;padding:22px;border-radius:${config.radiusLarge};background:${rgba(config.surface,.94)};border:1px solid ${config.border};box-shadow:${config.shadow};backdrop-filter:blur(8px);}
      .syncetc-public-footer-brand{display:flex;align-items:center;gap:14px;min-width:0;}
      .syncetc-public-footer-logo img{display:block;max-width:58px;max-height:58px;width:auto;height:auto;object-fit:contain;border-radius:${config.radius};}
      .syncetc-public-footer-mark{width:58px;height:58px;border-radius:${config.radius};background:linear-gradient(135deg,${config.primary},${rgba(config.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:950;}
      .syncetc-public-footer h2{margin:0;color:${config.primary};font-size:19px;line-height:1.15;font-weight:950;letter-spacing:-.02em;}
      .syncetc-public-footer p{margin:5px 0 0 0;color:${config.muted};font-size:13px;line-height:1.45;}
      .syncetc-public-footer-links{display:flex;align-content:flex-start;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
      .syncetc-public-footer-links a{display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:999px;border:1px solid ${config.border};background:#fff;color:${config.primary}!important;text-decoration:none;font-size:12px;font-weight:900;}
      .syncetc-public-error{max-width:${config.pageWidth};margin:28px auto;padding:16px 18px;border:1px solid rgba(18,54,90,.14);border-radius:16px;background:#fff;color:#5d6b78;font-family:Arial,Helvetica,sans-serif;}
      @media(max-width:760px){.syncetc-public-footer{grid-template-columns:1fr}.syncetc-public-footer-links{justify-content:flex-start}.syncetc-public-site{margin-top:12px;padding:0 12px}}
    `;
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
    if (!authListenerStarted) {
      authListenerStarted = true;
      supabaseClient.auth.onAuthStateChange(() => refreshOrganizationHeader().catch(() => {}));
    }
    return supabaseClient;
  }

  async function ensureOrganizationHeader() {
    if (window.SyncEtcOrganizationHeader && typeof window.SyncEtcOrganizationHeader.render === "function") return window.SyncEtcOrganizationHeader;
    if (!document.querySelector(`script[src="${ORGANIZATION_HEADER_URL}"]`)) await loadScript(ORGANIZATION_HEADER_URL);
    if (!window.SyncEtcOrganizationHeader || typeof window.SyncEtcOrganizationHeader.render !== "function") throw new Error("Shared organization header did not load.");
    return window.SyncEtcOrganizationHeader;
  }

  function shellNavItems(payload) {
    const shell = obj(payload?.site_shell);
    const raw = arr(shell.nav_items).length ? arr(shell.nav_items) : arr(shell.public_nav_items);
    const items = raw.map((item, index) => ({
      key: key(item.page_key || item.key || item.slug || item.label || ""),
      label: clean(item.label || item.nav_label || item.title || item.page_key || item.key || "Page"),
      href: safeHref(item.href || item.url || item.path || (item.page_key === "home" ? "/" : item.page_key ? `/${item.page_key}` : "#")),
      order: Number(item.order ?? item.sort_order ?? item.nav_order ?? index + 10),
      zone: "public",
    })).filter((item) => item.key && item.href && item.label);

    if (!items.some((item) => item.key === "home")) items.push({ key: "home", label: "Home", href: "/", order: 0, zone: "public" });
    return items;
  }

  function footerLogoHtml(logo, orgName) {
    if (logo && logo.url) return `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt_text || orgName || "Organization logo")}" loading="lazy" decoding="async">`;
    const initials = clean(orgName || "S").split(/\s+/).filter(Boolean).slice(0,2).map((part) => part.charAt(0)).join("").toUpperCase() || "S";
    return `<div class="syncetc-public-footer-mark">${escapeHtml(initials)}</div>`;
  }

  function chooseAccessRow(rows, payload) {
    const orgId = clean(payload?.organization?.organization_id || payload?.site_shell?.organization_id || "");
    const orgKey = clean(payload?.organization?.organization_key || payload?.site_shell?.organization_key || "");
    return arr(rows).find((row) => orgId && clean(row.organization_id) === orgId)
      || arr(rows).find((row) => orgKey && clean(row.organization_key) === orgKey)
      || arr(rows)[0]
      || null;
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


  function normalizePath(path, pageKey) {
    const k = key(pageKey);
    if (k === "home") return "/";
    const p = clean(path);
    if (!p) return k ? `/${k}` : "#";
    if (/^https?:\/\//i.test(p) || p.startsWith("#") || /^mailto:/i.test(p) || /^tel:/i.test(p)) return p;
    return p.startsWith("/") ? p : `/${p}`;
  }

  function portalPageLinks(accessRow, zone) {
    const pages = arr(obj(accessRow).portal_pages);
    return pages.map((page) => {
      const pageKey = key(page.page_key || page.template_key || page.key);
      const templateCategory = key(page.template_category);
      const accessDefault = key(page.access_default);
      const moduleKey = key(page.module_key || page.module_category);
      let pageZone = "public";
      if (pageKey === "organization-people" || pageKey.includes("admin") || templateCategory === "organization-admin" || accessDefault === "organization-admin") pageZone = "admin";
      else if (pageKey === "roster" || templateCategory === "user" || templateCategory === "member" || accessDefault === "member" || accessDefault === "user") pageZone = "user";
      if (pageZone !== zone) return null;
      let label = clean(page.nav_label || page.title || page.template_name || page.page_key || pageKey);
      if (pageKey === "user-dashboard") label = "Dashboard";
      if (pageKey === "organization-admin") label = "Admin Dashboard";
      if (pageKey === "organization-people") label = "People";
      if (pageKey === "home") label = "Home";
      return {
        key: pageKey,
        label,
        href: normalizePath(page.path || page.href || page.url || (page.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : ""), pageKey),
        order: Number(page.sort_order || page.nav_order || 100)
      };
    }).filter(Boolean);
  }

  function defaultPublicNavIfNeeded(items) {
    const links = arr(items);
    if (links.length > 1) return links;
    return [
      { key: "home", label: "Home", href: "/", order: 0 },
      { key: "info", label: "Info", href: "/info", order: 20 },
      { key: "aircraft", label: "Aircraft", href: "/aircraft", order: 30 },
      { key: "calendar", label: "Calendar / Events", href: "/calendar", order: 40 },
      { key: "gallery", label: "Gallery", href: "/gallery", order: 50 },
      { key: "documents", label: "Documents", href: "/documents", order: 60 },
      { key: "contact", label: "Contact", href: "/#contact", order: 70 }
    ];
  }

  async function refreshOrganizationHeader() {
    if (!context) return;
    const header = await ensureOrganizationHeader();
    const target = document.getElementById(HEADER_ID);
    if (!target) return;

    const payload = context.payload || {};
    const org = obj(payload.organization);
    const shell = obj(payload.site_shell);
    const orgId = clean(org.organization_id || shell.organization_id || "");
    const orgKey = clean(org.organization_key || shell.organization_key || "");
    const orgName = clean(shell.organization_name || org.display_name || org.legal_name || orgKey || "Organization");
    const logo = shell.logo || null;

    const client = await ensureSupabase();
    const { data } = await client.auth.getSession();
    const session = data?.session || null;

    let accessRow = null;
    let accessRows = [];
    let platformAdmin = false;
    if (session?.access_token) {
      const result = await callAccess("get_user_dashboard", orgId ? { organization_id: orgId } : {});
      accessRows = arr(result?.access);
      accessRow = chooseAccessRow(accessRows, payload);
      platformAdmin = Boolean(result?.platform_admin);
    }

    const caps = obj(obj(accessRow).capabilities);
    const isOrgAdmin = Boolean(obj(accessRow).is_organization_admin || caps.can_view_organization_admin || platformAdmin);
    const canUser = Boolean(obj(accessRow).organization_id || caps.can_view_user_dashboard || isOrgAdmin || platformAdmin);
    const publicNavItems = defaultPublicNavIfNeeded(shellNavItems(payload));
    const userLinks = canUser ? [
      { key: "user-dashboard", label: "Dashboard", href: "/user-dashboard", order: 5 },
      ...portalPageLinks(accessRow, "user")
    ] : [];
    const adminLinks = isOrgAdmin ? [
      { key: "organization-admin", label: "Admin Dashboard", href: "/organization-admin", order: 5 },
      ...portalPageLinks(accessRow, "admin")
    ] : [];
    const platformLinks = platformAdmin ? [
      { key: "platform-access-tools", label: "Platform Access Tools", href: "/access-admin", order: 10 },
      { key: "customer-builder", label: "Customer Builder", href: "/customer-builder", order: 20 },
      { key: "page-setup", label: "Page Setup", href: "/page-setup", order: 30 },
      { key: "layout-designer", label: "Layout Designer", href: "/layout-designer", order: 40 }
    ] : [];

    header.render(target, {
      authenticated: Boolean(session?.access_token),
      email: session?.user?.email || "",
      organizationName: orgName,
      organization: { organization_id: orgId, organization_key: orgKey, display_name: orgName },
      selectedOrganizationId: accessRow?.organization_id || orgId,
      organizations: accessRows.map((row) => ({ organization_id: row.organization_id, display_name: row.organization_name, organization_key: row.organization_key })),
      styleProfile: payload.style_profile || accessRow?.style_profile || null,
      logo,
      activePageKey: context.activePageKey || payload?.page?.page_key || "",
      access: {
        can_view_user_dashboard: canUser,
        can_view_organization_admin: isOrgAdmin,
        is_platform_admin: platformAdmin
      },
      nav: {
        public: publicNavItems,
        user: userLinks,
        admin: adminLinks,
        platform: platformLinks
      },
      loginUrl: `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      onLogout: async () => {
        await client.auth.signOut();
        await refreshOrganizationHeader();
      },
      onOrganizationChange: () => {}
    });
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

    const config = styleConfig(context.payload);
    const shell = obj(context.payload.site_shell);
    const org = obj(context.payload.organization);
    const orgName = clean(shell.organization_name || org.display_name || org.legal_name || org.organization_key || "Organization");
    const footerMode = shell.footer_mode || "enabled";
    const footerNote = shell.footer_note || "";
    const logo = shell.logo || null;
    const publicLinks = shellNavItems(context.payload);

    context.root.innerHTML = `
      <style>${buildCss(config)}${context.extraCss || ""}</style>
      <div id="${HEADER_ID}"></div>
      <div class="syncetc-public-site" data-syncetc-shell-version="${VERSION}">
        <main class="syncetc-public-page-slot">${context.beforeBodyHtml || ""}${context.bodyHtml || ""}</main>
        ${footerMode === "disabled" ? "" : `<footer class="syncetc-public-footer"><div class="syncetc-public-footer-brand"><div class="syncetc-public-footer-logo">${footerLogoHtml(logo, orgName)}</div><div><h2>${escapeHtml(orgName)}</h2>${hasText(footerNote) ? `<p>${escapeHtml(footerNote)}</p>` : ""}</div></div><div class="syncetc-public-footer-links">${publicLinks.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}</div></footer>`}
      </div>`;

    refreshOrganizationHeader().catch((error) => console.warn("SyncEtc organization header refresh failed", error));
  }

  function renderError(root, message, payload) {
    const config = styleConfig(payload || {});
    root.innerHTML = `<style>${buildCss(config)}</style><div id="${HEADER_ID}"></div><div class="syncetc-public-error"><strong>Unable to load page.</strong><br>${escapeHtml(message || "Unknown error")}</div>`;
    context = { root, payload: payload || {}, activePageKey: "", bodyHtml: "", beforeBodyHtml: "", extraCss: "" };
    refreshOrganizationHeader().catch(() => {});
  }

  window.SyncEtcPublicShell = {
    version: VERSION,
    render,
    renderError,
    styleConfig,
    escapeHtml,
    safeHref,
    refreshOrganizationHeader,
  };
})();
