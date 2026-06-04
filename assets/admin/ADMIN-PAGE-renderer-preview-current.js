// ADMIN-PAGE-renderer-preview-current.js
// Internal Version: 2026-06-04-006
// Purpose: Admin/test renderer preview v6 with active customer logo rendering.
// Backend contract: uses existing core-admin-action actions only.
// Actions used: list_customers, list_customer_pages, get_active_style_profile, get_customer_page_settings.
// Notes: This is a safe preview page, not final public routing.

(function () {
  "use strict";

  const VERSION = "2026-06-04-006";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-renderer-preview-root";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let customerPages = [];
  let selectedCustomerId = "";
  let selectedCustomer = null;
  let selectedCustomerPageId = "";
  let activeStyleProfile = null;
  let selectedPageBundle = null;
  let activeLogoAsset = null;
  let pendingCustomerKey = "";
  let pendingPageKey = "";

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

  function readQueryState() {
    const params = new URLSearchParams(window.location.search);
    pendingCustomerKey = params.get("customer") || "";
    pendingPageKey = params.get("page") || "";
  }

  function writeQueryState() {
    const params = new URLSearchParams();

    if (selectedCustomer?.customer_key) params.set("customer", selectedCustomer.customer_key);

    const selectedPage = selectedPageBundle?.customer_page
      || customerPages.find((page) => page.customer_page_id === selectedCustomerPageId)
      || null;

    if (selectedPage?.page_key) params.set("page", selectedPage.page_key);

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
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

  function getAssetUrl(asset) {
    return asset?.url || (asset?.storage_path ? `${SUPABASE_URL}/storage/v1/object/public/core-assets/${asset.storage_path}` : "");
  }

  function getStyle() {
    const profile = activeStyleProfile || {};
    const colors = profile.colors_json || {};
    const typography = profile.typography_json || {};
    const spacing = profile.spacing_json || {};
    const layout = profile.layout_json || {};
    const effects = profile.effects_json || {};
    const media = profile.media_json || {};
    const components = profile.component_json || {};

    return {
      colors: {
        brandPrimary: colors.brand_primary || "#1f4f82",
        brandSecondary: colors.brand_secondary || "#eef3f8",
        surface: colors.surface || "#ffffff",
        text: colors.text || "#172033"
      },
      typography: {
        headingScale: typography.heading_scale || "normal",
        bodyScale: typography.body_scale || "normal",
        fontFamily: typography.font_family || "system"
      },
      spacing: {
        pageWidth: layout.default_width || spacing.page_width || "normal",
        sectionSpacing: layout.section_rhythm || spacing.section_spacing || "normal",
        cardPadding: spacing.card_padding || "normal"
      },
      layout,
      effects: {
        shadows: effects.shadows || "soft",
        borders: effects.borders || "standard",
        corners: effects.corners || "soft",
        gradients: effects.gradients || "subtle",
        emphasisStyle: effects.emphasis_style || "labels",
        surfaceStyle: effects.surface_style || "panels"
      },
      media,
      components,
      density: profile.density || "normal",
      cardStyle: profile.card_style || "standard",
      heroStyle: profile.hero_style || "standard"
    };
  }

  function styleVars(style) {
    const width = style.spacing.pageWidth === "wide" ? "1180px" : style.spacing.pageWidth === "narrow" ? "780px" : "980px";
    const cardPadding = style.spacing.cardPadding === "compact" ? "14px" : style.spacing.cardPadding === "generous" ? "28px" : "20px";
    const sectionGap = style.spacing.sectionSpacing === "compact" ? "12px" : style.spacing.sectionSpacing === "generous" ? "28px" : "18px";
    const radius = style.effects.corners === "sharp" ? "4px" : style.effects.corners === "pill" ? "24px" : "14px";
    const shadow = style.effects.shadows === "none" ? "none" : style.effects.shadows === "strong" ? "0 16px 44px rgba(23,32,51,.18)" : "0 8px 24px rgba(23,32,51,.08)";
    const headingSize = style.typography.headingScale === "compact" ? "30px" : style.typography.headingScale === "large" ? "44px" : "36px";
    const bodySize = style.typography.bodyScale === "compact" ? "14px" : style.typography.bodyScale === "large" ? "18px" : "16px";
    const border = style.effects.borders === "none" ? "0" : `1px solid ${style.colors.brandSecondary}`;

    return { width, cardPadding, sectionGap, radius, shadow, headingSize, bodySize, border };
  }

  function getPageData() {
    const bundle = selectedPageBundle || {};
    const page = bundle.customer_page || {};
    const settings = bundle.page_settings || {};
    const template = page.core_template_registry || {};
    const content = settings.content_json || {};
    const labels = settings.labels_json || {};
    const options = settings.options_json || {};
    const visibility = settings.visibility_json || {};

    return { page, settings, template, content, labels, options, visibility };
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function getSchemaHideFields(schema) {
    const fields = new Set();

    function walk(value) {
      if (!value || typeof value !== "object") return;

      if (value.hide_when_blank === true) {
        const key = value.key || value.field || value.name || value.setting_key;
        if (key) fields.add(String(key));
      }

      if (Array.isArray(value)) {
        value.forEach(walk);
      } else {
        Object.values(value).forEach(walk);
      }
    }

    walk(schema);
    return fields;
  }

  function shouldRenderField(key, value, hideFields) {
    if (hideFields.has(key) && !hasValue(value)) return false;
    return hasValue(value);
  }

  function getPageFeatures() {
    const { settings } = getPageData();
    const visibility = settings.visibility_json || {};
    const options = settings.options_json || {};
    return {
      show_announcement_strip: false,
      show_banner_scroller: false,
      show_hero_media: false,
      show_primary_cta_block: false,
      show_secondary_content_section: false,
      show_filter_controls: false,
      show_dashboard_cards: false,
      show_empty_state_panel: false,
      ...(options.features || {}),
      ...(visibility.features || {})
    };
  }

  function renderAnnouncementStrip(features, content) {
    if (!features.show_announcement_strip) return "";
    const text = content.announcement_text || "Announcement strip is enabled for this page.";
    return `<div class="sr-announcement">${escapeHtml(text)}</div>`;
  }

  function renderBannerScroller(features) {
    if (!features.show_banner_scroller) return "";
    return `
      <section class="sr-scroller" aria-label="Banner scroller preview">
        <div class="sr-scroller-track">
          <span>Banner scroller enabled</span>
          <span>Customer updates can rotate here</span>
          <span>Future module content can feed this strip</span>
        </div>
      </section>
    `;
  }

  function renderHeroMedia(features) {
    if (!features.show_hero_media) return "";
    return `
      <div class="sr-hero-media">
        <div class="sr-hero-media-inner">Hero media placeholder</div>
      </div>
    `;
  }

  function renderPrimaryCtaBlock(features, labels, options, content) {
    if (!features.show_primary_cta_block) return "";
    const label = labels.primary_cta_label || content.primary_cta_label || "Primary CTA";
    return `
      <section class="sr-section sr-cta-block">
        <div>
          <span class="sr-kicker">Call to action</span>
          <h2>${escapeHtml(label)}</h2>
          <p>This page-level CTA block is enabled in Page Editor.</p>
        </div>
        <a class="sr-button primary" href="${escapeHtml(options.primary_cta_url || "#")}" onclick="return false;">${escapeHtml(label)}</a>
      </section>
    `;
  }

  function renderSecondaryContentSection(features, content) {
    if (!features.show_secondary_content_section) return "";
    const heading = content.secondary_heading || "Secondary content section";
    const body = content.secondary_body || "This optional page section is enabled in Page Editor and styled by the customer-wide Layout Designer profile.";
    return `
      <section class="sr-section">
        <div class="sr-section-heading">
          <span class="sr-kicker">Optional section</span>
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <p>${escapeHtml(body)}</p>
      </section>
    `;
  }

  function renderFilterControls(features) {
    if (!features.show_filter_controls) return "";
    return `
      <section class="sr-section sr-filter-row">
        <span class="sr-filter-pill active">All</span>
        <span class="sr-filter-pill">Current</span>
        <span class="sr-filter-pill">Archived</span>
        <span class="sr-filter-pill">Featured</span>
      </section>
    `;
  }

  function renderDashboardCards(features) {
    if (!features.show_dashboard_cards) return "";
    return `
      <section class="sr-card-grid sr-dashboard-grid">
        <article class="sr-card"><h3>Summary</h3><p>Dashboard card enabled.</p></article>
        <article class="sr-card"><h3>Status</h3><p>Module summary placeholder.</p></article>
        <article class="sr-card"><h3>Action</h3><p>Future real data can render here.</p></article>
      </section>
    `;
  }

  function renderEmptyStatePanel(features) {
    if (!features.show_empty_state_panel) return "";
    return `
      <section class="sr-empty-state">
        <strong>Empty-state panel enabled</strong>
        <p>This panel appears when module data is unavailable or intentionally blank.</p>
      </section>
    `;
  }

  function renderGenericCards(style, vars) {
    const cards = [
      { title: "Design profile", body: activeStyleProfile?.profile_name || "Default" },
      { title: "Renderer", body: "Customer style + page settings + template metadata." },
      { title: "Status", body: selectedPageBundle ? "Real page data loaded." : "Select a page to preview." }
    ];

    return `
      <section class="sr-card-grid">
        ${cards.map((card) => `
          <article class="sr-card">
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(card.body)}</p>
          </article>
        `).join("")}
      </section>
    `;
  }

  function renderPageSpecificSection(pageKey, style, vars) {
    const lowerKey = String(pageKey || "").toLowerCase();

    if (lowerKey.includes("aircraft")) {
      return `
        <section class="sr-section">
          <div class="sr-section-heading">
            <span class="sr-kicker">Aircraft module preview</span>
            <h2>Aircraft Fleet</h2>
          </div>
          <div class="sr-card-grid">
            <article class="sr-card"><h3>N123GG</h3><p>Aircraft cards will render from customer aircraft data later.</p></article>
            <article class="sr-card"><h3>N150TH</h3><p>This preview validates layout, not final operational data.</p></article>
            <article class="sr-card"><h3>Rates / Status</h3><p>Future modules can inherit this same customer-wide style.</p></article>
          </div>
        </section>
      `;
    }

    if (lowerKey.includes("calendar")) {
      return `
        <section class="sr-section">
          <div class="sr-section-heading">
            <span class="sr-kicker">Calendar module preview</span>
            <h2>Upcoming Events</h2>
          </div>
          <div class="sr-list">
            <div class="sr-list-row"><strong>Board Meeting</strong><span>Sample date and location.</span></div>
            <div class="sr-list-row"><strong>Fly-out</strong><span>Sample event card using customer style.</span></div>
          </div>
        </section>
      `;
    }

    if (lowerKey.includes("documents")) {
      return `
        <section class="sr-section">
          <div class="sr-section-heading">
            <span class="sr-kicker">Documents module preview</span>
            <h2>Resources</h2>
          </div>
          <div class="sr-card-grid">
            <article class="sr-card"><h3>Minutes</h3><p>Document categories and file cards will render here.</p></article>
            <article class="sr-card"><h3>Rules</h3><p>Customer settings can control labels and page text.</p></article>
          </div>
        </section>
      `;
    }

    return `
      <section class="sr-section">
        <div class="sr-section-heading">
          <span class="sr-kicker">Page module preview</span>
          <h2>Reusable page section</h2>
        </div>
        ${renderGenericCards(style, vars)}
      </section>
    `;
  }

  function renderCustomerFacingPage() {
    const mount = document.getElementById("se-rendered-page");
    if (!mount) return;

    const style = getStyle();
    const vars = styleVars(style);
    const { page, settings, template, content, labels, options } = getPageData();
    const hideFields = getSchemaHideFields(selectedPageBundle?.editable_schema_json || template.editable_schema_json || {});

    const customerName = selectedCustomer?.display_name || "Customer";
    const navPages = customerPages.filter((item) => item.status !== "archived" && item.show_in_nav !== false);
    const hasEnabledPages = customerPages.filter((item) => item.status !== "archived").length > 0;
    const hasRealPage = Boolean(selectedPageBundle && selectedCustomerPageId);

    const heroEyebrow = hasRealPage ? (content.hero_eyebrow || template.template_category || page.page_key || "") : "GENERAL STYLE PREVIEW";
    const title = hasRealPage
      ? (settings.title || content.hero_title || page.nav_label || template.template_name || "Customer Page")
      : `${customerName} Site Preview`;
    const intro = hasRealPage
      ? (settings.intro_text || content.hero_intro || "")
      : "No enabled pages are available for this customer yet. This fallback preview displays the active customer-wide style profile. Add pages in Page Setup to preview real page output.";
    const primaryLabel = labels.primary_cta_label || content.primary_cta_label || "";
    const primaryUrl = options.primary_cta_url || content.primary_cta_url || "";
    const secondaryLabel = labels.secondary_cta_label || content.secondary_cta_label || "";
    const secondaryUrl = options.secondary_cta_url || content.secondary_cta_url || "";
    const features = hasRealPage ? getPageFeatures() : {
      show_announcement_strip: false,
      show_banner_scroller: false,
      show_hero_media: false,
      show_primary_cta_block: false,
      show_secondary_content_section: false,
      show_filter_controls: false,
      show_dashboard_cards: false,
      show_empty_state_panel: true
    };

    const renderEyebrow = hasRealPage ? shouldRenderField("hero_eyebrow", heroEyebrow, hideFields) : true;
    const renderIntro = hasRealPage ? shouldRenderField("hero_intro", intro, hideFields) : true;
    const renderPrimary = hasRealPage && hasValue(primaryLabel) && hasValue(primaryUrl);
    const renderSecondary = hasRealPage && hasValue(secondaryLabel) && hasValue(secondaryUrl);

    const background = style.media.background === "soft-tint" ? style.colors.brandSecondary : "#f5f7fb";
    const logoUrl = getAssetUrl(activeLogoAsset);

    mount.innerHTML = `
      <style>
        #se-rendered-page {
          --sr-primary: ${style.colors.brandPrimary};
          --sr-secondary: ${style.colors.brandSecondary};
          --sr-surface: ${style.colors.surface};
          --sr-text: ${style.colors.text};
          --sr-radius: ${vars.radius};
          --sr-shadow: ${vars.shadow};
          --sr-border: ${vars.border};
          --sr-card-padding: ${vars.cardPadding};
          --sr-section-gap: ${vars.sectionGap};
          font-family: Arial, Helvetica, sans-serif;
          color: var(--sr-text);
          background: ${background};
          border-radius: 18px;
          overflow: hidden;
        }

        #se-rendered-page .sr-page {
          max-width: ${vars.width};
          margin: 0 auto;
          padding: 22px;
        }

        #se-rendered-page .sr-notice {
          border: 1px solid var(--sr-primary);
          color: var(--sr-primary);
          background: rgba(255,255,255,.72);
          border-radius: var(--sr-radius);
          padding: 12px 14px;
          margin-bottom: var(--sr-section-gap);
          font-size: 14px;
          font-weight: 800;
        }


        #se-rendered-page .sr-announcement {
          border: 1px solid var(--sr-primary);
          color: var(--sr-primary);
          background: rgba(255,255,255,.78);
          border-radius: var(--sr-radius);
          padding: 11px 14px;
          margin-bottom: var(--sr-section-gap);
          font-weight: 900;
        }

        #se-rendered-page .sr-scroller {
          border: var(--sr-border);
          background: var(--sr-surface);
          border-radius: 999px;
          padding: 9px 12px;
          margin-bottom: var(--sr-section-gap);
          overflow: hidden;
        }

        #se-rendered-page .sr-scroller-track {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          color: var(--sr-primary);
          font-weight: 800;
          font-size: 13px;
        }

        #se-rendered-page .sr-header {
          background: var(--sr-surface);
          border: var(--sr-border);
          border-radius: var(--sr-radius);
          box-shadow: var(--sr-shadow);
          padding: 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: var(--sr-section-gap);
        }

        #se-rendered-page .sr-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        #se-rendered-page .sr-logo {
          width: 72px;
          height: 64px;
          border-radius: ${style.effects.corners === "pill" ? "999px" : "14px"};
          border: var(--sr-border);
          background: var(--sr-secondary);
          color: var(--sr-primary);
          display: grid;
          place-items: center;
          font-weight: 900;
          font-size: 13px;
          flex: 0 0 auto;
          overflow: hidden;
        }

        #se-rendered-page .sr-logo img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }

        #se-rendered-page .sr-brand h1 {
          font-size: 24px;
          margin: 0 0 6px 0;
          color: var(--sr-text);
          line-height: 1.1;
        }

        #se-rendered-page .sr-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }

        #se-rendered-page .sr-nav span,
        #se-rendered-page .sr-nav button,
        #se-rendered-page .sr-button {
          border: 1px solid var(--sr-primary);
          color: var(--sr-primary);
          background: transparent;
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 800;
          font-size: 13px;
          text-decoration: none;
          cursor: pointer;
          font-family: inherit;
        }

        #se-rendered-page .sr-nav span.active,
        #se-rendered-page .sr-nav button.active,
        #se-rendered-page .sr-button.primary {
          background: var(--sr-primary);
          color: white;
        }

        #se-rendered-page .sr-hero {
          background: var(--sr-primary);
          color: white;
          border-radius: var(--sr-radius);
          box-shadow: var(--sr-shadow);
          padding: ${style.heroStyle === "bold" ? "34px" : style.heroStyle === "dashboard" ? "22px" : "28px"};
          margin-bottom: var(--sr-section-gap);
        }

        #se-rendered-page .sr-eyebrow,
        #se-rendered-page .sr-kicker {
          display: inline-block;
          border: 1px solid rgba(255,255,255,.45);
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .02em;
          margin-bottom: 12px;
        }

        #se-rendered-page .sr-hero h2 {
          font-size: ${vars.headingSize};
          margin: 0 0 10px 0;
          line-height: 1.05;
        }

        #se-rendered-page .sr-hero p {
          margin: 0;
          max-width: 760px;
          font-size: ${vars.bodySize};
          line-height: 1.55;
        }


        #se-rendered-page .sr-hero-media {
          margin-top: 18px;
          border: 1px solid rgba(255,255,255,.45);
          border-radius: var(--sr-radius);
          padding: 12px;
          background: rgba(255,255,255,.12);
        }

        #se-rendered-page .sr-hero-media-inner {
          min-height: 140px;
          display: grid;
          place-items: center;
          border: 1px dashed rgba(255,255,255,.55);
          border-radius: calc(var(--sr-radius) - 4px);
          font-weight: 900;
        }

        #se-rendered-page .sr-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        #se-rendered-page .sr-section {
          background: var(--sr-surface);
          border: var(--sr-border);
          border-radius: var(--sr-radius);
          box-shadow: var(--sr-shadow);
          padding: var(--sr-card-padding);
          margin-bottom: var(--sr-section-gap);
        }

        #se-rendered-page .sr-section-heading h2 {
          margin: 0 0 12px 0;
          color: var(--sr-text);
        }

        #se-rendered-page .sr-section-heading .sr-kicker {
          color: var(--sr-primary);
          border-color: var(--sr-primary);
          margin-bottom: 8px;
        }

        #se-rendered-page .sr-card-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        #se-rendered-page .sr-card {
          border: var(--sr-border);
          border-radius: var(--sr-radius);
          padding: var(--sr-card-padding);
          background: var(--sr-surface);
        }

        #se-rendered-page .sr-card h3 {
          margin: 0 0 8px 0;
          color: var(--sr-primary);
        }

        #se-rendered-page .sr-card p {
          margin: 0;
          line-height: 1.45;
          color: var(--sr-text);
        }


        #se-rendered-page .sr-cta-block {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        #se-rendered-page .sr-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        #se-rendered-page .sr-filter-pill {
          border: 1px solid var(--sr-primary);
          color: var(--sr-primary);
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 13px;
          font-weight: 800;
        }

        #se-rendered-page .sr-filter-pill.active {
          background: var(--sr-primary);
          color: white;
        }

        #se-rendered-page .sr-dashboard-grid {
          margin-bottom: var(--sr-section-gap);
        }

        #se-rendered-page .sr-empty-state {
          border: 1px dashed var(--sr-primary);
          border-radius: var(--sr-radius);
          background: rgba(255,255,255,.65);
          padding: var(--sr-card-padding);
          margin-bottom: var(--sr-section-gap);
          color: var(--sr-text);
        }

        #se-rendered-page .sr-empty-state p {
          margin: 8px 0 0 0;
          line-height: 1.45;
        }

        #se-rendered-page .sr-list {
          display: grid;
          gap: 10px;
        }

        #se-rendered-page .sr-list-row {
          border: var(--sr-border);
          border-radius: var(--sr-radius);
          padding: 14px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        #se-rendered-page .sr-footer {
          color: var(--sr-text);
          opacity: .72;
          font-size: 13px;
          text-align: center;
          padding: 14px;
        }

        @media (max-width: 850px) {
          #se-rendered-page .sr-header {
            align-items: flex-start;
            flex-direction: column;
          }
          #se-rendered-page .sr-nav {
            justify-content: flex-start;
          }
          #se-rendered-page .sr-card-grid {
            grid-template-columns: 1fr;
          }
        }

        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-auth-gate{display:block;}
      </style>

      <div class="sr-page">
        ${!hasEnabledPages ? `<div class="sr-notice">No enabled pages for this customer yet. Showing general customer style preview. Add pages in Page Setup to preview real page output.</div>` : ""}
        ${hasEnabledPages && !hasRealPage ? `<div class="sr-notice">Enabled pages exist, but no page is selected. Showing general customer style preview.</div>` : ""}

        ${hasRealPage ? renderAnnouncementStrip(features, content) : ""}
        ${hasRealPage ? renderBannerScroller(features) : ""}

        <header class="sr-header">
          <div class="sr-brand">
            <div class="sr-logo">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(activeLogoAsset?.alt_text || customerName + " logo")}">` : "LOGO"}</div>
            <div>
              <h1>${escapeHtml(customerName)}</h1>
              <nav class="sr-nav" aria-label="Preview navigation">
                ${navPages.length ? navPages.map((navPage) => `
                  <button class="sr-nav-item ${navPage.customer_page_id === selectedCustomerPageId ? "active" : ""}" data-customer-page-id="${escapeHtml(navPage.customer_page_id)}" type="button">${escapeHtml(navPage.nav_label || navPage.page_key || "Page")}</button>
                `).join("") : `<span>Home</span><span>About</span><span>Contact</span>`}
              </nav>
            </div>
          </div>
          <a class="sr-button primary" href="#" onclick="return false;">Member Login</a>
        </header>

        <section class="sr-hero">
          ${renderEyebrow ? `<div class="sr-eyebrow">${escapeHtml(heroEyebrow)}</div>` : ""}
          <h2>${escapeHtml(title)}</h2>
          ${renderIntro ? `<p>${escapeHtml(intro)}</p>` : ""}
          ${renderHeroMedia(features)}
          ${(renderPrimary || renderSecondary) ? `
            <div class="sr-actions">
              ${renderPrimary ? `<a class="sr-button primary" href="${escapeHtml(primaryUrl)}" onclick="return false;">${escapeHtml(primaryLabel)}</a>` : ""}
              ${renderSecondary ? `<a class="sr-button" href="${escapeHtml(secondaryUrl)}" onclick="return false;">${escapeHtml(secondaryLabel)}</a>` : ""}
            </div>
          ` : ""}
        </section>

        ${renderFilterControls(features)}
        ${renderDashboardCards(features)}
        ${hasRealPage ? renderPageSpecificSection(page.page_key || template.template_key, style, vars) : renderGenericCards(style, vars)}
        ${renderPrimaryCtaBlock(features, labels, options, content)}
        ${renderSecondaryContentSection(features, content)}
        ${renderEmptyStatePanel(features)}

        <footer class="sr-footer">
          ${escapeHtml(customerName)} preview · Powered by SyncEtc
        </footer>
      </div>
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
      <option value="${escapeHtml(customer.customer_id)}" ${customer.customer_id === selectedCustomerId ? "selected" : ""}>
        ${escapeHtml(customer.display_name)} (${escapeHtml(customer.customer_key)})
      </option>
    `).join("");
  }

  function renderPageSelect() {
    const select = document.getElementById("se-page-select");
    if (!select) return;

    const activePages = customerPages.filter((page) => page.status !== "archived");

    if (!activePages.length) {
      selectedCustomerPageId = "";
      select.innerHTML = `<option value="">No enabled pages yet</option>`;
      return;
    }

    if ((!selectedCustomerPageId || !activePages.some((page) => page.customer_page_id === selectedCustomerPageId)) && pendingPageKey) {
      const pendingPage = activePages.find((page) => page.page_key === pendingPageKey);
      if (pendingPage) selectedCustomerPageId = pendingPage.customer_page_id;
    }

    if (!selectedCustomerPageId || !activePages.some((page) => page.customer_page_id === selectedCustomerPageId)) {
      selectedCustomerPageId = activePages[0].customer_page_id;
    }

    select.innerHTML = activePages.map((page) => {
      const templateName = page.core_template_registry?.template_name || page.page_key || "Page";
      return `<option value="${escapeHtml(page.customer_page_id)}" ${page.customer_page_id === selectedCustomerPageId ? "selected" : ""}>${escapeHtml(page.nav_label || templateName)} (${escapeHtml(page.page_key || "")})</option>`;
    }).join("");
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (!selectedCustomerId && pendingCustomerKey) {
      const pendingCustomer = customers.find((customer) => customer.customer_key === pendingCustomerKey);
      if (pendingCustomer) selectedCustomerId = pendingCustomer.customer_id;
    }

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId) || null;

    renderCustomerSelect();

    if (selectedCustomerId) await loadCustomerData();

    setStatus("Customers loaded.");
  }

  async function loadCustomerData() {
    if (!selectedCustomerId) return;

    selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId) || null;

    setStatus("Loading customer style and pages...");

    const styleResult = await callCoreAdminAction("get_active_customer_logo", { customer_id: selectedCustomerId });
    activeStyleProfile = styleResult.style_profile || null;
    activeLogoAsset = styleResult.logo_asset || null;

    const pagesResult = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(pagesResult.customer_pages) ? pagesResult.customer_pages : [];

    renderPageSelect();

    if (selectedCustomerPageId) {
      await loadSelectedPage();
    } else {
      selectedPageBundle = null;
      renderCustomerFacingPage();
      writeQueryState();
    }

    setStatus("Customer style and pages loaded.");
  }

  async function loadSelectedPage() {
    if (!selectedCustomerPageId) {
      selectedPageBundle = null;
      renderCustomerFacingPage();
      writeQueryState();
      setStatus("No enabled page selected. Showing general customer style preview.");
      return;
    }

    setStatus("Loading selected page settings...");
    const result = await callCoreAdminAction("get_customer_page_settings", { customer_page_id: selectedCustomerPageId });
    selectedPageBundle = result;
    renderCustomerFacingPage();
    writeQueryState();
    setStatus("Renderer preview updated.");
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID} {
          font-family: Arial, Helvetica, sans-serif;
          color: #172033;
          background: #f5f7fb;
          min-height: 100vh;
          padding: 18px;
          box-sizing: border-box;
        }

        #${ROOT_ID} * { box-sizing: border-box; }

        .se-wrap {
          max-width: 1380px;
          margin: 0 auto;
        }

        .se-header-card,
        .se-card {
          background: #fff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23,32,51,.08);
          padding: 18px;
          margin-bottom: 14px;
        }

        .se-title {
          margin: 0 0 6px 0;
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: -.02em;
        }

        .se-subtitle {
          margin: 0;
          color: #5d6b82;
          font-size: 15px;
          line-height: 1.45;
        }

        .se-badge {
          display: inline-flex;
          border-radius: 999px;
          background: #e9f1fb;
          color: #1f4f82;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 10px;
          margin-top: 10px;
        }

        .se-controls {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto auto auto;
          gap: 10px;
          align-items: end;
        }

        .se-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .se-label {
          font-size: 13px;
          font-weight: 800;
          color: #26344d;
        }

        .se-input,
        .se-select {
          width: 100%;
          border: 1px solid #c7d2e2;
          border-radius: 10px;
          padding: 10px 11px;
          font-size: 14px;
          background: #fff;
          color: #172033;
        }

        .se-button {
          border: 1px solid #1f4f82;
          background: #1f4f82;
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .se-button.secondary {
          background: #fff;
          color: #1f4f82;
        }

        .se-status {
          margin-top: 12px;
          padding: 12px;
          border-radius: 10px;
          background: #eef3f8;
          border: 1px solid #d6e0ec;
          color: #26344d;
          font-size: 14px;
          white-space: pre-wrap;
        }

        .se-output {
          margin-top: 14px;
          background: #101827;
          color: #e7edf6;
          border-radius: 12px;
          padding: 14px;
          overflow: auto;
          min-height: 120px;
          max-height: 280px;
          font-family: Consolas, Monaco, monospace;
          font-size: 12px;
          line-height: 1.45;
        }

        .se-render-frame {
          background: #fff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23,32,51,.08);
          padding: 18px;
          margin-bottom: 14px;
        }

        @media (max-width: 1100px) {
          .se-controls {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 700px) {
          .se-controls {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <main class="se-wrap">
        <section class="se-header-card">
          <h1 class="se-title">Renderer Preview</h1>
          <p class="se-subtitle">Admin/test renderer for customer-facing pages. Combines active style profile, enabled page, page settings, and template metadata.</p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-renderer-preview-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <div class="se-controls">
            <label class="se-field">
              <span class="se-label">Email</span>
              <input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username">
            </label>

            <label class="se-field">
              <span class="se-label">Password</span>
              <input id="se-password" class="se-input" type="password" autocomplete="current-password">
            </label>

            <label class="se-field" data-auth-required="true">
              <span class="se-label">Customer</span>
              <select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select>
            </label>

            <button id="se-login" class="se-button">Log in</button>
            <button id="se-logout" class="se-button secondary">Log out</button>
            <button id="se-refresh" class="se-button secondary">Refresh</button>
          </div>

          <div data-auth-required="true" style="margin-top:12px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
            <label class="se-field">
              <span class="se-label">Enabled Page</span>
              <select id="se-page-select" class="se-select"><option value="">Select customer first...</option></select>
            </label>
            <button id="se-render" class="se-button">Refresh rendered page</button>
          </div>

          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>


        <section id="se-auth-gate-notice" class="se-card se-auth-gate">
          <h2 class="se-section-title">Login required</h2>
          <p class="se-subtitle">This admin page is hidden until a valid platform-admin session is active. Backend permissions still enforce access; this gate prevents accidental viewing/editing while logged out.</p>
        </section>

        <section class="se-render-frame" data-auth-required="true">
          <div id="se-rendered-page"></div>
        </section>

        <section class="se-card" data-auth-required="true">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <h2 style="margin:0 0 4px 0;font-size:20px;">Backend Result</h2>
              <p class="se-subtitle">Visible during development to verify loaded page/style data.</p>
            </div>
            <button id="se-copy-output" class="se-button secondary">Copy result</button>
          </div>
          <pre id="se-output" class="se-output">{}</pre>
        </section>
      </main>
    `;
  }

  function bindEvents() {
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
        customerPages = [];
        selectedCustomerId = "";
        selectedCustomer = null;
        selectedCustomerPageId = "";
        selectedPageBundle = null;
        activeStyleProfile = null;
        activeLogoAsset = null;
        renderCustomerSelect();
        renderPageSelect();
        renderCustomerFacingPage();
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
        selectedCustomerId = event.target.value || "";
        selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId) || null;
        selectedCustomerPageId = "";
        selectedPageBundle = null;
        writeQueryState();
        selectedPageBundle = null;
        activeStyleProfile = null;
        customerPages = [];
        await loadCustomerData();
      } catch (error) {
        setStatus("Customer load failed.");
        setOutput({ ok: false, event: "customer_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-page-select")?.addEventListener("change", async (event) => {
      try {
        selectedCustomerPageId = event.target.value || "";
        await loadSelectedPage();
      } catch (error) {
        setStatus("Page load failed.");
        setOutput({ ok: false, event: "page_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-render")?.addEventListener("click", async () => {
      try { await loadSelectedPage(); }
      catch (error) {
        setStatus("Render failed.");
        setOutput({ ok: false, event: "render_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-rendered-page")?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      const button = target.closest("[data-customer-page-id]");
      if (!button) return;

      const nextPageId = button.getAttribute("data-customer-page-id");
      if (!nextPageId || nextPageId === selectedCustomerPageId) return;

      try {
        selectedCustomerPageId = nextPageId;
        const select = document.getElementById("se-page-select");
        if (select) select.value = selectedCustomerPageId;
        await loadSelectedPage();
      } catch (error) {
        setStatus("Rendered navigation failed.");
        setOutput({ ok: false, event: "rendered_nav_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function boot() {
    readQueryState();
    renderShell();
    setAuthGate(false);
    bindEvents();
    renderCustomerFacingPage();

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

// ADMIN-PAGE-renderer-preview-current.js END
