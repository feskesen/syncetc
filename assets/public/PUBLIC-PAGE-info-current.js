(function () {
  "use strict";

  const VERSION = "2026-06-05-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-info-page-root";

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

  function getBool(source, key, fallback = false) {
    const value = source && typeof source === "object" ? source[key] : undefined;
    return typeof value === "boolean" ? value : fallback;
  }

  function safeHref(value, fallback = "#") {
    const url = String(value || "").trim();
    if (!url) return fallback;
    if (url.startsWith("/") || url.startsWith("#")) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return fallback;
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

  function styleConfig(payload) {
    const profile = payload?.style_profile || {};
    const colors = getJson(profile, "colors_json");
    const spacing = getJson(profile, "spacing_json");
    const layout = getJson(profile, "layout_json");
    const effects = getJson(profile, "effects_json");
    const media = getJson(profile, "media_json");
    const typography = getJson(profile, "typography_json");

    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const gradients = getText(effects, "gradients", "subtle");
    const cardStyle = getText(profile, "card_style", "standard");
    const heroStyle = getText(profile, "hero_style", "standard");
    const sectionSpacing = getText(spacing, "section_spacing", "normal");
    const cardPadding = getText(spacing, "card_padding", "normal");
    const headingScale = getText(typography, "heading_scale", "normal");

    return {
      primary,
      secondary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      leftTone: rgba(primary, 0.07),
      rightTone: rgba(primary, 0.12),
      heroGradient: gradients === "none" ? primary : `linear-gradient(135deg, ${primary}, ${rgba(primary, 0.84)} 64%, ${rgba(primary, 0.64)})`,
      radius: corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px",
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "hairline" ? "0 1px 0 rgba(12,38,64,.14)" : shadows === "strong" ? "0 24px 70px rgba(12,38,64,.28)" : "0 14px 42px rgba(12,38,64,.14)",
      heroPadding: heroStyle === "dashboard" || heroStyle === "compact" ? "24px" : heroStyle === "bold" ? "38px" : "32px",
      cardPadding: cardPadding === "generous" ? "28px" : cardPadding === "compact" ? "16px" : "22px",
      sectionGap: sectionSpacing === "generous" ? "26px" : sectionSpacing === "compact" ? "14px" : "20px",
      headingSize: headingScale === "compact" ? "clamp(28px, 4vw, 42px)" : "clamp(32px, 4vw, 50px)",
    };
  }

  function formatPlainText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.split(/\n{2,}/).map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function buildCss(config) {
    return `
      .syncetc-info-page{width:100%;margin:0;padding:0;color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
      .syncetc-info-page *{box-sizing:border-box;}
      .syncetc-info-shell{background:${rgba(config.surface, 0.94)};border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-info-hero{padding:${config.heroPadding};background:${config.heroGradient};color:#fff;}
      .syncetc-info-eyebrow,.syncetc-info-label{display:inline-flex;align-items:center;margin-bottom:10px;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-info-eyebrow{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:#fff;}
      .syncetc-info-hero h1{margin:0;font-size:${config.headingSize};line-height:1.05;font-weight:900;letter-spacing:-.035em;}
      .syncetc-info-hero p{max-width:840px;margin:14px 0 0 0;font-size:17px;line-height:1.65;color:rgba(255,255,255,.9);}
      .syncetc-info-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px;}
      .syncetc-info-stat{padding:14px 16px;border-radius:${config.radius};background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);}
      .syncetc-info-stat strong{display:block;margin-bottom:4px;font-size:21px;line-height:1;color:#fff;}
      .syncetc-info-stat span{display:block;font-size:13px;line-height:1.38;color:rgba(255,255,255,.84);}
      .syncetc-info-main{padding:${config.cardPadding};display:grid;gap:${config.sectionGap};}
      .syncetc-info-two-col{display:grid;grid-template-columns:minmax(0,.95fr) minmax(340px,1.05fr);gap:${config.sectionGap};align-items:start;}
      .syncetc-info-column{display:grid;gap:${config.sectionGap};padding:${config.cardPadding};border-radius:${config.radiusLarge};border:1px solid ${config.border};}
      .syncetc-info-left{background:linear-gradient(180deg, ${config.leftTone}, ${rgba(config.surface,.92)});}
      .syncetc-info-right{background:linear-gradient(180deg, ${config.rightTone}, ${rgba(config.surface,.94)});}
      .syncetc-info-card,.syncetc-info-note,.syncetc-info-empty{border-radius:${config.radius};background:${rgba(config.surface, 0.9)};border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};padding:${config.cardPadding};}
      .syncetc-info-label{background:${config.secondary};color:${config.primary};}
      .syncetc-info-card h2,.syncetc-info-section-title{margin:0 0 10px 0;color:${config.primary};font-size:24px;line-height:1.18;font-weight:900;letter-spacing:-.02em;}
      .syncetc-info-card p{margin:0 0 12px 0;font-size:15px;line-height:1.7;color:${config.text};}
      .syncetc-info-card p:last-child{margin-bottom:0;}
      .syncetc-info-officers{display:grid;gap:10px;margin-top:12px;}
      .syncetc-info-officer{padding:11px 13px;border-radius:${config.radius};background:${rgba(config.secondary,.56)};border:1px solid ${config.border};}
      .syncetc-info-officer-title{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:${config.muted};}
      .syncetc-info-officer-name{margin-top:3px;color:${config.primary};font-size:16px;font-weight:900;line-height:1.25;}
      .syncetc-info-officer-note{margin-top:4px;color:${config.muted};font-size:13px;line-height:1.45;}
      .syncetc-info-button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:999px;background:${config.primary};color:#fff!important;text-decoration:none;font-size:13px;font-weight:900;box-shadow:${config.shadow === "none" ? "none" : "0 8px 18px rgba(12,38,64,.16)"};}
      .syncetc-info-button:hover{transform:translateY(-1px);}
      .syncetc-info-faq-head{margin-bottom:14px;}
      .syncetc-info-faq-category{margin:18px 0 8px 0;color:${config.primary};font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-info-faq-list{display:grid;gap:10px;}
      .syncetc-info-faq-item{border-radius:${config.radius};background:${rgba(config.surface,.94)};border:1px solid ${config.border};overflow:hidden;box-shadow:${config.shadow === "none" ? "none" : "0 5px 16px rgba(12,38,64,.06)"};}
      .syncetc-info-faq-question{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;background:transparent;color:${config.primary};font-size:15px;font-weight:900;text-align:left;cursor:pointer;}
      .syncetc-info-faq-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:${config.softPrimary};font-weight:900;flex:0 0 auto;transition:transform 160ms ease;}
      .syncetc-info-faq-item.is-open .syncetc-info-faq-icon{transform:rotate(45deg);}
      .syncetc-info-faq-answer{display:none;padding:0 16px 16px 16px;color:${config.text};font-size:14px;line-height:1.65;}
      .syncetc-info-faq-answer p{margin:0 0 10px 0;}
      .syncetc-info-faq-answer p:last-child{margin-bottom:0;}
      .syncetc-info-faq-item.is-open .syncetc-info-faq-answer{display:block;}
      .syncetc-info-note,.syncetc-info-empty{color:${config.muted};font-size:14px;line-height:1.55;}
      .syncetc-info-note strong{color:${config.primary};}
      @media(max-width:900px){.syncetc-info-two-col{grid-template-columns:1fr}.syncetc-info-stats{grid-template-columns:1fr}.syncetc-info-column{padding:18px}}
      @media(max-width:720px){.syncetc-info-hero{padding:24px 20px}.syncetc-info-main{padding:18px}.syncetc-info-card{padding:18px}.syncetc-info-column{padding:14px}}
    `;
  }

  function getPageParts(payload) {
    const settings = payload?.page_settings || {};
    return {
      content: getJson(settings, "content_json"),
      labels: getJson(settings, "labels_json"),
      options: getJson(settings, "options_json"),
      visibility: getJson(settings, "visibility_json"),
    };
  }

  function statCards(content, options) {
    if (!getBool(options, "show_hero_stats", true)) return "";
    const cards = [1, 2, 3].map((i) => ({ label: getText(content, `stat_${i}_label`), text: getText(content, `stat_${i}_text`) }))
      .filter((card) => hasText(card.label) || hasText(card.text));
    if (!cards.length) return "";
    return `<div class="syncetc-info-stats">${cards.map((card) => `<div class="syncetc-info-stat">${hasText(card.label) ? `<strong>${escapeHtml(card.label)}</strong>` : ""}${hasText(card.text) ? `<span>${escapeHtml(card.text)}</span>` : ""}</div>`).join("")}</div>`;
  }

  function cardHtml(label, title, body) {
    if (!hasText(label) && !hasText(title) && !hasText(body)) return "";
    return `<section class="syncetc-info-card">
      ${hasText(label) ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(body) ? formatPlainText(body) : ""}
    </section>`;
  }

  function heroHtml(content, options) {
    const eyebrow = getText(content, "hero_eyebrow");
    const title = getText(content, "hero_title");
    const intro = getText(content, "hero_intro");
    const stats = statCards(content, options);
    if (!hasText(eyebrow) && !hasText(title) && !hasText(intro) && !stats) return "";
    return `<section class="syncetc-info-hero">
      ${hasText(eyebrow) ? `<div class="syncetc-info-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      ${hasText(title) ? `<h1>${escapeHtml(title)}</h1>` : ""}
      ${hasText(intro) ? formatPlainText(intro) : ""}
      ${stats}
    </section>`;
  }

  function officersHtml(content, options, officers) {
    if (!getBool(options, "show_officers_card", true)) return "";
    const label = getText(content, "officers_label");
    const title = getText(content, "officers_title");
    const intro = getText(content, "officers_intro");
    const rows = Array.isArray(officers) ? officers : [];
    if (!hasText(label) && !hasText(title) && !hasText(intro) && !rows.length) return "";
    return `<section class="syncetc-info-card">
      ${hasText(label) ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(intro) ? formatPlainText(intro) : ""}
      ${rows.length ? `<div class="syncetc-info-officers">${rows.map((row) => `<div class="syncetc-info-officer">
        ${hasText(row.officer_title) ? `<div class="syncetc-info-officer-title">${escapeHtml(row.officer_title)}</div>` : ""}
        ${hasText(row.display_name) ? `<div class="syncetc-info-officer-name">${escapeHtml(row.display_name)}</div>` : ""}
        ${hasText(row.note) ? `<div class="syncetc-info-officer-note">${escapeHtml(row.note)}</div>` : ""}
      </div>`).join("")}</div>` : ""}
    </section>`;
  }

  function faqHtml(content, options, faqItems) {
    if (!getBool(options, "show_faq_section", true)) return "";
    const label = getText(content, "faq_label");
    const title = getText(content, "faq_title");
    const intro = getText(content, "faq_intro");
    const empty = getText(content, "faq_empty_message", "FAQs are not currently available.");
    const rows = Array.isArray(faqItems) ? faqItems : [];
    const showCategories = getBool(options, "show_faq_categories", true);
    const groups = new Map();

    rows.forEach((item) => {
      const category = showCategories && hasText(item.category) ? cleanText(item.category) : "";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });

    let listHtml = "";
    if (rows.length) {
      groups.forEach((items, category) => {
        listHtml += `${hasText(category) ? `<div class="syncetc-info-faq-category">${escapeHtml(category)}</div>` : ""}<div class="syncetc-info-faq-list">${items.map((item, index) => `<article class="syncetc-info-faq-item" data-syncetc-faq-item>
          <button class="syncetc-info-faq-question" type="button" aria-expanded="false">
            <span>${escapeHtml(item.question || "Question")}</span><span class="syncetc-info-faq-icon" aria-hidden="true">+</span>
          </button>
          <div class="syncetc-info-faq-answer">${formatPlainText(item.answer || "")}</div>
        </article>`).join("")}</div>`;
      });
    } else if (hasText(empty)) {
      listHtml = `<div class="syncetc-info-empty">${escapeHtml(empty)}</div>`;
    }

    if (!hasText(label) && !hasText(title) && !hasText(intro) && !listHtml) return "";
    return `<section class="syncetc-info-card syncetc-info-faq-section">
      <div class="syncetc-info-faq-head">
        ${hasText(label) ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}
        ${hasText(title) ? `<h2 class="syncetc-info-section-title">${escapeHtml(title)}</h2>` : ""}
        ${hasText(intro) ? formatPlainText(intro) : ""}
      </div>
      ${listHtml}
    </section>`;
  }

  function contactHtml(content, options) {
    if (!getBool(options, "show_contact_card", true)) return "";
    const label = getText(content, "contact_label");
    const title = getText(content, "contact_title");
    const intro = getText(content, "contact_intro");
    const buttonLabel = getText(content, "contact_button_label");
    const buttonUrl = getText(content, "contact_button_url");
    if (!hasText(label) && !hasText(title) && !hasText(intro) && !hasText(buttonLabel)) return "";
    return `<section class="syncetc-info-card">
      ${hasText(label) ? `<div class="syncetc-info-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(intro) ? formatPlainText(intro) : ""}
      ${hasText(buttonLabel) ? `<p><a class="syncetc-info-button" href="${escapeHtml(safeHref(buttonUrl, "/home#contact-board"))}">${escapeHtml(buttonLabel)}</a></p>` : ""}
    </section>`;
  }

  function buildBody(payload) {
    const { content, options } = getPageParts(payload);
    const leftCards = [
      getBool(options, "show_history_card", true) ? cardHtml(getText(content, "history_label"), getText(content, "history_title"), getText(content, "history_body")) : "",
      getBool(options, "show_membership_card", true) ? cardHtml(getText(content, "membership_label"), getText(content, "membership_title"), getText(content, "membership_body")) : "",
      officersHtml(content, options, payload.officers || []),
      contactHtml(content, options),
    ].filter(Boolean).join("");

    const rightCards = [faqHtml(content, options, payload.faq_items || [])].filter(Boolean).join("");
    const noteBody = getText(content, "note_body");

    return `<div class="syncetc-info-page">
      <div class="syncetc-info-shell">
        ${heroHtml(content, options)}
        <main class="syncetc-info-main">
          <section class="syncetc-info-two-col">
            <div class="syncetc-info-column syncetc-info-left">${leftCards || `<div class="syncetc-info-empty">Information is not currently available.</div>`}</div>
            <div class="syncetc-info-column syncetc-info-right">${rightCards || `<div class="syncetc-info-empty">FAQs are not currently available.</div>`}</div>
          </section>
          ${getBool(options, "show_note_strip", true) && hasText(noteBody) ? `<div class="syncetc-info-note"><strong>Note:</strong> ${formatPlainText(noteBody)}</div>` : ""}
        </main>
      </div>
    </div>`;
  }

  function bindInteractions(root) {
    root.querySelectorAll("[data-syncetc-faq-item]").forEach((item) => {
      const button = item.querySelector(".syncetc-info-faq-question");
      if (!button) return;
      button.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");
        root.querySelectorAll("[data-syncetc-faq-item]").forEach((other) => {
          other.classList.remove("is-open");
          const otherButton = other.querySelector(".syncetc-info-faq-question");
          if (otherButton) otherButton.setAttribute("aria-expanded", "false");
        });
        if (!isOpen) {
          item.classList.add("is-open");
          button.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  async function fetchPayload(root) {
    const edgeUrl = root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL;
    const organizationKey = root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key") || "test-customer-1";
    const pageKey = root.getAttribute("data-page-key") || "info";
    const siteKey = root.getAttribute("data-site-key") || "primary";
    const renderMode = root.getAttribute("data-render-mode") || "public";

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: "get_info_page", organization_key: organizationKey, customer_key: organizationKey, site_key: siteKey, page_key: pageKey, render_mode: renderMode }),
    });

    const result = await response.json().catch(() => ({ ok: false, error: "invalid_json", message: "The public renderer returned invalid JSON." }));
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `HTTP ${response.status}`);
    return result;
  }

  async function initOne(root) {
    try {
      root.innerHTML = `<div style="font-family:Arial,Helvetica,sans-serif;padding:18px;">Loading info...</div>`;
      const payload = await fetchPayload(root);
      const config = styleConfig(payload);
      const bodyHtml = buildBody(payload);
      const extraCss = buildCss(config);
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
        window.SyncEtcPublicShell.render({ root, payload, activePageKey: payload?.page?.page_key || "info", bodyHtml, extraCss });
      } else {
        root.innerHTML = `<style>${extraCss}</style>${bodyHtml}`;
      }
      bindInteractions(root);
    } catch (error) {
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.renderError === "function") {
        window.SyncEtcPublicShell.renderError(root, error instanceof Error ? error.message : String(error));
      } else {
        root.innerHTML = `<div style="font-family:Arial,Helvetica,sans-serif;margin:24px;padding:18px;border:1px solid #ffb4b4;border-radius:12px;background:#fff4f4;color:#8a1f1f;"><strong>Unable to load Info.</strong><br>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
      }
    }
  }

  function init() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(initOne);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
