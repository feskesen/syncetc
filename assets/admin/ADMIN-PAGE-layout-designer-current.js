// ADMIN-PAGE-layout-designer-current.js
// Internal Version: 2026-06-04-009
// Purpose: Layout Designer v8: corrected admin gating layout and tightened dirty-state tracking so navigation/preview selectors do not create false unsaved-change warnings.
// Backend contract unchanged from v2. Uses update_active_style_profile and get_active_style_profile.
// Backend diagnostics include Copy result button.

(function () {
  "use strict";

  const VERSION = "2026-06-04-009";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-layout-designer-root";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let selectedCustomerId = "";
  let activeStyleProfile = null;
  let customerPages = [];
  let selectedPreviewPageId = "";
  let isDirty = false;
  let isSaving = false;
  let isHydrating = false;
  let cleanSignature = "";
  const DIRTY_MESSAGE = "You have unsaved Layout Designer changes. Leave anyway?";
  let savedProfiles = [];
  let styleHistory = [];

  const PRESETS = {
    "clean-blue": {
      label: "Clean Blue",
      preset_key: "clean-blue",
      preset_source: "system",
      colors_json: { brand_primary: "#1f4f82", brand_secondary: "#eef3f8", surface: "#ffffff", text: "#172033" },
      typography_json: { font_family: "system", heading_scale: "normal", body_scale: "normal" },
      spacing_json: { page_width: "normal", section_spacing: "normal", card_padding: "normal" },
      layout_json: { preset_layout: "standard", default_width: "normal", header: "standard", hero: "standard", section_rhythm: "normal", divider_style: "subtle", surface_structure: "cards" },
      effects_json: { shadows: "soft", borders: "standard", corners: "soft", gradients: "subtle", motion: "none", emphasis_style: "labels", surface_style: "panels" },
      media_json: { image_treatment: "inset", hero_media_treatment: "standard", background: "none", background_opacity: 0.18, background_overlay: "soft", background_blur: "none", mobile_background: "hide" },
      component_json: { show_global_banner_default: false, show_scroller_default: false, banner_style: "standard", cta_style: "standard", card_component_style: "standard", empty_state_style: "standard" },
      preview_json: { preview_mode: "generic", preview_page_key: "home", preview_customer_page_id: "", use_real_page_data: false },
      density: "normal",
      card_style: "standard",
      hero_style: "standard"
    },
    "ops-slate": {
      label: "Ops Slate",
      preset_key: "ops-slate",
      preset_source: "system",
      colors_json: { brand_primary: "#24324a", brand_secondary: "#e8edf4", surface: "#ffffff", text: "#111827" },
      typography_json: { font_family: "system", heading_scale: "compact", body_scale: "normal" },
      spacing_json: { page_width: "wide", section_spacing: "compact", card_padding: "compact" },
      layout_json: { preset_layout: "ops-dashboard", default_width: "wide", header: "dashboard", hero: "compact", section_rhythm: "divided", divider_style: "section-rules", surface_structure: "panels" },
      effects_json: { shadows: "hairline", borders: "hairline", corners: "soft", gradients: "none", motion: "none", emphasis_style: "labels", surface_style: "panels" },
      media_json: { image_treatment: "inset", hero_media_treatment: "compact", background: "soft-tint", background_opacity: 0.12, background_overlay: "soft", background_blur: "none", mobile_background: "hide" },
      component_json: { show_global_banner_default: false, show_scroller_default: false, banner_style: "ops", cta_style: "compact", card_component_style: "panel", empty_state_style: "compact" },
      preview_json: { preview_mode: "generic", preview_page_key: "aircraft", preview_customer_page_id: "", use_real_page_data: false },
      density: "compact",
      card_style: "panel",
      hero_style: "dashboard"
    },
    "field-green": {
      label: "Field Green",
      preset_key: "field-green",
      preset_source: "system",
      colors_json: { brand_primary: "#265c2b", brand_secondary: "#edf7ed", surface: "#ffffff", text: "#142417" },
      typography_json: { font_family: "system", heading_scale: "normal", body_scale: "normal" },
      spacing_json: { page_width: "wide", section_spacing: "normal", card_padding: "normal" },
      layout_json: { preset_layout: "field-dashboard", default_width: "wide", header: "standard", hero: "bold", section_rhythm: "normal", divider_style: "subtle", surface_structure: "cards" },
      effects_json: { shadows: "soft", borders: "standard", corners: "soft", gradients: "subtle", motion: "none", emphasis_style: "badges", surface_style: "soft-panels" },
      media_json: { image_treatment: "inset", hero_media_treatment: "wide", background: "soft-tint", background_opacity: 0.18, background_overlay: "green-soft", background_blur: "none", mobile_background: "soft-tint" },
      component_json: { show_global_banner_default: false, show_scroller_default: true, banner_style: "soft", cta_style: "rounded", card_component_style: "soft", empty_state_style: "friendly" },
      preview_json: { preview_mode: "generic", preview_page_key: "aircraft", preview_customer_page_id: "", use_real_page_data: false },
      density: "normal",
      card_style: "soft",
      hero_style: "bold"
    }
  };

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(message) {
    const el = document.getElementById("se-status");
    if (el) el.textContent = message;
  }

  function setOutput(value) {
    const el = document.getElementById("se-output");
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  async function copyOutput() {
    const el = document.getElementById("se-output");
    const text = el ? el.textContent || "" : "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Backend result copied to clipboard.");
    } catch {
      setStatus("Copy failed. Select the backend result manually.");
    }
  }

  function stableStringify(value) {
    const seen = new WeakSet();
    function normalize(input) {
      if (input === null || typeof input !== "object") return input;
      if (seen.has(input)) return null;
      seen.add(input);
      if (Array.isArray(input)) return input.map(normalize);
      return Object.keys(input).sort().reduce((acc, key) => {
        acc[key] = normalize(input[key]);
        return acc;
      }, {});
    }
    return JSON.stringify(normalize(value));
  }

  function getDirtyPayload() {
    const payload = getFormPayload();
    // Preview controls are working controls, not customer-facing style commitments.
    // They should not create false nav-away warnings.
    delete payload.preview_json;
    return payload;
  }

  function getDirtySignature() {
    try {
      return stableStringify(getDirtyPayload());
    } catch {
      return "";
    }
  }

  function syncShellDirtyState() {
    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setDirty === "function") {
      window.SyncEtcAdminShell.setDirty(isDirty, DIRTY_MESSAGE);
    }
  }


  function setAuthGate(authenticated, email = "") {
    isAuthenticated = !!authenticated;
    authenticatedEmail = isAuthenticated ? String(email || "") : "";

    const root = ensureRoot();
    root.dataset.authenticated = isAuthenticated ? "true" : "false";

    root.querySelectorAll("[data-auth-required='true']").forEach((el) => {
      el.style.display = isAuthenticated ? "" : "none";
    });

    const notice = document.getElementById("se-auth-gate-notice");
    if (notice) notice.style.display = isAuthenticated ? "none" : "block";

    const authLabel = document.getElementById("se-auth-label");
    if (authLabel) {
      authLabel.textContent = isAuthenticated
        ? `Authenticated: ${authenticatedEmail || "active session"}`
        : "Not authenticated";
      authLabel.className = `se-badge ${isAuthenticated ? "ok" : "warn"}`;
    }

    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setAuthState === "function") {
      window.SyncEtcAdminShell.setAuthState({
        required: true,
        authenticated: isAuthenticated,
        email: authenticatedEmail
      });
    }
  }

  function showAuthRequiredMessage(pageName = "this admin page") {
    setStatus(`Log in before using ${pageName}.`);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase JS did not load correctly.");

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;

    const { data } = await supabaseClient.auth.getSession();
    if (data?.session?.user?.email) {
      setAuthGate(true, data.session.user.email);
      setStatus(`Logged in as ${data.session.user.email}`);
      await loadCustomers();
    } else {
      setAuthGate(false);
      setStatus("No active login session. Log in first.");
    }
  }

  async function getAccessToken() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) {
      setAuthGate(false);
      throw new Error("No active Supabase Auth session. Log in first.");
    }
    return token;
  }

  async function callCoreAdminAction(action, payload = {}) {
    const token = await getAccessToken();
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ action, ...payload })
    });

    let result;
    try {
      result = await response.json();
    } catch {
      result = { ok: false, error: "non_json_response", status: response.status, text: await response.text() };
    }

    setOutput({ http_status: response.status, result });

    if (!response.ok || result.ok === false) {
      const message = result.message || result.error || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return result;
  }

  function getValue(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  }

  function getChecked(id) {
    const el = document.getElementById(id);
    return Boolean(el?.checked);
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";

    if (["se-brand-primary", "se-brand-secondary", "se-surface", "se-text"].includes(id)) {
      syncColorControl(id, value);
    }
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  }

  function setDirtyState(value) {
    isDirty = !!value;
    updateDirtyIndicator();
    syncShellDirtyState();
  }

  function markDirty() {
    if (isSaving || isHydrating) return;
    const currentSignature = getDirtySignature();
    setDirtyState(Boolean(cleanSignature && currentSignature && currentSignature !== cleanSignature));
  }

  function markClean() {
    cleanSignature = getDirtySignature();
    setDirtyState(false);
  }

  function updateDirtyIndicator() {
    const el = document.getElementById("se-dirty-indicator");
    if (!el) return;
    el.textContent = isDirty ? "Unsaved changes" : "Saved / clean";
    el.className = isDirty ? "se-dirty is-dirty" : "se-dirty";
  }

  function confirmDiscardChanges(message) {
    if (!isDirty) return true;
    return window.confirm(message || "You have unsaved Layout Designer changes. Continue and discard them?");
  }

  function updateCurrentPresetDisplay(profile) {
    const el = document.getElementById("se-current-preset");
    if (!el) return;

    const presetName = profile?.profile_name || "Default";
    const source = profile?.preset_source || "custom";
    const key = profile?.preset_key || "none";
    el.textContent = `Current profile: ${presetName} | Source: ${source} | Key: ${key}`;
  }

  function getFormPayload() {
    const colors_json = {
      brand_primary: getValue("se-brand-primary", "#1f4f82"),
      brand_secondary: getValue("se-brand-secondary", "#eef3f8"),
      surface: getValue("se-surface", "#ffffff"),
      text: getValue("se-text", "#172033")
    };

    const typography_json = {
      font_family: getValue("se-font-family", "system"),
      heading_scale: getValue("se-heading-scale", "normal"),
      body_scale: getValue("se-body-scale", "normal")
    };

    const spacing_json = {
      page_width: getValue("se-page-width", "normal"),
      section_spacing: getValue("se-section-spacing", "normal"),
      card_padding: getValue("se-card-padding", "normal")
    };

    const layout_json = {
      preset_layout: getValue("se-preset-layout", "standard"),
      default_width: getValue("se-default-width", "normal"),
      header: getValue("se-header", "standard"),
      hero: getValue("se-hero", "standard"),
      section_rhythm: getValue("se-section-rhythm", "normal"),
      divider_style: getValue("se-divider-style", "subtle"),
      surface_structure: getValue("se-surface-structure", "cards")
    };

    const effects_json = {
      shadows: getValue("se-shadows", "soft"),
      borders: getValue("se-borders", "standard"),
      corners: getValue("se-corners", "soft"),
      gradients: getValue("se-gradients", "subtle"),
      motion: getValue("se-motion", "none"),
      emphasis_style: getValue("se-emphasis-style", "labels"),
      surface_style: getValue("se-surface-style", "panels")
    };

    const media_json = {
      image_treatment: getValue("se-image-treatment", "inset"),
      hero_media_treatment: getValue("se-hero-media-treatment", "standard"),
      background: getValue("se-background", "none"),
      background_opacity: Number(getValue("se-background-opacity", "0.18")),
      background_overlay: getValue("se-background-overlay", "soft"),
      background_blur: getValue("se-background-blur", "none"),
      mobile_background: getValue("se-mobile-background", "hide")
    };

    const component_json = {
      show_global_banner_default: getChecked("se-show-global-banner-default"),
      show_scroller_default: getChecked("se-show-scroller-default"),
      banner_style: getValue("se-banner-style", "standard"),
      cta_style: getValue("se-cta-style", "standard"),
      card_component_style: getValue("se-card-component-style", "standard"),
      empty_state_style: getValue("se-empty-state-style", "standard")
    };

    const preview_json = {
      preview_mode: getValue("se-preview-mode", "generic"),
      preview_page_key: getValue("se-preview-page-key", "home"),
      preview_customer_page_id: getValue("se-preview-customer-page-id", ""),
      use_real_page_data: getChecked("se-use-real-page-data")
    };

    return {
      profile_name: getValue("se-profile-name", "Default"),
      preset_key: activeStyleProfile?.preset_key || "",
      preset_source: activeStyleProfile?.preset_source || "custom",
      colors_json,
      typography_json,
      spacing_json,
      layout_json,
      effects_json,
      media_json,
      component_json,
      preview_json,
      density: getValue("se-density", "normal"),
      card_style: getValue("se-card-style", "standard"),
      hero_style: getValue("se-hero-style", "standard")
    };
  }

  function applyPayloadToForm(profile) {
    isHydrating = true;
    const colors = profile?.colors_json || {};
    const typography = profile?.typography_json || {};
    const spacing = profile?.spacing_json || {};
    const layout = profile?.layout_json || {};
    const effects = profile?.effects_json || {};
    const media = profile?.media_json || {};
    const component = profile?.component_json || {};
    const preview = profile?.preview_json || {};

    setValue("se-profile-name", profile?.profile_name || "Default");
    updateCurrentPresetDisplay(profile);

    setValue("se-brand-primary", colors.brand_primary || "#1f4f82");
    setValue("se-brand-secondary", colors.brand_secondary || "#eef3f8");
    setValue("se-surface", colors.surface || "#ffffff");
    setValue("se-text", colors.text || "#172033");

    setValue("se-font-family", typography.font_family || "system");
    setValue("se-heading-scale", typography.heading_scale || "normal");
    setValue("se-body-scale", typography.body_scale || "normal");

    setValue("se-page-width", spacing.page_width || "normal");
    setValue("se-section-spacing", spacing.section_spacing || "normal");
    setValue("se-card-padding", spacing.card_padding || "normal");

    setValue("se-preset-layout", layout.preset_layout || "standard");
    setValue("se-default-width", layout.default_width || "normal");
    setValue("se-header", layout.header || "standard");
    setValue("se-hero", layout.hero || "standard");
    setValue("se-section-rhythm", layout.section_rhythm || "normal");
    setValue("se-divider-style", layout.divider_style || "subtle");
    setValue("se-surface-structure", layout.surface_structure || "cards");

    setValue("se-shadows", effects.shadows || "soft");
    setValue("se-borders", effects.borders || "standard");
    setValue("se-corners", effects.corners || "soft");
    setValue("se-gradients", effects.gradients || "subtle");
    setValue("se-motion", effects.motion || "none");
    setValue("se-emphasis-style", effects.emphasis_style || "labels");
    setValue("se-surface-style", effects.surface_style || "panels");

    setValue("se-image-treatment", media.image_treatment || "inset");
    setValue("se-hero-media-treatment", media.hero_media_treatment || "standard");
    setValue("se-background", media.background || "none");
    setValue("se-background-opacity", media.background_opacity ?? "0.18");
    setValue("se-background-overlay", media.background_overlay || "soft");
    setValue("se-background-blur", media.background_blur || "none");
    setValue("se-mobile-background", media.mobile_background || "hide");

    setChecked("se-show-global-banner-default", component.show_global_banner_default);
    setChecked("se-show-scroller-default", component.show_scroller_default);
    setValue("se-banner-style", component.banner_style || "standard");
    setValue("se-cta-style", component.cta_style || "standard");
    setValue("se-card-component-style", component.card_component_style || "standard");
    setValue("se-empty-state-style", component.empty_state_style || "standard");

    setValue("se-preview-mode", preview.preview_mode || "generic");
    setValue("se-preview-page-key", preview.preview_page_key || "home");
    if (preview.preview_customer_page_id) selectedPreviewPageId = String(preview.preview_customer_page_id);
    renderPreviewPageSelect();
    setValue("se-preview-customer-page-id", selectedPreviewPageId || "");
    setChecked("se-use-real-page-data", preview.use_real_page_data);

    setValue("se-density", profile?.density || "normal");
    setValue("se-card-style", profile?.card_style || "standard");
    setValue("se-hero-style", profile?.hero_style || "standard");

    renderPreview();
    isHydrating = false;
  }

  function renderPreview() {
    const payload = getFormPayload();
    const colors = payload.colors_json;
    const spacing = payload.spacing_json;
    const layout = payload.layout_json;
    const effects = payload.effects_json;
    const media = payload.media_json;
    const component = payload.component_json;
    const typography = payload.typography_json;

    const widthChoice = layout.default_width || spacing.page_width || "normal";
    const width = widthChoice === "wide" ? "100%" : widthChoice === "narrow" ? "760px" : "960px";
    const padding = spacing.card_padding === "compact" ? "14px" : spacing.card_padding === "generous" ? "28px" : "20px";
    const heroPadding = payload.hero_style === "bold" || layout.hero === "bold" ? "32px" : payload.hero_style === "dashboard" || layout.hero === "compact" ? "18px" : "24px";
    const radius = effects.corners === "sharp" || payload.card_style === "sharp" ? "4px" : effects.corners === "pill" ? "24px" : "14px";
    const shadow = effects.shadows === "none" ? "none" : effects.shadows === "strong" ? "0 14px 36px rgba(23,32,51,.18)" : "0 8px 22px rgba(23,32,51,.08)";
    const headingSize = typography.heading_scale === "compact" ? "24px" : typography.heading_scale === "large" ? "34px" : "29px";
    const secondary = colors.brand_secondary || "#eef3f8";

    const preview = document.getElementById("se-preview");
    if (!preview) return;

    preview.innerHTML = `
      <div style="max-width:${width};margin:0 auto;background:${media.background === "soft-tint" ? secondary : "transparent"};padding:18px;border-radius:${radius};">
        ${component.show_global_banner_default ? `<div style="background:${colors.brand_primary};color:white;border-radius:${radius};padding:10px 14px;margin-bottom:12px;font-weight:800;">Global banner default preview</div>` : ""}
        ${component.show_scroller_default ? `<div style="border:1px solid ${secondary};border-radius:999px;padding:8px 12px;margin-bottom:12px;color:${colors.brand_primary};font-weight:800;">Scroller default preview</div>` : ""}
        <div style="border:1px solid ${secondary};border-radius:${radius};background:${colors.surface};padding:${padding};color:${colors.text};box-shadow:${shadow};">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid ${secondary};padding-bottom:14px;margin-bottom:14px;">
            <div style="font-weight:900;color:${colors.brand_primary};">SyncEtc Preview</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Home</span>
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Aircraft</span>
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Calendar</span>
            </div>
          </div>
          <div style="background:${colors.brand_primary};color:white;border-radius:${radius};padding:${heroPadding};margin-bottom:14px;">
            <div style="display:inline-block;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;margin-bottom:10px;">${escapeHtml(effects.emphasis_style || "LABELS")}</div>
            <h2 style="margin:0 0 8px 0;font-size:${headingSize};line-height:1.1;">Customer Page Title</h2>
            <p style="margin:0;line-height:1.5;">This preview remains visible while the controls scroll.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            <div style="border:1px solid ${secondary};border-radius:${radius};padding:${padding};"><strong>Card one</strong><br><span style="font-size:13px;">${escapeHtml(layout.surface_structure)}</span></div>
            <div style="border:1px solid ${secondary};border-radius:${radius};padding:${padding};"><strong>Card two</strong><br><span style="font-size:13px;">${escapeHtml(payload.density)} density</span></div>
            <div style="border:1px solid ${secondary};border-radius:${radius};padding:${padding};"><strong>Card three</strong><br><span style="font-size:13px;">${escapeHtml(media.image_treatment)} images</span></div>
          </div>
        </div>
      </div>
    `;
  }

  async function renderRealPagePreview() {
    const useRealPageData = getChecked("se-use-real-page-data");
    const previewMode = getValue("se-preview-mode", "generic");
    const customerPageId = getValue("se-preview-customer-page-id", selectedPreviewPageId || "");

    if (!useRealPageData && previewMode !== "real-page") {
      renderPreview();
      return;
    }

    renderPreview();

    if (!customerPageId) return;

    try {
      const data = await loadPreviewPageData(customerPageId);
      const page = data?.customer_page || {};
      const settings = data?.page_settings || {};
      const content = settings.content_json || {};
      const labels = settings.labels_json || {};
      const preview = document.getElementById("se-preview");
      if (!preview) return;

      const title = settings.title || content.hero_title || page.nav_label || "Customer Page Title";
      const intro = settings.intro_text || content.hero_intro || "This is real saved page data rendered through the Layout Designer preview.";
      const eyebrow = content.hero_eyebrow || page.page_key || "PAGE PREVIEW";
      const primaryLabel = labels.primary_cta_label || "Primary Action";

      const payload = getFormPayload();
      const colors = payload.colors_json;
      const effects = payload.effects_json;
      const secondary = colors.brand_secondary || "#eef3f8";

      const realNotice = `
        <div style="border:1px solid ${secondary};background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:${colors.text};">
          Real page preview: <strong>${escapeHtml(page.nav_label || page.page_key || "Selected page")}</strong>
        </div>
      `;

      preview.innerHTML = realNotice + preview.innerHTML.replace(
        /<div style="display:inline-block;border:1px solid rgba\(255,255,255,.45\);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;margin-bottom:10px;">.*?<\/div>\s*<h2 style="margin:0 0 8px 0;font-size:.*?;line-height:1.1;">.*?<\/h2>\s*<p style="margin:0;line-height:1.5;">.*?<\/p>/s,
        `<div style="display:inline-block;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;margin-bottom:10px;">${escapeHtml(eyebrow || effects.emphasis_style || "PAGE PREVIEW")}</div>
            <h2 style="margin:0 0 8px 0;font-size:29px;line-height:1.1;">${escapeHtml(title)}</h2>
            <p style="margin:0;line-height:1.5;">${escapeHtml(intro)}</p>
            <div style="margin-top:14px;display:inline-block;background:white;color:${colors.brand_primary};border-radius:999px;padding:8px 12px;font-weight:900;font-size:13px;">${escapeHtml(primaryLabel)}</div>`
      );
    } catch (error) {
      setStatus("Real page preview failed.");
      setOutput({ ok: false, event: "real_page_preview_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function controlSection(title, bodyHtml, open = false) {
    return `
      <details class="se-control-section" ${open ? "open" : ""}>
        <summary>${escapeHtml(title)}</summary>
        <div class="se-section-body">${bodyHtml}</div>
      </details>
    `;
  }

  function selectField(id, label, options) {
    return `
      <label class="se-field">
        <span class="se-label">${escapeHtml(label)}</span>
        <select id="${escapeHtml(id)}" class="se-select">
          ${options.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function inputField(id, label, type = "text", extra = "") {
    return `<label class="se-field"><span class="se-label">${escapeHtml(label)}</span><input id="${escapeHtml(id)}" class="se-input" type="${type}" ${extra}></label>`;
  }

  function colorField(id, label) {
    return `
      <label class="se-field">
        <span class="se-label">${escapeHtml(label)}</span>
        <div class="se-color-row">
          <input id="${escapeHtml(id)}-picker" class="se-color-picker" type="color" value="#1f4f82">
          <input id="${escapeHtml(id)}" class="se-input se-color-hex" type="text" value="#1f4f82" autocomplete="off" spellcheck="false">
          <span id="${escapeHtml(id)}-swatch" class="se-color-swatch" aria-hidden="true"></span>
        </div>
      </label>
    `;
  }

  function isValidHexColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
  }

  function syncColorControl(id, value) {
    const textInput = document.getElementById(id);
    const picker = document.getElementById(`${id}-picker`);
    const swatch = document.getElementById(`${id}-swatch`);
    const color = isValidHexColor(value) ? String(value).trim() : "#1f4f82";

    if (textInput) textInput.value = color;
    if (picker) picker.value = color;
    if (swatch) swatch.style.background = color;
  }

  function bindColorPair(id) {
    const textInput = document.getElementById(id);
    const picker = document.getElementById(`${id}-picker`);
    const swatch = document.getElementById(`${id}-swatch`);

    if (picker && textInput) {
      picker.addEventListener("input", () => {
        textInput.value = picker.value;
        if (swatch) swatch.style.background = picker.value;
        markDirty();
        renderPreview();
      });
    }

    if (textInput && picker) {
      textInput.addEventListener("input", () => {
        if (isValidHexColor(textInput.value)) {
          picker.value = textInput.value;
          if (swatch) swatch.style.background = textInput.value;
          markDirty();
        renderPreview();
        }
      });

      textInput.addEventListener("blur", () => {
        if (!isValidHexColor(textInput.value)) {
          textInput.value = picker.value;
        }
        if (swatch) swatch.style.background = textInput.value;
        renderPreview();
      });
    }
  }

  function checkboxField(id, label) {
    return `<label class="se-check"><input id="${escapeHtml(id)}" type="checkbox"><span class="se-label">${escapeHtml(label)}</span></label>`;
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px 18px 26px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1220px;margin:0 auto;}
        .se-header-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:15px;line-height:1.45;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-main{display:grid;grid-template-columns:380px minmax(0,1fr);gap:14px;align-items:start;}
        .se-panel{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);} 
        .se-login-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) auto auto auto;gap:10px;align-items:end;}
        .se-auth-card{padding:18px;}
        .se-controls{position:sticky;top:74px;max-height:calc(100vh - 92px);display:flex;flex-direction:column;overflow:hidden;}
        .se-controls-top{padding:16px;border-bottom:1px solid #e3e9f2;}
        .se-controls-scroll{padding:12px 16px;overflow:auto;}
        .se-controls-bottom{padding:12px 16px;border-top:1px solid #e3e9f2;background:#fbfcfe;}
        .se-preview-panel{position:sticky;top:74px;max-height:calc(100vh - 92px);overflow:auto;padding:18px;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;padding:16px;margin-bottom:14px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-check{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
        .se-check input{width:18px;height:18px;}
        .se-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.full{width:100%;justify-content:center;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}.se-color-row{display:grid;grid-template-columns:48px minmax(0,1fr) 30px;gap:8px;align-items:center;}.se-color-picker{width:48px;height:42px;border:1px solid #c7d2e2;border-radius:10px;padding:2px;background:#fff;cursor:pointer;}.se-color-hex{font-family:Consolas,Monaco,monospace;}.se-color-swatch{display:block;width:30px;height:30px;border-radius:999px;border:1px solid #c7d2e2;box-shadow:inset 0 0 0 2px rgba(255,255,255,.7);}.se-diagnostics{margin-top:16px;background:#fff;border:1px solid #d9e0ea;border-radius:14px;padding:16px;}.se-dirty{display:inline-flex;border-radius:999px;padding:6px 10px;background:#edf7ed;color:#265c2b;font-size:12px;font-weight:900;margin:0 0 12px 0;}.se-dirty.is-dirty{background:#fff0d9;color:#8a5200;}.se-current-preset{padding:10px 12px;border:1px solid #d9e0ea;background:#f7f9fc;border-radius:10px;font-size:13px;font-weight:800;margin-bottom:10px;color:#26344d;}.se-help{font-size:12px;line-height:1.35;color:#5d6b82;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:10px;padding:9px 10px;margin:-4px 0 12px 0;}.se-history-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #d9e0ea;border-radius:10px;padding:10px;margin-bottom:8px;background:#fbfcfe;}.se-history-meta{font-size:12px;color:#5d6b82;line-height:1.35;}
        .se-control-section{border:1px solid #d8e1ed;border-radius:12px;margin-bottom:10px;background:#fbfcfe;overflow:hidden;}
        .se-control-section summary{cursor:pointer;font-weight:900;color:#1f2a44;padding:12px 13px;list-style:none;}
        .se-control-section summary::-webkit-details-marker{display:none;}
        .se-control-section summary:after{content:"+";float:right;color:#1f4f82;font-weight:900;}
        .se-control-section[open] summary:after{content:"–";}
        .se-section-body{border-top:1px solid #e3e9f2;padding:12px 13px;}
        .se-preview-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
        @media(max-width:980px){
          .se-main,.se-login-grid{grid-template-columns:1fr;}
          .se-controls,.se-preview-panel{position:relative;top:auto;max-height:none;}
        }

        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-auth-gate{display:block;border-style:dashed;padding:18px;margin-bottom:14px;}
      </style>

      <main class="se-wrap">
        <section class="se-header-card">
          <h1 class="se-title">Layout Designer</h1>
          <p class="se-subtitle">Customer-wide style profile controls. System presets are starting points; saved design profiles are reusable customer designs.</p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-layout-designer-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card se-auth-card">
          <div class="se-login-grid">
            <label class="se-field"><span class="se-label">Email</span><input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username"></label>
            <label class="se-field"><span class="se-label">Password</span><input id="se-password" class="se-input" type="password" autocomplete="current-password"></label>
            <button id="se-login" class="se-button" type="button">Log in</button>
            <button id="se-logout" class="se-button secondary" type="button">Log out</button>
            <button id="se-refresh" class="se-button secondary" type="button">Refresh</button>
          </div>
          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>

        <section id="se-auth-gate-notice" class="se-card se-auth-gate">
          <h2 class="se-title" style="font-size:22px;">Login required</h2>
          <p class="se-subtitle">Layout Designer controls are hidden until a valid platform-admin session is active. Backend permissions still enforce access; this gate prevents accidental viewing/editing while logged out.</p>
        </section>

        <section class="se-main" data-auth-required="true">
          <aside class="se-panel se-controls">
            <div class="se-controls-top">
              <div>
                <label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label>
                <label class="se-field"><span class="se-label">Apply system preset</span><select id="se-preset" class="se-select"><option value="">Choose preset...</option>${Object.entries(PRESETS).map(([key,preset])=>`<option value="${escapeHtml(key)}">${escapeHtml(preset.label)}</option>`).join("")}</select></label>
                <div class="se-help">System presets are starting points. They preview immediately but do not save until you click Save to customer.</div>
                <label class="se-field"><span class="se-label">Apply saved design profile</span><select id="se-saved-profile-select" class="se-select"><option value="">Load saved profiles...</option></select></label>
                <div class="se-help">Saved design profiles are reusable customer-specific designs created from the current controls.</div>
                <button id="se-apply-saved-profile" class="se-button secondary full" type="button">Apply Saved Design Profile</button>
              </div>
            </div>

            <div class="se-controls-scroll">
              ${controlSection("Profile", `
                <div id="se-current-preset" class="se-current-preset">Current profile: loading...</div>
                <div id="se-dirty-indicator" class="se-dirty">Saved / clean</div>
                ${inputField("se-profile-name", "Active Profile Name")}
                <div class="se-actions">
                  <button id="se-save-new-profile" class="se-button secondary full">Save as New Design Profile</button>
                </div>
              `, true)}

              ${controlSection("Colors", `
                ${colorField("se-brand-primary", "Brand Primary")}
                ${colorField("se-brand-secondary", "Brand Secondary")}
                ${colorField("se-surface", "Surface")}
                ${colorField("se-text", "Text")}
              `, true)}

              ${controlSection("Typography", `
                ${selectField("se-font-family", "Font Family", ["system"])}
                ${selectField("se-heading-scale", "Heading Scale", ["compact","normal","large"])}
                ${selectField("se-body-scale", "Body Scale", ["compact","normal","large"])}
              `)}

              ${controlSection("Layout", `
                ${selectField("se-preset-layout", "Preset Layout", ["standard","ops-dashboard","field-dashboard","marketing"])}
                ${selectField("se-default-width", "Default Width", ["narrow","normal","wide"])}
                ${selectField("se-header", "Header", ["standard","dashboard","compact"])}
                ${selectField("se-hero", "Hero", ["standard","compact","bold"])}
                ${selectField("se-section-rhythm", "Section Rhythm", ["compact","normal","divided","generous"])}
                ${selectField("se-surface-structure", "Surface Structure", ["cards","panels","open"])}
              `)}

              ${controlSection("Spacing", `
                ${selectField("se-page-width", "Page Width", ["narrow","normal","wide"])}
                ${selectField("se-section-spacing", "Section Spacing", ["compact","normal","generous"])}
                ${selectField("se-card-padding", "Card Padding", ["compact","normal","generous"])}
                ${selectField("se-density", "Density", ["compact","normal","comfortable"])}
              `)}

              ${controlSection("Effects", `
                ${selectField("se-shadows", "Shadows", ["none","soft","strong","hairline"])}
                ${selectField("se-borders", "Borders", ["none","standard","hairline"])}
                ${selectField("se-corners", "Corners", ["sharp","soft","pill"])}
                ${selectField("se-gradients", "Gradients", ["none","subtle","bold"])}
                ${selectField("se-motion", "Motion", ["none","subtle"])}
                ${selectField("se-divider-style", "Divider Style", ["none","subtle","section-rules"])}
                ${selectField("se-emphasis-style", "Emphasis Style", ["labels","badges","bars"])}
                ${selectField("se-surface-style", "Surface Style", ["panels","soft-panels","flat"])}
                ${selectField("se-card-style", "Card Style", ["standard","soft","panel","sharp"])}
                ${selectField("se-hero-style", "Hero Style", ["standard","bold","dashboard"])}
              `)}

              ${controlSection("Media / Background", `
                ${selectField("se-image-treatment", "Image Treatment", ["none","inset","cover","framed"])}
                ${selectField("se-hero-media-treatment", "Hero Media Treatment", ["standard","compact","wide"])}
                ${selectField("se-background", "Background", ["none","soft-tint","image"])}
                ${inputField("se-background-opacity", "Background Opacity", "number", 'min="0" max="1" step="0.01"')}
                ${selectField("se-background-overlay", "Background Overlay", ["none","soft","green-soft","dark"])}
                ${selectField("se-background-blur", "Background Blur", ["none","soft","strong"])}
                ${selectField("se-mobile-background", "Mobile Background", ["hide","soft-tint","same"])}
              `)}

              ${controlSection("Component Defaults", `
                ${checkboxField("se-show-global-banner-default", "Show global banner by default")}
                ${checkboxField("se-show-scroller-default", "Show scroller by default")}
                ${selectField("se-banner-style", "Banner Style", ["standard","soft","ops"])}
                ${selectField("se-cta-style", "CTA Style", ["standard","compact","rounded"])}
                ${selectField("se-card-component-style", "Card Component Style", ["standard","panel","soft"])}
                ${selectField("se-empty-state-style", "Empty State Style", ["standard","compact","friendly"])}
              `)}

              ${controlSection("Preview", `
                ${selectField("se-preview-mode", "Preview Mode", ["generic","real-page"])}
                ${selectField("se-preview-page-key", "Preview Page Key", ["home","aircraft","calendar","documents"])}
                <label class="se-field"><span class="se-label">Enabled Page Preview</span><select id="se-preview-customer-page-id" class="se-select"><option value="">Load customer pages...</option></select></label>
                ${checkboxField("se-use-real-page-data", "Use real page data")}
              `)}

            </div>

            <div class="se-controls-bottom" data-auth-required="true">
              <button id="se-save" class="se-button full">Save to customer</button>
              <button id="se-reset-unsaved" class="se-button secondary full" type="button" style="margin-top:8px;">Reset unsaved changes</button>
            </div>
          </aside>

          <section class="se-panel se-preview-panel" data-auth-required="true">
            <div class="se-preview-title">
              <div>
                <h2 class="se-title" style="font-size:22px;">Preview</h2>
                <p class="se-subtitle">Always visible while style controls scroll.</p>
              </div>
              <button id="se-preview-refresh" class="se-button secondary">Refresh preview</button>
            </div>
            <div id="se-preview"></div>

            <section class="se-diagnostics">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <h3 style="margin:0 0 4px 0;font-size:18px;">Backend Result</h3>
                  <p class="se-subtitle">Visible during development so saves and reloads can be verified quickly.</p>
                </div>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>

            <section class="se-diagnostics">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <h3 style="margin:0 0 4px 0;font-size:18px;">History / Restore</h3>
                  <p class="se-subtitle">Shows useful recent restore points for this customer.</p>
                </div>
                <button id="se-refresh-history" class="se-button secondary">Refresh history</button>
              </div>
              <div id="se-history-list" style="margin-top:12px;">No history loaded yet.</div>
            </section>
          </section>
        </section>
      </main>
    `;
  }

  function renderCustomerSelect() {
    const select = document.getElementById("se-customer-select");
    if (!select) return;
    if (!customers.length) {
      select.innerHTML = `<option value="">No customers found</option>`;
      return;
    }
    select.innerHTML = `<option value="">Select customer...</option>` + customers.map((customer) => `
      <option value="${escapeHtml(customer.customer_id)}" ${customer.customer_id === selectedCustomerId ? "selected" : ""}>${escapeHtml(customer.display_name)} (${escapeHtml(customer.customer_key)})</option>
    `).join("");
  }

  function renderPreviewPageSelect() {
    const select = document.getElementById("se-preview-customer-page-id");
    if (!select) return;

    const activePages = customerPages.filter((page) => page.status !== "archived");
    if (!activePages.length) {
      select.innerHTML = `<option value="">No enabled pages yet</option>`;
      return;
    }

    if (!selectedPreviewPageId || !activePages.some((page) => page.customer_page_id === selectedPreviewPageId)) {
      selectedPreviewPageId = activePages[0].customer_page_id;
    }

    select.innerHTML = activePages.map((page) => {
      const templateName = page.core_template_registry?.template_name || page.page_key || "Page";
      return `<option value="${escapeHtml(page.customer_page_id)}" ${page.customer_page_id === selectedPreviewPageId ? "selected" : ""}>${escapeHtml(page.nav_label || templateName)} (${escapeHtml(page.page_key || "")})</option>`;
    }).join("");
  }

  function renderSavedProfiles() {
    const select = document.getElementById("se-saved-profile-select");
    if (!select) return;

    const profiles = savedProfiles.filter((profile) => !profile.is_active);
    if (!profiles.length) {
      select.innerHTML = `<option value="">No saved profiles yet</option>`;
      return;
    }

    select.innerHTML = `<option value="">Choose saved profile...</option>` + profiles.map((profile) => {
      return `<option value="${escapeHtml(profile.style_profile_id)}">${escapeHtml(profile.profile_name || "Saved Profile")} (${escapeHtml(profile.preset_key || "custom")})</option>`;
    }).join("");
  }

  function renderHistory() {
    const list = document.getElementById("se-history-list");
    if (!list) return;

    const usefulHistory = styleHistory.filter((row) => {
      const eventType = String(row.event_type || "");
      return ["after_save", "after_restore", "after_apply_saved_profile", "saved_profile_created"].includes(eventType);
    });

    if (!usefulHistory.length) {
      list.innerHTML = "No useful restore points yet. Save a customer style to create one.";
      return;
    }

    list.innerHTML = usefulHistory.map((row) => {
      const snapshot = row.snapshot_json || {};
      const date = row.created_at ? new Date(row.created_at).toLocaleString() : "";
      const eventLabel = String(row.event_type || "")
        .replace("after_save", "Saved style")
        .replace("after_restore", "Restored style")
        .replace("after_apply_saved_profile", "Applied saved profile")
        .replace("saved_profile_created", "Saved design profile");
      return `
        <div class="se-history-row">
          <div>
            <strong>${escapeHtml(snapshot.profile_name || "Style Snapshot")}</strong>
            <div class="se-history-meta">${escapeHtml(eventLabel)} | ${escapeHtml(date)}</div>
            ${row.note ? `<div class="se-history-meta">${escapeHtml(row.note)}</div>` : ""}
          </div>
          <button class="se-button secondary se-restore-history" data-history-id="${escapeHtml(row.history_id)}" type="button">Restore</button>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".se-restore-history").forEach((button) => {
      button.addEventListener("click", async () => {
        const historyId = button.getAttribute("data-history-id");
        if (!historyId) return;
        if (!confirmDiscardChanges("You have unsaved changes. Restore this history snapshot and discard them?")) return;
        if (!window.confirm("Restore this style snapshot to the active customer style profile?")) return;

        try {
          isSaving = true;
          setStatus("Restoring history snapshot...");
          const result = await callCoreAdminAction("restore_style_profile_snapshot", {
            customer_id: selectedCustomerId,
            history_id: historyId
          });
          activeStyleProfile = result.style_profile;
          applyPayloadToForm(activeStyleProfile);
          await loadSavedProfiles();
          await loadStyleHistory();
          markClean();
          setStatus("History snapshot restored.");
        } catch (error) {
          setStatus("Restore failed.");
          setOutput({ ok: false, event: "restore_failed", message: error instanceof Error ? error.message : String(error) });
        } finally {
          isSaving = false;
        }
      });
    });
  }

  async function loadSavedProfiles() {
    if (!selectedCustomerId) {
      savedProfiles = [];
      renderSavedProfiles();
      return;
    }
    const result = await callCoreAdminAction("list_customer_style_profiles", { customer_id: selectedCustomerId });
    savedProfiles = Array.isArray(result.style_profiles) ? result.style_profiles : [];
    renderSavedProfiles();
  }

  async function loadStyleHistory() {
    if (!selectedCustomerId) {
      styleHistory = [];
      renderHistory();
      return;
    }
    const result = await callCoreAdminAction("list_style_profile_history", { customer_id: selectedCustomerId, limit: 10 });
    styleHistory = Array.isArray(result.history) ? result.history : [];
    renderHistory();
  }

  async function loadCustomerPages() {
    if (!selectedCustomerId) {
      customerPages = [];
      selectedPreviewPageId = "";
      renderPreviewPageSelect();
      renderPreview();
      return;
    }

    const result = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(result.customer_pages) ? result.customer_pages : [];
    renderPreviewPageSelect();
    await renderRealPagePreview();
  }

  async function loadPreviewPageData(customerPageId) {
    if (!customerPageId) return null;
    const result = await callCoreAdminAction("get_customer_page_settings", { customer_page_id: customerPageId });
    return result;
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];
    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    renderCustomerSelect();
    if (selectedCustomerId) {
      await loadActiveStyleProfile();
      await loadCustomerPages();
      await loadSavedProfiles();
      await loadStyleHistory();
    }
    setStatus("Customers loaded.");
  }

  async function loadActiveStyleProfile() {
    if (!selectedCustomerId) return;
    setStatus("Loading active style profile...");
    const result = await callCoreAdminAction("get_active_style_profile", { customer_id: selectedCustomerId });
    activeStyleProfile = result.style_profile;
    applyPayloadToForm(activeStyleProfile);
    markClean();
    setStatus("Active style profile loaded.");
  }

  async function saveStyleProfile() {
    if (!selectedCustomerId) {
      setStatus("Select a customer first.");
      return;
    }
    const payload = getFormPayload();
    setStatus("Saving style profile...");
    isSaving = true;
    const result = await callCoreAdminAction("update_active_style_profile", { customer_id: selectedCustomerId, note: "Layout Designer save", ...payload });
    activeStyleProfile = result.style_profile;
    applyPayloadToForm(activeStyleProfile);
    await loadSavedProfiles();
    await loadStyleHistory();
    markClean();
    isSaving = false;
    setStatus("Style profile saved.");
  }

  function bindEvents() {
    window.addEventListener("beforeunload", (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = DIRTY_MESSAGE;
    });

    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("se-email")?.value || "";
        const password = document.getElementById("se-password")?.value || "";
        setStatus("Logging in...");
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthGate(true, data?.user?.email || email);
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadCustomers();
      } catch (error) {
        setStatus("Login failed.");
        setOutput({ ok: false, event: "login_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        selectedCustomerId = "";
        activeStyleProfile = null;
        renderCustomerSelect();
        setAuthGate(false);
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try { await loadCustomers(); }
      catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        if (!confirmDiscardChanges("You have unsaved changes. Switch customers and discard them?")) {
          event.target.value = selectedCustomerId;
          return;
        }
        selectedCustomerId = event.target.value || "";
        selectedPreviewPageId = "";
        markClean();
        if (selectedCustomerId) {
          await loadActiveStyleProfile();
          await loadCustomerPages();
          await loadSavedProfiles();
          await loadStyleHistory();
        }
      } catch (error) {
        setStatus("Style profile load failed.");
        setOutput({ ok: false, event: "style_profile_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-preset")?.addEventListener("change", (event) => {
      const preset = PRESETS[event.target.value];
      if (!preset) return;
      if (!confirmDiscardChanges("Apply this system preset and discard unsaved changes?")) {
        event.target.value = "";
        return;
      }
      applyPayloadToForm({
        profile_name: preset.label,
        preset_key: preset.preset_key,
        preset_source: preset.preset_source,
        colors_json: preset.colors_json,
        typography_json: preset.typography_json,
        spacing_json: preset.spacing_json,
        layout_json: preset.layout_json,
        effects_json: preset.effects_json,
        media_json: preset.media_json,
        component_json: preset.component_json,
        preview_json: preset.preview_json,
        density: preset.density,
        card_style: preset.card_style,
        hero_style: preset.hero_style
      });
      markDirty();
      renderRealPagePreview();
    });

    const nonDirtyControlIds = new Set([
      "se-customer-select",
      "se-preset",
      "se-saved-profile-select",
      "se-preview-mode",
      "se-preview-page-key",
      "se-preview-customer-page-id",
      "se-use-real-page-data"
    ]);

    document.querySelectorAll("input, select").forEach((el) => {
      if (el.closest(".se-auth-card")) return;
      if (nonDirtyControlIds.has(el.id)) {
        el.addEventListener("input", renderRealPagePreview);
        el.addEventListener("change", renderRealPagePreview);
        return;
      }
      el.addEventListener("input", () => { markDirty(); renderRealPagePreview(); });
      el.addEventListener("change", () => { markDirty(); renderRealPagePreview(); });
    });

    ["se-brand-primary", "se-brand-secondary", "se-surface", "se-text"].forEach(bindColorPair);

    document.getElementById("se-save-new-profile")?.addEventListener("click", async () => {
      try {
        if (!selectedCustomerId) {
          setStatus("Select a customer first.");
          return;
        }
        const profileName = window.prompt("Name this new design profile:");
        if (!profileName || !profileName.trim()) return;

        isSaving = true;
        const payload = getFormPayload();
        setStatus("Saving new design profile...");
        const result = await callCoreAdminAction("save_design_profile", {
          customer_id: selectedCustomerId,
          profile_name: profileName.trim(),
          note: "Saved from Layout Designer",
          ...payload
        });
        await loadSavedProfiles();
        await loadStyleHistory();
        setStatus(`Saved new design profile: ${result.saved_profile?.profile_name || profileName.trim()}`);
      } catch (error) {
        setStatus("Save as new design profile failed.");
        setOutput({ ok: false, event: "save_new_profile_failed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        isSaving = false;
      }
    });

    document.getElementById("se-apply-saved-profile")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscardChanges("Apply this saved design profile and discard unsaved changes?")) return;
        const sourceStyleProfileId = getValue("se-saved-profile-select", "");
        if (!sourceStyleProfileId) {
          setStatus("Choose a saved design profile first.");
          return;
        }

        isSaving = true;
        setStatus("Applying saved design profile...");
        const result = await callCoreAdminAction("apply_saved_design_profile", {
          customer_id: selectedCustomerId,
          source_style_profile_id: sourceStyleProfileId
        });

        activeStyleProfile = result.style_profile;
        applyPayloadToForm(activeStyleProfile);
        await loadSavedProfiles();
        await loadStyleHistory();
        markClean();
        setStatus("Saved design profile applied.");
      } catch (error) {
        setStatus("Apply saved design profile failed.");
        setOutput({ ok: false, event: "apply_saved_profile_failed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        isSaving = false;
      }
    });

    document.getElementById("se-refresh-history")?.addEventListener("click", async () => {
      try { await loadStyleHistory(); }
      catch (error) {
        setStatus("History refresh failed.");
        setOutput({ ok: false, event: "history_refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-reset-unsaved")?.addEventListener("click", async () => {
      try {
        if (!isDirty) {
          setStatus("No unsaved changes to reset.");
          return;
        }

        if (!window.confirm("Reset unsaved Layout Designer changes and reload the last saved active profile?")) return;

        isSaving = true;
        setStatus("Resetting unsaved changes...");
        await loadActiveStyleProfile();
        await loadCustomerPages();
        await loadSavedProfiles();
        await loadStyleHistory();
        markClean();
        setStatus("Unsaved changes reset.");
      } catch (error) {
        setStatus("Reset failed.");
        setOutput({ ok: false, event: "reset_unsaved_failed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        isSaving = false;
      }
    });

    document.getElementById("se-save")?.addEventListener("click", async () => {
      try { await saveStyleProfile(); }
      catch (error) {
        isSaving = false;
        setStatus("Save failed.");
        setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-preview-refresh")?.addEventListener("click", renderRealPagePreview);
    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function boot() {
    renderShell();
    setAuthGate(false);
    bindEvents();
    applyPayloadToForm(PRESETS["clean-blue"]);

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.");
      setOutput({ ok: false, event: "supabase_init_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

// ADMIN-PAGE-layout-designer-current.js END
