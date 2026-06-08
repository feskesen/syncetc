// USER-PAGE-documents-current.js
// Internal Version: 2026-06-08-026-E
// Purpose: Access-aware protected document viewer. Shows only member document visibility for the selected organization.

(function () {
  "use strict";

  const VERSION = "2026-06-08-026-E";
  const ROOT_IDS = ["syncetc-user-documents-root", "syncetc-member-documents-root"];
  const PAGE_KEY = "member-documents";
  const DOCUMENT_SCOPE = "member";
  const DEFAULT_TITLE = "Member Documents";
  const DEFAULT_INTRO = "Member-only documents and resources for this organization.";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const PROJECT_REF = "bxywokidhgppmlzyqvem";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let platformAdmin = false;
  let documents = [];
  let summary = null;
  let pageInfo = null;
  let backend = null;
  let authChecked = false;
  let loading = true;
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let searchTerm = "";
  let searchDraft = "";
  let activeCategory = "all";

  const DEBUG = new URLSearchParams(location.search).get("syncetc_debug") === "1";
  const DIAG_START = (window.performance && performance.now) ? performance.now() : Date.now();
  const diagSteps = [];
  function nowMs() { return Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - DIAG_START); }
  function diag(step, detail = "") {
    if (!DEBUG) return;
    diagSteps.push({ ms: nowMs(), step, detail: String(detail || "") });
    try { console.log(`[SyncEtc ${PAGE_KEY} ${VERSION}] ${nowMs()}ms ${step}${detail ? " — " + detail : ""}`); } catch {}
  }
  function diagnosticsHtml() {
    if (!DEBUG) return "";
    const lines = diagSteps.map((d) => `${String(d.ms).padStart(6, " ")}ms  ${d.step}${d.detail ? " — " + d.detail : ""}`).join("\n");
    return `<pre class="protected-docs-backend" style="display:block">SyncEtc Documents Page Diagnostics ${esc(VERSION)}\nPage: ${esc(PAGE_KEY)}\nScope: ${esc(DOCUMENT_SCOPE)}\nElapsed: ${esc(nowMs())}ms\nToken: ${token ? "yes" : "no"}\nEmail: ${esc(email || "none")}\nAccess rows: ${esc(access.length)}\nSelected org: ${esc(selectedOrgId || "none")}\nDocuments: ${esc(documents.length)}\n\nSteps:\n${esc(lines)}</pre>`;
  }
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];

  function rootEl() {
    let root = ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean);
    if (!root) { root = document.createElement("div"); root.id = ROOT_IDS[0]; document.body.appendChild(root); }
    return root;
  }

  function loadScript(src) {
    diag("loadScript:start", src);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { diag("loadScript:cached", src); return resolve(); }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => { diag("loadScript:loaded", src); resolve(); };
      s.onerror = () => { diag("loadScript:error", src); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(s);
    });
  }

  async function ensureSupabase() {
    diag("ensureSupabase:start");
    if (supabaseClient) { diag("ensureSupabase:cached"); return supabaseClient; }
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    diag("ensureSupabase:created-client");
    return supabaseClient;
  }

  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }
  function organizationOptions() { return access.map((row) => ({ organization_id: row.organization_id, organization_name: row.organization_name, organization_key: row.organization_key })); }
  function hasStyle(row) { const profile = obj(row?.style_profile); const colors = obj(profile.colors_json); return Boolean(row && profile && Object.keys(profile).length && colors && Object.keys(colors).length); }

  function setShellState() {
    const row = selectedAccess();
    diag("setShellState", `org=${row?.organization_key || "none"} style=${hasStyle(row) ? "yes" : "no"} access=${access.length}`);
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: DOCUMENT_SCOPE === "internal" ? "admin" : "user",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      organizationId: row?.organization_id || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizationOptions: organizationOptions(),
      organizations: organizationOptions(),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
      activePageKey: PAGE_KEY
    });
  }

  async function getToken() {
    diag("getToken:start");
    await ensureSupabase();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    diag("getToken:done", token ? `logged in as ${email}` : "not logged in");
    return token;
  }

  async function call(action, payload = {}) {
    diag("call:start", action);
    const callStarted = nowMs();
    const activeToken = token || await getToken();
    if (!activeToken) throw new Error("Login required.");
    const res = await fetch(EDGE_URL, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${activeToken}`, "apikey":SUPABASE_ANON_KEY }, body: JSON.stringify({ action, ...payload }) });
    const text = await res.text();
    diag("call:response", `${action} HTTP ${res.status} in ${nowMs() - callStarted}ms`);
    let data;
    try { data = JSON.parse(text); } catch { data = { ok:false, message:text || `HTTP ${res.status}` }; }
    backend = data;
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function shouldWaitForSession() {
    try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; }
    catch { return false; }
  }

  function clearJustLoggedIn() {
    try { window.sessionStorage.removeItem("syncetc_just_logged_in"); }
    catch {}
  }

  function readStoredSupabaseSession() {
    try {
      const raw = window.localStorage.getItem(`sb-${PROJECT_REF}-auth-token`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const session = parsed?.currentSession || parsed?.session || parsed;
      if (!session?.access_token) return null;
      const expiresAt = Number(session.expires_at || 0);
      if (expiresAt && expiresAt * 1000 < Date.now() - 30000) return null;
      return session;
    } catch {
      return null;
    }
  }

  async function getStableSession() {
    diag("getStableSession:start", shouldWaitForSession() ? "just_logged_in" : "normal");
    const attempts = shouldWaitForSession() ? 14 : 8;
    for (let i = 0; i < attempts; i += 1) {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (data?.session?.access_token) {
        clearJustLoggedIn();
        diag("getStableSession:done", `session from supabase ${data.session.user?.email || ""}`);
        return data.session;
      }
      const storedSession = readStoredSupabaseSession();
      if (storedSession?.access_token) {
        clearJustLoggedIn();
        diag("getStableSession:done", "session from localStorage");
        return storedSession;
      }
      if (i < attempts - 1) await sleep(150);
    }
    clearJustLoggedIn();
    diag("getStableSession:done", "no session");
    return null;
  }

  async function refresh() {
    diag("refresh:start");
    loading = true;
    try {
      await ensureSupabase();
      const session = await getStableSession();
      token = session?.access_token || "";
      email = session?.user?.email || "";
      authChecked = true;
      diag("refresh:session", token ? `logged in as ${email}` : "not logged in");
      if (!token) {
        access = [];
        selectedOrgId = "";
        platformAdmin = false;
        documents = [];
        summary = null;
        pageInfo = null;
        setShellState();
        loading = false;
        render();
        return;
      }
      const dash = await call("get_user_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
      platformAdmin = Boolean(dash.platform_admin);
      access = arr(dash.access);
      diag("refresh:access", `${access.length} row(s), platform=${Boolean(dash.platform_admin)}`);
      if (!access.length) throw new Error("No organization access found for this account.");
      if (!selectedOrgId || !access.some((row) => String(row.organization_id) === String(selectedOrgId))) selectedOrgId = access[0].organization_id;
      setShellState();
      const result = await call("organization_list_documents", { organization_id: selectedOrgId, document_scope: DOCUMENT_SCOPE, page_key: PAGE_KEY });
      documents = arr(result.documents);
      diag("refresh:documents", `${documents.length} document(s)`);
      summary = obj(result.summary);
      pageInfo = result.page || null;
      setShellState();
      message = `Version ${VERSION}`;
      messageKind = "";
    } catch (error) {
      diag("refresh:error", error.message || String(error));
      message = error.message || String(error);
      messageKind = "warn";
    } finally {
      loading = false;
      diag("refresh:finally", `loading=${loading} token=${token ? "yes" : "no"} docs=${documents.length}`);
      render();
    }
  }

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) throw new Error("STYLE CONFIGURATION ERROR: active organization style is missing a valid primary color.");
    return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, field, fallback = "") { const v = obj(source)[field]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function styleConfig(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const spacing = obj(profile.spacing_json);
    const effects = obj(profile.effects_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors, "brand_primary", "");
    const secondary = getText(colors, "brand_secondary", "");
    const surface = getText(colors, "surface", "");
    const text = getText(colors, "text", "");
    const width = getText(spacing, "page_width", getText(layout, "default_width", ""));
    if (!primary || !secondary || !surface || !text || !width) throw new Error(`STYLE CONFIGURATION ERROR: active organization style profile was not loaded for ${DEFAULT_TITLE}.`);
    const corners = getText(effects, "corners", "soft");
    return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius: corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px", pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px" };
  }
  function cssVars(cfg) { return `--docs-primary:${cfg.primary};--docs-secondary:${cfg.secondary};--docs-surface:${cfg.surface};--docs-text:${cfg.text};--docs-muted:${cfg.muted};--docs-border:${cfg.border};--docs-soft:${cfg.soft};--docs-strong-soft:${cfg.strongSoft};--docs-shadow:${cfg.shadow};--docs-radius:${cfg.radius};--docs-page-width:${cfg.pageWidth};`; }

  function fullCss(cfg) { return `
    .protected-docs-wrap{${cssVars(cfg)}max-width:var(--docs-page-width);margin:24px auto 30px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--docs-text);box-sizing:border-box}.protected-docs-wrap *{box-sizing:border-box}
    .protected-docs-card{background:rgba(255,255,255,.96);border:1px solid var(--docs-border);border-radius:var(--docs-radius);box-shadow:var(--docs-shadow);padding:22px;margin:16px 0}.protected-docs-hero{background:linear-gradient(135deg,var(--docs-primary),${rgba(cfg.primary,.78)});color:#fff}.protected-docs-hero h1{margin:10px 0 8px;font-size:clamp(32px,4vw,48px);color:#fff;letter-spacing:-.04em}.protected-docs-hero p{margin:0;color:rgba(255,255,255,.9);line-height:1.45}.protected-docs-eyebrow{display:inline-flex;border-radius:999px;background:rgba(255,255,255,.16);padding:6px 10px;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .protected-docs-message{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.15);font-weight:900}.protected-docs-message.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.protected-docs-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center}.protected-docs-search{min-height:44px;border:1px solid var(--docs-border);border-radius:999px;padding:10px 14px;font:inherit;color:var(--docs-text)}.protected-docs-btn{border:0;border-radius:999px;background:var(--docs-primary);color:#fff!important;font-weight:950;padding:11px 16px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.protected-docs-btn.secondary{background:var(--docs-strong-soft);color:var(--docs-primary)!important}
    .protected-docs-summary{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.protected-docs-pill{display:inline-flex;border:1px solid var(--docs-border);border-radius:999px;background:#fff;color:var(--docs-primary);font-weight:950;font-size:12px;padding:7px 11px}.protected-docs-categories{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.protected-docs-cat{border:1px solid var(--docs-border);border-radius:999px;background:#fff;color:var(--docs-primary);font-weight:950;font-size:12px;padding:8px 12px;cursor:pointer}.protected-docs-cat.active{background:var(--docs-primary);color:#fff}
    .protected-docs-groups{display:grid;gap:16px}.protected-docs-group{border:1px solid var(--docs-border);border-radius:var(--docs-radius);background:rgba(255,255,255,.9);overflow:hidden}.protected-docs-group summary{cursor:pointer;list-style:none;padding:17px 20px;color:var(--docs-primary);font-size:20px;font-weight:950}.protected-docs-group summary::-webkit-details-marker{display:none}.protected-docs-group summary span{float:right;font-size:12px;border:1px solid var(--docs-border);border-radius:999px;padding:4px 9px;color:var(--docs-muted);background:var(--docs-soft)}
    .protected-docs-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px;padding:0 18px 18px}.protected-docs-doc{display:flex;flex-direction:column;gap:12px;border:1px solid var(--docs-border);border-radius:18px;background:#fff;padding:16px;box-shadow:0 8px 20px rgba(12,38,64,.08);min-width:0}.protected-docs-doc h3{margin:0;font-size:19px;line-height:1.2;color:var(--docs-text);letter-spacing:-.02em}.protected-docs-desc{margin:0;color:var(--docs-muted);font-size:14px;line-height:1.5}.protected-docs-meta{color:var(--docs-muted);font-size:12px;line-height:1.35}.protected-docs-preview{width:100%;aspect-ratio:8.5/11;min-height:320px;max-height:520px;border:1px solid var(--docs-border);border-radius:14px;background:linear-gradient(180deg,#eef2f5,#e5ebf0);overflow:hidden;display:flex;align-items:center;justify-content:center;padding:10px}.protected-docs-preview iframe{width:100%;height:100%;border:0;border-radius:10px;background:#eef2f5}.protected-docs-preview-fallback{padding:14px;color:var(--docs-muted);font-size:13px;text-align:center;font-weight:850}.protected-docs-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:auto}.protected-docs-empty{padding:22px;border:1px dashed var(--docs-border);border-radius:var(--docs-radius);background:#fff;color:var(--docs-muted);text-align:center;font-weight:850}.protected-docs-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font:12px/1.45 Consolas,Monaco,monospace;max-height:260px;overflow:auto;display:${DEBUG ? "block" : "none"}}.protected-docs-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(7,24,42,.72);z-index:2147483000;padding:24px}.protected-docs-modal-backdrop.is-open{display:flex}.protected-docs-modal{width:min(1100px,96vw);height:min(820px,92vh);background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.38);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.protected-docs-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--docs-border);background:var(--docs-soft)}.protected-docs-modal-frame{width:100%;height:100%;border:0;background:#fff}
    @media(max-width:760px){.protected-docs-toolbar{grid-template-columns:1fr}.protected-docs-list{grid-template-columns:1fr}.protected-docs-actions{grid-template-columns:1fr}.protected-docs-btn{width:100%}.protected-docs-preview{min-height:360px;max-height:70vh}}
  `; }

  function signedPdfPreviewUrl(url) { const u = clean(url); return u ? (u.includes("#") ? u : `${u}#toolbar=0&navpanes=0&pagemode=none&view=FitH&zoom=page-fit&page=1`) : ""; }
  function formatDate(value) { if (!value) return ""; try { return new Date(value).toLocaleDateString(); } catch { return ""; } }
  function docMeta(doc) { return [doc.original_file_name, doc.version_number ? `v${doc.version_number}` : "", doc.published_at ? `published ${formatDate(doc.published_at)}` : ""].filter(Boolean).join(" • "); }
  function allCategories() { return Array.from(new Set(documents.map((doc) => clean(doc.category || "General") || "General"))).sort(); }
  function filteredDocs() {
    const s = searchTerm.toLowerCase();
    return documents.filter((doc) => {
      const cat = clean(doc.category || "General") || "General";
      if (activeCategory !== "all" && cat !== activeCategory) return false;
      if (!s) return true;
      return [doc.title, doc.description, doc.category, doc.original_file_name].map((v) => clean(v).toLowerCase()).join(" ").includes(s);
    });
  }
  function groupedDocs(rows) { return rows.reduce((acc, doc) => { const cat = clean(doc.category || "General") || "General"; (acc[cat] ||= []).push(doc); return acc; }, {}); }

  function renderLogin(root) {
    diag("renderLogin", `authChecked=${authChecked} token=${token ? "yes" : "no"}`);
    root.style.visibility = "visible";
    root.removeAttribute("data-syncetc-documents-held");
    root.innerHTML = `<div class="protected-docs-wrap"><section class="protected-docs-card"><h1>Login required</h1><p>Use your SyncEtc login to view ${esc(DEFAULT_TITLE)}.</p><button id="protected-docs-login" class="protected-docs-btn" type="button">Go to Login</button></section>${diagnosticsHtml()}</div>`;
    $("protected-docs-login")?.addEventListener("click", () => { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; });
  }

  function renderError(root, error) {
    diag("renderError", error?.message || String(error || ""));
    root.style.visibility = "visible";
    root.removeAttribute("data-syncetc-documents-held");
    const messageText = error?.message || String(error || "Unknown error");
    root.innerHTML = `<div class="protected-docs-wrap"><section class="protected-docs-card"><h1>${esc(DEFAULT_TITLE)}</h1><p class="protected-docs-message warn">${esc(messageText)}</p><button id="protected-docs-retry" class="protected-docs-btn" type="button">Try again</button>${diagnosticsHtml()}<pre class="protected-docs-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></section></div>`;
    $("protected-docs-retry")?.addEventListener("click", refresh);
  }

  function render() {
    const root = rootEl();
    diag("render:start", `authChecked=${authChecked} loading=${loading} token=${token ? "yes" : "no"} access=${access.length} docs=${documents.length}`);
    if (!authChecked && loading) { diag("render:held", "waiting for auth check"); return; }
    if (!token) return renderLogin(root);
    const row = selectedAccess();
    if (!hasStyle(row)) { diag("render:held", "waiting for organization style/access row"); return; }
    let cfg;
    try { cfg = styleConfig(row); } catch (error) { return renderError(root, error); }
    const settings = obj(pageInfo || {});
    const title = clean(settings.title || DEFAULT_TITLE);
    const intro = clean(settings.intro_text || DEFAULT_INTRO);
    const rows = filteredDocs();
    const categories = allCategories();
    const groups = groupedDocs(rows);
    const groupKeys = Object.keys(groups).sort();
    diag("render:styled", `org=${row?.organization_key || ""} docs=${rows.length}`);
    root.style.visibility = "visible";
    root.removeAttribute("data-syncetc-documents-held");
    root.innerHTML = `<style>${fullCss(cfg)}</style><div class="protected-docs-wrap" data-version="${esc(VERSION)}"><section class="protected-docs-card protected-docs-hero"><span class="protected-docs-eyebrow">${DOCUMENT_SCOPE === "internal" ? "Internal" : "Member"} Documents</span><h1>${esc(title)}</h1><p>${esc(intro)}</p><div class="protected-docs-message ${messageKind}">${esc(message || `Version ${VERSION}`)}</div></section><section class="protected-docs-card"><div class="protected-docs-toolbar"><input id="protected-docs-search" class="protected-docs-search" type="search" placeholder="Search documents..." value="${esc(searchDraft)}"><button id="protected-docs-clear" class="protected-docs-btn secondary" type="button">Clear</button><button id="protected-docs-refresh" class="protected-docs-btn secondary" type="button">Refresh</button></div><div class="protected-docs-summary"><span class="protected-docs-pill">${rows.length} document${rows.length === 1 ? "" : "s"}</span><span class="protected-docs-pill">${DOCUMENT_SCOPE === "internal" ? "Internal only" : "Member only"}</span></div><div class="protected-docs-categories"><button class="protected-docs-cat ${activeCategory === "all" ? "active" : ""}" type="button" data-doc-cat="all">All</button>${categories.map((cat) => `<button class="protected-docs-cat ${activeCategory === cat ? "active" : ""}" type="button" data-doc-cat="${esc(cat)}">${esc(cat)}</button>`).join("")}</div></section><section class="protected-docs-card"><div class="protected-docs-groups">${groupKeys.length ? groupKeys.map((cat) => `<details class="protected-docs-group" open><summary>${esc(cat)} <span>${groups[cat].length}</span></summary><div class="protected-docs-list">${groups[cat].map(docCardHtml).join("")}</div></details>`).join("") : `<div class="protected-docs-empty">No ${DOCUMENT_SCOPE === "internal" ? "internal" : "member"} documents are currently available.</div>`}</div></section>${diagnosticsHtml()}<pre class="protected-docs-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre><div class="protected-docs-modal-backdrop" id="protected-docs-modal-backdrop" aria-hidden="true"><div class="protected-docs-modal" role="dialog" aria-modal="true"><div class="protected-docs-modal-head"><strong id="protected-docs-modal-title">Document preview</strong><button type="button" class="protected-docs-btn secondary" id="protected-docs-modal-close">Close</button></div><iframe class="protected-docs-modal-frame" id="protected-docs-modal-frame"></iframe></div></div></div>`;
    bindEvents(root);
  }

  function docCardHtml(doc) {
    const previewUrl = clean(doc.preview_signed_url || doc.signed_url || doc.download_signed_url);
    const downloadUrl = clean(doc.download_signed_url || doc.signed_url || doc.preview_signed_url);
    const inlinePreview = signedPdfPreviewUrl(previewUrl);
    return `<article class="protected-docs-doc"><h3>${esc(doc.title || doc.original_file_name || "Document")}</h3><div class="protected-docs-preview">${inlinePreview ? `<iframe src="${esc(inlinePreview)}" title="${esc(doc.title || doc.original_file_name || "Document")} PDF preview"></iframe>` : `<div class="protected-docs-preview-fallback">PDF preview unavailable. Use Download.</div>`}</div>${doc.description ? `<p class="protected-docs-desc">${esc(doc.description)}</p>` : ""}<div class="protected-docs-meta">${esc(docMeta(doc))}</div><div class="protected-docs-actions">${previewUrl ? `<button type="button" class="protected-docs-btn" data-doc-preview="${esc(previewUrl)}" data-doc-title="${esc(doc.title || doc.original_file_name || "Document")}">View</button>` : ""}${downloadUrl ? `<a class="protected-docs-btn secondary" href="${esc(downloadUrl)}" target="_blank" rel="noopener">Download</a>` : `<span class="protected-docs-meta">Unavailable</span>`}</div></article>`;
  }

  function bindEvents(root) {
    $("protected-docs-refresh")?.addEventListener("click", refresh);
    $("protected-docs-clear")?.addEventListener("click", () => { searchDraft = ""; searchTerm = ""; activeCategory = "all"; render(); });
    $("protected-docs-search")?.addEventListener("input", (e) => { searchDraft = e.target.value || ""; clearTimeout(window.__syncetcDocsSearchTimer); window.__syncetcDocsSearchTimer = setTimeout(() => { searchTerm = searchDraft; render(); }, 280); });
    root.querySelectorAll("[data-doc-cat]").forEach((btn) => btn.addEventListener("click", () => { activeCategory = btn.getAttribute("data-doc-cat") || "all"; render(); }));
    const backdrop = $("protected-docs-modal-backdrop");
    const frame = $("protected-docs-modal-frame");
    const title = $("protected-docs-modal-title");
    const close = $("protected-docs-modal-close");
    function closeModal() { if (!backdrop || !frame) return; backdrop.classList.remove("is-open"); backdrop.setAttribute("aria-hidden", "true"); frame.src = "about:blank"; }
    root.querySelectorAll("[data-doc-preview]").forEach((button) => button.addEventListener("click", () => { if (!backdrop || !frame) return; if (title) title.textContent = button.getAttribute("data-doc-title") || "Document preview"; frame.src = button.getAttribute("data-doc-preview") || "about:blank"; backdrop.classList.add("is-open"); backdrop.setAttribute("aria-hidden", "false"); }));
    close?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(); });
  }

  async function handleOrgChange(nextOrgId) {
    nextOrgId = clean(nextOrgId);
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId;
    documents = [];
    pageInfo = null;
    activeCategory = "all";
    searchDraft = "";
    searchTerm = "";
    await refresh();
  }

  window.addEventListener("syncetc:portal-logout-request", async () => { try { const client = await ensureSupabase(); await client.auth.signOut(); location.href = "/login"; } catch (e) { setMessage(e.message || String(e), "warn"); } });
  window.addEventListener("syncetc:portal-login-request", () => { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; });
  window.addEventListener("syncetc:portal-organization-change-request", (event) => handleOrgChange(event.detail?.organizationId || event.detail?.organization_id));
  window.addEventListener("syncetc:portal-organization-change", (event) => handleOrgChange(event.detail?.organization_id || event.detail?.organizationId));

  window.SyncEtcDocumentsDebug = { version: VERSION, pageKey: PAGE_KEY, scope: DOCUMENT_SCOPE, steps: diagSteps };

  function boot() {
    diag("boot:start", location.pathname);
    const root = rootEl();
    root.style.visibility = "hidden";
    root.setAttribute("data-syncetc-documents-held", "true");
    refresh().catch((error) => { loading = false; authChecked = true; message = error.message || String(error); messageKind = "warn"; render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
