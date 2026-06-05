(function () {
  "use strict";

  const VERSION = "2026-06-05-001";

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function hasText(value) {
    return cleanText(value).length > 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getJson(source, key) {
    const value = source && typeof source === "object" ? source[key] : null;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getText(source, key, fallback = "") {
    const value = source && typeof source === "object" ? source[key] : undefined;
    return typeof value === "string" ? value.trim() : fallback;
  }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 31, g: 79, b: 130 };
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

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
      .syncetc-public-header{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0;background:${rgba(config.surface,.94)};border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-public-logo-panel{display:flex;align-items:center;justify-content:center;min-width:116px;padding:10px;border-right:1px solid ${config.border};background:${rgba(config.surface,.9)};}
      .syncetc-public-logo-panel img{display:block;max-width:92px;max-height:92px;width:auto;height:auto;object-fit:contain;border-radius:${config.radius};}
      .syncetc-public-logo-fallback{width:74px;height:74px;border-radius:${config.radius};display:flex;align-items:center;justify-content:center;background:${config.softPrimary};color:${config.primary};font-weight:900;font-size:24px;}
      .syncetc-public-header-main{min-width:0;display:grid;grid-template-rows:auto auto;}
      .syncetc-public-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 14px;background:${config.primary};color:#fff;}
      .syncetc-public-title-wrap{display:flex;align-items:center;gap:10px;min-width:0;}
      .syncetc-public-title{margin:0;font-size:${config.titleSize};line-height:1.05;font-weight:900;letter-spacing:-.03em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .syncetc-public-badge{display:inline-flex;align-items:center;max-width:210px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .syncetc-public-login{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:7px 14px;border-radius:999px;background:#fff;color:${config.primary}!important;text-decoration:none;font-size:12px;font-weight:900;white-space:nowrap;}
      .syncetc-public-nav{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:${rgba(config.surface,.86)};}
      .syncetc-public-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:5px 10px;border-radius:999px;border:1px solid ${config.border};background:${rgba(config.surface,.95)};color:${config.primary}!important;text-decoration:none;font-size:${config.navFontSize};font-weight:900;line-height:1;transition:background 160ms ease, transform 160ms ease, box-shadow 160ms ease;}
      .syncetc-public-nav a:hover,.syncetc-public-nav a.is-active{background:${config.primary};color:#fff!important;transform:translateY(-1px);box-shadow:0 7px 16px rgba(12,38,64,.16);}
      .syncetc-public-page-slot{margin-top:26px;}
      .syncetc-public-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.8fr);gap:18px;margin-top:34px;padding:22px;border-radius:${config.radiusLarge};background:${rgba(config.surface,.94)};border:1px solid ${config.border};box-shadow:${config.shadow};backdrop-filter:blur(8px);}
      .syncetc-public-footer-brand{display:flex;align-items:center;gap:14px;min-width:0;}
      .syncetc-public-footer-logo img{display:block;max-width:58px;max-height:58px;object-fit:contain;border-radius:${config.radius};}
      .syncetc-public-footer h2{margin:0;color:${config.primary};font-size:22px;line-height:1.1;font-weight:900;letter-spacing:-.02em;}
      .syncetc-public-footer p{margin:8px 0 0 0;color:${config.muted};font-size:13px;line-height:1.55;}
      .syncetc-public-footer-links{display:flex;align-content:start;justify-content:flex-start;gap:8px;flex-wrap:wrap;}
      .syncetc-public-footer-links a{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;border:1px solid ${config.border};background:${rgba(config.surface,.95)};color:${config.primary}!important;text-decoration:none;font-size:12px;font-weight:850;}
      .syncetc-public-error{max-width:${config.pageWidth};margin:24px auto;padding:18px;border-radius:${config.radius};background:#fff4f4;border:1px solid #ffb4b4;color:#8a1f1f;font-family:Arial,Helvetica,sans-serif;}
      @media(max-width:760px){.syncetc-public-site{margin-top:12px;padding:0 12px}.syncetc-public-header{grid-template-columns:1fr}.syncetc-public-logo-panel{border-right:0;border-bottom:1px solid ${config.border};min-width:0}.syncetc-public-title-row{align-items:flex-start;flex-direction:column}.syncetc-public-title{font-size:25px;white-space:normal}.syncetc-public-login{align-self:flex-start}.syncetc-public-footer{grid-template-columns:1fr}.syncetc-public-footer-links{justify-content:flex-start}}
    `;
  }

  function initials(name) {
    const parts = cleanText(name).split(" ").filter(Boolean);
    return (parts[0]?.[0] || "S") + (parts[1]?.[0] || "");
  }

  function logoHtml(logo, orgName) {
    if (logo && logo.url) {
      return `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt_text || orgName || "Organization logo")}" loading="eager" decoding="async">`;
    }
    return `<div class="syncetc-public-logo-fallback" aria-hidden="true">${escapeHtml(initials(orgName))}</div>`;
  }

  function navHtml(navItems, activePageKey) {
    const items = Array.isArray(navItems) ? navItems : [];
    if (!items.length) return "";
    return `<nav class="syncetc-public-nav" aria-label="Site navigation">${items.map((item) => {
      const active = String(item.page_key || item.template_key || "") === String(activePageKey || "");
      return `<a href="${escapeHtml(safeHref(item.href))}" class="${active ? "is-active" : ""}">${escapeHtml(item.nav_label || item.page_key || "Page")}</a>`;
    }).join("")}</nav>`;
  }

  function render(options) {
    const root = options.root;
    const payload = options.payload || {};
    const shell = payload.site_shell || {};
    const config = styleConfig(payload);
    const orgName = shell.organization_name || payload.organization?.display_name || "Organization";
    const badge = shell.badge_text || "";
    const nav = Array.isArray(shell.nav_items) ? shell.nav_items : [];
    const logo = shell.logo || null;
    const loginLabel = shell.login_label || "Login";
    const loginUrl = safeHref(shell.login_url || "/login");
    const activePageKey = options.activePageKey || payload.page?.page_key || "";
    const extraCss = options.extraCss || "";
    const beforeBodyHtml = options.beforeBodyHtml || "";
    const bodyHtml = options.bodyHtml || "";
    const footerMode = shell.footer_mode || "enabled";
    const footerNote = shell.footer_note || "";

    root.innerHTML = `
      <style>${buildCss(config)}${extraCss}</style>
      <div class="syncetc-public-site" data-syncetc-shell-version="${VERSION}">
        <header class="syncetc-public-header">
          <div class="syncetc-public-logo-panel">${logoHtml(logo, orgName)}</div>
          <div class="syncetc-public-header-main">
            <div class="syncetc-public-title-row">
              <div class="syncetc-public-title-wrap">
                <h1 class="syncetc-public-title">${escapeHtml(orgName)}</h1>
                ${hasText(badge) ? `<span class="syncetc-public-badge">${escapeHtml(badge)}</span>` : ""}
              </div>
              <a class="syncetc-public-login" href="${escapeHtml(loginUrl)}">${escapeHtml(loginLabel)}</a>
            </div>
            ${navHtml(nav, activePageKey)}
          </div>
        </header>
        <main class="syncetc-public-page-slot">
          ${beforeBodyHtml}
          ${bodyHtml}
        </main>
        ${footerMode === "disabled" ? "" : `<footer class="syncetc-public-footer">
          <div class="syncetc-public-footer-brand">
            <div class="syncetc-public-footer-logo">${logoHtml(logo, orgName)}</div>
            <div>
              <h2>${escapeHtml(orgName)}</h2>
              ${hasText(footerNote) ? `<p>${escapeHtml(footerNote)}</p>` : ""}
            </div>
          </div>
          <div class="syncetc-public-footer-links">${nav.map((item) => `<a href="${escapeHtml(safeHref(item.href))}">${escapeHtml(item.nav_label || item.page_key || "Page")}</a>`).join("")}</div>
        </footer>`}
      </div>
    `;
  }

  function renderError(root, message, payload) {
    const config = styleConfig(payload || {});
    root.innerHTML = `<style>${buildCss(config)}</style><div class="syncetc-public-error"><strong>Unable to load page.</strong><br>${escapeHtml(message || "Unknown error")}</div>`;
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
