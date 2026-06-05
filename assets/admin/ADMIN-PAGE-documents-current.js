// ADMIN-PAGE-documents-current.js
// Internal Version: 2026-06-05-003-A
// Purpose: Platform-admin Documents / Resources manager with paired PDF/source uploads, version history, protected storage, PDF previews, and clearer record selection.
// Actions used: list_customers, list_documents, upsert_document, archive_document, restore_document, list_document_versions, create_document_version, approve_document_version, publish_document_version, reject_document_version, get_document_download_url.

(function () {
  "use strict";

  const VERSION = "2026-06-05-003-A";
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
  let pendingPdfFile = null;
  let pendingSourceFile = null;
  let pendingPdfPreviewUrl = "";
  let pendingSourcePreviewUrl = "";
  let isDirty = false;
  let isHydrating = false;
  let includeArchived = true;
  let lastStatus = "Ready.";
  let lastOutput = "";
  let previewState = { isOpen: false, url: "", title: "" };
  let validationMessage = "";
  let validationTarget = "";

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


  function fileExt(name) {
    const cleaned = String(name || "").split(/[\\/]/).pop() || "";
    const dot = cleaned.lastIndexOf(".");
    return dot > -1 ? cleaned.slice(dot + 1).toLowerCase() : "";
  }

  function isPdfFile(file) {
    if (!file) return false;
    return String(file.type || "").toLowerCase() === "application/pdf" || fileExt(file.name) === "pdf";
  }

  function isEditableSourceFile(file) {
    if (!file) return false;
    const ext = fileExt(file.name);
    const allowed = new Set(["doc", "docx", "odt", "rtf", "txt", "csv", "xls", "xlsx", "ods", "ppt", "pptx", "odp"]);
    return allowed.has(ext) && ext !== "pdf";
  }

  function isPdfVersion(version) {
    if (!version) return false;
    return String(version.mime_type || "").toLowerCase() === "application/pdf" || fileExt(version.original_file_name) === "pdf";
  }

  function isPreviewablePdfFile(file) {
    return isPdfFile(file);
  }

  function getVersionSourceFile(version) {
    const meta = version && typeof version.metadata_json === "object" && version.metadata_json ? version.metadata_json : {};
    const source = meta && typeof meta.source_file === "object" && meta.source_file ? meta.source_file : null;
    return source && source.storage_path ? source : null;
  }

  function resetPendingFiles(renderNow = true) {
    if (pendingPdfPreviewUrl) URL.revokeObjectURL(pendingPdfPreviewUrl);
    if (pendingSourcePreviewUrl) URL.revokeObjectURL(pendingSourcePreviewUrl);
    pendingPdfFile = null;
    pendingSourceFile = null;
    pendingPdfPreviewUrl = "";
    pendingSourcePreviewUrl = "";
    clearValidation();
    if (renderNow) renderPendingFiles();
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

  function renderValidation() {
    const message = cleanText(validationMessage);
    ["sd-upload-validation", "sd-save-validation"].forEach((id) => {
      const el = getEl(id);
      if (!el) return;
      el.textContent = message;
      el.classList.toggle("is-visible", Boolean(message));
    });

    const pdfDrop = getEl("sd-pdf-drop");
    const sourceDrop = getEl("sd-source-drop");
    if (pdfDrop) pdfDrop.classList.toggle("is-invalid", validationTarget === "pdf" || validationTarget === "both");
    if (sourceDrop) sourceDrop.classList.toggle("is-invalid", validationTarget === "source" || validationTarget === "both");
  }

  function setValidationError(message, target = "both") {
    validationMessage = cleanText(message);
    validationTarget = target || "both";
    setStatus(`Error: ${validationMessage}`);
    renderValidation();
    const focusTarget = target === "pdf" ? getEl("sd-pdf-drop") : target === "source" ? getEl("sd-source-drop") : getEl("sd-upload-validation") || getEl("sd-save-validation");
    if (focusTarget && typeof focusTarget.scrollIntoView === "function") {
      focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearValidation(target = "") {
    if (!validationMessage) return;
    if (!target || validationTarget === target || validationTarget === "both") {
      validationMessage = "";
      validationTarget = "";
      renderValidation();
    }
  }

  function validationError(message, target = "both") {
    setValidationError(message, target);
    return new Error(message);
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
    resetPendingFiles(false);
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
      resetPendingFiles(false);
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
    resetPendingFiles(false);
    editorMode = "new";
    markClean();
    render();
    hydrateDocument(null);
    setStatus("Creating a new document. Enter details, optionally upload a file, then save.");
  }

  function closeEditor(message) {
    selectedDocumentId = "";
    versions = [];
    resetPendingFiles(false);
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
    resetPendingFiles(false);
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
    resetPendingFiles(false);
    renderPendingFiles();
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


  function validatePendingVersionFiles() {
    clearValidation();

    if (pendingPdfFile && !isPdfFile(pendingPdfFile)) {
      throw validationError("The viewable/live file must be a PDF. Upload PDF files only in the Viewable PDF / Live File box.", "pdf");
    }

    if (pendingSourceFile && isPdfFile(pendingSourceFile)) {
      throw validationError("The Editable Source File box is for editable files such as DOCX, XLSX, PPTX, ODT, RTF, TXT, or CSV. Upload PDFs in the Viewable PDF / Live File box.", "source");
    }

    if (pendingSourceFile && !isEditableSourceFile(pendingSourceFile)) {
      throw validationError("The Editable Source File box accepts editable source files only: DOCX, DOC, XLSX, PPTX, ODT, RTF, TXT, or CSV.", "source");
    }

    if (pendingSourceFile && !pendingPdfFile) {
      throw validationError("A viewable PDF is required when uploading an editable source file. Use Print/Export to PDF, then upload the matching PDF in the Viewable PDF / Live File box before saving.", "both");
    }

    if (getValue("sd-publish-now") === "true" && !pendingPdfFile) {
      throw validationError("Publishing requires a viewable PDF. Upload the PDF rendition before choosing Publish Now.", "pdf");
    }

    if (pendingSourceFile && !getEl("sd-pdf-confirm")?.checked) {
      throw validationError("Confirm that the viewable PDF matches the editable/source file before saving this paired version.", "both");
    }
  }

  async function saveDocument() {
    if (!selectedCustomerId) throw new Error("Select a customer/organization first.");
    if (isCurrentDocumentArchived()) throw new Error("Archived documents must be restored before they can be edited.");
    validatePendingVersionFiles();
    const targetDocumentId = selectedDocumentId || crypto.randomUUID();
    setStatus("Saving document metadata...");
    const result = await callCoreAdminAction("upsert_document", documentPayload(targetDocumentId));
    const document = result.document;
    selectedDocumentId = String(document.document_id);

    if (pendingPdfFile || pendingSourceFile) {
      await uploadPendingFilesAndCreateVersion(document);
    }

    resetPendingFiles(false);
    await loadDocuments(false);
    closeEditor("Document saved. Select a document to edit or click New Document.");
  }

  async function uploadOneDocumentFile(file, document, role) {
    const safeFile = sanitizeFileName(file.name);
    const storagePath = ["organizations", selectedCustomerId, "documents", document.document_id, role, `${Date.now()}-${safeFile}`].join("/");
    setStatus(`Uploading ${role === "public-pdf" ? "viewable PDF" : "editable source"} to protected storage...`);
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    return {
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size || 0,
      uploaded_at: new Date().toISOString(),
      role,
    };
  }

  async function uploadPendingFilesAndCreateVersion(document) {
    if (!pendingPdfFile && !pendingSourceFile) return;

    if (pendingPdfFile && !isPdfFile(pendingPdfFile)) {
      throw validationError("The viewable/live file must be a PDF. Upload PDF files only in the Viewable PDF / Live File box.", "pdf");
    }

    if (pendingSourceFile && !pendingPdfFile) {
      throw validationError("A viewable PDF is required when uploading an editable source file. Upload the matching PDF in the Viewable PDF / Live File box before saving.", "both");
    }

    if (pendingSourceFile && !getEl("sd-pdf-confirm")?.checked) {
      throw validationError("Confirm that the viewable PDF matches the editable/source file before saving this paired version.", "both");
    }

    const pdfInfo = await uploadOneDocumentFile(pendingPdfFile, document, "public-pdf");
    const sourceInfo = pendingSourceFile ? await uploadOneDocumentFile(pendingSourceFile, document, "source") : null;

    setStatus("Creating document version...");
    await callCoreAdminAction("create_document_version", {
      organization_id: selectedCustomerId,
      document_id: document.document_id,
      storage_bucket: pdfInfo.storage_bucket,
      storage_path: pdfInfo.storage_path,
      original_file_name: pdfInfo.original_file_name,
      mime_type: pdfInfo.mime_type,
      file_size_bytes: pdfInfo.file_size_bytes,
      version_status: getValue("sd-version-status") || "draft",
      publish_now: getValue("sd-publish-now") === "true",
      pdf_match_confirmed: Boolean(sourceInfo),
      notes: getValue("sd-version-notes"),
      metadata_json: {
        viewable_pdf_file: pdfInfo,
        source_file: sourceInfo,
        pdf_match_confirmed: Boolean(sourceInfo),
        workflow: sourceInfo ? "paired-source-and-pdf" : "pdf-only",
      },
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

  async function getVersionAccess(versionId, fileRole = "public") {
    const result = await callCoreAdminAction("get_document_download_url", { organization_id: selectedCustomerId, version_id: versionId, file_role: fileRole });
    if (!result.signed_url && !result.preview_signed_url && !result.download_signed_url) throw new Error("No signed document URL was returned.");
    return result;
  }

  async function previewVersion(versionId, fileRole = "public") {
    const result = await getVersionAccess(versionId, fileRole);
    const version = result.version || versions.find((v) => String(v.version_id) === String(versionId)) || {};
    previewState = {
      isOpen: true,
      url: result.preview_signed_url || result.signed_url || result.download_signed_url,
      title: `${result.file_name || version.original_file_name || "Document preview"}`,
    };
    renderPreviewModal();
  }

  async function downloadVersion(versionId, fileRole = "public") {
    const result = await getVersionAccess(versionId, fileRole);
    window.open(result.download_signed_url || result.signed_url || result.preview_signed_url, "_blank", "noopener,noreferrer");
  }

  function closePreview() {
    previewState = { isOpen: false, url: "", title: "" };
    renderPreviewModal();
  }

  function buildLocalPreviewHtml(file, previewUrl, role) {
    if (!file) return "";
    if (isPreviewablePdfFile(file) && previewUrl) {
      return `<iframe class="sd-local-preview-frame" src="${escapeHtml(previewUrl)}" title="${escapeHtml(file.name)} preview"></iframe>`;
    }
    if (role === "source") {
      return `<div class="sd-local-preview-message"><strong>Source preview not available in browser.</strong><span>Word/source files are stored for editing and download from version history. Upload the matching PDF for live preview and publication.</span></div>`;
    }
    return `<div class="sd-local-preview-message"><strong>Preview unavailable.</strong><span>Only PDF files can be previewed reliably on-page.</span></div>`;
  }

  function setPendingPdfFile(file) {
    if (!file) return;
    if (!isPdfFile(file)) {
      setValidationError("The Viewable PDF / Live File box accepts PDF files only. Upload editable source files in the Editable Source File box.", "pdf");
      const input = getEl("sd-pdf-input");
      if (input) input.value = "";
      return;
    }
    if (pendingPdfPreviewUrl) URL.revokeObjectURL(pendingPdfPreviewUrl);
    pendingPdfFile = file;
    pendingPdfPreviewUrl = URL.createObjectURL(file);
    clearValidation("pdf");
    renderPendingFiles();
    markDirty();
  }

  function setPendingSourceFile(file) {
    if (!file) return;
    if (isPdfFile(file)) {
      setValidationError("The Editable Source File box is for editable files such as DOCX, XLSX, PPTX, ODT, RTF, TXT, or CSV. Upload PDFs in the Viewable PDF / Live File box.", "source");
      const input = getEl("sd-source-input");
      if (input) input.value = "";
      return;
    }
    if (!isEditableSourceFile(file)) {
      setValidationError("The Editable Source File box accepts editable source files only: DOCX, DOC, XLSX, PPTX, ODT, RTF, TXT, or CSV.", "source");
      const input = getEl("sd-source-input");
      if (input) input.value = "";
      return;
    }
    if (pendingSourcePreviewUrl) URL.revokeObjectURL(pendingSourcePreviewUrl);
    pendingSourceFile = file;
    pendingSourcePreviewUrl = "";
    clearValidation("source");
    renderPendingFiles();
    markDirty();
  }

  function renderFileSlot(id, file, previewUrl, role) {
    const el = getEl(id);
    if (!el) return;
    if (!file) {
      el.innerHTML = role === "pdf"
        ? `<span class="sd-muted">No PDF selected. Drag the live/viewable PDF here or click to choose it.</span>`
        : `<span class="sd-muted">No source file selected. Optional: drag the editable Word/source file here.</span>`;
      return;
    }
    el.innerHTML = `
      <div class="sd-file-chip">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.type || "application/octet-stream")} • ${escapeHtml(formatBytes(file.size))}</span>
        <button id="${role === "pdf" ? "sd-clear-pdf-file" : "sd-clear-source-file"}" type="button" class="sd-mini-button">Remove</button>
      </div>
      <div class="sd-local-preview">${buildLocalPreviewHtml(file, previewUrl, role === "pdf" ? "pdf" : "source")}</div>`;
    getEl(role === "pdf" ? "sd-clear-pdf-file" : "sd-clear-source-file")?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (role === "pdf") {
        if (pendingPdfPreviewUrl) URL.revokeObjectURL(pendingPdfPreviewUrl);
        pendingPdfFile = null;
        pendingPdfPreviewUrl = "";
      } else {
        if (pendingSourcePreviewUrl) URL.revokeObjectURL(pendingSourcePreviewUrl);
        pendingSourceFile = null;
        pendingSourcePreviewUrl = "";
      }
      renderPendingFiles();
      markDirty();
    });
  }

  function renderPendingFiles() {
    renderFileSlot("sd-pending-pdf", pendingPdfFile, pendingPdfPreviewUrl, "pdf");
    renderFileSlot("sd-pending-source", pendingSourceFile, pendingSourcePreviewUrl, "source");
    const confirmWrap = getEl("sd-pdf-confirm-wrap");
    if (confirmWrap) confirmWrap.style.display = pendingSourceFile ? "grid" : "none";
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
    if (!version) return "Publish";
    const status = String(version.version_status || "draft");
    if (status === "superseded") return "Make Live Again";
    if (status === "approved") return "Publish Approved";
    return "Publish / Make Live";
  }

  function sourceFileLabel(source) {
    if (!source) return "No editable/source file stored.";
    const size = source.file_size_bytes ? ` • ${formatBytes(source.file_size_bytes)}` : "";
    return `${source.original_file_name || "source file"}${size}`;
  }

  function renderVersions() {
    const wrap = getEl("sd-version-list");
    if (!wrap) return;
    if (!selectedDocumentId) {
      wrap.innerHTML = `<div class="sd-empty">Select or save a document to see versions.</div>`;
      return;
    }
    if (!versions.length) {
      wrap.innerHTML = `<div class="sd-empty">No uploaded versions yet. Choose a PDF file and save the document to create v1. If you upload a Word/source file, upload its matching PDF in the PDF box.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="sd-version-help">Version history is append-only. The live/public file is the PDF rendition. Editable/source files are stored for admin use and are not shown publicly.</div>
      ${versions.map((v) => {
        const status = String(v.version_status || "draft");
        const tone = status === "published" ? "green" : status === "superseded" ? "neutral" : status === "rejected" ? "red" : status === "approved" ? "blue" : "amber";
        const publishLabel = versionActionLabel(v);
        const source = getVersionSourceFile(v);
        const pdfOk = isPdfVersion(v);
        return `<article class="sd-version-row ${status === "published" ? "is-live" : ""}">
          <div>
            <div class="sd-version-head"><strong>v${escapeHtml(v.version_number)} ${escapeHtml(v.version_label || "")}</strong>${statusPill(status === "published" ? "current live" : status, tone)}${pdfOk ? statusPill("PDF", "green") : statusPill("no PDF rendition", "red")}</div>
            <div class="sd-muted"><strong>Viewable PDF:</strong> ${escapeHtml(v.original_file_name || "file")} • ${escapeHtml(formatBytes(v.file_size_bytes))} • uploaded ${escapeHtml(formatDate(v.created_at))}</div>
            <div class="sd-muted"><strong>Editable source:</strong> ${escapeHtml(sourceFileLabel(source))}</div>
            ${v.notes ? `<div class="sd-note">${escapeHtml(v.notes)}</div>` : ""}
          </div>
          <div class="sd-version-actions">
            ${pdfOk ? `<button type="button" class="sd-mini-button" data-preview-version="${escapeHtml(v.version_id)}" data-file-role="public">Preview PDF</button><button type="button" class="sd-mini-button" data-download-version="${escapeHtml(v.version_id)}" data-file-role="public">Download PDF</button>` : `<span class="sd-muted">PDF preview unavailable</span>`}
            ${source ? `<button type="button" class="sd-mini-button" data-download-version="${escapeHtml(v.version_id)}" data-file-role="source">Download Source</button>` : ""}
            ${status !== "approved" && status !== "published" && status !== "superseded" ? `<button type="button" class="sd-mini-button" data-approve-version="${escapeHtml(v.version_id)}">Approve</button>` : ""}
            ${status !== "published" ? (pdfOk ? `<button type="button" class="sd-mini-button primary" data-publish-version="${escapeHtml(v.version_id)}">${escapeHtml(publishLabel)}</button>` : `<button type="button" class="sd-mini-button primary" disabled title="Upload a PDF rendition before publishing.">${escapeHtml(publishLabel)}</button>`) : `<span class="sd-live-note">Live</span>`}
            ${!["rejected", "published", "superseded"].includes(status) ? `<button type="button" class="sd-mini-button danger" data-reject-version="${escapeHtml(v.version_id)}">Reject</button>` : ""}
          </div>
        </article>`;
      }).join("")}`;
    wrap.querySelectorAll("[data-preview-version]").forEach((btn) => btn.addEventListener("click", () => previewVersion(btn.dataset.previewVersion, btn.dataset.fileRole || "public").catch(showError)));
    wrap.querySelectorAll("[data-download-version]").forEach((btn) => btn.addEventListener("click", () => downloadVersion(btn.dataset.downloadVersion, btn.dataset.fileRole || "public").catch(showError)));
    wrap.querySelectorAll("[data-approve-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.approveVersion, "approve_document_version", "Approve this version?").catch(showError)));
    wrap.querySelectorAll("[data-publish-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.publishVersion, "publish_document_version", "Publish this PDF version? This will make it the current live PDF for its visibility level.").catch(showError)));
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
      .sd-wrap{max-width:1180px;margin:24px auto 60px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033;box-sizing:border-box}.sd-wrap *{box-sizing:border-box}.sd-panel{background:#fff;border:1px solid #dfe7f1;border-radius:22px;box-shadow:0 14px 38px rgba(12,38,64,.12);overflow:hidden}.sd-head{padding:24px 26px;background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.sd-head h1{margin:0;font-size:clamp(30px,4vw,50px);line-height:1;font-weight:900;letter-spacing:-.04em}.sd-head p{max-width:880px;margin:10px 0 0;color:rgba(255,255,255,.88);line-height:1.55}.sd-version-badge{display:inline-flex;margin-top:12px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-size:11px;font-weight:900;letter-spacing:.04em}.sd-body{padding:20px;background:linear-gradient(180deg,#eef7ff,#fff)}.sd-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;margin-bottom:14px;padding:12px;border-radius:16px;background:#fff;border:1px solid #dfe7f1}.sd-input,.sd-select,.sd-textarea{width:100%;border:1px solid #ccd8e5;border-radius:12px;padding:10px 12px;font:inherit;background:#fff;color:#172033}.sd-input[readonly],.sd-input:disabled,.sd-select:disabled,.sd-textarea:disabled{background:#f1f5f9;color:#64748b;cursor:not-allowed}.sd-textarea{min-height:92px;resize:vertical}.sd-button,.sd-mini-button{border:1px solid #b9c8d8;border-radius:999px;background:#fff;color:#12365a;font-weight:900;cursor:pointer;padding:9px 13px}.sd-button:hover,.sd-mini-button:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(12,38,64,.10)}.sd-button.primary,.sd-mini-button.primary{background:#12365a;color:#fff;border-color:#12365a}.sd-button.danger,.sd-mini-button.danger{background:#fee2e2;color:#991b1b;border-color:#f3b9b9}.sd-mini-button{padding:7px 10px;font-size:12px}.sd-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto auto;gap:10px;align-items:end;margin-bottom:14px}.sd-grid{display:grid;grid-template-columns:410px minmax(0,1fr);gap:16px;align-items:start}.sd-card{background:rgba(255,255,255,.94);border:1px solid #dfe7f1;border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(12,38,64,.08)}.sd-section-title{margin:0 0 10px;color:#0b2744;font-size:18px}.sd-subtitle{margin:0 0 14px;color:#5d6b78;font-size:13px;line-height:1.5}.sd-help{margin:6px 0 0;color:#64748b;font-size:12px;line-height:1.45}.sd-field{display:grid;gap:6px;margin-bottom:12px}.sd-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#4b6582}.sd-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sd-document-list{display:grid;gap:12px;max-height:760px;overflow:auto;padding-right:4px}.sd-doc-group{border:1px solid #dfe7f1;border-radius:16px;background:#f8fbff;padding:10px}.sd-doc-group summary{cursor:pointer;color:#12365a;font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;margin-bottom:8px}.sd-doc-group summary span{float:right;background:#eaf5ff;border-radius:999px;padding:2px 8px}.sd-doc-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:7px;text-align:left;margin:0 0 8px;padding:12px;border:1px solid #dfe7f1;border-radius:14px;background:#fff;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}.sd-doc-row:hover,.sd-doc-row.selected{border-color:#2f80c4;box-shadow:0 6px 14px rgba(47,128,196,.14)}.sd-doc-row.archived{background:#fff7ed;border-color:#fdba74}.sd-doc-row-main strong{display:block;color:#0b2744}.sd-doc-row-main small{display:block;color:#5d6b78;margin-top:3px;overflow:hidden;text-overflow:ellipsis}.sd-row-pills{display:flex;gap:6px;flex-wrap:wrap}.sd-pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;text-transform:uppercase;border:1px solid #d1d9e4;background:#f8fafc;color:#475569}.sd-pill.green{background:#e7f6ec;color:#14532d;border-color:#bde5c9}.sd-pill.blue{background:#eaf5ff;color:#12365a;border-color:#c9e4f8}.sd-pill.amber{background:#fff7ed;color:#9a4a00;border-color:#fed7aa}.sd-pill.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.sd-muted{color:#5d6b78;font-size:12px;line-height:1.45}.sd-note{margin-top:6px;padding:8px;border-radius:10px;background:#f8fafc;color:#475569;font-size:12px}.sd-mode-card{min-height:260px;display:flex;align-items:center;justify-content:center;text-align:center}.sd-mode-card-inner{max-width:520px}.sd-mode-card h2{margin:0 0 10px;color:#0b2744;font-size:26px}.sd-editor-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #dfe7f1}.sd-editor-title h2{margin:0;color:#0b2744;font-size:22px}.sd-editor-title p{margin:6px 0 0;color:#64748b;font-size:13px}.sd-lock-warning{padding:12px 14px;margin-bottom:12px;border-radius:14px;border:1px solid #fdba74;background:#fff7ed;color:#9a4a00;font-weight:800;font-size:13px;line-height:1.5}.sd-validation-message{display:none;margin:10px 0 12px;padding:12px 14px;border-radius:14px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;font-size:13px;line-height:1.45;font-weight:900}.sd-validation-message.is-visible{display:block}.sd-drop.is-invalid{border-color:#ef4444!important;background:#fff1f2!important;box-shadow:0 0 0 4px rgba(239,68,68,.12)}.sd-button,.sd-mini-button{transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease,filter .16s ease}.sd-button:not(:disabled):hover,.sd-mini-button:not(:disabled):hover{filter:brightness(1.02);box-shadow:0 10px 22px rgba(12,38,64,.18)}.sd-button.primary:not(:disabled):hover,.sd-mini-button.primary:not(:disabled):hover{background:#0b2744;border-color:#0b2744}.sd-button.danger:not(:disabled):hover,.sd-mini-button.danger:not(:disabled):hover{background:#fecaca;border-color:#ef4444}.sd-button:active,.sd-mini-button:active{transform:translateY(0) scale(.99)}.sd-upload-section{margin:14px 0;padding:14px;border:1px solid #dfe7f1;border-radius:16px;background:#f8fbff}.sd-upload-title{margin:0 0 6px;color:#0b2744;font-size:17px}.sd-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sd-drop{min-height:180px;border:2px dashed #aac0d8;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;cursor:pointer;position:relative;overflow:hidden}.sd-drop.is-over{border-color:#2f80c4;background:#eaf5ff}.sd-drop.disabled{opacity:.55;cursor:not-allowed}.sd-drop input{position:absolute;opacity:0;pointer-events:none}.sd-file-chip{display:grid;gap:4px;justify-items:center;margin-bottom:10px}.sd-file-chip span{font-size:12px;color:#5d6b78}.sd-local-preview{width:100%;margin-top:8px}.sd-local-preview-frame{width:100%;height:210px;border:1px solid #dfe7f1;border-radius:12px;background:#fff}.sd-local-preview-message{min-height:110px;display:grid;align-content:center;gap:6px;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b}.sd-local-preview-message strong{color:#0b2744}.sd-confirm-row{grid-template-columns:auto 1fr;gap:9px;align-items:start;margin-top:12px;padding:11px 12px;border-radius:12px;border:1px solid #fed7aa;background:#fff7ed;color:#9a4a00;font-size:13px;font-weight:800}.sd-confirm-row input{margin-top:2px}.sd-confirm-row span{text-align:left;line-height:1.45}.sd-version-list{display:grid;gap:10px}.sd-version-help{padding:10px 12px;border:1px solid #c9e4f8;background:#eaf5ff;color:#12365a;border-radius:12px;font-size:12px;line-height:1.45;font-weight:800}.sd-version-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;border:1px solid #dfe7f1;border-radius:14px;background:#fff;padding:12px}.sd-version-row.is-live{border-color:#bde5c9;background:#f1fbf4}.sd-version-head{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px}.sd-version-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sd-live-note{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;background:#e7f6ec;color:#14532d;font-size:12px;font-weight:900}.sd-dirty{display:inline-flex;margin-left:8px;padding:5px 9px;border-radius:999px;background:#e7f6ec;color:#14532d;font-size:11px;font-weight:900}.sd-dirty.is-dirty{background:#fff7ed;color:#9a4a00}.sd-output{white-space:pre-wrap;background:#0f172a;color:#dbeafe;border-radius:14px;padding:12px;max-height:260px;overflow:auto;font-size:12px}.sd-empty{padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#fff;text-align:center}.sd-preview-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(7,24,42,.72);z-index:2147483000;padding:24px}.sd-preview-backdrop.is-open{display:flex}.sd-preview-modal{width:min(1100px,96vw);height:min(820px,92vh);background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.38);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.sd-preview-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid #dfe7f1;background:#f8fbff}.sd-preview-head strong{color:#0b2744}.sd-preview-frame{width:100%;height:100%;border:0;background:#fff}@media(max-width:920px){.sd-grid,.sd-toolbar,.sd-login,.sd-two,.sd-upload-grid{grid-template-columns:1fr}.sd-version-row,.sd-editor-head{grid-template-columns:1fr;display:grid}.sd-version-actions{justify-content:flex-start}}
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
    renderValidation();
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
          <div class="sd-editor-title"><h2>${escapeHtml(modeLabel)} <span id="sd-dirty" class="sd-dirty">Saved / clean</span></h2><p>${editorMode === "new" ? "Save creates the document record. Upload a PDF to create version 1. Optional Word/source files must be paired with a matching PDF." : "You are editing an existing document record. Uploading files creates a new append-only version; existing versions are never overwritten."}</p></div>
          <button id="sd-close-editor" class="sd-button" type="button">Close Editor</button>
        </div>
        ${archived ? `<div class="sd-lock-warning">This document is archived. Restore it before changing metadata or uploading versions.</div>` : ""}
        <div class="sd-two"><label class="sd-field"><span class="sd-label">Title</span><input id="sd-title" class="sd-input" type="text" ${disabled}></label><label class="sd-field"><span class="sd-label">System Slug / Key</span><input id="sd-document-key" class="sd-input" type="text" readonly><span class="sd-help">Auto-generated and locked. Change only directly in Supabase if absolutely necessary.</span></label></div>
        <div class="sd-two"><label class="sd-field"><span class="sd-label">Category</span><input id="sd-category" class="sd-input" type="text" placeholder="General, Minutes, Bylaws, Aircraft, Orientation" ${disabled}></label><label class="sd-field"><span class="sd-label">Visibility</span><select id="sd-visibility" class="sd-select" ${disabled}><option value="public">Public</option><option value="members">Members</option><option value="admins">Organization Admins</option><option value="board">Board/Internal</option><option value="internal">Platform/Internal</option></select><span class="sd-help">Public appears on the public page. Members/admin/board/internal are hidden from the public page.</span></label></div>
        <label class="sd-field"><span class="sd-label">Sort Order</span><input id="sd-sort-order" class="sd-input" type="number" value="100" ${disabled}></label>
        <label class="sd-field"><span class="sd-label">Description</span><textarea id="sd-description" class="sd-textarea" placeholder="Short description shown next to the document." ${disabled}></textarea></label>
        <section class="sd-upload-section">
          <h3 class="sd-upload-title">Upload New Version Files</h3>
          <p class="sd-subtitle">The live/viewable file must be a PDF. If you upload a Word/source file, upload the matching PDF in the PDF box before saving.</p>
          <div id="sd-upload-validation" class="sd-validation-message" role="alert" aria-live="polite"></div>
          <div class="sd-upload-grid">
            <div id="sd-pdf-drop" class="sd-drop sd-drop-pdf ${archived ? "disabled" : ""}"><input id="sd-pdf-input" type="file" accept="application/pdf,.pdf" ${disabled}><div><div class="sd-label" style="margin-bottom:8px">Viewable PDF / Live File</div><div id="sd-pending-pdf"><span class="sd-muted">No PDF selected. Drag the live/viewable PDF here or click to choose it.</span></div></div></div>
            <div id="sd-source-drop" class="sd-drop sd-drop-source ${archived ? "disabled" : ""}"><input id="sd-source-input" type="file" accept=".doc,.docx,.odt,.rtf,.txt,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ${disabled}><div><div class="sd-label" style="margin-bottom:8px">Editable Source File</div><div id="sd-pending-source"><span class="sd-muted">No source file selected. Optional: drag the editable Word/source file here.</span></div></div></div>
          </div>
          <label id="sd-pdf-confirm-wrap" class="sd-confirm-row" style="display:none"><input id="sd-pdf-confirm" type="checkbox" ${disabled}><span>I confirm the PDF rendition matches the editable/source file uploaded with this version.</span></label>
        </section>
        <div class="sd-two" style="margin-top:12px"><label class="sd-field"><span class="sd-label">New Version Status</span><select id="sd-version-status" class="sd-select" ${disabled}><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option></select></label><label class="sd-field"><span class="sd-label">Publish Now</span><select id="sd-publish-now" class="sd-select" ${disabled}><option value="false">No</option><option value="true">Yes - publish uploaded PDF</option></select><span class="sd-help">Publish Now requires a PDF. Public/member pages preview/download only the PDF rendition.</span></label></div>
        <label class="sd-field"><span class="sd-label">Version Notes</span><textarea id="sd-version-notes" class="sd-textarea" placeholder="Optional notes for this upload/version." ${disabled}></textarea></label>
        <div id="sd-save-validation" class="sd-validation-message" role="alert" aria-live="polite"></div>
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
      resetPendingFiles(false);
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
    const pdfDrop = getEl("sd-pdf-drop");
    const pdfInput = getEl("sd-pdf-input");
    const sourceDrop = getEl("sd-source-drop");
    const sourceInput = getEl("sd-source-input");
    function bindDrop(drop, input, setter) {
      drop?.addEventListener("click", () => input?.click());
      input?.addEventListener("change", () => setter(input.files && input.files[0]));
      ["dragenter", "dragover"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-over"); }));
      ["dragleave", "drop"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-over"); }));
      drop?.addEventListener("drop", (event) => setter(event.dataTransfer?.files?.[0] || null));
    }
    if (!isCurrentDocumentArchived()) {
      bindDrop(pdfDrop, pdfInput, setPendingPdfFile);
      bindDrop(sourceDrop, sourceInput, setPendingSourceFile);
      getEl("sd-pdf-confirm")?.addEventListener("change", markDirty);
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
