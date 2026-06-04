// ADMIN-PAGE-page-editor-current.js
// Internal Version: 2026-06-04-007
// Purpose: Page Editor with history/restore, reset-to-template-defaults, corrected dirty-state tracking, and Aircraft page contract fields.
// Uses existing core-admin-action backend actions.
// Actions used: list_customers, list_customer_pages, get_customer_page_settings, update_customer_page, update_page_settings, list_page_settings_history, restore_page_settings_snapshot, reset_page_settings_to_template_defaults.

(function () {
  "use strict";

  const VERSION = "2026-06-04-007";
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
      window.SyncEtcAdminShell.setDirty(isDirty, DIRTY_MESSAGE);
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

    return options;
  }

  function bindDirtyWithin(root) {
    if (!root) return;
    root.querySelectorAll("input, textarea, select").forEach((el) => {
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

  function renderPageHistory() {
    const list = getEl("se-page-history-list");
    if (!list) return;

    if (!selectedCustomerPageId) {
      list.innerHTML = "Select a page to view restore points.";
      return;
    }

    const usefulHistory = pageHistory.filter((row) => {
      const eventType = String(row.event_type || "");
      return ["before_save", "after_save", "before_restore", "after_restore", "before_reset_to_default", "after_reset_to_default", "manual_checkpoint"].includes(eventType);
    });

    if (!usefulHistory.length) {
      list.innerHTML = "No page history yet. Save this page to create restore points.";
      return;
    }

    list.innerHTML = usefulHistory.map((row) => {
      const snapshot = row.snapshot_json || {};
      const pageSettings = snapshot.page_settings || {};
      const content = pageSettings.content_json || {};
      const page = snapshot.customer_page || {};
      const date = row.created_at ? new Date(row.created_at).toLocaleString() : "";
      const eventLabel = String(row.event_type || "")
        .replace("before_save", "Before save")
        .replace("after_save", "After save")
        .replace("before_restore", "Before restore")
        .replace("after_restore", "After restore")
        .replace("before_reset_to_default", "Before default reset")
        .replace("after_reset_to_default", "After default reset")
        .replace("manual_checkpoint", "Manual checkpoint");
      const title = pageSettings.title || content.hero_title || page.nav_label || page.page_key || "Page snapshot";
      return `
        <div class="se-history-row">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <div class="se-history-meta">${escapeHtml(eventLabel)} | ${escapeHtml(date)}</div>
            ${row.note ? `<div class="se-history-meta">${escapeHtml(row.note)}</div>` : ""}
          </div>
          <button class="se-button secondary se-restore-page-history" data-history-id="${escapeHtml(row.history_id)}" type="button">Restore</button>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".se-restore-page-history").forEach((button) => {
      button.addEventListener("click", async () => {
        const historyId = button.getAttribute("data-history-id");
        if (!historyId || !selectedCustomerPageId) return;
        if (!confirmDiscardChanges("You have unsaved page changes. Restore this history snapshot and discard them?")) return;
        if (!window.confirm("Restore this page settings snapshot?")) return;

        try {
          isSaving = true;
          setStatus("Restoring page history snapshot...");
          const result = await callCoreAdminAction("restore_page_settings_snapshot", {
            customer_page_id: selectedCustomerPageId,
            history_id: historyId
          });
          currentPageSettings = result.page_settings || currentPageSettings;
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
      renderPageHistory();
      return;
    }

    const result = await callCoreAdminAction("list_page_settings_history", {
      customer_page_id: selectedCustomerPageId,
      limit: 25
    });
    pageHistory = Array.isArray(result.history) ? result.history : [];
    renderPageHistory();
  }

  function clearEditor() {
    currentCustomerPage = null;
    currentPageSettings = null;
    currentEditableSchema = null;
    pageHistory = [];
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
    const isAircraftPage = templateKey === "aircraft";

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

    editor.innerHTML = pageIdentityHtml + heroHtml + (isAircraftPage ? aircraftHtml : genericHtml);

    isHydrating = true;
    bindDirtyWithin(editor);
    isHydrating = false;
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
        .se-history-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e1e7f0;border-radius:12px;padding:10px;margin-top:10px;background:#fbfcfe;}
        .se-history-meta{font-size:12px;line-height:1.35;color:#5d6b82;margin-top:3px;}
        .se-danger-zone{border-color:#ffd0d0;background:#fffafa;}
        .se-button.danger{border-color:#9f1d1d;background:#9f1d1d;color:#fff;}
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
                  <p class="se-subtitle">Recent restore points for the selected page.</p>
                </div>
                <button id="se-refresh-page-history" class="se-button secondary" type="button">Refresh</button>
              </div>
              <button id="se-revert-page-default" class="se-button danger full" type="button" style="margin-top:12px;">Revert page to template default</button>
              <div class="se-note">This resets page copy/options only. It does not change page slug, status, or nav visibility.</div>
              <div id="se-page-history-list" style="margin-top:12px;">No history loaded yet.</div>
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
      try { await loadPageHistory(); }
      catch (error) {
        setStatus("Page history refresh failed.");
        setOutput({ ok: false, event: "page_history_refresh_failed", message: error instanceof Error ? error.message : String(error) });
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
