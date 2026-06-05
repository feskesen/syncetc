// ADMIN-PAGE-media-library-current.js
// Internal Version: 2026-06-05-002
// Purpose: Admin-only Media Library with batch image upload, YouTube video records, contain-style previews, and gallery/home featured metadata.
// Actions used: list_customers, list_gallery_media, upsert_gallery_media, archive_gallery_media, restore_gallery_media.

(function () {
  "use strict";

  const VERSION = "2026-06-05-002";
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
  let mediaFilter = "all";
  let pendingUploads = [];

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

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
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

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = n;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
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

  function extractYouTubeId(raw) {
    const value = cleanText(raw);
    if (!value) return "";
    const srcMatch = value.match(/src=["']([^"']+)["']/i);
    const cleaned = srcMatch && srcMatch[1] ? srcMatch[1] : value;

    try {
      const parsed = new URL(cleaned);
      const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (host === "youtu.be") return parts[0] || "";
      if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const v = parsed.searchParams.get("v");
        if (v) return v;
        const embedIndex = parts.indexOf("embed");
        if (embedIndex !== -1 && parts[embedIndex + 1]) return parts[embedIndex + 1];
        const shortsIndex = parts.indexOf("shorts");
        if (shortsIndex !== -1 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
        const liveIndex = parts.indexOf("live");
        if (liveIndex !== -1 && parts[liveIndex + 1]) return parts[liveIndex + 1];
      }
    } catch (_) {}

    const patterns = [
      /youtube\.com\/embed\/([^?&"'<>\/\s]+)/i,
      /youtube\.com\/watch\?[^"'<>]*v=([^?&"'<>\/\s]+)/i,
      /youtube\.com\/shorts\/([^?&"'<>\/\s]+)/i,
      /youtube\.com\/live\/([^?&"'<>\/\s]+)/i,
      /youtu\.be\/([^?&"'<>\/\s]+)/i,
    ];
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match && match[1]) return match[1];
    }
    return /^[a-zA-Z0-9_-]{8,20}$/.test(cleaned) ? cleaned : "";
  }

  function youtubeMeta(raw) {
    const id = extractYouTubeId(raw);
    if (!id) return { id: "", watchUrl: cleanText(raw), embedUrl: cleanText(raw), thumbUrl: "" };
    const encoded = encodeURIComponent(id);
    return {
      id,
      watchUrl: `https://www.youtube.com/watch?v=${encoded}`,
      embedUrl: `https://www.youtube.com/embed/${encoded}`,
      thumbUrl: `https://img.youtube.com/vi/${encoded}/hqdefault.jpg`,
    };
  }

  function sourceType() {
    return getValue("se-source-type", "image");
  }

  function getCurrentSignature() {
    return stableStringify({
      selected_media_id: selectedMediaId || "",
      source_type: sourceType(),
      title: getValue("se-title"),
      caption: getValue("se-caption"),
      credit: getValue("se-credit"),
      alt_text: getValue("se-alt-text"),
      youtube_url: getValue("se-youtube-url"),
      visibility: getValue("se-visibility", "public"),
      status: getValue("se-media-status", "active"),
      approval_status: getValue("se-approval-status", "approved"),
      is_featured: getChecked("se-is-featured"),
      sort_order: getValue("se-sort-order", "100"),
      storage_path: getValue("se-storage-path"),
      public_url: getValue("se-public-url"),
      pending_uploads: pendingUploads.map((u) => ({ id: u.mediaId, path: u.storagePath, name: u.originalName })),
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
    setDirty(current !== cleanSignature);
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
      mediaItems = [];
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

  function transformedImageUrl(item, width = 320) {
    const path = item.storage_path || "";
    const bucket = item.storage_bucket || STORAGE_BUCKET;
    if (path) {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const params = new URLSearchParams({ width: String(width), height: String(width), resize: "contain", quality: "70" });
      return `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${encoded}?${params.toString()}`;
    }
    return item.thumbnail_url || item.public_url || "";
  }

  function mediaThumbHtml(item) {
    const type = item.media_type || "image";
    if (type === "external_video") {
      const yt = youtubeMeta(item.external_url || item.public_url || item.external_id || "");
      const thumb = item.thumbnail_url || yt.thumbUrl;
      return `<div class="se-video-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(item.alt_text || item.caption || item.title || "Video thumbnail")}" loading="lazy" decoding="async">` : ""}<span class="se-play">▶</span></div>`;
    }
    const url = transformedImageUrl(item, 320);
    if (!url) return `<div class="se-thumb-fallback">IMG</div>`;
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.alt_text || item.caption || item.title || "Media image")}" loading="lazy" decoding="async">`;
  }

  function filteredMediaItems() {
    return mediaItems.filter((item) => {
      const archived = Boolean(item.archived_at) || item.status === "archived";
      if (mediaFilter === "images") return item.media_type === "image" && !archived;
      if (mediaFilter === "videos") return item.media_type === "external_video" || item.media_type === "video";
      if (mediaFilter === "featured") return item.is_featured && !archived;
      if (mediaFilter === "review") return (item.approval_status || "approved") === "pending" && !archived;
      if (mediaFilter === "archived") return archived || item.approval_status === "rejected";
      return true;
    });
  }

  function renderMediaList() {
    const list = getEl("se-media-list");
    if (!list) return;
    const rows = filteredMediaItems();
    if (!rows.length) {
      list.innerHTML = `<div class="se-empty">No media records match this filter.</div>`;
      return;
    }
    list.innerHTML = rows.map((item) => {
      const selected = String(item.gallery_media_id) === String(selectedMediaId);
      const archived = Boolean(item.archived_at) || item.status === "archived";
      const typeLabel = item.media_type === "external_video" ? "video" : (item.media_type || "image");
      return `<div class="se-media-row ${selected ? "is-selected" : ""} ${archived ? "is-archived" : ""}" data-media-id="${escapeHtml(item.gallery_media_id)}">
        <div class="se-media-thumb">${mediaThumbHtml(item)}</div>
        <div class="se-media-summary">
          <strong>${escapeHtml(item.title || item.caption || item.media_key || "Untitled media")}</strong>
          <div class="se-meta">${escapeHtml(typeLabel)} · ${escapeHtml(item.visibility || "public")} · ${escapeHtml(item.status || "active")} · ${escapeHtml(item.approval_status || "approved")} ${item.is_featured ? "· featured" : ""}</div>
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

  function clearPendingUploads() {
    pendingUploads.forEach((upload) => {
      try { URL.revokeObjectURL(upload.previewUrl); } catch (_) {}
    });
    pendingUploads = [];
  }

  function resetForm(force = false) {
    if (!force && !confirmDiscard("Clear the current media form and discard unsaved changes?")) return;
    selectedMediaId = "";
    isHydrating = true;
    clearPendingUploads();
    ["se-title", "se-caption", "se-credit", "se-alt-text", "se-storage-path", "se-public-url", "se-youtube-url"].forEach((id) => setValue(id, ""));
    setValue("se-source-type", "image");
    setValue("se-visibility", "public");
    setValue("se-media-status", "active");
    setValue("se-approval-status", "approved");
    setValue("se-sort-order", "100");
    setChecked("se-is-featured", false);
    updateSourceModeUI();
    updatePreview();
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
    clearPendingUploads();
    setValue("se-source-type", item.media_type === "external_video" ? "youtube" : "image");
    setValue("se-title", item.title || "");
    setValue("se-caption", item.caption || "");
    setValue("se-credit", item.credit || "");
    setValue("se-alt-text", item.alt_text || "");
    setValue("se-youtube-url", item.external_url || item.public_url || "");
    setValue("se-visibility", item.visibility || "public");
    setValue("se-media-status", item.status || "active");
    setValue("se-approval-status", item.approval_status || "approved");
    setValue("se-sort-order", item.sort_order ?? 100);
    setValue("se-storage-path", item.storage_path || "");
    setValue("se-public-url", item.public_url || "");
    setChecked("se-is-featured", item.is_featured === true);
    updateSourceModeUI();
    updatePreview(item);
    isHydrating = false;
    markClean();
    renderMediaList();
  }

  function updatePreview(itemOrUrl) {
    const preview = getEl("se-upload-preview");
    if (!preview) return;

    if (pendingUploads.length) {
      preview.innerHTML = `<div class="se-preview-grid">${pendingUploads.map((upload, index) => `<div class="se-preview-tile">
        <img src="${escapeHtml(upload.previewUrl)}" alt="${escapeHtml(upload.originalName)}">
        <button class="se-mini-remove" type="button" data-remove-pending="${index}" aria-label="Remove ${escapeHtml(upload.originalName)}">×</button>
        <div class="se-meta">${escapeHtml(upload.originalName)}<br>${escapeHtml(formatBytes(upload.size))}</div>
      </div>`).join("")}</div>`;
      return;
    }

    if (sourceType() === "youtube") {
      const yt = youtubeMeta(getValue("se-youtube-url"));
      if (yt.thumbUrl) {
        preview.innerHTML = `<div class="se-youtube-preview"><img src="${escapeHtml(yt.thumbUrl)}" alt="YouTube thumbnail" loading="lazy" decoding="async"><span class="se-play big">▶</span></div>`;
      } else {
        preview.innerHTML = `<span>Paste a YouTube URL to preview video thumbnail</span>`;
      }
      return;
    }

    let url = "";
    if (typeof itemOrUrl === "string") url = itemOrUrl;
    else if (itemOrUrl && typeof itemOrUrl === "object") url = transformedImageUrl(itemOrUrl, 900);
    else url = getValue("se-public-url");

    if (url) preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" loading="lazy" decoding="async">`;
    else preview.innerHTML = `<span>Drop one or more gallery images</span>`;
  }

  function updateSourceModeUI() {
    const type = sourceType();
    const imageBlock = getEl("se-image-source-block");
    const youtubeBlock = getEl("se-youtube-source-block");
    if (imageBlock) imageBlock.style.display = type === "image" ? "" : "none";
    if (youtubeBlock) youtubeBlock.style.display = type === "youtube" ? "" : "none";
    updatePreview();
  }

  function basePayload() {
    return {
      customer_id: selectedCustomerId,
      organization_id: selectedCustomerId,
      title: getValue("se-title"),
      caption: getValue("se-caption"),
      credit: getValue("se-credit"),
      alt_text: getValue("se-alt-text") || getValue("se-caption") || getValue("se-title"),
      visibility: getValue("se-visibility", "public"),
      status: getValue("se-media-status", "active"),
      approval_status: getValue("se-approval-status", "approved"),
      is_featured: getChecked("se-is-featured"),
      sort_order: getValue("se-sort-order", "100"),
      storage_bucket: STORAGE_BUCKET,
      metadata_json: { source: "media-library-admin", version: VERSION },
    };
  }

  function buildSinglePayload() {
    const base = basePayload();
    if (sourceType() === "youtube") {
      const yt = youtubeMeta(getValue("se-youtube-url"));
      if (!yt.id) throw new Error("Paste a valid YouTube URL, embed URL, Shorts URL, or video ID.");
      return {
        ...base,
        gallery_media_id: selectedMediaId || undefined,
        media_type: "external_video",
        source_type: "youtube",
        external_provider: "youtube",
        external_id: yt.id,
        external_url: yt.watchUrl,
        public_url: yt.watchUrl,
        thumbnail_url: yt.thumbUrl,
        metadata_json: { ...base.metadata_json, youtube_embed_url: yt.embedUrl, youtube_watch_url: yt.watchUrl },
      };
    }

    return {
      ...base,
      gallery_media_id: selectedMediaId || undefined,
      media_type: "image",
      source_type: "supabase",
      storage_path: getValue("se-storage-path"),
      public_url: getValue("se-public-url"),
    };
  }

  async function saveMedia() {
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    setStatus("Saving media...");

    if (sourceType() === "image" && pendingUploads.length && !selectedMediaId) {
      const payloads = pendingUploads.map((upload, index) => ({
        ...basePayload(),
        requested_gallery_media_id: upload.mediaId,
        media_type: "image",
        source_type: "supabase",
        title: getValue("se-title") || upload.originalName.replace(/\.[^.]+$/, ""),
        alt_text: getValue("se-alt-text") || getValue("se-caption") || upload.originalName.replace(/\.[^.]+$/, ""),
        storage_path: upload.storagePath,
        public_url: upload.publicUrl,
        sort_order: Number(getValue("se-sort-order", "100")) + index,
        metadata_json: { ...basePayload().metadata_json, original_file_name: upload.originalName, batch_upload: pendingUploads.length > 1 },
      }));
      const saved = [];
      for (const payload of payloads) {
        const result = await callCoreAdminAction("upsert_gallery_media", payload);
        saved.push(result.media);
      }
      await loadMedia();
      resetForm(true);
      setStatus(`Saved ${saved.length} media item(s).`);
      return;
    }

    const payload = buildSinglePayload();
    if (payload.media_type === "image" && !payload.storage_path && !payload.public_url) throw new Error("Upload an image before saving the media record.");
    const result = await callCoreAdminAction("upsert_gallery_media", payload);
    selectedMediaId = result.media?.gallery_media_id || selectedMediaId;
    await loadMedia();
    resetForm(true);
    setStatus("Media saved and form cleared.");
  }

  async function uploadImages(filesLike) {
    if (!selectedCustomerId) throw new Error("Select an organization first.");
    const files = Array.from(filesLike || []).filter(Boolean);
    if (!files.length) return;
    if (sourceType() !== "image") setValue("se-source-type", "image");
    updateSourceModeUI();

    if (selectedMediaId && files.length > 1) throw new Error("When editing an existing media record, upload only one replacement image.");

    for (const file of files) {
      if (!file.type || !file.type.startsWith("image/")) throw new Error(`${file.name || "File"} is not an image file.`);
      if (file.size > 16 * 1024 * 1024) throw new Error(`${file.name || "Image"} is too large. Maximum is 16 MB.`);
    }

    setStatus(`Uploading ${files.length} image(s)...`);
    const uploaded = [];
    let count = 0;
    for (const file of files) {
      count += 1;
      const mediaId = selectedMediaId || crypto.randomUUID();
      const safeFile = sanitizeFileName(file.name);
      const storagePath = ["organizations", selectedCustomerId, "media", "gallery", mediaId, `${Date.now()}-${count}-${safeFile}`].join("/");
      setStatus(`Uploading ${count} of ${files.length}: ${file.name}`);
      const { error: uploadError } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = publicData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
      uploaded.push({
        mediaId,
        storagePath,
        publicUrl,
        originalName: file.name || safeFile,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (selectedMediaId && uploaded[0]) {
      isHydrating = true;
      setValue("se-storage-path", uploaded[0].storagePath);
      setValue("se-public-url", uploaded[0].publicUrl);
      if (!getValue("se-title")) setValue("se-title", uploaded[0].originalName.replace(/\.[^.]+$/, ""));
      if (!getValue("se-alt-text")) setValue("se-alt-text", getValue("se-caption") || getValue("se-title") || "Gallery photo");
      clearPendingUploads();
      pendingUploads = uploaded;
      isHydrating = false;
    } else {
      pendingUploads.push(...uploaded);
      if (!getValue("se-title") && pendingUploads.length === 1) setValue("se-title", pendingUploads[0].originalName.replace(/\.[^.]+$/, ""));
      if (!getValue("se-alt-text")) setValue("se-alt-text", getValue("se-caption") || getValue("se-title") || "Gallery photo");
    }
    updatePreview();
    markDirty();
    setStatus(`Uploaded ${uploaded.length} image(s). Review shared fields, then click Save media.`);
  }

  async function archiveMedia(mediaId) {
    if (!window.confirm("Archive this media item? It can be restored later.")) return;
    setStatus("Archiving media...");
    await callCoreAdminAction("archive_gallery_media", { customer_id: selectedCustomerId, organization_id: selectedCustomerId, gallery_media_id: mediaId });
    if (selectedMediaId === mediaId) resetForm(true);
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
        .se-badge{display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:800;padding:6px 10px;}
        .se-badge.ok{background:#e7f6ec;color:#165a2f}.se-badge.warn{background:#fff7e5;color:#8a5c00}.se-badge.danger{background:#fdeaea;color:#9b1c1c}
        .se-grid{display:grid;grid-template-columns:420px minmax(0,1fr);gap:14px;align-items:start;}
        .se-controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto auto auto;gap:10px;align-items:end;}
        .se-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .se-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}
        .se-label{font-size:13px;font-weight:900;color:#26344d;}
        .se-input,.se-select,.se-textarea{width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033;}
        .se-textarea{min-height:86px;resize:vertical;font-family:Arial,Helvetica,sans-serif;}
        .se-check{display:flex;align-items:center;gap:8px;font-weight:800;color:#26344d;font-size:13px;margin-bottom:12px;}
        .se-button{border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:900;cursor:pointer;white-space:nowrap;}
        .se-button.secondary{background:#fff;color:#1f4f82;}.se-button.danger{background:#fff;color:#9b1c1c;border-color:#9b1c1c;}.se-button.full{width:100%;}
        .se-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:6px;}
        .se-tab{border:1px solid #c7d2e2;background:#fff;color:#1f4f82;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;cursor:pointer;}.se-tab.is-active{background:#1f4f82;color:#fff;border-color:#1f4f82;}
        .se-status{margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap;}
        .se-output{margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:120px;max-height:300px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45;}
        .se-empty{border:1px dashed #c7d2e2;border-radius:12px;padding:16px;color:#5d6b82;background:#fbfcfe;}
        .se-auth-gate{border-style:dashed;}
        .se-drop{border:2px dashed #9fb2cc;border-radius:14px;background:#f7f9fc;padding:12px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease;}
        .se-drop.dragover{border-color:#1f4f82;background:#f0f6fd;}.se-drop input{display:none;}
        .se-drop-preview{min-height:260px;border-radius:10px;background:#fff;border:1px solid #d9e0ea;display:grid;place-items:center;overflow:hidden;color:#5d6b82;font-weight:900;text-align:center;padding:10px;}
        .se-drop-preview>img{width:auto;height:auto;max-width:100%;max-height:360px;object-fit:contain;display:block;}
        .se-preview-grid{width:100%;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;align-items:stretch;}
        .se-preview-tile{position:relative;border:1px solid #d9e0ea;background:#fff;border-radius:12px;padding:8px;min-height:156px;display:grid;grid-template-rows:110px auto;gap:6px;}
        .se-preview-tile img{width:100%;height:110px;object-fit:contain;background:#f6f9fc;border-radius:8px;display:block;}
        .se-mini-remove{position:absolute;top:5px;right:5px;width:26px;height:26px;border-radius:999px;border:0;background:#9b1c1c;color:#fff;font-weight:900;cursor:pointer;}
        .se-youtube-preview{position:relative;width:100%;min-height:220px;display:grid;place-items:center;background:#0f172a;border-radius:10px;overflow:hidden;}.se-youtube-preview img{max-width:100%;max-height:360px;object-fit:contain;}
        .se-media-row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #d9e0ea;border-radius:14px;padding:12px;margin-bottom:10px;background:#fbfcfe;}
        .se-media-row.is-selected{border-color:#1f4f82;background:#f4f8fd;}.se-media-row.is-archived{opacity:.75;background:#f7f2f2;}
        .se-media-thumb{width:84px;height:64px;border:1px solid #c7d2e2;border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff;font-weight:900;color:#1f4f82;position:relative;}
        .se-media-thumb img{width:100%;height:100%;object-fit:contain;display:block;background:#fff;}.se-thumb-fallback{font-size:18px;}
        .se-video-thumb{position:relative;width:100%;height:100%;display:grid;place-items:center;background:#0f172a;}.se-video-thumb img{object-fit:contain;}.se-play{position:absolute;inset:auto;display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:rgba(18,54,90,.85);color:#fff;font-size:15px;}.se-play.big{width:58px;height:58px;font-size:24px;}
        .se-meta{font-size:12px;color:#5d6b82;margin-top:4px;word-break:break-word;}.se-media-summary{min-width:0;}.se-media-summary strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .se-row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
        @media(max-width:960px){.se-grid{grid-template-columns:1fr;}.se-controls,.se-form-grid{grid-template-columns:1fr;}.se-media-row{grid-template-columns:1fr;}.se-row-actions{justify-content:flex-start;}}
      </style>
      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Media Library</h1>
          <p class="se-subtitle">Admin-only manager for gallery photos, Home featured photos, and YouTube video records. Public renderers only receive public/active/approved records.</p>
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
              <div class="se-actions">
                <button class="se-tab is-active" data-filter="all" type="button">All</button>
                <button class="se-tab" data-filter="images" type="button">Images</button>
                <button class="se-tab" data-filter="videos" type="button">Videos</button>
                <button class="se-tab" data-filter="featured" type="button">Featured</button>
                <button class="se-tab" data-filter="review" type="button">Review</button>
                <button class="se-tab" data-filter="archived" type="button">Archived</button>
              </div>
              <button id="se-new-media" class="se-button full" type="button" style="margin-top:12px;">New media record</button>
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

              <label class="se-field"><span class="se-label">Source Type</span><select id="se-source-type" class="se-select"><option value="image">Image upload</option><option value="youtube">YouTube video</option></select></label>

              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Title</span><input id="se-title" class="se-input" type="text" placeholder="Optional short title"></label>
                <label class="se-field"><span class="se-label">Credit / Attribution</span><input id="se-credit" class="se-input" type="text" placeholder="Photo/video courtesy of..."></label>
              </div>
              <label class="se-field"><span class="se-label">Caption</span><textarea id="se-caption" class="se-textarea" placeholder="Caption shown on gallery/home if enabled. For batch uploads, this caption applies to every uploaded photo."></textarea></label>
              <label class="se-field"><span class="se-label">Alt Text</span><input id="se-alt-text" class="se-input" type="text" placeholder="Accessibility description. Leave blank to derive from caption/title."></label>

              <div class="se-form-grid">
                <label class="se-field"><span class="se-label">Visibility</span><select id="se-visibility" class="se-select"><option value="public">Public</option><option value="members">Members</option><option value="admins">Admins</option><option value="hidden">Hidden</option></select></label>
                <label class="se-field"><span class="se-label">Status</span><select id="se-media-status" class="se-select"><option value="active">Active</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label>
                <label class="se-field"><span class="se-label">Approval</span><select id="se-approval-status" class="se-select"><option value="approved">Approved</option><option value="pending">Pending review</option><option value="rejected">Rejected</option></select></label>
                <label class="se-field"><span class="se-label">Sort Order</span><input id="se-sort-order" class="se-input" type="number" placeholder="100"></label>
              </div>
              <label class="se-check"><input id="se-is-featured" type="checkbox"><span>Featured photo candidate for Home page pool (images only)</span></label>

              <div id="se-image-source-block">
                <div class="se-drop" id="se-media-drop">
                  <input id="se-media-file" type="file" accept="image/*" multiple>
                  <div id="se-upload-preview" class="se-drop-preview"><span>Drop one or more gallery images</span></div>
                  <div class="se-meta" style="margin-top:8px;">Uploads to structured Supabase Storage under organizations/{organization}/media/gallery/{media}/...</div>
                </div>
              </div>

              <div id="se-youtube-source-block" style="display:none;">
                <label class="se-field"><span class="se-label">YouTube URL / Embed URL / Video ID</span><input id="se-youtube-url" class="se-input" type="text" placeholder="https://www.youtube.com/watch?v=..."></label>
                <div id="se-upload-preview-youtube" class="se-meta">Paste a YouTube link and save. The public gallery will show a play card and open the embedded player.</div>
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
      el.addEventListener("input", () => { if (el.id === "se-youtube-url") updatePreview(); markDirty(); });
      el.addEventListener("change", () => { if (el.id === "se-source-type") updateSourceModeUI(); markDirty(); });
    });
  }

  function bindDropZone() {
    const zone = getEl("se-media-drop");
    const input = getEl("se-media-file");
    if (!zone || !input) return;

    zone.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("[data-remove-pending]")) return;
      if (event.target === input) return;
      input.click();
    });

    zone.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeIndex = target.getAttribute("data-remove-pending");
      if (removeIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(removeIndex);
      const removed = pendingUploads.splice(index, 1)[0];
      if (removed) {
        try { URL.revokeObjectURL(removed.previewUrl); } catch (_) {}
      }
      updatePreview();
      markDirty();
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
        await uploadImages(event.dataTransfer?.files || []);
      } catch (error) {
        setStatus("Image upload failed.");
        setOutput({ ok: false, event: "image_upload_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    input.addEventListener("change", async () => {
      try {
        await uploadImages(input.files || []);
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
        resetForm(true);
        setAuthGate(false);
        setStatus("Logged out.");
        renderMediaList();
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    getEl("se-refresh")?.addEventListener("click", async () => {
      try { await initSupabase(); } catch (error) { setStatus("Refresh failed."); setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) }); }
    });

    getEl("se-customer")?.addEventListener("change", async (event) => {
      if (!confirmDiscard("Switch organizations and discard unsaved media changes?")) {
        event.target.value = selectedCustomerId;
        return;
      }
      selectedCustomerId = event.target.value;
      resetForm(true);
      await loadMedia();
    });

    getEl("se-show-archived")?.addEventListener("change", async () => {
      showArchived = getChecked("se-show-archived");
      await loadMedia();
    });

    ensureRoot().querySelectorAll(".se-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        mediaFilter = btn.getAttribute("data-filter") || "all";
        ensureRoot().querySelectorAll(".se-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderMediaList();
      });
    });

    getEl("se-new-media")?.addEventListener("click", () => resetForm(false));
    getEl("se-clear-form")?.addEventListener("click", () => resetForm(false));
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
    updateSourceModeUI();
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
