// ADMIN-PAGE-page-setup-current.js
// Internal Version: 2026-06-03-001
// Purpose: Page Setup v1. Select a customer and enable/archive/recover template-backed customer pages.

(function () {
  "use strict";

  const VERSION = "2026-06-03-001";
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
    try {
      await navigator.clipboard.writeText(el ? el.textContent || "" : "");
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
    try { result = await response.json(); }
    catch { result = { ok: false, error: "non_json_response", status: response.status, text: await response.text() }; }
    setOutput({ http_status: response.status, result });
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `HTTP ${response.status}`);
    return result;
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:28px 18px;box-sizing:border-box}#${ROOT_ID} *{box-sizing:border-box}.se-wrap{max-width:1180px;margin:0 auto}.se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:22px;margin-bottom:18px}.se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em}.se-subtitle{margin:0;color:#5d6b82;font-size:15px;line-height:1.45}.se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px}.se-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.se-label{font-size:13px;font-weight:700;color:#26344d}.se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033}.se-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}.se-button.secondary{background:#fff;color:#1f4f82}.se-button.warning{border-color:#8a5b16;background:#8a5b16}.se-button:disabled{opacity:.55;cursor:not-allowed}.se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap}.se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:100px;max-height:320px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45}.se-list{display:grid;gap:10px}.se-row{border:1px solid #d8e1ed;border-radius:12px;padding:12px;background:#fff}.se-row-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.se-name{font-size:16px;font-weight:800;margin:0 0 3px 0}.se-meta{color:#5d6b82;font-size:12px;line-height:1.4}.se-pill{display:inline-flex;align-items:center;border-radius:999px;background:#eef3f8;color:#26344d;font-size:11px;font-weight:800;padding:5px 8px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.se-pill.active{background:#e6f4ea;color:#17692e}.se-pill.archived{background:#f8e8e8;color:#8a2630}.se-empty{border:1px dashed #b8c6d8;border-radius:12px;padding:18px;color:#5d6b82;background:#fbfcfe}@media(max-width:880px){.se-grid{grid-template-columns:1fr}}
      </style>
      <main class="se-wrap">
        <section class="se-card"><h1 class="se-title">Page Setup</h1><p class="se-subtitle">Select a customer, then enable template-backed pages for that customer.</p><div class="se-badge">ADMIN-PAGE-page-setup-current.js | ${escapeHtml(VERSION)}</div></section>
        <section class="se-card"><h2 class="se-title" style="font-size:22px">Platform Admin Login</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px"><label class="se-field"><span class="se-label">Email</span><input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username"></label><label class="se-field"><span class="se-label">Password</span><input id="se-password" class="se-input" type="password" autocomplete="current-password"></label></div><div class="se-actions"><button id="se-login" class="se-button">Log in</button><button id="se-logout" class="se-button secondary">Log out</button><button id="se-refresh" class="se-button secondary">Refresh</button></div><div id="se-status" class="se-status">Loading Supabase client...</div></section>
        <section class="se-card"><label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label></section>
        <section class="se-grid"><div class="se-card"><h2 class="se-title" style="font-size:22px">Available Templates</h2><div id="se-template-list" class="se-list" style="margin-top:14px"><div class="se-empty">No templates loaded yet.</div></div></div><div><section class="se-card"><h2 class="se-title" style="font-size:22px">Enabled Customer Pages</h2><div id="se-page-list" class="se-list" style="margin-top:14px"><div class="se-empty">Select a customer.</div></div></section><section class="se-card"><div class="se-row-top"><h2 class="se-title" style="font-size:22px">Last Backend Result</h2><button id="se-copy-output" class="se-button secondary">Copy result</button></div><pre id="se-output" class="se-output">{}</pre></section></div></section>
      </main>`;
  }

  function pageForTemplate(templateId) { return customerPages.find((page) => page.template_id === templateId); }

  function renderCustomerSelect() {
    const select = document.getElementById("se-customer-select");
    if (!select) return;
    if (!customers.length) { select.innerHTML = `<option value="">No customers found</option>`; return; }
    select.innerHTML = `<option value="">Select customer...</option>` + customers.map((c) => `<option value="${escapeHtml(c.customer_id)}" ${c.customer_id === selectedCustomerId ? "selected" : ""}>${escapeHtml(c.display_name)} (${escapeHtml(c.customer_key)})</option>`).join("");
  }

  function renderTemplates() {
    const list = document.getElementById("se-template-list");
    if (!list) return;
    if (!templates.length) { list.innerHTML = `<div class="se-empty">No templates found.</div>`; return; }
    list.innerHTML = templates.map((t) => {
      const p = pageForTemplate(t.template_id);
      const enabled = p && p.status !== "archived";
      const archived = p && p.status === "archived";
      return `<div class="se-row"><div class="se-row-top"><div><p class="se-name">${escapeHtml(t.template_name)}</p><div class="se-meta">key: ${escapeHtml(t.template_key)}<br>renderer: ${escapeHtml(t.renderer_key)}</div></div>${enabled ? `<span class="se-pill active">enabled</span>` : archived ? `<span class="se-pill archived">archived</span>` : `<span class="se-pill">available</span>`}</div><div class="se-actions"><button class="se-button" data-enable-template-id="${escapeHtml(t.template_id)}" ${!selectedCustomerId || enabled ? "disabled" : ""}>${archived ? "Recover page" : "Enable page"}</button></div></div>`;
    }).join("");
    document.querySelectorAll("[data-enable-template-id]").forEach((button) => button.addEventListener("click", async () => enableTemplate(button.getAttribute("data-enable-template-id"))));
  }

  function renderPages() {
    const list = document.getElementById("se-page-list");
    if (!list) return;
    if (!selectedCustomerId) { list.innerHTML = `<div class="se-empty">Select a customer.</div>`; return; }
    if (!customerPages.length) { list.innerHTML = `<div class="se-empty">No pages have been enabled for this customer yet.</div>`; return; }
    list.innerHTML = customerPages.map((p) => {
      const t = p.core_template_registry || {};
      const statusClass = p.status === "active" ? "active" : p.status === "archived" ? "archived" : "";
      return `<div class="se-row"><div class="se-row-top"><div><p class="se-name">${escapeHtml(p.nav_label || t.template_name || p.page_key)}</p><div class="se-meta">slug: ${escapeHtml(p.page_slug)}<br>template: ${escapeHtml(t.template_name || p.template_id)}<br>page id: ${escapeHtml(p.customer_page_id)}</div></div><span class="se-pill ${statusClass}">${escapeHtml(p.status)}</span></div><div class="se-actions">${p.status === "archived" ? `<button class="se-button secondary" data-recover-page-id="${escapeHtml(p.customer_page_id)}">Recover</button>` : `<button class="se-button warning" data-archive-page-id="${escapeHtml(p.customer_page_id)}">Archive</button>`}</div></div>`;
    }).join("");
    document.querySelectorAll("[data-archive-page-id]").forEach((button) => button.addEventListener("click", async () => archivePage(button.getAttribute("data-archive-page-id"))));
    document.querySelectorAll("[data-recover-page-id]").forEach((button) => button.addEventListener("click", async () => recoverPage(button.getAttribute("data-recover-page-id"))));
  }

  function renderAll() { renderCustomerSelect(); renderTemplates(); renderPages(); }

  async function loadInitialData() {
    setStatus("Loading customers and templates...");
    const cr = await callCoreAdminAction("list_customers");
    customers = Array.isArray(cr.customers) ? cr.customers : [];
    const tr = await callCoreAdminAction("list_templates");
    templates = Array.isArray(tr.templates) ? tr.templates : [];
    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    if (selectedCustomerId) await loadCustomerPages(false);
    renderAll();
    setStatus("Loaded Page Setup data.");
  }

  async function loadCustomerPages(shouldRender = true) {
    if (!selectedCustomerId) { customerPages = []; if (shouldRender) renderAll(); return; }
    const result = await callCoreAdminAction("list_customer_pages", { customer_id: selectedCustomerId });
    customerPages = Array.isArray(result.customer_pages) ? result.customer_pages : [];
    if (shouldRender) renderAll();
  }

  async function enableTemplate(templateId) {
    if (!selectedCustomerId || !templateId) return;
    setStatus("Enabling customer page...");
    await callCoreAdminAction("enable_customer_page", { customer_id: selectedCustomerId, template_id: templateId });
    await loadCustomerPages();
    setStatus("Customer page enabled.");
  }

  async function archivePage(customerPageId) {
    if (!customerPageId) return;
    if (!window.confirm("Archive this customer page?")) return;
    setStatus("Archiving customer page...");
    await callCoreAdminAction("archive_customer_page", { customer_page_id: customerPageId });
    await loadCustomerPages();
    setStatus("Customer page archived.");
  }

  async function recoverPage(customerPageId) {
    if (!customerPageId) return;
    setStatus("Recovering customer page...");
    await callCoreAdminAction("recover_customer_page", { customer_page_id: customerPageId });
    await loadCustomerPages();
    setStatus("Customer page recovered.");
  }

  function bindEvents() {
    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("se-email")?.value || "";
        const password = document.getElementById("se-password")?.value || "";
        setStatus("Logging in...");
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadInitialData();
      } catch (error) { setStatus("Login failed."); setOutput({ ok: false, event: "login_failed", message: error instanceof Error ? error.message : String(error) }); }
    });
    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = []; templates = []; customerPages = []; selectedCustomerId = ""; renderAll(); setStatus("Logged out.");
      } catch (error) { setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) }); }
    });
    document.getElementById("se-refresh")?.addEventListener("click", async () => { try { await loadInitialData(); } catch (error) { setStatus("Refresh failed."); setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) }); } });
    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => { try { selectedCustomerId = event.target.value || ""; await loadCustomerPages(); } catch (error) { setStatus("Customer page load failed."); setOutput({ ok: false, event: "load_customer_pages_failed", message: error instanceof Error ? error.message : String(error) }); } });
    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function initSupabase() {
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase JS did not load correctly.");
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session?.user?.email) { setStatus(`Logged in as ${data.session.user.email}`); await loadInitialData(); }
    else setStatus("No active login session. Log in first.");
  }

  async function boot() {
    renderShell(); bindEvents(); renderAll();
    try { await initSupabase(); }
    catch (error) { setStatus("Failed to initialize Supabase client."); setOutput({ ok: false, event: "supabase_init_failed", message: error instanceof Error ? error.message : String(error) }); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

// ADMIN-PAGE-page-setup-current.js END
