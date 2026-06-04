// ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-04-001
// Purpose: Aviation-facing Aircraft Admin page backed by generic operational assets.

(function () {
  "use strict";

  const VERSION = "2026-06-04-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-aircraft-admin-root";

  let supabaseClient = null;
  let customers = [];
  let aircraft = [];
  let selectedCustomerId = "";
  let selectedAircraftId = "";
  let pendingImportRows = [];

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

  function getChecked(id, fallback = false) {
    const el = document.getElementById(id);
    return el ? !!el.checked : fallback;
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
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
            <div class="se-meta">${escapeHtml(item.aircraft_type || "")} · ${escapeHtml(item.home_base || "No base")} · ${escapeHtml(item.status_label || item.status_key || "")}</div>
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

  function clearForm() {
    selectedAircraftId = "";
    [
      "se-tail-number", "se-asset-key", "se-aircraft-type", "se-model-year", "se-sort-order", "se-home-base",
      "se-hourly-rate", "se-annual-due", "se-primary-photo-url", "se-panel-photo-url", "se-summary", "se-description",
      "se-engine-notes", "se-current-tach", "se-tach-date", "se-current-hobbs", "se-hobbs-date",
      "se-hobbs-moh", "se-maintenance-notes", "se-oil-change-due-tach"
    ].forEach((id) => setValue(id, ""));
    setValue("se-status-key", "available");
    setValue("se-visibility", "public");
    setChecked("se-current", true);
    setChecked("se-do-not-dispatch", false);
    renderAircraftList();
    setStatus("Aircraft form cleared.");
  }

  function fillForm(item) {
    selectedAircraftId = item.operational_asset_id || "";
    setValue("se-tail-number", item.tail_number || item.identifier || "");
    setValue("se-asset-key", item.asset_key || item.slug || "");
    setValue("se-aircraft-type", item.aircraft_type || item.aircraft_model || "");
    setValue("se-model-year", item.model_year || item.aircraft_year || "");
    setValue("se-status-key", item.status_key || "available");
    setValue("se-visibility", item.visibility || "public");
    setChecked("se-current", item.asset_record_status !== "hidden" && item.asset_record_status !== "archived");
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
    renderAircraftList();
    setStatus(`Editing ${item.tail_number || item.display_name || "aircraft"}.`);
  }

  function collectAircraftPayload() {
    return {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      operational_asset_id: selectedAircraftId || undefined,
      tail_number: getValue("se-tail-number").trim(),
      asset_key: getValue("se-asset-key").trim(),
      aircraft_type: getValue("se-aircraft-type").trim(),
      model_year: getValue("se-model-year").trim(),
      status_key: getValue("se-status-key", "available"),
      visibility: getValue("se-visibility", "public"),
      current: getChecked("se-current", true),
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
    setStatus("Loading organizations...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];
    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;
    renderCustomers();
    if (selectedCustomerId) await loadAircraft();
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
      include_archived: getChecked("se-include-archived", false)
    });
    aircraft = Array.isArray(result.aircraft) ? result.aircraft : [];
    if (selectedAircraftId && !aircraft.some((item) => item.operational_asset_id === selectedAircraftId)) selectedAircraftId = "";
    renderAircraftList();
    setStatus(`Loaded ${aircraft.length} aircraft.`);
  }

  async function saveAircraft() {
    if (!selectedCustomerId) {
      setStatus("Select an organization first.");
      return;
    }
    const payload = collectAircraftPayload();
    if (!payload.tail_number && !payload.aircraft_type) {
      setStatus("Enter at least a tail number or aircraft type.");
      return;
    }
    setStatus("Saving aircraft...");
    const result = await callCoreAdminAction("upsert_aircraft", payload);
    selectedAircraftId = result.aircraft?.operational_asset_id || selectedAircraftId;
    await loadAircraft();
    const saved = aircraft.find((item) => item.operational_asset_id === selectedAircraftId);
    if (saved) fillForm(saved);
    setStatus("Aircraft saved.");
  }

  async function archiveAircraft(aircraftId) {
    if (!window.confirm("Archive this aircraft? It can be restored later.")) return;
    setStatus("Archiving aircraft...");
    await callCoreAdminAction("archive_aircraft", { aircraft_id: aircraftId });
    if (selectedAircraftId === aircraftId) clearForm();
    await loadAircraft();
    setStatus("Aircraft archived.");
  }

  async function restoreAircraft(aircraftId) {
    setStatus("Restoring aircraft...");
    await callCoreAdminAction("restore_aircraft", { aircraft_id: aircraftId });
    await loadAircraft();
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
      rows: pendingImportRows
    });
    await loadAircraft();
    setStatus(`Import finished. Saved: ${result.saved_count || 0}. Failed: ${result.failed_count || 0}.`);
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
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;word-break:break-word;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px;}
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
        .se-aircraft-row.is-archived{opacity:.72;background:#f7f2f2;}
        .se-aircraft-thumb{width:76px;height:56px;border:1px solid #c7d2e2;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff;font-weight:900;color:#1f4f82;font-size:20px;}
        .se-aircraft-thumb img{max-width:100%;max-height:100%;object-fit:cover;display:block;}
        .se-meta{font-size:12px;color:#5d6b82;margin-top:4px;word-break:break-word;}
        .se-warning{font-size:12px;color:#9b1c1c;font-weight:900;margin-top:6px;}
        .se-row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
        .se-import-box{border:1px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:14px;margin-top:10px;}
        @media(max-width:960px){.se-grid{grid-template-columns:1fr;}.se-controls,.se-form-grid{grid-template-columns:1fr;}.se-aircraft-row{grid-template-columns:1fr;}.se-row-actions{justify-content:flex-start;}}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Aircraft Admin</h1>
          <p class="se-subtitle">Aviation-facing admin for real-world aircraft records. Internally these are generic operational assets.</p>
          <div class="se-badge">ADMIN-PAGE-aircraft-admin-current.js | ${escapeHtml(VERSION)}</div>
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

        <section class="se-grid">
          <aside>
            <section class="se-card">
              <h2 class="se-section-title">Organization</h2>
              <label class="se-field"><span class="se-label">Organization</span><select id="se-customer-select" class="se-select"><option value="">Log in and load organizations...</option></select></label>
              <label class="se-check"><input id="se-include-archived" type="checkbox"> Include archived aircraft</label>
              <button id="se-new-aircraft" class="se-button secondary full" type="button">New aircraft</button>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Aircraft</h2>
              <div id="se-aircraft-list" class="se-empty">No aircraft loaded yet.</div>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Optional CSV Import</h2>
              <p class="se-subtitle">Use later for Webflow aircraft CMS exports. This will create/update records if you click Import.</p>
              <div class="se-import-box">
                <input id="se-csv-file" class="se-input" type="file" accept=".csv,text/csv">
                <div id="se-import-summary" class="se-meta" style="margin-top:10px;">No CSV chosen.</div>
                <button id="se-import-csv" class="se-button full" style="margin-top:12px;" type="button">Import CSV rows</button>
              </div>
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
              <h2 class="se-section-title">Aircraft Record</h2>
              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Tail Number</span><input id="se-tail-number" class="se-input" type="text" placeholder="N123AB"></label>
                <label class="se-field"><span class="se-label">Slug / Asset Key</span><input id="se-asset-key" class="se-input" type="text" placeholder="n123ab"></label>
                <label class="se-field"><span class="se-label">Aircraft Type</span><input id="se-aircraft-type" class="se-input" type="text" placeholder="Cessna 172SP"></label>
                <label class="se-field"><span class="se-label">Model Year</span><input id="se-model-year" class="se-input" type="number" placeholder="2004"></label>
                <label class="se-field"><span class="se-label">Status</span><select id="se-status-key" class="se-select"><option value="available">Available / Active</option><option value="scheduled-maintenance">Scheduled Maintenance</option><option value="do-not-dispatch">Do Not Dispatch</option><option value="grounded">Grounded</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
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

              <label class="se-field"><span class="se-label">Primary Aircraft Photo URL</span><input id="se-primary-photo-url" class="se-input" type="url" placeholder="https://..."></label>
              <label class="se-field"><span class="se-label">Panel Photo URL</span><input id="se-panel-photo-url" class="se-input" type="url" placeholder="https://..."></label>
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
              <div class="se-actions">
                <button id="se-save-aircraft" class="se-button" type="button">Save aircraft</button>
                <button id="se-clear-form" class="se-button secondary" type="button">Clear form</button>
              </div>
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
        aircraft = [];
        selectedCustomerId = "";
        selectedAircraftId = "";
        renderCustomers();
        renderAircraftList();
        clearForm();
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
        selectedAircraftId = "";
        clearForm();
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

    document.getElementById("se-new-aircraft")?.addEventListener("click", clearForm);
    document.getElementById("se-clear-form")?.addEventListener("click", clearForm);

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
  }

  async function boot() {
    renderShell();
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
