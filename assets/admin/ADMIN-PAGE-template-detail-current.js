// ADMIN-PAGE-template-detail-current.js
// Internal Version: 2026-06-03-001
// Purpose: Template Detail / Contract Viewer v1.
// Inspects generic SyncEtc template registry contracts without creating customer data.
// Uses existing core-admin-action backend action: list_templates.

(function () {
  "use strict";

  const VERSION = "2026-06-03-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-template-detail-root";

  let supabaseClient = null;
  let templates = [];
  let selectedTemplateKey = "";
  let filterCategory = "all";
  let filterBuildStatus = "all";
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

  function prettyJson(value) {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return String(value ?? "");
    }
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

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text || "");
      setStatus(`${label || "Text"} copied to clipboard.`);
    } catch {
      setStatus("Copy failed. Select the text manually.");
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
      await loadTemplates();
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

  function getTemplateCategory(template) {
    return template.module_category || template.template_category || "uncategorized";
  }

  function getBuildStatus(template) {
    return template.build_status || "planned";
  }

  function getRegistryStatusLabel(template) {
    if (template.status === "active") return "Available";
    if (template.status === "draft") return "Inventory draft";
    return template.status || "unknown";
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

  function getSelectedTemplate() {
    return templates.find((template) => template.template_key === selectedTemplateKey) || templates[0] || null;
  }

  function getFilteredTemplates() {
    const search = filterSearch.trim().toLowerCase();

    return templates.filter((template) => {
      if (filterCategory !== "all" && getTemplateCategory(template) !== filterCategory) return false;
      if (filterBuildStatus !== "all" && getBuildStatus(template) !== filterBuildStatus) return false;

      if (search) {
        const haystack = [
          template.template_key,
          template.template_name,
          template.description,
          template.notes,
          template.build_notes,
          template.module_key,
          template.module_category,
          template.complexity_level,
          template.access_default,
          template.renderer_key
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

  function renderFilters() {
    const categorySelect = document.getElementById("se-category-filter");
    if (categorySelect) {
      const categories = [...new Set(templates.map(getTemplateCategory).filter(Boolean))].sort();
      categorySelect.innerHTML = `<option value="all">All categories</option>` + categories.map((category) => `
        <option value="${escapeHtml(category)}" ${filterCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>
      `).join("");
    }

    const buildSelect = document.getElementById("se-build-filter");
    if (buildSelect) buildSelect.value = filterBuildStatus;

    const searchInput = document.getElementById("se-search-filter");
    if (searchInput) searchInput.value = filterSearch;
  }

  function renderTemplateList() {
    const list = document.getElementById("se-template-list");
    if (!list) return;

    const filtered = getFilteredTemplates();

    if (!filtered.length) {
      list.innerHTML = `<div class="se-empty">No templates match the current filters.</div>`;
      return;
    }

    if (!selectedTemplateKey || !filtered.some((template) => template.template_key === selectedTemplateKey)) {
      selectedTemplateKey = filtered[0].template_key;
    }

    list.innerHTML = filtered.map((template) => {
      const selected = template.template_key === selectedTemplateKey;
      return `
        <button class="se-template-button ${selected ? "selected" : ""}" data-template-key="${escapeHtml(template.template_key)}" type="button">
          <span>
            <strong>${escapeHtml(template.template_name || template.template_key)}</strong>
            <em>${escapeHtml(template.template_key || "")}</em>
          </span>
          <span class="se-mini-pills">
            <small>${escapeHtml(getTemplateCategory(template))}</small>
            <small class="build-${escapeHtml(getBuildStatus(template))}">${escapeHtml(getBuildStatusLabel(template))}</small>
          </span>
        </button>
      `;
    }).join("");

    list.querySelectorAll(".se-template-button").forEach((button) => {
      button.addEventListener("click", () => {
        selectedTemplateKey = button.getAttribute("data-template-key") || "";
        renderAll();
      });
    });
  }

  function renderContractSummary(template) {
    const data = template.data_contract_json || {};
    const admin = template.admin_contract_json || {};
    const render = template.render_contract_json || {};
    const imports = template.import_contract_json || {};
    const requiredTables = Array.isArray(data.required_tables) ? data.required_tables : [];
    const supportsDragDrop = imports.supports_drag_drop_assets === true;
    const supportsBulkImport = imports.supports_bulk_import === true;

    return `
      <section class="se-card">
        <div class="se-detail-head">
          <div>
            <h2>${escapeHtml(template.template_name || template.template_key)}</h2>
            <div class="se-key">${escapeHtml(template.template_key || "")}</div>
          </div>
          <div class="se-pill-stack">
            <span class="se-pill registry ${template.status === "draft" ? "draft" : "available"}">${escapeHtml(getRegistryStatusLabel(template))}</span>
            <span class="se-pill build ${escapeHtml(getBuildStatus(template))}">${escapeHtml(getBuildStatusLabel(template))}</span>
          </div>
        </div>

        <p class="se-description">${escapeHtml(template.description || "No description yet.")}</p>

        <div class="se-summary-grid">
          <div><strong>Module key</strong><span>${escapeHtml(template.module_key || "none")}</span></div>
          <div><strong>Category</strong><span>${escapeHtml(getTemplateCategory(template))}</span></div>
          <div><strong>Complexity</strong><span>${escapeHtml(template.complexity_level || "simple")}</span></div>
          <div><strong>Access default</strong><span>${escapeHtml(template.access_default || "public")}</span></div>
          <div><strong>Renderer key</strong><span>${escapeHtml(template.renderer_key || "")}</span></div>
          <div><strong>Requires data</strong><span>${template.requires_module_data ? "Yes" : "No"}</span></div>
          <div><strong>Admin page</strong><span>${escapeHtml(admin.primary_admin_page || "none")}</span></div>
          <div><strong>Renderer type</strong><span>${escapeHtml(render.renderer_type || "not specified")}</span></div>
          <div><strong>Drag/drop assets</strong><span>${supportsDragDrop ? "Yes" : "No"}</span></div>
          <div><strong>Bulk import</strong><span>${supportsBulkImport ? "Yes" : "No"}</span></div>
        </div>

        <div class="se-notes">
          <strong>Build notes</strong>
          <p>${escapeHtml(template.build_notes || "No build notes yet.")}</p>
          <strong>Planning notes</strong>
          <p>${escapeHtml(template.notes || "No planning notes yet.")}</p>
        </div>

        <div class="se-required-tables">
          <strong>Required / future tables</strong>
          ${requiredTables.length ? `<div class="se-chip-row">${requiredTables.map((table) => `<span class="se-chip">${escapeHtml(table)}</span>`).join("")}</div>` : `<p>No module tables required by current contract.</p>`}
        </div>
      </section>
    `;
  }

  function renderFeatureSchema(template) {
    const schema = template.feature_schema_json || {};
    const features = Array.isArray(schema.features) ? schema.features : [];

    return `
      <section class="se-card">
        <h2 class="se-section-title">Feature Schema</h2>
        ${features.length ? `
          <div class="se-feature-grid">
            ${features.map((feature) => `
              <div class="se-feature-card">
                <strong>${escapeHtml(feature.label || feature.key)}</strong>
                <code>${escapeHtml(feature.key || "")}</code>
                <span>Default: ${feature.default === true ? "on" : "off"}</span>
              </div>
            `).join("")}
          </div>
        ` : `<div class="se-empty">No feature schema defined.</div>`}
      </section>
    `;
  }

  function renderJsonPanel(title, id, value) {
    return `
      <section class="se-card se-json-card">
        <div class="se-json-head">
          <h2 class="se-section-title">${escapeHtml(title)}</h2>
          <button class="se-button secondary se-copy-json" data-json-id="${escapeHtml(id)}" type="button">Copy JSON</button>
        </div>
        <pre id="${escapeHtml(id)}" class="se-json">${escapeHtml(prettyJson(value))}</pre>
      </section>
    `;
  }

  function renderDetail() {
    const detail = document.getElementById("se-template-detail");
    if (!detail) return;

    const template = getSelectedTemplate();

    if (!template) {
      detail.innerHTML = `<div class="se-empty">No template selected.</div>`;
      return;
    }

    detail.innerHTML = `
      ${renderContractSummary(template)}
      ${renderFeatureSchema(template)}
      <div class="se-json-grid">
        ${renderJsonPanel("Editable Schema", "se-json-editable", template.editable_schema_json || {})}
        ${renderJsonPanel("Data Contract", "se-json-data", template.data_contract_json || {})}
        ${renderJsonPanel("Admin Contract", "se-json-admin", template.admin_contract_json || {})}
        ${renderJsonPanel("Render Contract", "se-json-render", template.render_contract_json || {})}
        ${renderJsonPanel("Import Contract", "se-json-import", template.import_contract_json || {})}
        ${renderJsonPanel("Feature Schema JSON", "se-json-feature", template.feature_schema_json || {})}
      </div>
    `;

    detail.querySelectorAll(".se-copy-json").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-json-id");
        const el = id ? document.getElementById(id) : null;
        await copyText(el ? el.textContent || "" : "", button.textContent || "JSON");
      });
    });
  }

  function renderAll() {
    renderFilters();
    renderTemplateList();
    renderDetail();
  }

  async function loadTemplates() {
    setStatus("Loading template contracts...");
    const result = await callCoreAdminAction("list_templates");
    templates = Array.isArray(result.templates) ? result.templates : [];

    if (!selectedTemplateKey && templates.length) {
      const home = templates.find((template) => template.template_key === "home");
      selectedTemplateKey = home?.template_key || templates[0].template_key;
    }

    renderAll();
    setStatus("Template contracts loaded.");
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1360px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-layout{display:grid;grid-template-columns:380px minmax(0,1fr);gap:14px;align-items:start;}
        .se-sidebar{position:sticky;top:76px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:100px;max-height:220px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
        .se-template-list{display:flex;flex-direction:column;gap:8px;max-height:640px;overflow:auto;padding-right:4px;}
        .se-template-button{width:100%;text-align:left;border:1px solid #d9e0ea;background:#fbfcfe;border-radius:12px;padding:11px;display:flex;justify-content:space-between;gap:10px;cursor:pointer;color:#172033;}
        .se-template-button.selected{border-color:#1f4f82;background:#e9f1fb;}
        .se-template-button strong{display:block;font-size:14px;margin-bottom:4px;}
        .se-template-button em{display:block;font-size:12px;color:#5d6b82;font-style:normal;}
        .se-mini-pills{display:flex;flex-direction:column;gap:4px;align-items:flex-end;}
        .se-mini-pills small{border-radius:999px;background:#eef3f8;color:#26344d;padding:4px 7px;font-size:11px;font-weight:800;white-space:nowrap;}
        .se-mini-pills small.build-planned{background:#f1f3f6;color:#4b5565;}
        .se-mini-pills small.build-prototype{background:#e9f1fb;color:#1f4f82;}
        .se-mini-pills small.build-implemented,.se-mini-pills small.build-production{background:#edf7ed;color:#265c2b;}
        .se-detail-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;}
        .se-detail-head h2{margin:0;font-size:26px;line-height:1.15;}
        .se-key{font-size:12px;color:#5d6b82;margin-top:5px;}
        .se-description{color:#39465c;line-height:1.45;margin:14px 0;}
        .se-pill-stack{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
        .se-pill{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900;white-space:nowrap;}
        .se-pill.available{background:#edf7ed;color:#265c2b;}
        .se-pill.draft{background:#fff0d9;color:#8a5200;}
        .se-pill.build.planned{background:#f1f3f6;color:#4b5565;}
        .se-pill.build.prototype{background:#e9f1fb;color:#1f4f82;}
        .se-pill.build.implemented{background:#edf7ed;color:#265c2b;}
        .se-pill.build.production{background:#dff5e2;color:#16551d;}
        .se-pill.build.deprecated{background:#f7e8e8;color:#8a1f1f;}
        .se-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:14px;}
        .se-summary-grid div{background:#fbfcfe;border:1px solid #d9e0ea;border-radius:12px;padding:10px;min-width:0;}
        .se-summary-grid strong{display:block;font-size:12px;color:#5d6b82;margin-bottom:5px;}
        .se-summary-grid span{display:block;font-size:13px;font-weight:800;color:#172033;word-break:break-word;}
        .se-notes{background:#fbfcfe;border:1px solid #d9e0ea;border-radius:12px;padding:12px;margin-top:14px;}
        .se-notes strong{display:block;margin-top:8px;}
        .se-notes strong:first-child{margin-top:0;}
        .se-notes p{margin:5px 0 0 0;color:#39465c;line-height:1.45;}
        .se-required-tables{margin-top:14px;}
        .se-required-tables p{margin:8px 0 0 0;color:#5d6b82;}
        .se-chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
        .se-chip{display:inline-flex;border-radius:999px;background:#eef3f8;color:#26344d;padding:5px 8px;font-size:12px;font-weight:800;}
        .se-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px;}
        .se-feature-card{border:1px solid #d9e0ea;border-radius:12px;background:#fbfcfe;padding:10px;}
        .se-feature-card strong{display:block;margin-bottom:5px;}
        .se-feature-card code{display:block;font-size:12px;color:#1f4f82;margin-bottom:5px;word-break:break-all;}
        .se-feature-card span{font-size:12px;color:#5d6b82;font-weight:800;}
        .se-json-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
        .se-json-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
        .se-json{background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;max-height:420px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;margin:0;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        @media(max-width:1000px){.se-layout{grid-template-columns:1fr;}.se-sidebar{position:relative;top:auto;}.se-controls,.se-summary-grid,.se-json-grid,.se-feature-grid{grid-template-columns:1fr;}}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Template Detail / Contract Viewer</h1>
          <p class="se-subtitle">Inspect the blueprint for each reusable SyncEtc template before building real module tables or importing customer data.</p>
          <div class="se-badge">ADMIN-PAGE-template-detail-current.js | ${escapeHtml(VERSION)}</div>
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
              <h2 class="se-section-title">Find Template</h2>
              <div class="se-filter-grid">
                <label class="se-field"><span class="se-label">Category</span><select id="se-category-filter" class="se-select"><option value="all">All categories</option></select></label>
                <label class="se-field"><span class="se-label">Build</span><select id="se-build-filter" class="se-select">
                  <option value="all">All builds</option>
                  <option value="planned">Planned</option>
                  <option value="prototype">Prototype</option>
                  <option value="implemented">Implemented</option>
                  <option value="production">Production</option>
                  <option value="deprecated">Deprecated</option>
                </select></label>
              </div>
              <label class="se-field"><span class="se-label">Search</span><input id="se-search-filter" class="se-input" type="search" placeholder="Search templates, modules, notes..."></label>
              <div id="se-template-list" class="se-template-list"><div class="se-empty">No templates loaded.</div></div>
            </section>

            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <h2 class="se-section-title">Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </aside>

          <section id="se-template-detail">
            <div class="se-empty">No template selected.</div>
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
        await loadTemplates();
      } catch (error) {
        setStatus("Login failed.");
        setOutput({ ok: false, event: "login_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        templates = [];
        selectedTemplateKey = "";
        renderAll();
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try { await loadTemplates(); }
      catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-category-filter")?.addEventListener("change", (event) => {
      filterCategory = event.target.value || "all";
      renderAll();
    });

    document.getElementById("se-build-filter")?.addEventListener("change", (event) => {
      filterBuildStatus = event.target.value || "all";
      renderAll();
    });

    document.getElementById("se-search-filter")?.addEventListener("input", (event) => {
      filterSearch = event.target.value || "";
      renderAll();
    });

    document.getElementById("se-copy-output")?.addEventListener("click", async () => {
      const el = document.getElementById("se-output");
      await copyText(el ? el.textContent || "" : "", "Backend result");
    });
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

// ADMIN-PAGE-template-detail-current.js END
