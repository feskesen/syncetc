// ADMIN-PAGE-documents-current.js
// Internal Version: 2026-06-05-001
// Purpose: Platform-admin Documents / Resources manager with private storage uploads, document metadata, versions, publish workflow, archive/restore, and signed downloads.
// Actions used: list_customers, list_documents, upsert_document, archive_document, restore_document, list_document_versions, create_document_version, approve_document_version, publish_document_version, reject_document_version, get_document_download_url.

(function () {
  "use strict";

  const VERSION = "2026-06-05-001";
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
  let pendingFile = null;
  let isDirty = false;
  let isHydrating = false;
  let cleanSignature = "";
  let includeArchived = true;

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
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function getEl(id) { return document.getElementById(id); }
  function getValue(id, fallback = "") { const el = getEl(id); return el ? el.value : fallback; }
  function setValue(id, value) { const el = getEl(id); if (el) el.value = value ?? ""; }
  function getChecked(id) { return Boolean(getEl(id)?.checked); }
  function setChecked(id, value) { const el = getEl(id); if (el) el.checked = Boolean(value); }

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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

  function statusPill(label, tone) { return `<span class="sd-pill ${tone || "neutral"}">${escapeHtml(label)}</span>`; }
  function setStatus(message) { const el = getEl("sd-status"); if (el) el.textContent = message || ""; }
  function setOutput(value) { const el = getEl("sd-output"); if (el) el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); }

  function setShellDirty(value) {
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setDirty(value, DIRTY_MESSAGE);
  }

  function markDirty() {
    if (isHydrating) return;
    isDirty = true;
    setShellDirty(true);
    renderDirty();
  }

  function markClean() {
    isDirty = false;
    cleanSignature = formSignature();
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

  function formSignature() {
    return JSON.stringify({
      document_id: selectedDocumentId || "",
      title: getValue("sd-title"),
      document_key: getValue("sd-document-key"),
      category: getValue("sd-category"),
      visibility: getValue("sd-visibility"),
      sort_order: getValue("sd-sort-order"),
      description: getValue("sd-description"),
      pending_file: pendingFile ? `${pendingFile.name}:${pendingFile.size}:${pendingFile.type}` : "",
      publish_now: getValue("sd-publish-now") === "true",
      version_status: getValue("sd-version-status"),
      version_notes: getValue("sd-version-notes"),
    });
  }

  function bindDirty(root) {
    root.querySelectorAll("input, textarea, select").forEach((el) => {
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
    pendingFile = null;
    if (window.SyncEtcAdminShell) window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: false, email: "" });
    render();
  }

  async function loadCustomers() {
    const result = await callCoreAdminAction("list_customers", {});
    customers = Array.isArray(result.customers) ? result.customers : [];
    if (!selectedCustomerId && customers[0]) selectedCustomerId = String(customers[0].customer_id);
    render();
    if (selectedCustomerId) await loadDocuments();
  }

  async function loadDocuments(preserveSelected = true) {
    if (!selectedCustomerId) return;
    const result = await callCoreAdminAction("list_documents", { organization_id: selectedCustomerId, include_archived: includeArchived });
    documents = Array.isArray(result.documents) ? result.documents : [];
    if (!preserveSelected || !documents.some((doc) => String(doc.document_id) === String(selectedDocumentId))) selectedDocumentId = "";
    renderDocumentList();
    if (selectedDocumentId) await loadVersions();
    setStatus(`Loaded ${documents.length} document record${documents.length === 1 ? "" : "s"}.`);
  }

  async function loadVersions() {
    versions = [];
    if (!selectedCustomerId || !selectedDocumentId) { renderVersions(); return; }
    const result = await callCoreAdminAction("list_document_versions", { organization_id: selectedCustomerId, document_id: selectedDocumentId });
    versions = Array.isArray(result.versions) ? result.versions : [];
    renderVersions();
  }

  function currentDocument() { return documents.find((doc) => String(doc.document_id) === String(selectedDocumentId)) || null; }

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
    isHydrating = false;
    markClean();
  }

  function newDocument() {
    if (!confirmDiscard("Discard unsaved document changes and start a new document?")) return;
    selectedDocumentId = "";
    versions = [];
    hydrateDocument(null);
    renderDocumentList();
    renderVersions();
    setStatus("Ready for a new document.");
  }

  function selectDocument(id) {
    if (String(id) === String(selectedDocumentId)) return;
    if (!confirmDiscard("Discard unsaved document changes and switch records?")) return;
    selectedDocumentId = String(id || "");
    hydrateDocument(currentDocument());
    renderDocumentList();
    loadVersions().catch(showError);
  }

  function documentPayload(documentId) {
    const title = cleanText(getValue("sd-title"));
    if (!title) throw new Error("Document title is required.");
    return {
      organization_id: selectedCustomerId,
      document_id: documentId || selectedDocumentId || undefined,
      requested_document_id: documentId && !selectedDocumentId ? documentId : undefined,
      title,
      document_key: getValue("sd-document-key") || normalizeKey(title),
      category: getValue("sd-category") || "General",
      visibility: getValue("sd-visibility") || "members",
      sort_order: Number(getValue("sd-sort-order") || 100),
      description: getValue("sd-description"),
    };
  }

  async function saveDocument() {
    if (!selectedCustomerId) throw new Error("Select a customer/organization first.");
    const targetDocumentId = selectedDocumentId || crypto.randomUUID();
    setStatus("Saving document metadata...");
    const result = await callCoreAdminAction("upsert_document", documentPayload(targetDocumentId));
    const document = result.document;
    selectedDocumentId = String(document.document_id);

    if (pendingFile) {
      await uploadPendingFileAndCreateVersion(document);
    }

    pendingFile = null;
    await loadDocuments(true);
    const savedDoc = documents.find((doc) => String(doc.document_id) === selectedDocumentId) || document;
    hydrateDocument(savedDoc);
    await loadVersions();
    setStatus("Document saved.");
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
    await loadDocuments(true);
    hydrateDocument(currentDocument() || doc);
    setStatus(`Document ${archive ? "archived" : "restored"}.`);
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

  async function downloadVersion(versionId) {
    const result = await callCoreAdminAction("get_document_download_url", { organization_id: selectedCustomerId, version_id: versionId });
    if (!result.signed_url) throw new Error("No signed download URL was returned.");
    window.open(result.signed_url, "_blank", "noopener,noreferrer");
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
    getEl("sd-clear-pending-file")?.addEventListener("click", () => { pendingFile = null; renderPendingFile(); markDirty(); });
  }

  function renderDocumentList() {
    const list = getEl("sd-document-list");
    if (!list) return;
    if (!documents.length) {
      list.innerHTML = `<div class="sd-empty">No documents yet.</div>`;
      return;
    }
    const grouped = documents.reduce((acc, doc) => {
      const key = cleanText(doc.category || "General") || "General";
      (acc[key] ||= []).push(doc);
      return acc;
    }, {});
    list.innerHTML = Object.keys(grouped).sort().map((category) => `
      <section class="sd-doc-group">
        <h3>${escapeHtml(category)}</h3>
        ${grouped[category].map((doc) => {
          const archived = doc.archived_at || doc.status === "archived";
          const selected = String(doc.document_id) === String(selectedDocumentId);
          const visibilityTone = doc.visibility === "public" ? "green" : doc.visibility === "members" ? "blue" : "amber";
          return `<button type="button" class="sd-doc-row ${selected ? "selected" : ""} ${archived ? "archived" : ""}" data-doc-id="${escapeHtml(doc.document_id)}">
            <span><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.description || doc.document_key || "")}</small></span>
            <span class="sd-row-pills">${statusPill(doc.visibility, visibilityTone)} ${statusPill(archived ? "archived" : "active", archived ? "red" : "green")} ${doc.published_version_number ? statusPill(`v${doc.published_version_number} live`, "blue") : statusPill("no live version", "neutral")}</span>
          </button>`;
        }).join("")}
      </section>`).join("");
    list.querySelectorAll("[data-doc-id]").forEach((btn) => btn.addEventListener("click", () => selectDocument(btn.dataset.docId)));
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
    wrap.innerHTML = versions.map((v) => {
      const tone = v.version_status === "published" ? "green" : v.version_status === "superseded" ? "neutral" : v.version_status === "rejected" ? "red" : v.version_status === "approved" ? "blue" : "amber";
      return `<article class="sd-version-row">
        <div>
          <strong>v${escapeHtml(v.version_number)} ${escapeHtml(v.version_label || "")}</strong>
          ${statusPill(v.version_status, tone)}
          <div class="sd-muted">${escapeHtml(v.original_file_name || "file")} • ${escapeHtml(formatBytes(v.file_size_bytes))} • uploaded ${escapeHtml(v.created_at || "")}</div>
          ${v.notes ? `<div class="sd-note">${escapeHtml(v.notes)}</div>` : ""}
        </div>
        <div class="sd-version-actions">
          <button type="button" class="sd-mini-button" data-download-version="${escapeHtml(v.version_id)}">Download</button>
          ${v.version_status !== "approved" && v.version_status !== "published" && v.version_status !== "superseded" ? `<button type="button" class="sd-mini-button" data-approve-version="${escapeHtml(v.version_id)}">Approve</button>` : ""}
          ${v.version_status !== "published" ? `<button type="button" class="sd-mini-button primary" data-publish-version="${escapeHtml(v.version_id)}">Publish</button>` : ""}
          ${!["rejected", "published", "superseded"].includes(String(v.version_status)) ? `<button type="button" class="sd-mini-button danger" data-reject-version="${escapeHtml(v.version_id)}">Reject</button>` : ""}
        </div>
      </article>`;
    }).join("");
    wrap.querySelectorAll("[data-download-version]").forEach((btn) => btn.addEventListener("click", () => downloadVersion(btn.dataset.downloadVersion).catch(showError)));
    wrap.querySelectorAll("[data-approve-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.approveVersion, "approve_document_version", "Approve this version?").catch(showError)));
    wrap.querySelectorAll("[data-publish-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.publishVersion, "publish_document_version", "Publish this version? This will replace the current live version for the selected audience.").catch(showError)));
    wrap.querySelectorAll("[data-reject-version]").forEach((btn) => btn.addEventListener("click", () => setVersionStatus(btn.dataset.rejectVersion, "reject_document_version", "Reject this version?").catch(showError)));
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Error: ${message}`);
    setOutput({ ok: false, message });
    console.error(error);
  }

  function render() {
    const root = ensureRoot();
    root.innerHTML = `
      <style>
        .sd-wrap{max-width:1180px;margin:24px auto 60px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033;box-sizing:border-box}.sd-wrap *{box-sizing:border-box}.sd-panel{background:#fff;border:1px solid #dfe7f1;border-radius:22px;box-shadow:0 14px 38px rgba(12,38,64,.12);overflow:hidden}.sd-head{padding:24px 26px;background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.sd-head h1{margin:0;font-size:clamp(30px,4vw,50px);line-height:1;font-weight:900;letter-spacing:-.04em}.sd-head p{max-width:880px;margin:10px 0 0;color:rgba(255,255,255,.88);line-height:1.55}.sd-body{padding:20px;background:linear-gradient(180deg,#eef7ff,#fff)}.sd-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;margin-bottom:14px;padding:12px;border-radius:16px;background:#fff;border:1px solid #dfe7f1}.sd-input,.sd-select,.sd-textarea{width:100%;border:1px solid #ccd8e5;border-radius:12px;padding:10px 12px;font:inherit;background:#fff;color:#172033}.sd-textarea{min-height:92px;resize:vertical}.sd-button,.sd-mini-button{border:1px solid #b9c8d8;border-radius:999px;background:#fff;color:#12365a;font-weight:900;cursor:pointer;padding:9px 13px}.sd-button.primary,.sd-mini-button.primary{background:#12365a;color:#fff;border-color:#12365a}.sd-button.danger,.sd-mini-button.danger{background:#fee2e2;color:#991b1b;border-color:#f3b9b9}.sd-mini-button{padding:7px 10px;font-size:12px}.sd-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:10px;align-items:end;margin-bottom:14px}.sd-grid{display:grid;grid-template-columns:390px minmax(0,1fr);gap:16px;align-items:start}.sd-card{background:rgba(255,255,255,.94);border:1px solid #dfe7f1;border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(12,38,64,.08)}.sd-section-title{margin:0 0 10px;color:#0b2744;font-size:18px}.sd-subtitle{margin:0 0 14px;color:#5d6b78;font-size:13px;line-height:1.5}.sd-field{display:grid;gap:6px;margin-bottom:12px}.sd-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#4b6582}.sd-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sd-document-list{display:grid;gap:12px;max-height:720px;overflow:auto;padding-right:4px}.sd-doc-group h3{margin:0 0 8px;color:#12365a;font-size:13px;text-transform:uppercase;letter-spacing:.08em}.sd-doc-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:7px;text-align:left;margin:0 0 8px;padding:11px;border:1px solid #dfe7f1;border-radius:14px;background:#fff;cursor:pointer}.sd-doc-row:hover,.sd-doc-row.selected{border-color:#2f80c4;box-shadow:0 6px 14px rgba(47,128,196,.14)}.sd-doc-row.archived{background:#fff7ed;border-color:#fdba74}.sd-doc-row strong{display:block;color:#0b2744}.sd-doc-row small{display:block;color:#5d6b78;margin-top:3px;overflow:hidden;text-overflow:ellipsis}.sd-row-pills{display:flex;gap:6px;flex-wrap:wrap}.sd-pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;text-transform:uppercase;border:1px solid #d1d9e4;background:#f8fafc;color:#475569}.sd-pill.green{background:#e7f6ec;color:#14532d;border-color:#bde5c9}.sd-pill.blue{background:#eaf5ff;color:#12365a;border-color:#c9e4f8}.sd-pill.amber{background:#fff7ed;color:#9a4a00;border-color:#fed7aa}.sd-pill.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.sd-muted{color:#5d6b78;font-size:12px;line-height:1.45}.sd-note{margin-top:6px;padding:8px;border-radius:10px;background:#f8fafc;color:#475569;font-size:12px}.sd-drop{min-height:118px;border:2px dashed #aac0d8;border-radius:16px;background:#f8fbff;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;cursor:pointer}.sd-drop.is-over{border-color:#2f80c4;background:#eaf5ff}.sd-drop input{position:absolute;opacity:0;pointer-events:none}.sd-file-chip{display:grid;gap:4px;justify-items:center}.sd-file-chip span{font-size:12px;color:#5d6b78}.sd-version-list{display:grid;gap:10px}.sd-version-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;border:1px solid #dfe7f1;border-radius:14px;background:#fff;padding:12px}.sd-version-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sd-dirty{display:inline-flex;margin-left:8px;padding:5px 9px;border-radius:999px;background:#e7f6ec;color:#14532d;font-size:11px;font-weight:900}.sd-dirty.is-dirty{background:#fff7ed;color:#9a4a00}.sd-output{white-space:pre-wrap;background:#0f172a;color:#dbeafe;border-radius:14px;padding:12px;max-height:260px;overflow:auto;font-size:12px}.sd-empty{padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#fff;text-align:center}@media(max-width:920px){.sd-grid,.sd-toolbar,.sd-login,.sd-two{grid-template-columns:1fr}.sd-version-row{grid-template-columns:1fr}}
      </style>
      <div class="sd-wrap">
        <section class="sd-panel">
          <header class="sd-head"><h1>Documents / Resources</h1><p>Manage protected document records, upload versioned files, publish approved versions, and expose only public published documents to the public page.</p></header>
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
      </div>`;

    getEl("sd-login")?.addEventListener("click", () => login().catch(showError));
    getEl("sd-logout")?.addEventListener("click", () => logout().catch(showError));
    if (isAuthenticated) bindMainEvents();
  }

  function mainHtml() {
    const customerOptions = customers.map((c) => `<option value="${escapeHtml(c.customer_id)}" ${String(c.customer_id) === selectedCustomerId ? "selected" : ""}>${escapeHtml(c.display_name || c.customer_key || c.customer_id)}</option>`).join("");
    return `
      <div class="sd-toolbar">
        <label class="sd-field" style="margin:0"><span class="sd-label">Organization</span><select id="sd-customer-select" class="sd-select">${customerOptions}</select></label>
        <label class="sd-field" style="margin:0"><span class="sd-label">Show Archived</span><select id="sd-include-archived" class="sd-select"><option value="true" ${includeArchived ? "selected" : ""}>Yes</option><option value="false" ${!includeArchived ? "selected" : ""}>No</option></select></label>
        <button id="sd-refresh" class="sd-button" type="button">Refresh</button>
        <button id="sd-new" class="sd-button primary" type="button">New Document</button>
      </div>
      <div class="sd-grid">
        <section class="sd-card"><h2 class="sd-section-title">Document Records</h2><p class="sd-subtitle">Every file upload becomes a new version. Existing versions are never overwritten.</p><div id="sd-document-list" class="sd-document-list"></div></section>
        <section class="sd-card">
          <h2 class="sd-section-title">Editor <span id="sd-dirty" class="sd-dirty">Saved / clean</span></h2>
          <div class="sd-two"><label class="sd-field"><span class="sd-label">Title</span><input id="sd-title" class="sd-input" type="text"></label><label class="sd-field"><span class="sd-label">Document Key / Slug</span><input id="sd-document-key" class="sd-input" type="text" placeholder="auto-generated if blank"></label></div>
          <div class="sd-two"><label class="sd-field"><span class="sd-label">Category</span><input id="sd-category" class="sd-input" type="text" placeholder="General, Minutes, Bylaws, Aircraft, Orientation"></label><label class="sd-field"><span class="sd-label">Visibility</span><select id="sd-visibility" class="sd-select"><option value="public">Public</option><option value="members">Members</option><option value="admins">Admins</option><option value="board">Board/Internal</option><option value="internal">Internal</option></select></label></div>
          <label class="sd-field"><span class="sd-label">Sort Order</span><input id="sd-sort-order" class="sd-input" type="number" value="100"></label>
          <label class="sd-field"><span class="sd-label">Description</span><textarea id="sd-description" class="sd-textarea" placeholder="Short description shown next to the document."></textarea></label>
          <div id="sd-drop" class="sd-drop"><input id="sd-file-input" type="file"><div id="sd-pending-file"><span class="sd-muted">No file selected. Drag a file here or click to choose one.</span></div></div>
          <div class="sd-two" style="margin-top:12px"><label class="sd-field"><span class="sd-label">New Version Status</span><select id="sd-version-status" class="sd-select"><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option></select></label><label class="sd-field"><span class="sd-label">Publish Now</span><select id="sd-publish-now" class="sd-select"><option value="false">No</option><option value="true">Yes - publish uploaded version</option></select></label></div>
          <label class="sd-field"><span class="sd-label">Version Notes</span><textarea id="sd-version-notes" class="sd-textarea" placeholder="Optional notes for this upload/version."></textarea></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><button id="sd-save" class="sd-button primary" type="button">Save Document</button><button id="sd-archive" class="sd-button danger" type="button">Archive</button><button id="sd-restore" class="sd-button" type="button">Restore</button></div>
          <h2 class="sd-section-title">Version History</h2><div id="sd-version-list" class="sd-version-list"></div>
          <p id="sd-status" class="sd-subtitle" style="margin-top:14px">Ready.</p>
          <h2 class="sd-section-title">Backend Results</h2><pre id="sd-output" class="sd-output"></pre>
        </section>
      </div>`;
  }

  function bindMainEvents() {
    getEl("sd-customer-select")?.addEventListener("change", async (e) => {
      if (!confirmDiscard("Discard unsaved document changes and switch organization?")) { e.target.value = selectedCustomerId; return; }
      selectedCustomerId = e.target.value;
      selectedDocumentId = "";
      versions = [];
      hydrateDocument(null);
      await loadDocuments(false);
    });
    getEl("sd-include-archived")?.addEventListener("change", async (e) => { includeArchived = e.target.value === "true"; await loadDocuments(true); });
    getEl("sd-refresh")?.addEventListener("click", () => loadDocuments(true).catch(showError));
    getEl("sd-new")?.addEventListener("click", newDocument);
    getEl("sd-save")?.addEventListener("click", () => saveDocument().catch(showError));
    getEl("sd-archive")?.addEventListener("click", () => archiveOrRestoreDocument(true).catch(showError));
    getEl("sd-restore")?.addEventListener("click", () => archiveOrRestoreDocument(false).catch(showError));
    const drop = getEl("sd-drop");
    const input = getEl("sd-file-input");
    drop?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => setPendingFile(input.files && input.files[0]));
    ["dragenter", "dragover"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((name) => drop?.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-over"); }));
    drop?.addEventListener("drop", (event) => setPendingFile(event.dataTransfer?.files?.[0] || null));
    bindDirty(getEl(ROOT_ID));
    hydrateDocument(currentDocument());
    renderDocumentList();
    renderVersions();
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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
