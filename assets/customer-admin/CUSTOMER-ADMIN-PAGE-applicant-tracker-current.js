// CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js
// Internal Version: 2026-06-10-106-A
// Purpose: Organization admin Applicant Tracker with archive reason workflow, conversion modal, lifecycle notes, applicant list initialization fix, local filters, and plain filter counts, stacked filter controls, applicant checklist settings editor, and stage-enforcement UX.

(function () {
  "use strict";

  const VERSION = "2026-06-10-106-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const ACCESS_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-applicant-tracker-root";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");
  const startMs = Date.now();
  const steps = [];

  const STATUS = [
    ["new", "New"],
    ["waitlist", "Waitlist"],
    ["invited_to_interview", "Invited to Interview"],
    ["onboarding", "Onboarding"],
    ["ready_for_final_review", "Ready for Final Review"],
    ["archived", "Archived"],
    ["all", "All — Open & Archived"],
  ];
  const OPEN_STATUS_KEYS = new Set(["new", "waitlist", "invited_to_interview", "onboarding", "ready_for_final_review"]);
  const ARCHIVE_REASONS = [
    ["added_as_member", "Added as Member"],
    ["applicant_withdrew", "Applicant Withdrew"],
    ["club_declined", "Club Declined"],
    ["duplicate_application", "Duplicate Application"],
    ["no_response", "No Response"],
    ["other", "Other"],
  ];
  const PORTAL_MODES = [
    ["none", "No applicant portal access"],
    ["after_submitted", "After application is submitted"],
    ["manual", "After admin manually grants access"],
    ["info_requested", "When applicant reaches Waitlist"],
    ["accepted_onboarding", "When applicant reaches Onboarding"],
  ];
  const SORTS = [
    ["newest", "Newest first"],
    ["oldest", "Oldest first"],
    ["name", "Name A-Z"],
    ["status", "Status"],
    ["updated", "Last updated"],
    ["waitlist", "Waitlist / date applied"],
    ["invited", "Date invited"],
  ];


  const RESPONSIBLE_PARTIES = [
    ["applicant", "Applicant"],
    ["admin", "Any admin"],
    ["applicant_manager", "Applicant manager"],
    ["safety_officer", "Safety officer"],
    ["treasurer", "Treasurer"],
    ["board_member", "Any board member"],
    ["president", "President"],
    ["vice_president", "Vice President"],
    ["maintenance_officer", "Maintenance officer"],
    ["document_manager", "Document manager"]
  ];

  const state = {
    token: "", email: "", accessRow: null, person: null, orgId: "", platformAdmin: false,
    applicants: [], selectedId: "", selected: null, settings: {}, templates: [], workflowStages: [], taskDefinitions: [], summary: {},
    filter: "new", sort: "newest", search: "",
    loading: true, saving: false, dirty: false, settingsDirty: false, message: "", messageKind: "", error: "", noteSearch: "", noteFilter: "all", unsavedNote: "", noteSaving: false, allApplicants: [], settingsOpen: false, archiveModalOpen:false, archiveReasonKey:"", archiveReasonNote:"", convertModalOpen:false, conversionLoading:false, conversionSaving:false, conversionOptions:null, conversionMode:"create_new", conversionPersonId:"", conversionStatusKey:"", conversionClassKey:"", conversionStageKey:"", conversionNote:"", openMajor: { application_details:true, checklist:false, notes:false, applicant_emails:false }, taskEditorOpen: true, transitionModalOpen:false, transitionFrom:"", transitionTo:"", transitionNote:"", transitionConfirmations:{}, transitionActions:{}
  };

  function mark(label, detail){ if(DEBUG) steps.push(`${String(Date.now()-startMs).padStart(5)}ms  ${label}${detail?" — "+detail:""}`); }
  function root(){ return document.getElementById(ROOT_ID); }
  function clean(v){ return String(v ?? "").replace(/\s+/g," ").trim(); }
  function key(v){ return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); }
  function esc(v){ return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function attr(v){ return esc(v).replace(/`/g,"&#096;"); }
  function obj(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function byId(id){ return document.getElementById(id); }
  function val(id){ const el=byId(id); return el ? el.value : ""; }
  function checked(id){ const el=byId(id); return !!(el && el.checked); }
  function statusLabel(k){ return (STATUS.find(([key])=>key===k)||[k,k])[1]; }
  function archiveReasonLabel(k){ return (ARCHIVE_REASONS.find(([key])=>key===k)||[k,k])[1]; }
  function isArchivedApplicant(a){ return clean(a.status)==="archived" || clean(a.applicant_status)==="archived" || !!a.archived_at; }
  function applicantStageKey(a){
    if(isArchivedApplicant(a)) return "archived";
    const s=clean(a.status||a.applicant_status||a.stage_key||"new");
    return OPEN_STATUS_KEYS.has(s) ? s : "new";
  }
  function countForFilter(filterKey){
    const rows=arr(state.allApplicants);
    if(filterKey==="all") return rows.length;
    if(filterKey==="archived") return rows.filter(isArchivedApplicant).length;
    return rows.filter(a=>!isArchivedApplicant(a) && applicantStageKey(a)===filterKey).length;
  }
  function fmtDate(v){ if(!v) return ""; const d=new Date(v); return Number.isNaN(d.getTime())?"":d.toLocaleDateString(); }
  function fmtDateTime(v){ if(!v) return ""; const d=new Date(v); return Number.isNaN(d.getTime())?"":d.toLocaleString(); }
  function stageLabel(k){ const s = state.workflowStages.find((x)=>x.stage_key===k); return s?.label || statusLabel(k); }
  function statusLabelTask(v){ const s=clean(v||'pending'); return ({pending:'Pending',in_progress:'In progress',completed:'Completed',waived:'Waived',blocked:'Blocked'})[s]||s; }
  function styleVars(){
    const style=obj(state.accessRow?.style_profile);
    const colors=obj(style.colors_json);
    const spacing=obj(style.spacing_json);
    const layout=obj(style.layout_json);
    const width=((spacing.page_width||layout.default_width)==='wide')?'1180px':'1040px';
    return `--at-primary:${esc(colors.brand_primary||"#265c2b")};--at-soft:${esc(colors.brand_secondary||"#edf7ed")};--at-text:${esc(colors.text||"#142417")};--at-surface:${esc(colors.surface||"#fff")};--at-page-width:${width};`;
  }
  function statusOptions(selected, includeAll=false){ return STATUS.map(([k,l])=>{ const c=countForFilter(k); const label=c>0?`${l} (${c})`:l; return `<option value="${esc(k)}" ${selected===k?'selected':''}>${esc(label)}</option>`; }).join(""); }
  function actionCountSummary(){
    const keys=["new","ready_for_final_review"];
    const items=[];
    for(const k of keys){ const c=countNeedsActionFor(k); if(c>0) items.push(`<span class="at-count-alert">${esc(statusLabel(k))} ${c}</span>`); }
    const adminReview=arr(state.allApplicants).filter(a=>applicantNeedsAttention(a) && !["new","ready_for_final_review"].includes(applicantStageKey(a))).length;
    if(adminReview>0) items.push(`<span class="at-count-alert">Admin review ${adminReview}</span>`);
    return items.length?`<div class="at-action-counts" aria-label="Applicant items needing action">${items.join("")}</div>`:"";
  }
  function countNeedsActionFor(stageKey){ return arr(state.allApplicants).filter(a=>!isArchivedApplicant(a) && applicantStageKey(a)===stageKey && applicantNeedsAttention(a)).length; }
  function optionList(rows, selected, empty="") { return `${empty?`<option value="">${esc(empty)}</option>`:""}${arr(rows).map((r)=>`<option value="${esc(r[0])}" ${selected===r[0]?"selected":""}>${esc(r[1])}</option>`).join("")}`; }

  function css(){ return `
.at-wrap{max-width:var(--at-page-width,1180px);margin:0 auto 44px;padding:16px;font-family:Arial,Helvetica,sans-serif;color:var(--at-text,#142417)}.at-wrap *{box-sizing:border-box}.at-panel{background:var(--at-surface,#fff);border:1px solid color-mix(in srgb,var(--at-primary,#265c2b) 15%,#d9e2ec);border-radius:24px;box-shadow:0 14px 40px rgba(12,38,64,.14);overflow:hidden}.at-hero{padding:24px;background:linear-gradient(135deg,var(--at-primary,#265c2b),color-mix(in srgb,var(--at-primary,#265c2b) 55%,#5d99cf));color:#fff}.at-hero h1{margin:0;font-size:clamp(30px,4vw,48px);letter-spacing:-.035em}.at-hero p{margin:9px 0 0;max-width:940px;color:rgba(255,255,255,.9);font-weight:800;line-height:1.5}.at-body{padding:16px;background:color-mix(in srgb,var(--at-soft,#edf7ed) 38%,#fff)}.at-layout{display:grid;grid-template-columns:390px minmax(0,1fr);gap:14px}.at-card{background:#fff;border:1px solid color-mix(in srgb,var(--at-primary,#265c2b) 14%,#d9e2ec);border-radius:18px;padding:14px}.at-left{display:flex;flex-direction:column;gap:10px}.at-filters{display:grid;gap:8px}.at-filter-row{display:grid;grid-template-columns:1fr;gap:8px}.at-input,.at-select,.at-textarea{width:100%;padding:10px 11px;border:1px solid #c5d4e2;border-radius:10px;font:inherit;background:#fff;color:#111827}.at-textarea{min-height:90px;resize:vertical}.at-list{display:grid;gap:8px;max-height:690px;overflow:auto;padding-right:4px}.at-row{border:1px solid #e1e8f0;background:#fff;border-radius:14px;padding:10px;cursor:pointer;transition:.12s}.at-row:hover{box-shadow:0 7px 16px rgba(12,38,64,.12);transform:translateY(-1px)}.at-row.active{border-color:var(--at-primary,#265c2b);box-shadow:0 0 0 3px color-mix(in srgb,var(--at-primary,#265c2b) 18%,transparent)}.at-name{font-weight:950;color:var(--at-primary,#265c2b)}.at-meta{font-size:12px;color:#52606d;margin-top:3px}.at-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:color-mix(in srgb,var(--at-soft,#edf7ed) 80%,#fff);color:var(--at-primary,#265c2b);font-size:11px;font-weight:950}.at-pill.hot{background:#fef3c7;color:#92400e}.at-pill.bad{background:#fee2e2;color:#991b1b}.at-alert{padding:10px 12px;border-radius:12px;font-weight:850;margin-bottom:10px}.at-alert.ok{background:#e7f6ec;color:#17633a}.at-alert.bad{background:#fee2e2;color:#991b1b}.at-alert.info{background:#eaf5ff;color:#1f4f82}.at-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.at-detail-head h2{margin:0;color:var(--at-primary,#265c2b)}.at-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.at-field{display:grid;gap:5px;margin-top:10px}.at-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:950;color:var(--at-primary,#265c2b)}.at-section{margin-top:12px;padding-top:12px;border-top:1px solid #e5edf5}.at-section h3{margin:0 0 8px;color:var(--at-primary,#265c2b)}.at-major{margin-top:12px;border:1px solid #e5edf5;border-radius:16px;background:#fff;overflow:hidden}.at-major>summary{list-style:none;cursor:pointer;padding:13px 14px;background:color-mix(in srgb,var(--at-soft,#edf7ed) 45%,#fff);font-weight:950;color:var(--at-primary,#265c2b);display:flex;justify-content:space-between;align-items:center}.at-major>summary::-webkit-details-marker{display:none}.at-major>summary:after{content:"▾"}.at-major:not([open])>summary:after{content:"▸"}.at-major-body{padding:0 14px 14px}.at-pending{opacity:.72}.at-note-pending{display:inline-flex;border-radius:999px;padding:2px 7px;margin-left:6px;background:#fef3c7;color:#92400e;font-size:10px;font-weight:950}.at-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.at-btn{border:1px solid var(--at-primary,#265c2b);background:var(--at-primary,#265c2b);color:#fff;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer;transition:.12s;box-shadow:0 6px 14px rgba(12,38,64,.12)}.at-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 9px 18px rgba(12,38,64,.18)}.at-btn.secondary{background:#fff;color:var(--at-primary,#265c2b)}.at-btn.danger{background:#fee2e2;color:#991b1b;border-color:#fecaca}.at-btn:disabled{opacity:.55;cursor:wait;box-shadow:none}.at-task{border:1px solid #e1e8f0;border-radius:14px;padding:0;margin-bottom:8px;overflow:hidden}.at-task.current{border-color:color-mix(in srgb,var(--at-primary,#265c2b) 35%,#d9e2ec)}.at-task summary{list-style:none;cursor:pointer;padding:10px 12px;background:#f8fafc}.at-task summary::-webkit-details-marker{display:none}.at-task-body{padding:10px 12px;border-top:1px solid #edf2f7}.at-task-head{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:8px;align-items:center}.at-task-status-pill{display:inline-flex;border-radius:999px;padding:3px 8px;background:#eaf5ff;color:#1f4f82;font-size:11px;font-weight:950}.at-summary-block{padding:10px;border:1px solid #e5edf5;border-radius:14px;background:#fff}.at-summary-block h4{margin:0 0 8px;color:var(--at-primary,#265c2b)}.at-kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 10px;font-size:13px}.at-kv b{color:var(--at-primary,#265c2b)}.at-note-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 160px;gap:8px;margin-top:10px}.at-upload{font-size:13px;padding:8px 9px;border-radius:10px;background:#f8fafc;border:1px solid #e5edf5;margin-top:7px}.at-note-list{display:grid;gap:8px;max-height:360px;overflow:auto}.at-note{border-left:4px solid var(--at-primary,#265c2b);background:#f8fafc;border-radius:12px;padding:9px 10px}.at-note-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#52606d;font-weight:800}.at-note-title{font-weight:950;color:var(--at-primary,#265c2b)}.at-event{padding:8px 0;border-bottom:1px solid #edf2f7;font-size:13px}.at-empty{padding:26px;text-align:center;color:#52606d;font-weight:800}.at-settings-stage{border:1px solid var(--at-border,#cfe0d0);border-radius:16px;margin:10px 0;background:#fff}.at-settings-stage>summary{cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;gap:12px;font-weight:950;color:var(--at-primary,#265c2b)}.at-settings-stage-body{padding:0 14px 14px}.at-task-def-row{border:1px solid var(--at-border,#cfe0d0);border-radius:14px;padding:12px;margin:10px 0;background:rgba(237,247,237,.45)}.at-debug{margin-top:12px;padding:12px;border-radius:12px;background:#101828;color:#dbeafe;font:12px ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}.at-settings summary{cursor:pointer;font-weight:950;color:var(--at-primary,#265c2b)}.at-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:999999;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto}.at-modal{width:min(860px,100%);background:#fff;border-radius:22px;border:1px solid #dbe5ef;box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden}.at-modal-head{padding:18px 20px;background:linear-gradient(135deg,var(--at-primary,#265c2b),color-mix(in srgb,var(--at-primary,#265c2b) 55%,#5d99cf));color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.at-modal-head h2{margin:0;color:#fff}.at-modal-body{padding:16px;display:grid;gap:14px;max-height:calc(100vh - 170px);overflow:auto}.at-close{border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.14);color:#fff;width:36px;height:36px;border-radius:999px;font-size:20px;font-weight:900;cursor:pointer}.at-stage-row{display:grid;grid-template-columns:160px minmax(0,1fr) 90px;gap:8px;padding:10px;border:1px solid #e5edf5;border-radius:12px;background:#f8fafc}.at-taskdef{border:1px solid #e5edf5;border-radius:14px;background:#f8fafc;padding:10px}.at-readonly input,.at-readonly select{background:#f8fafc;color:#52606d}.at-small-note{font-size:12px;color:#52606d;font-weight:750;line-height:1.35}.at-match{border:1px solid #e1e8f0;border-radius:14px;padding:10px;background:#f8fafc;margin:8px 0}.at-match.selected{border-color:var(--at-primary,#265c2b);box-shadow:0 0 0 3px color-mix(in srgb,var(--at-primary,#265c2b) 15%,transparent)}.at-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.at-choice{border:1px solid #e1e8f0;border-radius:14px;padding:11px;background:#fff;cursor:pointer;display:grid;gap:5px}.at-choice.selected{border-color:var(--at-primary,#265c2b);box-shadow:0 0 0 3px color-mix(in srgb,var(--at-primary,#265c2b) 15%,transparent)}.at-choice.disabled{opacity:.58;cursor:not-allowed;background:#f8fafc}.at-help-dot{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:999px;background:color-mix(in srgb,var(--at-primary,#265c2b) 12%,#fff);color:var(--at-primary,#265c2b);border:1px solid color-mix(in srgb,var(--at-primary,#265c2b) 28%,#d9e2ec);font-size:11px;font-weight:950;margin-left:4px}.at-inline-help{font-size:12px;color:#52606d;font-weight:750;line-height:1.35}.at-action-counts{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}.at-count-alert{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:3px 7px;font-size:11px;font-weight:950}.at-transition-list{display:grid;gap:8px;margin:8px 0}.at-transition-item{border:1px solid #e5edf5;border-radius:12px;background:#f8fafc;padding:10px}.at-transition-item label{display:flex;gap:8px;align-items:flex-start;font-weight:850}.at-settings-stage>summary:after{content:"▾"}.at-settings-stage:not([open])>summary:after{content:"▸"}@media(max-width:900px){.at-layout{grid-template-columns:1fr}.at-grid,.at-filter-row{grid-template-columns:1fr}.at-list{max-height:420px}.at-task-head{grid-template-columns:1fr}}`; }

  function loadScript(src){ return new Promise((resolve,reject)=>{ if([...document.scripts].some(s=>s.src===src)) return resolve(); const sc=document.createElement('script'); sc.src=src; sc.async=true; sc.onload=resolve; sc.onerror=()=>reject(new Error(`Unable to load ${src}`)); document.head.appendChild(sc); }); }
  function waitFor(fn,timeout=8000){ const st=Date.now(); return new Promise((resolve,reject)=>{(function tick(){ if(fn()) return resolve(); if(Date.now()-st>timeout) return reject(new Error('Timed out waiting for Supabase')); setTimeout(tick,50); })();}); }
  async function ensureSupabase(){ if(!window.supabase?.createClient) await loadScript(SUPABASE_JS_URL); if(!window.supabase?.createClient) await waitFor(()=>window.supabase?.createClient); if(!window.__syncetcApplicantTrackerSupabase) window.__syncetcApplicantTrackerSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY); return window.__syncetcApplicantTrackerSupabase; }
  async function accessCall(body){ const client=await ensureSupabase(); const {data}=await client.auth.getSession(); const token=data?.session?.access_token; if(!token) throw new Error('Log in first.'); state.token=token; state.email=data.session.user?.email||''; const res=await fetch(ACCESS_EDGE_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)}); const json=await res.json().catch(()=>({})); if(!res.ok||json.ok===false) throw new Error(clean(json.message||json.error||`HTTP ${res.status}`)); return json; }
  function setShell(){ if(!window.SyncEtcPortalShell?.setState || !state.accessRow) return; const row=state.accessRow; window.SyncEtcPortalShell.setState({authenticated:true,email:state.email,mode:'organization-admin',organizationName:row.organization_name,organizationKey:row.organization_key,organizationId:row.organization_id,selectedOrganizationId:row.organization_id,styleProfile:row.style_profile,accessRow:row,platformAdmin:state.platformAdmin,activePageKey:'applicant-tracker'}); }
  function rootData(){ const r=root(); return { organizationKey: r?.dataset.organizationKey || r?.dataset.customerKey || "test-customer-1" }; }

  async function refresh(keepSelected=true){ mark('refresh:start'); state.loading=true; state.error=''; render(); try { if(!state.orgId){ const dash=await accessCall({ action:'get_user_dashboard', organization_key:rootData().organizationKey }); state.accessRow=arr(dash.access)[0]||dash.access||state.accessRow; state.person=dash.person||state.person; state.platformAdmin=Boolean(dash.platformAdmin||dash.platform_admin||state.accessRow?.platformAdmin||state.accessRow?.platform_admin||roleKeys().includes('platform-admin')||arr(state.accessRow?.role_labels).some(l=>/platform admin/i.test(String(l)))); state.orgId=clean(state.accessRow?.organization_id||dash.organization_id); } const data=await accessCall({ action:'organization_list_applicants', organization_id:state.orgId, status_filter:'all', search:'', limit:500 }); state.accessRow=data.access||state.accessRow; state.person=data.person||state.person; state.platformAdmin=Boolean(data.platformAdmin||data.platform_admin||state.accessRow?.platformAdmin||state.accessRow?.platform_admin||roleKeys().includes('platform-admin')||arr(state.accessRow?.role_labels).some(l=>/platform admin/i.test(String(l)))); state.orgId=clean(data.access?.organization_id||state.orgId); state.settings=obj(data.settings); state.templates=arr(data.reply_templates); state.workflowStages=arr(data.workflow_stages); state.taskDefinitions=arr(data.task_definitions); state.allApplicants=arr(data.applicants); state.applicants=visibleApplicants(); state.summary=obj(data.summary); if(keepSelected && state.selectedId){ state.selected=state.applicants.find(a=>a.application_id===state.selectedId)||state.allApplicants.find(a=>a.application_id===state.selectedId)||null; } else if(!keepSelected){ state.selected=null; state.selectedId=''; } state.loading=false; setShell(); updateApplicantHeaderBadgeLocally(); mark('refresh:done', `${state.applicants.length} applicants`); render(); } catch(error){ state.loading=false; state.error=error.message||String(error); render(); } }
  function visibleApplicants(){
    const q=clean(state.search).toLowerCase();
    let rows=arr(state.allApplicants);
    const f=clean(state.filter||"new");
    if(f==="archived") rows=rows.filter(isArchivedApplicant);
    else if(f!=="all") rows=rows.filter(a=>!isArchivedApplicant(a) && clean(a.status||a.applicant_status||a.stage_key)===f);
    if(q){ rows=rows.filter(a=>[a.display_name,a.email,a.phone,a.status_label,a.status,a.stage_key,a.applicant_status,a.archive_reason_label,a.archive_reason_key,fmtDate(a.submitted_at),fmtDate(a.updated_at),JSON.stringify(a.aviation_json||{}),JSON.stringify(a.interest_json||{}),JSON.stringify(a.safety_json||{})].map(x=>clean(x).toLowerCase()).join(' ').includes(q)); }
    return sortApplicants(rows);
  }
  function sortApplicants(rows){ const list=[...rows]; const mode=state.sort; return list.sort((a,b)=>{ if(mode==='oldest') return String(a.submitted_at||a.created_at).localeCompare(String(b.submitted_at||b.created_at)); if(mode==='name') return clean(a.display_name).localeCompare(clean(b.display_name)); if(mode==='status') return clean(a.status_label).localeCompare(clean(b.status_label)) || clean(a.display_name).localeCompare(clean(b.display_name)); if(mode==='updated') return String(b.last_activity_at||b.updated_at||'').localeCompare(String(a.last_activity_at||a.updated_at||'')); if(mode==='waitlist') return Number(a.waitlist_order||999999)-Number(b.waitlist_order||999999) || String(a.submitted_at||'').localeCompare(String(b.submitted_at||'')); if(mode==='invited') return String(b.invited_at||'').localeCompare(String(a.invited_at||'')); return String(b.submitted_at||b.created_at||'').localeCompare(String(a.submitted_at||a.created_at||'')); }); }
  function stageOptions(selected){ const base=state.workflowStages.length ? state.workflowStages.map(s=>[s.stage_key,s.label]) : STATUS; const rows=base.filter(([k])=>OPEN_STATUS_KEYS.has(k)); return optionList(rows, selected); }
  function roleKeys(){ return arr(state.accessRow?.role_keys).map(k=>clean(k)); }
  function canEditApplicantSettings(){ const labels=arr(state.accessRow?.role_labels).map(l=>clean(l).toLowerCase()); return state.platformAdmin || roleKeys().includes('organization-super-admin') || roleKeys().includes('platform-admin') || labels.some(l=>l.includes('platform admin')); }
  function stageRowsForSettings(){ const rows=state.workflowStages.length ? state.workflowStages : STATUS.filter(([k])=>OPEN_STATUS_KEYS.has(k)).map(([stage_key,label],i)=>({stage_key,label,description:'',sort_order:(i+1)*10})); return rows; }
  function applicantCard(app){
    const active=state.selectedId===app.application_id;
    const hot=app.needs_attention || app.ready_for_final_review;
    const archived=isArchivedApplicant(app);
    const reason=archived?clean(app.archive_reason_label||archiveReasonLabel(app.archive_reason_key)):"";
    return `<button class="at-row ${active?'active':''}" data-open="${attr(app.application_id)}"><div class="at-name">${esc(app.display_name||'Unnamed applicant')}</div><div class="at-meta">${esc(app.email||'No email')} • Applied ${esc(fmtDate(app.submitted_at||app.created_at)||'')}</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px"><span class="at-pill ${archived?'bad':''}">${esc(archived?'Archived':(app.status_label||stageLabel(app.stage_key)))}</span>${reason?`<span class="at-pill">${esc(reason)}</span>`:''}${hot&&!archived?`<span class="at-pill hot">Needs attention</span>`:''}</div></button>`;
  }
  function leftPanel(){ return `<aside class="at-left"><div class="at-card"><div class="at-filters"><input id="at-search" class="at-input" value="${attr(state.search)}" placeholder="Search name, email, phone, status, notes…"><select id="at-filter" class="at-select">${statusOptions(state.filter,true)}</select>${actionCountSummary()}<select id="at-sort" class="at-select">${optionList(SORTS,state.sort)}</select><div class="at-actions"><button class="at-btn secondary" id="at-refresh">Refresh</button></div></div></div><div class="at-card"><strong id="at-list-count">${state.applicants.length} matching applicants</strong><div id="at-applicant-list" class="at-list" style="margin-top:9px">${state.applicants.length?state.applicants.map(applicantCard).join(''):'<div class="at-empty">No applicants match this view.</div>'}</div></div><div class="at-card"><button class="at-btn secondary" id="at-open-settings" type="button">Applicant settings</button><div class="at-small-note" style="margin-top:8px">Workflow settings apply to the whole organization.</div></div></aside>`; }
  function settingsPanel(){ return ''; }
  function taskDefsForStage(stageKey){
    const key=clean(stageKey);
    return arr(state.taskDefinitions).filter(t=>clean(t.stage_key||'new')===key && clean(t.status||'active')!=='archived' && !t.archived_at).sort((a,b)=>Number(a.sort_order||100)-Number(b.sort_order||100));
  }
  function taskDefId(task){ return clean(task.task_definition_id || task.applicant_task_definition_id || task._draft_id); }
  function taskDefKeyFor(task){ return clean(task.task_key) || key(task.label || 'task'); }
  function taskDefinitionRow(task, stageKey, canEdit){
    const id=taskDefId(task);
    const isNew=!!task._draft_id || !clean(task.task_definition_id || task.applicant_task_definition_id);
    const disabled=canEdit?'':'disabled';
    return `<div class="at-task-def-row" data-task-def-id="${attr(id)}" data-stage-key="${attr(stageKey)}"><div class="at-grid"><label class="at-field"><span class="at-label">Task label</span><input class="at-input at-def-label" value="${attr(task.label||'')}" placeholder="Task label" ${disabled}></label><label class="at-field"><span class="at-label">Responsible party</span><select class="at-select at-def-responsible" ${disabled}>${optionList(RESPONSIBLE_PARTIES, clean(task.responsible_party||'admin'))}</select></label></div><label class="at-field"><span class="at-label">Description</span><input class="at-input at-def-description" value="${attr(task.description||'')}" placeholder="What needs to happen?" ${disabled}></label><div class="at-grid"><label style="display:flex;gap:8px;align-items:center;font-weight:850"><input type="checkbox" class="at-def-required" ${task.is_required!==false?'checked':''} ${disabled}> Required before next stage</label><label style="display:flex;gap:8px;align-items:center;font-weight:850"><input type="checkbox" class="at-def-visible" ${task.applicant_visible!==false?'checked':''} ${disabled}> Applicant-visible</label><label class="at-field"><span class="at-label">Sort</span><input class="at-input at-def-sort" type="number" value="${attr(task.sort_order||100)}" ${disabled}></label></div><div class="at-actions">${canEdit?`<button class="at-btn secondary at-save-def" type="button" data-task-def-id="${attr(id)}">${isNew?'Save new task':'Save task'}</button>${!isNew?`<button class="at-btn danger at-archive-def" type="button" data-task-def-id="${attr(id)}">Archive task</button>`:''}`:''}</div></div>`;
  }
  function stageChecklistEditor(stage, canEdit){
    const defs=taskDefsForStage(stage.stage_key);
    return `<details class="at-settings-stage" ${clean(stage.stage_key)==='new'?'open':''}><summary><strong>${esc(stage.label||stage.stage_key)}</strong><span>${defs.length} task${defs.length===1?'':'s'}</span></summary><div class="at-settings-stage-body">${defs.length?defs.map(t=>taskDefinitionRow(t, stage.stage_key, canEdit)).join(''):'<div class="at-empty">No tasks configured for this stage.</div>'}${canEdit?`<div class="at-actions"><button class="at-btn secondary at-add-def" type="button" data-stage-key="${attr(stage.stage_key)}">Add task to ${esc(stage.label||stage.stage_key)}</button></div>`:''}</div></details>`;
  }
  function settingsModal(){
    if(!state.settingsOpen) return '';
    const canEdit=canEditApplicantSettings();
    const ro=canEdit?'':'disabled';
    const readonly=canEdit?'':' at-readonly';
    const stages=stageRowsForSettings().filter(st=>OPEN_STATUS_KEYS.has(clean(st.stage_key)));
    return `<div class="at-modal-backdrop" id="at-settings-modal-backdrop"><div class="at-modal at-settings-modal" role="dialog" aria-modal="true" aria-labelledby="at-settings-title"><div class="at-modal-head"><div><h2 id="at-settings-title">Applicant Tracker Settings</h2><p style="margin:6px 0 0;color:rgba(255,255,255,.88);font-weight:800">These settings affect the organization-wide applicant workflow.</p></div><button class="at-close" id="at-close-settings" type="button" aria-label="Close settings">×</button></div><div class="at-modal-body${readonly}">${!canEdit?`<div class="at-alert info">Settings are visible here, but only Organization Super Admins or Platform Admins can change them.</div>`:''}<div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Portal access</h3><label class="at-field"><span class="at-label">Applicant portal access</span><select id="at-settings-portal" class="at-select" ${ro}>${optionList(PORTAL_MODES, clean(state.settings.portal_access_mode||'accepted_onboarding'))}</select><small>Controls when applicants may access their own applicant portal.</small></label><label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:850"><input type="checkbox" id="at-settings-updates" ${state.settings.allow_applicant_updates!==false?'checked':''} ${ro}> Allow applicant updates when portal access is allowed</label><label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:850"><input type="checkbox" id="at-settings-waitlist" ${state.settings.show_waitlist_position===true?'checked':''} ${ro}> Show waitlist position to applicants</label></div><div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Workflow stages</h3><p class="at-muted">Default applicant workflow: New → Waitlist → Invited to Interview → Onboarding → Ready for Final Review. Closed applicant files are Archived with a required archive reason.</p>${stages.map(st=>`<div class="at-stage-row"><strong>${esc(st.label||st.stage_key)}</strong><span>${esc(st.description||'—')}</span><span>${esc(st.category||'active')}</span></div>`).join('')}</div><div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Checklist templates by stage</h3><p class="at-muted">Required tasks block advancement to the next stage until completed or waived. Applicant-visible tasks appear in the applicant portal when portal access allows.</p>${stages.map(st=>stageChecklistEditor(st, canEdit)).join('')}</div>${canEdit?`<div class="at-actions"><button class="at-btn" id="at-save-settings">Save portal settings</button></div>`:''}</div></div></div>`;
  }
  function archiveModal(){
    if(!state.archiveModalOpen || !state.selected) return '';
    const reason=clean(state.archiveReasonKey);
    return `<div class="at-modal-backdrop" id="at-archive-modal-backdrop"><div class="at-modal" role="dialog" aria-modal="true" aria-labelledby="at-archive-title"><div class="at-modal-head"><div><h2 id="at-archive-title">Archive applicant</h2><p style="margin:6px 0 0;color:rgba(255,255,255,.88);font-weight:800">Archiving closes this applicant lifecycle. Choose a reason for future filtering/reporting.</p></div><button class="at-close" id="at-close-archive" type="button" aria-label="Close archive dialog">×</button></div><div class="at-modal-body"><div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">${esc(state.selected.display_name||'Applicant')}</h3><label class="at-field"><span class="at-label">Archive reason</span><select id="at-archive-reason" class="at-select"><option value="">Select one</option>${ARCHIVE_REASONS.map(([k,l])=>`<option value="${esc(k)}" ${reason===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>${reason==='added_as_member'?'<div class="at-alert info">This reason means applicant tracking is complete. Ongoing management should move to People after conversion/linking.</div>':''}<label class="at-field"><span class="at-label">Archive note ${reason==='other'?'(required)':'(optional)'}</span><textarea id="at-archive-note" class="at-textarea" placeholder="Add context for the applicant timeline and future filtering.">${esc(state.archiveReasonNote)}</textarea></label><div class="at-actions"><button class="at-btn danger" id="at-confirm-archive" type="button">Archive applicant</button><button class="at-btn secondary" id="at-cancel-archive" type="button">Cancel</button></div></div></div></div></div>`;
  }

  function shouldOfferConversion(app){ const s=clean(app?.status||app?.applicant_status||app?.stage_key); return !!app && !isArchivedApplicant(app) && ["onboarding","ready_for_final_review"].includes(s); }
  function conversionLookups(){ const o=obj(state.conversionOptions); return { statuses: arr(o.membership_statuses), classes: arr(o.membership_classes), stages: arr(o.application_stages), matches: arr(o.matches) }; }
  function statusKeyFromRow(r){ return clean(r.status_key || r.key || r.lifecycle_status_key); }
  function classKeyFromRow(r){ return clean(r.class_key || r.key); }
  function stageKeyFromRow(r){ return clean(r.stage_key || r.key); }
  function membershipStatusOptions(rows, selected){ return `<option value="">No lifecycle status change</option>${arr(rows).map(r=>`<option value="${attr(statusKeyFromRow(r))}" ${selected===statusKeyFromRow(r)?'selected':''}>${esc(r.label||r.status_label||r.status_key||r.key)}</option>`).join('')}`; }
  function membershipClassOptions(rows, selected){ return `<option value="">No member class</option>${arr(rows).map(r=>`<option value="${attr(classKeyFromRow(r))}" ${selected===classKeyFromRow(r)?'selected':''}>${esc(r.label||r.class_label||r.class_key||r.key)}</option>`).join('')}`; }
  function applicationStageOptions(rows, selected){ return `<option value="">No onboarding stage</option>${arr(rows).map(r=>`<option value="${attr(stageKeyFromRow(r))}" ${selected===stageKeyFromRow(r)?'selected':''}>${esc(r.label||r.stage_label||r.stage_key||r.key)}</option>`).join('')}`; }

  function selectedDetail(){
    const app=state.selected;
    if(!app) return `<main class="at-card"><h2>Select an applicant</h2><p class="at-muted">Choose an applicant from the left list to review workflow, tasks, notes, uploads, and email actions.</p></main>`;
    const currentStage=clean(app.stage_key||app.status||'new');
    const currentTasks=arr(app.current_stage_tasks).length?arr(app.current_stage_tasks):arr(app.tasks).filter(t=>clean(t.stage_key||currentStage)===currentStage);
    const archived=isArchivedApplicant(app);
    const archiveReason=archived?clean(app.archive_reason_label||archiveReasonLabel(app.archive_reason_key)):"";
    return `<main class="at-card"><div class="at-detail-head"><div><h2>${esc(app.display_name||'Applicant')}</h2><div class="at-meta">${esc(app.email||'No email')} ${app.phone?`• ${esc(app.phone)}`:''} • Submitted ${esc(fmtDate(app.submitted_at||app.created_at))}</div></div><div class="at-actions"><span class="at-pill ${archived?'bad':(app.needs_attention?'hot':'')}">${esc(archived?'Archived':(app.needs_attention?'Needs attention':app.status_label||stageLabel(currentStage)))}</span>${archiveReason?`<span class="at-pill">${esc(archiveReason)}</span>`:''}${archived?'<button class="at-btn secondary" id="at-restore-app">Restore applicant</button>':`${shouldOfferConversion(app)?'<button class="at-btn" id="at-open-convert">Add as Member</button>':''}<button class="at-btn danger" id="at-archive-app">Archive applicant</button>`}</div></div>${archived?`<div class="at-alert info">This applicant file is archived${archiveReason?` — ${esc(archiveReason)}`:''}. ${app.archive_reason_key==='added_as_member'?'Ongoing notes and member management should move to People / member management.':''}</div>`:''}${app.converted_person_id||app.person_id?`<div class="at-alert ok">Linked person record: ${esc(app.converted_person_id||app.person_id)}. Open the People page to continue member management.</div>`:''}<div class="at-grid"><label class="at-field"><span class="at-label">Workflow stage</span><select id="at-app-status" class="at-select" ${archived?'disabled':''}>${stageOptions(currentStage)}</select></label><label class="at-field"><span class="at-label">Waitlist order</span><input id="at-waitlist" class="at-input" value="${attr(app.waitlist_order||'')}" placeholder="Optional" ${archived?'disabled':''}></label></div>${!archived?'<div class="at-actions" style="margin-top:10px"><button class="at-btn" id="at-save-app">Save applicant changes</button></div>':''}${applicationInfo(app)}${tasksSection(currentTasks, app)}${timelineSection(app)}${emailSection(app)}${DEBUG?`<pre class="at-debug">Selected applicant
${esc(JSON.stringify(app,null,2))}</pre>`:''}</main>`;
  }
  function applicationInfo(app){
    const aviation=obj(app.aviation_json), interest=obj(app.interest_json), safety=obj(app.safety_json), address=obj(app.address_json), background=obj(app.background_json), custom=obj(app.custom_answers_json), metadata=obj(app.metadata_json);
    const blank='—';
    const shown=(v)=>{ const c=clean(v); return c ? c : blank; };
    const date=(v)=>shown(fmtDate(v));
    const datetime=(v)=>shown(fmtDateTime(v));
    const row=(label,value)=>`<b>${esc(label)}</b><span>${esc(shown(value))}</span>`;
    const rows=(items)=>items.map(([label,value])=>row(label,value)).join('');
    const block=(title,items)=>`<div class="at-summary-block"><h4>${esc(title)}</h4><div class="at-kv">${rows(items)}</div></div>`;
    const all = `<section class="at-section"><div class="at-grid">${
      block('Applicant',[
        ['Name',app.display_name],
        ['Date of birth',fmtDate(app.date_of_birth)],
        ['Email',app.email],
        ['Mobile phone',app.phone],
        ['Home phone',app.home_phone||metadata.home_phone],
        ['Applicant status',app.status_label||stageLabel(app.stage_key||app.status)]
      ]) +
      block('Address / background',[
        ['Street',address.address_1||address.street_address||address.address],
        ['Address 2',address.address_2],
        ['City',address.city],
        ['State',address.state],
        ['ZIP',address.zip],
        ['Employer',background.employer],
        ['Occupation',background.occupation]
      ]) +
      block('Aviation qualifications',[
        ['Pilot certificate number',aviation.pilot_certificate_number],
        ['Certificate level',aviation.certificate_level],
        ['Ratings / endorsements',aviation.ratings||aviation.ratings_endorsements],
        ['Medical / BasicMed',aviation.medical_class||aviation.medical_basicmed_status],
        ['Last medical date',fmtDate(aviation.last_medical_date)],
        ['Total flight hours',aviation.total_hours],
        ['Night hours',aviation.night_hours],
        ['IFR hours',aviation.ifr_hours],
        ['Complex hours',aviation.complex_hours],
        ['Aircraft experience',aviation.aircraft_experience||aviation.aircraft_types_hours],
        ['Last BFR / checkride',aviation.last_bfr||aviation.last_bfr_checkride],
        ['Instructor / examiner',aviation.instructor_examiner],
        ['Other clubs / FBOs',aviation.other_clubs_fbos]
      ]) +
      block('Safety / FAA',[
        ['Aircraft accident / incident history',safety.accident_history||safety.accident_incident_history],
        ['Accident / incident details',safety.accident_details||safety.accident_incident_details],
        ['FAA action history',safety.faa_history||safety.faa_action_history],
        ['FAA action details',safety.faa_details||safety.faa_action_details]
      ]) +
      block('Interest / referral',[
        ['Why do you want to join?',interest.why_join],
        ['Expected type of flying',interest.expected_flying],
        ['How did you hear about us?',interest.how_hear_us||interest.referral_source],
        ['Referred by',interest.referred_by],
        ['Anything else',custom.additional_notes||interest.additional_notes||metadata.additional_notes]
      ]) +
      block('Activity',[
        ['Submitted',fmtDateTime(app.submitted_at||app.created_at)],
        ['Last activity',fmtDateTime(app.last_activity_at||app.updated_at)],
        ['Last email',fmtDateTime(app.last_reply_at)],
        ['Waitlist order',app.waitlist_order]
      ])
    }</div></section>`;
    return majorSection('Application details', all, true);
  }
  function sectionKey(title){ return clean(title).toLowerCase().split('/')[0].replace(/[^a-z]+/g,'_').replace(/^_+|_+$/g,'') || 'section'; }
  function majorSection(title, body, open=false){ const k=sectionKey(title); const isOpen = Object.prototype.hasOwnProperty.call(state.openMajor,k) ? state.openMajor[k] : open; return `<details class="at-major" data-major="${attr(k)}" ${isOpen?'open':''}><summary>${esc(title)}</summary><div class="at-major-body">${body}</div></details>`; }
  function tasksSection(tasks, app){ const stage=stageLabel(app.stage_key||app.status); const body=`<section class="at-section"><h3>Checklist for ${esc(stage)}</h3>${tasks.length?tasks.map(taskHtml).join(''):'<div class="at-empty">No checklist tasks are configured for this stage.</div>'}</section>`; return majorSection('Checklist', body, false); }
  function taskHtml(task){ const uploads=arr(task.uploads); const status=task.status==='not_started'?'pending':clean(task.status||'pending'); return `<details class="at-task current"><summary><div class="at-task-head"><div><strong>${esc(task.label)}</strong><div class="at-meta">${esc(task.description||'')} ${task.responsible_party?`• Responsible: ${esc(task.responsible_party)}`:''}</div></div><span class="at-task-status-pill">${esc(statusLabelTask(status))}</span></div></summary><div class="at-task-body">${task.completed_at||task.completed_by_email?`<div class="at-alert ok">Completed ${task.completed_at?`on ${esc(fmtDateTime(task.completed_at))}`:''}${task.completed_by_email?` by ${esc(task.completed_by_email)}`:''}</div>`:''}<div class="at-task-head"><div class="at-meta">Update this task status or add a task-specific note.</div><select class="at-select at-task-status" data-task-id="${attr(task.applicant_task_id)}"><option value="pending" ${status==='pending'?'selected':''}>Pending</option><option value="in_progress" ${status==='in_progress'?'selected':''}>In progress</option><option value="completed" ${status==='completed'?'selected':''}>Completed</option><option value="waived" ${status==='waived'?'selected':''}>Waived</option><option value="blocked" ${status==='blocked'?'selected':''}>Blocked</option></select></div><label class="at-field"><span class="at-label">Task note</span><input class="at-input at-task-note" data-task-id="${attr(task.applicant_task_id)}" value="${attr(task.note||task.review_note||'')}" placeholder="Optional task note"></label>${uploads.length?`<div class="at-upload"><strong>Uploads</strong>${uploads.map(uploadHtml).join('')}</div>`:''}</div></details>`; }
  function uploadHtml(u){ const link=clean(u.signed_url||u.download_signed_url); return `<div class="at-event"><strong>${esc(u.original_file_name||u.display_name||'Uploaded file')}</strong> • ${esc(u.upload_status||'submitted')}${u.review_note?`<div class="at-meta">Review note: ${esc(u.review_note)}</div>`:''}${link?`<div class="at-meta"><a href="${attr(link)}" target="_blank" rel="noopener">Download/view upload</a></div>`:''}<div class="at-actions" style="margin-top:6px"><button class="at-btn secondary at-review-upload" data-upload-id="${attr(u.applicant_task_upload_id)}" data-status="accepted">Accept</button><button class="at-btn secondary at-review-upload" data-upload-id="${attr(u.applicant_task_upload_id)}" data-status="request_changes">Request changes</button><button class="at-btn danger at-review-upload" data-upload-id="${attr(u.applicant_task_upload_id)}" data-status="rejected">Reject</button></div></div>`; }
  function timelineEntries(app){
    const eventSkip=new Set(['note_added','prefab_email_sent','custom_email_sent']);
    const entries=[...arr(app.timeline_notes).map(n=>({...n, source:n.source||'note'})), ...arr(app.events).filter(e=>!eventSkip.has(clean(e.event_type))).map(e=>({title:eventTitle(e.event_type), body:e.note, actor_email:e.actor_email, created_at:e.created_at, source:'event', note_type:e.event_type}))];
    const q=clean(state.noteSearch).toLowerCase(); const filter=clean(state.noteFilter||'all');
    return entries.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).filter(n=>{ const text=[n.title,n.note_type,n.body,n.note,n.actor_name,n.actor_email,fmtDateTime(n.created_at)].map(x=>clean(x).toLowerCase()).join(' '); const type=clean(n.note_type||n.source); if(q && !text.includes(q)) return false; if(filter==='notes' && !(n.source==='manual'||n.source==='note'||type==='general')) return false; if(filter==='emails' && !type.includes('email')) return false; if(filter==='workflow' && (n.source==='manual'||n.source==='note'||type==='general'||type.includes('email'))) return false; return true; });
  }
  function eventTitle(v){ const s=clean(v).replace(/_/g,' '); return s ? s.replace(/\b\w/g,c=>c.toUpperCase()) : 'Activity'; }
  function displayNoteTitle(n){ const type=clean(n.note_type||n.source); if(type==='general' || n.source==='manual' || n.source==='note') return n.person_id ? 'Member note' : 'Applicant note'; return n.title || eventTitle(type); }
  function timelineSection(app){
    const notes=timelineEntries(app);
    const body=`<section class="at-section"><label class="at-field"><span class="at-label">Add note</span><textarea id="at-new-note" class="at-textarea" placeholder="Add a dated note for this applicant. Email and task events also appear here.">${esc(state.unsavedNote||'')}</textarea></label><div class="at-actions"><button class="at-btn secondary" id="at-add-note">${state.noteSaving?'Adding…':'Add note'}</button></div><div class="at-note-toolbar"><input id="at-note-search" class="at-input" value="${attr(state.noteSearch)}" placeholder="Search notes or activity…"><select id="at-note-filter" class="at-select"><option value="all" ${state.noteFilter==='all'?'selected':''}>All activity</option><option value="notes" ${state.noteFilter==='notes'?'selected':''}>Notes only</option><option value="emails" ${state.noteFilter==='emails'?'selected':''}>Emails</option><option value="workflow" ${state.noteFilter==='workflow'?'selected':''}>Workflow/tasks</option></select></div><div class="at-note-list" style="margin-top:10px">${notes.length?notes.map(n=>`<div class="at-note ${n.pending?'at-pending':''}"><div class="at-note-head"><span><span class="at-note-title">${esc(displayNoteTitle(n))}</span>${n.pending?' <span class="at-note-pending">saving</span>':(n.source==='event'?' <span class="at-pill">system</span>':'')}</span><span>${esc(fmtDateTime(n.created_at))}</span></div><div>${esc(n.body||n.note||'')}</div><div class="at-meta">${esc(n.actor_name||n.actor_email||state.email||'System')}</div></div>`).join(''):'<div class="at-empty">No matching notes or activity.</div>'}</div></section>`;
    return majorSection('Notes / activity timeline', body, false);
  }
  function emailSection(app){ const defaultTemplate=state.templates.find(t=>t.is_default)||state.templates[0]; const body=`<section class="at-section"><p class="at-meta">Sending an applicant email also adds a timeline entry.</p><div class="at-grid"><label class="at-field"><span class="at-label">Template</span><select id="at-email-template" class="at-select">${state.templates.map(t=>`<option value="${attr(t.template_key)}" ${defaultTemplate?.template_key===t.template_key?'selected':''}>${esc(t.template_name)}</option>`).join('')}</select></label><label class="at-field"><span class="at-label">To</span><input id="at-email-to" class="at-input" value="${attr(app.email)}"></label></div><label class="at-field"><span class="at-label">Optional note</span><input id="at-email-note" class="at-input" placeholder="Optional internal note about this email"></label><div class="at-actions"><button class="at-btn secondary" id="at-send-prefab">Send selected template</button></div></section>`; return majorSection('Applicant emails', body, false); }
  function helpDot(text){ return `<span class="at-help-dot" title="${attr(text)}" aria-label="${attr(text)}">i</span>`; }


  function transitionRule(fromStage, toStage){
    const from=clean(fromStage), to=clean(toStage);
    const rule={ title:`Move applicant to ${stageLabel(to)}`, intro:`This changes the applicant workflow from ${stageLabel(from)} to ${stageLabel(to)}.`, confirmations:[], actions:[] };
    if(from==='waitlist' && to==='invited_to_interview'){
      rule.actions.push({key:'send_interview_invitation', label:'Send interview invitation email if a matching template is configured', default:true});
    }
    if(from==='invited_to_interview' && to==='onboarding'){
      rule.confirmations.push({key:'approved_by_required_vote', label:'Confirm applicant was approved by required vote'});
      rule.actions.push({key:'send_onboarding_instructions', label:'Send onboarding instructions if a matching template is configured', default:true});
      rule.actions.push({key:'grant_applicant_portal_access', label:'Grant applicant portal access', default:true});
    }
    if(from==='onboarding' && to==='ready_for_final_review'){
      rule.confirmations.push({key:'onboarding_requirements_complete', label:'Confirm required onboarding requirements are complete or accounted for'});
    }
    if(!rule.confirmations.length && !rule.actions.length){
      rule.confirmations.push({key:'confirm_stage_change', label:`Confirm moving applicant to ${stageLabel(to)}`});
    }
    return rule;
  }
  function transitionModal(){
    if(!state.transitionModalOpen || !state.selected) return '';
    const rule=transitionRule(state.transitionFrom, state.transitionTo);
    const requiredOk=rule.confirmations.every(c=>state.transitionConfirmations[c.key]===true);
    return `<div class="at-modal-backdrop" id="at-transition-modal-backdrop"><div class="at-modal" role="dialog" aria-modal="true" aria-labelledby="at-transition-title"><div class="at-modal-head"><div><h2 id="at-transition-title">${esc(rule.title)}</h2><p style="margin:6px 0 0;color:rgba(255,255,255,.88);font-weight:800">${esc(rule.intro)}</p></div><button class="at-close" id="at-close-transition" type="button" aria-label="Close transition dialog">×</button></div><div class="at-modal-body"><div class="at-alert info">Important workflow changes are logged to the applicant timeline with who confirmed them and when.</div>${rule.confirmations.length?`<div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Required confirmations</h3><div class="at-transition-list">${rule.confirmations.map(c=>`<div class="at-transition-item"><label><input type="checkbox" class="at-transition-confirm" data-confirm-key="${attr(c.key)}" ${state.transitionConfirmations[c.key]?'checked':''}> <span>${esc(c.label)}</span></label></div>`).join('')}</div></div>`:''}${rule.actions.length?`<div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Automatic actions</h3><div class="at-transition-list">${rule.actions.map(a=>`<div class="at-transition-item"><label><input type="checkbox" class="at-transition-action" data-action-key="${attr(a.key)}" ${state.transitionActions[a.key]!==false?'checked':''}> <span>${esc(a.label)}</span></label></div>`).join('')}</div><div class="at-small-note">If an email template is missing or sending is not configured, the stage move will still complete and the timeline will record the issue.</div></div>`:''}<label class="at-field"><span class="at-label">Optional transition note</span><textarea id="at-transition-note" class="at-textarea" placeholder="Optional note for the applicant timeline.">${esc(state.transitionNote)}</textarea></label><div class="at-actions"><button class="at-btn" id="at-confirm-transition" ${!requiredOk?'disabled':''}>Confirm and move applicant</button><button class="at-btn secondary" id="at-cancel-transition">Cancel</button></div></div></div></div>`;
  }
  function resetTransitionModal(){ state.transitionModalOpen=false; state.transitionFrom=''; state.transitionTo=''; state.transitionNote=''; state.transitionConfirmations={}; state.transitionActions={}; }

  function convertModal(){
    if(!state.convertModalOpen) return '';
    const app=state.selected||{};
    const lookups=conversionLookups();
    const matches=arr(lookups.matches);
    const selectedMatch=clean(state.conversionPersonId);
    const hasMatches=matches.length>0;
    const mode=hasMatches ? state.conversionMode : 'create_new';
    const canSubmit = mode==='create_new' || selectedMatch;
    return `<div class="at-modal-backdrop" id="at-convert-modal-backdrop"><div class="at-modal" role="dialog" aria-modal="true" aria-labelledby="at-convert-title"><div class="at-modal-head"><div><h2 id="at-convert-title">Add Applicant as Member</h2><p style="margin:4px 0 0;color:rgba(255,255,255,.9);font-weight:800">This closes the applicant lifecycle and starts or links the People/member record.</p></div><button class="at-close" id="at-close-convert" type="button" aria-label="Close conversion dialog">×</button></div><div class="at-modal-body"><div class="at-alert info"><strong>Applicant records are preserved for history.</strong> This action archives the applicant with reason <strong>Added as Member</strong>. Ongoing management should move to People.</div>${state.conversionLoading?'<div class="at-card">Loading conversion options…</div>':`<div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Applicant</h3><div class="at-summary-block"><strong>${esc(app.display_name||'Applicant')}</strong><div class="at-meta">${esc(app.email||'No email')} ${app.phone?`• ${esc(app.phone)}`:''}</div></div></div><div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Person record</h3><div class="at-choice-grid"><label class="at-choice ${mode==='create_new'?'selected':''}"><span><input type="radio" name="at-convert-mode-radio" value="create_new" ${mode==='create_new'?'checked':''}> <strong>Create new person record</strong>${helpDot('Use this when this applicant does not already have a People record. The applicant history stays linked to the new person.')}</span><span class="at-inline-help">Creates a new People/member record from the reviewed application data.</span></label><label class="at-choice ${!hasMatches?'disabled ':''}${mode==='link_existing'?'selected':''}"><span><input type="radio" name="at-convert-mode-radio" value="link_existing" ${mode==='link_existing'?'checked':''} ${!hasMatches?'disabled':''}> <strong>Link existing person record</strong>${helpDot('Use this only when the applicant is already in People, such as a former member or manually-entered person. This avoids creating a duplicate.')}</span><span class="at-inline-help">${hasMatches?'Use a possible match below instead of creating a duplicate person.':'No likely existing person match was found.'}</span></label></div>${mode==='link_existing'?`<div style="margin-top:12px"><h4 style="margin:8px 0;color:var(--at-primary,#265c2b)">Possible people matches</h4>${matches.length?matches.map(m=>`<label class="at-match ${selectedMatch===clean(m.person_id)?'selected':''}"><input type="radio" name="at-convert-person" value="${attr(m.person_id)}" ${selectedMatch===clean(m.person_id)?'checked':''}> <strong>${esc(m.display_name||'Person')}</strong><div class="at-meta">${esc(m.primary_email||'')} ${m.primary_phone?`• ${esc(m.primary_phone)}`:''} • ${esc(m.match_reason||'Possible match')}${m.has_active_membership?' • active membership exists':''}</div></label>`).join(''):'<div class="at-empty">No likely existing people were found. Choose create new person.</div>'}</div>`:''}</div><div class="at-card"><h3 style="margin-top:0;color:var(--at-primary,#265c2b)">Member setup</h3><div class="at-grid"><label class="at-field"><span class="at-label">Starting member class</span><select id="at-convert-class" class="at-select">${membershipClassOptions(lookups.classes, state.conversionClassKey)}</select></label><label class="at-field"><span class="at-label">Optional note</span><input id="at-convert-note" class="at-input" value="${attr(state.conversionNote)}" placeholder="Optional note for the applicant/member history"></label></div></div><div class="at-alert info"><strong>Applicant portal access is separate.</strong> Use the applicant workflow/settings to invite someone to the onboarding portal before membership. This Add as Member action closes the applicant lifecycle.</div><div class="at-alert info">Flight scheduler access is seeded as pending checkout. The scheduler itself is not enabled in this pass.</div><div class="at-actions"><button class="at-btn" id="at-confirm-convert" ${!canSubmit||state.conversionSaving?'disabled':''}>${state.conversionSaving?'Adding…':'Add as Member'}</button><button class="at-btn secondary" id="at-cancel-convert">Cancel</button></div>`}</div></div></div>`;
  }

  function html(){ if(state.loading) return `<style>${css()}</style><div class="at-wrap" style="${styleVars()}"><div class="at-card">Loading applicant tracker…</div></div>`; if(state.error) return `<style>${css()}</style><div class="at-wrap"><div class="at-alert bad">${esc(state.error)}</div></div>`; return `<style>${css()}</style><div class="at-wrap" style="${styleVars()}"><section class="at-panel"><div class="at-hero"><div style="font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;opacity:.88">Organization Admin</div><h1>Applicant Tracker</h1><p>Review applicants, manage stage-based workflow tasks, record notes, review uploads, and send applicant communications.</p></div><div class="at-body">${state.message?`<div class="at-alert ${state.messageKind||'info'}">${esc(state.message)}</div>`:''}<div class="at-layout">${leftPanel()}${selectedDetail()}</div>${settingsModal()}${archiveModal()}${transitionModal()}${convertModal()}${DEBUG?`<pre class="at-debug">SyncEtc Applicant Tracker ${VERSION}\nElapsed: ${Date.now()-startMs}ms\nSession: ${esc(state.email)}\nOrg: ${esc(state.accessRow?.organization_key||'')}\nApplicants: ${state.applicants.length}\nSteps:\n${esc(steps.join('\n'))}</pre>`:''}</div></section></div>`; }
  function render(){ const r=root(); if(r) r.innerHTML=html(); bind(); }
  function hasUnsaved(){
    return !!(
      state.dirty ||
      state.settingsDirty ||
      clean(state.unsavedNote) ||
      (state.archiveModalOpen && (clean(state.archiveReasonKey) || clean(state.archiveReasonNote))) ||
      (state.convertModalOpen && clean(state.conversionNote)) || (state.transitionModalOpen && (clean(state.transitionNote) || Object.keys(obj(state.transitionConfirmations)).length || Object.keys(obj(state.transitionActions)).length))
    );
  }
  function setDirty(v=true){ state.dirty=!!v; }
  function confirmDiscard(){ return !hasUnsaved() || confirm('You have unsaved applicant changes. Leave without saving?'); }
  function refreshApplicantListDom(){
    const count=byId('at-list-count');
    const list=byId('at-applicant-list');
    if(count) count.textContent = `${state.applicants.length} matching applicants`;
    const filter=byId('at-filter');
    if(filter) filter.innerHTML = statusOptions(state.filter,true);
    if(list) list.innerHTML = state.applicants.length ? state.applicants.map(applicantCard).join('') : '<div class="at-empty">No applicants match this view.</div>';
    bindApplicantRows();
  }
  function bindApplicantRows(){
    document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{
      if(!confirmDiscard()) return;
      setDirty(false); state.settingsDirty=false; state.unsavedNote='';
      state.selectedId=btn.dataset.open;
      state.selected=state.applicants.find(a=>a.application_id===state.selectedId)||state.allApplicants.find(a=>a.application_id===state.selectedId)||null;
      render();
    }));
  }
  function applyLocalApplicantFilter({clearSelectionIfHidden=false}={}){
    state.applicants=visibleApplicants();
    if(clearSelectionIfHidden && state.selectedId && !state.applicants.some(a=>a.application_id===state.selectedId)) {
      state.selected=null; state.selectedId=''; setDirty(false);
      render();
      return;
    }
    refreshApplicantListDom();
  }
  function taskNeedsAdminReview(task){
    const required = task.is_required !== false;
    const responsible = key(task.responsible_party || "admin");
    const status = key(task.status || "pending");
    const review = key(task.review_status || task.upload_status || "");
    const adminResponsible = responsible && responsible !== "applicant" && responsible !== "system";
    if(required && adminResponsible && !["completed","waived"].includes(status)) return true;
    if(["submitted","request_changes","rejected","reviewing"].includes(review)) return true;
    return false;
  }
  function applicantNeedsAttention(app){
    if(!app || isArchivedApplicant(app)) return false;
    const stage=clean(app.status||app.applicant_status||app.stage_key||"new");
    if(stage==="new" || stage==="ready_for_final_review") return true;
    return arr(app.current_stage_tasks).concat(arr(app.tasks)).some(taskNeedsAdminReview);
  }
  function newApplicantBadgeCount(){
    return arr(state.allApplicants).filter(applicantNeedsAttention).length;
  }
  function updateApplicantHeaderBadgeLocally(){
    const count=newApplicantBadgeCount();
    try{
      document.documentElement.style.setProperty('--syncetc-applicant-tracker-local-count', JSON.stringify(String(count)));
      const candidates=Array.from(document.querySelectorAll('a,button,[role="link"],[data-page-key],[data-page],[href]')).filter(el=>{
        if(el.closest && el.closest('.at-wrap')) return false;
        return /Applicant\s+Tracker/i.test(el.textContent||'');
      });
      candidates.forEach(el=>{
        el.querySelectorAll('.syncetc-local-applicant-badge').forEach(n=>n.remove());
        if(count>0){
          const badge=document.createElement('span');
          badge.className='syncetc-local-applicant-badge';
          badge.textContent=String(count);
          badge.setAttribute('aria-label', `${count} new applicant${count===1?'':'s'}`);
          badge.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-width:1.4em;height:1.4em;margin-left:.35em;padding:0 .35em;border-radius:999px;background:#f59e0b;color:#111827;font-size:.78em;font-weight:950;line-height:1;vertical-align:middle;';
          el.appendChild(badge);
        }
      });
    }catch(_){ /* best-effort only; never hard refresh just for a badge */ }
  }


  function closeConvertModal(){
    if(!confirmDiscard()) return;
    state.convertModalOpen=false;
    state.conversionOptions=null;
    state.conversionNote='';
    state.conversionPersonId='';
    render();
  }

  function bind(){ byId('at-search')?.addEventListener('input', e=>{ state.search=e.target.value||''; applyLocalApplicantFilter({clearSelectionIfHidden:false}); }); byId('at-filter')?.addEventListener('change', e=>{ if(!confirmDiscard()){e.target.value=state.filter; return;} state.filter=e.target.value; setDirty(false); applyLocalApplicantFilter({clearSelectionIfHidden:true}); }); byId('at-sort')?.addEventListener('change', e=>{ state.sort=e.target.value; applyLocalApplicantFilter({clearSelectionIfHidden:false}); }); byId('at-refresh')?.addEventListener('click',()=>refresh(true)); bindApplicantRows(); byId('at-open-convert')?.addEventListener('click', openConvertModal); byId('at-open-settings')?.addEventListener('click',()=>{ state.settingsOpen=true; render(); }); byId('at-close-settings')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; state.settingsOpen=false; state.settingsDirty=false; render(); }); byId('at-cancel-settings')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; state.settingsOpen=false; state.settingsDirty=false; render(); }); byId('at-settings-modal-backdrop')?.addEventListener('click',(e)=>{ if(e.target?.id==='at-settings-modal-backdrop'){ if(!confirmDiscard()) return; state.settingsOpen=false; state.settingsDirty=false; render(); } }); document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && state.settingsOpen){ if(!confirmDiscard()) return; state.settingsOpen=false; state.settingsDirty=false; render(); } if(e.key==='Escape' && state.archiveModalOpen){ if(!confirmDiscard()) return; state.archiveModalOpen=false; state.archiveReasonKey=''; state.archiveReasonNote=''; render(); } if(e.key==='Escape' && state.convertModalOpen){ closeConvertModal(); } if(e.key==='Escape' && state.transitionModalOpen){ if(!confirmDiscard()) return; resetTransitionModal(); render(); }}); byId('at-close-transition')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; resetTransitionModal(); render(); }); byId('at-cancel-transition')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; resetTransitionModal(); render(); }); byId('at-transition-modal-backdrop')?.addEventListener('click',(e)=>{ if(e.target?.id==='at-transition-modal-backdrop'){ if(!confirmDiscard()) return; resetTransitionModal(); render(); }}); document.querySelectorAll('.at-transition-confirm').forEach(el=>el.addEventListener('change',(e)=>{ state.transitionConfirmations[e.target.dataset.confirmKey]=!!e.target.checked; setDirty(true); render(); })); document.querySelectorAll('.at-transition-action').forEach(el=>el.addEventListener('change',(e)=>{ state.transitionActions[e.target.dataset.actionKey]=!!e.target.checked; setDirty(true); })); byId('at-transition-note')?.addEventListener('input',(e)=>{ state.transitionNote=e.target.value||''; setDirty(true); }); byId('at-confirm-transition')?.addEventListener('click',()=>saveApplicant({confirmedTransition:true}));  byId('at-close-convert')?.addEventListener('click',closeConvertModal); byId('at-cancel-convert')?.addEventListener('click',closeConvertModal); byId('at-convert-modal-backdrop')?.addEventListener('click',(e)=>{ if(e.target?.id==='at-convert-modal-backdrop'){ closeConvertModal(); }}); document.querySelectorAll('input[name="at-convert-mode-radio"]').forEach(el=>el.addEventListener('change',(e)=>{ state.conversionMode=e.target.value||'create_new'; if(state.conversionMode==='create_new') state.conversionPersonId=''; render();})); document.querySelectorAll('input[name="at-convert-person"]').forEach(el=>el.addEventListener('change',(e)=>{ state.conversionPersonId=e.target.value||''; render();})); byId('at-convert-status')?.addEventListener('change',(e)=>{ state.conversionStatusKey=e.target.value||''; }); byId('at-convert-class')?.addEventListener('change',(e)=>{ state.conversionClassKey=e.target.value||''; }); byId('at-convert-stage')?.addEventListener('change',(e)=>{ state.conversionStageKey=e.target.value||''; }); byId('at-convert-note')?.addEventListener('input',(e)=>{ state.conversionNote=e.target.value||''; }); byId('at-confirm-convert')?.addEventListener('click', confirmConvertApplicant); byId('at-save-settings')?.addEventListener('click',saveSettings); document.querySelectorAll('.at-add-def').forEach(btn=>btn.addEventListener('click',()=>addTaskDefinitionDraft(btn.dataset.stageKey))); document.querySelectorAll('.at-save-def').forEach(btn=>btn.addEventListener('click',()=>upsertTaskDefinitionFromButton(btn))); document.querySelectorAll('.at-archive-def').forEach(btn=>btn.addEventListener('click',()=>archiveTaskDefinitionFromButton(btn))); document.querySelectorAll('.at-def-label,.at-def-description,.at-def-responsible,.at-def-required,.at-def-visible,.at-def-sort').forEach(el=>el.addEventListener('input',()=>{state.settingsDirty=true; setDirty(true);})); document.querySelectorAll('.at-def-label,.at-def-description,.at-def-responsible,.at-def-required,.at-def-visible,.at-def-sort').forEach(el=>el.addEventListener('change',()=>{state.settingsDirty=true; setDirty(true);})); byId('at-save-app')?.addEventListener('click',saveApplicant); byId('at-add-note')?.addEventListener('click',addNote); byId('at-send-prefab')?.addEventListener('click',sendPrefab); byId('at-archive-app')?.addEventListener('click',archiveApplicant); byId('at-restore-app')?.addEventListener('click',restoreApplicant); byId('at-close-archive')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; state.archiveModalOpen=false; state.archiveReasonKey=''; state.archiveReasonNote=''; render();}); byId('at-cancel-archive')?.addEventListener('click',()=>{ if(!confirmDiscard()) return; state.archiveModalOpen=false; state.archiveReasonKey=''; state.archiveReasonNote=''; render();}); byId('at-archive-modal-backdrop')?.addEventListener('click',(e)=>{ if(e.target?.id==='at-archive-modal-backdrop'){ if(!confirmDiscard()) return; state.archiveModalOpen=false; state.archiveReasonKey=''; state.archiveReasonNote=''; render();}}); byId('at-archive-reason')?.addEventListener('change',(e)=>{state.archiveReasonKey=e.target.value; setDirty(!!clean(state.archiveReasonKey)||!!clean(state.archiveReasonNote)); render();}); byId('at-archive-note')?.addEventListener('input',(e)=>{state.archiveReasonNote=e.target.value||''; setDirty(!!clean(state.archiveReasonKey)||!!clean(state.archiveReasonNote));}); byId('at-confirm-archive')?.addEventListener('click',confirmArchiveApplicant); byId('at-note-search')?.addEventListener('input',e=>{ const pos=e.target.selectionStart||0; state.noteSearch=e.target.value||''; render(); const n=byId('at-note-search'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} } }); byId('at-note-filter')?.addEventListener('change',e=>{state.noteFilter=e.target.value||'all'; render();}); byId('at-app-status')?.addEventListener('change',()=>setDirty(true)); byId('at-waitlist')?.addEventListener('input',()=>setDirty(true)); ['at-settings-portal','at-settings-updates','at-settings-waitlist'].forEach(id=>{ const el=byId(id); if(el) el.addEventListener('change',()=>{ state.settingsDirty=true; setDirty(true); }); }); document.querySelectorAll('[data-task-field]').forEach(el=>el.addEventListener('input',()=>{ state.settingsDirty=true; setDirty(true); })); document.querySelectorAll('[data-task-field]').forEach(el=>el.addEventListener('change',()=>{ state.settingsDirty=true; setDirty(true); })); document.querySelectorAll('.at-add-task-def').forEach(btn=>btn.addEventListener('click',()=>{ const stageKey=clean(btn.dataset.stageKey||'new'); state.taskDefinitions=[...arr(state.taskDefinitions),{_temp_id:`tmp_${Date.now()}`,stage_key:stageKey,label:'',description:'',responsible_party:'admin',task_type:'manual',is_required:true,applicant_visible:true,sort_order:100,status:'active'}]; state.settingsDirty=true; setDirty(true); render(); })); document.querySelectorAll('.at-remove-task-def').forEach(btn=>btn.addEventListener('click',()=>{ const id=clean(btn.dataset.taskId); if(!id) return; if(!confirm('Remove this checklist task from the organization settings? Existing applicant history is preserved.')) return; if(id.startsWith('tmp')) state.taskDefinitions=arr(state.taskDefinitions).filter(t=>taskDefId(t)!==id); else { state.deletedTaskDefinitionIds=[...arr(state.deletedTaskDefinitionIds),id]; state.taskDefinitions=arr(state.taskDefinitions).filter(t=>taskDefId(t)!==id); } state.settingsDirty=true; setDirty(true); render(); })); byId('at-new-note')?.addEventListener('input', e=>{ state.unsavedNote=e.target.value||''; setDirty(!!clean(state.unsavedNote)); }); document.querySelectorAll('[data-major]').forEach(el=>el.addEventListener('toggle',()=>{ state.openMajor[el.dataset.major]=el.open; })); document.querySelectorAll('.at-settings-stage').forEach(el=>el.addEventListener('toggle',()=>{ if(el.open){ document.querySelectorAll('.at-settings-stage').forEach(other=>{ if(other!==el) other.open=false; }); } })); document.querySelectorAll('.at-task-status,.at-task-note').forEach(el=>el.addEventListener('change',updateTaskFromElement)); document.querySelectorAll('.at-review-upload').forEach(btn=>btn.addEventListener('click',()=>reviewUpload(btn.dataset.uploadId, btn.dataset.status))); }
  async function runButton(id,label,fn){ const btn=byId(id); const old=btn?.textContent||''; try{ state.saving=true; if(btn){btn.disabled=true;btn.textContent=label||'Saving…';} await fn(); }catch(e){ state.message=e.message||String(e); state.messageKind='bad'; render(); }finally{ state.saving=false; if(btn){btn.disabled=false;btn.textContent=old;} } }
  async function openConvertModal(){
    if(!state.selected) return;
    state.convertModalOpen=true; state.conversionLoading=true; state.conversionOptions=null; state.conversionMode='create_new'; state.conversionPersonId=''; state.conversionStatusKey=''; state.conversionClassKey=''; state.conversionStageKey=''; state.conversionNote=''; render();
    try{
      const res=await accessCall({action:'organization_get_applicant_conversion_options', organization_id:state.orgId, application_id:state.selected.application_id});
      state.conversionOptions=res;
      const statuses=arr(res.membership_statuses), classes=arr(res.membership_classes), stages=arr(res.application_stages);
      const pick=(rows, keys, getter)=>{ for(const k of keys){ const row=rows.find(r=>getter(r)===k); if(row) return k; } return ''; };
      state.conversionStatusKey=pick(statuses,['active','probationary','pending'],statusKeyFromRow);
      state.conversionClassKey=pick(classes,['probationary-member','probationary','full-member','member'],classKeyFromRow);
      state.conversionStageKey=pick(stages,['onboarding','approved','converted'],stageKeyFromRow);
      // Default to creating a new person for clarity; admins may choose a suggested existing person match when appropriate.
    }catch(e){ state.message=e.message||String(e); state.messageKind='bad'; state.convertModalOpen=false; }
    finally{ state.conversionLoading=false; render(); }
  }

  async function confirmConvertApplicant(){
    if(!state.selected) return;
    const payload={ action:'organization_convert_applicant_to_member', organization_id:state.orgId, application_id:state.selected.application_id, conversion_mode:state.conversionMode, person_id:state.conversionPersonId, membership_status_key:state.conversionStatusKey, membership_class_key:val('at-convert-class')||state.conversionClassKey, application_stage_key:state.conversionStageKey, conversion_note:val('at-convert-note')||state.conversionNote };
    if(!payload.membership_class_key){ state.message='Choose a starting member class before conversion.'; state.messageKind='bad'; render(); return; }
    if(payload.conversion_mode==='link_existing' && !payload.person_id){ state.message='Select the existing person to link.'; state.messageKind='bad'; render(); return; }
    state.conversionSaving=true; render();
    try{
      const res=await accessCall(payload);
      state.convertModalOpen=false; state.conversionOptions=null; state.conversionSaving=false;
      const updated=res.applicant||state.selected;
      state.selected=updated; state.selectedId=updated.application_id;
      const ix=state.allApplicants.findIndex(a=>a.application_id===updated.application_id); if(ix>=0) state.allApplicants[ix]=updated;
      state.applicants=visibleApplicants();
      state.message='Applicant added as member. Ongoing management should continue in People.'; state.messageKind='ok'; setDirty(false); updateApplicantHeaderBadgeLocally(); render();
    }catch(e){ state.conversionSaving=false; state.message=e.message||String(e); state.messageKind='bad'; render(); }
  }

  function collectTaskDefinitionRows(){
    const rows=[];
    document.querySelectorAll('[data-taskdef-row="1"]').forEach(row=>{
      const id=clean(row.dataset.taskId);
      const stageKey=clean(row.dataset.stageKey||'new');
      const get=(field)=>row.querySelector(`[data-task-field="${field}"]`);
      const label=clean(get('label')?.value);
      if(!label) return;
      rows.push({
        applicant_task_definition_id: id.startsWith('tmp') ? '' : id,
        task_key: clean(row.dataset.taskKey) || `${stageKey}-${key(label)}`,
        stage_key: stageKey,
        label,
        description: clean(get('description')?.value),
        responsible_party: clean(get('responsible_party')?.value || 'admin'),
        task_type: clean(get('task_type')?.value || 'manual'),
        sort_order: Number(clean(get('sort_order')?.value) || 100),
        is_required: !!get('is_required')?.checked,
        applicant_visible: !!get('applicant_visible')?.checked,
        status: 'active'
      });
    });
    arr(state.deletedTaskDefinitionIds).forEach(id=>rows.push({applicant_task_definition_id:id, status:'archived', archived:true}));
    return rows;
  }
  function findTaskDefById(id){ return arr(state.taskDefinitions).find(t=>taskDefId(t)===clean(id)); }
  function getTaskDefinitionPayload(id){
    const row=document.querySelector(`.at-task-def-row[data-task-def-id="${CSS.escape(id)}"]`);
    if(!row) throw new Error('Task row was not found.');
    const existing=findTaskDefById(id) || {};
    const label=clean(row.querySelector('.at-def-label')?.value);
    if(!label) throw new Error('Task label is required.');
    const stageKey=clean(row.dataset.stageKey || existing.stage_key || 'new');
    return {
      action:'organization_upsert_applicant_task_definition', organization_id:state.orgId,
      applicant_task_definition_id: clean(existing.applicant_task_definition_id || existing.task_definition_id),
      task_definition_id: clean(existing.task_definition_id || existing.applicant_task_definition_id),
      stage_key: stageKey,
      task_key: clean(existing.task_key) || `${stageKey}-${key(label)}`,
      label,
      description: clean(row.querySelector('.at-def-description')?.value),
      responsible_party: clean(row.querySelector('.at-def-responsible')?.value || 'admin'),
      task_type: clean(existing.task_type || 'manual'),
      is_required: !!row.querySelector('.at-def-required')?.checked,
      applicant_visible: !!row.querySelector('.at-def-visible')?.checked,
      sort_order: Number(row.querySelector('.at-def-sort')?.value || existing.sort_order || 100)
    };
  }
  async function saveTaskDefinition(id){
    try{
      const payload=getTaskDefinitionPayload(id);
      await runButton(``, 'Saving…', async()=>{});
    }catch(_){ /* noop: runButton needs a button id, handled below */ }
  }
  async function upsertTaskDefinitionFromButton(btn){
    const id=clean(btn.dataset.taskDefId);
    const old=btn.textContent;
    try{
      btn.disabled=true; btn.textContent='Saving…';
      const payload=getTaskDefinitionPayload(id);
      const res=await accessCall(payload);
      const saved=res.task_definition || res.task || res.definition;
      if(saved){
        state.taskDefinitions=arr(state.taskDefinitions).filter(t=>taskDefId(t)!==id);
        state.taskDefinitions.push(saved);
      }
      state.settingsDirty=false; setDirty(false); state.message='Checklist task saved.'; state.messageKind='ok'; render();
    }catch(e){ state.message=e.message||String(e); state.messageKind='bad'; render(); }
    finally{ if(btn){btn.disabled=false; btn.textContent=old;} }
  }
  async function archiveTaskDefinitionFromButton(btn){
    const id=clean(btn.dataset.taskDefId); const existing=findTaskDefById(id);
    if(!existing) return;
    if(!confirm(`Archive checklist task "${existing.label||'task'}"? Existing applicant task history will remain.`)) return;
    const old=btn.textContent;
    try{
      btn.disabled=true; btn.textContent='Archiving…';
      const res=await accessCall({action:'organization_archive_applicant_task_definition', organization_id:state.orgId, applicant_task_definition_id:clean(existing.applicant_task_definition_id||existing.task_definition_id)});
      state.taskDefinitions=arr(state.taskDefinitions).filter(t=>taskDefId(t)!==id);
      state.settingsDirty=false; setDirty(false); state.message='Checklist task archived.'; state.messageKind='ok'; render();
    }catch(e){ state.message=e.message||String(e); state.messageKind='bad'; render(); }
    finally{ if(btn){btn.disabled=false; btn.textContent=old;} }
  }
  function addTaskDefinitionDraft(stageKey){
    const draft={ _draft_id:`draft-${Date.now()}-${Math.random().toString(36).slice(2)}`, stage_key:clean(stageKey||'new'), task_key:'', label:'', description:'', responsible_party:'admin', task_type:'manual', is_required:true, applicant_visible:true, sort_order:(taskDefsForStage(stageKey).length+1)*10, status:'active' };
    state.taskDefinitions=[...arr(state.taskDefinitions), draft];
    state.settingsDirty=true; setDirty(true); render();
  }
  async function saveSettings(){ if(!canEditApplicantSettings()){ state.message='Applicant settings are read-only for your role.'; state.messageKind='info'; render(); return; } await runButton('at-save-settings','Saving…', async()=>{ const res=await accessCall({action:'organization_update_applicant_settings', organization_id:state.orgId, portal_access_mode:val('at-settings-portal'), allow_applicant_updates:checked('at-settings-updates'), show_waitlist_position:checked('at-settings-waitlist'), task_definitions: collectTaskDefinitionRows()}); state.settings=res.settings||state.settings; state.taskDefinitions=arr(res.task_definitions||state.taskDefinitions); state.deletedTaskDefinitionIds=[]; state.settingsDirty=false; setDirty(false); state.message='Applicant settings saved.'; state.messageKind='ok'; render(); }); }
  async function saveApplicant(options={}){ if(!state.selected) return; const status=val('at-app-status'); const beforeStage=applicantStageKey(state.selected); const movingForward=status!==beforeStage && status!=='archived' && ['new','waitlist','invited_to_interview','onboarding','ready_for_final_review'].indexOf(status) > ['new','waitlist','invited_to_interview','onboarding','ready_for_final_review'].indexOf(beforeStage); if(movingForward && !options.confirmedTransition){ const rule=transitionRule(beforeStage,status); state.transitionModalOpen=true; state.transitionFrom=beforeStage; state.transitionTo=status; state.transitionNote=''; state.transitionConfirmations={}; state.transitionActions={}; rule.actions.forEach(a=>{ state.transitionActions[a.key]=a.default!==false; }); render(); return; } await runButton(options.confirmedTransition?'at-confirm-transition':'at-save-app','Saving…', async()=>{ const payload={action:'organization_update_applicant', organization_id:state.orgId, application_id:state.selected.application_id, applicant_status:status, status, waitlist_order:val('at-waitlist')}; if(options.confirmedTransition){ payload.transition_from=state.transitionFrom; payload.transition_to=state.transitionTo; payload.transition_note=state.transitionNote; payload.transition_confirmations=state.transitionConfirmations; payload.transition_actions=state.transitionActions; } const res=await accessCall(payload); const updated=res.applicant||state.selected; state.selected=updated; state.selectedId=updated.application_id; state.message=options.confirmedTransition?'Applicant moved and workflow actions logged.':'Applicant saved.'; state.messageKind='ok'; resetTransitionModal(); setDirty(false); const ix=state.allApplicants.findIndex(a=>a.application_id===updated.application_id); if(ix>=0) state.allApplicants[ix]=updated; const ix2=state.applicants.findIndex(a=>a.application_id===updated.application_id); if(ix2>=0) state.applicants[ix2]=updated; state.applicants=visibleApplicants(); updateApplicantHeaderBadgeLocally(); render(); }); }
  async function updateTaskFromElement(e){ const id=e.target.dataset.taskId; if(!id) return; const status=document.querySelector(`.at-task-status[data-task-id="${CSS.escape(id)}"]`)?.value||'pending'; const note=document.querySelector(`.at-task-note[data-task-id="${CSS.escape(id)}"]`)?.value||''; try{ const res=await accessCall({action:'organization_update_applicant_task', organization_id:state.orgId, applicant_task_id:id, status, note}); state.message='Task updated.'; state.messageKind='ok'; if(state.selectedId) await refresh(true); }catch(error){ state.message=error.message||String(error); state.messageKind='bad'; render(); } }
  async function reviewUpload(uploadId,status){ const note=prompt(status==='accepted'?'Optional review note':'Enter review note / requested change')||''; try{ const res=await accessCall({action:'organization_review_applicant_upload', organization_id:state.orgId, applicant_task_upload_id:uploadId, review_status:status, note}); state.selected=res.applicant||state.selected; state.message='Upload review saved.'; state.messageKind='ok'; await refresh(true); }catch(e){ state.message=e.message||String(e); state.messageKind='bad'; render(); } }
  async function addNote(){
    if(!state.selected || state.noteSaving) return;
    const box=byId('at-new-note'); const body=clean(box?.value || state.unsavedNote);
    if(!body){ alert('Enter a note first.'); return; }
    const tempId=`pending-${Date.now()}`;
    const tempNote={ applicant_note_id:tempId, note_type:'general', source:'manual', title:'Applicant note', body, actor_name:state.person?.display_name||state.email, actor_email:state.email, created_at:new Date().toISOString(), pending:true };
    state.noteSaving=true;
    state.openMajor.notes=true;
    state.unsavedNote='';
    setDirty(false);
    state.selected={...state.selected, timeline_notes:[tempNote,...arr(state.selected.timeline_notes)], last_activity_at:new Date().toISOString()};
    const idx=state.applicants.findIndex(a=>a.application_id===state.selectedId); if(idx>=0) state.applicants[idx]=state.selected;
    render();
    try{
      const res=await accessCall({action:'organization_add_applicant_note', organization_id:state.orgId, application_id:state.selected.application_id, body, note_type:'general'});
      const saved=res.note || null;
      const current=arr(state.selected.timeline_notes).filter(n=>n.applicant_note_id!==tempId);
      state.selected=res.applicant || {...state.selected, timeline_notes:saved?[saved,...current]:current, last_activity_at:new Date().toISOString()};
      state.selectedId=state.selected.application_id;
      const idx2=state.applicants.findIndex(a=>a.application_id===state.selectedId); if(idx2>=0) state.applicants[idx2]=state.selected;
      state.message='Note added.'; state.messageKind='ok';
    }catch(e){
      state.selected={...state.selected, timeline_notes:arr(state.selected.timeline_notes).filter(n=>n.applicant_note_id!==tempId)};
      state.unsavedNote=body;
      setDirty(true);
      state.message=e.message||String(e); state.messageKind='bad';
    }finally{
      state.noteSaving=false; render();
    }
  }
  async function archiveApplicant(){
    if(!state.selected) return;
    state.archiveModalOpen=true;
    state.archiveReasonKey='';
    state.archiveReasonNote='';
    render();
  }
  async function confirmArchiveApplicant(){
    if(!state.selected) return;
    const reason=clean(state.archiveReasonKey);
    const note=clean(state.archiveReasonNote);
    if(!reason){ alert('Select an archive reason.'); return; }
    if(reason==='other' && !note){ alert('Enter an archive note when selecting Other.'); return; }
    await runButton('at-confirm-archive','Archiving…', async()=>{
      const label=archiveReasonLabel(reason);
      const res=await accessCall({action:'organization_update_applicant', organization_id:state.orgId, application_id:state.selected.application_id, applicant_status:'archived', status:'archived', archive_reason_key:reason, archive_reason_label:label, archive_reason_note:note, note: note || `Applicant archived: ${label}`});
      const archived=res.applicant||state.selected;
      state.archiveModalOpen=false;
      state.archiveReasonKey='';
      state.archiveReasonNote='';
      state.message=`Applicant archived: ${label}.`;
      state.messageKind='ok';
      setDirty(false);
      const ix=state.allApplicants.findIndex(a=>a.application_id===archived.application_id); if(ix>=0) state.allApplicants[ix]=archived;
      state.selected=null; state.selectedId='';
      state.applicants=visibleApplicants();
      updateApplicantHeaderBadgeLocally();
      render();
    });
  }
  async function restoreApplicant(){ if(!state.selected) return; await runButton('at-restore-app','Restoring…', async()=>{ const res=await accessCall({action:'organization_update_applicant', organization_id:state.orgId, application_id:state.selected.application_id, applicant_status:'waitlist', status:'waitlist', note:'Applicant restored'}); state.selected=res.applicant||state.selected; state.selectedId=state.selected.application_id; state.message='Applicant restored to Waitlist.'; state.messageKind='ok'; setDirty(false); const ix=state.allApplicants.findIndex(a=>a.application_id===state.selectedId); if(ix>=0) state.allApplicants[ix]=state.selected; state.applicants=visibleApplicants(); updateApplicantHeaderBadgeLocally(); render(); }); }
  async function sendPrefab(){ if(!state.selected) return; const templateKey=val('at-email-template'); await runButton('at-send-prefab','Sending…', async()=>{ const res=await accessCall({action:'organization_send_applicant_reply', organization_id:state.orgId, application_id:state.selected.application_id, reply_kind:'prefab', template_key:templateKey, to:val('at-email-to'), note:val('at-email-note')}); state.message=`Email sent to ${res.to}.`; state.messageKind='ok'; await refresh(true); }); }
  function bindNavAway(){ window.addEventListener('beforeunload',(event)=>{ if(!hasUnsaved()) return; event.preventDefault(); event.returnValue=''; }); }
  async function init(){ const r=root(); if(!r) return; r.innerHTML='Loading applicant tracker…'; bindNavAway(); await refresh(true); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
