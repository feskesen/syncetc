// ADMIN-PAGE-media-library-current.js
// Internal Version: 2026-06-05-001
// Purpose: Admin-only media library uploader for gallery/home featured media.
// Actions used: list_customers, list_gallery_media, upsert_gallery_media, archive_gallery_media, restore_gallery_media.

(function () {
  "use strict";

  const VERSION = "2026-06-05-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const STORAGE_BUCKET = "core-assets";
  const ROOT_ID = "syncetc-media-library-root";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let mediaItems = [];
  let selectedCustomerId = "";
  let selectedMediaId = "";
  let isDirty = false;
  let isHydrating = false;
  let cleanSignature = "";
  let showArchived = false;

  const DIRTY_MESSAGE = "You have unsaved Media Library changes. Leave anyway?";

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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
    const base = String(name || "upload").split(/[\\/]/).pop() || "upload";
    const dot = base.lastIndexOf(".");
    const rawName = dot > 0 ? base.slice(0, dot) : base;
    const rawExt = dot > 0 ? base.slice(dot + 1) : "";
    const safeName = normalizeKey(rawName) || "upload";
    const safeExt = rawExt.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
    return safeExt ? `${safeName}.${safeExt}` : safeName;
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

  function getEl(id) {
    return document.getElementById(id);
  }

  function getValue(id, fallback = "") {
    const el = getEl(id);
    return el ? el.value : fallback;
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el) el.value = value ?? "";
  }

  function getChecked(id) {
    return Boolean(getEl(id)?.checked);
  }

  function setChecked(id, value) {
    const el = getEl(id);
    if (el) el.checked = Boolean(value);
  }

  function selectedAttr(value, expected) {
    return String(value || "") === String(expected || "") ? "selected" : "";
  }

  function stableStringify(value) {
    const seen = new WeakSet();
    function normalize(input) {
      if (input === null || typeof input !== "object") return input;
      if (seen.has(input)) return null;
      seen.add(input);
      if (Array.isArray(input)) return input.map(normalize);
      return Object.keys(input).sort().reduce((acc, key) => {
        acc[key] = normalize(input[key]);
        return acc;
      }, {});
    }
    return JSON.stringify(normalize(value));
  }

  function getCurrentSignature() {
    if (!selectedMediaId && !getValue("se-title") && !getValue("se-caption") && !getValue("se-credit") && !getValue("se-alt-text")) return "";
    return stableStringify({
      selected_media_id: selectedMediaId || "",
      title: getValue("se-title"),
      caption: getValue("se-caption"),
      credit: getValue("se-credit"),
      alt_text: getValue("se-alt-text"),
      visibility: getValue("se-visibility", "public"),
      status: getValue("se-media-status", "active"),
      is_featured: getChecked("se-is-featured"),
      sort_order: getValue("se-sort-order", "100"),
      storage_path: getValue("se-storage-path"),
      public_url: getValue("se-public-url"),
    });
  }

  function syncShellDirtyState() {
    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setDirty === "function") {
      window.SyncEtcAdminShell.setDirty(isDirty, DIRTY_MESSAGE);
    }
  }

  function setDirty(value) {
    isDirty = Boolean(value);
    const badge = getEl("se-dirty-badge");
    if (badge) {
      badge.textContent = isDirty ? "Unsaved changes" : "Saved";
      badge.className = `se-badge ${isDirty ? "warn" : "ok"}`;
    }
    syncShellDirtyState();
  }

  function markDirty() {
    if (isHydrating) return;
    const current = getCurrentSignature();
    setDirty(Boolean(cleanSignature && current && current !== cleanSignature));
  }

  function markClean() {
    cleanSignature = getCurrentSignature();
    setDirty(false);
  }

  function confirmDiscard(message) {
    if (!isDirty) return true;
    return window.confirm(message || DIRTY_MESSAGE);
  }

  function setAuthGate(authenticated, email = "") {
    isAuthenticated = Boolean(authenticated);
    authenticatedEmail = isAuthenticated ? String(email || "") : "";
    const root = ensureRoot();
    root.dataset.authenticated = isAuthenticated ? "true" : "false";

    root.querySelectorAll("[data-auth-required='true']").forEach((el) => {
      el.style.display = isAuthenticated ? "" : "none";
    });

    const notice = getEl("se-auth-gate-notice");
    if (notice) notice.style.display = isAuthenticated ? "none" : "block";

    const authLabel = getEl("se-auth-label");
    if (authLabel) {
      authLabel.textContent = isAuthenticated ? `Authenticated: ${authenticatedEmail || "active session"}` : "Not authenticated";
      authLabel.className = `se-badge ${isAuthenticated ? "ok" : "warn"}`;
    }

    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setAuthState === "function") {
      window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: isAuthenticated, email: authenticatedEmail });
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
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      result = { ok: false, error: "non_json_response", status: response.status, text: await response.text() };
    }

    setOutput({ http_status: response.status, result });
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || result.error || `HTTP ${response.status}`);
    }
    return result;
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

  async function loadCustomers() {
    if (!isAuthenticated) return;
    setStatus("Loading organizations...");
    const result = await callCoreAdminAction("list_customers");
    customers = result.customers || [];
    const select = getEl("se-customer");
    if (select) {
      select.innerHTML = customers.map((c) => `<option value="${escapeHtml(c.customer_id)}">${escapeHtml(c.display_name || c.customer_key)} (${escapeHtml(c.customer_key || "")})</option>`).join("");
      if (!selectedCustomerId && customers[0]) selectedCustomerId = customers[0].customer_id;
      select.value = selectedCustomerId;
    }
    await loadMedia();
  }

  async function loadMedia() {
    if (!selectedCustomerId) {
      renderMediaList();
      return;
    }
    setStatus("Loading media...");
    const result = await callCoreAdminAction("list_gallery_media", {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      include_archived: showArchived,
    });
    mediaItems = result.media || [];
    renderMediaList();
    setStatus(`Loaded ${mediaItems.length} media item(s).`);
  }

  function mediaThumbHtml(item) {
    const url = item.public_url || (item.storage_path ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${item.storage_path}` : "");
    if (!url) return `<div class="se-thumb-fallback">IMG</div>`;
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.alt_text || item.caption || item.title || "Media image")}" loading="lazy" decoding="async">`;
  }

  function renderMediaList() {
    const list = getEl("se-media-list");
    if (!list) return;
    if (!mediaItems.length) {
      list.innerHTML = `<div class="se-empty">No media records yet. Drag a photo into the upload box to create one.</div>`;
      return;
    }
    list.innerHTML = mediaItems.map((item) => {
      const selected = String(item.gallery_media_id) === String(selectedMediaId);
      const archived = Boolean(item.archived_at) || item.status === "archived";
      return `<div class="se-media-row ${selected ? "is-selected" : ""} ${archived ? "is-archived" : ""}" data-media-id="${escapeHtml(item.gallery_media_id)}">
        <div class="se-media-thumb">${mediaThumbHtml(item)}</div>
        <div class="se-media-summary">
          <strong>${escapeHtml(item.title || item.caption || item.media_key || "Untitled media")}</strong>
          <div class="se-meta">${escapeHtml(item.visibility || "public")} · ${escapeHtml(item.status || "active")} ${item.is_featured ? "· featured" : ""}</div>
          <div class="se-meta">${escapeHtml(item.caption || "")}</div>
        </div>
        <div class="se-row-actions">
          <button class="se-button secondary" type="button" data-edit-media="${escapeHtml(item.gallery_media_id)}">Edit</button>
          ${archived
            ? `<button class="se-button secondary" type="button" data-restore-media="${escapeHtml(item.gallery_media_id)}">Restore</button>`
            : `<button class="se-button danger" type="button" data-archive-media="${escapeHtml(item.gallery_media_id)}">Archive</button>`}
        </div>
      </div>`;
    }).join("");
  }

  function resetForm() {
    if (!confirmDiscard("Clear the current media form and discard unsaved changes?")) return;
    selectedMediaId = "";
    isHydrating = true;
    ["se-title", "se-caption", "se-credit", "se-alt-text", "se-storage-path", "se-public-url"].forEach((id) => setValue(id, ""));
    setValue("se-visibility", "public");
    setValue("se-media-status", "active");
    setValue("se-sort-order", "100");
    setChecked("se-is-featured", false);
    const preview = getEl("se-upload-preview");
    if (preview) preview.innerHTML = `<span>Drop gallery image</span>`;
    isHydrating = false;
    markClean();
    renderMediaList();
    setStatus("Ready for new media upload.");
  }

  function fillForm(item) {
    if (!item) return;
    if (!confirmDiscard("Switch media records and discard unsaved changes?")) return;
    selectedMediaId = String(item.gallery_media_id || "");
    isHydrating = true;
    setValue("se-title", item.title || "");
    setValue("se-caption", item.caption || "");
    setValue("se-credit", item.credit || "");
    setValue("se-alt-text", item.alt_text || "");
    setValue("se-visibility", item.visibility || "public");
    setValue("se-media-status", item.status || "active");
    setValue("se-sort-order", item.sort_order ?? 100);
    setValue("se-storage-path", item.storage_path || "");
    setValue("se-public-url", item.public_url || "");
    setChecked("se-is-featured", item.is_featured === true);
    updatePreview(item.public_url || (item.storage_path ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${item.storage_path}` : ""));
    isHydrating = false;
    markClean();
    renderMediaList();
  }

  function updatePreview(url) {
    const preview = getEl("se-upload-preview");
    if (!preview) return;
    if (url) {
      preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" loading="lazy" decoding="async">`;
    } else {
      preview.innerHTML = `<span>Drop gallery image</span>`;
    }
  }

  function buildPayload() {
    return {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      gallery_media_id: selectedMediaId || undefined,
      title: getValue("se-title"),
      caption: getValue("se-caption"),
      credit: getValue("se-credit"),
      alt_text: getValue("se-alt-text"),
      visibility: getValue("se-visibility", "public"),
      status: getValue("se-media-status", "active"),
      is_featured: getChecked("se-is-featured"),
      sort_order: getValue("se-sort-order", "100"),
      storage_bucket: STORAGE_BUCKET,
      storage_path: getValue("se-storage-path"),
      public_url: getValue("se-public-url"),
      media_type: "image",
      metadata_json: { source: "media-library-admin", version: VERSION },
    };
  }

  async function saveMedia() {
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    const payload = buildPayload();
    if (!payload.storage_path && !payload.public_url) throw new Error("Upload an image before saving the media record.");
    setStatus("Saving media record...");
    const result = await callCoreAdminAction("upsert_gallery_media", payload);
    selectedMediaId = result.media?.gallery_media_id || selectedMediaId;
    await loadMedia();
    const saved = mediaItems.find((item) => item.gallery_media_id === selectedMediaId) || result.media;
    if (saved) fillForm(saved);
    markClean();
    setStatus("Media saved.");
  }

  async function uploadImage(file) {
    if (!file) return;
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    if (!file.type || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 16 * 1024 * 1024) throw new Error("Image is too large. Maximum is 16 MB.");

    const mediaId = selectedMediaId || crypto.randomUUID();
    const safeFile = sanitizeFileName(file.name);
    const storagePath = [
      "organizations",
      selectedCustomerId,
      "media",
      "gallery",
      mediaId,
      `${Date.now()}-${safeFile}`,
    ].join("/");

    setStatus("Uploading gallery image...");
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

    selectedMediaId = selectedMediaId || mediaId;
    isHydrating = true;
    setValue("se-storage-path", storagePath);
    setValue("se-public-url", publicUrl);
    if (!getValue("se-title")) setValue("se-title", file.name.replace(/\.[^.]+$/, ""));
    if (!getValue("se-alt-text")) setValue("se-alt-text", getValue("se-caption") || getValue("se-title") || "Gallery photo");
    updatePreview(publicUrl);
    isHydrating = false;
    markDirty();

    setStatus("Upload complete. Review fields, then click Save media.");
  }

  async function archiveMedia(mediaId) {
    if (!window.confirm("Archive this media item? It can be restored later.")) return;
    setStatus("Archiving media...");
    await callCoreAdminAction("archive_gallery_media", { customer_id: selectedCustomerId, organization_id: selectedCustomerId, gallery_media_id: mediaId });
    if (selectedMediaId === mediaId) resetForm();
    await loadMedia();
  }

  async function restoreMedia(mediaId) {
    setStatus("Restoring media...");
    await callCoreAdminAction("restore_gallery_media", { customer_id: selectedCustomerId, organization_id: selectedCustomerId, gallery_media_id: mediaId });
    await loadMedia();
  }

  async function copyOutput() {
    const text = getEl("se-output")?.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Backend result copied.");
    } catch {
      setStatus("Copy failed. Select the backend result manually.");
    }
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID}{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f5f7fb;min-height:100vh;padding:18px;box-sizing:border-box;}
        #${ROOT_ID} *{box-sizing:border-box;}
        .se-wrap{max-width:1240px;margin:0 auto;}
        .se-card{background:#fff;border:1px solid #d9e0ea;border-radius:14px;box-shadow:0 8px 28px rgba(23,32,51,.08);padding:18px;margin-bottom:14px;}
        .se-title{margin:0 0 6px 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;}
        .se-section-title{margin:0 0 14px 0;font-size:20px;line-height:1.2;}
        .se-subtitle{margin:0;color:#5d6b82;font-size:14px;line-height:1.45;}
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:800;padding:6px 10px;margin-top:10px;}
        .se-badge.warn{background:#fff6dd;color:#8a5b00;}.se-badge.ok{background:#eaf8ef;color:#1f6f3b;}
        .se-controls{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;align-items:end;}
        .se-grid{display:grid;grid-template-columns:420px minmax(0,1fr);gap:14px;align-items:start;}
        .se-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:900;color:#26344d;}
        .se-input,.se-select,.se-textarea{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-textarea{min-height:86px;resize:vertical;font-family:Arial,Helvetica,sans-serif;}
        .se-check{display:flex;align-items:center;gap:8px;font-weight:800;color:#26344d;font-size:13px;margin-bottom:12px;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:900;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}.se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}.se-button.full{width:100%;}
        .se-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:6px;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        .se-auth-gate{border-style:dashed;}
        .se-drop{border:2px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:12px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease;}
        .se-drop.dragover{border-color:#1f4f82;background:#f0f6fd;}.se-drop input{display:none;}
        .se-drop-preview{height:260px;border-radius:10px;background:#fff;border:1px solid #d9e0ea;display:grid;place-items:center;overflow:hidden;color:#5d6b82;font-weight:900;text-align:center;padding:10px;}
        .se-drop-preview img{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;display:block;}
        .se-media-row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #d9e0ea;border-radius:14px;padding:12px;margin-bottom:10px;background:#fbfcfe;}
        .se-media-row.is-selected{border-color:#1f4f82;background:#f4f8fd;}.se-media-row.is-archived{opacity:.75;background:#f7f2f2;}
        .se-media-thumb{width:84px;height:64px;border:1px solid #c7d2e2;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff;font-weight:900;color:#1f4f82;}
        .se-media-thumb img{width:100%;height:100%;object-fit:cover;display:block;}.se-thumb-fallback{font-size:18px;}
        .se-meta{font-size:12px;color:#5d6b82;margin-top:4px;word-break:break-word;}.se-media-summary{min-width:0;}.se-media-summary strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .se-row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
        @media(max-width:960px){.se-grid{grid-template-columns:1fr;}.se-controls,.se-form-grid{grid-template-columns:1fr;}.se-media-row{grid-template-columns:1fr;}.se-row-actions{justify-content:flex-start;}}
      </style>
      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Media Library</h1>
          <p class="se-subtitle">Admin-only upload and metadata manager for gallery photos and Home featured photos. Public renderers only receive public/active records.</p>
          <div class="se-actions">
            <div class="se-badge">ADMIN-PAGE-media-library-current.js | ${escapeHtml(VERSION)}</div>
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
          <p class="se-subtitle">Media Library controls are hidden until a valid platform-admin session is active.</p>
        </section>

        <section class="se-grid" data-auth-required="true" style="display:none;">
          <aside>
            <section class="se-card">
              <h2 class="se-section-title">Organization</h2>
              <label class="se-field"><span class="se-label">Organization</span><select id="se-customer" class="se-select"></select></label>
              <label class="se-check"><input id="se-show-archived" type="checkbox"><span>Show archived media</span></label>
              <button id="se-new-media" class="se-button full" type="button">New media record</button>
            </section>

            <section class="se-card">
              <h2 class="se-section-title">Media Records</h2>
              <div id="se-media-list"><div class="se-empty">Log in and select an organization.</div></div>
            </section>

            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <h2 class="se-section-title" style="margin:0;">Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary" type="button">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </aside>

          <section>
            <section class="se-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
                <h2 class="se-section-title" style="margin:0;">Gallery Media Record</h2>
                <div class="se-actions" style="margin-top:0;">
                  <button id="se-save-media" class="se-button" type="button">Save media</button>
                  <button id="se-clear-form" class="se-button secondary" type="button">Clear form</button>
                </div>
              </div>

              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Title</span><input id="se-title" class="se-input" type="text" placeholder="Short internal/public title"></label>
                <label class="se-field"><span class="se-label">Photo Credit</span><input id="se-credit" class="se-input" type="text" placeholder="Photo courtesy of..."></label>
              </div>
              <label class="se-field"><span class="se-label">Caption</span><textarea id="se-caption" class="se-textarea" placeholder="Caption shown on gallery/home if enabled."></textarea></label>
              <label class="se-field"><span class="se-label">Alt Text</span><input id="se-alt-text" class="se-input" type="text" placeholder="Accessibility description"></label>

              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Visibility</span><select id="se-visibility" class="se-select"><option value="public">Public</option><option value="members">Members</option><option value="admins">Admins</option><option value="hidden">Hidden</option></select></label>
                <label class="se-field"><span class="se-label">Status</span><select id="se-media-status" class="se-select"><option value="active">Active</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label>
                <label class="se-field"><span class="se-label">Sort Order</span><input id="se-sort-order" class="se-input" type="number" placeholder="100"></label>
                <label class="se-check" style="align-self:end;"><input id="se-is-featured" type="checkbox"><span>Featured photo candidate</span></label>
              </div>

              <div class="se-drop" id="se-media-drop">
                <input id="se-media-file" type="file" accept="image/*">
                <div id="se-upload-preview" class="se-drop-preview"><span>Drop gallery image</span></div>
                <div class="se-meta" style="margin-top:8px;">Uploads to structured Supabase Storage under organizations/{organization}/media/gallery/{media}/...</div>
              </div>
              <input id="se-storage-path" type="hidden">
              <input id="se-public-url" type="hidden">
            </section>
          </section>
        </section>
      </main>
    `;
  }

  function bindDirtyInputs() {
    ensureRoot().querySelectorAll("input, select, textarea").forEach((el) => {
      if (["se-email", "se-password", "se-show-archived", "se-media-file", "se-customer"].includes(el.id)) return;
      el.addEventListener("input", markDirty);
      el.addEventListener("change", markDirty);
    });
  }

  function bindDropZone() {
    const zone = getEl("se-media-drop");
    const input = getEl("se-media-file");
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
        await uploadImage(file);
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "image_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    input.addEventListener("change", async () => {
      try {
        const file = input.files && input.files[0];
        await uploadImage(file);
        input.value = "";
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "image_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  function bindEvents() {
    getEl("se-login")?.addEventListener("click", async () => {
      try {
        const email = getValue("se-email");
        const password = getValue("se-password");
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

    getEl("se-logout")?.addEventListener("click", async () => {
      try {
        if (!confirmDiscard("You have unsaved Media Library changes. Log out anyway?")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        mediaItems = [];
        selectedCustomerId = "";
        selectedMediaId = "";
        setAuthGate(false);
        setStatus("Logged out.");
        renderMediaList();
        markClean();
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    getEl("se-refresh")?.addEventListener("click", async () => {
      try {
        await initSupabase();
      } catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    getEl("se-customer")?.addEventListener("change", async (event) => {
      if (!confirmDiscard("Switch organizations and discard unsaved media changes?")) {
        event.target.value = selectedCustomerId;
        return;
      }
      selectedCustomerId = event.target.value;
      selectedMediaId = "";
      markClean();
      await loadMedia();
    });

    getEl("se-show-archived")?.addEventListener("change", async () => {
      showArchived = getChecked("se-show-archived");
      await loadMedia();
    });

    getEl("se-new-media")?.addEventListener("click", resetForm);
    getEl("se-clear-form")?.addEventListener("click", resetForm);
    getEl("se-save-media")?.addEventListener("click", async () => {
      try { await saveMedia(); } catch (error) { setStatus("Save failed."); setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) }); }
    });
    getEl("se-copy-output")?.addEventListener("click", copyOutput);

    getEl("se-media-list")?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editId = target.getAttribute("data-edit-media");
      const archiveId = target.getAttribute("data-archive-media");
      const restoreId = target.getAttribute("data-restore-media");
      try {
        if (editId) {
          const item = mediaItems.find((row) => String(row.gallery_media_id) === String(editId));
          if (item) fillForm(item);
        } else if (archiveId) {
          await archiveMedia(archiveId);
        } else if (restoreId) {
          await restoreMedia(restoreId);
        }
      } catch (error) {
        setStatus("Media action failed.");
        setOutput({ ok: false, event: "media_action_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  async function init() {
    renderShell();
    bindDirtyInputs();
    bindDropZone();
    bindEvents();
    markClean();

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.");
      setOutput({ ok: false, event: "init_failed", message: error instanceof Error ? error.message : String(error) });
      setAuthGate(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
