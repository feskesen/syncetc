// PUBLIC-COMPONENT-site-shell-current.js
// Internal Version: 2026-06-12-108-D
// Purpose: Public page wrapper. It never renders its own header; it feeds context to the single organization header engine.

(function () {
  "use strict";

  const VERSION = "2026-06-12-108-D";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ACCESS_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const ORGANIZATION_HEADER_URL = "https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-organization-header-current.js";
  const HEADER_ID = "syncetc-organization-header";
  const ACCESS_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

  let supabaseClient = null;
  let context = null;
  let authListenerStarted = false;
  let supabaseClientPromise = null;
  let headerRefreshPromise = null;
  let sessionCheckPromise = null;
  let authChangeTimer = null;

  const PUBLIC_ROOT_SELECTORS = [
    "#syncetc-home-page-root",
    "#syncetc-info-page-root",
    "#syncetc-aircraft-page-root",
    "#syncetc-gallery-page-root",
    "#syncetc-documents-page-root",
    "#syncetc-calendar-page-root",
    "#syncetc-event-rsvp-root",
    "[data-render-mode='public'][data-organization-key]",
    "[data-render-mode='public'][data-customer-key]",
    "[data-syncetc-page]",
    "[data-syncetc-gallery-page-root='true']"
  ];

  function installEarlyPublicRootGate() {
    if (document.getElementById("syncetc-public-shell-early-gate")) return;
    const style = document.createElement("style");
    style.id = "syncetc-public-shell-early-gate";
    style.textContent = `${PUBLIC_ROOT_SELECTORS.map((selector) => `${selector}:not(.syncetc-public-shell-ready):not(.syncetc-public-shell-error)`).join(",\n")} { visibility: hidden !important; }`;
    document.head.appendChild(style);
  }

  function markRootReady(root) {
    if (!root) return;
    root.classList.remove("syncetc-public-shell-error");
    root.classList.add("syncetc-public-shell-ready");
    root.style.visibility = "visible";
  }

  function markRootError(root) {
    if (!root) return;
    root.classList.remove("syncetc-public-shell-ready");
    root.classList.add("syncetc-public-shell-error");
    root.style.visibility = "visible";
  }

  installEarlyPublicRootGate();

  const DEBUG_ENABLED = /(?:\?|&)syncetc_debug=1(?:&|$)/.test(window.location.search) || window.localStorage.getItem("syncetc_public_debug") === "1";
  const debugState = { version: VERSION, startedAt: performance.now(), steps: [], latest: {}, errors: [] };

  function debugElapsed() { return Math.round(performance.now() - debugState.startedAt); }

  function ensureDebugPanel() {
    if (!DEBUG_ENABLED) return null;
    let panel = document.getElementById("syncetc-public-shell-debug-panel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "syncetc-public-shell-debug-panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:12px;width:min(520px,calc(100vw - 24px));max-height:45vh;overflow:auto;background:#111827;color:#f9fafb;border:2px solid #f59e0b;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.35);font:12px/1.35 Consolas,Monaco,monospace;padding:10px;white-space:pre-wrap;";
    panel.innerHTML = "SyncEtc public shell diagnostics starting...";
    document.body.appendChild(panel);
    return panel;
  }

  function updateDebugPanel() {
    if (!DEBUG_ENABLED) return;
    const panel = ensureDebugPanel();
    if (!panel) return;
    const lines = [];
    lines.push(`SyncEtc Public Shell Diagnostics ${VERSION}`);
    lines.push(`Elapsed: ${debugElapsed()}ms`);
    if (debugState.latest.page) lines.push(`Page: ${debugState.latest.page}`);
    if (debugState.latest.org) lines.push(`Org: ${debugState.latest.org}`);
    if (debugState.latest.sessionKnown) lines.push(`Session: ${debugState.latest.sessionKnown}`);
    if (debugState.latest.accessStatus) lines.push(`Access: ${debugState.latest.accessStatus}`);
    if (debugState.latest.visibleRenderMs != null) lines.push(`Visible render: ${debugState.latest.visibleRenderMs}ms`);
    if (debugState.latest.backgroundRefreshMs != null) lines.push(`Background refresh: ${debugState.latest.backgroundRefreshMs}ms`);
    lines.push("");
    lines.push("Steps:");
    debugState.steps.slice(-28).forEach((step) => lines.push(`${String(step.t).padStart(6)}ms  ${step.label}${step.detail ? " — " + step.detail : ""}`));
    if (debugState.errors.length) {
      lines.push("");
      lines.push("Errors:");
      debugState.errors.slice(-6).forEach((err) => lines.push(`${err.t}ms ${err.label}: ${err.message}`));
    }
    panel.textContent = lines.join("\n");
  }

  function debugStep(label, detail = "") {
    const entry = { t: debugElapsed(), label, detail: String(detail ?? "").replace(/\s+/g, " ").trim() };
    debugState.steps.push(entry);
    if (DEBUG_ENABLED) {
      console.info(`[SyncEtc public shell ${VERSION}] ${entry.t}ms ${label}${detail ? " — " + detail : ""}`);
      updateDebugPanel();
    }
    return entry;
  }

  function debugError(label, error) {
    const entry = { t: debugElapsed(), label, message: error instanceof Error ? error.message : String(error || "unknown") };
    debugState.errors.push(entry);
    console.warn(`[SyncEtc public shell ${VERSION}] ${entry.t}ms ${label}`, error);
    updateDebugPanel();
  }

  window.SyncEtcPublicShellDiagnostics = debugState;

  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function hasText(value) { return clean(value).length > 0; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function key(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function getJson(source, field) { const value = obj(source)[field]; return obj(value); }
  function getText(source, field, fallback = "") { const value = obj(source)[field]; return typeof value === "string" && value.trim() ? value.trim() : fallback; }

  function isHexColor(value) { return /^#[0-9a-f]{6}$/i.test(clean(value)); }
  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) throw new Error(`Invalid organization style color: ${hex}`);
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

  function styleError(message, missing) { return { ok: false, message, missing: arr(missing) }; }

  function resolveWidth(value) {
    const width = clean(value).toLowerCase();
    if (width === "wide") return "1180px";
    if (width === "narrow") return "880px";
    if (width === "normal" || width === "standard") return "1040px";
    if (/^\d+(px|rem|em|%)$/i.test(width)) return width;
    return "";
  }

  function requiredStyleConfig(payload) {
    const profile = obj(payload?.style_profile);
    const colors = getJson(profile, "colors_json");
    const spacing = getJson(profile, "spacing_json");
    const layout = getJson(profile, "layout_json");
    const effects = getJson(profile, "effects_json");
    const typography = getJson(profile, "typography_json");
    const primary = getText(colors, "brand_primary", "");
    const secondary = getText(colors, "brand_secondary", "");
    const surface = getText(colors, "surface", "");
    const text = getText(colors, "text", "");
    const width = resolveWidth(getText(spacing, "page_width", getText(layout, "default_width", "")));
    const missing = [];
    if (!primary || !isHexColor(primary)) missing.push("colors_json.brand_primary");
    if (!secondary || !isHexColor(secondary)) missing.push("colors_json.brand_secondary");
    if (!surface || !isHexColor(surface)) missing.push("colors_json.surface");
    if (!text || !isHexColor(text)) missing.push("colors_json.text");
    if (!width) missing.push("spacing_json.page_width or layout_json.default_width");
    if (missing.length) return styleError("This organization page cannot render because the active organization style profile was not loaded or is incomplete.", missing);

    const density = getText(profile, "density", "normal");
    const cardStyle = getText(profile, "card_style", "standard");
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const headingScale = getText(typography, "heading_scale", "normal");
    const radius = corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px";
    return { ok: true, config: {
      primary,
      secondary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      pageWidth: width,
      radius,
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "hairline" ? `0 1px 0 ${rgba(primary, .14)}` : shadows === "strong" ? `0 24px 70px ${rgba(primary, .28)}` : `0 14px 42px ${rgba(primary, .14)}`,
      density,
      navFontSize: density === "compact" ? "12px" : "13px",
      titleSize: headingScale === "compact" ? "26px" : "30px",
    }};
  }

  function resolvePageWidth(rawValue) {
    const value = clean(rawValue).toLowerCase();
    if (!value) return "";
    if (/^[0-9]+(px|rem|em|vw|%)$/i.test(value)) return clean(rawValue);
    if (value === "wide") return "1180px";
    if (value === "normal" || value === "standard") return "1040px";
    if (value === "narrow") return "880px";
    return clean(rawValue);
  }

  function styleErrorConfig(missing) {
    return {
      isStyleError: true,
      missing: arr(missing).filter(Boolean),
      pageWidth: "1120px"
    };
  }

  function styleConfig(payload) {
    const profile = obj(payload?.style_profile);
    const colors = getJson(profile, "colors_json");
    const spacing = getJson(profile, "spacing_json");
    const layout = getJson(profile, "layout_json");
    const effects = getJson(profile, "effects_json");
    const typography = getJson(profile, "typography_json");

    const missing = [];
    if (!Object.keys(profile).length) missing.push("style_profile");

    const primary = getText(colors, "brand_primary", getText(colors, "primary", ""));
    const secondary = getText(colors, "brand_secondary", getText(colors, "secondary", ""));
    const surface = getText(colors, "surface", "");
    const text = getText(colors, "text", "");
    const widthToken = getText(spacing, "page_width", getText(layout, "default_width", getText(layout, "page_width", "")));

    if (!primary) missing.push("colors_json.brand_primary");
    else if (!isHexColor(primary)) missing.push("colors_json.brand_primary valid hex color");
    if (!secondary) missing.push("colors_json.brand_secondary");
    else if (!isHexColor(secondary)) missing.push("colors_json.brand_secondary valid hex color");
    if (!surface) missing.push("colors_json.surface");
    else if (!isHexColor(surface)) missing.push("colors_json.surface valid hex color");
    if (!text) missing.push("colors_json.text");
    else if (!isHexColor(text)) missing.push("colors_json.text valid hex color");
    if (!widthToken) missing.push("spacing_json.page_width or layout_json.default_width");

    if (missing.length) return styleErrorConfig(missing);

    const density = getText(profile, "density", "normal");
    const cardStyle = getText(profile, "card_style", "standard");
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const headingScale = getText(typography, "heading_scale", "normal");
    return {
      primary,
      secondary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      pageWidth: resolvePageWidth(widthToken),
      radius: corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px",
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "hairline" ? "0 1px 0 rgba(12,38,64,.14)" : shadows === "strong" ? "0 24px 70px rgba(12,38,64,.28)" : "0 14px 42px rgba(12,38,64,.14)",
      density,
      navFontSize: density === "compact" ? "12px" : "13px",
      titleSize: headingScale === "compact" ? "26px" : "30px",
    };
  }

  function styleErrorHtml(config) {
    const missing = arr(config && config.missing).join(", ") || "unknown style fields";
    return `<div style="box-sizing:border-box;max-width:1120px;margin:28px auto;padding:24px 28px;border:6px solid #cc0000;border-radius:18px;background:#fff5f5;color:#b00000;font-family:Arial,Helvetica,sans-serif;box-shadow:0 14px 40px rgba(176,0,0,.18);"><div style="font-size:42px;line-height:1.05;font-weight:950;letter-spacing:-.04em;text-transform:uppercase;">STYLE CONFIGURATION ERROR</div><div style="margin-top:12px;font-size:18px;line-height:1.4;font-weight:800;color:#5b0000;">This organization page cannot render because the active organization style profile was not loaded or is incomplete.</div><div style="margin-top:12px;font-size:15px;line-height:1.4;color:#5b0000;"><strong>Missing:</strong> ${escapeHtml(missing)}</div><div style="margin-top:12px;font-size:13px;line-height:1.4;color:#7a0000;">This is intentional. SyncEtc no longer falls back to a fake/default customer style.</div></div>`;
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


  function requiredStyleErrorHtml(styleResult) {
    const missing = arr(styleResult?.missing);
    return `<div style="box-sizing:border-box;max-width:1180px;margin:24px auto;padding:24px;border:6px solid #ff0000;background:#fff;color:#b00000;font-family:Arial,Helvetica,sans-serif;box-shadow:0 0 0 4px rgba(255,0,0,.18);"><div style="font-size:48px;line-height:1.02;font-weight:950;letter-spacing:-.04em;">STYLE CONFIGURATION ERROR</div><div style="margin-top:12px;font-size:18px;line-height:1.35;font-weight:900;color:#7a0000;">This organization page cannot render because the active organization style profile was not loaded.</div>${missing.length ? `<div style="margin-top:12px;font-size:14px;font-weight:800;color:#7a0000;">Missing or invalid: ${escapeHtml(missing.join(", "))}</div>` : ""}<div style="margin-top:12px;font-size:13px;color:#5f0000;">Version ${escapeHtml(VERSION)}. This is intentional: SyncEtc must not guess customer styling.</div></div>`;
  }

  function neutralHeaderLoadingHtml(config) {
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:${config.pageWidth};margin:12px auto;padding:0 16px;box-sizing:border-box;"><div style="border:1px solid ${config.border};border-radius:${config.radiusLarge};background:${config.surface};padding:14px 16px;color:${config.text};font-weight:900;">Loading organization navigation…</div></div>`;
  }

  function loadScript(src) {
    debugStep("loadScript:start", src);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.getAttribute("data-syncetc-loaded") === "true") {
          debugStep("loadScript:cached", src);
          return resolve();
        }
        if (src === SUPABASE_JS && window.supabase && typeof window.supabase.createClient === "function") {
          existing.setAttribute("data-syncetc-loaded", "true");
          debugStep("loadScript:already-ready", src);
          return resolve();
        }
        debugStep("loadScript:existing-wait", src);
        const cleanup = () => {
          existing.removeEventListener("load", onLoad);
          existing.removeEventListener("error", onError);
        };
        const onLoad = () => { cleanup(); existing.setAttribute("data-syncetc-loaded", "true"); debugStep("loadScript:existing-loaded", src); resolve(); };
        const onError = () => { cleanup(); const error = new Error(`Failed to load existing ${src}`); debugError("loadScript:existing-error", error); reject(error); };
        existing.addEventListener("load", onLoad, { once: true });
        existing.addEventListener("error", onError, { once: true });
        if (src === SUPABASE_JS) {
          waitForSupabaseLibrary(10000).then(() => { cleanup(); existing.setAttribute("data-syncetc-loaded", "true"); resolve(); }).catch(() => { /* keep waiting for load/error */ });
        }
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => { script.setAttribute("data-syncetc-loaded", "true"); debugStep("loadScript:loaded", src); resolve(); };
      script.onerror = () => { const error = new Error(`Failed to load ${src}`); debugError("loadScript:error", error); reject(error); };
      document.head.appendChild(script);
    });
  }

  function waitForSupabaseLibrary(timeoutMs = 10000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.supabase && typeof window.supabase.createClient === "function") return resolve(window.supabase);
        if (Date.now() - started >= timeoutMs) return reject(new Error("Supabase library loaded but createClient is not ready."));
        setTimeout(check, 25);
      };
      check();
    });
  }

  async function ensureSupabase() {
    debugStep("ensureSupabase:start");
    if (supabaseClient) { debugStep("ensureSupabase:cached"); return supabaseClient; }
    if (supabaseClientPromise) { debugStep("ensureSupabase:join-inflight"); return supabaseClientPromise; }

    supabaseClientPromise = (async () => {
      await loadScript(SUPABASE_JS);
      await waitForSupabaseLibrary(10000);
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      debugStep("ensureSupabase:created-client");

      if (!authListenerStarted) {
        authListenerStarted = true;
        supabaseClient.auth.onAuthStateChange((event) => {
          debugStep("authStateChange", event || "unknown");
          if (event === "INITIAL_SESSION") return;
          if (!context || !context.root || !context.root.classList.contains("syncetc-public-shell-ready")) return;
          if (authChangeTimer) clearTimeout(authChangeTimer);
          authChangeTimer = setTimeout(() => {
            refreshOrganizationHeader().catch((error) => debugError("authStateChange:refresh-failed", error));
          }, 50);
        });
      }
      return supabaseClient;
    })().finally(() => { supabaseClientPromise = null; });

    return supabaseClientPromise;
  }

  async function ensureOrganizationHeader() {
    debugStep("ensureOrganizationHeader:start");
    if (window.SyncEtcOrganizationHeader && typeof window.SyncEtcOrganizationHeader.render === "function") { debugStep("ensureOrganizationHeader:cached"); return window.SyncEtcOrganizationHeader; }
    if (!document.querySelector(`script[src="${ORGANIZATION_HEADER_URL}"]`)) await loadScript(ORGANIZATION_HEADER_URL);
    if (!window.SyncEtcOrganizationHeader || typeof window.SyncEtcOrganizationHeader.render !== "function") throw new Error("Shared organization header did not load.");
    debugStep("ensureOrganizationHeader:ready", window.SyncEtcOrganizationHeader.version || "unknown version");
    return window.SyncEtcOrganizationHeader;
  }

  function isPublicNavCandidate(rawItem, computedKey) {
    const item = obj(rawItem);
    const pageKey = key(computedKey || item.page_key || item.key || item.template_key || item.slug || item.label || "");
    const templateCategory = key(item.template_category || item.category || "");
    const accessDefault = key(item.access_default || item.access || item.visibility || "");
    const moduleKey = key(item.module_key || item.module_category || "");
    if (["user-dashboard", "dashboard", "roster", "member-roster", "organization-admin", "admin-dashboard", "organization-people", "people", "access-admin", "platform-access-tools"].includes(pageKey)) return false;
    if (["user", "member", "organization-admin", "customer-admin", "admin", "platform"].includes(templateCategory)) return false;
    if (["user", "member", "organization-admin", "customer-admin", "admin", "platform"].includes(accessDefault)) return false;
    if (["people-access", "roster", "access"].includes(moduleKey) && pageKey !== "contact") return false;
    return true;
  }

  function shellNavItems(payload) {
    const shell = obj(payload?.site_shell);
    const raw = arr(shell.public_nav_items).length ? arr(shell.public_nav_items) : arr(shell.nav_items);
    const items = raw.map((item, index) => {
      const pageKey = key(item.page_key || item.key || item.template_key || item.slug || item.label || "");
      return {
        key: pageKey,
        label: clean(item.label || item.nav_label || item.title || item.template_name || item.page_key || item.key || "Page"),
        href: safeHref(item.href || item.url || item.path || (pageKey === "home" ? "/" : pageKey ? `/${pageKey}` : "#")),
        order: Number(item.order ?? item.sort_order ?? item.nav_order ?? index + 10),
        zone: "public",
        raw: item
      };
    }).filter((item) => item.key && item.href && item.label && isPublicNavCandidate(item.raw, item.key));

    if (!items.some((item) => item.key === "home" || item.href === "/")) items.push({ key: "home", label: "Home", href: "/", order: 0, zone: "public" });
    return items.map(({ raw, ...item }) => item);
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

  function accessCacheIdentity(session, payload) {
    const facts = headerBaseFacts(payload);
    const userKey = clean(session?.user?.id || session?.user?.email || "").toLowerCase();
    const orgKey = clean(facts.orgId || facts.orgKey || "").toLowerCase();
    if (!userKey || !orgKey) return null;
    return {
      key: `syncetc_public_access_context_v2:${userKey}:${orgKey}`,
      userKey,
      orgKey
    };
  }

  function readCachedAccessContext(session, payload) {
    try {
      const identity = accessCacheIdentity(session, payload);
      if (!identity || !window.sessionStorage) return null;
      const raw = window.sessionStorage.getItem(identity.key);
      if (!raw) { debugStep("accessCache:miss", identity.orgKey); return null; }
      const parsed = JSON.parse(raw);
      const ageMs = Date.now() - Number(parsed.saved_at || 0);
      if (parsed.user_key !== identity.userKey || parsed.org_key !== identity.orgKey) {
        debugStep("accessCache:mismatch", identity.orgKey);
        return null;
      }
      if (!parsed.result || ageMs < 0 || ageMs > ACCESS_CONTEXT_CACHE_TTL_MS) {
        debugStep("accessCache:stale", `${identity.orgKey} age ${Math.round(ageMs)}ms`);
        return null;
      }
      debugState.latest.accessStatus = `cached; age ${Math.round(ageMs)}ms`;
      debugStep("accessCache:hit", `${identity.orgKey} age ${Math.round(ageMs)}ms`);
      return parsed.result;
    } catch (error) {
      debugError("accessCache:read_failed", error);
      return null;
    }
  }

  function writeCachedAccessContext(session, payload, result) {
    try {
      const identity = accessCacheIdentity(session, payload);
      if (!identity || !result || !window.sessionStorage) return;
      window.sessionStorage.setItem(identity.key, JSON.stringify({
        saved_at: Date.now(),
        user_key: identity.userKey,
        org_key: identity.orgKey,
        result
      }));
      debugStep("accessCache:write", identity.orgKey);
    } catch (error) {
      debugError("accessCache:write_failed", error);
    }
  }

  function unpackAccessResult(result, payload) {
    if (!result) return { accessRow: null, accessRows: [], platformAdmin: false };
    const accessRows = arr(result.access);
    return {
      accessRow: chooseAccessRow(accessRows, payload),
      accessRows,
      platformAdmin: Boolean(result.platform_admin || result.platform_override)
    };
  }

  async function callAccess(action, payload = {}, tokenOverride = "") {
    debugStep("callAccess:start", action);
    const client = await ensureSupabase();
    let token = clean(tokenOverride);
    if (!token) {
      const session = await getSessionComplete(client);
      token = session?.access_token || "";
    }
    if (!token) { debugStep("callAccess:no-token", action); return null; }
    const accessStartedAt = performance.now();
    const response = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => null);
    debugStep("callAccess:response", `${action} HTTP ${response.status} in ${Math.round(performance.now() - accessStartedAt)}ms`);
    if (!response.ok || !result || result.ok === false) {
      const message = clean(result?.message || result?.error || `HTTP ${response.status}`);
      const errorKey = key(`${result?.error || ""} ${message}`);
      if (errorKey.includes("no-organization") || errorKey.includes("not-linked") || errorKey.includes("no-active") || errorKey.includes("access-denied") || errorKey.includes("not-authorized")) return null;
      throw new Error(message || "Organization access context failed.");
    }
    return result;
  }

  function withTimeout(promise, ms, fallback = null) {
    let timer = null;
    return Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })
    ]).finally(() => { if (timer) clearTimeout(timer); });
  }

  function withFailureTimeout(promise, ms, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || "Operation"} did not complete.`)), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => { if (timer) clearTimeout(timer); });
  }

  async function getSessionComplete(client) {
    if (sessionCheckPromise) {
      debugStep("getSession:join-inflight");
      return sessionCheckPromise;
    }

    sessionCheckPromise = (async () => {
      debugStep("getSession:start");
      const startedAt = performance.now();
      const result = await client.auth.getSession();
      const session = result?.data?.session || null;
      debugState.latest.sessionKnown = session?.user?.email ? `logged in as ${session.user.email}` : "logged out";
      debugStep("getSession:done", `${debugState.latest.sessionKnown} in ${Math.round(performance.now() - startedAt)}ms`);
      return session;
    })().finally(() => { sessionCheckPromise = null; });

    return sessionCheckPromise;
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

  function headerBaseFacts(payload) {
    const org = obj(payload.organization);
    const shell = obj(payload.site_shell);
    const orgId = clean(org.organization_id || shell.organization_id || "");
    const orgKey = clean(org.organization_key || shell.organization_key || "");
    const orgName = clean(shell.organization_name || org.display_name || org.legal_name || orgKey || "Organization");
    const logo = shell.logo || null;
    const publicNavItems = defaultPublicNavIfNeeded(shellNavItems(payload));
    const navigationProfile = payload.navigation_profile || shell.navigation_profile || null;
    const navigationRows = arr(payload.navigation_rows).length ? arr(payload.navigation_rows) : arr(shell.navigation_rows);
    const navigationItems = arr(payload.navigation_items).length ? arr(payload.navigation_items) : arr(shell.navigation_items);
    return { org, shell, orgId, orgKey, orgName, logo, publicNavItems, navigationProfile, navigationRows, navigationItems };
  }

  function headerContext(payload, session, accessRow, accessRows, platformAdmin) {
    const base = headerBaseFacts(payload);
    const caps = obj(obj(accessRow).capabilities);
    const isOrgAdmin = Boolean(obj(accessRow).is_organization_admin || caps.can_view_organization_admin || platformAdmin);
    const canUser = Boolean(obj(accessRow).organization_id || caps.can_view_user_dashboard || isOrgAdmin || platformAdmin);

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

    return {
      authenticated: Boolean(session?.access_token),
      email: session?.user?.email || "",
      organizationName: base.orgName,
      organization: { organization_id: base.orgId, organization_key: base.orgKey, display_name: base.orgName },
      selectedOrganizationId: accessRow?.organization_id || base.orgId,
      organizations: arr(accessRows).map((row) => ({ organization_id: row.organization_id, display_name: row.organization_name, organization_key: row.organization_key })),
      styleProfile: payload.style_profile || accessRow?.style_profile || null,
      logo: base.logo,
      activePageKey: context?.activePageKey || payload?.page?.page_key || "",
      navigationProfile: obj(accessRow).navigation_profile || base.navigationProfile || null,
      navigationRows: arr(obj(accessRow).navigation_rows).length ? arr(obj(accessRow).navigation_rows) : base.navigationRows,
      navigationItems: arr(obj(accessRow).navigation_items).length ? arr(obj(accessRow).navigation_items) : base.navigationItems,
      access: {
        can_view_user_dashboard: canUser,
        can_view_organization_admin: isOrgAdmin,
        is_platform_admin: Boolean(platformAdmin)
      },
      nav: {
        public: base.publicNavItems,
        user: userLinks,
        admin: adminLinks,
        platform: platformLinks
      },
      loginUrl: `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      onLogout: async () => {
        const client = await ensureSupabase();
        await client.auth.signOut();
        try { window.sessionStorage.setItem("syncetc_just_logged_out", "1"); } catch {}
        if (window.location.pathname === "/") window.location.reload();
        else window.location.assign("/");
      },
      onOrganizationChange: () => {}
    };
  }

  async function renderHeaderImmediately(header, target, payload) {
    header.render(target, headerContext(payload, null, null, [], false));
  }

  function revealRoot() {
    if (context && context.root) markRootReady(context.root);
  }

  async function refreshOrganizationHeader() {
    if (headerRefreshPromise) {
      debugStep("refreshHeader:join-inflight");
      return headerRefreshPromise;
    }
    headerRefreshPromise = refreshOrganizationHeaderInner().finally(() => { headerRefreshPromise = null; });
    return headerRefreshPromise;
  }

  async function refreshOrganizationHeaderInner() {
    debugStep("refreshHeader:start");
    if (!context) { debugStep("refreshHeader:no-context"); return; }
    const payload = context.payload || {};
    const target = document.getElementById(HEADER_ID);
    if (!target) return;

    let header = null;
    try {
      header = await ensureOrganizationHeader();
    } catch (error) {
      target.innerHTML = `<div class="syncetc-public-error"><strong>Navigation unavailable.</strong><br>${escapeHtml(error?.message || "Shared header did not load.")}</div>`;
      markRootError(context.root);
      return;
    }

    debugState.latest.page = context?.activePageKey || window.location.pathname;
    debugState.latest.org = clean(payload?.organization?.organization_key || payload?.site_shell?.organization_key || payload?.site_shell?.organization_name || "unknown");
    updateDebugPanel();
    const styleStartedAt = performance.now();
    const styleResult = requiredStyleConfig(payload);
    debugStep("styleConfig:checked", styleResult.ok ? `ok in ${Math.round(performance.now() - styleStartedAt)}ms` : `failed: ${arr(styleResult.missing).join(", ")}`);
    if (!styleResult.ok) {
      target.innerHTML = requiredStyleErrorHtml(styleResult);
      markRootError(context.root);
      return;
    }

    const client = await withFailureTimeout(ensureSupabase(), 10000, "Supabase client initialization");
    const session = await getSessionComplete(client);

    let accessRow = null;
    let accessRows = [];
    let platformAdmin = false;

    const renderFinalHeader = (label = "headerRender", options = {}) => {
      const shouldReveal = options.reveal !== false;
      const started = performance.now();
      debugStep(`${label}:start`);
      header.render(target, headerContext(payload, session, accessRow, accessRows, platformAdmin));
      const tookMs = Math.round(performance.now() - started);
      debugStep(`${label}:done`, `${tookMs}ms`);
      if (shouldReveal) {
        revealRoot();
        debugState.latest.visibleRenderMs = debugElapsed();
        debugStep("root:revealed");
      } else {
        debugState.latest.backgroundRefreshMs = tookMs;
        debugStep(`${label}:silent-update`, `${tookMs}ms`);
      }
      updateDebugPanel();
    };

    if (session?.access_token) {
      const facts = headerBaseFacts(payload);
      const requestPayload = facts.orgId ? { organization_id: facts.orgId } : {};
      const cachedResult = readCachedAccessContext(session, payload);
      if (cachedResult) {
        ({ accessRow, accessRows, platformAdmin } = unpackAccessResult(cachedResult, payload));
        updateDebugPanel();
        renderFinalHeader("headerRender:cached");

        // Refresh the cached context in the background. Backend permission checks still protect every page/action.
        callAccess("get_user_dashboard", requestPayload, session.access_token).then((freshResult) => {
          if (!freshResult) return;
          writeCachedAccessContext(session, payload, freshResult);
          ({ accessRow, accessRows, platformAdmin } = unpackAccessResult(freshResult, payload));
          debugState.latest.accessStatus = "background refreshed"; updateDebugPanel();
          renderFinalHeader("headerRender:background-refresh", { reveal: false });
          if (DEBUG_ENABLED) console.table(debugState.steps.map((s) => ({ ms: s.t, step: s.label, detail: s.detail })));
        }).catch((error) => debugError("accessCache:background_refresh_failed", error));

        if (DEBUG_ENABLED) console.table(debugState.steps.map((s) => ({ ms: s.t, step: s.label, detail: s.detail })));
        return;
      }

      debugState.latest.accessStatus = "starting get_user_dashboard"; updateDebugPanel();
      const accessStartedAt = performance.now();
      const result = await withFailureTimeout(callAccess("get_user_dashboard", requestPayload, session.access_token), 12000, "Organization access context");
      debugState.latest.accessStatus = `done in ${Math.round(performance.now() - accessStartedAt)}ms`; updateDebugPanel();
      if (result) {
        writeCachedAccessContext(session, payload, result);
        ({ accessRow, accessRows, platformAdmin } = unpackAccessResult(result, payload));
      }
    }

    // Render after style + session/access completion. No timer fallback to logged-out state.
    renderFinalHeader("headerRender");
    if (DEBUG_ENABLED) console.table(debugState.steps.map((s) => ({ ms: s.t, step: s.label, detail: s.detail })));
  }

  function render(options) {
    debugStep("render:start", window.location.pathname);
    ensureDebugPanel();
    if (options && options.root) {
      options.root.classList.remove("syncetc-public-shell-ready", "syncetc-public-shell-error");
      options.root.style.visibility = "hidden";
    }
    context = {
      root: options.root,
      payload: options.payload || {},
      activePageKey: options.activePageKey || options.payload?.page?.page_key || "",
      bodyHtml: options.bodyHtml || "",
      beforeBodyHtml: options.beforeBodyHtml || "",
      extraCss: options.extraCss || "",
    };

    debugStep("render:context-built", `activePageKey=${context.activePageKey || ""}`);
    const styleResult = requiredStyleConfig(context.payload);
    if (!styleResult.ok) {
      context.root.innerHTML = requiredStyleErrorHtml(styleResult);
      markRootError(context.root);
      return;
    }
    const config = styleResult.config;
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

    refreshOrganizationHeader().catch((error) => {
      debugError("refreshHeader:failed", error);
      const target = document.getElementById(HEADER_ID);
      if (target) target.innerHTML = `<div class="syncetc-public-error"><strong>Navigation unavailable.</strong><br>${escapeHtml(error?.message || "Unknown header error")}</div>`;
      markRootError(context.root);
    });
  }

  function renderError(root, message, payload) {
    debugStep("renderError:start", message || "");
    if (root) {
      root.classList.remove("syncetc-public-shell-ready");
      root.style.visibility = "hidden";
    }
    const styleResult = requiredStyleConfig(payload || {});
    if (!styleResult.ok) {
      root.innerHTML = requiredStyleErrorHtml(styleResult);
      markRootError(root);
      return;
    }
    const config = styleResult.config;
    root.innerHTML = `<style>${buildCss(config)}</style><div id="${HEADER_ID}"></div><div class="syncetc-public-error"><strong>Unable to load page.</strong><br>${escapeHtml(message || "Unknown error")}</div>`;
    context = { root, payload: payload || {}, activePageKey: "", bodyHtml: "", beforeBodyHtml: "", extraCss: "" };
    refreshOrganizationHeader().catch((error) => {
      debugError("refreshHeader:failed", error);
      const target = document.getElementById(HEADER_ID);
      if (target) target.innerHTML = `<div class="syncetc-public-error"><strong>Navigation unavailable.</strong><br>${escapeHtml(error?.message || "Unknown header error")}</div>`;
      markRootError(root);
    });
  }

  window.SyncEtcPublicShell = {
    version: VERSION,
    render,
    renderError,
    styleConfig,
    escapeHtml,
    safeHref,
    refreshOrganizationHeader,
    diagnostics: debugState,
  };
})();
