(function () {
  "use strict";

  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-aircraft-page-root, [data-syncetc-page='aircraft']";

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
      .replace(/"/g, "&quot;")
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

  function money(value) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
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
    const density = getText(profile, "density", "normal");
    const cardStyle = getText(profile, "card_style", "standard");
    const heroStyle = getText(profile, "hero_style", getText(layout, "hero", "standard"));
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const gradients = getText(effects, "gradients", "subtle");
    const width = getText(spacing, "page_width", getText(layout, "default_width", "normal"));
    const cardPadding = getText(spacing, "card_padding", density === "compact" ? "compact" : "normal");
    const sectionSpacing = getText(spacing, "section_spacing", density === "compact" ? "compact" : "normal");
    const imageTreatment = getText(media, "image_treatment", "inset");
    const headingScale = getText(typography, "heading_scale", "normal");

    return {
      primary,
      secondary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      heroGradient: gradients === "none"
        ? primary
        : `linear-gradient(135deg, ${primary}, ${rgba(primary, 0.86)} 62%, ${rgba(primary, 0.68)})`,
      pageWidth: width === "wide" ? "1180px" : width === "narrow" ? "880px" : "1040px",
      radius: corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px",
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "hairline" ? "0 1px 0 rgba(12,38,64,.14)" : shadows === "strong" ? "0 24px 70px rgba(12,38,64,.28)" : "0 14px 42px rgba(12,38,64,.14)",
      heroPadding: heroStyle === "dashboard" || heroStyle === "compact" ? "24px" : heroStyle === "bold" ? "38px" : "32px",
      cardPadding: cardPadding === "generous" ? "28px" : cardPadding === "compact" ? "16px" : "22px",
      sectionGap: sectionSpacing === "generous" ? "26px" : sectionSpacing === "compact" ? "14px" : "20px",
      // Aircraft photos should default to no-crop display. A future template/style option can opt into "cover" deliberately.
      imageFit: imageTreatment === "cover" ? "cover" : "contain",
      headingSize: headingScale === "compact" ? "clamp(28px, 4vw, 42px)" : "clamp(32px, 4vw, 50px)",
    };
  }

  function buildCss(config) {
    return `
      .syncetc-aircraft-page{max-width:${config.pageWidth};margin:34px auto 56px auto;padding:0 18px;color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
      .syncetc-aircraft-page *{box-sizing:border-box;}
      .syncetc-aircraft-shell{background:${rgba(config.surface, 0.94)};border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-aircraft-hero{padding:${config.heroPadding};background:${config.heroGradient};color:#fff;}
      .syncetc-aircraft-eyebrow,.syncetc-aircraft-label{display:inline-flex;align-items:center;margin-bottom:10px;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-aircraft-eyebrow{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:#fff;}
      .syncetc-aircraft-hero h1{margin:0;font-size:${config.headingSize};line-height:1.05;font-weight:850;letter-spacing:-.035em;}
      .syncetc-aircraft-hero p{max-width:820px;margin:14px 0 0 0;font-size:17px;line-height:1.65;color:rgba(255,255,255,.9);}
      .syncetc-aircraft-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px;}
      .syncetc-aircraft-stat{padding:14px 16px;border-radius:${config.radius};background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);}
      .syncetc-aircraft-stat strong{display:block;margin-bottom:4px;font-size:21px;line-height:1;color:#fff;}
      .syncetc-aircraft-stat span{display:block;font-size:13px;line-height:1.38;color:rgba(255,255,255,.84);}
      .syncetc-aircraft-main{padding:${config.cardPadding};display:grid;gap:${config.sectionGap};}
      .syncetc-aircraft-intro,.syncetc-aircraft-card,.syncetc-aircraft-note,.syncetc-aircraft-empty{border-radius:${config.radius};background:${rgba(config.surface, 0.88)};border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};}
      .syncetc-aircraft-intro{padding:${config.cardPadding};}
      .syncetc-aircraft-label{background:${config.secondary};color:${config.primary};}
      .syncetc-aircraft-intro h2,.syncetc-aircraft-copy h2{margin:0 0 10px 0;color:${config.primary};font-size:24px;line-height:1.18;font-weight:850;letter-spacing:-.02em;}
      .syncetc-aircraft-intro p,.syncetc-aircraft-copy p{margin:0 0 13px 0;font-size:15px;line-height:1.7;color:${config.text};}
      .syncetc-aircraft-list{display:grid;gap:${config.sectionGap};}
      .syncetc-aircraft-card{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);gap:22px;align-items:start;padding:${config.cardPadding};}
      .syncetc-aircraft-header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;margin-bottom:8px;}
      .syncetc-aircraft-title{margin:0;color:${config.primary};font-size:28px;line-height:1.05;font-weight:850;letter-spacing:-.025em;}
      .syncetc-aircraft-meta{color:${config.muted};font-size:13px;line-height:1.35;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}
      .syncetc-aircraft-facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0 0;}
      .syncetc-aircraft-fact{padding:7px 10px;border-radius:999px;background:${config.softPrimary};border:1px solid ${config.border};color:${config.primary};font-size:12px;font-weight:800;}
      .syncetc-aircraft-copy ul{margin:12px 0 0 20px;padding:0;color:${config.text};font-size:14px;line-height:1.55;}
      .syncetc-aircraft-copy li{margin-bottom:4px;}
      .syncetc-aircraft-media{display:grid;gap:14px;}
      .syncetc-aircraft-photo-card{overflow:hidden;border-radius:${config.radius};background:${config.surface};border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 20px rgba(12,38,64,.08)"};}
      .syncetc-aircraft-photo-card img{display:block;width:100%;height:230px;object-fit:${config.imageFit};object-position:center center;background:${config.secondary};}
      .syncetc-aircraft-photo-label{padding:9px 12px;color:${config.muted};font-size:12px;line-height:1.25;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:${rgba(config.secondary, 0.72)};border-top:1px solid ${config.border};}
      .syncetc-aircraft-note,.syncetc-aircraft-empty{padding:16px 18px;color:${config.muted};font-size:14px;line-height:1.55;}
      .syncetc-aircraft-note strong{color:${config.primary};}
      .syncetc-aircraft-error{padding:18px;border-radius:${config.radius};background:#fff4f4;border:1px solid #ffb4b4;color:#8a1f1f;font-size:14px;line-height:1.5;}
      @media(max-width:980px){.syncetc-aircraft-card{grid-template-columns:1fr}.syncetc-aircraft-media{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media(max-width:720px){.syncetc-aircraft-page{margin-top:20px;padding:0 12px}.syncetc-aircraft-hero{padding:24px 20px}.syncetc-aircraft-main{padding:18px}.syncetc-aircraft-stats{grid-template-columns:1fr}.syncetc-aircraft-card{padding:18px}.syncetc-aircraft-media{grid-template-columns:1fr}.syncetc-aircraft-photo-card img{height:210px}.syncetc-aircraft-title{font-size:25px}}
    `;
  }

  function statCards(content, options) {
    if (!getBool(options, "show_hero_stats", true)) return "";
    const cards = [1, 2, 3].map((i) => ({
      label: getText(content, `stat_${i}_label`),
      text: getText(content, `stat_${i}_text`),
    })).filter((card) => hasText(card.label) || hasText(card.text));

    if (!cards.length) return "";

    return `<div class="syncetc-aircraft-stats">${cards.map((card) => `
      <div class="syncetc-aircraft-stat">
        ${hasText(card.label) ? `<strong>${escapeHtml(card.label)}</strong>` : ""}
        ${hasText(card.text) ? `<span>${escapeHtml(card.text)}</span>` : ""}
      </div>
    `).join("")}</div>`;
  }

  function heroHtml(content, options) {
    const eyebrow = getText(content, "hero_eyebrow");
    const title = getText(content, "hero_title");
    const intro = getText(content, "hero_intro");
    const stats = statCards(content, options);

    if (!hasText(eyebrow) && !hasText(title) && !hasText(intro) && !stats) return "";

    return `<section class="syncetc-aircraft-hero">
      ${hasText(eyebrow) ? `<div class="syncetc-aircraft-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      ${hasText(title) ? `<h1>${escapeHtml(title)}</h1>` : ""}
      ${hasText(intro) ? paragraphHtml(intro) : ""}
      ${stats}
    </section>`;
  }

  function introHtml(content, options) {
    if (!getBool(options, "show_intro_card", true)) return "";
    const label = getText(content, "intro_label");
    const title = getText(content, "intro_title");
    const body = getText(content, "intro_body");
    if (!hasText(label) && !hasText(title) && !hasText(body)) return "";
    return `<section class="syncetc-aircraft-intro">
      ${hasText(label) ? `<div class="syncetc-aircraft-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${hasText(body) ? paragraphHtml(body) : ""}
    </section>`;
  }

  function buildDescriptionHtml(value) {
    const raw = rawText(value);
    if (!hasText(raw)) return "";

    const parts = raw.split("||").map((part) => rawText(part)).filter(Boolean);
    if (parts.length <= 1) return paragraphHtml(raw);

    const intro = parts.shift();
    const bullets = parts.map((part) => `<li>${formatPlainText(part)}</li>`).join("");
    return `${intro ? paragraphHtml(intro) : ""}${bullets ? `<ul>${bullets}</ul>` : ""}`;
  }

  function photoCard(url, srcset, label, alt) {
    if (!hasText(url)) return "";
    return `<div class="syncetc-aircraft-photo-card">
      <img
        src="${escapeHtml(url)}"
        ${hasText(srcset) ? `srcset="${escapeHtml(srcset)}"` : ""}
        sizes="(max-width: 720px) calc(100vw - 60px), (max-width: 980px) 45vw, 420px"
        alt="${escapeHtml(alt || label || "Aircraft photo")}"
        loading="lazy"
        decoding="async">
      ${hasText(label) ? `<div class="syncetc-aircraft-photo-label">${escapeHtml(label)}</div>` : ""}
    </div>`;
  }

  function aircraftCardHtml(aircraft, options, labels) {
    const title = cleanText(aircraft.public_label || aircraft.tail_number || aircraft.display_name || aircraft.identifier);
    if (!title) return "";

    const metaParts = [aircraft.model_year || aircraft.aircraft_year, aircraft.aircraft_type || aircraft.aircraft_model]
      .map(cleanText)
      .filter(Boolean);

    const facts = [];
    if (getBool(options, "show_home_base", true) && hasText(aircraft.home_base)) {
      facts.push(`${getText(labels, "home_base_label", "Home Base")}: ${cleanText(aircraft.home_base)}`);
    }
    if (getBool(options, "show_public_rates", false) && aircraft.hourly_rate !== null && aircraft.hourly_rate !== undefined) {
      facts.push(`${getText(labels, "rate_label", "Hourly Rate")}: ${money(aircraft.hourly_rate)}`);
    }
    if (getBool(options, "show_public_annual_due", false) && aircraft.annual_due !== null && aircraft.annual_due !== undefined) {
      facts.push(`${getText(labels, "annual_due_label", "Annual Due")}: ${money(aircraft.annual_due)}`);
    }

    const description = aircraft.aircraft_description_plain || aircraft.summary || aircraft.description;
    const primaryLabel = getText(labels, "primary_photo_label", "Exterior");
    const panelLabel = getText(labels, "panel_photo_label", "Panel");
    const media = [
      getBool(options, "show_primary_photo", true) ? photoCard(aircraft.primary_photo_url, aircraft.primary_photo_srcset, primaryLabel, `${title} ${primaryLabel}`) : "",
      getBool(options, "show_panel_photo", true) ? photoCard(aircraft.panel_photo_url, aircraft.panel_photo_srcset, panelLabel, `${title} ${panelLabel}`) : "",
    ].filter(Boolean).join("");

    return `<article class="syncetc-aircraft-card">
      <div class="syncetc-aircraft-copy">
        <div class="syncetc-aircraft-header">
          <h2 class="syncetc-aircraft-title">${escapeHtml(title)}</h2>
          ${metaParts.length ? `<div class="syncetc-aircraft-meta">${escapeHtml(metaParts.join(" "))}</div>` : ""}
        </div>
        ${buildDescriptionHtml(description)}
        ${facts.length ? `<div class="syncetc-aircraft-facts">${facts.map((fact) => `<span class="syncetc-aircraft-fact">${escapeHtml(fact)}</span>`).join("")}</div>` : ""}
      </div>
      ${media ? `<div class="syncetc-aircraft-media">${media}</div>` : ""}
    </article>`;
  }

  function renderPayload(root, payload) {
    const content = getJson(payload?.page_settings || {}, "content_json");
    const options = getJson(payload?.page_settings || {}, "options_json");
    const labels = getJson(payload?.page_settings || {}, "labels_json");
    const config = styleConfig(payload);
    const aircraft = Array.isArray(payload.aircraft) ? payload.aircraft : [];
    const emptyMessage = getText(content, "empty_state_message", "Aircraft information is not available at this time.");
    const noteBody = getText(content, "note_body");
    const noteEnabled = getBool(options, "show_note_strip", true) && hasText(noteBody);

    const cssId = `syncetc-aircraft-css-${Math.random().toString(36).slice(2)}`;
    const cards = aircraft.map((item) => aircraftCardHtml(item, options, labels)).filter(Boolean).join("");

    root.innerHTML = `
      <style id="${cssId}">${buildCss(config)}</style>
      <div class="syncetc-aircraft-page">
        <div class="syncetc-aircraft-shell">
          ${heroHtml(content, options)}
          <main class="syncetc-aircraft-main">
            ${introHtml(content, options)}
            <section class="syncetc-aircraft-list">
              ${cards || `<div class="syncetc-aircraft-empty">${escapeHtml(emptyMessage)}</div>`}
            </section>
            ${noteEnabled ? `<div class="syncetc-aircraft-note"><strong>Note:</strong> ${formatPlainText(noteBody)}</div>` : ""}
          </main>
        </div>
      </div>
    `;
  }

  function renderLoading(root) {
    root.innerHTML = `<div style="max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid rgba(18,54,90,.14);border-radius:16px;background:#fff;color:#5d6b78;font-family:Arial,Helvetica,sans-serif;">Loading aircraft information...</div>`;
  }

  function renderMessage(root, message, mode) {
    const isDebug = mode === "debug";
    const style = isDebug
      ? "max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid #ffb4b4;border-radius:16px;background:#fff4f4;color:#8a1f1f;font-family:Arial,Helvetica,sans-serif;"
      : "max-width:1040px;margin:28px auto;padding:16px 18px;border:1px solid rgba(18,54,90,.14);border-radius:16px;background:#fff;color:#5d6b78;font-family:Arial,Helvetica,sans-serif;";
    root.innerHTML = `<div style="${style}">${escapeHtml(message || "Aircraft information is not available at this time.")}</div>`;
  }

  async function fetchPayload(root) {
    const organizationKey = cleanText(root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key"));
    const pageKey = cleanText(root.getAttribute("data-page-key") || "aircraft") || "aircraft";
    const siteKey = cleanText(root.getAttribute("data-site-key") || "primary") || "primary";
    const renderMode = cleanText(root.getAttribute("data-render-mode") || "public") || "public";
    const edgeUrl = cleanText(root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL) || DEFAULT_EDGE_URL;

    if (!organizationKey) {
      renderMessage(root, "Aircraft renderer is missing data-organization-key.", renderMode);
      return;
    }

    renderLoading(root);

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        action: "get_aircraft_page",
        organization_key: organizationKey,
        site_key: siteKey,
        page_key: pageKey,
        render_mode: renderMode,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) {
      renderMessage(root, payload?.message || payload?.error || "Aircraft information is not available at this time.", renderMode);
      return;
    }

    renderPayload(root, payload);
  }

  function boot() {
    const roots = Array.from(document.querySelectorAll(ROOT_SELECTOR));
    roots.forEach((root) => {
      fetchPayload(root).catch((error) => {
        console.error("SyncEtc Aircraft renderer failed", error);
        const mode = cleanText(root.getAttribute("data-render-mode") || "public") || "public";
        renderMessage(root, error instanceof Error ? error.message : String(error), mode);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
