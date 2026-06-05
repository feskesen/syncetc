// ADMIN-PAGE-page-editor-current.js
// Internal Version: 2026-06-05-004
// Purpose: Page Editor with restore history, corrected dirty-state tracking, Aircraft fields, Home public page fields, and Gallery public page fields.
// Uses existing core-admin-action backend actions.
// Actions used: list_customers, list_customer_pages, get_customer_page_settings, update_customer_page, update_page_settings, list_page_settings_history, restore_page_settings_snapshot, reset_page_settings_to_template_defaults.

(function () {
  "use strict";

  const VERSION = "2026-06-05-004";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-page-editor-root";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let customerPages = [];
  let selectedCustomerId = "";
  let selectedCustomerPageId = "";
  let currentCustomerPage = null;
  let currentPageSettings = null;
  let currentEditableSchema = null;
  let isDirty = false;
  let isSaving = false;
  let isHydrating = false;
  let cleanSignature = "";
  let pageHistory = [];
  let pageHistoryLimit = 10;
  let pageHistoryTotalCount = 0;
  let pageHistoryFilter = "all";
  let infoFaqItems = [];
  let selectedInfoFaqItemId = "";
  let infoFaqDirty = false;
  let infoFaqCleanSignature = "";
  let isInfoFaqHydrating = false;
  let infoFaqIncludeArchived = true;
  let infoFaqCsvPreviewRows = [];
  const DIRTY_MESSAGE = "You have unsaved Page Editor changes. Leave anyway?";

  const FEATURE_DEFAULTS = {
    show_announcement_strip: false,
    show_banner_scroller: false,
    show_hero_media: false,
    show_primary_cta_block: false,
    show_secondary_content_section: false,
    show_filter_controls: false,
    show_dashboard_cards: false,
    show_empty_state_panel: false
  };

  const FEATURE_FIELDS = [
    ["show_announcement_strip", "se-feature-announcement-strip"],
    ["show_banner_scroller", "se-feature-banner-scroller"],
    ["show_hero_media", "se-feature-hero-media"],
    ["show_primary_cta_block", "se-feature-primary-cta-block"],
    ["show_secondary_content_section", "se-feature-secondary-content-section"],
    ["show_filter_controls", "se-feature-filter-controls"],
    ["show_dashboard_cards", "se-feature-dashboard-cards"],
    ["show_empty_state_panel", "se-feature-empty-state-panel"]
  ];

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
    return window.confirm(message || "You have unsaved Page Editor changes. Continue and discard them?");
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

  function syncShellDirtyState() {
    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setDirty === "function") {
      const anyDirty = Boolean(isDirty || infoFaqDirty);
      const message = infoFaqDirty && !isDirty
        ? "You have unsaved FAQ item changes. Leave anyway?"
        : DIRTY_MESSAGE;
      window.SyncEtcAdminShell.setDirty(anyDirty, message);
    }
  }

  function getDirtySignature() {
    try {
      if (!currentCustomerPage || !currentPageSettings) return "";
      return stableStringify({
        customer_page_id: selectedCustomerPageId || "",
        nav_label: getValue("se-nav-label", ""),
        status: getValue("se-page-status", "draft"),
        show_in_nav: getChecked("se-show-in-nav"),
        content_json: getContentJson(),
        labels_json: getLabelsJson(),
        options_json: getOptionsJson(),
        visibility_json: {
          ...(currentPageSettings.visibility_json || {}),
          features: getFeatureTogglesPayload()
        }
      });
    } catch {
      return "";
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

  function getEl(id) {
    return document.getElementById(id);
  }

  function getValue(id, fallback = "") {
    const el = getEl(id);
    return el ? el.value : fallback;
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el) el.value = value ?? "";
  }

  function getChecked(id) {
    const el = getEl(id);
    return Boolean(el?.checked);
  }

  function setChecked(id, value) {
    const el = getEl(id);
    if (el) el.checked = Boolean(value);
  }

  function addIfElement(target, key, id) {
    if (getEl(id)) target[key] = getValue(id, "");
  }

  function addCheckedIfElement(target, key, id) {
    if (getEl(id)) target[key] = getChecked(id);
  }

  function checkAttr(value) {
    return value ? "checked" : "";
  }

  function selectedAttr(value, expected) {
    return String(value || "") === String(expected || "") ? "selected" : "";
  }

  function clearFeatureToggles() {
    FEATURE_FIELDS.forEach(([, id]) => setChecked(id, false));
  }

  function getSavedFeatures(pageSettings) {
    const visibility = pageSettings?.visibility_json || {};
    const options = pageSettings?.options_json || {};
    return {
      ...FEATURE_DEFAULTS,
      ...(options.features || {}),
      ...(visibility.features || {})
    };
  }

  function applyFeatureTogglesToForm(pageSettings) {
    clearFeatureToggles();
    const features = getSavedFeatures(pageSettings);
    FEATURE_FIELDS.forEach(([key, id]) => setChecked(id, Boolean(features[key])));
  }

  function getFeatureTogglesPayload() {
    const features = { ...FEATURE_DEFAULTS };
    FEATURE_FIELDS.forEach(([key, id]) => {
      features[key] = getChecked(id);
    });
    return features;
  }

  function getContentJson() {
    const content = {
      hero_eyebrow: getValue("se-hero-eyebrow", ""),
      hero_title: getValue("se-hero-title", ""),
      hero_intro: getValue("se-hero-intro", ""),
      primary_cta_label: getValue("se-primary-cta-label", ""),
      primary_cta_url: getValue("se-primary-cta-url", ""),
      secondary_cta_label: getValue("se-secondary-cta-label", ""),
      secondary_cta_url: getValue("se-secondary-cta-url", ""),
      announcement_text: getValue("se-announcement-text", ""),
      secondary_heading: getValue("se-secondary-heading", ""),
      secondary_body: getValue("se-secondary-body", "")
    };

    addIfElement(content, "stat_1_label", "se-stat-1-label");
    addIfElement(content, "stat_1_text", "se-stat-1-text");
    addIfElement(content, "stat_2_label", "se-stat-2-label");
    addIfElement(content, "stat_2_text", "se-stat-2-text");
    addIfElement(content, "stat_3_label", "se-stat-3-label");
    addIfElement(content, "stat_3_text", "se-stat-3-text");
    addIfElement(content, "intro_label", "se-intro-label");
    addIfElement(content, "intro_title", "se-intro-title");
    addIfElement(content, "intro_body", "se-intro-body");
    addIfElement(content, "empty_state_message", "se-empty-state-message");
    addIfElement(content, "note_body", "se-note-body");

    addIfElement(content, "marquee_text", "se-marquee-text");
    addIfElement(content, "marquee_image_url", "se-marquee-image-url");
    addIfElement(content, "featured_label", "se-featured-label");
    addIfElement(content, "featured_title", "se-featured-title");
    addIfElement(content, "featured_intro", "se-featured-intro");
    addIfElement(content, "featured_button_label", "se-featured-button-label");
    addIfElement(content, "featured_button_url", "se-featured-button-url");
    addIfElement(content, "mission_label", "se-mission-label");
    addIfElement(content, "mission_title", "se-mission-title");
    addIfElement(content, "mission_body", "se-mission-body");
    addIfElement(content, "mission_cta_label", "se-mission-cta-label");
    addIfElement(content, "mission_cta_url", "se-mission-cta-url");
    addIfElement(content, "contact_label", "se-contact-label");
    addIfElement(content, "contact_title", "se-contact-title");
    addIfElement(content, "contact_intro", "se-contact-intro");
    addIfElement(content, "contact_success_message", "se-contact-success-message");

    addIfElement(content, "gallery_label", "se-gallery-label");
    addIfElement(content, "gallery_title", "se-gallery-title");
    addIfElement(content, "gallery_intro", "se-gallery-intro");

    addIfElement(content, "history_label", "se-history-label");
    addIfElement(content, "history_title", "se-history-title");
    addIfElement(content, "history_body", "se-history-body");
    addIfElement(content, "membership_label", "se-membership-label");
    addIfElement(content, "membership_title", "se-membership-title");
    addIfElement(content, "membership_body", "se-membership-body");
    addIfElement(content, "board_label", "se-board-label");
    addIfElement(content, "board_title", "se-board-title");
    addIfElement(content, "board_intro", "se-board-intro");
    addIfElement(content, "officer_source_mode", "se-officer-source-mode");
    addIfElement(content, "manual_officers_json", "se-manual-officers-json");
    addIfElement(content, "faq_label", "se-faq-label");
    addIfElement(content, "faq_title", "se-faq-title");
    addIfElement(content, "faq_intro", "se-faq-intro");
    addIfElement(content, "contact_body", "se-info-contact-body");
    addIfElement(content, "contact_cta_label", "se-info-contact-cta-label");
    addIfElement(content, "contact_cta_url", "se-info-contact-cta-url");

    return content;
  }

  function getLabelsJson() {
    const labels = {
      primary_cta_label: getValue("se-primary-cta-label", ""),
      secondary_cta_label: getValue("se-secondary-cta-label", "")
    };

    addIfElement(labels, "primary_photo_label", "se-primary-photo-label");
    addIfElement(labels, "panel_photo_label", "se-panel-photo-label");
    addIfElement(labels, "rate_label", "se-rate-label");
    addIfElement(labels, "annual_due_label", "se-annual-due-label");
    addIfElement(labels, "home_base_label", "se-home-base-label");
    addIfElement(labels, "contact_name_placeholder", "se-contact-name-placeholder");
    addIfElement(labels, "contact_email_placeholder", "se-contact-email-placeholder");
    addIfElement(labels, "contact_message_placeholder", "se-contact-message-placeholder");
    addIfElement(labels, "contact_submit_label", "se-contact-submit-label");

    return labels;
  }

  function getOptionsJson() {
    const options = {
      primary_cta_url: getValue("se-primary-cta-url", ""),
      secondary_cta_url: getValue("se-secondary-cta-url", "")
    };

    addCheckedIfElement(options, "show_hero_stats", "se-show-hero-stats");
    addCheckedIfElement(options, "show_intro_card", "se-show-intro-card");
    addCheckedIfElement(options, "show_primary_photo", "se-show-primary-photo");
    addCheckedIfElement(options, "show_panel_photo", "se-show-panel-photo");
    addCheckedIfElement(options, "show_home_base", "se-show-home-base");
    addCheckedIfElement(options, "show_public_rates", "se-show-public-rates");
    addCheckedIfElement(options, "show_public_annual_due", "se-show-public-annual-due");
    addCheckedIfElement(options, "show_note_strip", "se-show-note-strip");
    addCheckedIfElement(options, "show_featured_photo", "se-show-featured-photo");
    addCheckedIfElement(options, "show_mission_card", "se-show-mission-card");
    addCheckedIfElement(options, "show_contact_form", "se-show-contact-form");
    addCheckedIfElement(options, "marquee_pause_middle", "se-marquee-pause-middle");
    addCheckedIfElement(options, "show_gallery_intro", "se-show-gallery-intro");
    addCheckedIfElement(options, "show_photo_captions", "se-show-photo-captions");
    addCheckedIfElement(options, "show_photo_credit", "se-show-photo-credit");
    addCheckedIfElement(options, "show_featured_first", "se-show-featured-first");

    addCheckedIfElement(options, "show_history_card", "se-show-history-card");
    addCheckedIfElement(options, "show_membership_card", "se-show-membership-card");
    addCheckedIfElement(options, "show_board_card", "se-show-board-card");
    addCheckedIfElement(options, "show_faq_categories", "se-show-faq-categories");
    addCheckedIfElement(options, "show_contact_card", "se-show-info-contact-card");

    return options;
  }

  function bindDirtyWithin(root) {
    if (!root) return;
    root.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el.closest("[data-skip-page-dirty='true']")) return;
      if (el.dataset.dirtyBound === "true") return;
      el.dataset.dirtyBound = "true";
      el.addEventListener("input", markDirty);
      el.addEventListener("change", markDirty);
    });
  }

  function renderCustomers() {
    const select = getEl("se-customer-select");
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

  function renderPages() {
    const select = getEl("se-page-select");
    if (!select) return;

    const activePages = customerPages.filter((page) => page.status !== "archived");

    if (!activePages.length) {
      selectedCustomerPageId = "";
      select.innerHTML = `<option value="">No enabled pages found</option>`;
      clearEditor();
      return;
    }

    if (!selectedCustomerPageId || !activePages.some((page) => page.customer_page_id === selectedCustomerPageId)) {
      selectedCustomerPageId = activePages[0].customer_page_id;
    }

    select.innerHTML = activePages.map((page) => {
      const templateName = page.core_template_registry?.template_name || page.page_key || "Page";
      return `<option value="${escapeHtml(page.customer_page_id)}" ${page.customer_page_id === selectedCustomerPageId ? "selected" : ""}>${escapeHtml(page.nav_label || templateName)} (${escapeHtml(page.page_key || "")})</option>`;
    }).join("");
  }

  const PAGE_HISTORY_EVENT_LABELS = {
    before_save: "Before save",
    after_save: "After save",
    before_restore: "Before restore",
    after_restore: "After restore",
    before_reset_to_default: "Before default reset",
    after_reset_to_default: "After default reset",
    manual_checkpoint: "Manual checkpoint"
  };

  function pageHistoryEventLabel(eventType) {
    return PAGE_HISTORY_EVENT_LABELS[String(eventType || "")] || String(eventType || "History");
  }

  function pageHistorySnapshotTitle(row) {
    const snapshot = row.snapshot_json || {};
    const pageSettings = snapshot.page_settings || {};
    const content = pageSettings.content_json || {};
    const page = snapshot.customer_page || {};
    return pageSettings.title || content.hero_title || page.nav_label || page.page_key || "Page snapshot";
  }

  function pageHistorySnapshotSummary(row) {
    const snapshot = row.snapshot_json || {};
    const pageSettings = snapshot.page_settings || {};
    const labels = pageSettings.labels_json || {};
    const content = pageSettings.content_json || {};
    const options = pageSettings.options_json || {};
    const visibility = pageSettings.visibility_json || {};
    return {
      event_type: row.event_type || null,
      created_at: row.created_at || null,
      saved_by_email: row.saved_by_email || null,
      note: row.note || null,
      title: pageSettings.title || null,
      content_fields: Object.keys(content).sort(),
      label_fields: Object.keys(labels).sort(),
      option_fields: Object.keys(options).sort(),
      visibility_fields: Object.keys(visibility).sort()
    };
  }

  function renderPageHistory() {
    const list = getEl("se-page-history-list");
    const countEl = getEl("se-page-history-count");
    const loadMore = getEl("se-load-more-page-history");
    if (!list) return;

    if (!selectedCustomerPageId) {
      list.innerHTML = "Select a page to view restore points.";
      if (countEl) countEl.textContent = "";
      if (loadMore) loadMore.style.display = "none";
      return;
    }

    if (!pageHistory.length) {
      list.innerHTML = "No matching page history yet. Save this page to create restore points.";
      if (countEl) countEl.textContent = pageHistoryTotalCount ? `Showing 0 of ${pageHistoryTotalCount}` : "";
      if (loadMore) loadMore.style.display = "none";
      return;
    }

    if (countEl) {
      const shown = pageHistory.length;
      const total = pageHistoryTotalCount || shown;
      countEl.textContent = `Showing ${shown} of ${total}`;
    }

    if (loadMore) {
      const total = pageHistoryTotalCount || pageHistory.length;
      loadMore.style.display = pageHistory.length < total ? "block" : "none";
    }

    list.innerHTML = pageHistory.map((row) => {
      const date = row.created_at ? new Date(row.created_at).toLocaleString() : "";
      const title = pageHistorySnapshotTitle(row);
      const eventLabel = pageHistoryEventLabel(row.event_type);
      const summary = pageHistorySnapshotSummary(row);
      return `
        <div class="se-history-row">
          <div class="se-history-main">
            <details class="se-history-details">
              <summary>
                <span class="se-history-title">${escapeHtml(title)}</span>
                <span class="se-history-meta">${escapeHtml(eventLabel)} | ${escapeHtml(date)}</span>
                ${row.saved_by_email ? `<span class="se-history-meta">${escapeHtml(row.saved_by_email)}</span>` : ""}
                ${row.note ? `<span class="se-history-meta">${escapeHtml(row.note)}</span>` : ""}
              </summary>
              <pre class="se-history-json">${escapeHtml(JSON.stringify(summary, null, 2))}</pre>
            </details>
          </div>
          <button class="se-button secondary se-restore-page-history" data-history-id="${escapeHtml(row.history_id)}" data-history-title="${escapeHtml(title)}" type="button">Restore</button>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".se-restore-page-history").forEach((button) => {
      button.addEventListener("click", async () => {
        const historyId = button.getAttribute("data-history-id");
        const historyTitle = button.getAttribute("data-history-title") || "this snapshot";
        if (!historyId || !selectedCustomerPageId) return;
        if (!confirmDiscardChanges("You have unsaved page changes. Restore this history snapshot and discard them?")) return;
        if (!window.confirm(`Restore ${historyTitle}? This overwrites the current Page Editor fields and creates a new restore point.`)) return;

        try {
          isSaving = true;
          setStatus("Restoring page history snapshot...");
          const result = await callCoreAdminAction("restore_page_settings_snapshot", {
            customer_page_id: selectedCustomerPageId,
            history_id: historyId
          });
          currentPageSettings = result.page_settings || currentPageSettings;
          pageHistoryLimit = 10;
          await loadSelectedPageEditor();
          markClean();
          setStatus("Page history snapshot restored.");
        } catch (error) {
          setStatus("Page history restore failed.");
          setOutput({ ok: false, event: "page_history_restore_failed", message: error instanceof Error ? error.message : String(error) });
        } finally {
          isSaving = false;
        }
      });
    });
  }

  async function loadPageHistory() {
    if (!selectedCustomerPageId) {
      pageHistory = [];
      pageHistoryTotalCount = 0;
      renderPageHistory();
      return;
    }

    const filterEl = getEl("se-page-history-filter");
    pageHistoryFilter = filterEl ? filterEl.value || "all" : pageHistoryFilter || "all";

    const result = await callCoreAdminAction("list_page_settings_history", {
      customer_page_id: selectedCustomerPageId,
      limit: pageHistoryLimit,
      offset: 0,
      event_group: pageHistoryFilter
    });
    pageHistory = Array.isArray(result.history) ? result.history : [];
    pageHistoryTotalCount = Number.isFinite(Number(result.total_count)) ? Number(result.total_count) : pageHistory.length;
    renderPageHistory();
  }

  function clearEditor() {
    currentCustomerPage = null;
    currentPageSettings = null;
    currentEditableSchema = null;
    pageHistory = [];
    infoFaqItems = [];
    selectedInfoFaqItemId = "";
    infoFaqCsvPreviewRows = [];
    setInfoFaqDirty(false);
    clearFeatureToggles();

    const editor = getEl("se-editor-fields");
    if (editor) {
      editor.innerHTML = `<div class="se-empty">No editable page loaded.</div>`;
    }

    renderPageHistory();
    markClean();
  }

  function renderEditorFields() {
    const settings = currentPageSettings || {};
    const content = settings.content_json || {};
    const labels = settings.labels_json || {};
    const options = settings.options_json || {};
    const page = currentCustomerPage || {};
    const templateKey = String(page.template_key || page.page_key || "").toLowerCase();
    const isHomePage = templateKey === "home";
    const isAircraftPage = templateKey === "aircraft";
    const isGalleryPage = templateKey === "gallery";
    const isInfoPage = templateKey === "info";

    const editor = getEl("se-editor-fields");
    if (!editor) return;

    if (!currentCustomerPage || !currentPageSettings) {
      editor.innerHTML = `<div class="se-empty">No editable schema loaded for this page.</div>`;
      return;
    }

    const pageIdentityHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Page Identity</h2>
        <label class="se-field"><span class="se-label">Navigation Label</span><input id="se-nav-label" class="se-input" type="text" value="${escapeHtml(page.nav_label || "")}"></label>
        <label class="se-field"><span class="se-label">Status</span><select id="se-page-status" class="se-select">
          <option value="draft" ${selectedAttr(page.status, "draft")}>draft</option>
          <option value="published" ${selectedAttr(page.status, "published")}>published</option>
          <option value="hidden" ${selectedAttr(page.status, "hidden")}>hidden</option>
        </select></label>
        <label class="se-check"><input id="se-show-in-nav" type="checkbox" ${page.show_in_nav === false ? "" : "checked"}><span>Show in Navigation</span></label>
      </section>
    `;

    const heroHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Hero</h2>
        <label class="se-field"><span class="se-label">Hero Eyebrow</span><input id="se-hero-eyebrow" class="se-input" type="text" value="${escapeHtml(content.hero_eyebrow || "")}"><small>Optional. If blank, renderer should omit the eyebrow.</small></label>
        <label class="se-field"><span class="se-label">Hero Title</span><input id="se-hero-title" class="se-input" type="text" value="${escapeHtml(content.hero_title || settings.title || "")}"></label>
        <label class="se-field"><span class="se-label">Hero Intro</span><textarea id="se-hero-intro" class="se-input se-textarea">${escapeHtml(content.hero_intro || settings.intro_text || "")}</textarea></label>
      </section>
    `;

    const genericHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Calls to Action</h2>
        <label class="se-field"><span class="se-label">Primary CTA Label</span><input id="se-primary-cta-label" class="se-input" type="text" value="${escapeHtml(labels.primary_cta_label || content.primary_cta_label || "")}"></label>
        <label class="se-field"><span class="se-label">Primary CTA URL</span><input id="se-primary-cta-url" class="se-input" type="text" value="${escapeHtml(options.primary_cta_url || content.primary_cta_url || "")}"></label>
        <label class="se-field"><span class="se-label">Secondary CTA Label</span><input id="se-secondary-cta-label" class="se-input" type="text" value="${escapeHtml(labels.secondary_cta_label || content.secondary_cta_label || "")}"></label>
        <label class="se-field"><span class="se-label">Secondary CTA URL</span><input id="se-secondary-cta-url" class="se-input" type="text" value="${escapeHtml(options.secondary_cta_url || content.secondary_cta_url || "")}"></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Optional Page Content</h2>
        <label class="se-field"><span class="se-label">Announcement Text</span><textarea id="se-announcement-text" class="se-input se-textarea">${escapeHtml(content.announcement_text || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Secondary Heading</span><input id="se-secondary-heading" class="se-input" type="text" value="${escapeHtml(content.secondary_heading || "")}"></label>
        <label class="se-field"><span class="se-label">Secondary Body</span><textarea id="se-secondary-body" class="se-input se-textarea">${escapeHtml(content.secondary_body || "")}</textarea></label>
      </section>
    `;

    const homeHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Home Hero Stats</h2>
        <p class="se-subtitle">Optional manual stat cards. Blank cards are omitted by the public renderer.</p>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Stat 1 Label</span><input id="se-stat-1-label" class="se-input" type="text" value="${escapeHtml(content.stat_1_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 1 Text</span><input id="se-stat-1-text" class="se-input" type="text" value="${escapeHtml(content.stat_1_text || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 2 Label</span><input id="se-stat-2-label" class="se-input" type="text" value="${escapeHtml(content.stat_2_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 2 Text</span><input id="se-stat-2-text" class="se-input" type="text" value="${escapeHtml(content.stat_2_text || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 3 Label</span><input id="se-stat-3-label" class="se-input" type="text" value="${escapeHtml(content.stat_3_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 3 Text</span><input id="se-stat-3-text" class="se-input" type="text" value="${escapeHtml(content.stat_3_text || "")}"></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Announcement / Banner Tow</h2>
        <p class="se-subtitle">Use the left-side feature toggles to turn the announcement strip or banner scroller on/off for this page.</p>
        <label class="se-field"><span class="se-label">Announcement Strip Text</span><textarea id="se-announcement-text" class="se-input se-textarea">${escapeHtml(content.announcement_text || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Marquee / Banner Tow Text</span><textarea id="se-marquee-text" class="se-input se-textarea">${escapeHtml(content.marquee_text || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Marquee Image URL</span><input id="se-marquee-image-url" class="se-input" type="text" value="${escapeHtml(content.marquee_image_url || "")}"><small>Optional. Leave blank for text-only banner.</small></label>
        <label class="se-check"><input id="se-marquee-pause-middle" type="checkbox" ${checkAttr(options.marquee_pause_middle !== false)}><span>Pause banner in the middle long enough to read</span></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Featured Photo</h2>
        <p class="se-subtitle">Uses a random public featured Gallery image when available. If no featured image exists, this section disappears publicly.</p>
        <label class="se-field"><span class="se-label">Section Label</span><input id="se-featured-label" class="se-input" type="text" value="${escapeHtml(content.featured_label || "")}"></label>
        <label class="se-field"><span class="se-label">Title</span><input id="se-featured-title" class="se-input" type="text" value="${escapeHtml(content.featured_title || "")}"></label>
        <label class="se-field"><span class="se-label">Intro</span><textarea id="se-featured-intro" class="se-input se-textarea">${escapeHtml(content.featured_intro || "")}</textarea></label>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Button Label</span><input id="se-featured-button-label" class="se-input" type="text" value="${escapeHtml(content.featured_button_label || "")}"></label>
          <label class="se-field"><span class="se-label">Button URL</span><input id="se-featured-button-url" class="se-input" type="text" value="${escapeHtml(content.featured_button_url || "")}"></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Mission / About Card</h2>
        <label class="se-field"><span class="se-label">Section Label</span><input id="se-mission-label" class="se-input" type="text" value="${escapeHtml(content.mission_label || "")}"></label>
        <label class="se-field"><span class="se-label">Title</span><input id="se-mission-title" class="se-input" type="text" value="${escapeHtml(content.mission_title || "")}"></label>
        <label class="se-field"><span class="se-label">Body</span><textarea id="se-mission-body" class="se-input se-textarea">${escapeHtml(content.mission_body || "")}</textarea></label>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">CTA Label</span><input id="se-mission-cta-label" class="se-input" type="text" value="${escapeHtml(content.mission_cta_label || "")}"></label>
          <label class="se-field"><span class="se-label">CTA URL</span><input id="se-mission-cta-url" class="se-input" type="text" value="${escapeHtml(content.mission_cta_url || "")}"></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Contact Form</h2>
        <p class="se-subtitle">Public submissions are stored in Supabase first. Email notification can be added later.</p>
        <label class="se-field"><span class="se-label">Section Label</span><input id="se-contact-label" class="se-input" type="text" value="${escapeHtml(content.contact_label || "")}"></label>
        <label class="se-field"><span class="se-label">Title</span><input id="se-contact-title" class="se-input" type="text" value="${escapeHtml(content.contact_title || "")}"></label>
        <label class="se-field"><span class="se-label">Intro</span><textarea id="se-contact-intro" class="se-input se-textarea">${escapeHtml(content.contact_intro || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Success Message</span><textarea id="se-contact-success-message" class="se-input se-textarea">${escapeHtml(content.contact_success_message || "")}</textarea></label>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Name Placeholder</span><input id="se-contact-name-placeholder" class="se-input" type="text" value="${escapeHtml(labels.contact_name_placeholder || "Name")}"></label>
          <label class="se-field"><span class="se-label">Email Placeholder</span><input id="se-contact-email-placeholder" class="se-input" type="text" value="${escapeHtml(labels.contact_email_placeholder || "Email")}"></label>
          <label class="se-field"><span class="se-label">Message Placeholder</span><input id="se-contact-message-placeholder" class="se-input" type="text" value="${escapeHtml(labels.contact_message_placeholder || "Message")}"></label>
          <label class="se-field"><span class="se-label">Submit Button Label</span><input id="se-contact-submit-label" class="se-input" type="text" value="${escapeHtml(labels.contact_submit_label || "Send Message")}"></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Home Display Options / Note</h2>
        <div class="se-two-col">
          <label class="se-check"><input id="se-show-hero-stats" type="checkbox" ${checkAttr(options.show_hero_stats !== false)}><span>Show hero stat cards when fields are filled</span></label>
          <label class="se-check"><input id="se-show-featured-photo" type="checkbox" ${checkAttr(options.show_featured_photo !== false)}><span>Show featured photo when available</span></label>
          <label class="se-check"><input id="se-show-mission-card" type="checkbox" ${checkAttr(options.show_mission_card !== false)}><span>Show mission/about card when filled</span></label>
          <label class="se-check"><input id="se-show-contact-form" type="checkbox" ${checkAttr(options.show_contact_form !== false)}><span>Show contact form</span></label>
          <label class="se-check"><input id="se-show-note-strip" type="checkbox" ${checkAttr(options.show_note_strip !== false)}><span>Show note strip when filled</span></label>
        </div>
        <label class="se-field" style="margin-top:12px;"><span class="se-label">Note / Disclaimer</span><textarea id="se-note-body" class="se-input se-textarea">${escapeHtml(content.note_body || "")}</textarea></label>
      </section>
    `;

    const galleryHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Gallery Intro</h2>
        <p class="se-subtitle">Optional copy above the public gallery grid. Blank fields are omitted.</p>
        <label class="se-field"><span class="se-label">Section Label</span><input id="se-gallery-label" class="se-input" type="text" value="${escapeHtml(content.gallery_label || "")}"></label>
        <label class="se-field"><span class="se-label">Gallery Title</span><input id="se-gallery-title" class="se-input" type="text" value="${escapeHtml(content.gallery_title || "")}"></label>
        <label class="se-field"><span class="se-label">Gallery Intro</span><textarea id="se-gallery-intro" class="se-input se-textarea">${escapeHtml(content.gallery_intro || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Empty State Message</span><textarea id="se-empty-state-message" class="se-input se-textarea">${escapeHtml(content.empty_state_message || "No public gallery photos are available yet.")}</textarea></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Gallery Display Options / Note</h2>
        <div class="se-two-col">
          <label class="se-check"><input id="se-show-gallery-intro" type="checkbox" ${checkAttr(options.show_gallery_intro !== false)}><span>Show gallery intro card when fields are filled</span></label>
          <label class="se-check"><input id="se-show-photo-captions" type="checkbox" ${checkAttr(options.show_photo_captions !== false)}><span>Show photo captions/titles</span></label>
          <label class="se-check"><input id="se-show-photo-credit" type="checkbox" ${checkAttr(options.show_photo_credit !== false)}><span>Show photo credit</span></label>
          <label class="se-check"><input id="se-show-featured-first" type="checkbox" ${checkAttr(options.show_featured_first !== false)}><span>Sort featured photos first</span></label>
          <label class="se-check"><input id="se-show-note-strip" type="checkbox" ${checkAttr(options.show_note_strip === true)}><span>Show note strip when filled</span></label>
        </div>
        <label class="se-field" style="margin-top:12px;"><span class="se-label">Note / Disclaimer</span><textarea id="se-note-body" class="se-input se-textarea">${escapeHtml(content.note_body || "")}</textarea></label>
      </section>
    `;

    const infoHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Info Cards</h2>
        <p class="se-subtitle">Left-column public information cards. Blank fields are omitted by the renderer.</p>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">History / Overview Label</span><input id="se-history-label" class="se-input" type="text" value="${escapeHtml(content.history_label || "Overview")}"></label>
          <label class="se-field"><span class="se-label">History / Overview Title</span><input id="se-history-title" class="se-input" type="text" value="${escapeHtml(content.history_title || "About Us")}"></label>
        </div>
        <label class="se-field"><span class="se-label">History / Overview Body</span><textarea id="se-history-body" class="se-input se-textarea">${escapeHtml(content.history_body || "")}</textarea></label>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Membership Label</span><input id="se-membership-label" class="se-input" type="text" value="${escapeHtml(content.membership_label || "Membership")}"></label>
          <label class="se-field"><span class="se-label">Membership Title</span><input id="se-membership-title" class="se-input" type="text" value="${escapeHtml(content.membership_title || "Membership Information")}"></label>
        </div>
        <label class="se-field"><span class="se-label">Membership Body</span><textarea id="se-membership-body" class="se-input se-textarea">${escapeHtml(content.membership_body || "")}</textarea></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Board / Officers</h2>
        <p class="se-subtitle">Dynamic mode will pull from people + organization roles once roster data exists. Manual and hybrid modes allow corporate-admin override rows now.</p>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Board Label</span><input id="se-board-label" class="se-input" type="text" value="${escapeHtml(content.board_label || "Leadership")}"></label>
          <label class="se-field"><span class="se-label">Board Title</span><input id="se-board-title" class="se-input" type="text" value="${escapeHtml(content.board_title || "Board / Officers")}"></label>
        </div>
        <label class="se-field"><span class="se-label">Board Intro</span><textarea id="se-board-intro" class="se-input se-textarea">${escapeHtml(content.board_intro || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Officer Source Mode</span><select id="se-officer-source-mode" class="se-select">
          <option value="dynamic" ${selectedAttr(content.officer_source_mode || "dynamic", "dynamic")}>dynamic: use roster/roles when available</option>
          <option value="manual" ${selectedAttr(content.officer_source_mode, "manual")}>manual: use rows below</option>
          <option value="hybrid" ${selectedAttr(content.officer_source_mode, "hybrid")}>hybrid: dynamic plus manual rows</option>
        </select></label>
        <label class="se-field"><span class="se-label">Manual Officer Rows</span><textarea id="se-manual-officers-json" class="se-input se-textarea" placeholder="President | Jane Smith\nVice President | Arnie Palmer">${escapeHtml(content.manual_officers_json || "")}</textarea><small>Enter one officer per line. Use the pipe character | to separate the title from the name, like President | Jane Smith.</small><small>Public officer emails are intentionally not collected or shown here. Use the Contact form/contact-board link for public inquiries.</small></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">FAQ Page Copy</h2>
        <p class="se-subtitle">These fields control the heading/intro around the FAQ area. The actual questions and answers are structured records managed below.</p>
        <label class="se-field"><span class="se-label">FAQ Label</span><input id="se-faq-label" class="se-input" type="text" value="${escapeHtml(content.faq_label || "FAQ")}"></label>
        <label class="se-field"><span class="se-label">FAQ Title</span><input id="se-faq-title" class="se-input" type="text" value="${escapeHtml(content.faq_title || "Frequently Asked Questions")}"></label>
        <label class="se-field"><span class="se-label">FAQ Intro</span><textarea id="se-faq-intro" class="se-input se-textarea">${escapeHtml(content.faq_intro || "")}</textarea></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Structured FAQ Items</h2>
        <p class="se-subtitle">FAQ rows are separate records so they can be imported, ordered, categorized, archived, and managed without changing the page layout.</p>
        <div id="se-info-faq-manager" class="se-faq-manager" data-skip-page-dirty="true">
          <div class="se-empty">FAQ manager loads after the Info page is selected.</div>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Contact / Disclaimer</h2>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Contact Label</span><input id="se-contact-label" class="se-input" type="text" value="${escapeHtml(content.contact_label || "Questions")}"></label>
          <label class="se-field"><span class="se-label">Contact Title</span><input id="se-contact-title" class="se-input" type="text" value="${escapeHtml(content.contact_title || "Need more information?")}"></label>
        </div>
        <label class="se-field"><span class="se-label">Contact Body</span><textarea id="se-info-contact-body" class="se-input se-textarea">${escapeHtml(content.contact_body || "")}</textarea></label>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Contact Button Label</span><input id="se-info-contact-cta-label" class="se-input" type="text" value="${escapeHtml(content.contact_cta_label || "Contact Us")}"></label>
          <label class="se-field"><span class="se-label">Contact Button URL</span><input id="se-info-contact-cta-url" class="se-input" type="text" value="${escapeHtml(content.contact_cta_url || "/home#contact-board")}"></label>
        </div>
        <label class="se-field"><span class="se-label">Note / Disclaimer</span><textarea id="se-note-body" class="se-input se-textarea">${escapeHtml(content.note_body || "")}</textarea></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Info/FAQ Display Options</h2>
        <div class="se-two-col">
          <label class="se-check"><input id="se-show-history-card" type="checkbox" ${checkAttr(options.show_history_card !== false)}><span>Show history/overview card when filled</span></label>
          <label class="se-check"><input id="se-show-membership-card" type="checkbox" ${checkAttr(options.show_membership_card !== false)}><span>Show membership card when filled</span></label>
          <label class="se-check"><input id="se-show-board-card" type="checkbox" ${checkAttr(options.show_board_card !== false)}><span>Show board/officers card when filled</span></label>
          <label class="se-check"><input id="se-show-faq-categories" type="checkbox" ${checkAttr(options.show_faq_categories !== false)}><span>Show FAQ category labels when present</span></label>
          <label class="se-check"><input id="se-show-info-contact-card" type="checkbox" ${checkAttr(options.show_contact_card !== false)}><span>Show contact card when filled</span></label>
          <label class="se-check"><input id="se-show-note-strip" type="checkbox" ${checkAttr(options.show_note_strip !== false)}><span>Show note strip when filled</span></label>
        </div>
      </section>
    `;

    const aircraftHtml = `
      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Aircraft Hero Stats</h2>
        <p class="se-subtitle">Optional manual stat cards. Blank fields are omitted by the renderer.</p>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Stat 1 Label</span><input id="se-stat-1-label" class="se-input" type="text" value="${escapeHtml(content.stat_1_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 1 Text</span><input id="se-stat-1-text" class="se-input" type="text" value="${escapeHtml(content.stat_1_text || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 2 Label</span><input id="se-stat-2-label" class="se-input" type="text" value="${escapeHtml(content.stat_2_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 2 Text</span><input id="se-stat-2-text" class="se-input" type="text" value="${escapeHtml(content.stat_2_text || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 3 Label</span><input id="se-stat-3-label" class="se-input" type="text" value="${escapeHtml(content.stat_3_label || "")}"></label>
          <label class="se-field"><span class="se-label">Stat 3 Text</span><input id="se-stat-3-text" class="se-input" type="text" value="${escapeHtml(content.stat_3_text || "")}"></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Aircraft Intro / Note</h2>
        <label class="se-field"><span class="se-label">Intro Label</span><input id="se-intro-label" class="se-input" type="text" value="${escapeHtml(content.intro_label || "")}"></label>
        <label class="se-field"><span class="se-label">Intro Title</span><input id="se-intro-title" class="se-input" type="text" value="${escapeHtml(content.intro_title || "")}"></label>
        <label class="se-field"><span class="se-label">Intro Body</span><textarea id="se-intro-body" class="se-input se-textarea">${escapeHtml(content.intro_body || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Empty State Message</span><textarea id="se-empty-state-message" class="se-input se-textarea">${escapeHtml(content.empty_state_message || "")}</textarea></label>
        <label class="se-field"><span class="se-label">Note Strip Text</span><textarea id="se-note-body" class="se-input se-textarea">${escapeHtml(content.note_body || "")}</textarea></label>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Aircraft Public Display Options</h2>
        <p class="se-subtitle">Controls what public visitors may see. Member/admin-only details stay out of the public renderer unless explicitly enabled.</p>
        <div class="se-two-col">
          <label class="se-check"><input id="se-show-hero-stats" type="checkbox" ${checkAttr(options.show_hero_stats !== false)}><span>Show hero stat cards when fields are filled</span></label>
          <label class="se-check"><input id="se-show-intro-card" type="checkbox" ${checkAttr(options.show_intro_card !== false)}><span>Show intro card when fields are filled</span></label>
          <label class="se-check"><input id="se-show-primary-photo" type="checkbox" ${checkAttr(options.show_primary_photo !== false)}><span>Show primary aircraft photo</span></label>
          <label class="se-check"><input id="se-show-panel-photo" type="checkbox" ${checkAttr(options.show_panel_photo !== false)}><span>Show panel photo</span></label>
          <label class="se-check"><input id="se-show-home-base" type="checkbox" ${checkAttr(options.show_home_base !== false)}><span>Show home base</span></label>
          <label class="se-check"><input id="se-show-public-rates" type="checkbox" ${checkAttr(options.show_public_rates === true)}><span>Show hourly rates publicly</span></label>
          <label class="se-check"><input id="se-show-public-annual-due" type="checkbox" ${checkAttr(options.show_public_annual_due === true)}><span>Show annual dues publicly</span></label>
          <label class="se-check"><input id="se-show-note-strip" type="checkbox" ${checkAttr(options.show_note_strip !== false)}><span>Show note strip when filled</span></label>
        </div>
      </section>

      <section class="se-card se-inner-card">
        <h2 class="se-section-title">Aircraft Labels</h2>
        <div class="se-two-col">
          <label class="se-field"><span class="se-label">Primary Photo Label</span><input id="se-primary-photo-label" class="se-input" type="text" value="${escapeHtml(labels.primary_photo_label || "Exterior")}"></label>
          <label class="se-field"><span class="se-label">Panel Photo Label</span><input id="se-panel-photo-label" class="se-input" type="text" value="${escapeHtml(labels.panel_photo_label || "Panel")}"></label>
          <label class="se-field"><span class="se-label">Rate Label</span><input id="se-rate-label" class="se-input" type="text" value="${escapeHtml(labels.rate_label || "Hourly Rate")}"></label>
          <label class="se-field"><span class="se-label">Annual Due Label</span><input id="se-annual-due-label" class="se-input" type="text" value="${escapeHtml(labels.annual_due_label || "Annual Due")}"></label>
          <label class="se-field"><span class="se-label">Home Base Label</span><input id="se-home-base-label" class="se-input" type="text" value="${escapeHtml(labels.home_base_label || "Home Base")}"></label>
        </div>
      </section>
    `;

    editor.innerHTML = pageIdentityHtml + heroHtml + (isAircraftPage ? aircraftHtml : isHomePage ? homeHtml : isGalleryPage ? galleryHtml : isInfoPage ? infoHtml : genericHtml);

    isHydrating = true;
    bindDirtyWithin(editor);
    isHydrating = false;
  }


  function getCurrentTemplateKey() {
    return String((currentCustomerPage || {}).template_key || (currentCustomerPage || {}).page_key || "").toLowerCase();
  }

  function isCurrentInfoPage() {
    const key = getCurrentTemplateKey();
    return key === "info" || key === "faq";
  }

  function setInfoFaqDirty(value) {
    infoFaqDirty = !!value;
    const el = getEl("se-faq-dirty-indicator");
    if (el) {
      el.textContent = infoFaqDirty ? "Unsaved FAQ changes" : "FAQ saved / clean";
      el.className = infoFaqDirty ? "se-dirty is-dirty" : "se-dirty";
    }
    syncShellDirtyState();
  }

  function getInfoFaqFormSignature() {
    return stableStringify({
      faq_item_id: selectedInfoFaqItemId || "",
      category: getValue("se-faq-item-category", ""),
      sort_order: getValue("se-faq-item-sort", "100"),
      question: getValue("se-faq-item-question", ""),
      answer: getValue("se-faq-item-answer", ""),
      visibility: getValue("se-faq-item-visibility", "public"),
      status: getValue("se-faq-item-status", "active")
    });
  }

  function markInfoFaqClean() {
    infoFaqCleanSignature = getInfoFaqFormSignature();
    setInfoFaqDirty(false);
  }

  function markInfoFaqDirty() {
    if (isInfoFaqHydrating) return;
    const signature = getInfoFaqFormSignature();
    setInfoFaqDirty(Boolean(infoFaqCleanSignature && signature !== infoFaqCleanSignature));
  }

  function confirmDiscardInfoFaqChanges(message) {
    if (!infoFaqDirty) return true;
    return window.confirm(message || "You have unsaved FAQ item changes. Continue and discard them?");
  }

  function currentInfoFaqItem() {
    return infoFaqItems.find((item) => String(item.faq_item_id) === String(selectedInfoFaqItemId)) || null;
  }

  function normalizeFaqRowForDisplay(item) {
    return {
      faq_item_id: item.faq_item_id || "",
      question: item.question || "Untitled FAQ",
      category: item.category || "General",
      visibility: item.visibility || "public",
      status: item.status || "active",
      sort_order: item.sort_order ?? 100,
      archived_at: item.archived_at || null,
      created_at: item.created_at || null
    };
  }

  function renderCsvPreview(rows) {
    const target = getEl("se-faq-csv-preview");
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = `<div class="se-empty">No valid FAQ rows parsed yet.</div>`;
      return;
    }
    const previewRows = rows.slice(0, 12).map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.question || "")}</td>
        <td>${escapeHtml(row.answer || "")}</td>
        <td>${escapeHtml(row.category || "General")}</td>
        <td>${escapeHtml(row.sort_order ?? "")}</td>
      </tr>
    `).join("");
    target.innerHTML = `
      <div class="se-note">Parsed ${rows.length} valid FAQ row${rows.length === 1 ? "" : "s"}. Showing the first ${Math.min(rows.length, 12)} before import.</div>
      <div class="se-faq-csv-table-wrap"><table class="se-faq-csv-table"><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Category</th><th>Sort</th></tr></thead><tbody>${previewRows}</tbody></table></div>
    `;
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const input = String(text || "");

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i += 1;
        row.push(field);
        if (row.some((cell) => String(cell || "").trim())) rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    row.push(field);
    if (row.some((cell) => String(cell || "").trim())) rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function faqRowsFromCsv(text) {
    const parsed = parseCsvText(text);
    if (!parsed.length) return [];
    const first = parsed[0].map(normalizeHeader);
    const hasHeader = first.some((h) => ["question", "faq_question", "answer", "faq_answer", "category", "sort_order"].includes(h));
    const dataRows = hasHeader ? parsed.slice(1) : parsed;
    const indexFor = (names, fallback) => {
      if (!hasHeader) return fallback;
      for (const name of names) {
        const idx = first.indexOf(name);
        if (idx >= 0) return idx;
      }
      return fallback;
    };
    const qIdx = indexFor(["question", "faq_question", "q"], 0);
    const aIdx = indexFor(["answer", "faq_answer", "response", "a"], 1);
    const cIdx = indexFor(["category", "category_label", "category_key"], 2);
    const sIdx = indexFor(["sort_order", "sort", "order"], 3);
    const vIdx = indexFor(["visibility"], 4);
    const stIdx = indexFor(["status"], 5);

    return dataRows.map((cells, index) => {
      const question = String(cells[qIdx] || "").trim();
      const answer = String(cells[aIdx] || "").trim();
      const category = String(cells[cIdx] || "General").trim() || "General";
      const sort = Number(String(cells[sIdx] || "").trim());
      const visibility = String(cells[vIdx] || "public").trim().toLowerCase() || "public";
      const status = String(cells[stIdx] || "active").trim().toLowerCase() || "active";
      return {
        question,
        answer,
        category,
        sort_order: Number.isFinite(sort) ? sort : 100 + index,
        visibility: ["public", "members", "admins", "hidden"].includes(visibility) ? visibility : "public",
        status: ["active", "draft", "hidden", "archived"].includes(status) ? status : "active"
      };
    }).filter((row) => row.question && row.answer);
  }

  function resetInfoFaqForm(skipConfirm = false) {
    if (!skipConfirm && !confirmDiscardInfoFaqChanges("You have unsaved FAQ item changes. Start a new FAQ and discard them?")) return;
    selectedInfoFaqItemId = "";
    renderInfoFaqManager();
  }

  function bindInfoFaqManagerEvents(wrap) {
    wrap.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el.dataset.infoFaqDirtyBound === "true") return;
      el.dataset.infoFaqDirtyBound = "true";
      el.addEventListener("input", markInfoFaqDirty);
      el.addEventListener("change", markInfoFaqDirty);
    });

    wrap.querySelectorAll("[data-faq-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!confirmDiscardInfoFaqChanges("You have unsaved FAQ item changes. Switch records and discard them?")) return;
        selectedInfoFaqItemId = button.getAttribute("data-faq-edit") || "";
        renderInfoFaqManager();
      });
    });

    getEl("se-faq-item-new")?.addEventListener("click", () => resetInfoFaqForm(false));
    getEl("se-faq-item-save")?.addEventListener("click", saveInfoFaqItem);
    getEl("se-faq-item-archive")?.addEventListener("click", () => setInfoFaqArchived(true));
    getEl("se-faq-item-restore")?.addEventListener("click", () => setInfoFaqArchived(false));
    getEl("se-faq-refresh")?.addEventListener("click", () => loadInfoFaqItems(true));

    getEl("se-faq-include-archived")?.addEventListener("change", async () => {
      if (!confirmDiscardInfoFaqChanges("You have unsaved FAQ item changes. Reload the list and discard them?")) {
        const el = getEl("se-faq-include-archived");
        if (el) el.checked = infoFaqIncludeArchived;
        return;
      }
      infoFaqIncludeArchived = getChecked("se-faq-include-archived");
      await loadInfoFaqItems(false);
    });

    getEl("se-faq-csv-file")?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const textarea = getEl("se-faq-csv-text");
      if (textarea) textarea.value = text;
      infoFaqCsvPreviewRows = faqRowsFromCsv(text);
      renderCsvPreview(infoFaqCsvPreviewRows);
    });

    getEl("se-faq-csv-preview-button")?.addEventListener("click", () => {
      infoFaqCsvPreviewRows = faqRowsFromCsv(getValue("se-faq-csv-text", ""));
      renderCsvPreview(infoFaqCsvPreviewRows);
    });

    getEl("se-faq-csv-import-button")?.addEventListener("click", importInfoFaqCsvRows);
  }

  function renderInfoFaqManager() {
    const wrap = getEl("se-info-faq-manager");
    if (!wrap) return;

    const current = currentInfoFaqItem();
    const activeCount = infoFaqItems.filter((item) => !item.archived_at && item.status !== "archived").length;
    const archivedCount = infoFaqItems.filter((item) => item.archived_at || item.status === "archived").length;
    const rows = infoFaqItems.map((item) => {
      const display = normalizeFaqRowForDisplay(item);
      const isSelected = String(display.faq_item_id) === String(selectedInfoFaqItemId);
      const meta = [display.category, display.visibility, display.status, `sort ${display.sort_order}`].filter(Boolean).join(" • ");
      return `<div class="se-faq-row ${isSelected ? "is-selected" : ""}">
        <div><strong>${escapeHtml(display.question)}</strong><small>${escapeHtml(meta)}${display.archived_at ? " • archived" : ""}</small></div>
        <button class="se-button secondary small" type="button" data-faq-edit="${escapeHtml(display.faq_item_id)}">Edit</button>
      </div>`;
    }).join("");

    isInfoFaqHydrating = true;
    wrap.innerHTML = `
      <div class="se-faq-toolbar">
        <div>
          <div class="se-faq-count"><strong>${activeCount}</strong> active / <strong>${archivedCount}</strong> archived FAQ item${infoFaqItems.length === 1 ? "" : "s"}</div>
          <div id="se-faq-dirty-indicator" class="se-dirty">FAQ saved / clean</div>
        </div>
        <div class="se-faq-actions">
          <label class="se-check" style="margin:0;"><input id="se-faq-include-archived" type="checkbox" data-skip-page-dirty="true" ${infoFaqIncludeArchived ? "checked" : ""}><span>Show archived</span></label>
          <button id="se-faq-refresh" class="se-button secondary" type="button">Refresh FAQs</button>
        </div>
      </div>

      <div class="se-faq-editor-grid">
        <section class="se-faq-editor-panel">
          <h3 class="se-faq-subtitle">${current ? "Edit FAQ Item" : "New FAQ Item"}</h3>
          <div class="se-two-col">
            <label class="se-field"><span class="se-label">Category</span><input id="se-faq-item-category" class="se-input" type="text" data-skip-page-dirty="true" value="${escapeHtml(current?.category || "General")}" placeholder="General, Membership, Operations"></label>
            <label class="se-field"><span class="se-label">Sort Order</span><input id="se-faq-item-sort" class="se-input" type="number" data-skip-page-dirty="true" value="${escapeHtml(current?.sort_order ?? 100)}"></label>
          </div>
          <label class="se-field"><span class="se-label">Question</span><input id="se-faq-item-question" class="se-input" type="text" data-skip-page-dirty="true" value="${escapeHtml(current?.question || "")}"></label>
          <label class="se-field"><span class="se-label">Answer</span><textarea id="se-faq-item-answer" class="se-input se-textarea" data-skip-page-dirty="true">${escapeHtml(current?.answer || "")}</textarea></label>
          <div class="se-two-col">
            <label class="se-field"><span class="se-label">Visibility</span><select id="se-faq-item-visibility" class="se-select" data-skip-page-dirty="true">
              <option value="public" ${selectedAttr(current?.visibility || "public", "public")}>public</option>
              <option value="members" ${selectedAttr(current?.visibility, "members")}>members</option>
              <option value="admins" ${selectedAttr(current?.visibility, "admins")}>admins</option>
              <option value="hidden" ${selectedAttr(current?.visibility, "hidden")}>hidden</option>
            </select></label>
            <label class="se-field"><span class="se-label">Status</span><select id="se-faq-item-status" class="se-select" data-skip-page-dirty="true">
              <option value="active" ${selectedAttr(current?.status || "active", "active")}>active</option>
              <option value="draft" ${selectedAttr(current?.status, "draft")}>draft</option>
              <option value="hidden" ${selectedAttr(current?.status, "hidden")}>hidden</option>
              <option value="archived" ${selectedAttr(current?.status, "archived")}>archived</option>
            </select></label>
          </div>
          <div class="se-faq-actions">
            <button id="se-faq-item-save" class="se-button" type="button">Save FAQ</button>
            <button id="se-faq-item-new" class="se-button secondary" type="button">New FAQ</button>
            ${current && !current.archived_at ? `<button id="se-faq-item-archive" class="se-button danger" type="button">Archive FAQ</button>` : ""}
            ${current && current.archived_at ? `<button id="se-faq-item-restore" class="se-button secondary" type="button">Restore FAQ</button>` : ""}
          </div>
        </section>

        <section class="se-faq-list-panel">
          <h3 class="se-faq-subtitle">FAQ Records</h3>
          <div class="se-faq-list">${rows || `<div class="se-empty">No FAQ rows yet. Create the first FAQ or import CSV rows below.</div>`}</div>
        </section>
      </div>

      <details class="se-faq-import">
        <summary>CSV Import / Seed FAQs</summary>
        <p class="se-subtitle">Paste or upload CSV. Recommended headers: question, answer, category, sort_order. Import creates new FAQ records; it does not overwrite existing rows.</p>
        <label class="se-field"><span class="se-label">CSV File</span><input id="se-faq-csv-file" class="se-input" type="file" accept=".csv,text/csv,text/plain" data-skip-page-dirty="true"></label>
        <label class="se-field"><span class="se-label">CSV Text</span><textarea id="se-faq-csv-text" class="se-input se-textarea" data-skip-page-dirty="true" placeholder="question,answer,category,sort_order\nWhat is your application process?,Submit an application and wait for review.,Membership,100"></textarea></label>
        <div class="se-faq-actions">
          <button id="se-faq-csv-preview-button" class="se-button secondary" type="button">Preview CSV</button>
          <button id="se-faq-csv-import-button" class="se-button" type="button">Import Previewed FAQs</button>
        </div>
        <div id="se-faq-csv-preview" style="margin-top:12px;"><div class="se-empty">Preview CSV rows before importing.</div></div>
      </details>
    `;
    isInfoFaqHydrating = false;
    bindInfoFaqManagerEvents(wrap);
    markInfoFaqClean();
    renderCsvPreview(infoFaqCsvPreviewRows);
  }

  async function loadInfoFaqItems(preserveSelected = false) {
    if (!selectedCustomerPageId || !isCurrentInfoPage()) {
      infoFaqItems = [];
      selectedInfoFaqItemId = "";
      infoFaqCsvPreviewRows = [];
      setInfoFaqDirty(false);
      return;
    }
    setStatus("Loading Info/FAQ records...");
    const result = await callCoreAdminAction("list_info_faq_items", {
      customer_page_id: selectedCustomerPageId,
      include_archived: infoFaqIncludeArchived
    });
    infoFaqItems = Array.isArray(result.faq_items) ? result.faq_items : [];
    if (!preserveSelected || !infoFaqItems.some((item) => String(item.faq_item_id) === String(selectedInfoFaqItemId))) {
      selectedInfoFaqItemId = "";
    }
    renderInfoFaqManager();
    setStatus(`Loaded ${infoFaqItems.length} FAQ record${infoFaqItems.length === 1 ? "" : "s"}.`);
  }

  async function saveInfoFaqItem() {
    if (!selectedCustomerPageId || !isCurrentInfoPage()) {
      setStatus("Select the Info page before saving FAQ items.");
      return;
    }
    const question = getValue("se-faq-item-question", "").trim();
    const answer = getValue("se-faq-item-answer", "").trim();
    if (!question || !answer) {
      setStatus("FAQ question and answer are required.");
      return;
    }
    setStatus("Saving FAQ item...");
    const result = await callCoreAdminAction("upsert_info_faq_item", {
      customer_page_id: selectedCustomerPageId,
      faq_item_id: selectedInfoFaqItemId || undefined,
      category: getValue("se-faq-item-category", "General").trim() || "General",
      question,
      answer,
      sort_order: Number(getValue("se-faq-item-sort", "100")) || 100,
      visibility: getValue("se-faq-item-visibility", "public"),
      status: getValue("se-faq-item-status", "active"),
      metadata_json: { saved_from: "page_editor_inline_faq_manager" }
    });
    selectedInfoFaqItemId = "";
    await loadInfoFaqItems(false);
    setInfoFaqDirty(false);
    setStatus("FAQ item saved. Ready for new FAQ.");
  }

  async function setInfoFaqArchived(archive) {
    if (!selectedCustomerPageId || !selectedInfoFaqItemId) return;
    if (!window.confirm(archive ? "Archive this FAQ item? It will stop showing publicly but can be restored later." : "Restore this archived FAQ item?")) return;
    setStatus(archive ? "Archiving FAQ item..." : "Restoring FAQ item...");
    await callCoreAdminAction(archive ? "archive_info_faq_item" : "restore_info_faq_item", {
      customer_page_id: selectedCustomerPageId,
      faq_item_id: selectedInfoFaqItemId
    });
    selectedInfoFaqItemId = "";
    await loadInfoFaqItems(false);
    setStatus(archive ? "FAQ item archived." : "FAQ item restored.");
  }

  async function importInfoFaqCsvRows() {
    if (!selectedCustomerPageId || !isCurrentInfoPage()) {
      setStatus("Select the Info page before importing FAQs.");
      return;
    }
    const rows = infoFaqCsvPreviewRows.length ? infoFaqCsvPreviewRows : faqRowsFromCsv(getValue("se-faq-csv-text", ""));
    if (!rows.length) {
      setStatus("No valid CSV FAQ rows to import. Each row needs question and answer.");
      return;
    }
    if (!window.confirm(`Import ${rows.length} FAQ row${rows.length === 1 ? "" : "s"}? This creates new records and does not overwrite existing FAQs.`)) return;
    setStatus(`Importing ${rows.length} FAQ row${rows.length === 1 ? "" : "s"}...`);
    let imported = 0;
    for (const row of rows) {
      await callCoreAdminAction("upsert_info_faq_item", {
        customer_page_id: selectedCustomerPageId,
        category: row.category || "General",
        question: row.question,
        answer: row.answer,
        sort_order: Number(row.sort_order) || 100,
        visibility: row.visibility || "public",
        status: row.status || "active",
        metadata_json: { imported_from_csv: true, imported_from: "page_editor_inline_faq_manager" }
      });
      imported += 1;
      setStatus(`Imported ${imported} of ${rows.length} FAQ rows...`);
    }
    infoFaqCsvPreviewRows = [];
    await loadInfoFaqItems(false);
    setStatus(`Imported ${imported} FAQ row${imported === 1 ? "" : "s"}.`);
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1280px;margin:0 auto;}
        .se-header-card,.se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-inner-card{box-shadow:none;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:15px;line-height:1.45;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start;}
        .se-sidebar{position:sticky;top:76px;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-textarea{min-height:90px;resize:vertical;}
        .se-check,.se-toggle{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.3;margin-bottom:9px;}
        .se-check input,.se-toggle input{margin-top:2px;flex:0 0 auto;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.full{width:100%;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-dirty{display:inline-flex;border-radius:999px;padding:6px 10px;background:#edf7ed;color:#265c2b;font-size:12px;font-weight:900;}
        .se-dirty.is-dirty{background:#fff0d9;color:#8a5200;}
        .se-note{font-size:12px;line-height:1.35;color:#5d6b82;margin-top:8px;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:20px;color:#5d6b82;background:#fbfcfe;}
        .se-history-tools{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:12px;}
        .se-history-list{max-height:430px;overflow:auto;padding-right:4px;}
        .se-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px;border:1px solid #e1e7f0;border-radius:12px;padding:10px;margin-top:10px;background:#fbfcfe;}
        .se-history-title{display:block;font-size:13px;font-weight:900;color:#172033;margin-bottom:3px;}
        .se-history-meta{display:block;font-size:12px;line-height:1.35;color:#5d6b82;margin-top:2px;}
        .se-history-details summary{cursor:pointer;list-style:none;}
        .se-history-details summary::-webkit-details-marker{display:none;}
        .se-history-details summary::after{content:"Show details";display:inline-flex;margin-top:6px;font-size:11px;font-weight:900;color:#1f4f82;}
        .se-history-details[open] summary::after{content:"Hide details";}
        .se-history-json{margin:8px 0 0 0;max-height:180px;overflow:auto;background:#101827;color:#e7edf6;border-radius:10px;padding:10px;font-family:Consolas,Monaco,monospace;font-size:11px;line-height:1.45;}
        .se-history-count{font-size:12px;color:#5d6b82;font-weight:800;}
        .se-danger-zone{border-color:#ffd0d0;background:#fffafa;}
        .se-button.danger{border-color:#9f1d1d;background:#9f1d1d;color:#fff;}
        .se-button.small{padding:7px 10px;font-size:12px;}
        .se-faq-manager{display:grid;gap:12px;}
        .se-faq-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid #e1e7f0;background:#fbfcfe;border-radius:12px;padding:12px;}
        .se-faq-count{font-size:13px;color:#26344d;margin-bottom:8px;}
        .se-faq-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .se-faq-editor-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.85fr);gap:14px;align-items:start;}
        .se-faq-editor-panel,.se-faq-list-panel,.se-faq-import{border:1px solid #e1e7f0;background:#fbfcfe;border-radius:12px;padding:14px;}
        .se-faq-subtitle{margin:0 0 12px 0;font-size:16px;line-height:1.25;color:#172033;}
        .se-faq-list{display:grid;gap:8px;max-height:420px;overflow:auto;padding-right:4px;}
        .se-faq-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e1e7f0;border-radius:12px;padding:10px;background:#fff;}
        .se-faq-row.is-selected{border-color:#1f4f82;background:#eef5ff;}
        .se-faq-row strong{display:block;color:#172033;}
        .se-faq-row small{display:block;color:#5d6b82;margin-top:3px;}
        .se-faq-import summary{cursor:pointer;font-weight:900;color:#1f4f82;margin-bottom:10px;}
        .se-faq-csv-table-wrap{max-height:260px;overflow:auto;border:1px solid #e1e7f0;border-radius:10px;background:#fff;}
        .se-faq-csv-table{width:100%;border-collapse:collapse;font-size:12px;}
        .se-faq-csv-table th,.se-faq-csv-table td{border-bottom:1px solid #e1e7f0;padding:7px;text-align:left;vertical-align:top;}
        .se-faq-csv-table th{background:#eef3f8;color:#26344d;font-weight:900;position:sticky;top:0;}
        @media(max-width:900px){.se-layout{grid-template-columns:1fr;}.se-sidebar{position:relative;top:auto;}.se-controls{grid-template-columns:1fr;}.se-two-col{grid-template-columns:1fr;}}

        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-auth-gate{display:block;}
      </style>

      <main class="se-wrap">
        <section class="se-header-card">
          <h1 class="se-title">Page Editor</h1>
          <p class="se-subtitle">Edit page-specific text, settings, and feature/component visibility. Customer-wide style remains in Layout Designer.</p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-page-editor-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <div class="se-controls">
            <label class="se-field"><span class="se-label">Email</span><input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username"></label>
            <label class="se-field"><span class="se-label">Password</span><input id="se-password" class="se-input" type="password" autocomplete="current-password"></label>
            <button id="se-login" class="se-button">Log in</button>
            <button id="se-logout" class="se-button secondary">Log out</button>
            <button id="se-refresh" class="se-button secondary">Refresh</button>
          </div>
          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>


        <section id="se-auth-gate-notice" class="se-card se-auth-gate">
          <h2 class="se-section-title">Login required</h2>
          <p class="se-subtitle">This admin page is hidden until a valid platform-admin session is active. Backend permissions still enforce access; this gate prevents accidental viewing/editing while logged out.</p>
        </section>

        <section class="se-layout" data-auth-required="true">
          <aside class="se-sidebar">
            <section class="se-card">
              <h2 class="se-section-title">Select Page</h2>
              <label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label>
              <label class="se-field"><span class="se-label">Enabled Page</span><select id="se-page-select" class="se-select"><option value="">Select customer first...</option></select></label>
              <button id="se-load-page-editor" class="se-button secondary full" type="button">Reload page editor</button>
              <button id="se-save-top" class="se-button full" type="button" style="margin-top:8px;">Save page</button>
              <div style="margin-top:10px;"><span id="se-dirty-indicator" class="se-dirty">Saved / clean</span></div>
              <div class="se-note">Selecting an enabled page auto-loads the editor. Save before switching pages.</div>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Page Features / Components</h2>
              <p class="se-subtitle">Page-specific visibility controls. These do not change the customer-wide Layout Designer style.</p>
              <label class="se-toggle"><input id="se-feature-announcement-strip" type="checkbox"><span><strong>Announcement strip</strong><br>Short page-level notice near the top.</span></label>
              <label class="se-toggle"><input id="se-feature-banner-scroller" type="checkbox"><span><strong>Banner scroller</strong><br>Scrolling or rotating banner area.</span></label>
              <label class="se-toggle"><input id="se-feature-hero-media" type="checkbox"><span><strong>Hero media</strong><br>Hero image/video/media area when supported.</span></label>
              <label class="se-toggle"><input id="se-feature-primary-cta-block" type="checkbox"><span><strong>Primary CTA block</strong><br>Prominent call-to-action section.</span></label>
              <label class="se-toggle"><input id="se-feature-secondary-content-section" type="checkbox"><span><strong>Secondary content section</strong><br>Additional reusable text/card section.</span></label>
              <label class="se-toggle"><input id="se-feature-filter-controls" type="checkbox"><span><strong>Filter controls</strong><br>Page-level filters for module content.</span></label>
              <label class="se-toggle"><input id="se-feature-dashboard-cards" type="checkbox"><span><strong>Dashboard cards</strong><br>Summary/stat cards where applicable.</span></label>
              <label class="se-toggle"><input id="se-feature-empty-state-panel" type="checkbox"><span><strong>Empty-state panel</strong><br>Helpful placeholder when no module data exists.</span></label>
            </section>

            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <h2 class="se-section-title" style="margin:0;">History / Restore</h2>
                  <p class="se-subtitle">Scoped to the selected customer page. Restores create new history entries.</p>
                </div>
                <button id="se-refresh-page-history" class="se-button secondary" type="button">Refresh</button>
              </div>
              <div class="se-history-tools">
                <label class="se-field"><span class="se-label">Filter history</span><select id="se-page-history-filter" class="se-select"><option value="all">All events</option><option value="saves">Saves</option><option value="restores">Restores</option><option value="defaults">Default resets</option><option value="checkpoints">Manual checkpoints</option></select></label>
                <div id="se-page-history-count" class="se-history-count"></div>
              </div>
              <button id="se-revert-page-default" class="se-button danger full" type="button" style="margin-top:12px;">Revert page to template default</button>
              <div class="se-note">This resets page copy/options only. It does not change page slug, status, or nav visibility. A restore point is saved before and after the reset.</div>
              <div id="se-page-history-list" class="se-history-list" style="margin-top:12px;">No history loaded yet.</div>
              <button id="se-load-more-page-history" class="se-button secondary full" type="button" style="margin-top:10px;display:none;">Load 10 more</button>
            </section>

            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <h2 class="se-section-title" style="margin:0;">Last Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </aside>

          <section>
            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <h2 class="se-section-title">Editable Fields</h2>
                  <p class="se-subtitle">Loaded from the selected customer page and saved back to page settings.</p>
                </div>
                <button id="se-save-bottom" class="se-button" type="button">Save page</button>
              </div>
              <div id="se-editor-fields" style="margin-top:14px;">
                <div class="se-empty">No editable schema loaded for this page.</div>
              </div>
            </section>
          </section>
        </section>
      </main>
    `;

    updateDirtyIndicator();
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;

    renderCustomers();

    if (selectedCustomerId) {
      await loadCustomerPages();
    } else {
      setStatus("No customers found.");
    }
  }

  async function loadCustomerPages() {
    if (!selectedCustomerId) {
      customerPages = [];
      selectedCustomerPageId = "";
      renderPages();
      return;
    }

    setStatus("Loading customer pages...");
    const result = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(result.customer_pages) ? result.customer_pages : [];

    renderPages();

    if (selectedCustomerPageId) {
      await loadSelectedPageEditor();
    } else {
      clearEditor();
      setStatus("Customer pages loaded. No enabled page is available.");
    }
  }

  async function loadSelectedPageEditor() {
    if (!selectedCustomerPageId) {
      clearEditor();
      setStatus("No enabled page selected.");
      return;
    }

    setStatus("Loading page editor...");
    const result = await callCoreAdminAction("get_customer_page_settings", { customer_page_id: selectedCustomerPageId });

    currentCustomerPage = result.customer_page || null;
    currentPageSettings = result.page_settings || null;
    currentEditableSchema = result.editable_schema_json || {};

    isHydrating = true;
    renderEditorFields();
    applyFeatureTogglesToForm(currentPageSettings);
    bindDirtyWithin(getEl("se-editor-fields"));
    FEATURE_FIELDS.forEach(([, id]) => {
      const el = getEl(id);
      if (el && el.dataset.dirtyBound !== "true") {
        el.dataset.dirtyBound = "true";
        el.addEventListener("change", markDirty);
      }
    });
    isHydrating = false;

    if (isCurrentInfoPage()) {
      await loadInfoFaqItems(false);
    } else {
      infoFaqItems = [];
      selectedInfoFaqItemId = "";
      infoFaqCsvPreviewRows = [];
      setInfoFaqDirty(false);
    }

    await loadPageHistory();
    markClean();
    setStatus("Page editor loaded.");
  }

  async function savePageSettings() {
    if (!selectedCustomerPageId || !currentCustomerPage || !currentPageSettings) {
      setStatus("No page loaded to save.");
      return;
    }

    isSaving = true;
    setStatus("Saving page...");

    const navLabel = getValue("se-nav-label", currentCustomerPage.nav_label || "");
    const status = getValue("se-page-status", currentCustomerPage.status || "draft");
    const showInNav = getChecked("se-show-in-nav");
    const contentJson = getContentJson();
    const labelsJson = getLabelsJson();
    const optionsJson = getOptionsJson();

    const visibilityJson = {
      ...(currentPageSettings.visibility_json || {}),
      features: getFeatureTogglesPayload()
    };

    await callCoreAdminAction("update_customer_page", {
      customer_page_id: selectedCustomerPageId,
      nav_label: navLabel,
      status,
      show_in_nav: showInNav
    });

    const updateResult = await callCoreAdminAction("update_page_settings", {
      customer_page_id: selectedCustomerPageId,
      title: contentJson.hero_title || currentPageSettings.title || "",
      intro_text: contentJson.hero_intro || currentPageSettings.intro_text || "",
      content_json: contentJson,
      labels_json: labelsJson,
      options_json: optionsJson,
      visibility_json: visibilityJson,
      note: "Page Editor save"
    });

    currentPageSettings = updateResult.page_settings || currentPageSettings;
    currentCustomerPage = { ...currentCustomerPage, nav_label: navLabel, status, show_in_nav: showInNav };

    markClean();
    pageHistoryLimit = 10;
    await loadPageHistory();
    isSaving = false;
    setStatus("Page saved.");
  }

  function bindEvents() {
    window.addEventListener("beforeunload", (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = DIRTY_MESSAGE;
    });

    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = getValue("se-email", "");
        const password = getValue("se-password", "");
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
        if (!confirmDiscardChanges("You have unsaved page changes. Log out and discard them?")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        customerPages = [];
        selectedCustomerId = "";
        selectedCustomerPageId = "";
        renderCustomers();
        renderPages();
        clearEditor();
        setAuthGate(false);
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscardChanges("You have unsaved page changes. Refresh page data and discard them?")) return;
        markClean();
        await loadCustomers();
      } catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        if (!confirmDiscardChanges("You have unsaved page changes. Switch customers and discard them?")) {
          event.target.value = selectedCustomerId;
          return;
        }
        selectedCustomerId = event.target.value || "";
        selectedCustomerPageId = "";
        pageHistoryLimit = 10;
        markClean();
        await loadCustomerPages();
      } catch (error) {
        setStatus("Customer load failed.");
        setOutput({ ok: false, event: "customer_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-page-select")?.addEventListener("change", async (event) => {
      try {
        if (!confirmDiscardChanges("You have unsaved page changes. Switch pages and discard them?")) {
          event.target.value = selectedCustomerPageId;
          return;
        }
        selectedCustomerPageId = event.target.value || "";
        pageHistoryLimit = 10;
        markClean();
        await loadSelectedPageEditor();
      } catch (error) {
        setStatus("Page editor load failed.");
        setOutput({ ok: false, event: "page_editor_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-load-page-editor")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscardChanges("Reload this page editor and discard unsaved changes?")) return;
        markClean();
        await loadSelectedPageEditor();
      } catch (error) {
        setStatus("Page editor reload failed.");
        setOutput({ ok: false, event: "page_editor_reload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    ["se-save-top", "se-save-bottom"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", async () => {
        try {
          await savePageSettings();
        } catch (error) {
          isSaving = false;
          setStatus("Save failed.");
          setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) });
        }
      });
    });

    document.getElementById("se-refresh-page-history")?.addEventListener("click", async () => {
      try { pageHistoryLimit = 10; await loadPageHistory(); }
      catch (error) {
        setStatus("Page history refresh failed.");
        setOutput({ ok: false, event: "page_history_refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-page-history-filter")?.addEventListener("change", async () => {
      try {
        pageHistoryLimit = 10;
        await loadPageHistory();
      } catch (error) {
        setStatus("Page history filter failed.");
        setOutput({ ok: false, event: "page_history_filter_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-load-more-page-history")?.addEventListener("click", async () => {
      try {
        pageHistoryLimit += 10;
        await loadPageHistory();
      } catch (error) {
        setStatus("Load more page history failed.");
        setOutput({ ok: false, event: "page_history_load_more_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-revert-page-default")?.addEventListener("click", async () => {
      try {
        if (!selectedCustomerPageId) {
          setStatus("Select a page first.");
          return;
        }
        if (!confirmDiscardChanges("You have unsaved page changes. Revert this page to template defaults and discard them?")) return;
        if (!window.confirm("Revert this page copy/options to template defaults? This will not change page slug, status, or nav visibility.")) return;

        isSaving = true;
        setStatus("Reverting page to template defaults...");
        const result = await callCoreAdminAction("reset_page_settings_to_template_defaults", {
          customer_page_id: selectedCustomerPageId
        });
        currentPageSettings = result.page_settings || currentPageSettings;
        pageHistoryLimit = 10;
        await loadSelectedPageEditor();
        markClean();
        setStatus("Page reverted to template defaults.");
      } catch (error) {
        setStatus("Revert to default failed.");
        setOutput({ ok: false, event: "page_revert_default_failed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        isSaving = false;
      }
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);

    FEATURE_FIELDS.forEach(([, id]) => {
      const el = getEl(id);
      if (el) el.addEventListener("change", markDirty);
    });
  }

  async function boot() {
    renderShell();
    setAuthGate(false);
    bindEvents();

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

// ADMIN-PAGE-page-editor-current.js END
