(function () {
  "use strict";

  const VERSION = "2026-06-05-002";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-info-page-root, [data-syncetc-page='info']";

  function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function rawText(value) { return String(value ?? "").trim(); }
  function hasText(value) { return cleanText(value).length > 0; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function getJson(source, key) { const value = source && typeof source === "object" ? source[key] : null; return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function getText(source, key, fallback = "") { const value = source && typeof source === "object" ? source[key] : undefined; return typeof value === "string" ? value.trim() : fallback; }
  function getBool(source, key, fallback) { const value = source && typeof source === "object" ? source[key] : undefined; return typeof value === "boolean" ? value : fallback; }
  function safeHref(value, fallback = "#") { if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.safeHref === "function") return window.SyncEtcPublicShell.safeHref(value, fallback); const url = String(value || "").trim(); if (!url) return fallback; if (url.startsWith("/") || url.startsWith("#")) return url; if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url; return fallback; }

  function formatPlainText(value) {
    const safe = escapeHtml(rawText(value));
    return safe.replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  }
  function paragraphHtml(value) { return hasText(value) ? `<p>${formatPlainText(value)}</p>` : ""; }

  function styleConfig(payload) {
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.styleConfig === "function") return window.SyncEtcPublicShell.styleConfig(payload);
    return { primary:"#1f4f82", secondary:"#eef3f8", surface:"#ffffff", text:"#172033", muted:"rgba(23,32,51,.68)", border:"rgba(31,79,130,.16)", softPrimary:"rgba(31,79,130,.08)", radius:"18px", radiusLarge:"26px", shadow:"0 14px 42px rgba(12,38,64,.14)", density:"normal" };
  }

  function buildCss(config) {
    return `
      .syncetc-info-page{color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
      .syncetc-info-page *{box-sizing:border-box;}
      .syncetc-info-shell{background:rgba(255,255,255,.94);border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-info-hero{padding:${config.density === "compact" ? "24px" : "34px"};background:linear-gradient(135deg, ${config.primary}, rgba(47,128,196,.88)), radial-gradient(circle at top right, rgba(255,255,255,.34), transparent 36%);color:#fff;}
      .syncetc-info-eyebrow,.syncetc-info-label{display:inline-flex;align-items:center;margin-bottom:10px;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-info-eyebrow{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:#fff;}
      .syncetc-info-hero h1{margin:0;font-size:clamp(32px,4.8vw,54px);line-height:1.04;font-weight:900;letter-spacing:-.04em;color:#fff;}
      .syncetc-info-hero p{max-width:820px;margin:14px 0 0 0;font-size:17px;line-height:1.65;color:rgba(255,255,255,.9);}
      .syncetc-info-main{padding:${config.density === "compact" ? "18px" : "26px"};display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.95fr);gap:${config.density === "compact" ? "16px" : "22px"};align-items:start;}
      .syncetc-info-column{display:grid;gap:${config.density === "compact" ? "16px" : "22px"};}
      .syncetc-info-card,.syncetc-info-note{border-radius:${config.radius};background:rgba(255,255,255,.86);border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};padding:${config.density === "compact" ? "18px" : "22px"};}
      .syncetc-info-card.is-tinted{background:linear-gradient(135deg, rgba(255,255,255,.92), ${config.secondary});}
      .syncetc-info-card.is-gradient{background:linear-gradient(135deg, ${config.secondary}, rgba(255,255,255,.92));}
      .syncetc-info-label{background:${config.secondary};color:${config.primary};}
      .syncetc-info-card h2{margin:0 0 10px 0;color:${config.primary};font-size:26px;line-height:1.15;font-weight:900;letter-spacing:-.025em;}
      .syncetc-info-card p{margin:0;font-size:15px;line-height:1.7;color:${config.text};}
      .syncetc-info-officers{display:grid;gap:10px;margin-top:14px;}
      .syncetc-info-officer{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 13px;border-radius:${config.radius};background:rgba(255,255,255,.72);border:1px solid ${config.border};}
      .syncetc-info-officer strong{display:block;color:${config.primary};font-size:14px;line-height:1.25;}
      .syncetc-info-officer span{display:block;color:${config.muted};font-size:13px;line-height:1.35;margin-top:2px;}
      .syncetc-info-faq-list{display:grid;gap:10px;margin-top:14px;}
      .syncetc-info-faq-item{border:1px solid ${config.border};border-radius:${config.radius};background:rgba(255,255,255,.86);overflow:hidden;}
      .syncetc-info-faq-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:0;background:transparent;color:${config.primary};font-size:15px;font-weight:900;text-align:left;cursor:pointer;}
      .syncetc-info-faq-button:hover{background:${config.softPrimary};}
      .syncetc-info-faq-icon{font-size:18px;line-height:1;transition:transform 160ms ease;}
      .syncetc-info-faq-item.is-open .syncetc-info-faq-icon{transform:rotate(45deg);}
      .syncetc-info-faq-answer{display:none;padding:0 16px 16px;color:${config.text};font-size:14px;line-height:1.65;}
      .syncetc-info-faq-item.is-open .syncetc-info-faq-answer{display:block;}
      .syncetc-info-faq-category{display:inline-flex;margin:0 0 8px 16px;padding:4px 9px;border-radius:999px;background:${config.secondary};color:${config.primary};font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-info-button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;margin-top:16px;padding:10px 16px;border-radius:999px;background:${config.primary};color:#fff!important;text-decoration:none;font-size:13px;font-weight:900;box-shadow:0 8px 18px rgba(12,38,64,.18);}
      .syncetc-info-button:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(12,38,64,.22);}
      .syncetc-info-note{margin:0 ${config.density === "compact" ? "18px" : "26px"} ${config.density === "compact" ? "18px" : "26px"};color:${config.muted};font-size:13px;line-height:1.55;}
      .syncetc-info-empty{padding:16px;border-radius:${config.radius};background:rgba(255,255,255,.82);border:1px dashed ${config.border};color:${config.muted};font-size:14px;line-height:1.5;}
      @media(max-width:900px){.syncetc-info-main{grid-template-columns:1fr;}.syncetc-info-note{margin-left:18px;margin-right:18px;}}
      @media(max-width:640px){.syncetc-info-hero{padding:26px 20px}.syncetc-info-main{padding:18px}.syncetc-info-card{padding:18px}.syncetc-info-hero h1{font-size:34px}}
    `;
  }

  function getParts(payload) {
    const settings = payload?.page_settings || {};
    return {
      content: getJson(settings, "content_json"),
      options: getJson(settings, "options_json"),
      title: getText(settings, "title", payload?.page?.nav_label || "Info"),
    };
  }

  function heroHtml(content, fallbackTitle) {
    const eyebrow = getText(content, "hero_eyebrow");
    const title = getText(content, "hero_title", fallbackTitle);
    const intro = getText(content, "hero_intro");
    if (!hasText(eyebrow) && !hasText(title) && !hasText(intro)) return "";
    return `<section class="syncetc-info-hero">${eyebrow ? `<div class="syncetc-info-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}${title ? `<h1>${escapeHtml(title)}</h1>` : ""}${paragraphHtml(intro)}</section>`;
  }

  function infoCard(label, title, body, className = "") {
    if (!hasText(label) && !hasText(title) && !hasText(body)) return "";
    return `<article class="syncetc-info-card ${className}">${label ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${paragraphHtml(body)}</article>`;
  }

  function parseManualOfficers(value) {
    const raw = rawText(value);
    if (!raw) return [];

    // Preferred temporary admin format: one row per line, "Role | Name".
    // JSON from older test records is still accepted, but public emails are intentionally ignored.
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((row) => ({
          officer_title: cleanText(row.title || row.officer_title || row.role || ""),
          display_name: cleanText(row.name || row.display_name || ""),
        })).filter((row) => row.display_name || row.officer_title);
      }
    } catch {}

    return raw.split(/\r?\n/).map((line) => {
      const parts = line.split("|").map(cleanText).filter(Boolean);
      if (!parts.length) return null;
      return {
        officer_title: parts[0] || "Officer",
        display_name: parts.slice(1).join(" | ") || "",
      };
    }).filter((row) => row && (row.display_name || row.officer_title));
  }

  function officerRows(payload, content) {
    const mode = getText(content, "officer_source_mode", "dynamic") || "dynamic";
    const dynamicRows = Array.isArray(payload.officers) ? payload.officers : [];
    const manualRows = parseManualOfficers(content.manual_officers_json);
    if (mode === "manual") return manualRows;
    if (mode === "hybrid") return [...dynamicRows, ...manualRows];
    return dynamicRows;
  }

  function officersHtml(payload, content, options) {
    if (!getBool(options, "show_board_card", true)) return "";
    const label = getText(content, "board_label", "Leadership");
    const title = getText(content, "board_title", "Board / Officers");
    const intro = getText(content, "board_intro");
    const rows = officerRows(payload, content);
    if (!hasText(label) && !hasText(title) && !hasText(intro) && !rows.length) return "";
    return `<article class="syncetc-info-card is-gradient">${label ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${paragraphHtml(intro)}${rows.length ? `<div class="syncetc-info-officers">${rows.map((row) => `<div class="syncetc-info-officer"><div><strong>${escapeHtml(row.officer_title || row.role_label || "Officer")}</strong><span>${escapeHtml(row.display_name || "")}</span></div></div>`).join("")}</div>` : ""}</article>`;
  }

  function faqHtml(payload, content, options) {
    const items = Array.isArray(payload.faq_items) ? payload.faq_items : [];
    const label = getText(content, "faq_label", "FAQ");
    const title = getText(content, "faq_title", "Frequently Asked Questions");
    const intro = getText(content, "faq_intro");
    const showCategories = getBool(options, "show_faq_categories", true);
    return `<article class="syncetc-info-card"><div class="syncetc-info-label">${escapeHtml(label || "FAQ")}</div>${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${paragraphHtml(intro)}${items.length ? `<div class="syncetc-info-faq-list">${items.map((item, index) => `<div class="syncetc-info-faq-item"><button type="button" class="syncetc-info-faq-button" aria-expanded="false"><span>${escapeHtml(item.question || "Question")}</span><span class="syncetc-info-faq-icon">+</span></button>${showCategories && item.category_label ? `<div class="syncetc-info-faq-category">${escapeHtml(item.category_label)}</div>` : ""}<div class="syncetc-info-faq-answer">${paragraphHtml(item.answer || "")}</div></div>`).join("")}</div>` : `<div class="syncetc-info-empty">FAQ items are not currently available.</div>`}</article>`;
  }

  function contactHtml(content, options) {
    if (!getBool(options, "show_contact_card", true)) return "";
    const label = getText(content, "contact_label", "Questions");
    const title = getText(content, "contact_title", "Need more information?");
    const body = getText(content, "contact_body");
    const ctaLabel = getText(content, "contact_cta_label", "Contact Us");
    const ctaUrl = safeHref(getText(content, "contact_cta_url", "/home#contact-board"), "#");
    if (!hasText(label) && !hasText(title) && !hasText(body) && !hasText(ctaLabel)) return "";
    return `<article class="syncetc-info-card is-tinted">${label ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${paragraphHtml(body)}${ctaLabel ? `<a class="syncetc-info-button" href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaLabel)}</a>` : ""}</article>`;
  }

  function pageHtml(payload) {
    const parts = getParts(payload);
    const c = parts.content;
    const o = parts.options;
    const leftCards = [
      getBool(o, "show_history_card", true) ? infoCard(getText(c,"history_label","Overview"), getText(c,"history_title","About Us"), getText(c,"history_body"), "is-tinted") : "",
      getBool(o, "show_membership_card", true) ? infoCard(getText(c,"membership_label","Membership"), getText(c,"membership_title","Membership Information"), getText(c,"membership_body")) : "",
      officersHtml(payload, c, o),
    ].filter(Boolean).join("");
    const rightCards = [faqHtml(payload, c, o), contactHtml(c, o)].filter(Boolean).join("");
    const noteBody = getText(c, "note_body");
    const note = getBool(o, "show_note_strip", true) && hasText(noteBody) ? `<div class="syncetc-info-note"><strong>Note:</strong> ${formatPlainText(noteBody)}</div>` : "";
    return `<section class="syncetc-info-page" data-syncetc-page-version="${VERSION}"><div class="syncetc-info-shell">${heroHtml(c, parts.title)}<main class="syncetc-info-main"><div class="syncetc-info-column">${leftCards || `<div class="syncetc-info-empty">Information is not currently available.</div>`}</div><div class="syncetc-info-column">${rightCards}</div></main>${note}</div></section>`;
  }

  function bindAccordions(root) {
    root.querySelectorAll(".syncetc-info-faq-button").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".syncetc-info-faq-item");
        if (!item) return;
        const list = item.closest(".syncetc-info-faq-list");
        const willOpen = !item.classList.contains("is-open");
        if (list) list.querySelectorAll(".syncetc-info-faq-item").forEach((other) => { other.classList.remove("is-open"); other.querySelector(".syncetc-info-faq-button")?.setAttribute("aria-expanded", "false"); });
        item.classList.toggle("is-open", willOpen);
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    });
  }

  function renderPayload(root, payload) {
    const config = styleConfig(payload);
    const bodyHtml = pageHtml(payload);
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
      window.SyncEtcPublicShell.render({ root, payload, activePageKey: payload?.page?.page_key || "info", extraCss: buildCss(config), bodyHtml });
    } else {
      root.innerHTML = `<style>${buildCss(config)}</style>${bodyHtml}`;
    }
    bindAccordions(root);
  }

  function renderMessage(root, message, mode) {
    const isDebug = mode === "debug";
    const style = isDebug ? "max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid #ffb4b4;border-radius:16px;background:#fff4f4;color:#8a1f1f;font-family:Arial,Helvetica,sans-serif;" : "max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid rgba(18,54,90,.14);border-radius:16px;background:#fff;color:#5d6b78;font-family:Arial,Helvetica,sans-serif;";
    root.innerHTML = `<div style="${style}">${escapeHtml(message || "Information is not available at this time.")}</div>`;
  }
  function renderLoading(root) { root.innerHTML = `<div style="max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid rgba(18,54,90,.14);border-radius:16px;background:#fff;color:#5d6b78;font-family:Arial,Helvetica,sans-serif;">Loading information...</div>`; }

  async function fetchPayload(root) {
    const organizationKey = cleanText(root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key"));
    const pageKey = cleanText(root.getAttribute("data-page-key") || "info") || "info";
    const siteKey = cleanText(root.getAttribute("data-site-key") || "primary") || "primary";
    const renderMode = cleanText(root.getAttribute("data-render-mode") || "public") || "public";
    const edgeUrl = cleanText(root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL) || DEFAULT_EDGE_URL;
    if (!organizationKey) { renderMessage(root, "Info renderer is missing data-organization-key.", renderMode); return; }
    renderLoading(root);
    const response = await fetch(edgeUrl, { method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify({ action: "get_info_page", organization_key: organizationKey, site_key: siteKey, page_key: pageKey, render_mode: renderMode }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) { renderMessage(root, payload?.message || payload?.error || "Information is not available at this time.", renderMode); return; }
    renderPayload(root, payload);
  }
  function boot() { Array.from(document.querySelectorAll(ROOT_SELECTOR)).forEach((root) => fetchPayload(root).catch((error) => { console.error("SyncEtc Info renderer failed", error); renderMessage(root, error instanceof Error ? error.message : String(error), cleanText(root.getAttribute("data-render-mode") || "public")); })); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
