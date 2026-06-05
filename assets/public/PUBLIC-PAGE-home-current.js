(function () {
  "use strict";

  const VERSION = "2026-06-05-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-home-page-root, [data-syncetc-page='home']";

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function rawText(value) {
    return String(value ?? "").trim();
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

  function formatPlainText(value) {
    const safe = escapeHtml(rawText(value));
    return safe
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  function paragraphHtml(value) {
    if (!hasText(value)) return "";
    return `<p>${formatPlainText(value)}</p>`;
  }

  function getJson(source, key) {
    const value = source && typeof source === "object" ? source[key] : null;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getText(source, key, fallback = "") {
    const value = source && typeof source === "object" ? source[key] : undefined;
    return typeof value === "string" ? value.trim() : fallback;
  }

  function getBool(source, key, fallback) {
    const value = source && typeof source === "object" ? source[key] : undefined;
    return typeof value === "boolean" ? value : fallback;
  }

  function safeHref(value, fallback = "#") {
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.safeHref === "function") {
      return window.SyncEtcPublicShell.safeHref(value, fallback);
    }
    const url = String(value || "").trim();
    if (!url) return fallback;
    if (url.startsWith("/") || url.startsWith("#")) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return fallback;
  }

  function styleConfig(payload) {
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.styleConfig === "function") {
      return window.SyncEtcPublicShell.styleConfig(payload);
    }
    return {
      primary: "#1f4f82",
      secondary: "#eef3f8",
      surface: "#ffffff",
      text: "#172033",
      muted: "rgba(23,32,51,.68)",
      border: "rgba(31,79,130,.16)",
      softPrimary: "rgba(31,79,130,.08)",
      pageWidth: "1040px",
      radius: "18px",
      radiusLarge: "26px",
      shadow: "0 14px 42px rgba(12,38,64,.14)",
      density: "normal",
    };
  }

  function getPageParts(payload) {
    const settings = payload?.page_settings || {};
    return {
      content: getJson(settings, "content_json"),
      labels: getJson(settings, "labels_json"),
      options: getJson(settings, "options_json"),
      visibility: getJson(settings, "visibility_json"),
      title: getText(settings, "title", payload?.page?.nav_label || "Home"),
    };
  }

  function getFeature(parts, key, fallback) {
    const features = getJson(parts.visibility, "features");
    if (typeof parts.options[key] === "boolean") return parts.options[key];
    if (typeof features[key] === "boolean") return features[key];
    return fallback;
  }

  function buildCss(config) {
    return `
      .syncetc-home-page{color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
      .syncetc-home-page *{box-sizing:border-box;}
      .syncetc-home-shell{background:rgba(255,255,255,.94);border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-home-hero{padding:${config.density === "compact" ? "24px" : "34px"};background:linear-gradient(135deg, ${config.primary}, rgba(47,128,196,.88)), radial-gradient(circle at top right, rgba(255,255,255,.34), transparent 36%);color:#fff;}
      .syncetc-home-eyebrow,.syncetc-home-section-label{display:inline-flex;align-items:center;margin-bottom:10px;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-home-eyebrow{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:#fff;}
      .syncetc-home-hero h1{margin:0;font-size:clamp(34px,5vw,58px);line-height:1.04;font-weight:900;letter-spacing:-.04em;color:#fff;}
      .syncetc-home-hero p{max-width:820px;margin:14px 0 0 0;font-size:17px;line-height:1.65;color:rgba(255,255,255,.9);}
      .syncetc-home-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:26px;}
      .syncetc-home-stat{padding:14px 16px;border-radius:${config.radius};background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);}
      .syncetc-home-stat strong{display:block;margin-bottom:4px;font-size:22px;line-height:1;color:#fff;}
      .syncetc-home-stat span{display:block;font-size:13px;line-height:1.38;color:rgba(255,255,255,.84);}
      .syncetc-home-main{padding:${config.density === "compact" ? "18px" : "26px"};display:grid;gap:${config.density === "compact" ? "16px" : "22px"};}
      .syncetc-home-card,.syncetc-featured-card,.syncetc-home-note{border-radius:${config.radius};background:rgba(255,255,255,.86);border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};}
      .syncetc-featured-card,.syncetc-home-card{padding:${config.density === "compact" ? "18px" : "22px"};}
      .syncetc-home-section-label{background:${config.secondary};color:${config.primary};}
      .syncetc-featured-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:start;margin-bottom:18px;}
      .syncetc-home-card h2,.syncetc-featured-header h2{margin:0 0 10px 0;color:${config.primary};font-size:28px;line-height:1.12;font-weight:900;letter-spacing:-.025em;}
      .syncetc-home-card p,.syncetc-featured-header p{margin:0;font-size:15px;line-height:1.7;color:${config.text};}
      .syncetc-home-button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border-radius:999px;background:${config.primary};color:#fff!important;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 18px rgba(12,38,64,.18);text-decoration:none;font-size:13px;font-weight:900;line-height:1.1;cursor:pointer;transition:transform 180ms ease, box-shadow 180ms ease, background 180ms ease;}
      .syncetc-home-button:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(12,38,64,.22);}
      .syncetc-home-button.secondary{background:#fff;color:${config.primary}!important;border:1px solid ${config.border};box-shadow:none;white-space:nowrap;}
      .syncetc-featured-slot{width:100%;min-height:320px;max-height:58vh;display:flex;align-items:center;justify-content:center;padding:14px;background:linear-gradient(180deg, rgba(234,245,255,.92), rgba(255,255,255,.86));border:1px solid ${config.border};border-radius:${config.radius};overflow:hidden;}
      .syncetc-featured-image-link{display:inline-flex;align-items:center;justify-content:center;max-width:100%;max-height:54vh;text-decoration:none;}
      .syncetc-featured-image{display:block;max-width:100%;max-height:54vh;width:auto;height:auto;object-fit:contain;border-radius:${config.radius};box-shadow:0 12px 30px rgba(12,38,64,.22);background:#fff;}
      .syncetc-featured-meta{margin-top:12px;padding:0 8px;color:${config.muted};font-size:13px;line-height:1.5;text-align:center;}
      .syncetc-home-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,1fr);gap:22px;align-items:stretch;}
      .syncetc-home-card{display:flex;flex-direction:column;min-width:0;}
      .syncetc-home-actions{margin-top:auto;padding-top:18px;}
      .syncetc-contact-form{display:flex;flex-direction:column;gap:14px;width:100%;margin:16px 0 0 0;}
      .syncetc-contact-row{display:flex;gap:12px;}
      .syncetc-contact-input{width:100%;padding:13px 14px;border:1px solid ${config.border};background:#fff;border-radius:12px;color:${config.text};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.35;outline:none;transition:border-color 180ms ease, box-shadow 180ms ease;}
      .syncetc-contact-input:focus{border-color:${config.primary};box-shadow:0 0 0 3px rgba(47,128,196,.15);}
      .syncetc-contact-textarea{min-height:112px;resize:vertical;}
      .syncetc-contact-submit{width:100%;min-height:46px;border:0;margin-top:2px;}
      .syncetc-contact-status{font-size:13px;font-weight:800;line-height:1.45;min-height:18px;color:${config.muted};}
      .syncetc-contact-status.ok{color:#146c2e}.syncetc-contact-status.error{color:#9a1f1f}
      .syncetc-home-note{padding:16px 18px;color:${config.muted};font-size:13px;line-height:1.55;}
      .syncetc-home-note strong{color:${config.primary};}
      .syncetc-announcement-strip{margin-bottom:14px;padding:12px 16px;border-radius:${config.radius};background:${config.secondary};border:1px solid ${config.border};color:${config.primary};font-size:13px;font-weight:850;box-shadow:${config.shadow === "none" ? "none" : "0 8px 20px rgba(12,38,64,.08)"};}
      .syncetc-marquee-alert{width:100%;max-width:100%;overflow:hidden;margin-bottom:18px;}
      .syncetc-marquee-viewpoint{width:100%;max-width:100%;overflow:hidden;position:relative;}
      .syncetc-marquee-track{display:inline-flex;align-items:center;width:max-content;min-width:max-content;white-space:nowrap;animation:syncetcHomeMarqueeMovePause 34s linear infinite;will-change:transform;}
      .syncetc-marquee-alert:hover .syncetc-marquee-track{animation-play-state:paused;}
      .syncetc-marquee-image{flex:0 0 auto;max-height:54px;width:auto;margin-right:10px;object-fit:contain;}
      .syncetc-marquee-text{flex:0 0 auto;display:inline-flex;align-items:center;padding:3px 8px;border:1px solid ${config.border};background:rgba(255,255,255,.72);color:${config.text};font-size:13px;font-weight:850;}
      @keyframes syncetcHomeMarqueeMovePause{0%{transform:translateX(100vw)}18%{transform:translateX(calc(50vw - 50%))}77%{transform:translateX(calc(50vw - 50%))}100%{transform:translateX(-120%)}}
      @media(max-width:980px){.syncetc-featured-header{grid-template-columns:1fr}.syncetc-home-grid{grid-template-columns:1fr}.syncetc-home-button.secondary{justify-self:start}}
      @media(max-width:720px){.syncetc-home-hero{padding:26px 20px 22px}.syncetc-home-hero h1{font-size:36px}.syncetc-home-main{padding:18px}.syncetc-home-stats{grid-template-columns:1fr}.syncetc-featured-card,.syncetc-home-card{padding:18px}.syncetc-featured-slot{min-height:260px;max-height:52vh;padding:10px}.syncetc-featured-image-link,.syncetc-featured-image{max-height:48vh}.syncetc-contact-row{flex-direction:column}.syncetc-home-button,.syncetc-home-button.secondary{width:100%}.syncetc-marquee-track{animation-duration:32s}}
      @media(max-width:520px){.syncetc-home-hero h1{font-size:32px}.syncetc-home-card h2,.syncetc-featured-header h2{font-size:25px}.syncetc-featured-slot{min-height:220px}}
    `;
  }

  function statCards(parts) {
    if (!getBool(parts.options, "show_hero_stats", true)) return "";
    const cards = [1, 2, 3].map((i) => ({
      label: getText(parts.content, `stat_${i}_label`),
      text: getText(parts.content, `stat_${i}_text`),
    })).filter((card) => hasText(card.label) || hasText(card.text));

    if (!cards.length) return "";
    return `<div class="syncetc-home-stats">${cards.map((card) => `
      <div class="syncetc-home-stat">
        ${hasText(card.label) ? `<strong>${escapeHtml(card.label)}</strong>` : ""}
        ${hasText(card.text) ? `<span>${escapeHtml(card.text)}</span>` : ""}
      </div>
    `).join("")}</div>`;
  }

  function heroHtml(parts) {
    const eyebrow = getText(parts.content, "hero_eyebrow");
    const title = getText(parts.content, "hero_title", parts.title);
    const intro = getText(parts.content, "hero_intro");
    const stats = statCards(parts);
    if (!hasText(eyebrow) && !hasText(title) && !hasText(intro) && !stats) return "";
    return `<section class="syncetc-home-hero">
      ${hasText(eyebrow) ? `<div class="syncetc-home-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      ${hasText(title) ? `<h1>${escapeHtml(title)}</h1>` : ""}
      ${hasText(intro) ? paragraphHtml(intro) : ""}
      ${stats}
    </section>`;
  }

  function announcementAndMarqueeHtml(parts) {
    const chunks = [];
    const showAnnouncement = getFeature(parts, "show_announcement_strip", false);
    const showMarquee = getFeature(parts, "show_banner_scroller", false);
    const announcement = getText(parts.content, "announcement_text");
    const marqueeText = getText(parts.content, "marquee_text");
    const marqueeImageUrl = getText(parts.content, "marquee_image_url");

    if (showAnnouncement && hasText(announcement)) {
      chunks.push(`<div class="syncetc-announcement-strip">${formatPlainText(announcement)}</div>`);
    }

    if (showMarquee && hasText(marqueeText)) {
      chunks.push(`<div class="syncetc-marquee-alert" aria-label="Announcement banner">
        <div class="syncetc-marquee-viewpoint">
          <div class="syncetc-marquee-track">
            ${hasText(marqueeImageUrl) ? `<img class="syncetc-marquee-image" src="${escapeHtml(safeHref(marqueeImageUrl, ""))}" alt="" loading="lazy" decoding="async">` : ""}
            <div class="syncetc-marquee-text">${formatPlainText(marqueeText)}</div>
          </div>
        </div>
      </div>`);
    }

    return chunks.join("");
  }

  function featuredHtml(payload, parts) {
    if (!getBool(parts.options, "show_featured_photo", true)) return "";
    const photo = payload.featured_photo || null;
    if (!photo || !photo.image_url) return "";

    const label = getText(parts.content, "featured_label");
    const title = getText(parts.content, "featured_title");
    const intro = getText(parts.content, "featured_intro");
    const buttonLabel = getText(parts.content, "featured_button_label");
    const buttonUrl = getText(parts.content, "featured_button_url");
    const captionParts = [photo.caption, photo.credit ? `Photo courtesy of ${photo.credit}` : ""].map(cleanText).filter(Boolean);

    return `<section class="syncetc-featured-card">
      ${hasText(label) ? `<div class="syncetc-home-section-label">${escapeHtml(label)}</div>` : ""}
      <div class="syncetc-featured-header">
        <div>
          ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
          ${hasText(intro) ? paragraphHtml(intro) : ""}
        </div>
        ${hasText(buttonLabel) && hasText(buttonUrl) ? `<a href="${escapeHtml(safeHref(buttonUrl))}" class="syncetc-home-button secondary">${escapeHtml(buttonLabel)}</a>` : ""}
      </div>
      <div class="syncetc-featured-slot">
        <a href="${escapeHtml(safeHref(buttonUrl || photo.image_large_url || photo.image_url, photo.image_large_url || photo.image_url))}" class="syncetc-featured-image-link">
          <img class="syncetc-featured-image" src="${escapeHtml(photo.image_url)}" ${photo.image_srcset ? `srcset="${escapeHtml(photo.image_srcset)}" sizes="(max-width: 720px) 92vw, 940px"` : ""} alt="${escapeHtml(photo.alt_text || photo.caption || photo.title || "Featured photo")}" loading="lazy" decoding="async">
        </a>
      </div>
      ${captionParts.length ? `<div class="syncetc-featured-meta">${escapeHtml(captionParts.join(" - "))}</div>` : ""}
    </section>`;
  }

  function missionHtml(parts) {
    if (!getBool(parts.options, "show_mission_card", true)) return "";
    const label = getText(parts.content, "mission_label");
    const title = getText(parts.content, "mission_title");
    const body = getText(parts.content, "mission_body");
    const ctaLabel = getText(parts.content, "mission_cta_label");
    const ctaUrl = getText(parts.content, "mission_cta_url");
    if (!hasText(label) && !hasText(title) && !hasText(body) && !hasText(ctaLabel)) return "";

    return `<article class="syncetc-home-card syncetc-mission-card">
      ${hasText(label) ? `<div class="syncetc-home-section-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(body) ? paragraphHtml(body) : ""}
      ${hasText(ctaLabel) && hasText(ctaUrl) ? `<div class="syncetc-home-actions"><a href="${escapeHtml(safeHref(ctaUrl))}" class="syncetc-home-button">${escapeHtml(ctaLabel)}</a></div>` : ""}
    </article>`;
  }

  function contactHtml(parts) {
    if (!getBool(parts.options, "show_contact_form", true)) return "";
    const label = getText(parts.content, "contact_label");
    const title = getText(parts.content, "contact_title");
    const intro = getText(parts.content, "contact_intro");
    const namePlaceholder = getText(parts.labels, "contact_name_placeholder", "Name");
    const emailPlaceholder = getText(parts.labels, "contact_email_placeholder", "Email");
    const messagePlaceholder = getText(parts.labels, "contact_message_placeholder", "Message");
    const submitLabel = getText(parts.labels, "contact_submit_label", "Send Message");

    return `<article class="syncetc-home-card syncetc-contact-card" id="contact-board">
      ${hasText(label) ? `<div class="syncetc-home-section-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(intro) ? paragraphHtml(intro) : ""}
      <form class="syncetc-contact-form" data-syncetc-contact-form="true">
        <div style="display:none!important"><input type="text" name="hp-field" tabindex="-1" autocomplete="off"></div>
        <div class="syncetc-contact-row">
          <input class="syncetc-contact-input" name="name" type="text" required placeholder="${escapeHtml(namePlaceholder)}" autocomplete="name">
          <input class="syncetc-contact-input" name="email" type="email" required placeholder="${escapeHtml(emailPlaceholder)}" autocomplete="email">
        </div>
        <textarea class="syncetc-contact-input syncetc-contact-textarea" name="message" required placeholder="${escapeHtml(messagePlaceholder)}"></textarea>
        <button class="syncetc-home-button syncetc-contact-submit" type="submit">${escapeHtml(submitLabel)}</button>
        <div class="syncetc-contact-status" data-syncetc-contact-status="true"></div>
      </form>
    </article>`;
  }

  function noteHtml(parts) {
    if (!getBool(parts.options, "show_note_strip", true)) return "";
    const note = getText(parts.content, "note_body");
    if (!hasText(note)) return "";
    return `<div class="syncetc-home-note"><strong>Note:</strong> ${formatPlainText(note)}</div>`;
  }

  function bodyHtml(payload) {
    const parts = getPageParts(payload);
    const hero = heroHtml(parts);
    const featured = featuredHtml(payload, parts);
    const mission = missionHtml(parts);
    const contact = contactHtml(parts);
    const grid = mission || contact ? `<section class="syncetc-home-grid">${mission}${contact}</section>` : "";
    const note = noteHtml(parts);

    return `<section class="syncetc-home-page" data-syncetc-page-version="${VERSION}">
      <div class="syncetc-home-shell">
        ${hero}
        <main class="syncetc-home-main">
          ${featured}
          ${grid}
          ${note}
        </main>
      </div>
    </section>`;
  }

  function renderStandalone(root, payload) {
    const config = styleConfig(payload);
    root.innerHTML = `<style>${buildCss(config)}</style>${announcementAndMarqueeHtml(getPageParts(payload))}${bodyHtml(payload)}`;
  }

  async function fetchPayload(root) {
    const organizationKey = root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key") || root.getAttribute("data-org-key") || "";
    const siteKey = root.getAttribute("data-site-key") || "primary";
    const pageKey = root.getAttribute("data-page-key") || "home";
    const renderMode = root.getAttribute("data-render-mode") || "public";
    const edgeUrl = root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL;

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        action: "get_home_page",
        organization_key: organizationKey,
        site_key: siteKey,
        page_key: pageKey,
        render_mode: renderMode,
      }),
    });

    const result = await response.json().catch(() => ({ ok: false, message: "Non-JSON public render response." }));
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || result.error || `HTTP ${response.status}`);
    }
    return result;
  }

  async function submitContactForm(root, form, payload) {
    const statusEl = form.querySelector("[data-syncetc-contact-status='true']");
    const edgeUrl = root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL;
    const parts = getPageParts(payload);
    const successMessage = getText(parts.content, "contact_success_message", "Thanks. Your message has been received.");

    function setStatus(message, className) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.className = `syncetc-contact-status ${className || ""}`.trim();
    }

    const formData = new FormData(form);
    const payloadBody = {
      action: "submit_contact_inquiry",
      organization_key: root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key") || root.getAttribute("data-org-key") || "",
      site_key: root.getAttribute("data-site-key") || "primary",
      page_key: root.getAttribute("data-page-key") || "home",
      source_url: window.location.href,
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
      hp_field: formData.get("hp-field"),
    };

    setStatus("Sending...", "");

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payloadBody),
    });

    const result = await response.json().catch(() => ({ ok: false, message: "Non-JSON contact response." }));
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || result.error || `HTTP ${response.status}`);
    }

    form.reset();
    setStatus(successMessage, "ok");
  }

  function bindContactForms(root, payload) {
    root.querySelectorAll("form[data-syncetc-contact-form='true']").forEach((form) => {
      if (form.dataset.bound === "true") return;
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const statusEl = form.querySelector("[data-syncetc-contact-status='true']");
        try {
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          await submitContactForm(root, form, payload);
        } catch (error) {
          if (statusEl) {
            statusEl.textContent = error instanceof Error ? error.message : String(error);
            statusEl.className = "syncetc-contact-status error";
          }
        }
      });
    });
  }

  function render(root, payload) {
    const config = styleConfig(payload);
    const parts = getPageParts(payload);
    const extraCss = buildCss(config);
    const beforeBodyHtml = announcementAndMarqueeHtml(parts);

    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
      window.SyncEtcPublicShell.render({
        root,
        payload,
        activePageKey: "home",
        extraCss,
        beforeBodyHtml,
        bodyHtml: bodyHtml(payload),
      });
    } else {
      renderStandalone(root, payload);
    }

    bindContactForms(root, payload);
  }

  async function initOne(root) {
    root.innerHTML = `<div style="padding:18px;font-family:Arial,Helvetica,sans-serif;">Loading home page...</div>`;
    try {
      const payload = await fetchPayload(root);
      render(root, payload);
    } catch (error) {
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.renderError === "function") {
        window.SyncEtcPublicShell.renderError(root, error instanceof Error ? error.message : String(error));
      } else {
        root.innerHTML = `<div style="padding:18px;border:1px solid #ffb4b4;background:#fff4f4;color:#8a1f1f;font-family:Arial,Helvetica,sans-serif;border-radius:12px;"><strong>Unable to load page.</strong><br>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
      }
    }
  }

  function init() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(initOne);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
