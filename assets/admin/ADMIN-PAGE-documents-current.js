// ADMIN-PAGE-documents-current.js
// Internal Version: 2026-06-05-002
// Purpose: Platform-admin Documents / Resources manager with explicit create/edit states, readonly slugs, version history, protected storage uploads, previews, and clearer record selection.
// Actions used: list_customers, list_documents, upsert_document, archive_document, restore_document, list_document_versions, create_document_version, approve_document_version, publish_document_version, reject_document_version, get_document_download_url.

(function () {
  "use strict";

  const VERSION = "2026-06-05-002";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const STORAGE_BUCKET = "core-documents";
  const ROOT_ID = "syncetc-documents-admin-root";
  const DIRTY_MESSAGE = "You have unsaved Documents / Resources changes. Leave anyway?";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";
  let customers = [];
  let selectedCustomerId = "";
  let documents = [];
  let versions = [];
  let selectedDocumentId = "";
  let editorMode = "idle"; // idle | new | edit
  let pendingFile = null;
  let isDirty = false;
  let isHydrating = false;
  let includeArchived = true;
  let lastStatus = "Ready.";
  let lastOutput = "";
  let previewState = { isOpen: false, url: "", title: "" };

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

  function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function getEl(id) { return document.getElementById(id); }
  function getValue(id, fallback = "") { const el = getEl(id); return el ? el.value : fallback; }
  function setValue(id, value) { const el = getEl(id); if (el) el.value = value ?? ""; }

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  function customerLabel(customer) {
    const name = cleanText(customer.display_name || customer.legal_name || "Unnamed organization");
    const key = cleanText(customer.customer_key || customer.organization_key || customer.vertical || "");
    return key ? `${name} (${key})` : name;
  }

  function sanitizeFileName(name) {
    const base = String(name || "document").split(/[\\/]/).pop() || "document";
    const dot = base.lastIndexOf(".");
    const rawName = dot > 0 ? base.slice(0, dot) : base;
    const rawExt = dot > 0 ? base.slice(dot + 1) : "";
    const safeName = normalizeKey(rawName) || "document";
    const safeExt = rawExt.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
    return safeExt ? `${safeName}.${safeExt}` : safeName;
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = n;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatDate(value) {
    if (!value) return "";
    try { return new Date(value).toLocaleString(); } catch (_) { return cleanText(value); }
  }

  function statusPill(label, tone) {
    return `<span class="sd-pill ${tone || "neutral"}">${escapeHtml(label)}</span>`;
  }

  function setStatus(message) {
    lastStatus = message || "";
    const el = getEl("sd-status");
    if (el) el.textContent = lastStatus;
  }

  function setOutput(value) {
    lastOutput = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const el = getEl("sd-output");
    if (el) el.textContent = lastOutput;
  }

  function setShellDirty(value) {
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setDirty(value, DIRTY_MESSAGE);
  }

  function markDirty() {
    if (isHydrating || editorMode === "idle") return;
    isDirty = true;
    setShellDirty(true);
    renderDirty();
  }

  function markClean() {
    isDirty = false;
    setShellDirty(false);
    renderDirty();
  }

  function renderDirty() {
    const el = getEl("sd-dirty");
    if (!el) return;
    el.textContent = isDirty ? "Unsaved document changes" : "Saved / clean";
    el.className = isDirty ? "sd-dirty is-dirty" : "sd-dirty";
  }

  function confirmDiscard(message) {
    if (!isDirty) return true;
    return window.confirm(message || DIRTY_MESSAGE);
  }

  function currentDocument() {
    return documents.find((doc) => String(doc.document_id) === String(selectedDocumentId)) || null;
  }

  function isCurrentDocumentArchived() {
    const doc = currentDocument();
    return Boolean(doc && (doc.archived_at || doc.status === "archived"));
  }

  function bindDirty(root) {
    root.querySelectorAll(".sd-editor input:not([readonly]), .sd-editor textarea, .sd-editor select").forEach((el) => {
      if (el.dataset.dirtyBound === "true") return;
      el.dataset.dirtyBound = "true";
      el.addEventListener("input", markDirty);
      el.addEventListener("change", markDirty);
    });
  }

  async function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase JS did not load.");
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return supabaseClient;
  }

  async function refreshAuth() {
    const client = await ensureSupabase();
    const { data } = await client.auth.getSession();
    const session = data?.session || null;
    isAuthenticated = Boolean(session?.access_token);
    authenticatedEmail = session?.user?.email || "";
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: isAuthenticated, email: authenticatedEmail });
    return session;
  }

  async function callCoreAdminAction(action, payload = {}) {
    const session = await refreshAuth();
    if (!session?.access_token) throw new Error("Please log in before using Documents / Resources.");
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({ ok: false, message: "Invalid JSON response." }));
    setOutput({ http_status: response.status, result });
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `Action failed: ${action}`);
    return result;
  }

  async function login() {
    await ensureSupabase();
    const email = getValue("sd-login-email");
    const password = getValue("sd-login-password");
    if (!email || !password) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshAuth();
    await loadCustomers();
  }

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    isAuthenticated = false;
    authenticatedEmail = "";
    selectedCustomerId = "";
    documents = [];
    versions = [];
    selectedDocumentId = "";
    editorMode = "idle";
    pendingFile = null;
    markClean();
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: false, email: "" });
    render();
  }

  async function loadCustomers() {
    const result = await callCoreAdminAction("list_customers", {});
    customers = Array.isArray(result.customers) ? result.customers : [];
    if (!selectedCustomerId && customers[0]) selectedCustomerId = String(customers[0].customer_id);
    render();
    if (selectedCustomerId) await loadDocuments(false);
  }

  async function loadDocuments(preserveSelected = true) {
    if (!selectedCustomerId) return;
    const result = await callCoreAdminAction("list_documents", { organization_id: selectedCustomerId, include_archived: includeArchived });
    documents = Array.isArray(result.documents) ? result.documents : [];
    if (!preserveSelected || !documents.some((doc) => String(doc.document_id) === String(selectedDocumentId))) {
      selectedDocumentId = "";
      versions = [];
      editorMode = "idle";
      pendingFile = null;
      markClean();
    }
    renderDocumentList();
    if (editorMode === "edit" && selectedDocumentId) await loadVersions();
    setStatus(`Loaded ${documents.length} document record${documents.length === 1 ? "" : "s"}.`);
  }

  async function loadVersions() {
    versions = [];
    if (!selectedCustomerId || !selectedDocumentId) { renderVersions(); return; }
    const result = await callCoreAdminAction("list_document_versions", { organization_id: selectedCustomerId, document_id: selectedDocumentId });
    versions = Array.isArray(result.versions) ? result.versions : [];
    renderVersions();
  }

  function openNewDocument() {
    if (!confirmDiscard("Discard unsaved document changes and start a new document?")) return;
    selectedDocumentId = "";
    versions = [];
    pendingFile = null;
    editorMode = "new";
    markClean();
    render();
    hydrateDocument(null);
    setStatus("Creating a new document. Enter details, optionally upload a file, then save.");
  }

  function closeEditor(message) {
    selectedDocumentId = "";
    versions = [];
    pendingFile = null;
    editorMode = "idle";
    markClean();
    render();
    if (message) setStatus(message);
  }

  function cancelEditor() {
    if (!confirmDiscard("Discard unsaved document changes and close the editor?")) return;
    closeEditor("Editor closed. Select a document to edit or click New Document.");
  }

  async function selectDocument(id) {
    if (String(id) === String(selectedDocumentId) && editorMode === "edit") return;
    if (!confirmDiscard("Discard unsaved document changes and switch records?")) return;
    selectedDocumentId = String(id || "");
    editorMode = "edit";
    pendingFile = null;
    markClean();
    render();
    hydrateDocument(currentDocument());
    await loadVersions();
    const doc = currentDocument();
    setStatus(doc ? `Editing: ${doc.title}` : "Document selected.");
  }

  function updateSlugPreview() {
    const doc = currentDocument();
    const value = editorMode === "edit" && doc ? doc.document_key : normalizeKey(getValue("sd-title"));
    setValue("sd-document-key", value);
  }

  function hydrateDocument(doc) {
    isHydrating = true;
    setValue("sd-title", doc?.title || "");
    setValue("sd-document-key", doc?.document_key || "");
    setValue("sd-category", doc?.category || "General");
    setValue("sd-visibility", doc?.visibility || "members");
    setValue("sd-sort-order", doc?.sort_order ?? 100);
    setValue("sd-description", doc?.description || "");
    setValue("sd-version-status", "draft");
    setValue("sd-publish-now", "false");
    setValue("sd-version-notes", "");
    pendingFile = null;
    renderPendingFile();
    updateSlugPreview();
    isHydrating = false;
    markClean();
  }

  function documentPayload(documentId) {
    const title = cleanText(getValue("sd-title"));
    if (!title) throw new Error("Document title is required.");
    const existing = currentDocument();
    const key = existing?.document_key || normalizeKey(title);
    if (!key) throw new Error("Document key could not be generated from the title.");
    return {
      organization_id: selectedCustomerId,
      document_id: existing ? selectedDocumentId : undefined,
      requested_document_id: existing ? undefined : documentId,
      title,
      document_key: key,
      category: getValue("sd-category") || "General",
      visibility: getValue("sd-visibility") || "members",
      sort_order: Number(getValue("sd-sort-order") || 100),
      description: getValue("sd-description"),
    };
  }

  async function saveDocument() {
    if (!selectedCustomerId) throw new Error("Select a customer/organization first.");
    if (isCurrentDocumentArchived()) throw new Error("Archived documents must be restored before they can be edited.");
    const targetDocumentId = selectedDocumentId || crypto.randomUUID();
    setStatus("Saving document metadata...");
    const result = await callCoreAdminAction("upsert_document", documentPayload(targetDocumentId));
    const document = result.document;
    selectedDocumentId = String(document.document_id);

    if (pendingFile) {
      await uploadPendingFileAndCreateVersion(document);
    }

    pendingFile = null;
    await loadDocuments(false);
    closeEditor("Document saved. Select a document to edit or click New Document.");
  }

  async function uploadPendingFileAndCreateVersion(document) {
    const file = pendingFile;
    if (!file) return;
    const safeFile = sanitizeFileName(file.name);
    const storagePath = ["organizations", selectedCustomerId, "documents", document.document_id, `${Date.now()}-${safeFile}`].join("/");
    setStatus("Uploading document file to protected storage...");
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    setStatus("Creating document version...");
    await callCoreAdminAction("create_document_version", {
      organization_id: selectedCustomerId,
      document_id: document.document_id,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size || 0,
      version_status: getValue("sd-version-status") || "draft",
      publish_now: getValue("sd-publish-now") === "true",
      notes: getValue("sd-version-notes"),
    });
  }

  async function archiveOrRestoreDocument(archive) {
    if (!selectedCustomerId || !selectedDocumentId) throw new Error("Select a document first.");
    const doc = currentDocument();
    const verb = archive ? "archive" : "restore";
    if (!window.confirm(`Really ${verb} this document record?`)) return;
    setStatus(`${archive ? "Archiving" : "Restoring"} document...`);
    await callCoreAdminAction(archive ? "archive_document" : "restore_document", { organization_id: selectedCustomerId, document_id: selectedDocumentId });
    await loadDocuments(false);
    closeEditor(`Document ${archive ? "archived" : "restored"}.`);
  }

  async function setVersionStatus(versionId, actionName, promptText) {
    if (!versionId) throw new Error("Missing version ID.");
    if (promptText && !window.confirm(promptText)) return;
    setStatus("Updating version status...");
    await callCoreAdminAction(actionName, { organization_id: selectedCustomerId, version_id: versionId });
    await loadDocuments(true);
    await loadVersions();
    setStatus("Version updated.");
  }

  async function getVersionAccess(versionId) {
    const result = await callCoreAdminAction("get_document_download_url", { organization_id: selectedCustomerId, version_id: versionId });
    if (!result.signed_url && !result.preview_signed_url && !result.download_signed_url) throw new Error("No signed document URL was returned.");
    return result;
  }

  async function previewVersion(versionId) {
    const result = await getVersionAccess(versionId);
    const version = result.version || versions.find((v) => String(v.version_id) === String(versionId)) || {};
    previewState = {
      isOpen: true,
      url: result.preview_signed_url || result.signed_url || result.download_signed_url,
      title: `${version.original_file_name || "Document preview"}`,
    };
    renderPreviewModal();
  }

  async function downloadVersion(versionId) {
    const result = await getVersionAccess(versionId);
    window.open(result.download_signed_url || result.signed_url || result.preview_signed_url, "_blank", "noopener,noreferrer");
  }

  function closePreview() {
    previewState = { isOpen: false, url: "", title: "" };
    renderPreviewModal();
  }

  function setPendingFile(file) {
    if (!file) return;
    pendingFile = file;
    renderPendingFile();
    markDirty();
  }

  function renderPendingFile() {
    const el = getEl("sd-pending-file");
    if (!el) return;
    if (!pendingFile) {
      el.innerHTML = `<span class="sd-muted">No file selected. Drag a file here or click to choose one.</span>`;
      return;
    }
    el.innerHTML = `
      <div class="sd-file-chip">
        <strong>${escapeHtml(pendingFile.name)}</strong>
        <span>${escapeHtml(pendingFile.type || "application/octet-stream")} • ${escapeHtml(formatBytes(pendingFile.size))}</span>
        <button id="sd-clear-pending-file" type="button" class="sd-mini-button">Remove</button>
      </div>`;
    getEl("sd-clear-pending-file")?.addEventListener("click", (event) => { event.stopPropagation(); pendingFile = null; renderPendingFile(); markDirty(); });
  }

  function renderDocumentList() {
    const list = getEl("sd-document-list");
    if (!list) return;
    if (!documents.length) {
      list.innerHTML = `<div class="sd-empty">No documents yet. Click <strong>New Document</strong> to create the first record.</div>`;
      return;
    }
    const grouped = documents.reduce((acc, doc) => {
      const key = cleanText(doc.category || "General") || "General";
      (acc[key] ||= []).push(doc);
      return acc;
    }, {});
    list.innerHTML = Object.keys(grouped).sort().map((category) => `
      <details class="sd-doc-group" open>
        <summary>${escapeHtml(category)} <span>${grouped[category].length}</span></summary>
        ${grouped[category].map((doc) => {
          const archived = doc.archived_at || doc.status === "archived";
          const selected = String(doc.document_id) === String(selectedDocumentId) && editorMode === "edit";
          const visibilityTone = doc.visibility === "public" ? "green" : doc.visibility === "members" ? "blue" : doc.visibility === "internal" ? "red" : "amber";
          return `<button type="button" class="sd-doc-row ${selected ? "selected" : ""} ${archived ? "archived" : ""}" data-doc-id="${escapeHtml(doc.document_id)}">
            <span class="sd-doc-row-main"><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.description || doc.document_key || "No description")}</small></span>
            <span class="sd-row-pills">${statusPill(doc.visibility, visibilityTone)} ${statusPill(archived ? "archived" : "active", archived ? "red" : "green")} ${doc.published_version_number ? statusPill(`v${doc.published_version_number} live`, "blue") : statusPill("no live version", "neutral")}</span>
          </button>`;
        }).join("")}
      </details>`).join("");
    list.querySelectorAll("[data-doc-id]").forEach((btn) => btn.addEventListener("click", () => selectDocument(btn.dataset.docId).catch(showError)));
  }

  function versionActionLabel(version) {
    const status = String(version.version_status || "");
    if (status === "superseded") return "Make Live Again";
    if (status === "published") return "Current Live";
    return "Publish / Make Live";
  }

  function renderVersions() {
    const wrap = getEl("sd-version-list");
    if (!wrap) return;
    if (!selectedDocumentId) {
      wrap.innerHTML = `<div class="sd-empty">Select or save a document to see versions.</div>`;
      return;
    }
    if (!versions.length) {
      wrap.innerHTML = `<div class="sd-empty">No uploaded versions yet. Choose a file and save the document to create v1.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="sd-version-help">Version history is append-only. Publishing a prior version makes it the current live file again; it does not delete later versions.</div>
      ${versions.map((v) => {
        const status = String(v.version_status || "draft");
        const tone = status === "published" ? "green" : status === "superseded" ? "neutral" : status === "rejected" ? "red" : status === "approved" ? "blue" : "amber";
        const publishLabel = versionActionLabel(v);
        return `<article class="sd-version-row ${status === "published" ? "is-live" : ""}">
          <div>
            <div class="sd-version-head"><strong>v${escapeHtml(v.version_number)} ${escapeHtml(v.version_label || "")}</strong>${statusPill(status === "published" ? "current live" : status, tone)}</div>
            <div class="sd-muted">${escapeHtml(v.original_file_name || "file")} • ${escapeHtml(formatBytes(v.file_size_bytes))} • uploaded ${escapeHtml(formatDate(v.created_at))}</div>
            ${v.notes ? `<div class="sd-note">${escapeHtml(v.notes)}</div>` : ""}
          </div>
          <div class="sd-version-actions">
            <button type="button" class="sd-mini-button" data-preview-version="${escapeHtml(v.version_id)}">Preview</button>
            <button type="button" class="sd-mini-button" data-download-version="${escapeHtml(v.version_id)}">Download</button>
            ${status !== "approved" && status !== "published" && status !== "superseded" ? `<button type="button" class="sd-mini-button" data-approve-version="${escapeHtml(v.version_id)}">Approve</button>` : ""}
            ${status !== "published" ? `<button type="button" class="sd-mini-button primary" data-publish-version="${escapeHtml(v.version_id)}">${escapeHtml(publishLabel)}</button>` : `<span class="sd-live-note">Live</span>`}
            ${!["rejected", "published", "superseded"].includes(status) ? `<button type="button" class="sd-mini-button danger" data-reject-version="${escapeHtml(v.version_id)}">Reject</button>` : ""}
          </div>
        </article>`;
      }).join("")}`;
    wrap.querySelectorAll("[data-preview-version]").forEach((btn) => btn.addEventListener("click", () => previewVersion(btn.dataset.previewVersion).catch(showError)));
    wrap.querySelectorAll("[data-download-version]").forEach((btn) => btn.addEventListener("click", () => downloadVersion(btn.dataset.downloadVersion).catch(showError)));
    wrap.querySelectorAll("[data-approve-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.approveVersion, "approve_document_version", "Approve this version?").catch(showError)));
    wrap.querySelectorAll("[data-publish-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.publishVersion, "publish_document_version", "Publish this version? This will make it the current live version for its visibility level.").catch(showError)));
    wrap.querySelectorAll("[data-reject-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.rejectVersion, "reject_document_version", "Reject this version?").catch(showError)));
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Error: ${message}`);
    setOutput({ ok: false, message });
    console.error(error);
  }

  function css() {
    return `
      .sd-wrap{max-width:1180px;margin:24px auto 60px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033;box-sizing:border-box}.sd-wrap *{box-sizing:border-box}.sd-panel{background:#fff;border:1px solid #dfe7f1;border-radius:22px;box-shadow:0 14px 38px rgba(12,38,64,.12);overflow:hidden}.sd-head{padding:24px 26px;background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.sd-head h1{margin:0;font-size:clamp(30px,4vw,50px);line-height:1;font-weight:900;letter-spacing:-.04em}.sd-head p{max-width:880px;margin:10px 0 0;color:rgba(255,255,255,.88);line-height:1.55}.sd-version-badge{display:inline-flex;margin-top:12px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-size:11px;font-weight:900;letter-spacing:.04em}.sd-body{padding:20px;background:linear-gradient(180deg,#eef7ff,#fff)}.sd-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;margin-bottom:14px;padding:12px;border-radius:16px;background:#fff;border:1px solid #dfe7f1}.sd-input,.sd-select,.sd-textarea{width:100%;border:1px solid #ccd8e5;border-radius:12px;padding:10px 12px;font:inherit;background:#fff;color:#172033}.sd-input[readonly],.sd-input:disabled,.sd-select:disabled,.sd-textarea:disabled{background:#f1f5f9;color:#64748b;cursor:not-allowed}.sd-textarea{min-height:92px;resize:vertical}.sd-button,.sd-mini-button{border:1px solid #b9c8d8;border-radius:999px;background:#fff;color:#12365a;font-weight:900;cursor:pointer;padding:9px 13px}.sd-button:hover,.sd-mini-button:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(12,38,64,.10)}.sd-button.primary,.sd-mini-button.primary{background:#12365a;color:#fff;border-color:#12365a}.sd-button.danger,.sd-mini-button.danger{background:#fee2e2;color:#991b1b;border-color:#f3b9b9}.sd-mini-button{padding:7px 10px;font-size:12px}.sd-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto auto;gap:10px;align-items:end;margin-bottom:14px}.sd-grid{display:grid;grid-template-columns:410px minmax(0,1fr);gap:16px;align-items:start}.sd-card{background:rgba(255,255,255,.94);border:1px solid #dfe7f1;border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(12,38,64,.08)}.sd-section-title{margin:0 0 10px;color:#0b2744;font-size:18px}.sd-subtitle{margin:0 0 14px;color:#5d6b78;font-size:13px;line-height:1.5}.sd-help{margin:6px 0 0;color:#64748b;font-size:12px;line-height:1.45}.sd-field{display:grid;gap:6px;margin-bottom:12px}.sd-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#4b6582}.sd-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sd-document-list{display:grid;gap:12px;max-height:760px;overflow:auto;padding-right:4px}.sd-doc-group{border:1px solid #dfe7f1;border-radius:16px;background:#f8fbff;padding:10px}.sd-doc-group summary{cursor:pointer;color:#12365a;font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;margin-bottom:8px}.sd-doc-group summary span{float:right;background:#eaf5ff;border-radius:999px;padding:2px 8px}.sd-doc-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:7px;text-align:left;margin:0 0 8px;padding:12px;border:1px solid #dfe7f1;border-radius:14px;background:#fff;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}.sd-doc-row:hover,.sd-doc-row.selected{border-color:#2f80c4;box-shadow:0 6px 14px rgba(47,128,196,.14)}.sd-doc-row.archived{background:#fff7ed;border-color:#fdba74}.sd-doc-row-main strong{display:block;color:#0b2744}.sd-doc-row-main small{display:block;color:#5d6b78;margin-top:3px;overflow:hidden;text-overflow:ellipsis}.sd-row-pills{display:flex;gap:6px;flex-wrap:wrap}.sd-pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;text-transform:uppercase;border:1px solid #d1d9e4;background:#f8fafc;color:#475569}.sd-pill.green{background:#e7f6ec;color:#14532d;border-color:#bde5c9}.sd-pill.blue{background:#eaf5ff;color:#12365a;border-color:#c9e4f8}.sd-pill.amber{background:#fff7ed;color:#9a4a00;border-color:#fed7aa}.sd-pill.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.sd-muted{color:#5d6b78;font-size:12px;line-height:1.45}.sd-note{margin-top:6px;padding:8px;border-radius:10px;background:#f8fafc;color:#475569;font-size:12px}.sd-mode-card{min-height:260px;display:flex;align-items:center;justify-content:center;text-align:center}.sd-mode-card-inner{max-width:520px}.sd-mode-card h2{margin:0 0 10px;color:#0b2744;font-size:26px}.sd-editor-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #dfe7f1}.sd-editor-title h2{margin:0;color:#0b2744;font-size:22px}.sd-editor-title p{margin:6px 0 0;color:#64748b;font-size:13px}.sd-lock-warning{padding:12px 14px;margin-bottom:12px;border-radius:14px;border:1px solid #fdba74;background:#fff7ed;color:#9a4a00;font-weight:800;font-size:13px;line-height:1.5}.sd-drop{min-height:118px;border:2px dashed #aac0d8;border-radius:16px;background:#f8fbff;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;cursor:pointer}.sd-drop.is-over{border-color:#2f80c4;background:#eaf5ff}.sd-drop.disabled{opacity:.55;cursor:not-allowed}.sd-drop input{position:absolute;opacity:0;pointer-events:none}.sd-file-chip{display:grid;gap:4px;justify-items:center}.sd-file-chip span{font-size:12px;color:#5d6b78}.sd-version-list{display:grid;gap:10px}.sd-version-help{padding:10px 12px;border:1px solid #c9e4f8;background:#eaf5ff;color:#12365a;border-radius:12px;font-size:12px;line-height:1.45;font-weight:800}.sd-version-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;border:1px solid #dfe7f1;border-radius:14px;background:#fff;padding:12px}.sd-version-row.is-live{border-color:#bde5c9;background:#f1fbf4}.sd-version-head{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px}.sd-version-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sd-live-note{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;background:#e7f6ec;color:#14532d;font-size:12px;font-weight:900}.sd-dirty{display:inline-flex;margin-left:8px;padding:5px 9px;border-radius:999px;background:#e7f6ec;color:#14532d;font-size:11px;font-weight:900}.sd-dirty.is-dirty{background:#fff7ed;color:#9a4a00}.sd-output{white-space:pre-wrap;background:#0f172a;color:#dbeafe;border-radius:14px;padding:12px;max-height:260px;overflow:auto;font-size:12px}.sd-empty{padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#fff;text-align:center}.sd-preview-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(7,24,42,.72);z-index:2147483000;padding:24px}.sd-preview-backdrop.is-open{display:flex}.sd-preview-modal{width:min(1100px,96vw);height:min(820px,92vh);background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.38);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.sd-preview-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid #dfe7f1;background:#f8fbff}.sd-preview-head strong{color:#0b2744}.sd-preview-frame{width:100%;height:100%;border:0;background:#fff}@media(max-width:920px){.sd-grid,.sd-toolbar,.sd-login,.sd-two{grid-template-columns:1fr}.sd-version-row,.sd-editor-head{grid-template-columns:1fr;display:grid}.sd-version-actions{justify-content:flex-start}}
    `;
  }

  function render() {
    const root = ensureRoot();
    root.innerHTML = `
      <style>${css()}</style>
      <div class="sd-wrap">
        <section class="sd-panel">
          <header class="sd-head">
            <h1>Documents / Resources</h1>
            <p>Manage protected document records, upload versioned files, publish approved versions, and expose only public published documents to the public page.</p>
            <span class="sd-version-badge">ADMIN-PAGE-documents-current.js | ${escapeHtml(VERSION)}</span>
          </header>
          <div class="sd-body">
            <div class="sd-login">
              <input id="sd-login-email" class="sd-input" type="email" placeholder="Platform admin email">
              <input id="sd-login-password" class="sd-input" type="password" placeholder="Password">
              <button id="sd-login" class="sd-button primary" type="button">Log In</button>
              <button id="sd-logout" class="sd-button" type="button">Log Out</button>
            </div>
            ${isAuthenticated ? mainHtml() : `<div class="sd-card"><h2 class="sd-section-title">Login required</h2><p class="sd-subtitle">Sign in as a platform admin to manage documents.</p></div>`}
          </div>
        </section>
      </div>
      <div id="sd-preview-root"></div>`;

    getEl("sd-login")?.addEventListener("click", () => login().catch(showError));
    getEl("sd-logout")?.addEventListener("click", () => logout().catch(showError));
    if (isAuthenticated) bindMainEvents();
    renderPreviewModal();
    renderDirty();
  }

  function mainHtml() {
    const customerOptions = customers.map((c) => `<option value="${escapeHtml(c.customer_id)}" ${String(c.customer_id) === selectedCustomerId ? "selected" : ""}>${escapeHtml(customerLabel(c))}</option>`).join("");
    return `
      <div class="sd-toolbar">
        <label class="sd-field" style="margin:0"><span class="sd-label">Organization</span><select id="sd-customer-select" class="sd-select">${customerOptions}</select><span class="sd-help">Display name plus key are shown so duplicate test names are distinguishable.</span></label>
        <label class="sd-field" style="margin:0"><span class="sd-label">Show Archived</span><select id="sd-include-archived" class="sd-select"><option value="true" ${includeArchived ? "selected" : ""}>Yes</option><option value="false" ${!includeArchived ? "selected" : ""}>No</option></select></label>
        <button id="sd-refresh" class="sd-button" type="button">Refresh</button>
        <button id="sd-new" class="sd-button primary" type="button">New Document</button>
      </div>
      <div class="sd-grid">
        <section class="sd-card">
          <h2 class="sd-section-title">Document Records</h2>
          <p class="sd-subtitle">Select a record to edit, or create a new document. Records are grouped by category.</p>
          <div id="sd-document-list" class="sd-document-list"></div>
        </section>
        ${editorMode === "idle" ? idleHtml() : editorHtml()}
      </div>`;
  }

  function idleHtml() {
    return `
      <section class="sd-card sd-mode-card">
        <div class="sd-mode-card-inner">
          <h2>Select or create a document</h2>
          <p class="sd-subtitle">No document is currently open. This avoids confusing a blank form with an existing record.</p>
          <button id="sd-idle-new" type="button" class="sd-button primary">New Document</button>
          <h2 class="sd-section-title" style="margin-top:22px">Backend Results</h2>
          <pre id="sd-output" class="sd-output">${escapeHtml(lastOutput)}</pre>
          <p id="sd-status" class="sd-subtitle" style="margin-top:14px">${escapeHtml(lastStatus)}</p>
        </div>
      </section>`;
  }

  function editorHtml() {
    const doc = currentDocument();
    const archived = isCurrentDocumentArchived();
    const modeLabel = editorMode === "new" ? "Creating New Document" : archived ? `Archived: ${doc?.title || "Document"}` : `Editing: ${doc?.title || "Document"}`;
    const disabled = archived ? "disabled" : "";
    return `
      <section class="sd-card sd-editor">
        <div class="sd-editor-head">
          <div class="sd-editor-title"><h2>${escapeHtml(modeLabel)} <span id="sd-dirty" class="sd-dirty">Saved / clean</span></h2><p>${editorMode === "new" ? "Save creates the document record. If a file is selected, it becomes version 1." : "You are editing an existing document record. Uploading a file creates a new version."}</p></div>
          <button id="sd-close-editor" class="sd-button" type="button">Close Editor</button>
        </div>
        ${archived ? `<div class="sd-lock-warning">This document is archived. Restore it before changing metadata or uploading versions.</div>` : ""}
        <div class="sd-two"><label class="sd-field"><span class="sd-label">Title</span><input id="sd-title" class="sd-input" type="text" ${disabled}></label><label class="sd-field"><span class="sd-label">System Slug / Key</span><input id="sd-document-key" class="sd-input" type="text" readonly><span class="sd-help">Auto-generated and locked. Change only directly in Supabase if absolutely necessary.</span></label></div>
        <div class="sd-two"><label class="sd-field"><span class="sd-label">Category</span><input id="sd-category" class="sd-input" type="text" placeholder="General, Minutes, Bylaws, Aircraft, Orientation" ${disabled}></label><label class="sd-field"><span class="sd-label">Visibility</span><select id="sd-visibility" class="sd-select" ${disabled}><option value="public">Public</option><option value="members">Members</option><option value="admins">Organization Admins</option><option value="board">Board/Internal</option><option value="internal">Platform/Internal</option></select><span class="sd-help">Public appears on the public page. Members/admin/board/internal are hidden from the public page.</span></label></div>
        <label class="sd-field"><span class="sd-label">Sort Order</span><input id="sd-sort-order" class="sd-input" type="number" value="100" ${disabled}></label>
        <label class="sd-field"><span class="sd-label">Description</span><textarea id="sd-description" class="sd-textarea" placeholder="Short description shown next to the document." ${disabled}></textarea></label>
        <div id="sd-drop" class="sd-drop ${archived ? "disabled" : ""}"><input id="sd-file-input" type="file" ${disabled}><div id="sd-pending-file"><span class="sd-muted">No file selected. Drag a file here or click to choose one.</span></div></div>
        <div class="sd-two" style="margin-top:12px"><label class="sd-field"><span class="sd-label">New Version Status</span><select id="sd-version-status" class="sd-select" ${disabled}><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option></select></label><label class="sd-field"><span class="sd-label">Publish Now</span><select id="sd-publish-now" class="sd-select" ${disabled}><option value="false">No</option><option value="true">Yes - publish uploaded version</option></select></label></div>
        <label class="sd-field"><span class="sd-label">Version Notes</span><textarea id="sd-version-notes" class="sd-textarea" placeholder="Optional notes for this upload/version." ${disabled}></textarea></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">${archived ? `<button id="sd-restore" class="sd-button primary" type="button">Restore Document</button>` : `<button id="sd-save" class="sd-button primary" type="button">Save Document</button>${editorMode === "edit" ? `<button id="sd-archive" class="sd-button danger" type="button">Archive Document</button>` : ""}`}</div>
        <h2 class="sd-section-title">Version History</h2><div id="sd-version-list" class="sd-version-list"></div>
        <p id="sd-status" class="sd-subtitle" style="margin-top:14px">${escapeHtml(lastStatus)}</p>
        <h2 class="sd-section-title">Backend Results</h2><pre id="sd-output" class="sd-output">${escapeHtml(lastOutput)}</pre>
      </section>`;
  }

  function bindMainEvents() {
    getEl("sd-idle-new")?.addEventListener("click", openNewDocument);
    getEl("sd-customer-select")?.addEventListener("change", async (e) => {
      if (!confirmDiscard("Discard unsaved document changes and switch organization?")) { e.target.value = selectedCustomerId; return; }
      selectedCustomerId = e.target.value;
      selectedDocumentId = "";
      versions = [];
      pendingFile = null;
      editorMode = "idle";
      markClean();
      render();
      await loadDocuments(false);
    });
    getEl("sd-include-archived")?.addEventListener("change", async (e) => { includeArchived = e.target.value === "true"; await loadDocuments(true); });
    getEl("sd-refresh")?.addEventListener("click", () => loadDocuments(true).catch(showError));
    getEl("sd-new")?.addEventListener("click", openNewDocument);
    renderDocumentList();
    if (editorMode !== "idle") bindEditorEvents();
  }

  function bindEditorEvents() {
    const root = getEl(ROOT_ID);
    getEl("sd-title")?.addEventListener("input", updateSlugPreview);
    getEl("sd-close-editor")?.addEventListener("click", cancelEditor);
    getEl("sd-save")?.addEventListener("click", () => saveDocument().catch(showError));
    getEl("sd-archive")?.addEventListener("click", () => archiveOrRestoreDocument(true).catch(showError));
    getEl("sd-restore")?.addEventListener("click", () => archiveOrRestoreDocument(false).catch(showError));
    const drop = getEl("sd-drop");
    const input = getEl("sd-file-input");
    if (!isCurrentDocumentArchived()) {
      drop?.addEventListener("click", () => input?.click());
      input?.addEventListener("change", () => setPendingFile(input.files && input.files[0]));
      ["dragenter", "dragover"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-over"); }));
      ["dragleave", "drop"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-over"); }));
      drop?.addEventListener("drop", (event) => setPendingFile(event.dataTransfer?.files?.[0] || null));
    }
    bindDirty(root);
    hydrateDocument(editorMode === "edit" ? currentDocument() : null);
    renderVersions();
  }

  function renderPreviewModal() {
    const root = getEl("sd-preview-root");
    if (!root) return;
    root.innerHTML = `<div class="sd-preview-backdrop ${previewState.isOpen ? "is-open" : ""}" id="sd-preview-backdrop"><div class="sd-preview-modal"><div class="sd-preview-head"><strong>${escapeHtml(previewState.title || "Document preview")}</strong><div style="display:flex;gap:8px"><button id="sd-open-preview-new-tab" class="sd-mini-button" type="button">Open in new tab</button><button id="sd-close-preview" class="sd-mini-button danger" type="button">Close</button></div></div>${previewState.url ? `<iframe class="sd-preview-frame" src="${escapeHtml(previewState.url)}"></iframe>` : `<div class="sd-empty">No preview URL.</div>`}</div></div>`;
    getEl("sd-close-preview")?.addEventListener("click", closePreview);
    getEl("sd-preview-backdrop")?.addEventListener("click", (event) => { if (event.target.id === "sd-preview-backdrop") closePreview(); });
    getEl("sd-open-preview-new-tab")?.addEventListener("click", () => { if (previewState.url) window.open(previewState.url, "_blank", "noopener,noreferrer"); });
  }

  function boot() {
    ensureRoot();
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: false, email: "" });
    render();
    refreshAuth().then(() => {
      render();
      if (isAuthenticated) loadCustomers().catch(showError);
    }).catch(showError);
    window.addEventListener("beforeunload", (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = DIRTY_MESSAGE;
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && previewState.isOpen) closePreview(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
