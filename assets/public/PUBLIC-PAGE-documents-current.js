// PUBLIC-PAGE-documents-current.js
// Internal Version: 2026-06-05-004-B
// Purpose: Public Documents / Resources renderer. Shows only public published PDF documents returned by core-public-render, grouped by collapsible categories with PDF preview/download actions.

(function () {
  "use strict";

  const VERSION = "2026-06-05-004-B";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const DEFAULT_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-documents-page-root";

  function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function hasText(value) { return cleanText(value).length > 0; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function getJson(source, key) { const value = source && typeof source === "object" ? source[key] : null; return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function getText(source, key, fallback = "") { const value = source && typeof source === "object" ? source[key] : undefined; return typeof value === "string" ? value.trim() : fallback; }
  function getBool(source, key, fallback = false) { const value = source && typeof source === "object" ? source[key] : undefined; return typeof value === "boolean" ? value : fallback; }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 31, g: 79, b: 130 };
    return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
  }
  function rgba(hex, alpha) { const rgb = hexToRgb(hex); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`; }

  function styleConfig(payload) {
    const profile = payload?.style_profile || {};
    const colors = getJson(profile, "colors_json");
    const spacing = getJson(profile, "spacing_json");
    const effects = getJson(profile, "effects_json");
    const typography = getJson(profile, "typography_json");
    const primary = getText(colors, "brand_primary", "#1f4f82");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const corners = getText(effects, "corners", "soft");
    const shadows = getText(effects, "shadows", "soft");
    const cardStyle = getText(profile, "card_style", "standard");
    const cardPadding = getText(spacing, "card_padding", "normal");
    const headingScale = getText(typography, "heading_scale", "normal");
    return {
      primary,
      surface,
      text,
      muted: rgba(text, 0.68),
      border: rgba(primary, 0.16),
      softPrimary: rgba(primary, 0.08),
      heroGradient: `linear-gradient(135deg, ${primary}, ${rgba(primary, 0.84)} 64%, ${rgba(primary, 0.64)})`,
      radius: corners === "sharp" || cardStyle === "sharp" ? "6px" : corners === "pill" ? "26px" : "18px",
      radiusLarge: corners === "sharp" || cardStyle === "sharp" ? "8px" : corners === "pill" ? "30px" : "26px",
      shadow: shadows === "none" ? "none" : shadows === "strong" ? "0 24px 70px rgba(12,38,64,.28)" : "0 14px 42px rgba(12,38,64,.14)",
      cardPadding: cardPadding === "generous" ? "28px" : cardPadding === "compact" ? "16px" : "22px",
      headingSize: headingScale === "compact" ? "clamp(28px,4vw,42px)" : "clamp(32px,4vw,50px)",
    };
  }

  function formatPlainText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function buildCss(config) {
    return `
      .syncetc-docs-page{width:100%;margin:0;padding:0;color:${config.text};font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}.syncetc-docs-page *{box-sizing:border-box}
      .syncetc-docs-shell{background:${rgba(config.surface,.94)};border:1px solid ${config.border};border-radius:${config.radiusLarge};box-shadow:${config.shadow};overflow:hidden;backdrop-filter:blur(8px)}
      .syncetc-docs-hero{padding:32px;background:${config.heroGradient};color:#fff}.syncetc-docs-eyebrow{display:inline-flex;margin-bottom:12px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.syncetc-docs-hero h1{margin:0;font-size:${config.headingSize};line-height:1.05;font-weight:900;letter-spacing:-.04em}.syncetc-docs-hero p{max-width:820px;margin:14px 0 0;color:rgba(255,255,255,.9);font-size:16px;line-height:1.65}
      .syncetc-docs-main{padding:26px;background:linear-gradient(180deg,${rgba(config.primary,.07)},${rgba(config.surface,.9)})}.syncetc-docs-intro{margin-bottom:20px;padding:${config.cardPadding};border:1px solid ${config.border};border-radius:${config.radius};background:${rgba(config.surface,.9)}}.syncetc-docs-intro h2{margin:0 0 9px;color:${config.primary};font-size:24px}.syncetc-docs-intro p{margin:0;color:${config.muted};line-height:1.6}
      .syncetc-docs-groups{display:grid;gap:18px}.syncetc-docs-group{padding:0;border:1px solid ${config.border};border-radius:${config.radius};background:${rgba(config.surface,.94)};overflow:hidden}.syncetc-docs-group summary{cursor:pointer;list-style:none;padding:${config.cardPadding};color:${config.primary};font-size:22px;font-weight:900}.syncetc-docs-group summary::-webkit-details-marker{display:none}.syncetc-docs-group summary span{float:right;font-size:12px;border:1px solid ${config.border};border-radius:999px;padding:4px 9px;color:${config.muted};background:${rgba(config.primary,.06)}}
      .syncetc-docs-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;padding:0 ${config.cardPadding} ${config.cardPadding}}
      .syncetc-doc-card{min-width:0;display:flex;flex-direction:column;gap:13px;padding:18px;border:1px solid ${config.border};border-radius:${config.radius};background:#fff;box-shadow:0 8px 20px rgba(12,38,64,.08);overflow:hidden}.syncetc-doc-card h3{margin:0;color:${config.text};font-size:19px;line-height:1.2;font-weight:900;overflow-wrap:anywhere;word-break:break-word}.syncetc-doc-description{margin:0;color:${config.muted};font-size:14px;line-height:1.55;overflow-wrap:anywhere}.syncetc-doc-meta{color:${config.muted};font-size:12px;line-height:1.4;overflow-wrap:anywhere;word-break:break-word}
      .syncetc-doc-preview{width:100%;aspect-ratio:8.5/11;min-height:320px;max-height:520px;border:1px solid ${config.border};border-radius:14px;background:${rgba(config.primary,.04)};overflow:hidden;display:flex;align-items:center;justify-content:center}.syncetc-doc-preview iframe{width:100%;height:100%;border:0;background:#fff}.syncetc-doc-preview-fallback{padding:14px;color:${config.muted};font-size:13px;line-height:1.45;text-align:center;font-weight:800}.syncetc-doc-card-body{display:grid;gap:8px;min-width:0;flex:1 1 auto}.syncetc-doc-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:auto}.syncetc-doc-button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 14px;border-radius:999px;background:${config.primary};color:#fff!important;text-decoration:none;font-weight:900;font-size:13px;white-space:nowrap;border:1px solid ${config.primary};cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}.syncetc-doc-button:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(12,38,64,.16)}.syncetc-doc-button.secondary{background:#fff;color:${config.primary}!important;border-color:${config.border}}
      .syncetc-docs-note{margin-top:20px;padding:16px 18px;border-radius:${config.radius};border:1px solid ${config.border};background:${rgba(config.primary,.06)};color:${config.muted};font-size:13px;line-height:1.55}.syncetc-docs-empty{padding:22px;border:1px dashed ${config.border};border-radius:${config.radius};background:#fff;color:${config.muted};text-align:center;font-weight:800}.syncetc-doc-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(7,24,42,.72);z-index:2147483000;padding:24px}.syncetc-doc-modal-backdrop.is-open{display:flex}.syncetc-doc-modal{width:min(1100px,96vw);height:min(820px,92vh);background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.38);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.syncetc-doc-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid ${config.border};background:${rgba(config.primary,.06)}}.syncetc-doc-modal-frame{width:100%;height:100%;border:0;background:#fff}@media(max-width:720px){.syncetc-docs-main,.syncetc-docs-hero{padding:20px}.syncetc-docs-list{grid-template-columns:1fr}.syncetc-doc-actions{grid-template-columns:1fr}.syncetc-doc-button{width:100%}.syncetc-doc-preview{min-height:360px;max-height:70vh}}
    `;
  }

  function groupByCategory(docs) {
    return (Array.isArray(docs) ? docs : []).reduce((acc, doc) => {
      const key = cleanText(doc.category || "General") || "General";
      (acc[key] ||= []).push(doc);
      return acc;
    }, {});
  }

  function formatDate(value) {
    if (!value) return "";
    try { return new Date(value).toLocaleDateString(); } catch (_) { return ""; }
  }

  function signedPdfPreviewUrl(url) {
    const clean = cleanText(url);
    if (!clean) return "";
    return clean.includes("#") ? clean : `${clean}#toolbar=0&navpanes=0&view=Fit&page=1`;
  }

  function documentMeta(doc) {
    const parts = [];
    if (doc.original_file_name) parts.push(doc.original_file_name);
    if (doc.version_number) parts.push(`v${doc.version_number}`);
    if (doc.published_at) parts.push(`published ${formatDate(doc.published_at)}`);
    return parts.join(" • ");
  }

  function documentsHtml(payload) {
    const settings = payload.page_settings || {};
    const content = getJson(settings, "content_json");
    const options = getJson(settings, "options_json");
    const docs = Array.isArray(payload.documents) ? payload.documents : [];
    const label = getText(content, "docs_label", getText(content, "hero_eyebrow", "Documents"));
    const title = getText(content, "docs_title", getText(content, "hero_title", settings.title || "Documents & Resources"));
    const intro = getText(content, "docs_intro", getText(content, "hero_intro", settings.intro_text || "Published documents and resources available for public viewing."));
    const helpTitle = getText(content, "docs_help_title", "Available Resources");
    const helpBody = getText(content, "docs_help_body", "Open or download the current published version of each public document below.");
    const emptyMessage = getText(content, "docs_empty_message", "No public documents are available right now.");
    const note = getText(content, "docs_note", getText(content, "note_body", ""));
    const grouped = groupByCategory(docs);
    const categories = Object.keys(grouped).sort();

    return `
      <section class="syncetc-docs-page" data-syncetc-documents-version="${escapeHtml(VERSION)}">
        <div class="syncetc-docs-shell">
          <header class="syncetc-docs-hero">
            ${hasText(label) ? `<div class="syncetc-docs-eyebrow">${escapeHtml(label)}</div>` : ""}
            ${hasText(title) ? `<h1>${escapeHtml(title)}</h1>` : ""}
            ${hasText(intro) ? `<p>${escapeHtml(intro)}</p>` : ""}
          </header>
          <main class="syncetc-docs-main">
            ${getBool(options, "show_docs_intro", true) !== false && (hasText(helpTitle) || hasText(helpBody)) ? `<section class="syncetc-docs-intro">${hasText(helpTitle) ? `<h2>${escapeHtml(helpTitle)}</h2>` : ""}${formatPlainText(helpBody)}</section>` : ""}
            ${categories.length ? `<div class="syncetc-docs-groups">${categories.map((category) => `<details class="syncetc-docs-group" open><summary>${escapeHtml(category)} <span>${grouped[category].length}</span></summary><div class="syncetc-docs-list">${grouped[category].map((doc) => {
              const previewUrl = doc.preview_signed_url || doc.signed_url || doc.download_signed_url || "";
              const downloadUrl = doc.download_signed_url || doc.signed_url || doc.preview_signed_url || "";
              const inlinePreviewUrl = signedPdfPreviewUrl(previewUrl);
              return `<article class="syncetc-doc-card"><h3>${escapeHtml(doc.title || doc.original_file_name || "Document")}</h3><div class="syncetc-doc-preview">${inlinePreviewUrl ? `<iframe src="${escapeHtml(inlinePreviewUrl)}" title="${escapeHtml(doc.title || doc.original_file_name || "Document")} PDF preview"></iframe>` : `<div class="syncetc-doc-preview-fallback">PDF preview unavailable. Use Download.</div>`}</div><div class="syncetc-doc-card-body">${hasText(doc.description) ? `<p class="syncetc-doc-description">${escapeHtml(doc.description)}</p>` : ""}<div class="syncetc-doc-meta">${escapeHtml(documentMeta(doc))}</div></div><div class="syncetc-doc-actions">${previewUrl ? `<button type="button" class="syncetc-doc-button" data-doc-preview="${escapeHtml(previewUrl)}" data-doc-title="${escapeHtml(doc.title || doc.original_file_name || "Document")}">View</button>` : ""}${downloadUrl ? `<a class="syncetc-doc-button secondary" href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener">Download</a>` : `<span class="syncetc-doc-meta">Unavailable</span>`}</div></article>`;
            }).join("")}</div></details>`).join("")}</div>` : `<div class="syncetc-docs-empty">${escapeHtml(emptyMessage)}</div>`}
            ${getBool(options, "show_docs_note", true) !== false && hasText(note) ? `<div class="syncetc-docs-note">${formatPlainText(note)}</div>` : ""}
          </main>
        </div>
        <div class="syncetc-doc-modal-backdrop" id="syncetc-doc-modal-backdrop" aria-hidden="true"><div class="syncetc-doc-modal" role="dialog" aria-modal="true"><div class="syncetc-doc-modal-head"><strong id="syncetc-doc-modal-title">Document preview</strong><button type="button" class="syncetc-doc-button secondary" id="syncetc-doc-modal-close">Close</button></div><iframe class="syncetc-doc-modal-frame" id="syncetc-doc-modal-frame"></iframe></div></div>
      </section>`;
  }

  async function fetchPayload(root) {
    const body = {
      action: "get_documents_page",
      organization_key: root.dataset.organizationKey || root.dataset.customerKey || "test-customer-1",
      site_key: root.dataset.siteKey || "primary",
      page_key: root.dataset.pageKey || "documents",
      render_mode: root.dataset.renderMode || "public",
    };
    const edgeUrl = root.dataset.edgeUrl || DEFAULT_EDGE_URL;
    const response = await fetch(edgeUrl, { method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({ ok: false, message: "Invalid JSON response." }));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Documents page could not load.");
    return payload;
  }

  function renderError(root, error) {
    const message = error instanceof Error ? error.message : String(error);
    root.innerHTML = `<div class="syncetc-public-error"><strong>Documents page error:</strong> ${escapeHtml(message)}</div>`;
  }

  function bindPreview(root) {
    const backdrop = root.querySelector("#syncetc-doc-modal-backdrop");
    const frame = root.querySelector("#syncetc-doc-modal-frame");
    const title = root.querySelector("#syncetc-doc-modal-title");
    const close = root.querySelector("#syncetc-doc-modal-close");
    function closeModal() {
      if (!backdrop || !frame) return;
      backdrop.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");
      frame.src = "about:blank";
    }
    root.querySelectorAll("[data-doc-preview]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!backdrop || !frame) return;
        if (title) title.textContent = button.dataset.docTitle || "Document preview";
        frame.src = button.dataset.docPreview || "about:blank";
        backdrop.classList.add("is-open");
        backdrop.setAttribute("aria-hidden", "false");
      });
    });
    close?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  }

  async function boot() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    root.innerHTML = `<div class="syncetc-public-error">Loading documents…</div>`;
    try {
      const payload = await fetchPayload(root);
      const config = styleConfig(payload);
      const bodyHtml = documentsHtml(payload);
      const extraCss = buildCss(config);
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
        window.SyncEtcPublicShell.render({ root, payload, activePageKey: payload.page?.page_key || "documents", extraCss, bodyHtml });
      } else {
        root.innerHTML = `<style>${extraCss}</style>${bodyHtml}`;
      }
      bindPreview(root);
    } catch (error) {
      console.error("Documents page failed", error);
      renderError(root, error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
