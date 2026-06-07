// ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-04-002
// Purpose: Aviation-facing Aircraft Admin page backed by generic operational assets.

(function () {
  "use strict";

  const VERSION = "2026-06-04-003";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const STORAGE_BUCKET = "core-assets";
  const ROOT_ID = "syncetc-aircraft-admin-root";
  const DIRTY_MESSAGE = "You have unsaved aircraft changes. Leave anyway?";

  let supabaseClient = null;
  let customers = [];
  let aircraft = [];
  let selectedCustomerId = "";
  let selectedAircraftId = "";
  let pendingImportRows = [];
  let isDirty = false;
  let debugVisible = localStorage.getItem("syncetc-aircraft-admin-debug") !== "hidden";
  let isAuthenticated = false;
  let authenticatedEmail = "";

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

  function sanitizeFileName(name) {
    const raw = String(name || "upload").split(/[\\/]/).pop() || "upload";
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "upload";
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

  function requireAuth() {
    if (isAuthenticated) return true;
    setStatus("Log in before using Aircraft Admin.");
    return false;
  }

  function getValue(id, fallback = "") {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function getChecked(id, fallback = false) {
    const el = document.getElementById(id);
    return el ? !!el.checked : fallback;
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function setDirty(value) {
    isDirty = !!value;
    const badge = document.getElementById("se-dirty-badge");
    if (badge) {
      badge.textContent = isDirty ? "Unsaved changes" : "Saved";
      badge.className = `se-badge ${isDirty ? "warn" : "ok"}`;
    }
    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setDirty === "function") {
      window.SyncEtcAdminShell.setDirty(isDirty, DIRTY_MESSAGE);
    }
  }

  function markDirty() {
    setDirty(true);
  }

  function confirmDiscard(message = DIRTY_MESSAGE) {
    if (!isDirty) return true;
    return window.confirm(message);
  }

  function currentYearMax() {
    return new Date().getFullYear() + 1;
  }

  function normalizeModelYear(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (!/^\d{4}$/.test(raw)) return raw;
    const year = Number(raw);
    if (year < 1900 || year > currentYearMax()) return raw;
    return String(year);
  }

  function generatedKeyLabel() {
    const selected = getSelectedAircraft();
    if (selected?.asset_key) return selected.asset_key;
    const tail = getValue("se-tail-number").trim();
    const type = getValue("se-aircraft-type").trim();
    const proposed = normalizeKey(tail || type || "");
    return proposed ? `${proposed} (generated on save)` : "Generated on save";
  }

  function refreshGeneratedKeyLabel() {
    const el = document.getElementById("se-generated-key");
    if (el) el.textContent = generatedKeyLabel();
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
    if (!isAuthenticated) setAuthGate(true, data.session?.user?.email || "");
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

  function renderCustomers() {
    const select = document.getElementById("se-customer-select");
    if (!select) return;

    if (!customers.length) {
      select.innerHTML = `<option value="">No organizations found</option>`;
      return;
    }

    select.innerHTML = `<option value="">Select organization...</option>` + customers.map((customer) => `
      <option value="${escapeHtml(customer.customer_id)}" ${customer.customer_id === selectedCustomerId ? "selected" : ""}>
        ${escapeHtml(customer.display_name)} (${escapeHtml(customer.customer_key)})
      </option>
    `).join("");
  }

  function renderAircraftList() {
    const list = document.getElementById("se-aircraft-list");
    if (!list) return;

    if (!aircraft.length) {
      list.innerHTML = `<div class="se-empty">No aircraft found for this organization.</div>`;
      return;
    }

    list.innerHTML = aircraft.map((item) => {
      const archived = !!item.archived_at || item.asset_record_status === "archived";
      const selected = item.operational_asset_id === selectedAircraftId;
      const photo = item.primary_photo_url || "";
      return `
        <div class="se-aircraft-row ${archived ? "is-archived" : ""} ${selected ? "is-selected" : ""}">
          <div class="se-aircraft-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(item.tail_number || "Aircraft")}">` : "✈"}</div>
          <div class="se-aircraft-main">
            <strong>${escapeHtml(item.tail_number || item.display_name || "Aircraft")}</strong>
            ${archived ? `<span class="se-mini-badge danger">Archived</span>` : ""}
            <div class="se-meta">${escapeHtml(item.aircraft_type || "")}${item.model_year ? ` · ${escapeHtml(item.model_year)}` : ""} · ${escapeHtml(item.home_base || "No base")} · ${escapeHtml(item.status_label || item.status_key || "")}</div>
            <div class="se-meta">key: ${escapeHtml(item.asset_key || "")}</div>
            ${item.do_not_dispatch ? `<div class="se-warning">Do Not Dispatch</div>` : ""}
          </div>
          <div class="se-row-actions">
            <button class="se-button secondary se-edit-aircraft" data-aircraft-id="${escapeHtml(item.operational_asset_id)}" type="button">Edit</button>
            ${archived
              ? `<button class="se-button secondary se-restore-aircraft" data-aircraft-id="${escapeHtml(item.operational_asset_id)}" type="button">Restore</button>`
              : `<button class="se-button danger se-archive-aircraft" data-aircraft-id="${escapeHtml(item.operational_asset_id)}" type="button">Archive</button>`}
          </div>
        </div>
      `;
    }).join("");
  }

  function getSelectedAircraft() {
    return aircraft.find((item) => item.operational_asset_id === selectedAircraftId) || null;
  }

  function updatePhotoPreview(role, url) {
    const preview = document.getElementById(`se-${role}-photo-preview`);
    const label = document.getElementById(`se-${role}-photo-url-label`);
    if (preview) {
      preview.innerHTML = url
        ? `<img src="${escapeHtml(url)}" alt="${role === "primary" ? "Primary aircraft" : "Panel"} photo">`
        : `<span>${role === "primary" ? "Drop primary aircraft photo" : "Drop panel photo"}</span>`;
    }
    if (label) label.textContent = url || "No image uploaded yet.";
  }

  function resetFormFields() {
    selectedAircraftId = "";
    [
      "se-tail-number", "se-aircraft-type", "se-model-year", "se-sort-order", "se-home-base",
      "se-hourly-rate", "se-annual-due", "se-primary-photo-url", "se-panel-photo-url", "se-summary", "se-description",
      "se-engine-notes", "se-current-tach", "se-tach-date", "se-current-hobbs", "se-hobbs-date",
      "se-hobbs-moh", "se-maintenance-notes", "se-oil-change-due-tach"
    ].forEach((id) => setValue(id, ""));
    setValue("se-status-key", "available");
    setValue("se-visibility", "public");
    setChecked("se-do-not-dispatch", false);
    updatePhotoPreview("primary", "");
    updatePhotoPreview("panel", "");
    refreshGeneratedKeyLabel();
    renderAircraftList();
  }

  function clearForm() {
    resetFormFields();
    setDirty(false);
    setStatus("Aircraft form cleared.");
  }

  function fillForm(item) {
    selectedAircraftId = item.operational_asset_id || "";
    setValue("se-tail-number", item.tail_number || item.identifier || "");
    setValue("se-aircraft-type", item.aircraft_type || item.aircraft_model || "");
    setValue("se-model-year", item.model_year || item.aircraft_year || "");
    setValue("se-status-key", item.status_key === "archived" ? "inactive" : (item.status_key || "available"));
    setValue("se-visibility", ["public", "members", "admins"].includes(item.visibility) ? item.visibility : "admins");
    setChecked("se-do-not-dispatch", !!item.do_not_dispatch || item.status_key === "do-not-dispatch");
    setValue("se-sort-order", item.sort_order || "");
    setValue("se-home-base", item.home_base || "");
    setValue("se-hourly-rate", item.hourly_rate ?? "");
    setValue("se-annual-due", item.annual_due ?? "");
    setValue("se-primary-photo-url", item.primary_photo_url || "");
    setValue("se-panel-photo-url", item.panel_photo_url || "");
    setValue("se-summary", item.summary || item.aircraft_description_plain || "");
    setValue("se-description", item.description || "");
    setValue("se-engine-notes", item.engine_notes || "");
    setValue("se-current-tach", item.current_tach ?? "");
    setValue("se-tach-date", item.tach_date || "");
    setValue("se-current-hobbs", item.current_hobbs ?? "");
    setValue("se-hobbs-date", item.hobbs_date || "");
    setValue("se-hobbs-moh", item.hobbs_at_last_major_overhaul ?? "");
    setValue("se-maintenance-notes", item.maintenance_notes_general || "");
    setValue("se-oil-change-due-tach", item.oil_change_due_tach ?? "");
    updatePhotoPreview("primary", item.primary_photo_url || "");
    updatePhotoPreview("panel", item.panel_photo_url || "");
    refreshGeneratedKeyLabel();
    renderAircraftList();
    setDirty(false);
    setStatus(`Editing ${item.tail_number || item.display_name || "aircraft"}.`);
  }

  function collectAircraftPayload() {
    return {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      operational_asset_id: selectedAircraftId || undefined,
      tail_number: getValue("se-tail-number").trim(),
      aircraft_type: getValue("se-aircraft-type").trim(),
      model_year: normalizeModelYear(getValue("se-model-year").trim()),
      status_key: getValue("se-status-key", "available"),
      visibility: getValue("se-visibility", "public"),
      do_not_dispatch: getChecked("se-do-not-dispatch", false),
      sort_order: getValue("se-sort-order", "100").trim() || "100",
      home_base: getValue("se-home-base").trim(),
      hourly_rate: getValue("se-hourly-rate").trim(),
      annual_due: getValue("se-annual-due").trim(),
      primary_photo_url: getValue("se-primary-photo-url").trim(),
      panel_photo_url: getValue("se-panel-photo-url").trim(),
      summary: getValue("se-summary").trim(),
      description: getValue("se-description").trim(),
      engine_notes: getValue("se-engine-notes").trim(),
      current_tach: getValue("se-current-tach").trim(),
      tach_date: getValue("se-tach-date").trim(),
      current_hobbs: getValue("se-current-hobbs").trim(),
      hobbs_date: getValue("se-hobbs-date").trim(),
      hobbs_at_last_major_overhaul: getValue("se-hobbs-moh").trim(),
      maintenance_notes_general: getValue("se-maintenance-notes").trim(),
      oil_change_due_tach: getValue("se-oil-change-due-tach").trim()
    };
  }

  async function loadCustomers() {
    if (!requireAuth()) return;
    if (!confirmDiscard()) return;
    setStatus("Loading organizations...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];
    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    renderCustomers();
    if (selectedCustomerId) await loadAircraft();
    setDirty(false);
    setStatus("Organizations loaded.");
  }

  async function loadAircraft() {
    if (!selectedCustomerId) {
      aircraft = [];
      renderAircraftList();
      return;
    }
    setStatus("Loading aircraft...");
    const result = await callCoreAdminAction("list_aircraft", {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      include_archived: getChecked("se-include-archived", false)
    });
    aircraft = Array.isArray(result.aircraft) ? result.aircraft : [];
    if (selectedAircraftId && !aircraft.some((item) => item.operational_asset_id === selectedAircraftId)) selectedAircraftId = "";
    renderAircraftList();
    refreshGeneratedKeyLabel();
    setStatus(`Loaded ${aircraft.length} aircraft.`);
  }

  async function saveAircraft() {
    if (!selectedCustomerId) {
      setStatus("Select an organization first.");
      return null;
    }
    const payload = collectAircraftPayload();
    if (!payload.tail_number && !payload.aircraft_type) {
      setStatus("Enter at least a tail number or aircraft type.");
      return null;
    }
    setStatus("Saving aircraft...");
    const result = await callCoreAdminAction("upsert_aircraft", payload);
    selectedAircraftId = result.aircraft?.operational_asset_id || selectedAircraftId;
    await loadAircraft();
    const saved = aircraft.find((item) => item.operational_asset_id === selectedAircraftId) || result.aircraft;
    if (saved) fillForm(saved);
    setDirty(false);
    setStatus("Aircraft saved.");
    return saved || null;
  }

  async function ensureSavedAircraftForUpload() {
    if (selectedAircraftId && !isDirty) return getSelectedAircraft();
    const ok = selectedAircraftId
      ? window.confirm("Save current aircraft changes before uploading this image?")
      : window.confirm("Save this aircraft first so the image has a permanent storage folder?");
    if (!ok) return null;
    return await saveAircraft();
  }

  async function uploadAircraftImage(role, file) {
    if (!file) return;
    if (!selectedCustomerId) {
      setStatus("Select an organization first.");
      return;
    }
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("Choose an image file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus("Image is too large. Maximum is 12 MB.");
      return;
    }

    const saved = await ensureSavedAircraftForUpload();
    if (!saved || !selectedAircraftId) return;

    const safeFile = sanitizeFileName(file.name);
    const storagePath = [
      "organizations",
      selectedCustomerId,
      "operational-assets",
      "aircraft",
      selectedAircraftId,
      "images",
      role,
      `${Date.now()}-${safeFile}`
    ].join("/");

    setStatus(`Uploading ${role} image...`);
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

    const result = await callCoreAdminAction("attach_aircraft_image_asset", {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      aircraft_id: selectedAircraftId,
      image_role: role,
      storage_path: storagePath,
      url: publicUrl,
      mime_type: file.type,
      file_size_bytes: file.size,
      alt_text: `${getValue("se-tail-number") || "Aircraft"} ${role === "primary" ? "primary photo" : "panel photo"}`
    });

    if (result.aircraft) fillForm(result.aircraft);
    await loadAircraft();
    const reloaded = aircraft.find((item) => item.operational_asset_id === selectedAircraftId);
    if (reloaded) fillForm(reloaded);
    setStatus(`${role === "primary" ? "Primary" : "Panel"} image uploaded.`);
  }

  async function archiveAircraft(aircraftId) {
    if (!window.confirm("Archive this aircraft? It can be restored later.")) return;
    setStatus("Archiving aircraft...");
    await callCoreAdminAction("archive_aircraft", { aircraft_id: aircraftId });
    if (selectedAircraftId === aircraftId) resetFormFields();
    setChecked("se-include-archived", true);
    await loadAircraft();
    setDirty(false);
    setStatus("Aircraft archived. Archived records are now shown so you can restore it if needed.");
  }

  async function restoreAircraft(aircraftId) {
    setStatus("Restoring aircraft...");
    const result = await callCoreAdminAction("restore_aircraft", { aircraft_id: aircraftId });
    await loadAircraft();
    if (result.aircraft) fillForm(result.aircraft);
    setDirty(false);
    setStatus("Aircraft restored.");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = "";
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((r) => r.some((cell) => String(cell || "").trim() !== ""));
  }

  function csvRowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((header) => String(header || "").trim());
    return rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = row[index] ?? "";
      });
      return obj;
    });
  }

  async function readImportFile(file) {
    if (!file) return;
    const text = await file.text();
    const rows = csvRowsToObjects(parseCsv(text));
    pendingImportRows = rows;
    const el = document.getElementById("se-import-summary");
    if (el) {
      const headers = rows.length ? Object.keys(rows[0]) : [];
      el.innerHTML = `
        <strong>${rows.length} data rows loaded for preview.</strong>
        <div class="se-meta">Columns: ${escapeHtml(headers.join(", "))}</div>
      `;
    }
    setStatus(`CSV parsed. ${rows.length} rows ready. Do not import real data unless you mean to.`);
  }

  async function importCsvRows() {
    if (!selectedCustomerId) {
      setStatus("Select an organization first.");
      return;
    }
    if (!pendingImportRows.length) {
      setStatus("Choose a CSV file first.");
      return;
    }
    if (!window.confirm(`Import/update ${pendingImportRows.length} aircraft rows for this organization?`)) return;

    setStatus("Importing aircraft rows...");
    const result = await callCoreAdminAction("bulk_upsert_aircraft", {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      rows: pendingImportRows
    });
    await loadAircraft();
    setStatus(`Import finished. Saved: ${result.saved_count || 0}. Failed: ${result.failed_count || 0}.`);
  }

  function setDebugVisible(value) {
    debugVisible = !!value;
    localStorage.setItem("syncetc-aircraft-admin-debug", debugVisible ? "shown" : "hidden");
    const card = document.getElementById("se-debug-card");
    if (card) card.style.display = debugVisible ? "block" : "none";
    setChecked("se-show-debug", debugVisible);
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1220px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-card-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;word-break:break-word;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
        .se-badge.warn{background:#fff6dd;color:#8a5b00;}
        .se-badge.ok{background:#eaf8ef;color:#1f6f3b;}
        .se-mini-badge{display:inline-flex;margin-left:8px;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:11px;font-weight:900;padding:4px 8px;vertical-align:middle;}
        .se-mini-badge.danger{background:#ffecec;color:#9b1c1c;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-grid{display:grid;grid-template-columns:380px minmax(0,1fr);gap:14px;align-items:start;}
        .se-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:800;color:#26344d;}
        .se-input,.se-select,.se-textarea{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-textarea{min-height:86px;resize:vertical;font-family:Arial,Helvetica,sans-serif;}
        .se-check{display:flex;align-items:center;gap:8px;font-weight:800;color:#26344d;font-size:13px;margin-bottom:12px;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}
        .se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}
        .se-button.full{width:100%;}
        .se-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:6px;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        .se-aircraft-row{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #d9e0ea;border-radius:14px;padding:12px;margin-bottom:10px;background:#fbfcfe;}
        .se-aircraft-row.is-selected{border-color:#1f4f82;background:#f4f8fd;}
        .se-aircraft-row.is-archived{opacity:.78;background:#f7f2f2;}
        .se-aircraft-thumb{width:76px;height:56px;border:1px solid #c7d2e2;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff;font-weight:900;color:#1f4f82;font-size:20px;}
        .se-aircraft-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
        .se-meta{font-size:12px;color:#5d6b82;margin-top:4px;word-break:break-word;}
        .se-warning{font-size:12px;color:#9b1c1c;font-weight:900;margin-top:6px;}
        .se-row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
        .se-import-box{border:1px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:14px;margin-top:10px;}
        .se-generated{border:1px dashed #c7d2e2;border-radius:10px;background:#fbfcfe;padding:10px 11px;font-size:13px;color:#26344d;min-height:39px;display:flex;align-items:center;}
        .se-drop{border:2px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:12px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease;}
        .se-drop.dragover{border-color:#1f4f82;background:#f0f6fd;}
        .se-auth-gate{border-style:dashed;}
        .se-drop-preview{height:190px;border-radius:10px;background:#fff;border:1px solid #d9e0ea;display:grid;place-items:center;overflow:hidden;color:#5d6b82;font-weight:800;text-align:center;padding:10px;}
        .se-drop-preview img{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;display:block;}
        .se-drop input{display:none;}
        @media(max-width:960px){.se-grid{grid-template-columns:1fr;}.se-controls,.se-form-grid{grid-template-columns:1fr;}.se-aircraft-row{grid-template-columns:1fr;}.se-row-actions{justify-content:flex-start;}}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Aircraft Admin</h1>
          <p class="se-subtitle">Aviation-facing admin for real-world aircraft records. Internally these are generic operational assets.</p>
          <div class="se-actions">
            <div class="se-badge">ADMIN-PAGE-aircraft-admin-current.js | ${escapeHtml(VERSION)}</div>
            <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
            <div id="se-dirty-badge" class="se-badge ok">Saved</div>
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
          <p class="se-subtitle">Aircraft Admin is hidden until a valid platform-admin session is active. Backend permissions still enforce access; this gate prevents accidental viewing/editing while logged out.</p>
        </section>

        <section class="se-grid" data-auth-required="true">
          <aside>
            <section class="se-card">
              <h2 class="se-section-title">Organization</h2>
              <label class="se-field"><span class="se-label">Organization</span><select id="se-customer-select" class="se-select"><option value="">Log in and load organizations...</option></select></label>
              <label class="se-check"><input id="se-include-archived" type="checkbox"> Show archived aircraft</label>
              <label class="se-check"><input id="se-show-debug" type="checkbox"> Show debug panel</label>
              <button id="se-new-aircraft" class="se-button secondary full" type="button">New aircraft</button>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Aircraft</h2>
              <div id="se-aircraft-list" class="se-empty">No aircraft loaded yet.</div>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Optional CSV Import</h2>
              <p class="se-subtitle">Use later for Webflow aircraft CMS exports. Future customer imports need a mapping step.</p>
              <div class="se-import-box">
                <input id="se-csv-file" class="se-input" type="file" accept=".csv,text/csv">
                <div id="se-import-summary" class="se-meta" style="margin-top:10px;">No CSV chosen.</div>
                <button id="se-import-csv" class="se-button full" style="margin-top:12px;" type="button">Import CSV rows</button>
              </div>
            </section>

            <section id="se-debug-card" class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <h2 class="se-section-title" style="margin:0;">Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </aside>

          <section>
            <section class="se-card">
              <div class="se-card-head">
                <h2 class="se-section-title" style="margin:0;">Aircraft Record</h2>
                <div class="se-actions" style="margin-top:0;">
                  <button id="se-save-aircraft" class="se-button" type="button">Save aircraft</button>
                  <button id="se-clear-form" class="se-button secondary" type="button">Clear form</button>
                </div>
              </div>

              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Tail Number</span><input id="se-tail-number" class="se-input" type="text" placeholder="N123AB"></label>
                <label class="se-field"><span class="se-label">System Key / Slug</span><div id="se-generated-key" class="se-generated">Generated on save</div></label>
                <label class="se-field"><span class="se-label">Aircraft Type</span><input id="se-aircraft-type" class="se-input" type="text" placeholder="Cessna 172SP"></label>
                <label class="se-field"><span class="se-label">Model Year</span><input id="se-model-year" class="se-input" type="text" inputmode="numeric" maxlength="4" placeholder="1978"></label>
                <label class="se-field"><span class="se-label">Operational Status</span><select id="se-status-key" class="se-select"><option value="available">Available</option><option value="scheduled-maintenance">Scheduled Maintenance</option><option value="do-not-dispatch">Do Not Dispatch</option><option value="grounded">Grounded</option><option value="inactive">Inactive</option></select></label>
                <label class="se-field"><span class="se-label">Visibility</span><select id="se-visibility" class="se-select"><option value="public">Public</option><option value="members">Members</option><option value="admins">Admins</option></select></label>
                <label class="se-field"><span class="se-label">Sort Order</span><input id="se-sort-order" class="se-input" type="number" placeholder="100"></label>
                <label class="se-field"><span class="se-label">Home Base</span><input id="se-home-base" class="se-input" type="text" placeholder="KSMQ - Somerset, NJ"></label>
                <label class="se-field"><span class="se-label">Hourly Rate</span><input id="se-hourly-rate" class="se-input" type="number" step="0.01" placeholder="155"></label>
                <label class="se-field"><span class="se-label">Annual Due</span><input id="se-annual-due" class="se-input" type="number" step="0.01"></label>
              </div>

              <label class="se-check"><input id="se-do-not-dispatch" type="checkbox"> Do Not Dispatch</label>
              <input id="se-primary-photo-url" type="hidden">
              <input id="se-panel-photo-url" type="hidden">

              <div class="se-form-grid">
                <div class="se-field">
                  <span class="se-label">Primary Aircraft Photo</span>
                  <div class="se-drop" data-image-role="primary">
                    <input id="se-primary-photo-file" type="file" accept="image/*">
                    <div id="se-primary-photo-preview" class="se-drop-preview"><span>Drop primary aircraft photo</span></div>
                    <div id="se-primary-photo-url-label" class="se-meta">No image uploaded yet.</div>
                  </div>
                </div>
                <div class="se-field">
                  <span class="se-label">Panel Photo</span>
                  <div class="se-drop" data-image-role="panel">
                    <input id="se-panel-photo-file" type="file" accept="image/*">
                    <div id="se-panel-photo-preview" class="se-drop-preview"><span>Drop panel photo</span></div>
                    <div id="se-panel-photo-url-label" class="se-meta">No image uploaded yet.</div>
                  </div>
                </div>
              </div>

              <label class="se-field"><span class="se-label">Plain Summary</span><textarea id="se-summary" class="se-textarea" placeholder="Short plain-text aircraft summary."></textarea></label>
              <label class="se-field"><span class="se-label">HTML Description</span><textarea id="se-description" class="se-textarea" placeholder="Optional HTML description from Webflow CMS."></textarea></label>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Maintenance / Usage Snapshot</h2>
              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Current Tach</span><input id="se-current-tach" class="se-input" type="number" step="0.01"></label>
                <label class="se-field"><span class="se-label">Tach Date</span><input id="se-tach-date" class="se-input" type="date"></label>
                <label class="se-field"><span class="se-label">Current Hobbs</span><input id="se-current-hobbs" class="se-input" type="number" step="0.01"></label>
                <label class="se-field"><span class="se-label">Hobbs Date</span><input id="se-hobbs-date" class="se-input" type="date"></label>
                <label class="se-field"><span class="se-label">Hobbs at Last MOH</span><input id="se-hobbs-moh" class="se-input" type="number" step="0.01"></label>
                <label class="se-field"><span class="se-label">Oil Change Due Tach</span><input id="se-oil-change-due-tach" class="se-input" type="number" step="0.01"></label>
              </div>
              <label class="se-field"><span class="se-label">Engine Notes</span><textarea id="se-engine-notes" class="se-textarea"></textarea></label>
              <label class="se-field"><span class="se-label">General Maintenance Notes</span><textarea id="se-maintenance-notes" class="se-textarea"></textarea></label>
            </section>
          </section>
        </section>
      </main>
    `;
  }

  function bindDirtyInputs() {
    const root = ensureRoot();
    root.querySelectorAll("input, select, textarea").forEach((el) => {
      if (["se-email", "se-password", "se-show-debug", "se-include-archived", "se-csv-file", "se-primary-photo-file", "se-panel-photo-file"].includes(el.id)) return;
      el.addEventListener("input", () => {
        markDirty();
        refreshGeneratedKeyLabel();
      });
      el.addEventListener("change", () => {
        markDirty();
        refreshGeneratedKeyLabel();
      });
    });
  }

  function bindDropZone(role) {
    const zone = document.querySelector(`.se-drop[data-image-role="${role}"]`);
    const input = document.getElementById(`se-${role}-photo-file`);
    if (!zone || !input) return;

    zone.addEventListener("click", (event) => {
      if (event.target === input) return;
      input.click();
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.remove("dragover");
      });
    });

    zone.addEventListener("drop", async (event) => {
      try {
        const file = event.dataTransfer?.files?.[0];
        await uploadAircraftImage(role, file);
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "image_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    input.addEventListener("change", async (event) => {
      try {
        const file = event.target.files && event.target.files[0];
        await uploadAircraftImage(role, file);
        input.value = "";
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "image_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });
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
        if (!confirmDiscard("You have unsaved aircraft changes. Log out anyway?")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        aircraft = [];
        selectedCustomerId = "";
        selectedAircraftId = "";
        renderCustomers();
        renderAircraftList();
        clearForm();
        setAuthGate(false);
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscard()) return;
        await loadCustomers();
      } catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("focus", (event) => {
      event.target.dataset.previousValue = selectedCustomerId;
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        const previous = event.target.dataset.previousValue || selectedCustomerId;
        if (!confirmDiscard("Changing organization will discard unsaved aircraft changes. Continue?")) {
          event.target.value = previous;
          return;
        }
        selectedCustomerId = event.target.value || "";
        selectedAircraftId = "";
        resetFormFields();
        setDirty(false);
        await loadAircraft();
      } catch (error) {
        setStatus("Aircraft load failed.");
        setOutput({ ok: false, event: "aircraft_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-include-archived")?.addEventListener("change", async () => {
      try {
        if (!confirmDiscard()) {
          setChecked("se-include-archived", !getChecked("se-include-archived"));
          return;
        }
        await loadAircraft();
      } catch (error) {
        setStatus("Archived aircraft toggle failed.");
        setOutput({ ok: false, event: "include_archived_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-show-debug")?.addEventListener("change", (event) => setDebugVisible(event.target.checked));

    document.getElementById("se-new-aircraft")?.addEventListener("click", () => {
      if (!confirmDiscard("Starting a new aircraft will clear unsaved changes. Continue?")) return;
      clearForm();
    });

    document.getElementById("se-clear-form")?.addEventListener("click", () => {
      if (!confirmDiscard("Clear this form and discard unsaved changes?")) return;
      clearForm();
    });

    document.getElementById("se-status-key")?.addEventListener("change", () => {
      if (getValue("se-status-key") === "do-not-dispatch") setChecked("se-do-not-dispatch", true);
    });

    document.getElementById("se-do-not-dispatch")?.addEventListener("change", () => {
      if (getChecked("se-do-not-dispatch")) setValue("se-status-key", "do-not-dispatch");
      else if (getValue("se-status-key") === "do-not-dispatch") setValue("se-status-key", "available");
    });

    document.getElementById("se-save-aircraft")?.addEventListener("click", async () => {
      try { await saveAircraft(); }
      catch (error) {
        setStatus("Save aircraft failed.");
        setOutput({ ok: false, event: "save_aircraft_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-aircraft-list")?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!target || !target.getAttribute) return;
      const aircraftId = target.getAttribute("data-aircraft-id");
      if (!aircraftId) return;
      try {
        if (target.classList.contains("se-edit-aircraft")) {
          if (!confirmDiscard("Switching aircraft will discard unsaved changes. Continue?")) return;
          const item = aircraft.find((row) => row.operational_asset_id === aircraftId);
          if (item) fillForm(item);
        } else if (target.classList.contains("se-archive-aircraft")) {
          await archiveAircraft(aircraftId);
        } else if (target.classList.contains("se-restore-aircraft")) {
          await restoreAircraft(aircraftId);
        }
      } catch (error) {
        setStatus("Aircraft action failed.");
        setOutput({ ok: false, event: "aircraft_action_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-csv-file")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files && event.target.files[0];
        await readImportFile(file);
      } catch (error) {
        setStatus("CSV parse failed.");
        setOutput({ ok: false, event: "csv_parse_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-import-csv")?.addEventListener("click", async () => {
      try { await importCsvRows(); }
      catch (error) {
        setStatus("CSV import failed.");
        setOutput({ ok: false, event: "csv_import_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);

    bindDirtyInputs();
    bindDropZone("primary");
    bindDropZone("panel");
    setDebugVisible(debugVisible);
  }

  async function boot() {
    renderShell();
    setAuthGate(false);
    bindEvents();
    clearForm();
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

// ADMIN-PAGE-aircraft-admin-current.js END
