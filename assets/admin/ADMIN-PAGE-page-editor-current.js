// ADMIN-PAGE-page-editor-current.js
// Internal Version: 2026-06-03-003
// Purpose: Schema-driven Page Editor v1 for customer-specific page settings.
// Reads editable_schema_json from the selected page's template and renders the appropriate fields.

(function () {
  "use strict";

  const VERSION = "2026-06-03-003";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-page-editor-root";

  let supabaseClient = null;
  let customers = [];
  let customerPages = [];
  let selectedCustomerId = "";
  let selectedCustomerPageId = "";
  let isDirty = false;
  let isSaving = false;
  let currentPage = null;
  let currentSettings = null;
  let currentSchema = null;

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

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
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
      setStatus(`Logged in as ${data.session.user.email}`);
      await loadCustomers();
    } else {
      setStatus("No active login session. Log in first.");
    }
  }

  async function getAccessToken() {
    if (!supabaseClient) throw new Error("Supabase client is not ready.");
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("No active Supabase Auth session. Log in first.");
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

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID} {
          font-family: Arial, Helvetica, sans-serif;
          color: #172033;
          background: #f5f7fb;
          min-height: 100vh;
          padding: 28px 18px;
          box-sizing: border-box;
        }
        #${ROOT_ID} * { box-sizing: border-box; }
        .se-wrap { max-width: 1180px; margin: 0 auto; }
        .se-card {
          background: #ffffff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23, 32, 51, 0.08);
          padding: 22px;
          margin-bottom: 18px;
        }
        .se-title { margin: 0 0 6px 0; font-size: 28px; line-height: 1.15; letter-spacing: -0.02em; }
        .se-subtitle { margin: 0; color: #5d6b82; font-size: 15px; line-height: 1.45; }
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
        .se-grid { display: grid; grid-template-columns: 360px 1fr; gap: 18px; align-items: start; }
        .se-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .se-label { font-size: 13px; font-weight: 700; color: #26344d; }
        .se-help { color: #5d6b82; font-size: 12px; line-height: 1.4; margin-top: -4px; margin-bottom: 12px; }
        .se-input, .se-select, .se-textarea {
          width: 100%;
          border: 1px solid #c7d2e2;
          border-radius: 10px;
          padding: 10px 11px;
          font-size: 14px;
          background: #ffffff;
          color: #172033;
        }
        .se-textarea { min-height: 88px; resize: vertical; }
        .se-checkbox-row { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
        .se-checkbox-row input { width: 18px; height: 18px; }
        .se-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
        .se-button {
          border: 1px solid #1f4f82;
          background: #1f4f82;
          color: #ffffff;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .se-button.secondary { background: #ffffff; color: #1f4f82; }
        .se-button:disabled { opacity: 0.55; cursor: not-allowed; }
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
          min-height: 100px;
          max-height: 320px;
          font-family: Consolas, Monaco, monospace;
          font-size: 12px;
          line-height: 1.45;
        }
        .se-group {
          border: 1px solid #d8e1ed;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 14px;
          background: #fbfcfe;
        }
        .se-group-title {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 800;
          color: #1f2a44;
        }
        .se-empty {
          border: 1px dashed #b8c6d8;
          border-radius: 12px;
          padding: 18px;
          color: #5d6b82;
          background: #fbfcfe;
        }
        @media (max-width: 880px) { .se-grid { grid-template-columns: 1fr; } }
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Page Editor</h1>
          <p class="se-subtitle">Schema-driven editor for customer-specific page copy, metadata, labels, options, and visibility metadata.</p>
          <div class="se-badge">ADMIN-PAGE-page-editor-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <h2 class="se-title" style="font-size:22px;">Platform Admin Login</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;">
            <label class="se-field">
              <span class="se-label">Email</span>
              <input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username">
            </label>
            <label class="se-field">
              <span class="se-label">Password</span>
              <input id="se-password" class="se-input" type="password" autocomplete="current-password">
            </label>
          </div>
          <div class="se-actions">
            <button id="se-login" class="se-button">Log in</button>
            <button id="se-logout" class="se-button secondary">Log out</button>
            <button id="se-refresh" class="se-button secondary">Refresh</button>
          </div>
          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>

        <section class="se-grid">
          <div>
            <section class="se-card">
              <h2 class="se-title" style="font-size:22px;">Select Page</h2>
              <label class="se-field">
                <span class="se-label">Customer</span>
                <select id="se-customer-select" class="se-select">
                  <option value="">Log in and load customers...</option>
                </select>
              </label>
              <label class="se-field">
                <span class="se-label">Enabled Page</span>
                <select id="se-page-select" class="se-select">
                  <option value="">Select customer first...</option>
                </select>
              </label>
              <div class="se-actions">
                <button id="se-load-page" class="se-button secondary">Load page editor</button>
              <button id="se-save-top" class="se-button">Save page</button>
              <span id="se-dirty-indicator" class="se-dirty">Saved / clean</span>
              </div>
            </section>

            
          <section class="se-card">
            <h2 class="se-title" style="font-size:22px;">Page Features / Components</h2>
            <p class="se-subtitle">These are page-specific visibility controls. They do not change the customer-wide Layout Designer style.</p>
            <div class="se-toggle-grid">
              <label class="se-toggle"><input id="se-feature-announcement-strip" type="checkbox"><span><strong>Announcement strip</strong><br>Short page-level notice near the top.</span></label>
              <label class="se-toggle"><input id="se-feature-banner-scroller" type="checkbox"><span><strong>Banner scroller</strong><br>Scrolling or rotating banner area.</span></label>
              <label class="se-toggle"><input id="se-feature-hero-media" type="checkbox"><span><strong>Hero media</strong><br>Hero image/video/media area when supported.</span></label>
              <label class="se-toggle"><input id="se-feature-primary-cta-block" type="checkbox"><span><strong>Primary CTA block</strong><br>Prominent call-to-action section.</span></label>
              <label class="se-toggle"><input id="se-feature-secondary-content-section" type="checkbox"><span><strong>Secondary content section</strong><br>Additional reusable text/card section.</span></label>
              <label class="se-toggle"><input id="se-feature-filter-controls" type="checkbox"><span><strong>Filter controls</strong><br>Page-level filters for module content.</span></label>
              <label class="se-toggle"><input id="se-feature-dashboard-cards" type="checkbox"><span><strong>Dashboard cards</strong><br>Summary/stat cards where applicable.</span></label>
              <label class="se-toggle"><input id="se-feature-empty-state-panel" type="checkbox"><span><strong>Empty-state panel</strong><br>Helpful placeholder when no module data exists.</span></label>
            </div>
          </section>

<section class="se-card">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                <h2 class="se-title" style="font-size:22px;">Last Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </div>

          <section class="se-card">
            <h2 class="se-title" style="font-size:22px;">Editable Fields</h2>
            <div id="se-editor-fields" style="margin-top:14px;">
              <div class="se-empty">Select a customer page and load the editor.</div>
            </div>
            <div class="se-actions">
              <button id="se-save-page" class="se-button" disabled>Save page settings</button>
            </div>
          </section>
        </section>
      </main>
    `;
  }

  function getStorageValue(field) {
    if (!field || !currentSettings || !currentPage) return field?.default ?? "";

    if (field.storage === "core_customer_pages") {
      return currentPage[field.column || field.key] ?? field.default ?? "";
    }

    const bucket = currentSettings[field.storage] || {};
    return bucket[field.key] ?? field.default ?? "";
  }

  function setNestedPayload(payload, field, value) {
    if (field.storage === "core_customer_pages") {
      payload.page[field.column || field.key] = value;
      return;
    }

    if (!payload.settings[field.storage]) payload.settings[field.storage] = {};
    payload.settings[field.storage][field.key] = value;
  }

  function renderField(field) {
    const key = field.key;
    const id = `se-field-${key}`;
    const value = getStorageValue(field);
    const help = field.help ? `<div class="se-help">${escapeHtml(field.help)}</div>` : "";

    if (field.type === "textarea") {
      return `
        <label class="se-field">
          <span class="se-label">${escapeHtml(field.label || key)}</span>
          <textarea id="${escapeHtml(id)}" class="se-textarea" data-field-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>
        </label>
        ${help}
      `;
    }

    if (field.type === "select") {
      const options = Array.isArray(field.options) ? field.options : [];
      return `
        <label class="se-field">
          <span class="se-label">${escapeHtml(field.label || key)}</span>
          <select id="${escapeHtml(id)}" class="se-select" data-field-key="${escapeHtml(key)}">
            ${options.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
        ${help}
      `;
    }

    if (field.type === "boolean") {
      return `
        <label class="se-checkbox-row">
          <input id="${escapeHtml(id)}" type="checkbox" data-field-key="${escapeHtml(key)}" ${value === true ? "checked" : ""}>
          <span class="se-label">${escapeHtml(field.label || key)}</span>
        </label>
        ${help}
      `;
    }

    if (field.type === "json") {
      return `
        <label class="se-field">
          <span class="se-label">${escapeHtml(field.label || key)}</span>
          <textarea id="${escapeHtml(id)}" class="se-textarea" data-field-key="${escapeHtml(key)}">${escapeHtml(JSON.stringify(value ?? {}, null, 2))}</textarea>
        </label>
        ${help}
      `;
    }

    const type = field.type === "url" ? "url" : "text";
    return `
      <label class="se-field">
        <span class="se-label">${escapeHtml(field.label || key)}</span>
        <input id="${escapeHtml(id)}" class="se-input" type="${type}" data-field-key="${escapeHtml(key)}" value="${escapeHtml(value)}">
      </label>
      ${help}
    `;
  }

  function renderEditorFields() {
    const wrap = document.getElementById("se-editor-fields");
    const saveButton = document.getElementById("se-save-page");
    if (!wrap || !saveButton) return;

    if (!currentPage || !currentSettings || !currentSchema?.groups?.length) {
      wrap.innerHTML = `<div class="se-empty">No editable schema loaded for this page.</div>`;
      saveButton.disabled = true;
      return;
    }

    wrap.innerHTML = `
      <div class="se-status" style="margin-top:0;margin-bottom:14px;">
        Editing: ${escapeHtml(currentPage.nav_label)} | Template: ${escapeHtml(currentPage.core_template_registry?.template_name || "")}
      </div>
      ${currentSchema.groups.map((group) => `
        <section class="se-group">
          <h3 class="se-group-title">${escapeHtml(group.group_label || group.group_key)}</h3>
          ${(group.fields || []).map(renderField).join("")}
        </section>
      `).join("")}
    `;

    saveButton.disabled = false;
  }

  function collectEditorPayload() {
    const payload = {
      page: {},
      settings: {
        content_json: { ...(currentSettings?.content_json || {}) },
        labels_json: { ...(currentSettings?.labels_json || {}) },
        options_json: { ...(currentSettings?.options_json || {}) },
        visibility_json: { ...(currentSettings?.visibility_json || {}) },
      }
    };

    for (const group of currentSchema?.groups || []) {
      for (const field of group.fields || []) {
        const el = document.getElementById(`se-field-${field.key}`);
        if (!el) continue;

        let value;

        if (field.type === "boolean") {
          value = el.checked;
        } else if (field.type === "json") {
          try {
            value = JSON.parse(el.value || "{}");
          } catch {
            throw new Error(`Invalid JSON in field: ${field.label || field.key}`);
          }
        } else if (field.storage === "core_customer_pages" && (field.column || field.key) === "page_slug") {
          value = normalizeKey(el.value);
        } else {
          value = el.value;
        }

        setNestedPayload(payload, field, value);
      }
    }

    return payload;
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

    if (!selectedCustomerId) {
      select.innerHTML = `<option value="">Select customer first...</option>`;
      return;
    }

    if (!customerPages.length) {
      select.innerHTML = `<option value="">No enabled pages found</option>`;
      return;
    }

    select.innerHTML = `<option value="">Select page...</option>` + customerPages.map((page) => `
      <option value="${escapeHtml(page.customer_page_id)}" ${page.customer_page_id === selectedCustomerPageId ? "selected" : ""}>
        ${escapeHtml(page.nav_label)} (${escapeHtml(page.status)})
      </option>
    `).join("");
  }

  function renderSelectors() {
    renderCustomerSelect();
    renderPageSelect();
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    await loadCustomerPages();

    renderSelectors();
    setStatus("Customers loaded.");
  }

  async function loadCustomerPages() {
    if (!selectedCustomerId) {
      customerPages = [];
      selectedCustomerPageId = "";
      renderSelectors();
      return;
    }

    setStatus("Loading customer pages...");
    const result = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(result.customer_pages) ? result.customer_pages : [];

    if (selectedCustomerPageId && !customerPages.some((page) => page.customer_page_id === selectedCustomerPageId)) {
      selectedCustomerPageId = "";
    }

    if (!selectedCustomerPageId && customerPages.length) {
      selectedCustomerPageId = customerPages[0].customer_page_id;
    }

    renderSelectors();
    setStatus("Customer pages loaded.");
  }

  async function loadSelectedPageEditor() {
    if (!selectedCustomerPageId) {
      setStatus("Select a page first.");
      return;
    }

    setStatus("Loading page editor...");
    const result = await callCoreAdminAction("get_customer_page_settings", {
      customer_page_id: selectedCustomerPageId
    });

    currentPage = result.customer_page;
    currentSettings = result.page_settings;
    currentSchema = result.editable_schema_json || currentPage?.core_template_registry?.editable_schema_json || {};

    renderEditorFields();
    setStatus("Page editor loaded.");
      markClean();
  }

  async function savePageSettings() {
    if (!selectedCustomerPageId || !currentPage || !currentSettings || !currentSchema) {
      setStatus("Load a page editor first.");
      return;
    }

    const payload = collectEditorPayload();

    setStatus("Saving page identity...");
    await callCoreAdminAction("update_customer_page", {
      customer_page_id: selectedCustomerPageId,
      ...payload.page
    });

    setStatus("Saving page settings...");
    await (() => {
          const featureToggles = getFeatureTogglesPayload();
          if (!payload.visibility_json || typeof payload.visibility_json !== "object") payload.visibility_json = {};
          payload.visibility_json.features = featureToggles;
        })();

        callCoreAdminAction("update_page_settings", {
      customer_page_id: selectedCustomerPageId,
      content_json: payload.settings.content_json,
      labels_json: payload.settings.labels_json,
      options_json: payload.settings.options_json,
      visibility_json: payload.settings.visibility_json,
      title: payload.settings.content_json?.hero_title || currentSettings.title || "",
      intro_text: payload.settings.content_json?.hero_intro || currentSettings.intro_text || ""
    });

    await loadCustomerPages();
    await loadSelectedPageEditor();
    setStatus("Page settings saved.");
        markClean();
  }


  function applyFeatureTogglesToForm(pageSettings) {
    const visibility = pageSettings?.visibility_json || {};
    const options = pageSettings?.options_json || {};
    const features = visibility.features || options.features || {};

    setChecked("se-feature-announcement-strip", features.show_announcement_strip);
    setChecked("se-feature-banner-scroller", features.show_banner_scroller);
    setChecked("se-feature-hero-media", features.show_hero_media);
    setChecked("se-feature-primary-cta-block", features.show_primary_cta_block);
    setChecked("se-feature-secondary-content-section", features.show_secondary_content_section);
    setChecked("se-feature-filter-controls", features.show_filter_controls);
    setChecked("se-feature-dashboard-cards", features.show_dashboard_cards);
    setChecked("se-feature-empty-state-panel", features.show_empty_state_panel);
  }


  function markDirty() {
    if (isSaving) return;
    isDirty = true;
    updateDirtyIndicator();
  }

  function markClean() {
    isDirty = false;
    updateDirtyIndicator();
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

  function bindEvents() {
    window.addEventListener("beforeunload", (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("se-email")?.value || "";
        const password = document.getElementById("se-password")?.value || "";
        setStatus("Logging in...");
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
        selectedCustomerPageId = "";
        currentPage = null;
        currentSettings = null;
        currentSchema = null;
        renderSelectors();
        renderEditorFields();
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try {
        await loadCustomers();
        if (selectedCustomerPageId) await loadSelectedPageEditor();
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
        markClean();
        selectedCustomerPageId = "";
        currentPage = null;
        currentSettings = null;
        currentSchema = null;
        renderEditorFields();
        await loadCustomerPages();
      } catch (error) {
        setStatus("Customer page load failed.");
        setOutput({ ok: false, event: "load_customer_pages_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-page-select")?.addEventListener("change", (event) => {
      if (!confirmDiscardChanges("You have unsaved page changes. Switch pages and discard them?")) {
          event.target.value = selectedCustomerPageId;
          return;
        }
        selectedCustomerPageId = event.target.value || "";
        markClean();
        if (selectedCustomerPageId) await loadSelectedPage();
    });

    document.getElementById("se-load-page")?.addEventListener("click", async () => {
      try {
        await loadSelectedPageEditor();
      } catch (error) {
        setStatus("Load page editor failed.");
        setOutput({ ok: false, event: "load_page_editor_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-save-page")?.addEventListener("click", async () => {
      try {
        await savePageSettings();
      } catch (error) {
        setStatus("Save failed.");
        setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });


    document.getElementById("se-save-top")?.addEventListener("click", async () => {
      try {
        isSaving = true;
        await savePage();
        markClean();
      } catch (error) {
        setStatus("Save failed.");
        setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        isSaving = false;
      }
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }


    function markDirtyPageEditorInputs() {
      const root = document.getElementById("se-editor-fields") || document.getElementById("syncetc-page-editor-root") || document;
      root.querySelectorAll("input, textarea, select").forEach((el) => {
        if (["se-email", "se-password", "se-customer-select", "se-page-select"].includes(el.id)) return;
        el.addEventListener("input", markDirty);
        el.addEventListener("change", markDirty);
      });
    }

    setTimeout(markDirtyPageEditorInputs, 300);

  async function boot() {
    renderShell();
    bindEvents();
    renderSelectors();

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
