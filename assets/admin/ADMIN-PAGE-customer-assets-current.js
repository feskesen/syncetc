// ADMIN-PAGE-customer-assets-current.js
// Internal Version: 2026-06-04-003
// Purpose: Customer Assets / Logo Manager v3 with generated storage paths and archived asset restore.
// Manages customer logo assets by URL/storage path and links active logo to the customer active style profile.

(function () {
  "use strict";

  const VERSION = "2026-06-04-003";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-customer-assets-root";
  const STORAGE_BUCKET = "core-assets";
  const MAX_LOGO_BYTES = 4 * 1024 * 1024;

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let assets = [];
  let selectedCustomerId = "";
  let activeStyleProfile = null;
  let activeLogoAsset = null;

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

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
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

  function getAssetUrl(asset) {
    return asset?.url || (asset?.storage_path ? `${SUPABASE_URL}/storage/v1/object/public/core-assets/${asset.storage_path}` : "");
  }

  function renderActiveLogo() {
    const el = document.getElementById("se-active-logo");
    if (!el) return;

    const logoUrl = getAssetUrl(activeLogoAsset);

    if (!logoUrl) {
      el.innerHTML = `
        <div class="se-logo-placeholder">LOGO</div>
        <div>
          <strong>No active logo selected</strong>
          <p class="se-subtitle">Add a logo asset, then set it active for this customer.</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="se-logo-preview"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(activeLogoAsset?.alt_text || "Customer logo")}"></div>
      <div>
        <strong>${escapeHtml(activeLogoAsset?.alt_text || "Active logo")}</strong>
        <p class="se-subtitle">${escapeHtml(logoUrl)}</p>
      </div>
    `;
  }

  function renderAssetRow(asset, mode) {
    const url = getAssetUrl(asset);
    const isActive = activeStyleProfile?.logo_asset_id === asset.asset_id;
    const archived = mode === "archived";

    return `
      <div class="se-asset-row ${archived ? "is-archived" : ""}">
        <div class="se-asset-thumb">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || "Logo")}">` : "LOGO"}</div>
        <div class="se-asset-main">
          <strong>${escapeHtml(asset.alt_text || "Logo asset")}</strong>
          <div class="se-meta">${escapeHtml(asset.asset_type || "")} · ${escapeHtml(asset.status || "")}</div>
          <div class="se-url">${escapeHtml(url)}</div>
        </div>
        <div class="se-asset-actions">
          ${archived ? `<button class="se-button secondary se-restore-asset" data-asset-id="${escapeHtml(asset.asset_id)}" type="button">Restore</button>` : ""}
          ${!archived && isActive ? `<span class="se-active-pill">Active</span>` : ""}
          ${!archived && !isActive ? `<button class="se-button secondary se-set-logo" data-asset-id="${escapeHtml(asset.asset_id)}" type="button">Set active</button>` : ""}
          ${!archived ? `<button class="se-button danger se-archive-asset" data-asset-id="${escapeHtml(asset.asset_id)}" type="button">Archive</button>` : ""}
        </div>
      </div>
    `;
  }

  function bindAssetButtons(scope) {
    scope.querySelectorAll(".se-set-logo").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const assetId = button.getAttribute("data-asset-id");
          if (!assetId) return;
          await setActiveLogo(assetId);
        } catch (error) {
          setStatus("Set active logo failed.");
          setOutput({ ok: false, event: "set_logo_failed", message: error instanceof Error ? error.message : String(error) });
        }
      });
    });

    scope.querySelectorAll(".se-archive-asset").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const assetId = button.getAttribute("data-asset-id");
          if (!assetId) return;
          if (!window.confirm("Archive this logo asset?")) return;
          await archiveAsset(assetId);
        } catch (error) {
          setStatus("Archive asset failed.");
          setOutput({ ok: false, event: "archive_asset_failed", message: error instanceof Error ? error.message : String(error) });
        }
      });
    });

    scope.querySelectorAll(".se-restore-asset").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const assetId = button.getAttribute("data-asset-id");
          if (!assetId) return;
          await restoreAsset(assetId);
        } catch (error) {
          setStatus("Restore asset failed.");
          setOutput({ ok: false, event: "restore_asset_failed", message: error instanceof Error ? error.message : String(error) });
        }
      });
    });
  }

  function renderAssets() {
    const list = document.getElementById("se-assets-list");
    const archivedList = document.getElementById("se-archived-assets-list");
    if (!list || !archivedList) return;

    const activeAssets = assets.filter((asset) => asset.status !== "archived");
    const archivedAssets = assets.filter((asset) => asset.status === "archived");

    list.innerHTML = activeAssets.length
      ? activeAssets.map((asset) => renderAssetRow(asset, "active")).join("")
      : `<div class="se-empty">No active logo assets.</div>`;

    archivedList.innerHTML = archivedAssets.length
      ? archivedAssets.map((asset) => renderAssetRow(asset, "archived")).join("")
      : `<div class="se-empty">No archived logo assets.</div>`;

    bindAssetButtons(list);
    bindAssetButtons(archivedList);
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;

    renderCustomers();

    if (selectedCustomerId) await loadCustomerAssets();

    setStatus("Customers loaded.");
  }

  async function loadCustomerAssets() {
    if (!selectedCustomerId) return;

    setStatus("Loading customer assets...");

    const logoResult = await callCoreAdminAction("get_active_customer_logo", { customer_id: selectedCustomerId });
    activeStyleProfile = logoResult.style_profile || null;
    activeLogoAsset = logoResult.logo_asset || null;

    const assetsResult = await callCoreAdminAction("list_customer_assets", {
      customer_id: selectedCustomerId,
      asset_type: "logo"
    });
    assets = Array.isArray(assetsResult.assets) ? assetsResult.assets : [];

    renderActiveLogo();
    renderAssets();

    setStatus("Customer assets loaded.");
  }

  function sanitizeFileName(name) {
    return String(name || "logo")
      .trim()
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "logo";
  }

  function getSelectedCustomer() {
    return customers.find((customer) => customer.customer_id === selectedCustomerId) || null;
  }

  function getCustomerStorageKey() {
    const customer = getSelectedCustomer();
    return customer?.customer_key || selectedCustomerId || "customer";
  }

  function validateLogoFile(file) {
    if (!file) throw new Error("No file selected.");
    if (!String(file.type || "").startsWith("image/")) throw new Error("Logo upload must be an image file.");
    if (file.size > MAX_LOGO_BYTES) throw new Error("Logo file is too large. Use an image under 4 MB.");
  }

  async function uploadLogoFile(file) {
    if (!selectedCustomerId) {
      setStatus("Select a customer first.");
      return;
    }

    validateLogoFile(file);

    const customerKey = getCustomerStorageKey();
    const extension = String(file.name || "").includes(".") ? String(file.name).split(".").pop().toLowerCase() : "png";
    const cleanName = sanitizeFileName(file.name);
    const storagePath = `customers/${customerKey}/logos/${Date.now()}-${cleanName}.${extension}`;

    setStatus("Uploading logo to Supabase Storage...");

    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png"
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicData?.publicUrl || "";

    const result = await callCoreAdminAction("create_customer_asset", {
      customer_id: selectedCustomerId,
      asset_type: "logo",
      url: publicUrl,
      storage_path: storagePath,
      alt_text: getValue("se-alt-text", "").trim() || `${getSelectedCustomer()?.display_name || "Customer"} logo`,
      mime_type: file.type || "image",
      file_size_bytes: file.size
    });

    setValue("se-logo-url", "");
    setValue("se-storage-path", "");
    setValue("se-alt-text", "");

    await loadCustomerAssets();

    if (result.asset?.asset_id) {
      await setActiveLogo(result.asset.asset_id);
    }

    setStatus("Logo uploaded and set active.");
  }

  async function addLogoAsset() {
    if (!selectedCustomerId) {
      setStatus("Select a customer first.");
      return;
    }

    const url = getValue("se-logo-url", "").trim();
    const storagePath = getValue("se-storage-path", "").trim();
    const altText = getValue("se-alt-text", "").trim();

    if (!url && !storagePath) {
      setStatus("Enter a logo URL or Supabase Storage path.");
      return;
    }

    setStatus("Adding logo asset...");
    const result = await callCoreAdminAction("create_customer_asset", {
      customer_id: selectedCustomerId,
      asset_type: "logo",
      url,
      storage_path: storagePath,
      alt_text: altText || "Customer logo",
      mime_type: "image"
    });

    setValue("se-logo-url", "");
    setValue("se-storage-path", "");
    setValue("se-alt-text", "");

    await loadCustomerAssets();
    setStatus(`Logo asset added: ${result.asset?.asset_id || ""}`);
  }

  async function setActiveLogo(assetId) {
    if (!selectedCustomerId) return;

    setStatus("Setting active logo...");
    await callCoreAdminAction("set_active_logo_asset", {
      customer_id: selectedCustomerId,
      asset_id: assetId
    });

    await loadCustomerAssets();
    setStatus("Active logo updated.");
  }

  async function clearActiveLogo() {
    if (!selectedCustomerId) return;
    if (!window.confirm("Clear the active logo for this customer?")) return;

    setStatus("Clearing active logo...");
    await callCoreAdminAction("clear_active_logo_asset", {
      customer_id: selectedCustomerId
    });

    await loadCustomerAssets();
    setStatus("Active logo cleared.");
  }

  async function archiveAsset(assetId) {
    if (!selectedCustomerId) return;

    setStatus("Archiving logo asset...");
    await callCoreAdminAction("archive_customer_asset", {
      customer_id: selectedCustomerId,
      asset_id: assetId
    });

    await loadCustomerAssets();
    setStatus("Logo asset archived.");
  }

  async function restoreAsset(assetId) {
    if (!selectedCustomerId) return;

    setStatus("Restoring logo asset...");
    await callCoreAdminAction("restore_customer_asset", {
      customer_id: selectedCustomerId,
      asset_id: assetId
    });

    await loadCustomerAssets();
    setStatus("Logo asset restored. It was not automatically made active.");
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1180px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;word-break:break-word;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-grid{display:grid;grid-template-columns:360px minmax(0,1fr);gap:14px;align-items:start;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}
        .se-button.full{width:100%;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-dropzone{border:2px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:18px;text-align:center;cursor:pointer;margin-bottom:14px;transition:background .15s ease,border-color .15s ease;}.se-dropzone strong{display:block;color:#1f4f82;font-size:15px;margin-bottom:4px;}.se-dropzone span{display:block;color:#5d6b82;font-size:13px;line-height:1.35;}.se-dropzone.is-dragover{background:#e9f1fb;border-color:#1f4f82;}.se-drop-icon{width:42px;height:42px;border-radius:999px;background:#1f4f82;color:#fff;display:grid;place-items:center;margin:0 auto 10px auto;font-weight:900;}.se-active-logo{display:flex;align-items:center;gap:14px;border:1px solid #d9e0ea;border-radius:14px;padding:14px;background:#fbfcfe;margin-bottom:14px;}
        .se-logo-placeholder,.se-logo-preview{width:92px;height:72px;border-radius:12px;border:1px solid #c7d2e2;background:#eef3f8;color:#1f4f82;display:grid;place-items:center;font-weight:900;overflow:hidden;flex:0 0 auto;}
        .se-logo-preview img,.se-asset-thumb img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
        .se-asset-row.is-archived{opacity:.74;background:#f7f2f2;}.se-asset-row{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #d9e0ea;border-radius:14px;padding:12px;margin-bottom:10px;background:#fbfcfe;}
        .se-asset-thumb{width:76px;height:56px;border:1px solid #c7d2e2;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff;font-weight:900;color:#1f4f82;font-size:11px;}
        .se-meta{font-size:12px;color:#5d6b82;margin-top:4px;}
        .se-url{font-size:12px;color:#5d6b82;word-break:break-all;margin-top:4px;}
        .se-asset-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
        .se-active-pill{display:inline-flex;border-radius:999px;background:#edf7ed;color:#265c2b;font-size:12px;font-weight:900;padding:7px 10px;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        @media(max-width:900px){.se-grid{grid-template-columns:1fr;}.se-controls{grid-template-columns:1fr;}.se-asset-row{grid-template-columns:1fr;}.se-asset-actions{justify-content:flex-start;}}

        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-auth-gate{display:block;}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Customer Assets</h1>
          <p class="se-subtitle">Add customer logo assets and select the active logo used by renderer previews and future customer pages.</p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-customer-assets-current.js | ${escapeHtml(VERSION)}</div>
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

        <section class="se-grid" data-auth-required="true">
          <aside>
            <section class="se-card">
              <h2 class="se-section-title">Customer</h2>
              <label class="se-field"><span class="se-label">Customer</span><select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select></label>
              <button id="se-clear-logo" class="se-button secondary full" type="button">Clear active logo</button>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Add Logo Asset</h2>
              <div id="se-logo-dropzone" class="se-dropzone">
                <input id="se-logo-file" type="file" accept="image/*" hidden>
                <div class="se-drop-icon">⬆</div>
                <strong>Drag and drop a logo here</strong>
                <span>or click to choose an image. PNG, JPG, SVG, or WebP under 4 MB.</span>
              </div>
              <label class="se-field"><span class="se-label">Logo URL</span><input id="se-logo-url" class="se-input" type="url" placeholder="https://..."></label>
              <label class="se-field"><span class="se-label">Alt Text</span><input id="se-alt-text" class="se-input" type="text" placeholder="Customer logo"></label>
              <input id="se-storage-path" type="hidden" value="">
              <button id="se-add-logo" class="se-button full" type="button">Add logo asset</button>
              <p class="se-subtitle" style="margin-top:10px;">Drag/drop is preferred. Storage paths are generated automatically. Manual URL remains available for special cases.</p>
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
            <section class="se-card">
              <h2 class="se-section-title">Active Logo</h2>
              <div id="se-active-logo" class="se-active-logo"></div>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Logo Assets</h2>
              <div id="se-assets-list" class="se-empty">No assets loaded yet.</div>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Archived Logo Assets</h2>
              <p class="se-subtitle" style="margin-bottom:12px;">Restored assets return to the active list but are not automatically set as the active logo.</p>
              <div id="se-archived-assets-list" class="se-empty">No archived assets loaded yet.</div>
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
        assets = [];
        selectedCustomerId = "";
        activeStyleProfile = null;
        activeLogoAsset = null;
        renderCustomers();
        renderActiveLogo();
        renderAssets();
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
        await loadCustomerAssets();
      } catch (error) {
        setStatus("Customer assets load failed.");
        setOutput({ ok: false, event: "customer_assets_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    const dropzone = document.getElementById("se-logo-dropzone");
    const fileInput = document.getElementById("se-logo-file");

    dropzone?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", async () => {
      try {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        await uploadLogoFile(file);
        fileInput.value = "";
      } catch (error) {
        fileInput.value = "";
        setStatus("Logo upload failed.");
        setOutput({ ok: false, event: "logo_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    dropzone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });

    dropzone?.addEventListener("dragleave", () => {
      dropzone.classList.remove("is-dragover");
    });

    dropzone?.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");

      try {
        const file = event.dataTransfer?.files && event.dataTransfer.files[0];
        if (!file) return;
        await uploadLogoFile(file);
      } catch (error) {
        setStatus("Logo upload failed.");
        setOutput({ ok: false, event: "logo_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-add-logo")?.addEventListener("click", async () => {
      try { await addLogoAsset(); }
      catch (error) {
        setStatus("Add logo asset failed.");
        setOutput({ ok: false, event: "add_logo_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-clear-logo")?.addEventListener("click", async () => {
      try { await clearActiveLogo(); }
      catch (error) {
        setStatus("Clear active logo failed.");
        setOutput({ ok: false, event: "clear_logo_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function boot() {
    renderShell();
    setAuthGate(false);
    bindEvents();
    renderActiveLogo();

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

// ADMIN-PAGE-customer-assets-current.js END
