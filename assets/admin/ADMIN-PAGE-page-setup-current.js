// ADMIN-PAGE-page-setup-current.js
// Internal Version: 2026-06-03-003
// Purpose: Page Setup v3 showing registry status separately from honest build status.
// Uses existing core-admin-action backend actions.
// Actions used: list_customers, list_templates, list_customer_pages, enable_customer_page, archive_customer_page, recover_customer_page.

(function () {
  "use strict";

  const VERSION = "2026-06-03-003";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-page-setup-root";

  let supabaseClient = null;
  let customers = [];
  let templates = [];
  let customerPages = [];
  let selectedCustomerId = "";
  let filterStatus = "usable";
  let filterBuildStatus = "all";
  let filterCategory = "all";
  let filterSearch = "";

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

  function getValue(id, fallback = "") {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
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
      await loadAll();
    } else {
      setStatus("No active login session. Log in first.");
    }
  }

  async function getAccessToken() {
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

  function getSelectedCustomer() {
    return customers.find((customer) => customer.customer_id === selectedCustomerId) || null;
  }

  function getPageForTemplate(template) {
    return customerPages.find((page) => page.template_id === template.template_id || page.template_key === template.template_key) || null;
  }

  function isEnabledPage(page) {
    return Boolean(page && page.status !== "archived");
  }

  function getTemplateStatusLabel(template) {
    if (template.status === "active") return "Available";
    if (template.status === "draft") return "Inventory draft";
    return template.status || "unknown";
  }

  function getBuildStatus(template) {
    return template.build_status || "planned";
  }

  function getBuildStatusLabel(template) {
    const status = getBuildStatus(template);
    if (status === "planned") return "Planned";
    if (status === "prototype") return "Prototype";
    if (status === "implemented") return "Implemented";
    if (status === "production") return "Production";
    if (status === "deprecated") return "Deprecated";
    return status;
  }

  function isActuallyUsable(template) {
    return ["prototype", "implemented", "production"].includes(getBuildStatus(template));
  }

  function getTemplateCategory(template) {
    return template.module_category || template.template_category || "uncategorized";
  }

  function getTemplateComplexity(template) {
    return template.complexity_level || "simple";
  }

  function renderCustomers() {
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

  function renderCategoryFilter() {
    const select = document.getElementById("se-category-filter");
    if (!select) return;

    const categories = [...new Set(templates.map(getTemplateCategory).filter(Boolean))].sort();

    select.innerHTML = `<option value="all">All categories</option>` + categories.map((category) => `
      <option value="${escapeHtml(category)}" ${filterCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>
    `).join("");
  }

  function getFilteredTemplates() {
    const search = filterSearch.trim().toLowerCase();

    return templates.filter((template) => {
      const status = template.status || "draft";
      const category = getTemplateCategory(template);

      if (filterStatus === "available" && status !== "active") return false;
      if (filterStatus === "draft" && status !== "draft") return false;
      if (filterStatus === "usable" && !["active", "draft"].includes(status)) return false;
      if (filterBuildStatus !== "all" && getBuildStatus(template) !== filterBuildStatus) return false;
      if (filterCategory !== "all" && category !== filterCategory) return false;

      if (search) {
        const haystack = [
          template.template_key,
          template.template_name,
          template.description,
          template.module_key,
          template.module_category,
          template.complexity_level,
          template.access_default,
          template.notes
        ].join(" ").toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    }).sort((a, b) => {
      const orderA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 9999;
      const orderB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.template_key || "").localeCompare(String(b.template_key || ""));
    });
  }

  function renderSummary() {
    const el = document.getElementById("se-summary");
    if (!el) return;

    const enabled = customerPages.filter(isEnabledPage).length;
    const archived = customerPages.filter((page) => page.status === "archived").length;
    const availableTemplates = templates.filter((template) => template.status === "active").length;
    const plannedTemplates = templates.filter((template) => getBuildStatus(template) === "planned").length;
    const prototypeTemplates = templates.filter((template) => getBuildStatus(template) === "prototype").length;

    el.innerHTML = `
      <div class="se-stat"><strong>${escapeHtml(getSelectedCustomer()?.display_name || "No customer")}</strong><span>Selected customer</span></div>
      <div class="se-stat"><strong>${enabled}</strong><span>Enabled pages</span></div>
      <div class="se-stat"><strong>${archived}</strong><span>Archived pages</span></div>
      <div class="se-stat"><strong>${availableTemplates}</strong><span>Available in registry</span></div>
      <div class="se-stat"><strong>${prototypeTemplates}</strong><span>Prototype builds</span></div>
      <div class="se-stat"><strong>${plannedTemplates}</strong><span>Planned builds</span></div>
    `;
  }

  function renderEnabledPages() {
    const el = document.getElementById("se-enabled-pages");
    if (!el) return;

    const enabledPages = customerPages.filter(isEnabledPage).sort((a, b) => {
      const orderA = Number.isFinite(Number(a.nav_order)) ? Number(a.nav_order) : 9999;
      const orderB = Number.isFinite(Number(b.nav_order)) ? Number(b.nav_order) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.nav_label || a.page_key || "").localeCompare(String(b.nav_label || b.page_key || ""));
    });

    if (!enabledPages.length) {
      el.innerHTML = `<div class="se-empty">No enabled pages for this customer yet.</div>`;
      return;
    }

    el.innerHTML = enabledPages.map((page) => `
      <div class="se-page-row">
        <div>
          <strong>${escapeHtml(page.nav_label || page.page_key || "Page")}</strong>
          <div class="se-meta">${escapeHtml(page.page_key || "")} · ${escapeHtml(page.status || "")} · ${page.show_in_nav === false ? "hidden from nav" : "shown in nav"}</div>
        </div>
        <button class="se-button danger se-archive-page" data-page-id="${escapeHtml(page.customer_page_id)}" type="button">Archive</button>
      </div>
    `).join("");

    el.querySelectorAll(".se-archive-page").forEach((button) => {
      button.addEventListener("click", async () => {
        const pageId = button.getAttribute("data-page-id");
        if (!pageId) return;
        if (!window.confirm("Archive this customer page?")) return;
        await archiveCustomerPage(pageId);
      });
    });
  }

  function renderTemplateCard(template) {
    const page = getPageForTemplate(template);
    const enabled = isEnabledPage(page);
    const archived = page?.status === "archived";
    const category = getTemplateCategory(template);
    const complexity = getTemplateComplexity(template);
    const statusLabel = getTemplateStatusLabel(template);
    const buildStatus = getBuildStatus(template);
    const buildStatusLabel = getBuildStatusLabel(template);
    const requiresData = template.requires_module_data === true;
    const isDraft = template.status === "draft";
    const actuallyUsable = isActuallyUsable(template);

    return `
      <article class="se-template-card ${enabled ? "is-enabled" : ""} ${isDraft ? "is-draft" : ""} build-${escapeHtml(buildStatus)}">
        <div class="se-template-head">
          <div>
            <h3>${escapeHtml(template.template_name || template.template_key)}</h3>
            <div class="se-key">${escapeHtml(template.template_key || "")}</div>
          </div>
          <div class="se-pill-stack">
            <span class="se-pill registry ${isDraft ? "draft" : "available"}">${escapeHtml(statusLabel)}</span>
            <span class="se-pill build ${escapeHtml(buildStatus)}">${escapeHtml(buildStatusLabel)}</span>
          </div>
        </div>

        <p>${escapeHtml(template.description || "No description yet.")}</p>

        <div class="se-chip-row">
          <span class="se-chip">${escapeHtml(category)}</span>
          <span class="se-chip">${escapeHtml(complexity)}</span>
          <span class="se-chip">${escapeHtml(template.access_default || "public")}</span>
          ${requiresData ? `<span class="se-chip warning">module data</span>` : `<span class="se-chip">page settings only</span>`}
        </div>

        <div class="se-template-notes">${escapeHtml(template.build_notes || template.notes || "")}</div>

        <div class="se-template-actions">
          ${enabled ? `<span class="se-active-pill">Enabled</span>` : ""}
          ${archived ? `<button class="se-button secondary se-recover-template" data-page-id="${escapeHtml(page.customer_page_id)}" type="button">Recover</button>` : ""}
          ${!enabled && !archived ? `<button class="se-button ${actuallyUsable ? "" : "secondary"} se-enable-template" data-template-id="${escapeHtml(template.template_id)}" type="button">${actuallyUsable ? "Enable" : "Enable planned/prototype"}</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderTemplates() {
    const el = document.getElementById("se-template-list");
    if (!el) return;

    const filtered = getFilteredTemplates();

    if (!filtered.length) {
      el.innerHTML = `<div class="se-empty">No templates match the current filters.</div>`;
      return;
    }

    el.innerHTML = filtered.map(renderTemplateCard).join("");

    el.querySelectorAll(".se-enable-template").forEach((button) => {
      button.addEventListener("click", async () => {
        const templateId = button.getAttribute("data-template-id");
        if (!templateId) return;
        await enableTemplate(templateId);
      });
    });

    el.querySelectorAll(".se-recover-template").forEach((button) => {
      button.addEventListener("click", async () => {
        const pageId = button.getAttribute("data-page-id");
        if (!pageId) return;
        await recoverCustomerPage(pageId);
      });
    });
  }

  function renderAll() {
    renderCustomers();
    renderCategoryFilter();
    renderSummary();
    renderEnabledPages();
    renderTemplates();
  }

  async function loadAll() {
    setStatus("Loading customers and template inventory...");

    const [customerResult, templateResult] = await Promise.all([
      callCoreAdminAction("list_customers"),
      callCoreAdminAction("list_templates")
    ]);

    customers = Array.isArray(customerResult.customers) ? customerResult.customers : [];
    templates = Array.isArray(templateResult.templates) ? templateResult.templates : [];

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;

    if (selectedCustomerId) {
      await loadCustomerPages();
    } else {
      customerPages = [];
    }

    renderAll();
    setStatus("Page Setup loaded.");
  }

  async function loadCustomerPages() {
    if (!selectedCustomerId) {
      customerPages = [];
      renderAll();
      return;
    }

    setStatus("Loading customer pages...");
    const result = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(result.customer_pages) ? result.customer_pages : [];
  }

  async function enableTemplate(templateId) {
    if (!selectedCustomerId) {
      setStatus("Select a customer first.");
      return;
    }

    const template = templates.find((item) => item.template_id === templateId);
    if (!template) return;

    if (!isActuallyUsable(template)) {
      const ok = window.confirm("This template is not fully built yet. Enable it for planning/testing anyway?");
      if (!ok) return;
    } else if (template.status === "draft") {
      const ok = window.confirm("This template is still an inventory draft. Enable it for this customer anyway?");
      if (!ok) return;
    }

    setStatus(`Enabling ${template.template_name || template.template_key}...`);

    await callCoreAdminAction("enable_customer_page", {
      customer_id: selectedCustomerId,
      template_id: templateId,
      nav_label: template.template_name || template.template_key,
      page_key: template.template_key,
      status: template.status === "active" ? "published" : "draft",
      show_in_nav: template.status === "active"
    });

    await loadCustomerPages();
    renderAll();
    setStatus("Customer page enabled.");
  }

  async function archiveCustomerPage(customerPageId) {
    setStatus("Archiving customer page...");
    await callCoreAdminAction("archive_customer_page", { customer_page_id: customerPageId });
    await loadCustomerPages();
    renderAll();
    setStatus("Customer page archived.");
  }

  async function recoverCustomerPage(customerPageId) {
    setStatus("Recovering customer page...");
    await callCoreAdminAction("recover_customer_page", { customer_page_id: customerPageId });
    await loadCustomerPages();
    renderAll();
    setStatus("Customer page recovered.");
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1320px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-layout{display:grid;grid-template-columns:360px minmax(0,1fr);gap:14px;align-items:start;}
        .se-sidebar{position:sticky;top:76px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:260px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px;}
        .se-stat{background:#fbfcfe;border:1px solid #d9e0ea;border-radius:12px;padding:12px;}
        .se-stat strong{display:block;font-size:16px;color:#172033;margin-bottom:4px;}
        .se-stat span{display:block;color:#5d6b82;font-size:12px;}
        .se-page-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #d9e0ea;border-radius:12px;padding:11px;margin-bottom:8px;background:#fbfcfe;}
        .se-meta,.se-key,.se-template-notes{font-size:12px;color:#5d6b82;line-height:1.35;margin-top:4px;}
        .se-filter-row{display:grid;grid-template-columns:170px 170px 170px minmax(0,1fr);gap:10px;margin-bottom:14px;}
        .se-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-template-card{border:1px solid #d9e0ea;border-radius:14px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px;}
        .se-template-card.is-enabled{border-color:#2f7d32;background:#fbfffb;}
        .se-template-card.is-draft{background:#fffdf7;}
        .se-template-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
        .se-template-head h3{margin:0;font-size:18px;line-height:1.2;}
        .se-template-card p{margin:0;color:#39465c;line-height:1.45;font-size:14px;}
        .se-chip-row{display:flex;flex-wrap:wrap;gap:6px;}
        .se-chip{display:inline-flex;border-radius:999px;background:#eef3f8;color:#26344d;padding:5px 8px;font-size:12px;font-weight:800;}
        .se-chip.warning{background:#fff0d9;color:#8a5200;}
        .se-pill{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900;}
        .se-pill.available,.se-active-pill{background:#edf7ed;color:#265c2b;}
        .se-pill.draft{background:#fff0d9;color:#8a5200;}
        .se-pill-stack{display:flex;flex-direction:column;gap:5px;align-items:flex-end;}
        .se-pill.build.planned{background:#f1f3f6;color:#4b5565;}
        .se-pill.build.prototype{background:#e9f1fb;color:#1f4f82;}
        .se-pill.build.implemented{background:#edf7ed;color:#265c2b;}
        .se-pill.build.production{background:#dff5e2;color:#16551d;}
        .se-pill.build.deprecated{background:#f7e8e8;color:#8a1f1f;}
        .se-active-pill{display:inline-flex;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;}
        .se-template-actions{margin-top:auto;display:flex;justify-content:flex-end;gap:8px;align-items:center;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        @media(max-width:1000px){.se-layout{grid-template-columns:1fr;}.se-sidebar{position:relative;top:auto;}.se-controls,.se-filter-row,.se-summary{grid-template-columns:1fr;}.se-template-grid{grid-template-columns:1fr;}}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Page Setup</h1>
          <p class="se-subtitle">Enable reusable SyncEtc templates for a customer. Registry status and build status are shown separately so unfinished modules are not mistaken for production-ready pages.</p>
          <div class="se-badge">ADMIN-PAGE-page-setup-current.js | ${escapeHtml(VERSION)}</div>
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

        <section class="se-layout">
          <aside class="se-sidebar">
            <section class="se-card">
              <h2 class="se-section-title">Customer</h2>
              <label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Enabled Pages</h2>
              <div id="se-enabled-pages"><div class="se-empty">No customer selected.</div></div>
            </section>

            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <h2 class="se-section-title" style="margin:0;">Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </aside>

          <section>
            <section id="se-summary" class="se-summary"></section>

            <section class="se-card">
              <h2 class="se-section-title">Template Inventory</h2>
              <div class="se-filter-row">
                <label class="se-field"><span class="se-label">Status</span><select id="se-status-filter" class="se-select">
                  <option value="usable">Available + inventory draft</option>
                  <option value="available">Available in registry</option>
                  <option value="draft">Draft/future only</option>
                  <option value="all">All statuses</option>
                </select></label>
                <label class="se-field"><span class="se-label">Category</span><select id="se-category-filter" class="se-select"><option value="all">All categories</option></select></label>
                <label class="se-field"><span class="se-label">Build</span><select id="se-build-filter" class="se-select">
                  <option value="all">All builds</option>
                  <option value="planned">Planned</option>
                  <option value="prototype">Prototype</option>
                  <option value="implemented">Implemented</option>
                  <option value="production">Production</option>
                  <option value="deprecated">Deprecated</option>
                </select></label>
                <label class="se-field"><span class="se-label">Search</span><input id="se-search-filter" class="se-input" type="search" placeholder="Search template, module, category, notes..."></label>
              </div>
              <div id="se-template-list" class="se-template-grid"><div class="se-empty">No templates loaded.</div></div>
            </section>
          </section>
        </section>
      </main>
    `;
  }

  function bindEvents() {
    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = getValue("se-email", "");
        const password = getValue("se-password", "");
        setStatus("Logging in...");
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadAll();
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
        templates = [];
        customerPages = [];
        selectedCustomerId = "";
        renderAll();
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try { await loadAll(); }
      catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        selectedCustomerId = event.target.value || "";
        await loadCustomerPages();
        renderAll();
        setStatus("Customer pages loaded.");
      } catch (error) {
        setStatus("Customer page load failed.");
        setOutput({ ok: false, event: "customer_page_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-status-filter")?.addEventListener("change", (event) => {
      filterStatus = event.target.value || "usable";
      renderTemplates();
    });

    document.getElementById("se-category-filter")?.addEventListener("change", (event) => {
      filterCategory = event.target.value || "all";
      renderTemplates();
    });

    document.getElementById("se-build-filter")?.addEventListener("change", (event) => {
      filterBuildStatus = event.target.value || "all";
      renderTemplates();
    });

    document.getElementById("se-search-filter")?.addEventListener("input", (event) => {
      filterSearch = event.target.value || "";
      renderTemplates();
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function boot() {
    renderShell();
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

// ADMIN-PAGE-page-setup-current.js END
