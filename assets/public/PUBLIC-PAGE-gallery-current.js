(function () {
  "use strict";

  const VERSION = "2026-06-05-003";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_ID = "syncetc-gallery-page-root";

  function getRoot() {
    return document.getElementById(ROOT_ID) || document.querySelector("[data-syncetc-gallery-page-root='true']");
  }

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

  function getObj(source, key) {
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

  function styleConfig(payload) {
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.styleConfig === "function") {
      return window.SyncEtcPublicShell.styleConfig(payload || {});
    }
    return {
      primary: "#1f4f82",
      secondary: "#eef3f8",
      surface: "#ffffff",
      text: "#172033",
      muted: "rgba(23,32,51,.68)",
      border: "rgba(31,79,130,.16)",
      radius: "18px",
      radiusLarge: "26px",
      shadow: "0 14px 42px rgba(12,38,64,.14)",
      density: "normal",
    };
  }

  function formatPlainText(value) {
    const safe = escapeHtml(value);
    return safe.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  }

  function paragraphHtml(value) {
    if (!hasText(value)) return "";
    return `<p>${formatPlainText(value)}</p>`;
  }

  function isVideo(item) {
    return item && (item.media_type === "external_video" || item.media_type === "video");
  }

  function buildCss(config) {
    return `
      .syncetc-gallery-shell{border-radius:${config.radiusLarge};background:rgba(255,255,255,.88);border:1px solid ${config.border};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px);}
      .syncetc-gallery-hero{padding:${config.density === "compact" ? "26px" : "34px"};background:linear-gradient(135deg, ${config.primary}, rgba(47,128,196,.88)), radial-gradient(circle at top right, rgba(255,255,255,.32), transparent 36%);color:#fff;}
      .syncetc-gallery-eyebrow,.syncetc-gallery-label{display:inline-flex;align-items:center;margin-bottom:10px;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
      .syncetc-gallery-eyebrow{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);color:#fff;}
      .syncetc-gallery-hero h1{margin:0;font-size:clamp(34px,5vw,54px);line-height:1.04;font-weight:900;letter-spacing:-.04em;color:#fff;}
      .syncetc-gallery-hero p{max-width:820px;margin:14px 0 0 0;font-size:17px;line-height:1.65;color:rgba(255,255,255,.9);}
      .syncetc-gallery-main{padding:${config.density === "compact" ? "18px" : "26px"};display:grid;gap:${config.density === "compact" ? "16px" : "22px"};}
      .syncetc-gallery-card,.syncetc-gallery-note{border-radius:${config.radius};background:rgba(255,255,255,.88);border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};}
      .syncetc-gallery-card{padding:${config.density === "compact" ? "18px" : "22px"};}
      .syncetc-gallery-label{background:${config.secondary};color:${config.primary};}
      .syncetc-gallery-card h2{margin:0 0 10px 0;color:${config.primary};font-size:28px;line-height:1.12;font-weight:900;letter-spacing:-.025em;}
      .syncetc-gallery-card p{margin:0;font-size:15px;line-height:1.7;color:${config.text};}
      .syncetc-gallery-tabs{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
      .syncetc-gallery-tab{border:1px solid ${config.border};background:#fff;color:${config.primary};border-radius:999px;padding:10px 15px;font-size:13px;font-weight:900;cursor:pointer;transition:transform .16s ease,background .16s ease,color .16s ease;}
      .syncetc-gallery-tab:hover{transform:translateY(-1px);background:${config.secondary};}
      .syncetc-gallery-tab.is-active{background:${config.primary};color:#fff;border-color:${config.primary};}
      .syncetc-gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
      .syncetc-gallery-item{border-radius:${config.radius};background:rgba(255,255,255,.9);border:1px solid ${config.border};box-shadow:${config.shadow === "none" ? "none" : "0 8px 24px rgba(12,38,64,.08)"};overflow:hidden;display:flex;flex-direction:column;min-width:0;}
      .syncetc-gallery-item[hidden]{display:none!important;}
      .syncetc-gallery-button{display:block;width:100%;border:0;padding:0;background:transparent;cursor:pointer;text-align:left;}
      .syncetc-gallery-image-wrap{height:245px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg, rgba(234,245,255,.92), rgba(255,255,255,.86));overflow:hidden;position:relative;}
      .syncetc-gallery-image{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;}
      .syncetc-gallery-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
      .syncetc-gallery-play span{width:58px;height:58px;border-radius:999px;background:rgba(18,54,90,.86);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 12px 26px rgba(0,0,0,.28);}
      .syncetc-gallery-meta{padding:12px 14px;color:${config.text};font-size:13px;line-height:1.45;}
      .syncetc-gallery-meta strong{display:block;color:${config.primary};font-size:14px;margin-bottom:3px;}
      .syncetc-gallery-credit{margin-top:5px;color:${config.muted};font-size:12px;}
      .syncetc-gallery-featured{display:inline-flex;margin-bottom:7px;padding:3px 8px;border-radius:999px;background:${config.secondary};color:${config.primary};font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;}
      .syncetc-gallery-empty{padding:18px;border-radius:${config.radius};background:rgba(255,255,255,.9);border:1px dashed ${config.border};color:${config.muted};font-size:14px;line-height:1.55;}
      .syncetc-gallery-note{padding:16px 18px;color:${config.muted};font-size:13px;line-height:1.55;}
      .syncetc-gallery-note strong{color:${config.primary};}
      .syncetc-gallery-lightbox{position:fixed;inset:0;z-index:99999;background:rgba(8,15,28,.82);display:flex;align-items:center;justify-content:center;padding:24px;}
      .syncetc-gallery-lightbox[hidden]{display:none!important;}
      .syncetc-gallery-lightbox-panel{width:min(96vw,1600px);max-height:92vh;display:grid;gap:12px;}
      .syncetc-gallery-lightbox-image{display:block;max-width:100%;max-height:82vh;width:auto;height:auto;object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.42);justify-self:center;}
      .syncetc-gallery-lightbox-video{display:block;width:min(96vw,1120px);height:min(56.25vw,630px);min-height:320px;border:0;border-radius:12px;background:#000;box-shadow:0 24px 70px rgba(0,0,0,.42);justify-self:center;}
      .syncetc-gallery-lightbox-caption{color:#fff;font-size:14px;line-height:1.5;text-align:center;}
      .syncetc-gallery-lightbox-close{position:fixed;top:18px;right:18px;width:42px;height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font-size:24px;font-weight:900;cursor:pointer;}
      @media(max-width:980px){.syncetc-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.syncetc-gallery-image-wrap{height:220px;}}
      @media(max-width:640px){.syncetc-gallery-hero{padding:26px 20px}.syncetc-gallery-main{padding:18px}.syncetc-gallery-grid{grid-template-columns:1fr}.syncetc-gallery-image-wrap{height:240px}.syncetc-gallery-card{padding:18px}.syncetc-gallery-tab{width:100%;}.syncetc-gallery-lightbox-video{height:56vw;min-height:220px;}}
    `;
  }

  function heroHtml(payload, parts) {
    const eyebrow = getText(parts.content, "hero_eyebrow");
    const title = getText(parts.content, "hero_title", parts.title);
    const intro = getText(parts.content, "hero_intro");
    if (!hasText(eyebrow) && !hasText(title) && !hasText(intro)) return "";
    return `<section class="syncetc-gallery-hero">
      ${hasText(eyebrow) ? `<div class="syncetc-gallery-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      ${hasText(title) ? `<h1>${escapeHtml(title)}</h1>` : ""}
      ${paragraphHtml(intro)}
    </section>`;
  }

  function introHtml(parts) {
    if (!getBool(parts.options, "show_gallery_intro", true)) return "";
    const label = getText(parts.content, "gallery_label");
    const title = getText(parts.content, "gallery_title");
    const intro = getText(parts.content, "gallery_intro");
    if (!hasText(label) && !hasText(title) && !hasText(intro)) return "";
    return `<section class="syncetc-gallery-card">
      ${hasText(label) ? `<div class="syncetc-gallery-label">${escapeHtml(label)}</div>` : ""}
      ${hasText(title) ? `<h2>${escapeHtml(title)}</h2>` : ""}
      ${paragraphHtml(intro)}
    </section>`;
  }

  function tabsHtml(media, parts) {
    const hasVideos = media.some(isVideo);
    const hasImages = media.some((item) => !isVideo(item));
    if (!getBool(parts.options, "show_gallery_filter_tabs", true) || (!hasVideos && !hasImages)) return "";
    return `<div class="syncetc-gallery-tabs" role="tablist" aria-label="Gallery filters">
      <button class="syncetc-gallery-tab is-active" type="button" data-gallery-filter="all">All</button>
      ${hasImages ? `<button class="syncetc-gallery-tab" type="button" data-gallery-filter="photos">Photos</button>` : ""}
      ${hasVideos ? `<button class="syncetc-gallery-tab" type="button" data-gallery-filter="videos">Videos</button>` : ""}
      <button class="syncetc-gallery-tab" type="button" data-gallery-filter="featured">Featured</button>
    </div>`;
  }

  function mediaCardHtml(item, parts) {
    const showCaptions = getBool(parts.options, "show_photo_captions", true);
    const showCredit = getBool(parts.options, "show_photo_credit", true);
    const title = cleanText(item.title || "");
    const caption = cleanText(item.caption || "");
    const credit = cleanText(item.credit || "");
    const video = isVideo(item);
    const alt = cleanText(item.alt_text || caption || title || (video ? "Gallery video" : "Gallery photo"));
    const thumb = video ? (item.thumbnail_url || "") : (item.image_url || item.public_url || "");
    const large = video ? (item.video_embed_url || item.video_watch_url || "") : (item.image_large_url || thumb);
    const srcset = !video ? (item.image_srcset || "") : "";
    const label = [caption || title, credit ? `${video ? "Video" : "Photo"} courtesy of ${credit}` : ""].filter(Boolean).join(" — ");
    const filter = video ? "videos" : "photos";

    return `<article class="syncetc-gallery-item" data-media-kind="${filter}" data-featured="${item.is_featured ? "true" : "false"}">
      <button class="syncetc-gallery-button" type="button" data-media-type="${video ? "video" : "image"}" data-large-src="${escapeHtml(large)}" data-caption="${escapeHtml(label)}" aria-label="Open gallery ${video ? "video" : "image"}">
        <div class="syncetc-gallery-image-wrap">
          ${thumb ? `<img class="syncetc-gallery-image" src="${escapeHtml(thumb)}" ${srcset ? `srcset="${escapeHtml(srcset)}" sizes="(max-width:640px) 92vw, (max-width:980px) 44vw, 31vw"` : ""} alt="${escapeHtml(alt)}" loading="lazy" decoding="async">` : `<div class="syncetc-gallery-empty">${video ? "Video thumbnail unavailable" : "Image unavailable"}</div>`}
          ${video ? `<span class="syncetc-gallery-play"><span>▶</span></span>` : ""}
        </div>
      </button>
      ${(showCaptions && (caption || title)) || (showCredit && credit) || item.is_featured || video ? `<div class="syncetc-gallery-meta">
        ${item.is_featured ? `<span class="syncetc-gallery-featured">Featured</span>` : ""}
        ${video ? `<span class="syncetc-gallery-featured">Video</span>` : ""}
        ${showCaptions && title ? `<strong>${escapeHtml(title)}</strong>` : ""}
        ${showCaptions && caption ? `<div>${escapeHtml(caption)}</div>` : ""}
        ${showCredit && credit ? `<div class="syncetc-gallery-credit">${video ? "Video" : "Photo"} courtesy of ${escapeHtml(credit)}</div>` : ""}
      </div>` : ""}
    </article>`;
  }

  function galleryGridHtml(payload, parts) {
    const media = Array.isArray(payload.gallery_media) ? payload.gallery_media : [];
    if (!media.length) {
      const empty = getText(parts.content, "empty_state_message", "No public gallery media is available yet.");
      return `<div class="syncetc-gallery-empty">${escapeHtml(empty)}</div>`;
    }
    return `${tabsHtml(media, parts)}<section class="syncetc-gallery-grid">${media.map((item) => mediaCardHtml(item, parts)).join("")}</section>`;
  }

  function noteHtml(parts) {
    if (!getBool(parts.options, "show_note_strip", false)) return "";
    const note = getText(parts.content, "note_body");
    if (!hasText(note)) return "";
    return `<div class="syncetc-gallery-note"><strong>Note:</strong> ${formatPlainText(note)}</div>`;
  }

  function buildBody(payload) {
    const settings = payload.page_settings || {};
    const parts = {
      title: settings.title || payload.page?.nav_label || "Gallery",
      content: getObj(settings, "content_json"),
      labels: getObj(settings, "labels_json"),
      options: getObj(settings, "options_json"),
      visibility: getObj(settings, "visibility_json"),
    };

    return `<div class="syncetc-gallery-shell">
      ${heroHtml(payload, parts)}
      <main class="syncetc-gallery-main">
        ${introHtml(parts)}
        ${galleryGridHtml(payload, parts)}
        ${noteHtml(parts)}
      </main>
    </div>
    <div class="syncetc-gallery-lightbox" hidden>
      <button class="syncetc-gallery-lightbox-close" type="button" aria-label="Close media">×</button>
      <div class="syncetc-gallery-lightbox-panel">
        <img class="syncetc-gallery-lightbox-image" alt="Expanded gallery image" hidden>
        <iframe class="syncetc-gallery-lightbox-video" title="Gallery video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen hidden></iframe>
        <div class="syncetc-gallery-lightbox-caption"></div>
      </div>
    </div>`;
  }

  function bindInteractions(root) {
    const lightbox = root.querySelector(".syncetc-gallery-lightbox");
    if (!lightbox) return;
    const img = lightbox.querySelector(".syncetc-gallery-lightbox-image");
    const iframe = lightbox.querySelector(".syncetc-gallery-lightbox-video");
    const caption = lightbox.querySelector(".syncetc-gallery-lightbox-caption");
    const close = lightbox.querySelector(".syncetc-gallery-lightbox-close");

    function hide() {
      lightbox.hidden = true;
      if (img) { img.hidden = true; img.removeAttribute("src"); }
      if (iframe) { iframe.hidden = true; iframe.removeAttribute("src"); }
      if (caption) caption.textContent = "";
    }

    root.querySelectorAll(".syncetc-gallery-button").forEach((button) => {
      button.addEventListener("click", () => {
        const src = button.getAttribute("data-large-src") || "";
        const type = button.getAttribute("data-media-type") || "image";
        if (!src) return;
        if (type === "video" && iframe) {
          if (img) { img.hidden = true; img.removeAttribute("src"); }
          iframe.src = src;
          iframe.hidden = false;
        } else if (img) {
          if (iframe) { iframe.hidden = true; iframe.removeAttribute("src"); }
          img.src = src;
          img.alt = button.getAttribute("data-caption") || "Expanded gallery image";
          img.hidden = false;
        }
        if (caption) caption.textContent = button.getAttribute("data-caption") || "";
        lightbox.hidden = false;
      });
    });

    root.querySelectorAll(".syncetc-gallery-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const filter = tab.getAttribute("data-gallery-filter") || "all";
        root.querySelectorAll(".syncetc-gallery-tab").forEach((btn) => btn.classList.toggle("is-active", btn === tab));
        root.querySelectorAll(".syncetc-gallery-item").forEach((item) => {
          const kind = item.getAttribute("data-media-kind") || "photos";
          const featured = item.getAttribute("data-featured") === "true";
          item.hidden = !(
            filter === "all" ||
            (filter === "photos" && kind === "photos") ||
            (filter === "videos" && kind === "videos") ||
            (filter === "featured" && featured)
          );
        });
      });
    });

    close?.addEventListener("click", hide);
    lightbox.addEventListener("click", (event) => { if (event.target === lightbox) hide(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !lightbox.hidden) hide(); });
  }

  async function fetchPayload(root) {
    const edgeUrl = root.getAttribute("data-edge-url") || DEFAULT_EDGE_URL;
    const organizationKey = root.getAttribute("data-organization-key") || root.getAttribute("data-customer-key") || "test-customer-1";
    const pageKey = root.getAttribute("data-page-key") || "gallery";
    const siteKey = root.getAttribute("data-site-key") || "primary";
    const renderMode = root.getAttribute("data-render-mode") || "public";

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: "get_gallery_page", organization_key: organizationKey, customer_key: organizationKey, site_key: siteKey, page_key: pageKey, render_mode: renderMode }),
    });

    const result = await response.json().catch(() => ({ ok: false, error: "invalid_json", message: "The public renderer returned invalid JSON." }));
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `HTTP ${response.status}`);
    return result;
  }

  async function init() {
    const root = getRoot();
    if (!root) return;
    try {
      root.innerHTML = `<div style="font-family:Arial,Helvetica,sans-serif;padding:18px;">Loading gallery...</div>`;
      const payload = await fetchPayload(root);
      const config = styleConfig(payload);
      const bodyHtml = buildBody(payload);
      const extraCss = buildCss(config);
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
        window.SyncEtcPublicShell.render({ root, payload, activePageKey: "gallery", bodyHtml, extraCss });
      } else {
        root.innerHTML = `<style>${extraCss}</style>${bodyHtml}`;
      }
      bindInteractions(root);
    } catch (error) {
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.renderError === "function") {
        window.SyncEtcPublicShell.renderError(root, error instanceof Error ? error.message : String(error));
      } else {
        root.innerHTML = `<div style="font-family:Arial,Helvetica,sans-serif;margin:24px;padding:18px;border:1px solid #ffb4b4;border-radius:12px;background:#fff4f4;color:#8a1f1f;"><strong>Unable to load Gallery.</strong><br>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
