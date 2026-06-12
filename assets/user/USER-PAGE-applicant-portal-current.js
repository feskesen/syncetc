// USER-PAGE-applicant-portal-current.js
// Internal Version: 2026-06-12-108-E
// Purpose: Applicant-only portal for application updates, stage tasks, and private upload tasks.

(function () {
  "use strict";

  const VERSION = "2026-06-12-108-E";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const PUBLIC_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-applicant-portal-root";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");
  const startMs = Date.now();
  const steps = [];

  const state = {
    token: "",
    email: "",
    payload: null,
    applicant: null,
    settings: {},
    organization: null,
    page: null,
    style: {},
    loading: true,
    message: "",
    messageKind: "ok",
    error: "",
    dirty: false,
    saving: false,
    uploadBusy: {},
    openSection: "tasks",
    loggedOut: false,
    requestEmail: "",
    requestBusy: false,
    requestMessage: "",
    requestKind: "info",
    authProcessing: false,
    authCallbackMessage: "",
    siteShell: null,
    publicNavItems: [],
    navigationProfile: null,
    navigationRows: [],
    navigationItems: [],
    logo: null,
  };

  function mark(label, detail) { if (DEBUG) steps.push(`${String(Date.now() - startMs).padStart(5)}ms  ${label}${detail ? " — " + detail : ""}`); }
  function root() { return document.getElementById(ROOT_ID); }
  function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function attr(v) { return esc(v).replace(/`/g,"&#096;"); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function byId(id) { return document.getElementById(id); }
  function val(id) { const el = byId(id); return el ? el.value : ""; }
  function rootData() { const r = root(); return { organizationKey: r?.dataset.organizationKey || r?.dataset.customerKey || "test-customer-1", organizationId: r?.dataset.organizationId || "" }; }
  function fmtDate(v) { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(); }
  function fmtDateTime(v) { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(); }
  function normalize(v) { return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); }

  function readableError(error, fallback) {
    const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null;
    const details = payload?.details && typeof payload.details === 'object' ? payload.details : null;
    const candidates = [
      payload?.message,
      payload?.error_description,
      payload?.error,
      details?.access_block_reason,
      error?.message,
      error ? String(error) : ''
    ];
    let message = candidates.map(clean).find((item) => item && item !== '[object Object]');
    if (!message) message = fallback || 'Applicant portal could not load. Open this page with ?syncetc_debug=1 for details.';
    if (payload?.error && message === clean(payload.error) && payload?.message && clean(payload.message) !== '[object Object]') message = clean(payload.message);
    return message;
  }

  function readableJsonError(json, status) {
    const details = json?.details && typeof json.details === 'object' ? json.details : null;
    const message = [json?.message, json?.error_description, json?.error, details?.access_block_reason].map(clean).find((item) => item && item !== '[object Object]');
    if (message) return message;
    try {
      const text = JSON.stringify(json || {});
      if (text && text !== '{}') return text.slice(0, 1000);
    } catch (_) {}
    return `HTTP ${status}`;
  }

  function styleVars() {
    const colors = obj(state.style.colors_json);
    const spacing = obj(state.style.spacing_json);
    const layout = obj(state.style.layout_json);
    const width = ((spacing.page_width || layout.default_width) === "wide") ? "1180px" : "1040px";
    return `--ap-primary:${esc(colors.brand_primary || "#265c2b")};--ap-soft:${esc(colors.brand_secondary || "#edf7ed")};--ap-text:${esc(colors.text || "#142417")};--ap-surface:${esc(colors.surface || "#fff")};--ap-page-width:${width};`;
  }

  function setShellState() {
    if (!window.SyncEtcPortalShell?.setState) return;
    const org = state.organization || {};
    window.SyncEtcPortalShell.setState({
      authenticated: Boolean(state.email),
      email: state.email || "",
      mode: "applicant",
      organizationName: org.display_name || org.organization_key || "Organization",
      organizationKey: org.organization_key || rootData().organizationKey || "",
      organizationId: org.organization_id || "",
      selectedOrganizationId: org.organization_id || "",
      organizations: org.organization_id ? [{ organization_id: org.organization_id, organization_key: org.organization_key, organization_name: org.display_name }] : [],
      styleProfile: state.style || null,
      logo: state.logo || obj(state.siteShell).logo || null,
      publicNavItems: state.publicNavItems,
      navigationProfile: state.navigationProfile,
      navigationRows: state.navigationRows,
      navigationItems: state.navigationItems,
      accessRow: {
        organization_id: org.organization_id || "",
        organization_key: org.organization_key || "",
        organization_name: org.display_name || org.organization_key || "Organization",
        role_keys: ["applicant"],
        permission_keys: [],
        is_member: false,
        is_organization_admin: false,
        can_manage_access: false,
        can_view_member_portal: false,
        is_applicant: true,
        style_profile: state.style || null,
        navigation_profile: state.navigationProfile,
        navigation_rows: state.navigationRows,
        navigation_items: state.navigationItems,
      },
      platformAdmin: false,
      activePageKey: "applicant-portal",
    });
  }

  function css() { return `
.ap-wrap{max-width:var(--ap-page-width,1180px);margin:0 auto 48px;padding:16px;font-family:Arial,Helvetica,sans-serif;color:var(--ap-text,#142417)}.ap-wrap *{box-sizing:border-box}.ap-panel{background:var(--ap-surface,#fff);border:1px solid color-mix(in srgb,var(--ap-primary,#265c2b) 15%,#d9e2ec);border-radius:24px;box-shadow:0 14px 40px rgba(12,38,64,.14);overflow:hidden}.ap-hero{padding:24px;background:linear-gradient(135deg,var(--ap-primary,#265c2b),color-mix(in srgb,var(--ap-primary,#265c2b) 55%,#4c8f55));color:#fff}.ap-hero h1{margin:0;font-size:clamp(30px,4vw,48px);letter-spacing:-.035em}.ap-hero p{margin:9px 0 0;max-width:900px;color:rgba(255,255,255,.9);font-weight:800;line-height:1.45}.ap-body{padding:16px;background:color-mix(in srgb,var(--ap-soft,#edf7ed) 38%,#fff)}.ap-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.ap-card{background:#fff;border:1px solid color-mix(in srgb,var(--ap-primary,#265c2b) 14%,#d9e2ec);border-radius:18px;padding:14px}.ap-card h2,.ap-card h3{margin:0 0 8px;color:var(--ap-primary,#265c2b)}.ap-kicker{font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;opacity:.88}.ap-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:950;color:var(--ap-primary,#265c2b)}.ap-field{display:grid;gap:5px;margin-top:10px}.ap-input,.ap-select,.ap-textarea{width:100%;padding:10px 11px;border:1px solid #c5d4e2;border-radius:10px;font:inherit;background:#fff;color:#111827}.ap-textarea{min-height:90px;resize:vertical}.ap-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;background:color-mix(in srgb,var(--ap-soft,#edf7ed) 82%,#fff);color:var(--ap-primary,#265c2b);font-weight:950;font-size:12px}.ap-pill.warn{background:#fef3c7;color:#92400e}.ap-pill.bad{background:#fee2e2;color:#991b1b}.ap-alert{padding:10px 12px;border-radius:12px;font-weight:850;margin-bottom:10px}.ap-alert.ok{background:#e7f6ec;color:#17633a}.ap-alert.bad{background:#fee2e2;color:#991b1b}.ap-alert.info{background:#eaf5ff;color:#1f4f82}.ap-btn{border:1px solid var(--ap-primary,#265c2b);background:var(--ap-primary,#265c2b);color:#fff;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer;transition:.12s;box-shadow:0 6px 14px rgba(12,38,64,.12)}.ap-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 9px 18px rgba(12,38,64,.18)}.ap-btn.secondary{background:#fff;color:var(--ap-primary,#265c2b)}.ap-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}.ap-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.ap-status-block{margin-top:8px;color:#52606d;font-size:13px;line-height:1.45}.ap-status-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.ap-progress{display:grid;gap:8px;margin-top:12px}.ap-progress-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.ap-bar{height:10px;border-radius:999px;background:#e5edf4;overflow:hidden}.ap-bar span{display:block;height:100%;background:var(--ap-primary,#265c2b);border-radius:999px}.ap-accordion{margin-top:14px;display:grid;gap:10px}.ap-section{border:1px solid #dbe5ee;border-radius:16px;background:#fff;overflow:hidden}.ap-section summary{list-style:none;cursor:pointer;padding:14px 15px;font-weight:950;color:var(--ap-primary,#265c2b);display:flex;justify-content:space-between;gap:8px;align-items:center}.ap-section summary::-webkit-details-marker{display:none}.ap-section summary:after{content:'▾';font-size:14px;transition:.12s}.ap-section[open] summary:after{transform:rotate(180deg)}.ap-section-body{padding:0 14px 14px}.ap-task{border:1px solid #e1e8f0;border-radius:14px;padding:12px;margin-top:10px;background:#fff}.ap-task-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.ap-task-title{font-weight:950;color:#172033}.ap-task-desc{font-size:13px;color:#52606d;margin-top:3px;line-height:1.4}.ap-upload{margin-top:10px;padding:10px;border:1px dashed #bfd0df;border-radius:12px;background:#fbfdff}.ap-upload-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.ap-upload-list{margin-top:8px;display:grid;gap:6px}.ap-upload-item{font-size:13px;padding:8px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e5edf5}.ap-muted{color:#52606d;font-size:13px;line-height:1.45}.ap-debug{margin-top:12px;padding:12px;border-radius:12px;background:#101828;color:#dbeafe;font:12px ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}.ap-note{font-size:13px;color:#52606d}.ap-hidden{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important}@media(max-width:850px){.ap-grid{grid-template-columns:1fr}.ap-upload-row{grid-template-columns:1fr}.ap-progress-row{grid-template-columns:1fr}.ap-wrap{padding:10px}}`; }

  function loadScript(src) { return new Promise((resolve, reject) => { if ([...document.scripts].some((s) => s.src === src)) return resolve(); const sc = document.createElement("script"); sc.src = src; sc.async = true; sc.onload = resolve; sc.onerror = () => reject(new Error(`Unable to load ${src}`)); document.head.appendChild(sc); }); }
  function waitFor(fn, timeout=8000) { const st=Date.now(); return new Promise((resolve,reject)=>{ (function tick(){ if(fn()) return resolve(); if(Date.now()-st>timeout) return reject(new Error("Timed out waiting for Supabase")); setTimeout(tick,50); })(); }); }
  async function ensureSupabase() { if (!window.supabase?.createClient) await loadScript(SUPABASE_JS_URL); if (!window.supabase?.createClient) await waitFor(()=>window.supabase?.createClient); if (!window.__syncetcApplicantPortalSupabase) window.__syncetcApplicantPortalSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); return window.__syncetcApplicantPortalSupabase; }

  function hasAuthCallbackInUrl() {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return Boolean(
      url.searchParams.get('code') ||
      url.searchParams.get('token_hash') ||
      url.searchParams.get('error') ||
      hash.get('access_token') ||
      hash.get('refresh_token') ||
      hash.get('token_hash') ||
      hash.get('error')
    );
  }

  function cleanAuthCallbackUrl() {
    const url = new URL(window.location.href);
    ['code','token_hash','type','error','error_code','error_description','access_token','refresh_token','expires_in','expires_at','provider_token','provider_refresh_token'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
  }

  async function completeAuthCallbackIfPresent(client) {
    if (!hasAuthCallbackInUrl()) return false;
    state.authProcessing = true;
    state.authCallbackMessage = 'Processing secure login link…';
    mark('authCallback:detected');
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const err = url.searchParams.get('error_description') || url.searchParams.get('error') || hash.get('error_description') || hash.get('error');
    if (err) {
      cleanAuthCallbackUrl();
      throw new Error(clean(err) || 'The secure login link could not be completed. Request a new link.');
    }
    const code = url.searchParams.get('code');
    if (code) {
      mark('authCallback:exchangeCodeForSession');
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      cleanAuthCallbackUrl();
      mark('authCallback:session-ready');
      return true;
    }
    const tokenHash = url.searchParams.get('token_hash') || hash.get('token_hash');
    if (tokenHash && client.auth.verifyOtp) {
      const rawType = clean(url.searchParams.get('type') || hash.get('type') || 'magiclink');
      const type = ['magiclink','signup','recovery','invite','email'].includes(rawType) ? rawType : 'magiclink';
      mark('authCallback:verifyOtp', `${type} token_hash`);
      const { error } = await client.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) throw error;
      cleanAuthCallbackUrl();
      mark('authCallback:session-ready');
      return true;
    }
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
      mark('authCallback:setSession');
      const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
      cleanAuthCallbackUrl();
      mark('authCallback:session-ready');
      return true;
    }
    return false;
  }
  async function accessCall(body) { const client = await ensureSupabase(); const { data } = await client.auth.getSession(); const token = data?.session?.access_token; if (!token) throw new Error("Log in first."); state.token = token; state.email = data.session.user?.email || ""; const rd = rootData(); const res = await fetch(ACCESS_EDGE_URL, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body: JSON.stringify({ organization_key: rd.organizationKey, organization_id: rd.organizationId, ...body }) }); const json = await res.json().catch(()=>({})); if(!res.ok || json.ok===false) { const err = new Error(readableJsonError(json, res.status)); err.payload = json; err.status = res.status; throw err; } return json; }
  async function publicCall(body) { const rd = rootData(); const res = await fetch(PUBLIC_EDGE_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ organization_key: rd.organizationKey, organization_id: rd.organizationId, site_key:"primary", ...body }) }); const json = await res.json().catch(()=>({})); if(!res.ok || json.ok===false) throw new Error(readableJsonError(json, res.status)); return json; }

  function applyPublicShellPayload(payload) {
    const shell = obj(payload?.site_shell);
    if (!Object.keys(shell).length) return;
    state.siteShell = shell;
    state.logo = shell.logo || state.logo || null;
    state.publicNavItems = arr(shell.public_nav_items).length ? arr(shell.public_nav_items) : arr(shell.nav_items);
    state.navigationProfile = payload.navigation_profile || shell.navigation_profile || state.navigationProfile || null;
    state.navigationRows = arr(payload.navigation_rows).length ? arr(payload.navigation_rows) : (arr(shell.navigation_rows).length ? arr(shell.navigation_rows) : state.navigationRows);
    state.navigationItems = arr(payload.navigation_items).length ? arr(payload.navigation_items) : (arr(shell.navigation_items).length ? arr(shell.navigation_items) : state.navigationItems);
    mark('publicShell:applied', `${state.publicNavItems.length} public nav items`);
  }

  async function refreshPublicShellForOrganization(org) {
    const organizationKey = clean(obj(org).organization_key || rootData().organizationKey);
    const organizationId = clean(obj(org).organization_id || rootData().organizationId);
    if (!organizationKey && !organizationId) return null;
    try {
      const landing = await publicCall({ action:'get_applicant_portal_public', organization_key: organizationKey, organization_id: organizationId });
      applyPublicShellPayload(landing);
      return landing;
    } catch (error) {
      mark('publicShell:error', readableError(error, 'public shell unavailable'));
      return null;
    }
  }
  async function requestPortalLink() { const email = clean(val('ap-request-email') || state.requestEmail); state.requestEmail = email; if (!email || !/^\S+@\S+\.\S+$/.test(email)) { state.requestMessage = 'Enter the email address used on your application.'; state.requestKind = 'bad'; render(); return; } state.requestBusy = true; state.requestMessage = ''; render(); try { const data = await publicCall({ action:'request_applicant_portal_access', email, redirect_to: location.origin + '/applicant-portal' }); state.requestMessage = clean(data.message || 'If an eligible application exists for that email, we will send applicant portal instructions.'); state.requestKind = 'ok'; } catch (error) { state.requestMessage = 'If an eligible application exists for that email, we will send applicant portal instructions.'; state.requestKind = 'ok'; } finally { state.requestBusy = false; render(); } }

  async function refresh() { mark("refresh:start"); state.loading = true; state.error = ""; state.authCallbackMessage = hasAuthCallbackInUrl() ? 'Processing secure login link…' : ''; render(); try { const client = await ensureSupabase(); const completedAuth = await completeAuthCallbackIfPresent(client); if (completedAuth) mark('refresh:auth-callback-complete'); const { data: sessionData } = await client.auth.getSession(); const session = sessionData?.session || null; state.email = session?.user?.email || state.email || ""; if (!session?.access_token) { const landing = await publicCall({ action:'get_applicant_portal_public' }); applyPublicShellPayload(landing); state.payload = landing; state.organization = landing.organization || null; state.page = landing.page || null; state.settings = obj(landing.settings); state.style = obj(landing.style_profile); state.loggedOut = true; state.authProcessing = false; state.loading = false; setShellState(); render(); return; } const data = await accessCall({ action:"applicant_get_my_portal" }); state.payload = data; state.applicant = data.application || data.applicant || null; state.settings = obj(data.settings); state.organization = data.organization || null; state.page = data.page || null; state.style = obj(data.style_profile); await refreshPublicShellForOrganization(state.organization); state.loggedOut = false; state.authProcessing = false; state.loading = false; mark("refresh:done", clean(state.applicant?.display_name)); setShellState(); render(); } catch (error) { state.loading=false; state.authProcessing = false; const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null; const message = readableError(error, 'Applicant portal could not load. Open this page with ?syncetc_debug=1 for details.'); state.error = message; state.payload = payload || state.payload; try { const client = await ensureSupabase(); const { data: sessionData } = await client.auth.getSession(); state.email = sessionData?.session?.user?.email || state.email || ""; } catch (_) {} state.requestMessage = state.email ? message : 'The secure login link could not be completed. Request a new link if needed.'; state.requestKind = 'bad'; try { const landing = await publicCall({ action:'get_applicant_portal_public', organization_key: clean(obj(state.organization).organization_key || rootData().organizationKey), organization_id: clean(obj(state.organization).organization_id || rootData().organizationId) }); applyPublicShellPayload(landing); state.payload = payload || landing; state.organization = landing.organization || state.organization; state.page = landing.page || state.page; state.settings = obj(landing.settings || state.settings); state.style = obj(landing.style_profile || state.style); } catch (_) {} state.loggedOut = !state.email; setShellState(); render(); } }

  function applicantStageKey(app) { return normalize(app.stage_key || app.applicant_status || app.status || "new"); }
  function applicantStatusCopy(app) {
    const key = applicantStageKey(app);
    const map = {
      new: { label: "Application received", body: "We received your application. No action is required right now unless a next step is shown below." },
      waitlist: { label: "On waitlist", body: "Your application is on the waitlist. We will update this page if your position changes or if there is a next step for you." },
      invited_to_interview: { label: "Invited to interview", body: "You have been invited to interview. Please complete any next steps shown below." },
      interview: { label: "Invited to interview", body: "You have been invited to interview. Please complete any next steps shown below." },
      onboarding: { label: "Onboarding in progress", body: "Your onboarding is in progress. Please complete any next steps shown below." },
      ready_for_final_review: { label: "Final review", body: "Your application is in final review. No additional action is required unless a next step is shown below." },
      final_review: { label: "Final review", body: "Your application is in final review. No additional action is required unless a next step is shown below." },
      archived: { label: "Application closed", body: "This application is closed. Contact the organization if you have questions." },
      converted: { label: "Membership created", body: "Your application has been completed and your member record has been created." },
    };
    return map[key] || { label: clean(app.status_label || app.status || "Application status"), body: "We will update this page when there is a next step for you." };
  }
  function statusHtml(app) {
    const copy = applicantStatusCopy(app);
    const waitlist = app.waitlist_order ? ` <span class="ap-pill">Waitlist #${esc(app.waitlist_order)}</span>` : "";
    return `<div class="ap-status-block"><div>${esc(copy.body)}</div><div class="ap-status-pills"><span class="ap-pill">${esc(copy.label)}</span>${waitlist}</div></div>`;
  }
  function taskStatusPill(task) { const s = normalize(task.status || task.review_status || task.upload_status || "pending"); const label = ({ pending:"Pending", in_progress:"In progress", completed:"Completed", waived:"Waived", blocked:"Blocked", submitted:"Submitted", accepted:"Accepted", rejected:"Needs changes", request_changes:"Changes requested" })[s] || clean(s || "pending"); const cls = ["completed","waived","accepted"].includes(s) ? "" : ["blocked","rejected","request_changes"].includes(s) ? " bad" : " warn"; return `<span class="ap-pill${cls}">${esc(label)}</span>`; }
  function isApplicantActionTask(task) { const responsible = normalize(task.responsible_party || task.completion_actor || ""); return task.applicant_visible !== false && responsible === "applicant"; }
  function applicantVisibleTasks() { const app = state.applicant || {}; const current = arr(app.current_stage_tasks); const source = current.length ? current : arr(app.tasks).filter((t) => !clean(t.stage_key) || normalize(t.stage_key) === applicantStageKey(app)); return source.filter(isApplicantActionTask); }
  function requiredTaskProgress() { const tasks = applicantVisibleTasks().filter((t) => t.is_required !== false); if (!tasks.length) return { done: 0, total: 0, pct: 0 }; const done = tasks.filter((t) => ["completed","waived","accepted"].includes(normalize(t.status || t.review_status || t.upload_status))).length; return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) }; }

  function applicationForm(app) { const ad=obj(app.address_json), bg=obj(app.background_json), av=obj(app.aviation_json), interest=obj(app.interest_json), custom=obj(app.custom_answers_json); const disabled = app.can_update === false ? "disabled" : ""; return `<div class="ap-grid"><label class="ap-field"><span class="ap-label">First name</span><input class="ap-input" id="ap-first" value="${attr(app.first_name)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Last name</span><input class="ap-input" id="ap-last" value="${attr(app.last_name)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Phone</span><input class="ap-input" id="ap-phone" value="${attr(app.phone)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Email</span><input class="ap-input" value="${attr(app.email)}" disabled></label><label class="ap-field"><span class="ap-label">Street address</span><input class="ap-input" id="ap-street" value="${attr(ad.address_1 || ad.street || ad.address)}" ${disabled}></label><label class="ap-field"><span class="ap-label">City</span><input class="ap-input" id="ap-city" value="${attr(ad.city)}" ${disabled}></label><label class="ap-field"><span class="ap-label">State</span><input class="ap-input" id="ap-state" value="${attr(ad.state)}" ${disabled}></label><label class="ap-field"><span class="ap-label">ZIP</span><input class="ap-input" id="ap-zip" value="${attr(ad.zip)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Employer</span><input class="ap-input" id="ap-employer" value="${attr(bg.employer)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Occupation</span><input class="ap-input" id="ap-occupation" value="${attr(bg.occupation)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Pilot certificate number</span><input class="ap-input" id="ap-cert" value="${attr(av.pilot_certificate_number)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Certificate level</span><input class="ap-input" id="ap-level" value="${attr(av.certificate_level)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Ratings / endorsements</span><input class="ap-input" id="ap-ratings" value="${attr(av.ratings)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Medical / BasicMed status</span><input class="ap-input" id="ap-medical" value="${attr(av.medical_class || av.medical_status)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Last medical date</span><input class="ap-input" id="ap-med-date" value="${attr(av.last_medical_date)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Total hours</span><input class="ap-input" id="ap-total" value="${attr(av.total_hours)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Night hours</span><input class="ap-input" id="ap-night" value="${attr(av.night_hours)}" ${disabled}></label><label class="ap-field"><span class="ap-label">IFR hours</span><input class="ap-input" id="ap-ifr" value="${attr(av.ifr_hours)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Complex hours</span><input class="ap-input" id="ap-complex" value="${attr(av.complex_hours)}" ${disabled}></label><label class="ap-field"><span class="ap-label">Aircraft experience</span><input class="ap-input" id="ap-aircraft" value="${attr(av.aircraft_experience || av.aircraft_types)}" ${disabled}></label></div><label class="ap-field"><span class="ap-label">Why do you want to join?</span><textarea class="ap-textarea" id="ap-why" ${disabled}>${esc(interest.why_join)}</textarea></label><label class="ap-field"><span class="ap-label">Anything else?</span><textarea class="ap-textarea" id="ap-notes" ${disabled}>${esc(interest.anything_else || interest.additional_notes || custom.additional_notes)}</textarea></label>${app.can_update === false ? `<div class="ap-alert info">Application editing is not currently enabled for this stage.</div>` : `<div class="ap-actions"><button class="ap-btn" id="ap-save" ${state.saving ? "disabled" : ""}>${state.saving ? "Saving…" : "Save updates"}</button><span class="ap-muted" id="ap-save-note"></span></div>`}`; }

  function uploadItemHtml(u) { const link = clean(u.signed_url || u.download_signed_url); return `<div class="ap-upload-item"><strong>${esc(u.original_file_name || u.display_name || 'Uploaded file')}</strong> • ${esc(u.upload_status || 'submitted')}${u.review_note?`<br>Review note: ${esc(u.review_note)}`:""}${link?`<br><a href="${attr(link)}" target="_blank" rel="noopener">Download/view uploaded file</a>`:""}</div>`; }
  function taskHtml(task) { const uploads = arr(task.uploads); const isUpload = task.upload_required === true || ["upload-profile-photo","upload-pilot-certificate","upload-medical-proof"].includes(clean(task.task_key)) || clean(task.task_type)==="upload"; const busy = !!state.uploadBusy[clean(task.applicant_task_id)]; const uploadList = uploads.length ? `<div class="ap-upload-list">${uploads.map(uploadItemHtml).join("")}</div>` : `<div class="ap-muted">No upload submitted yet.</div>`; return `<div class="ap-task"><div class="ap-task-head"><div><div class="ap-task-title">${esc(task.label)}</div><div class="ap-task-desc">${esc(task.description)}${task.is_required !== false ? ' • Required' : ' • Optional'}</div></div>${taskStatusPill(task)}</div>${task.note?`<div class="ap-alert info" style="margin-top:8px">${esc(task.note)}</div>`:""}${isUpload?`<div class="ap-upload"><div class="ap-upload-row"><input type="file" id="file-${attr(task.applicant_task_id)}" accept=".pdf,image/*"><button class="ap-btn secondary ap-upload-btn" data-task-id="${attr(task.applicant_task_id)}" ${busy ? "disabled" : ""}>${busy ? "Uploading…" : "Upload"}</button></div><label class="ap-field"><span class="ap-label">Optional note</span><input class="ap-input" id="note-${attr(task.applicant_task_id)}" placeholder="Optional note about this upload"></label>${uploadList}</div>`:""}</div>`; }

  
  function loginRequestHtml() { const org = state.organization || {}; const title = org.display_name || 'Applicant Portal'; const email = state.requestEmail || state.email || ''; return `<style>${css()}</style><div class="ap-wrap" style="${styleVars()}"><section class="ap-panel"><div class="ap-hero"><div class="ap-kicker">Applicant Portal</div><h1>${esc(title)}</h1><p>Use the email address from your application to request a secure applicant portal link. This login is applicant-only and does not provide member access.</p></div><div class="ap-body"><div class="ap-card"><h2>Access your applicant portal</h2><p class="ap-muted">If an eligible application exists for the email you enter, we will send applicant portal instructions. For privacy, this page will not confirm whether an application exists.</p>${state.requestMessage?`<div class="ap-alert ${state.requestKind||'info'}">${esc(state.requestMessage)}</div>`:''}<label class="ap-field"><span class="ap-label">Application email</span><input class="ap-input" id="ap-request-email" type="email" autocomplete="email" inputmode="email" value="${attr(email)}" placeholder="email@example.com"></label><div class="ap-actions"><button class="ap-btn" id="ap-request-link" ${state.requestBusy?'disabled':''}>${state.requestBusy?'Sending…':'Send secure login link'}</button></div><p class="ap-muted">First time here? Use the same email you used on the application. If your organization allows applicant portal access, the secure link will let you create or access your applicant-only login.</p></div>${DEBUG?`<pre class="ap-debug">SyncEtc Applicant Portal ${VERSION}\nLogged out/request mode\nOrg: ${esc(org.organization_key||rootData().organizationKey)}\nSteps:\n${esc(steps.join("\n"))}\n\n${esc(JSON.stringify(state.payload,null,2))}</pre>`:''}</div></section></div>`; }

  function html() { const app = state.applicant; const org = state.organization || {}; if (state.loading) return `<style>${css()}</style><div class="ap-wrap" style="${styleVars()}"><div class="ap-panel"><div class="ap-body">${esc(state.authCallbackMessage || 'Loading applicant portal…')}</div></div></div>`; if (state.error) return loginRequestHtml(); if (state.loggedOut || !app) return loginRequestHtml(); const nextSteps = applicantVisibleTasks(); const progress = requiredTaskProgress(); return `<style>${css()}</style><div class="ap-wrap" style="${styleVars()}"><section class="ap-panel"><div class="ap-hero"><div class="ap-kicker">Applicant Portal</div><h1>${esc(org.display_name || 'Applicant Portal')}</h1><p>View your application status and complete requested next steps. This login is applicant-only and does not provide member access.</p></div><div class="ap-body">${state.message?`<div class="ap-alert ${state.messageKind || 'ok'}">${esc(state.message)}</div>`:""}<div class="ap-card"><h2>${esc(app.display_name || 'Application')}</h2><div>${statusHtml(app)}</div><p class="ap-muted" style="margin-bottom:0;margin-top:8px">Submitted ${esc(fmtDate(app.submitted_at || app.created_at))}${app.last_applicant_update_at?` • Last updated ${esc(fmtDateTime(app.last_applicant_update_at))}`:""}</p>${progress.total?`<div class="ap-progress"><div class="ap-progress-row"><strong>Required next steps for you</strong><span>${progress.done} of ${progress.total} complete</span></div><div class="ap-bar"><span style="width:${progress.pct}%"></span></div></div>`:""}</div><div class="ap-accordion"><details class="ap-section" ${state.openSection==='tasks'?'open':''} data-section="tasks"><summary><span>Next steps for you</span><span class="ap-pill">${progress.total ? `${progress.done}/${progress.total}` : 'None'}</span></summary><div class="ap-section-body"><p class="ap-muted">Complete the items shown here. If nothing is listed, no action is required from you right now.</p>${nextSteps.map(taskHtml).join("") || '<div class="ap-muted">No action is required from you right now. We will update this page if we need additional information.</div>'}</div></details><details class="ap-section" ${state.openSection==='application'?'open':''} data-section="application"><summary><span>Application information</span><span class="ap-pill">${app.can_update === false ? 'View only' : 'Editable'}</span></summary><div class="ap-section-body">${applicationForm(app)}</div></details></div>${DEBUG?`<pre class="ap-debug">SyncEtc Applicant Portal ${VERSION}\nElapsed: ${Date.now()-startMs}ms\nEmail: ${esc(state.email)}\nApplicant-facing next steps: ${nextSteps.length}\nSteps:\n${esc(steps.join("\n"))}\n\n${esc(JSON.stringify(state.payload,null,2))}</pre>`:""}</div></section></div>`; }

  function render() { const r=root(); if(r) r.innerHTML = html(); bind(); }
  function collectUpdate() { return { first_name: val('ap-first'), last_name: val('ap-last'), phone: val('ap-phone'), address_1: val('ap-street'), city: val('ap-city'), state: val('ap-state'), zip: val('ap-zip'), employer: val('ap-employer'), occupation: val('ap-occupation'), pilot_certificate_number: val('ap-cert'), certificate_level: val('ap-level'), ratings: val('ap-ratings'), medical_class: val('ap-medical'), last_medical_date: val('ap-med-date'), total_hours: val('ap-total'), night_hours: val('ap-night'), ifr_hours: val('ap-ifr'), complex_hours: val('ap-complex'), aircraft_experience: val('ap-aircraft'), why_join: val('ap-why'), anything_else: val('ap-notes') }; }
  async function saveUpdate() { if (state.saving) return; state.saving = true; const note=byId('ap-save-note'); if(note) note.textContent='Saving…'; try { const data = await accessCall({ action:'applicant_save_my_application', ...collectUpdate() }); state.payload=data; state.applicant=data.application || data.applicant; state.settings=obj(data.settings); state.message='Application updates saved.'; state.messageKind='ok'; state.dirty=false; render(); } catch(error){ if(note) note.textContent=''; state.message=readableError(error, 'The update could not be saved.'); state.messageKind='bad'; render(); } finally { state.saving=false; } }
  function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Could not read selected file.")); reader.readAsDataURL(file); }); }
  async function uploadTask(taskId) { const fileEl=byId(`file-${taskId}`); const file=fileEl?.files?.[0]; if(!file) return alert('Choose a file first.'); state.uploadBusy[taskId]=true; render(); try { const dataUrl = await readFileAsDataUrl(file); const data = await accessCall({ action:'applicant_upload_task_file', applicant_task_id:taskId, file_name:file.name, mime_type:file.type, file_size_bytes:file.size, data_url:dataUrl, applicant_note:val(`note-${taskId}`) }); state.payload=data; state.applicant=data.application || data.applicant; state.message='Upload submitted for review.'; state.messageKind='ok'; state.dirty=false; delete state.uploadBusy[taskId]; render(); } catch(error){ delete state.uploadBusy[taskId]; state.message=readableError(error, 'The update could not be saved.'); state.messageKind='bad'; render(); } }
  function bind() { const req=byId('ap-request-link'); if(req) req.onclick=requestPortalLink; const reqEmail=byId('ap-request-email'); if(reqEmail) reqEmail.addEventListener('input',e=>{state.requestEmail=e.target.value||'';}); const save=byId('ap-save'); if(save) save.onclick=saveUpdate; document.querySelectorAll('.ap-upload-btn').forEach(btn=>btn.addEventListener('click',()=>uploadTask(btn.dataset.taskId))); document.querySelectorAll('.ap-input,.ap-textarea,.ap-select').forEach(el=>el.addEventListener('input',()=>{state.dirty=true;})); document.querySelectorAll('details[data-section]').forEach(el=>el.addEventListener('toggle',()=>{ if(el.open) state.openSection = el.dataset.section || state.openSection; })); }
  function bindNavAway() { window.addEventListener('beforeunload',(event)=>{ if(!state.dirty) return; event.preventDefault(); event.returnValue=''; }); }
  async function init(){ const r=root(); if(!r) return; r.innerHTML='Loading applicant portal…'; bindNavAway(); await refresh(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
