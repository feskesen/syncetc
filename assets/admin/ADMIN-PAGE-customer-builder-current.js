// ADMIN-PAGE-customer-builder-current.js
// Internal Version: 2026-06-03-002
// Purpose: Customer Builder v1 for creating, listing, editing, archiving, and recovering core customer records.
// Change from 2026-06-03-001: Customer Key is no longer editable. Backend generates it and auto-suffixes duplicates.
// Live filename is stable. Track versions internally, in Git history, and in local saved copies.

(function () {
  "use strict";

  const VERSION = "2026-06-03-002";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-customer-builder-root";

  let supabaseClient = null;
  let customers = [];
  let selectedCustomerId = null;

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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

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

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase JS did not load correctly.");
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;

    const { data } = await supabaseClient.auth.getSession();

    if (data?.session?.user?.email) {
      setStatus(`Logged in as ${data.session.user.email}`);
      await refreshCustomers();
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
      result = {
        ok: false,
        error: "non_json_response",
        status: response.status,
        text: await response.text()
      };
    }

    if (!response.ok || result.ok === false) {
      const message = result.message || result.error || `HTTP ${response.status}`;
      throw new Error(message);
    }

    setOutput({
      http_status: response.status,
      result
    });

    return result;
  }

  function renderShell() {
    const root = ensureRoot();

    root.innerHTML = `
      <style>
        #${ROOT_ID} {
          font-family: Arial, Helvetica, sans-serif;
          color: #172033;
          background: #f5f7fb;
          min-height: 100vh;
          padding: 28px 18px;
          box-sizing: border-box;
        }

        #${ROOT_ID} * {
          box-sizing: border-box;
        }

        .se-wrap {
          max-width: 1180px;
          margin: 0 auto;
        }

        .se-card {
          background: #ffffff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23, 32, 51, 0.08);
          padding: 22px;
          margin-bottom: 18px;
        }

        .se-title {
          margin: 0 0 6px 0;
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: -0.02em;
        }

        .se-subtitle {
          margin: 0;
          color: #5d6b82;
          font-size: 15px;
          line-height: 1.45;
        }

        .se-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #e9f1fb;
          color: #1f4f82;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 10px;
          margin-top: 10px;
        }

        .se-grid-two {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 18px;
          align-items: start;
        }

        .se-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }

        .se-label {
          font-size: 13px;
          font-weight: 700;
          color: #26344d;
        }

        .se-input,
        .se-select,
        .se-textarea {
          width: 100%;
          border: 1px solid #c7d2e2;
          border-radius: 10px;
          padding: 10px 11px;
          font-size: 14px;
          background: #ffffff;
          color: #172033;
        }

        .se-readonly-preview {
          border: 1px dashed #b8c6d8;
          background: #fbfcfe;
          color: #5d6b82;
          border-radius: 10px;
          padding: 10px 11px;
          font-size: 14px;
        }

        .se-help {
          color: #5d6b82;
          font-size: 12px;
          line-height: 1.4;
          margin-top: -4px;
          margin-bottom: 12px;
        }

        .se-textarea {
          min-height: 78px;
          resize: vertical;
        }

        .se-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }

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

        .se-button.secondary {
          background: #ffffff;
          color: #1f4f82;
        }

        .se-button.warning {
          border-color: #8a5b16;
          background: #8a5b16;
        }

        .se-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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
          min-height: 100px;
          max-height: 300px;
          font-family: Consolas, Monaco, monospace;
          font-size: 12px;
          line-height: 1.45;
        }

        .se-list {
          display: grid;
          gap: 10px;
        }

        .se-customer-row {
          border: 1px solid #d8e1ed;
          border-radius: 12px;
          padding: 12px;
          background: #ffffff;
          cursor: pointer;
        }

        .se-customer-row:hover,
        .se-customer-row.active {
          border-color: #1f4f82;
          background: #f4f8fd;
        }

        .se-customer-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .se-customer-name {
          font-size: 16px;
          font-weight: 800;
          margin: 0 0 3px 0;
        }

        .se-customer-meta {
          color: #5d6b82;
          font-size: 12px;
          line-height: 1.4;
        }

        .se-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #eef3f8;
          color: #26344d;
          font-size: 11px;
          font-weight: 800;
          padding: 5px 8px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        .se-pill.active {
          background: #e6f4ea;
          color: #17692e;
        }

        .se-pill.archived {
          background: #f8e8e8;
          color: #8a2630;
        }

        .se-empty {
          border: 1px dashed #b8c6d8;
          border-radius: 12px;
          padding: 18px;
          color: #5d6b82;
          background: #fbfcfe;
        }

        @media (max-width: 880px) {
          .se-grid-two {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Customer Builder</h1>
          <p class="se-subtitle">Create and manage customer records. Customer keys are generated by the backend and cannot be manually edited.</p>
          <div class="se-badge">ADMIN-PAGE-customer-builder-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <h2 class="se-title" style="font-size:22px;">Platform Admin Login</h2>
          <p class="se-subtitle">Use the Supabase Auth user that matches an active platform_admin row.</p>

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
            <button id="se-refresh" class="se-button secondary">Refresh customers</button>
          </div>

          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>

        <section class="se-grid-two">
          <div class="se-card">
            <h2 class="se-title" style="font-size:22px;">Create Customer</h2>

            <label class="se-field">
              <span class="se-label">Display Name</span>
              <input id="se-create-display-name" class="se-input" type="text" placeholder="Example Flying Club">
            </label>

            <div class="se-field">
              <span class="se-label">Generated Customer Key</span>
              <div id="se-generated-key-preview" class="se-readonly-preview">Generated automatically after Display Name is entered.</div>
            </div>
            <div class="se-help">The backend creates the final key and adds -1, -2, etc. if needed.</div>

            <label class="se-field">
              <span class="se-label">Legal Name</span>
              <input id="se-create-legal-name" class="se-input" type="text" placeholder="Example Flying Club, Inc.">
            </label>

            <label class="se-field">
              <span class="se-label">Customer Type</span>
              <select id="se-create-customer-type" class="se-select">
                <option value="generic">generic</option>
                <option value="flying_club">flying_club</option>
                <option value="fbo">fbo</option>
                <option value="flight_school">flight_school</option>
                <option value="service_company">service_company</option>
              </select>
            </label>

            <label class="se-field">
              <span class="se-label">Vertical</span>
              <select id="se-create-vertical" class="se-select">
                <option value="generic">generic</option>
                <option value="aviation">aviation</option>
                <option value="membership">membership</option>
                <option value="operations">operations</option>
              </select>
            </label>

            <label class="se-field">
              <span class="se-label">Status</span>
              <select id="se-create-status" class="se-select">
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </label>

            <label class="se-field">
              <span class="se-label">Notes</span>
              <textarea id="se-create-notes" class="se-textarea" placeholder="Internal notes only."></textarea>
            </label>

            <div class="se-actions">
              <button id="se-create-customer" class="se-button">Create customer</button>
              <button id="se-clear-create" class="se-button secondary">Clear</button>
            </div>
          </div>

          <div>
            <section class="se-card">
              <h2 class="se-title" style="font-size:22px;">Customers</h2>
              <p class="se-subtitle">No public fallback customer is used. Empty means no customer has been created.</p>
              <div id="se-customer-list" class="se-list" style="margin-top:14px;">
                <div class="se-empty">No customers loaded yet.</div>
              </div>
            </section>

            <section class="se-card">
              <h2 class="se-title" style="font-size:22px;">Selected Customer</h2>
              <div id="se-selected-customer">
                <div class="se-empty">Select a customer to edit it.</div>
              </div>
            </section>

            <section class="se-card">
              <h2 class="se-title" style="font-size:22px;">Last Backend Result</h2>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </div>
        </section>
      </main>
    `;
  }

  function updateGeneratedKeyPreview() {
    const preview = document.getElementById("se-generated-key-preview");
    const displayName = document.getElementById("se-create-display-name")?.value || "";
    const generated = normalizeKey(displayName);

    if (!preview) return;

    preview.textContent = generated
      ? `${generated} (final key confirmed by backend)`
      : "Generated automatically after Display Name is entered.";
  }

  function renderCustomerList() {
    const list = document.getElementById("se-customer-list");
    if (!list) return;

    if (!customers.length) {
      list.innerHTML = `<div class="se-empty">No customers exist yet.</div>`;
      renderSelectedCustomer();
      return;
    }

    list.innerHTML = customers.map((customer) => {
      const status = String(customer.status || "draft");
      const statusClass = status === "active" ? "active" : status === "archived" ? "archived" : "";
      const activeClass = customer.customer_id === selectedCustomerId ? "active" : "";

      return `
        <div class="se-customer-row ${activeClass}" data-customer-id="${escapeHtml(customer.customer_id)}">
          <div class="se-customer-top">
            <div>
              <p class="se-customer-name">${escapeHtml(customer.display_name)}</p>
              <div class="se-customer-meta">
                key: ${escapeHtml(customer.customer_key)}<br>
                type: ${escapeHtml(customer.customer_type)} | vertical: ${escapeHtml(customer.vertical)}
              </div>
            </div>
            <span class="se-pill ${statusClass}">${escapeHtml(status)}</span>
          </div>
        </div>
      `;
    }).join("");

    document.querySelectorAll(".se-customer-row").forEach((row) => {
      row.addEventListener("click", () => {
        selectedCustomerId = row.getAttribute("data-customer-id");
        renderCustomerList();
        renderSelectedCustomer();
      });
    });

    renderSelectedCustomer();
  }

  function renderSelectedCustomer() {
    const wrap = document.getElementById("se-selected-customer");
    if (!wrap) return;

    const customer = customers.find((item) => item.customer_id === selectedCustomerId);

    if (!customer) {
      wrap.innerHTML = `<div class="se-empty">Select a customer to edit it.</div>`;
      return;
    }

    wrap.innerHTML = `
      <label class="se-field">
        <span class="se-label">Display Name</span>
        <input id="se-edit-display-name" class="se-input" type="text" value="${escapeHtml(customer.display_name)}">
      </label>

      <label class="se-field">
        <span class="se-label">Legal Name</span>
        <input id="se-edit-legal-name" class="se-input" type="text" value="${escapeHtml(customer.legal_name || "")}">
      </label>

      <label class="se-field">
        <span class="se-label">Customer Type</span>
        <select id="se-edit-customer-type" class="se-select">
          ${["generic", "flying_club", "fbo", "flight_school", "service_company"].map((value) => `
            <option value="${value}" ${customer.customer_type === value ? "selected" : ""}>${value}</option>
          `).join("")}
        </select>
      </label>

      <label class="se-field">
        <span class="se-label">Vertical</span>
        <select id="se-edit-vertical" class="se-select">
          ${["generic", "aviation", "membership", "operations"].map((value) => `
            <option value="${value}" ${customer.vertical === value ? "selected" : ""}>${value}</option>
          `).join("")}
        </select>
      </label>

      <label class="se-field">
        <span class="se-label">Status</span>
        <select id="se-edit-status" class="se-select">
          ${["draft", "active", "paused", "archived"].map((value) => `
            <option value="${value}" ${customer.status === value ? "selected" : ""}>${value}</option>
          `).join("")}
        </select>
      </label>

      <label class="se-field">
        <span class="se-label">Notes</span>
        <textarea id="se-edit-notes" class="se-textarea">${escapeHtml(customer.notes || "")}</textarea>
      </label>

      <div class="se-customer-meta">
        Customer ID: ${escapeHtml(customer.customer_id)}<br>
        Stable customer key: ${escapeHtml(customer.customer_key)}
      </div>

      <div class="se-actions">
        <button id="se-save-customer" class="se-button">Save changes</button>
        ${customer.status === "archived"
          ? `<button id="se-recover-customer" class="se-button secondary">Recover</button>`
          : `<button id="se-archive-customer" class="se-button warning">Archive</button>`
        }
      </div>
    `;

    document.getElementById("se-save-customer")?.addEventListener("click", saveSelectedCustomer);
    document.getElementById("se-archive-customer")?.addEventListener("click", archiveSelectedCustomer);
    document.getElementById("se-recover-customer")?.addEventListener("click", recoverSelectedCustomer);
  }

  function clearCreateForm() {
    ["se-create-display-name", "se-create-legal-name", "se-create-notes"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const type = document.getElementById("se-create-customer-type");
    const vertical = document.getElementById("se-create-vertical");
    const status = document.getElementById("se-create-status");

    if (type) type.value = "generic";
    if (vertical) vertical.value = "generic";
    if (status) status.value = "draft";

    updateGeneratedKeyPreview();
  }

  async function refreshCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (selectedCustomerId && !customers.some((customer) => customer.customer_id === selectedCustomerId)) {
      selectedCustomerId = null;
    }

    renderCustomerList();
    setStatus(`Loaded ${customers.length} customer record${customers.length === 1 ? "" : "s"}.`);
  }

  async function createCustomer() {
    const displayName = document.getElementById("se-create-display-name")?.value || "";

    if (!displayName.trim()) {
      setStatus("Display Name is required.");
      return;
    }

    setStatus("Creating customer...");

    const result = await callCoreAdminAction("create_customer", {
      display_name: displayName.trim(),
      legal_name: document.getElementById("se-create-legal-name")?.value || "",
      customer_type: document.getElementById("se-create-customer-type")?.value || "generic",
      vertical: document.getElementById("se-create-vertical")?.value || "generic",
      status: document.getElementById("se-create-status")?.value || "draft",
      notes: document.getElementById("se-create-notes")?.value || ""
    });

    selectedCustomerId = result.customer?.customer_id || null;
    clearCreateForm();
    await refreshCustomers();
    setStatus(`Customer created. Key: ${result.customer?.customer_key || "(not returned)"}`);
  }

  async function saveSelectedCustomer() {
    if (!selectedCustomerId) return;

    setStatus("Saving customer...");

    await callCoreAdminAction("update_customer", {
      customer_id: selectedCustomerId,
      display_name: document.getElementById("se-edit-display-name")?.value || "",
      legal_name: document.getElementById("se-edit-legal-name")?.value || "",
      customer_type: document.getElementById("se-edit-customer-type")?.value || "generic",
      vertical: document.getElementById("se-edit-vertical")?.value || "generic",
      status: document.getElementById("se-edit-status")?.value || "draft",
      notes: document.getElementById("se-edit-notes")?.value || ""
    });

    await refreshCustomers();
    setStatus("Customer saved.");
  }

  async function archiveSelectedCustomer() {
    if (!selectedCustomerId) return;
    const customer = customers.find((item) => item.customer_id === selectedCustomerId);
    const confirmed = window.confirm(`Archive customer "${customer?.display_name || selectedCustomerId}"?`);
    if (!confirmed) return;

    setStatus("Archiving customer...");
    await callCoreAdminAction("archive_customer", { customer_id: selectedCustomerId });
    await refreshCustomers();
    setStatus("Customer archived.");
  }

  async function recoverSelectedCustomer() {
    if (!selectedCustomerId) return;

    setStatus("Recovering customer...");
    await callCoreAdminAction("recover_customer", { customer_id: selectedCustomerId });
    await refreshCustomers();
    setStatus("Customer recovered to draft status.");
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
        await refreshCustomers();
      } catch (error) {
        setStatus("Login failed.");
        setOutput({
          ok: false,
          event: "login_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        selectedCustomerId = null;
        renderCustomerList();
        setStatus("Logged out.");
      } catch (error) {
        setOutput({
          ok: false,
          event: "logout_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try {
        await refreshCustomers();
      } catch (error) {
        setStatus("Refresh failed.");
        setOutput({
          ok: false,
          event: "refresh_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-create-display-name")?.addEventListener("input", updateGeneratedKeyPreview);

    document.getElementById("se-create-customer")?.addEventListener("click", async () => {
      try {
        await createCustomer();
      } catch (error) {
        setStatus("Create customer failed.");
        setOutput({
          ok: false,
          event: "create_customer_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-clear-create")?.addEventListener("click", clearCreateForm);
  }

  async function boot() {
    renderShell();
    bindEvents();
    renderCustomerList();
    updateGeneratedKeyPreview();

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.");
      setOutput({
        ok: false,
        event: "supabase_init_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

// ADMIN-PAGE-customer-builder-current.js END
