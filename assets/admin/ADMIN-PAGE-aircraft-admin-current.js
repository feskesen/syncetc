// ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-04-002
// Purpose: Aviation-facing Aircraft Admin page backed by generic operational assets.

(function () {
  "use strict";

  const VERSION = "2026-06-04-002";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-aircraft-admin-root";
  const STORAGE_BUCKET = "core-assets";
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  let supabaseClient = null;
  let customers = [];
  let aircraft = [];
  let selectedCustomerId = "";
  let selectedAircraftId = "";
  let cleanSnapshot = "";
  let unregisterDirtyGuard = null;

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
    const raw = String(name || "aircraft-image").trim();
    const base = raw.replace(/\.[^.]+$/, "");
    return normalizeKey(base) || "aircraft-image";
  }

  function getExtension(name, fallback) {
    const raw = String(name || "");
    const ext = raw.includes(".") ? raw.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    if (ext) return ext;
    if (fallback === "image/jpeg") return "jpg";
    if (fallback === "image/webp") return "webp";
    return "png";
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

  function getChecked(id, fallback = false) {
    const el = document.getElementById(id);
    return el ? !!el.checked : fallback;
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function numberOrNull(value) {
    const raw = String(value ?? "").trim().replace(/[$,]/g, "");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function integerOrNull(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (!/^\d{4}$/.test(raw)) throw new Error("Model year must be four digits, like 2004.");
    const year = Number(raw);
    const max = new Date().getFullYear() + 2;
    if (year < 1900 || year > max) throw new Error(`Model year must be between 1900 and ${max}.`);
    return year;
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

  function getSelectedCustomer() {
    return customers.find((customer) => customer.customer_id === selectedCustomerId) || null;
  }

  function getSelectedAircraft() {
    return aircraft.find((item) => item.operational_asset_id === selectedAircraftId) || null;
  }

  function getOrganizationStorageKey() {
    const customer = getSelectedCustomer();
    return normalizeKey(customer?.customer_key || customer?.organization_key || selectedCustomerId || "organization");
  }

  function getPublicUrlFromStoragePath(storagePath) {
    if (!storagePath) return "";
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
  }

  function getGeneratedSlugPreview() {
    const selected = getSelectedAircraft();
    if (selected?.asset_key) return selected.asset_key;
    return normalizeKey(getValue("se-tail-number") || getValue("se-display-name") || getValue("se-aircraft-type") || "aircraft");
  }

  function updateSlugPreview() {
    const el = document.getElementById("se-slug-preview");
    if (el) el.textContent = getGeneratedSlugPreview() || "generated-after-save";
  }

  function getFormSnapshot() {
    const ids = [
      "se-tail-number", "se-display-name", "se-aircraft-type", "se-model-year", "se-status-key",
      "se-visibility", "se-sort-order", "se-home-base", "se-hourly-rate", "se-annual-due",
      "se-primary-photo-url", "se-panel-photo-url", "se-summary", "se-description", "se-engine-notes",
      "se-current-tach", "se-tach-date", "se-current-hobbs", "se-hobbs-date", "se-hobbs-moh",
      "se-maintenance-notes", "se-oil-change-due-tach"
    ];
    const checks = ["se-current", "se-do-not-dispatch"];
    const data = { selectedAircraftId };
    ids.forEach((id) => data[id] = getValue(id));
    checks.forEach((id) => data[id] = getChecked(id));
    return JSON.stringify(data);
  }

  function isDirty() {
    return !!cleanSnapshot && getFormSnapshot() !== cleanSnapshot;
  }

  function updateDirtyBadge() {
    const badge = document.getElementById("se-dirty-badge");
    if (!badge) return;
    if (isDirty()) {
      badge.textContent = "Unsaved changes";
      badge.classList.add("is-dirty");
    } else {
      badge.textContent = "Saved / clean";
      badge.classList.remove("is-dirty");
    }
  }

  function markClean() {
    cleanSnapshot = getFormSnapshot();
    updateDirtyBadge();
  }

  function markDirty() {
    updateSlugPreview();
    updateDirtyBadge();
  }

  function confirmDiscard(message) {
    if (!isDirty()) return true;
    return window.confirm(message || "You have unsaved aircraft changes. Continue and discard them?");
  }

  function registerDirtyGuard() {
    if (unregisterDirtyGuard) unregisterDirtyGuard();
    if (window.SyncEtcAdminDirtyGuard) {
      unregisterDirtyGuard = window.SyncEtcAdminDirtyGuard.register({
        isDirty,
        message: "You have unsaved aircraft changes. Leave this page and discard them?"
      });
    } else {
      window.addEventListener("beforeunload", (event) => {
        if (!isDirty()) return;
        event.preventDefault();
        event.returnValue = "";
      });
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

  function renderPhotoPreview(role) {
    const url = getValue(role === "primary" ? "se-primary-photo-url" : "se-panel-photo-url");
    const box = document.getElementById(role === "primary" ? "se-primary-photo-preview" : "se-panel-photo-preview");
    if (!box) return;
    box.innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="${role === "primary" ? "Primary aircraft" : "Panel"} photo">`
      : `<span>${role === "primary" ? "Primary photo" : "Panel photo"}</span>`;
  }

  function renderAircraftList() {
    const list = document.getElementById("se-aircraft-list");
    if (!list) return;

    if (!selectedCustomerId) {
      list.innerHTML = `<div class="se-empty">Select an organization first.</div>`;
      return;
    }

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
            <div class="se-meta">${escapeHtml(item.aircraft_type || "No type")} · ${escapeHtml(item.home_base || "No base")} · ${escapeHtml(item.status_label || item.status_key || "")}</div>
            <div class="se-meta">slug: ${escapeHtml(item.asset_key || "")}</div>
            ${item.do_not_dispatch ? `<div class="se-warning">Do Not Dispatch</div>` : ""}
            ${archived ? `<div class="se-warning muted">Archived</div>` : ""}
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

  function clearForm(options = {}) {
    if (!options.force && !confirmDiscard()) return false;
    selectedAircraftId = "";
    [
      "se-tail-number", "se-display-name", "se-aircraft-type", "se-model-year", "se-sort-order", "se-home-base",
      "se-hourly-rate", "se-annual-due", "se-primary-photo-url", "se-panel-photo-url", "se-summary", "se-description",
      "se-engine-notes", "se-current-tach", "se-tach-date", "se-current-hobbs", "se-hobbs-date",
      "se-hobbs-moh", "se-maintenance-notes", "se-oil-change-due-tach"
    ].forEach((id) => setValue(id, ""));
    setValue("se-status-key", "available");
    setValue("se-visibility", "public");
    setValue("se-sort-order", "100");
    setChecked("se-current", true);
    setChecked("se-do-not-dispatch", false);
    updateSlugPreview();
    renderPhotoPreview("primary");
    renderPhotoPreview("panel");
    renderAircraftList();
    markClean();
    setStatus("Aircraft form ready.");
    return true;
  }

  function fillForm(item) {
    selectedAircraftId = item.operational_asset_id || "";
    setValue("se-tail-number", item.tail_number || item.identifier || "");
    setValue("se-display-name", item.display_name || "");
    setValue("se-aircraft-type", item.aircraft_type || item.aircraft_model || "");
    setValue("se-model-year", item.model_year || item.aircraft_year || "");
    setValue("se-status-key", item.status_key || "available");
    if (getValue("se-status-key") === "archived") setValue("se-status-key", "inactive");
    setValue("se-visibility", item.visibility || "public");
    setValue("se-sort-order", item.sort_order ?? 100);
    setValue("se-home-base", item.home_base || "");
    setValue("se-hourly-rate", item.hourly_rate ?? "");
    setValue("se-annual-due", item.annual_due ?? "");
    setValue("se-primary-photo-url", item.primary_photo_url || "");
    setValue("se-panel-photo-url", item.panel_photo_url || "");
    setValue("se-summary", item.summary || item.aircraft_description_plain || "");
    setValue("se-description", item.description || "");
    setChecked("se-current", item.asset_record_status !== "hidden" && item.asset_record_status !== "archived");
    setChecked("se-do-not-dispatch", !!item.do_not_dispatch || item.status_key === "do-not-dispatch");
    setValue("se-engine-notes", item.engine_notes || "");
    setValue("se-current-tach", item.current_tach ?? "");
    setValue("se-tach-date", item.tach_date || "");
    setValue("se-current-hobbs", item.current_hobbs ?? "");
    setValue("se-hobbs-date", item.hobbs_date || "");
    setValue("se-hobbs-moh", item.hobbs_at_last_major_overhaul ?? "");
    setValue("se-maintenance-notes", item.maintenance_notes_general || "");
    setValue("se-oil-change-due-tach", item.oil_change_due_tach ?? "");
    updateSlugPreview();
    renderPhotoPreview("primary");
    renderPhotoPreview("panel");
    renderAircraftList();
    markClean();
    setStatus(`Editing ${item.tail_number || item.display_name || "aircraft"}.`);
  }

  function collectAircraftPayload() {
    const tailNumber = getValue("se-tail-number").trim().toUpperCase().replace(/\s+/g, "");
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    if (!tailNumber) throw new Error("Tail number is required for now.");

    return {
      organization_id: selectedCustomerId,
      customer_id: selectedCustomerId,
      operational_asset_id: selectedAircraftId || null,
      tail_number: tailNumber,
      display_name: getValue("se-display-name").trim() || tailNumber,
      aircraft_type: getValue("se-aircraft-type").trim(),
      model_year: integerOrNull(getValue("se-model-year")),
      status_key: getValue("se-status-key", "available"),
      visibility: getValue("se-visibility", "public"),
      sort_order: numberOrNull(getValue("se-sort-order")) ?? 100,
      home_base: getValue("se-home-base").trim(),
      hourly_rate: numberOrNull(getValue("se-hourly-rate")),
      annual_due: numberOrNull(getValue("se-annual-due")),
      primary_photo_url: getValue("se-primary-photo-url").trim(),
      panel_photo_url: getValue("se-panel-photo-url").trim(),
      summary: getValue("se-summary").trim(),
      aircraft_description_plain: getValue("se-summary").trim(),
      description: getValue("se-description").trim(),
      current: getChecked("se-current", true),
      do_not_dispatch: getChecked("se-do-not-dispatch", false),
      engine_notes: getValue("se-engine-notes").trim(),
      current_tach: numberOrNull(getValue("se-current-tach")),
      tach_date: getValue("se-tach-date").trim() || null,
      current_hobbs: numberOrNull(getValue("se-current-hobbs")),
      hobbs_date: getValue("se-hobbs-date").trim() || null,
      hobbs_at_last_major_overhaul: numberOrNull(getValue("se-hobbs-moh")),
      maintenance_notes_general: getValue("se-maintenance-notes").trim(),
      oil_change_due_tach: numberOrNull(getValue("se-oil-change-due-tach"))
    };
  }

  async function loadCustomers() {
    setStatus("Loading organizations...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];
    renderCustomers();
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
      organization_id: selectedCustomerId,
      include_archived: getChecked("se-include-archived", false)
    });
    aircraft = Array.isArray(result.aircraft) ? result.aircraft : [];
    renderAircraftList();
    setStatus("Aircraft loaded.");
  }

  async function saveAircraft(options = {}) {
    const payload = collectAircraftPayload();
    if (!options.silent) setStatus("Saving aircraft...");
    const result = await callCoreAdminAction("upsert_aircraft", payload);
    const saved = result.aircraft;
    if (!saved?.operational_asset_id) throw new Error("Aircraft saved, but no aircraft ID returned.");
    selectedAircraftId = saved.operational_asset_id;
    await loadAircraft();
    fillForm(saved);
    setStatus(`Aircraft saved: ${saved.tail_number || saved.display_name || selectedAircraftId}`);
    return saved;
  }

  async function archiveAircraft(aircraftId) {
    if (!aircraftId) return;
    if (!confirmDiscard("You have unsaved aircraft changes. Archive another aircraft and discard those changes?")) return;
    if (!window.confirm("Archive this aircraft record? You can restore it later.")) return;
    setStatus("Archiving aircraft...");
    await callCoreAdminAction("archive_aircraft", { aircraft_id: aircraftId });
    setChecked("se-include-archived", true);
    await loadAircraft();
    if (selectedAircraftId === aircraftId) clearForm({ force: true });
    setStatus("Aircraft archived. Archived records are now visible so you can restore if needed.");
  }

  async function restoreAircraft(aircraftId) {
    if (!aircraftId) return;
    if (!confirmDiscard("You have unsaved aircraft changes. Restore another aircraft and discard those changes?")) return;
    setStatus("Restoring aircraft...");
    const result = await callCoreAdminAction("restore_aircraft", { aircraft_id: aircraftId });
    await loadAircraft();
    if (result.aircraft) fillForm(result.aircraft);
    setStatus("Aircraft restored.");
  }

  function validateImageFile(file) {
    if (!file) throw new Error("No image selected.");
    if (!String(file.type || "").startsWith("image/")) throw new Error("Only image files are allowed.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Image file is too large. Use an image under 8 MB.");
  }

  async function ensureAircraftSavedForUpload() {
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    if (!selectedAircraftId || isDirty()) {
      setStatus("Saving aircraft before image upload...");
      await saveAircraft({ silent: true });
    }
    if (!selectedAircraftId) throw new Error("Save the aircraft before uploading images.");
    return getSelectedAircraft() || { operational_asset_id: selectedAircraftId, asset_key: getGeneratedSlugPreview(), tail_number: getValue("se-tail-number") };
  }

  async function uploadAircraftImage(role, file) {
    validateImageFile(file);
    const savedAircraft = await ensureAircraftSavedForUpload();
    const orgKey = getOrganizationStorageKey();
    const aircraftKey = normalizeKey(savedAircraft.asset_key || savedAircraft.tail_number || selectedAircraftId);
    const extension = getExtension(file.name, file.type);
    const cleanName = sanitizeFileName(file.name);
    const storagePath = `organizations/${orgKey}/operational-assets/${selectedAircraftId}/images/${role}/${Date.now()}-${cleanName}.${extension}`;

    setStatus(`Uploading ${role} image...`);
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

    const publicUrl = publicData?.publicUrl || getPublicUrlFromStoragePath(storagePath);

    const result = await callCoreAdminAction("attach_aircraft_image_asset", {
      organization_id: selectedCustomerId,
      aircraft_id: selectedAircraftId,
      image_role: role,
      url: publicUrl,
      storage_path: storagePath,
      alt_text: `${getValue("se-tail-number") || "Aircraft"} ${role === "primary" ? "primary" : "panel"} photo`,
      mime_type: file.type || "image",
      file_size_bytes: file.size,
      metadata_json: {
        uploaded_from: "aircraft_admin",
        original_filename: file.name || null
      }
    });

    await loadAircraft();
    if (result.aircraft) fillForm(result.aircraft);
    setStatus(`${role === "primary" ? "Primary" : "Panel"} image uploaded.`);
  }

  function renderPage() {
    const root = ensureRoot();
    root.innerHTML = `
      <style>
        #${ROOT_ID} { font-family: Arial, Helvetica, sans-serif; color: #172033; background: #f5f8fc; padding: 20px; }
        #${ROOT_ID} * { box-sizing: border-box; }
        #${ROOT_ID} .se-wrap { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 330px 1fr; gap: 18px; }
        #${ROOT_ID} .se-card { background: #fff; border: 1px solid #d8e1ed; border-radius: 16px; padding: 18px; box-shadow: 0 8px 24px rgba(23,32,51,.06); }
        #${ROOT_ID} .se-title { margin: 0 0 8px; font-size: 24px; font-weight: 900; }
        #${ROOT_ID} .se-section-title { margin: 0 0 12px; font-size: 18px; font-weight: 900; }
        #${ROOT_ID} .se-subtitle, #${ROOT_ID} .se-meta { color: #53647c; font-size: 13px; line-height: 1.35; }
        #${ROOT_ID} .se-field { display: block; margin: 0 0 12px; }
        #${ROOT_ID} .se-label { display: block; font-size: 12px; font-weight: 900; margin-bottom: 6px; }
        #${ROOT_ID} .se-input, #${ROOT_ID} .se-select, #${ROOT_ID} .se-textarea { width: 100%; border: 1px solid #c7d2e2; border-radius: 10px; min-height: 42px; padding: 10px 12px; font: inherit; background: #fff; }
        #${ROOT_ID} .se-textarea { min-height: 96px; resize: vertical; }
        #${ROOT_ID} .se-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        #${ROOT_ID} .se-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
        #${ROOT_ID} .se-button { appearance: none; border: 1px solid #1f4f82; background: #1f4f82; color: #fff; border-radius: 999px; padding: 10px 14px; font-weight: 900; cursor: pointer; }
        #${ROOT_ID} .se-button.secondary { background: #fff; color: #1f4f82; }
        #${ROOT_ID} .se-button.danger { background: #8a2631; border-color: #8a2631; }
        #${ROOT_ID} .se-button.small { padding: 7px 10px; font-size: 12px; }
        #${ROOT_ID} .se-output { background: #101827; color: #fff; border-radius: 12px; padding: 14px; min-height: 120px; max-height: 360px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; white-space: pre; }
        #${ROOT_ID} .se-aircraft-list { display: grid; gap: 10px; margin-top: 12px; max-height: 620px; overflow: auto; }
        #${ROOT_ID} .se-aircraft-row { border: 1px solid #d8e1ed; border-radius: 14px; padding: 12px; display: grid; grid-template-columns: 56px 1fr; gap: 12px; background: #fff; }
        #${ROOT_ID} .se-aircraft-row.is-selected { border-color: #1f4f82; background: #f4f8fd; }
        #${ROOT_ID} .se-aircraft-row.is-archived { opacity: .78; }
        #${ROOT_ID} .se-aircraft-thumb { width: 56px; height: 56px; border-radius: 12px; background: #edf3fa; display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 24px; }
        #${ROOT_ID} .se-aircraft-thumb img, #${ROOT_ID} .se-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
        #${ROOT_ID} .se-row-actions { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
        #${ROOT_ID} .se-warning { color: #8a2631; font-weight: 900; font-size: 12px; margin-top: 4px; }
        #${ROOT_ID} .se-warning.muted { color: #5d6b82; }
        #${ROOT_ID} .se-empty { border: 1px dashed #aebbd0; border-radius: 12px; padding: 14px; color: #53647c; }
        #${ROOT_ID} .se-generated { border: 1px dashed #aebbd0; border-radius: 10px; background: #f7faff; min-height: 42px; padding: 11px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #1f4f82; }
        #${ROOT_ID} .se-check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; }
        #${ROOT_ID} .se-dirty { display: inline-flex; align-items: center; border-radius: 999px; padding: 7px 10px; background: #edf3fa; color: #53647c; font-weight: 900; font-size: 12px; }
        #${ROOT_ID} .se-dirty.is-dirty { background: #fff1d6; color: #8a5a00; }
        #${ROOT_ID} .se-photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        #${ROOT_ID} .se-dropzone { border: 2px dashed #aebbd0; border-radius: 14px; padding: 12px; background: #f7faff; cursor: pointer; min-height: 170px; display: flex; flex-direction: column; gap: 10px; }
        #${ROOT_ID} .se-dropzone.is-dragover { border-color: #1f4f82; background: #edf6ff; }
        #${ROOT_ID} .se-photo-preview { height: 110px; border-radius: 10px; background: #edf3fa; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #53647c; font-weight: 900; }
        #${ROOT_ID} .se-hidden { display: none; }
        #${ROOT_ID} .se-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        @media (max-width: 900px) { #${ROOT_ID} .se-wrap { grid-template-columns: 1fr; } #${ROOT_ID} .se-form-grid, #${ROOT_ID} .se-photo-grid { grid-template-columns: 1fr; } }
      </style>

      <main class="se-wrap">
        <aside class="se-card">
          <h1 class="se-title">Aircraft Admin</h1>
          <p class="se-subtitle">Generic asset backend, aviation-facing admin UI.</p>

          <label class="se-field"><span class="se-label">Admin Email</span><input id="se-email" class="se-input" type="email" autocomplete="username"></label>
          <label class="se-field"><span class="se-label">Password</span><input id="se-password" class="se-input" type="password" autocomplete="current-password"></label>
          <div class="se-actions">
            <button id="se-login" class="se-button" type="button">Log in</button>
            <button id="se-logout" class="se-button secondary" type="button">Log out</button>
            <button id="se-refresh" class="se-button secondary" type="button">Refresh</button>
          </div>

          <label class="se-field"><span class="se-label">Organization</span><select id="se-customer-select" class="se-select"><option value="">Log in first</option></select></label>
          <label class="se-check"><input id="se-include-archived" type="checkbox"> Show archived aircraft</label>

          <div class="se-aircraft-list" id="se-aircraft-list"></div>
        </aside>

        <section>
          <section class="se-card">
            <div class="se-topbar">
              <div>
                <h2 class="se-section-title">Aircraft Record</h2>
                <span id="se-dirty-badge" class="se-dirty">Saved / clean</span>
              </div>
              <div class="se-actions">
                <button id="se-new-aircraft" class="se-button secondary" type="button">New aircraft</button>
                <button id="se-save-aircraft" class="se-button" type="button">Save aircraft</button>
                <button id="se-clear-form" class="se-button secondary" type="button">Clear form</button>
              </div>
            </div>

            <div class="se-form-grid">
              <label class="se-field"><span class="se-label">Tail Number</span><input id="se-tail-number" class="se-input" type="text" placeholder="N12345"></label>
              <label class="se-field"><span class="se-label">Display Name</span><input id="se-display-name" class="se-input" type="text" placeholder="N12345"></label>
              <label class="se-field"><span class="se-label">System Slug / Asset Key</span><div id="se-slug-preview" class="se-generated">generated-after-save</div></label>
              <label class="se-field"><span class="se-label">Aircraft Type</span><input id="se-aircraft-type" class="se-input" type="text" placeholder="Cessna 172SP"></label>
              <label class="se-field"><span class="se-label">Model Year</span><input id="se-model-year" class="se-input" type="text" inputmode="numeric" maxlength="4" placeholder="2004"></label>
              <label class="se-field"><span class="se-label">Status</span><select id="se-status-key" class="se-select"><option value="available">Available</option><option value="scheduled-maintenance">Maintenance</option><option value="do-not-dispatch">Do Not Dispatch</option><option value="grounded">Grounded</option><option value="inactive">Inactive</option></select></label>
              <label class="se-field"><span class="se-label">Visibility</span><select id="se-visibility" class="se-select"><option value="public">Public</option><option value="members">Members</option><option value="admins">Admins</option><option value="hidden">Hidden</option></select></label>
              <label class="se-field"><span class="se-label">Sort Order</span><input id="se-sort-order" class="se-input" type="number" placeholder="100"></label>
              <label class="se-field"><span class="se-label">Home Base</span><input id="se-home-base" class="se-input" type="text" placeholder="KSMQ - Somerset, NJ"></label>
              <label class="se-field"><span class="se-label">Hourly Rate</span><input id="se-hourly-rate" class="se-input" type="number" step="0.01" placeholder="155"></label>
              <label class="se-field"><span class="se-label">Annual Due</span><input id="se-annual-due" class="se-input" type="number" step="0.01"></label>
            </div>

            <div class="se-form-grid">
              <label class="se-check"><input id="se-current" type="checkbox" checked> Current aircraft</label>
              <label class="se-check"><input id="se-do-not-dispatch" type="checkbox"> Do Not Dispatch</label>
            </div>
          </section>

          <section class="se-card" style="margin-top:18px;">
            <h2 class="se-section-title">Aircraft Images</h2>
            <p class="se-subtitle">Drag/drop uploads to Supabase Storage under an organization/aircraft path. If the aircraft is unsaved, the page saves it first.</p>
            <input id="se-primary-photo-url" type="hidden" value="">
            <input id="se-panel-photo-url" type="hidden" value="">
            <div class="se-photo-grid">
              <div id="se-primary-drop" class="se-dropzone" data-role="primary">
                <div id="se-primary-photo-preview" class="se-photo-preview"><span>Primary photo</span></div>
                <strong>Primary aircraft photo</strong>
                <span class="se-subtitle">Drop image here or click to browse.</span>
                <input id="se-primary-file" class="se-hidden" type="file" accept="image/*">
              </div>
              <div id="se-panel-drop" class="se-dropzone" data-role="panel">
                <div id="se-panel-photo-preview" class="se-photo-preview"><span>Panel photo</span></div>
                <strong>Panel photo</strong>
                <span class="se-subtitle">Drop image here or click to browse.</span>
                <input id="se-panel-file" class="se-hidden" type="file" accept="image/*">
              </div>
            </div>
          </section>

          <section class="se-card" style="margin-top:18px;">
            <h2 class="se-section-title">Description</h2>
            <label class="se-field"><span class="se-label">Plain Summary</span><textarea id="se-summary" class="se-textarea" placeholder="Short plain-text aircraft summary."></textarea></label>
            <label class="se-field"><span class="se-label">HTML Description</span><textarea id="se-description" class="se-textarea" placeholder="Optional HTML description from Webflow CMS."></textarea></label>
          </section>

          <section class="se-card" style="margin-top:18px;">
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

          <section class="se-card" style="margin-top:18px;">
            <div class="se-topbar">
              <h2 class="se-section-title">Diagnostics</h2>
              <div class="se-actions">
                <button id="se-toggle-debug" class="se-button secondary small" type="button">Hide/show debug</button>
                <button id="se-copy-output" class="se-button secondary small" type="button">Copy result</button>
              </div>
            </div>
            <p id="se-status" class="se-subtitle">Loading...</p>
            <pre id="se-output" class="se-output">{}</pre>
          </section>
        </section>
      </main>
    `;
  }

  function bindDropzone(dropId, fileId, role) {
    const drop = document.getElementById(dropId);
    const input = document.getElementById(fileId);
    if (!drop || !input) return;

    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      try {
        const file = input.files && input.files[0];
        if (file) await uploadAircraftImage(role, file);
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "aircraft_image_upload_failed", role, message: error instanceof Error ? error.message : String(error) });
      } finally {
        input.value = "";
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.remove("is-dragover");
      });
    });
    drop.addEventListener("drop", async (event) => {
      try {
        const file = event.dataTransfer?.files?.[0];
        if (file) await uploadAircraftImage(role, file);
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "aircraft_image_upload_failed", role, message: error instanceof Error ? error.message : String(error) });
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
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadCustomers();
      } catch (error) {
        setStatus("Login failed.");
        setOutput({ ok: false, event: "login_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscard("You have unsaved aircraft changes. Log out and discard them?")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        aircraft = [];
        selectedCustomerId = "";
        selectedAircraftId = "";
        renderCustomers();
        renderAircraftList();
        clearForm({ force: true });
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscard("You have unsaved aircraft changes. Refresh and discard them?")) return;
        await loadCustomers();
        await loadAircraft();
      } catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      const previous = selectedCustomerId;
      const next = event.target.value || "";
      try {
        if (!confirmDiscard("You have unsaved aircraft changes. Switch organization and discard them?")) {
          event.target.value = previous;
          return;
        }
        selectedCustomerId = next;
        selectedAircraftId = "";
        clearForm({ force: true });
        await loadAircraft();
      } catch (error) {
        setStatus("Aircraft load failed.");
        setOutput({ ok: false, event: "aircraft_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-include-archived")?.addEventListener("change", async () => {
      try { await loadAircraft(); }
      catch (error) {
        setStatus("Archived aircraft toggle failed.");
        setOutput({ ok: false, event: "include_archived_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-new-aircraft")?.addEventListener("click", () => clearForm());
    document.getElementById("se-clear-form")?.addEventListener("click", () => clearForm());

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
          if (!confirmDiscard("You have unsaved aircraft changes. Load another aircraft and discard them?")) return;
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

    document.getElementById("se-status-key")?.addEventListener("change", () => {
      if (getValue("se-status-key") === "do-not-dispatch") setChecked("se-do-not-dispatch", true);
    });

    document.getElementById("se-do-not-dispatch")?.addEventListener("change", () => {
      if (getChecked("se-do-not-dispatch")) setValue("se-status-key", "do-not-dispatch");
    });

    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
    document.getElementById("se-toggle-debug")?.addEventListener("click", () => {
      const out = document.getElementById("se-output");
      if (out) out.classList.toggle("se-hidden");
    });

    document.getElementById(ROOT_ID)?.addEventListener("input", (event) => {
      const target = event.target;
      if (!target || !target.id || ["se-email", "se-password"].includes(target.id)) return;
      markDirty();
    });
    document.getElementById(ROOT_ID)?.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || !target.id || ["se-customer-select", "se-include-archived", "se-primary-file", "se-panel-file"].includes(target.id)) return;
      markDirty();
    });

    bindDropzone("se-primary-drop", "se-primary-file", "primary");
    bindDropzone("se-panel-drop", "se-panel-file", "panel");
  }

  async function boot() {
    renderPage();
    bindEvents();
    clearForm({ force: true });
    registerDirtyGuard();
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
