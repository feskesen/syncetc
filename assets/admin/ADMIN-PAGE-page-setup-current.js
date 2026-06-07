// ADMIN-PAGE-page-setup-current.js
// Internal Version: 2026-06-07-014-A
// Purpose: Page Setup v4. Customer page activation, publish/draft, show/hide nav, and clearer build/customer-page status.
// Uses core-admin-action backend actions.
// Actions used: list_customers, list_templates, list_customer_pages, enable_customer_page, update_customer_page, archive_customer_page, recover_customer_page.

(function () {
  "use strict";

  const VERSION = "2026-06-07-014-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-page-setup-root";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let templates = [];
  let customerPages = [];
  let selectedCustomerId = "";
  let filterTemplateStatus = "usable";
  let filterBuildStatus = "all";
  let filterPageState = "all";
  let filterCategory = "all";
  let filterSearch = "";
  let sortMode = "recommended";

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

  function setStatus(message, type = "info") {
    const el = document.getElementById("se-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
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

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function nowMessagePrefix() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function copyOutput() {
    const el = document.getElementById("se-output");
    const text = el ? el.textContent || "" : "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Backend result copied to clipboard.", "success");
    } catch {
      setStatus("Copy failed. Select the backend result manually.", "warn");
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
      await loadAll();
    } else {
      setAuthGate(false);
      setStatus("No active login session. Log in first.", "warn");
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

  function getSelectedCustomer() {
    return customers.find((customer) => customer.customer_id === selectedCustomerId) || null;
  }

  function getPageForTemplate(template) {
    return customerPages.find((page) => page.template_id === template.template_id || page.template_key === template.template_key || page.page_key === template.template_key) || null;
  }

  function isEnabledPage(page) {
    return Boolean(page && page.status !== "archived");
  }

  function isShownPublished(page) {
    return Boolean(page && page.status === "published" && page.show_in_nav !== false && !page.archived_at);
  }

  function getPageState(page) {
    if (!page) return "not_enabled";
    if (page.status === "archived" || page.archived_at) return "archived";
    if (page.status === "published" && page.show_in_nav !== false) return "published_shown";
    if (page.status === "published") return "published_hidden";
    return "draft_hidden";
  }

  function getPageStateLabel(page) {
    const state = getPageState(page);
    if (state === "not_enabled") return "Not enabled";
    if (state === "archived") return "Archived";
    if (state === "published_shown") return "Published · shown in nav";
    if (state === "published_hidden") return "Published · hidden from nav";
    return "Draft · hidden from nav";
  }

  function getPageStateShort(page) {
    const state = getPageState(page);
    if (state === "not_enabled") return "Not enabled";
    if (state === "archived") return "Archived";
    if (state === "published_shown") return "Live in nav";
    if (state === "published_hidden") return "Live · hidden";
    return "Draft";
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

  function getBuildRank(template) {
    const status = getBuildStatus(template);
    if (status === "production") return 0;
    if (status === "implemented") return 1;
    if (status === "prototype") return 2;
    if (status === "planned") return 3;
    if (status === "deprecated") return 9;
    return 5;
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

  function getPageRank(page) {
    const state = getPageState(page);
    if (state === "published_shown") return 0;
    if (state === "published_hidden") return 1;
    if (state === "draft_hidden") return 2;
    if (state === "not_enabled") return 3;
    if (state === "archived") return 9;
    return 5;
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

  function templatePassesPageState(template) {
    if (filterPageState === "all") return true;
    const page = getPageForTemplate(template);
    const state = getPageState(page);
    if (filterPageState === "enabled") return Boolean(page && page.status !== "archived");
    return state === filterPageState;
  }

  function getFilteredTemplates() {
    const search = filterSearch.trim().toLowerCase();

    const filtered = templates.filter((template) => {
      const status = template.status || "draft";
      const category = getTemplateCategory(template);
      const page = getPageForTemplate(template);

      if (filterTemplateStatus === "available" && status !== "active") return false;
      if (filterTemplateStatus === "draft" && status !== "draft") return false;
      if (filterTemplateStatus === "usable" && !["active", "draft"].includes(status)) return false;
      if (filterBuildStatus !== "all" && getBuildStatus(template) !== filterBuildStatus) return false;
      if (filterCategory !== "all" && category !== filterCategory) return false;
      if (!templatePassesPageState(template)) return false;

      if (search) {
        const haystack = [
          template.template_key,
          template.template_name,
          template.description,
          template.module_key,
          template.module_category,
          template.complexity_level,
          template.access_default,
          template.notes,
          template.build_notes,
          getBuildStatus(template),
          getPageStateLabel(page),
          page?.nav_label,
          page?.page_slug,
          page?.status
        ].join(" ").toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const pageA = getPageForTemplate(a);
      const pageB = getPageForTemplate(b);

      if (sortMode === "page_state") {
        const pageRankA = getPageRank(pageA);
        const pageRankB = getPageRank(pageB);
        if (pageRankA !== pageRankB) return pageRankA - pageRankB;
      }

      if (sortMode === "build") {
        const buildRankA = getBuildRank(a);
        const buildRankB = getBuildRank(b);
        if (buildRankA !== buildRankB) return buildRankA - buildRankB;
      }

      if (sortMode === "name") {
        return String(a.template_name || a.template_key || "").localeCompare(String(b.template_name || b.template_key || ""));
      }

      if (sortMode === "recommended") {
        const pageRankA = getPageRank(pageA);
        const pageRankB = getPageRank(pageB);
        if (pageRankA !== pageRankB) return pageRankA - pageRankB;
        const buildRankA = getBuildRank(a);
        const buildRankB = getBuildRank(b);
        if (buildRankA !== buildRankB) return buildRankA - buildRankB;
      }

      const orderA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 9999;
      const orderB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.template_key || "").localeCompare(String(b.template_key || ""));
    });
  }

  function renderSummary() {
    const el = document.getElementById("se-summary");
    if (!el) return;

    const selectedCustomer = getSelectedCustomer();
    const publishedShown = customerPages.filter(isShownPublished).length;
    const publishedHidden = customerPages.filter((page) => getPageState(page) === "published_hidden").length;
    const drafts = customerPages.filter((page) => getPageState(page) === "draft_hidden").length;
    const archived = customerPages.filter((page) => getPageState(page) === "archived").length;
    const implemented = templates.filter((template) => ["implemented", "production"].includes(getBuildStatus(template))).length;
    const planned = templates.filter((template) => getBuildStatus(template) === "planned").length;

    el.innerHTML = `
      <div class="se-stat"><strong>${escapeHtml(selectedCustomer?.display_name || "No customer")}</strong><span>Selected customer</span></div>
      <div class="se-stat live"><strong>${publishedShown}</strong><span>Live in navigation</span></div>
      <div class="se-stat"><strong>${publishedHidden}</strong><span>Live but hidden</span></div>
      <div class="se-stat warn"><strong>${drafts}</strong><span>Draft customer pages</span></div>
      <div class="se-stat"><strong>${implemented}</strong><span>Implemented templates</span></div>
      <div class="se-stat"><strong>${planned}</strong><span>Planned templates</span></div>
      ${archived ? `<div class="se-stat danger"><strong>${archived}</strong><span>Archived customer pages</span></div>` : ""}
    `;
  }

  function getSortedCustomerPages(includeArchived = true) {
    return customerPages
      .filter((page) => includeArchived || getPageState(page) !== "archived")
      .sort((a, b) => {
        const rankA = getPageRank(a);
        const rankB = getPageRank(b);
        if (rankA !== rankB) return rankA - rankB;
        const orderA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 9999;
        const orderB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.nav_label || a.page_key || "").localeCompare(String(b.nav_label || b.page_key || ""));
      });
  }

  function renderCustomerPages() {
    const el = document.getElementById("se-enabled-pages");
    if (!el) return;

    const pages = getSortedCustomerPages(true);

    if (!pages.length) {
      el.innerHTML = `<div class="se-empty">No customer pages for this customer yet.</div>`;
      return;
    }

    el.innerHTML = pages.map((page) => renderCustomerPageRow(page, "sidebar")).join("");
    bindPageActionButtons(el);
  }

  function renderCustomerPageRow(page, variant = "sidebar") {
    const state = getPageState(page);
    const isArchived = state === "archived";
    const isPublished = page.status === "published" && !isArchived;
    const showInNav = page.show_in_nav !== false;
    const navSlug = page.page_slug || page.page_key || "";
    const label = page.nav_label || page.page_key || "Page";
    const templateName = page.template_name || page.template_key || "Template";
    const stateClass = state.replaceAll("_", "-");

    return `
      <div class="se-page-row ${escapeHtml(stateClass)} ${variant === "full" ? "full" : ""}">
        <div class="se-page-main">
          <strong>${escapeHtml(label)}</strong>
          <div class="se-meta">
            ${escapeHtml(page.page_key || "")} · /${escapeHtml(navSlug)} · ${escapeHtml(templateName)}
          </div>
          <div class="se-small-pills">
            <span class="se-pill state ${escapeHtml(stateClass)}">${escapeHtml(getPageStateLabel(page))}</span>
            <span class="se-pill build ${escapeHtml(page.build_status || "planned")}">${escapeHtml(getBuildStatusLabel(page))}</span>
          </div>
        </div>
        <div class="se-page-actions">
          ${isArchived ? `
            <button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="restore-draft" type="button">Restore as draft</button>
          ` : `
            ${!isPublished || !showInNav ? `<button class="se-button se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="publish-show" type="button">Publish + show</button>` : ""}
            ${isPublished && showInNav ? `<button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="hide-nav" type="button">Hide from nav</button>` : ""}
            ${isPublished && !showInNav ? `<button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="show-nav" type="button">Show in nav</button>` : ""}
            ${isPublished ? `<button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="draft-hide" type="button">Set draft</button>` : ""}
            <button class="se-button danger se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="archive" type="button">Archive</button>
          `}
        </div>
      </div>
    `;
  }

  function getBuildStatusLabelFromValue(status) {
    if (status === "planned") return "Planned";
    if (status === "prototype") return "Prototype";
    if (status === "implemented") return "Implemented";
    if (status === "production") return "Production";
    if (status === "deprecated") return "Deprecated";
    return status || "Planned";
  }

  function getBuildStatusLabel(pageOrTemplate) {
    const status = pageOrTemplate?.build_status || "planned";
    return getBuildStatusLabelFromValue(status);
  }

  function renderTemplateCard(template) {
    const page = getPageForTemplate(template);
    const enabled = isEnabledPage(page);
    const archived = page && getPageState(page) === "archived";
    const category = getTemplateCategory(template);
    const complexity = getTemplateComplexity(template);
    const statusLabel = getTemplateStatusLabel(template);
    const buildStatus = getBuildStatus(template);
    const buildStatusLabel = getBuildStatusLabelFromValue(buildStatus);
    const requiresData = template.requires_module_data === true;
    const isDraft = template.status === "draft";
    const actuallyUsable = isActuallyUsable(template);
    const state = getPageState(page);
    const stateClass = state.replaceAll("_", "-");

    return `
      <article class="se-template-card ${enabled ? "is-enabled" : ""} ${isDraft ? "is-draft" : ""} build-${escapeHtml(buildStatus)} page-${escapeHtml(stateClass)}">
        <div class="se-template-head">
          <div>
            <h3>${escapeHtml(template.template_name || template.template_key)}</h3>
            <div class="se-key">${escapeHtml(template.template_key || "")}</div>
          </div>
          <div class="se-pill-stack">
            <span class="se-pill registry ${isDraft ? "draft" : "available"}">${escapeHtml(statusLabel)}</span>
            <span class="se-pill build ${escapeHtml(buildStatus)}">${escapeHtml(buildStatusLabel)}</span>
            <span class="se-pill state ${escapeHtml(stateClass)}">${escapeHtml(getPageStateShort(page))}</span>
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
          ${!page ? `<button class="se-button ${actuallyUsable ? "" : "secondary"} se-enable-template" data-template-id="${escapeHtml(template.template_id)}" type="button">Enable as draft</button>` : ""}
          ${page ? `<span class="se-active-pill ${escapeHtml(stateClass)}">${escapeHtml(getPageStateLabel(page))}</span>` : ""}
          ${page ? renderSmallPageActions(page) : ""}
        </div>
      </article>
    `;
  }

  function renderSmallPageActions(page) {
    const state = getPageState(page);
    const isArchived = state === "archived";
    const isPublished = page.status === "published" && !isArchived;
    const showInNav = page.show_in_nav !== false;

    if (isArchived) {
      return `<button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="restore-draft" type="button">Restore draft</button>`;
    }

    return `
      ${!isPublished || !showInNav ? `<button class="se-button se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="publish-show" type="button">Publish + show</button>` : ""}
      ${isPublished && showInNav ? `<button class="se-button secondary se-page-action" data-page-id="${escapeHtml(page.customer_page_id)}" data-action-kind="hide-nav" type="button">Hide nav</button>` : ""}
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
    bindTemplateButtons(el);
    bindPageActionButtons(el);
  }

  function bindTemplateButtons(scope) {
    scope.querySelectorAll(".se-enable-template").forEach((button) => {
      button.addEventListener("click", async () => {
        const templateId = button.getAttribute("data-template-id");
        if (!templateId) return;
        await enableTemplate(templateId);
      });
    });
  }

  function bindPageActionButtons(scope) {
    scope.querySelectorAll(".se-page-action").forEach((button) => {
      button.addEventListener("click", async () => {
        const pageId = button.getAttribute("data-page-id");
        const actionKind = button.getAttribute("data-action-kind");
        if (!pageId || !actionKind) return;
        await handlePageAction(pageId, actionKind);
      });
    });
  }

  function renderAll() {
    renderCustomers();
    renderCategoryFilter();
    renderSummary();
    renderCustomerPages();
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
    setStatus("Page Setup loaded.", "success");
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
      setStatus("Select a customer first.", "warn");
      return;
    }

    const template = templates.find((item) => item.template_id === templateId);
    if (!template) return;

    if (!isActuallyUsable(template)) {
      const ok = window.confirm("This template is not fully built yet. Enable it as a draft for planning/testing?");
      if (!ok) return;
    } else if (template.status === "draft") {
      const ok = window.confirm("This template is still an inventory draft. Enable it as a customer draft anyway?");
      if (!ok) return;
    }

    setStatus(`Enabling ${template.template_name || template.template_key} as draft / hidden from nav...`);

    await callCoreAdminAction("enable_customer_page", {
      customer_id: selectedCustomerId,
      template_id: templateId,
      nav_label: template.template_name || template.template_key,
      page_key: template.template_key,
      status: "draft",
      show_in_nav: false
    });

    await loadCustomerPages();
    renderAll();
    setStatus(`${template.template_name || template.template_key} enabled as draft. Use “Publish + show” when ready.`, "success");
  }

  async function updateCustomerPage(customerPageId, payload, successMessage) {
    setStatus("Saving page setup change...");
    await callCoreAdminAction("update_customer_page", { customer_page_id: customerPageId, ...payload });
    await loadCustomerPages();
    renderAll();
    setStatus(`${nowMessagePrefix()} · ${successMessage}`, "success");
  }

  async function archiveCustomerPage(customerPageId) {
    setStatus("Archiving customer page...");
    await callCoreAdminAction("archive_customer_page", { customer_page_id: customerPageId });
    await loadCustomerPages();
    renderAll();
    setStatus("Customer page archived.", "success");
  }

  async function recoverCustomerPage(customerPageId) {
    setStatus("Restoring customer page as draft...");
    await callCoreAdminAction("recover_customer_page", { customer_page_id: customerPageId });
    await updateCustomerPage(customerPageId, { status: "draft", show_in_nav: false }, "Customer page restored as draft / hidden from nav.");
  }

  async function handlePageAction(customerPageId, actionKind) {
    const page = customerPages.find((item) => item.customer_page_id === customerPageId);
    const label = page?.nav_label || page?.page_key || "this page";

    try {
      if (actionKind === "publish-show") {
        await updateCustomerPage(customerPageId, { status: "published", show_in_nav: true }, `${label} is published and shown in navigation.`);
        return;
      }
      if (actionKind === "show-nav") {
        await updateCustomerPage(customerPageId, { show_in_nav: true }, `${label} is shown in navigation.`);
        return;
      }
      if (actionKind === "hide-nav") {
        await updateCustomerPage(customerPageId, { show_in_nav: false }, `${label} is hidden from navigation.`);
        return;
      }
      if (actionKind === "draft-hide") {
        const ok = window.confirm(`Set ${label} back to draft and hide it from navigation?`);
        if (!ok) return;
        await updateCustomerPage(customerPageId, { status: "draft", show_in_nav: false }, `${label} is draft / hidden from nav.`);
        return;
      }
      if (actionKind === "archive") {
        const ok = window.confirm(`Archive ${label}? It will not appear in navigation and direct page access should be blocked.`);
        if (!ok) return;
        await archiveCustomerPage(customerPageId);
        return;
      }
      if (actionKind === "restore-draft") {
        await recoverCustomerPage(customerPageId);
      }
    } catch (error) {
      setStatus(`Page setup change failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      setOutput({ ok: false, event: "page_action_failed", actionKind, message: error instanceof Error ? error.message : String(error) });
    }
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1380px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-hero{background:linear-gradient(135deg,#fff 0%,#f6f9ff 100%);border-top:5px solid #1f4f82;}
        .se-title{margin:0 0 6px 0;font-size:30px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;}
        .se-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px;}
        .se-guide-item{background:#fbfcfe;border:1px solid #d9e0ea;border-radius:12px;padding:12px;}
        .se-guide-item strong{display:block;margin-bottom:5px;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:800;padding:6px 10px;margin-top:10px;}
        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-layout{display:grid;grid-template-columns:390px minmax(0,1fr);gap:14px;align-items:start;}
        .se-sidebar{position:sticky;top:76px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-status[data-type='success']{background:#edf7ed;border-color:#c8e7c8;color:#265c2b;}
        .se-status[data-type='warn']{background:#fff8e8;border-color:#f2d49b;color:#8a5200;}
        .se-status[data-type='error']{background:#fff1f1;border-color:#efc7c7;color:#8a1f1f;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:260px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px;}
        .se-stat{background:#fbfcfe;border:1px solid #d9e0ea;border-radius:12px;padding:12px;}
        .se-stat.live{border-color:#2f7d32;background:#fbfffb;}
        .se-stat.warn{border-color:#f2d49b;background:#fffdf7;}
        .se-stat.danger{border-color:#efc7c7;background:#fffafa;}
        .se-stat strong{display:block;font-size:16px;color:#172033;margin-bottom:4px;}
        .se-stat span{display:block;color:#5d6b82;font-size:12px;}
        .se-page-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border:1px solid #d9e0ea;border-radius:12px;padding:12px;margin-bottom:9px;background:#fbfcfe;}
        .se-page-row.published-shown{border-color:#2f7d32;background:#fbfffb;}
        .se-page-row.published-hidden{border-color:#9bbce5;background:#f8fbff;}
        .se-page-row.draft-hidden{border-color:#f2d49b;background:#fffdf7;}
        .se-page-row.archived{border-color:#efc7c7;background:#fffafa;opacity:.86;}
        .se-page-main{min-width:0;}
        .se-page-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px;max-width:240px;}
        .se-page-actions .se-button{padding:8px 10px;font-size:12px;}
        .se-meta,.se-key,.se-template-notes{font-size:12px;color:#5d6b82;line-height:1.35;margin-top:4px;}
        .se-small-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;}
        .se-filter-row{display:grid;grid-template-columns:150px 150px 160px 160px 150px minmax(0,1fr);gap:10px;margin-bottom:14px;}
        .se-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-template-card{border:1px solid #d9e0ea;border-radius:14px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px;}
        .se-template-card.is-enabled{border-color:#2f7d32;background:#fbfffb;}
        .se-template-card.page-draft-hidden{border-color:#f2d49b;background:#fffdf7;}
        .se-template-card.page-archived{opacity:.84;}
        .se-template-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
        .se-template-head h3{margin:0;font-size:18px;line-height:1.2;}
        .se-template-card p{margin:0;color:#39465c;line-height:1.45;font-size:14px;}
        .se-chip-row{display:flex;flex-wrap:wrap;gap:6px;}
        .se-chip{display:inline-flex;border-radius:999px;background:#eef3f8;color:#26344d;padding:5px 8px;font-size:12px;font-weight:800;}
        .se-chip.warning{background:#fff0d9;color:#8a5200;}
        .se-pill{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900;}
        .se-pill.available,.se-active-pill.published-shown,.se-pill.state.published-shown{background:#edf7ed;color:#265c2b;}
        .se-pill.draft,.se-active-pill.draft-hidden,.se-pill.state.draft-hidden{background:#fff0d9;color:#8a5200;}
        .se-active-pill.published-hidden,.se-pill.state.published-hidden{background:#e9f1fb;color:#1f4f82;}
        .se-active-pill.archived,.se-pill.state.archived{background:#f7e8e8;color:#8a1f1f;}
        .se-pill-stack{display:flex;flex-direction:column;gap:5px;align-items:flex-end;}
        .se-pill.build.planned{background:#f1f3f6;color:#4b5565;}
        .se-pill.build.prototype{background:#e9f1fb;color:#1f4f82;}
        .se-pill.build.implemented{background:#edf7ed;color:#265c2b;}
        .se-pill.build.production{background:#dff5e2;color:#16551d;}
        .se-pill.build.deprecated{background:#f7e8e8;color:#8a1f1f;}
        .se-active-pill{display:inline-flex;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;}
        .se-template-actions{margin-top:auto;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;align-items:center;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        .se-auth-gate{display:block;}
        @media(max-width:1180px){.se-layout{grid-template-columns:1fr;}.se-sidebar{position:relative;top:auto;}.se-controls,.se-filter-row,.se-summary,.se-guide{grid-template-columns:1fr;}.se-template-grid{grid-template-columns:1fr;}.se-page-row{flex-direction:column;}.se-page-actions{max-width:none;justify-content:flex-start;}}
      </style>

      <main class="se-wrap">
        <section class="se-card se-hero">
          <h1 class="se-title">Page Setup</h1>
          <p class="se-subtitle">Register customer pages, control draft/published state, and decide which pages appear in customer navigation. Page Setup is the source of truth for enabled pages.</p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-page-setup-current.js | ${escapeHtml(VERSION)}</div>
          <div class="se-guide">
            <div class="se-guide-item"><strong>Enable</strong><span class="se-subtitle">Creates a customer page as draft and hidden from nav.</span></div>
            <div class="se-guide-item"><strong>Publish + show</strong><span class="se-subtitle">Makes the page reachable and visible in portal/public navigation.</span></div>
            <div class="se-guide-item"><strong>Draft / hidden</strong><span class="se-subtitle">Keeps the page configured but blocks normal customer access.</span></div>
          </div>
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
          <p class="se-subtitle">This platform-admin page is hidden until a valid platform-admin session is active.</p>
        </section>

        <section class="se-layout" data-auth-required="true">
          <aside class="se-sidebar">
            <section class="se-card">
              <h2 class="se-section-title">Customer</h2>
              <label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Customer Page Status</h2>
              <p class="se-subtitle" style="margin-bottom:12px;">These are the pages already attached to this customer. Publish/show controls decide whether users can reach them.</p>
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
                <label class="se-field"><span class="se-label">Registry</span><select id="se-status-filter" class="se-select">
                  <option value="usable">Available + inventory draft</option>
                  <option value="available">Available only</option>
                  <option value="draft">Inventory draft only</option>
                  <option value="all">All registry statuses</option>
                </select></label>
                <label class="se-field"><span class="se-label">Build</span><select id="se-build-filter" class="se-select">
                  <option value="all">All builds</option>
                  <option value="production">Production</option>
                  <option value="implemented">Implemented</option>
                  <option value="prototype">Prototype</option>
                  <option value="planned">Planned</option>
                  <option value="deprecated">Deprecated</option>
                </select></label>
                <label class="se-field"><span class="se-label">Customer page</span><select id="se-page-state-filter" class="se-select">
                  <option value="all">All page states</option>
                  <option value="published_shown">Published + shown</option>
                  <option value="published_hidden">Published + hidden</option>
                  <option value="draft_hidden">Draft</option>
                  <option value="enabled">Any enabled</option>
                  <option value="not_enabled">Not enabled</option>
                  <option value="archived">Archived</option>
                </select></label>
                <label class="se-field"><span class="se-label">Category</span><select id="se-category-filter" class="se-select"><option value="all">All categories</option></select></label>
                <label class="se-field"><span class="se-label">Sort</span><select id="se-sort-filter" class="se-select">
                  <option value="recommended">Recommended</option>
                  <option value="page_state">Page state</option>
                  <option value="build">Build status</option>
                  <option value="name">Name</option>
                  <option value="sort_order">System order</option>
                </select></label>
                <label class="se-field"><span class="se-label">Search</span><input id="se-search-filter" class="se-input" type="search" placeholder="Search template, module, status, notes..."></label>
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
        setAuthGate(true, data?.user?.email || email);
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadAll();
      } catch (error) {
        setStatus("Login failed.", "error");
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
        setAuthGate(false);
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try { await loadAll(); }
      catch (error) {
        setStatus("Refresh failed.", "error");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        selectedCustomerId = event.target.value || "";
        await loadCustomerPages();
        renderAll();
        setStatus("Customer pages loaded.", "success");
      } catch (error) {
        setStatus("Customer page load failed.", "error");
        setOutput({ ok: false, event: "customer_page_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-status-filter")?.addEventListener("change", (event) => {
      filterTemplateStatus = event.target.value || "usable";
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

    document.getElementById("se-page-state-filter")?.addEventListener("change", (event) => {
      filterPageState = event.target.value || "all";
      renderTemplates();
    });

    document.getElementById("se-sort-filter")?.addEventListener("change", (event) => {
      sortMode = event.target.value || "recommended";
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
    setAuthGate(false);
    bindEvents();

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.", "error");
      setOutput({ ok: false, event: "supabase_init_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

// ADMIN-PAGE-page-setup-current.js END
