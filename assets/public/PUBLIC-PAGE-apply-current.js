// PUBLIC-PAGE-apply-current.js
// Internal Version: 2026-06-12-108-F
// Purpose: Public Apply / Update Application intake page with returning-applicant precheck and applicant portal continuation flow.

(function () {
  "use strict";

  const VERSION = "2026-06-12-108-F";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const PUBLIC_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-apply-page-root, [data-syncetc-page='apply-now']";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");
  const state = {
    startedAt: performance.now(),
    steps: [],
    payload: null,
    backend: null,
    submitting: false,
    submitted: false,
    precheckBusy: false,
    portalRequestBusy: false,
    dirty: false,
    precheck: null,
    prefill: {},
    formNotice: "",
    formNoticeKind: "ok",
    formStartedAt: Date.now(),
    navAwayBound: false,
  };

  function mark(label, detail) {
    state.steps.push({ t: Math.round(performance.now() - state.startedAt), label, detail: detail || "" });
    if (DEBUG) console.info(`[SyncEtc apply ${VERSION}] ${label}`, detail || "");
  }
  function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function raw(v) { return String(v ?? "").trim(); }
  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function attr(v) { return esc(v).replace(/`/g, "&#096;"); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function root() { return document.querySelector(ROOT_SELECTOR); }
  function rootData() { const r = root(); return r ? r.dataset : {}; }
  function byId(id) { return document.getElementById(id); }
  function value(name) { const el = byId(`app-${name}`); return el ? raw(el.value) : ""; }
  function preValue(name) { const el = byId(`pre-${name}`); return el ? raw(el.value) : raw(state.prefill[name] || ""); }
  function colors() {
    const p = state.payload?.style_profile || {};
    const c = obj(p.colors_json);
    return { primary: clean(c.brand_primary || "#1f4f82"), secondary: clean(c.brand_secondary || "#eef3f8"), surface: clean(c.surface || "#ffffff"), text: clean(c.text || "#172033") };
  }
  function organizationKey() { const ds = rootData(); return ds.organizationKey || ds.customerKey || "test-customer-1"; }
  function siteKey() { return rootData().siteKey || "primary"; }
  function pageKey() { return rootData().pageKey || "apply-now"; }

  async function callPublic(action, body) {
    const res = await fetch(PUBLIC_EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    state.backend = json;
    if (!res.ok || json.ok === false) throw new Error(clean(json.message || json.error || `Request failed (${res.status})`));
    return json;
  }

  function css() { const c = colors(); return `
    .syncetc-apply{width:100%;max-width:none;margin:24px 0 56px;padding:0;font-family:Arial,Helvetica,sans-serif;color:${c.text}}.syncetc-apply *{box-sizing:border-box}.syncetc-apply-card{background:rgba(255,255,255,.95);border:1px solid color-mix(in srgb,${c.primary} 16%,transparent);border-radius:26px;box-shadow:0 14px 42px rgba(12,38,64,.14);overflow:hidden}.syncetc-apply-hero{padding:30px;background:linear-gradient(135deg,${c.primary},color-mix(in srgb,${c.primary} 78%,#fff 22%));color:#fff}.syncetc-apply-eyebrow{display:inline-flex;margin-bottom:10px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.syncetc-apply-hero h1{margin:0;color:#fff;font-size:clamp(32px,4vw,52px);line-height:1}.syncetc-apply-hero p{max-width:860px;margin:12px 0 0;color:rgba(255,255,255,.9);line-height:1.6}.syncetc-apply-body{padding:22px;background:linear-gradient(180deg,${c.secondary},rgba(255,255,255,.86))}.syncetc-section{margin:0 0 16px;padding:16px;border-radius:20px;background:#fff;border:1px solid color-mix(in srgb,${c.primary} 14%,transparent);box-shadow:0 8px 20px rgba(12,38,64,.07)}.syncetc-section h2{margin:0 0 6px;color:${c.primary};font-size:20px}.syncetc-section h3{margin:0 0 6px;color:${c.primary};font-size:17px}.syncetc-section p{margin:0 0 12px;color:rgba(23,32,51,.68);line-height:1.5;font-size:13px}.syncetc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.syncetc-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.syncetc-field{display:grid;gap:5px}.syncetc-field span{min-height:28px;display:flex;align-items:flex-end;font-size:12px;color:${c.primary};font-weight:950}.syncetc-input,.syncetc-select,.syncetc-textarea{width:100%;min-height:42px;padding:10px 12px;border-radius:13px;border:1px solid color-mix(in srgb,${c.primary} 18%,transparent);font:14px/1.4 Arial,Helvetica,sans-serif;color:${c.text};background:#fff}.syncetc-textarea{min-height:108px;resize:vertical}.syncetc-input:focus,.syncetc-select:focus,.syncetc-textarea:focus{outline:none;border-color:${c.primary};box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 13%,transparent)}.syncetc-input.syncetc-invalid,.syncetc-select.syncetc-invalid,.syncetc-textarea.syncetc-invalid{border-color:#b91c1c;box-shadow:0 0 0 3px rgba(185,28,28,.10)}.syncetc-field-error{min-height:15px;color:#b91c1c;font-size:11px;font-weight:850;line-height:1.25}.syncetc-required{color:#991b1b}.syncetc-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px}.syncetc-actions.left{justify-content:flex-start}.syncetc-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:10px 18px;border-radius:999px;border:1px solid ${c.primary};background:${c.primary};color:#fff;font-weight:950;cursor:pointer;text-decoration:none}.syncetc-btn.secondary{background:#fff;color:${c.primary}}.syncetc-btn.ghost{background:transparent;color:${c.primary}}.syncetc-btn:disabled{opacity:.55;cursor:not-allowed}.syncetc-alert{margin:12px 0 0;padding:12px 14px;border-radius:15px;border:1px solid color-mix(in srgb,${c.primary} 18%,transparent);background:#fff;font-weight:800;line-height:1.45}.syncetc-alert.error{background:#fee2e2;color:#991b1b;border-color:#fecaca}.syncetc-alert.warn{background:#fef3c7;color:#92400e;border-color:#fde68a}.syncetc-alert.ok{background:#e7f6ec;color:#166534;border-color:#bbf7d0}.syncetc-alert.info{background:#eaf5ff;color:#1f4f82;border-color:#bfdbfe}.syncetc-hidden{position:absolute;left:-9999px;opacity:0}.syncetc-precheck-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:16px;align-items:start}.syncetc-small{font-size:12px;color:rgba(23,32,51,.65);line-height:1.45}.syncetc-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;background:color-mix(in srgb,${c.secondary} 80%,#fff);color:${c.primary};font-size:12px;font-weight:950}.syncetc-debug{margin-top:14px;padding:14px;border-radius:18px;background:#0f172a;color:#dbeafe;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}@media(max-width:760px){.syncetc-apply{padding:0}.syncetc-grid,.syncetc-grid-3,.syncetc-precheck-split{grid-template-columns:1fr}.syncetc-apply-body{padding:14px}.syncetc-actions{justify-content:stretch}.syncetc-btn{width:100%}}
  `; }

  function field(name, label, type = "text", required = false, extra = "") {
    const preset = state.prefill && state.prefill[name] != null ? ` value="${attr(state.prefill[name])}"` : "";
    return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><input class="syncetc-input" id="app-${esc(name)}" name="${esc(name)}" type="${esc(type)}" ${required ? "required" : ""}${preset} ${extra}><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`;
  }
  function preField(name, label, type = "text", required = true, extra = "") {
    const preset = state.prefill && state.prefill[name] != null ? ` value="${attr(state.prefill[name])}"` : "";
    return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><input class="syncetc-input" id="pre-${esc(name)}" name="${esc(name)}" type="${esc(type)}" ${required ? "required" : ""}${preset} ${extra}><small class="syncetc-field-error" data-error-for="pre-${esc(name)}"></small></label>`;
  }
  function placeholder(text) { return `placeholder="${esc(text)}"`; }
  function textarea(name, label, required = false, ph = "") { return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><textarea class="syncetc-textarea" id="app-${name}" name="${esc(name)}" ${required ? "required" : ""} placeholder="${esc(ph)}">${esc(state.prefill?.[name] || "")}</textarea><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`; }
  function select(name, label, opts, required = false) {
    const selected = clean(state.prefill?.[name]);
    return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><select class="syncetc-select" id="app-${name}" name="${esc(name)}" ${required ? "required" : ""}>${opts.map(([v,l])=>`<option value="${esc(v)}" ${selected === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`;
  }

  function markRootReadyFallback(r) {
    if (!r) return;
    r.classList.remove("syncetc-public-shell-error");
    r.classList.add("syncetc-public-shell-ready");
    r.style.visibility = "visible";
  }

  function mountBody(bodyHtml, payload) {
    const r = root();
    if (!r) return;
    const activePageKey = payload?.page?.page_key || payload?.page_settings?.page_key || rootData().pageKey || "apply-now";
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
      window.SyncEtcPublicShell.render({ root: r, payload: payload || state.payload || {}, activePageKey, extraCss: css(), bodyHtml });
    } else {
      r.innerHTML = `<style>${css()}</style>${bodyHtml}`;
      markRootReadyFallback(r);
    }
  }

  function pageTitle() {
    const page = state.payload?.page_settings || {};
    return clean(page.title || "Apply Now");
  }

  function pageIntro() {
    const page = state.payload?.page_settings || {};
    return clean(page.intro_text || "Apply for membership or continue/update an application already on file.");
  }

  function debugBlock(label, data) {
    return DEBUG ? `<pre class="syncetc-debug">Apply page ${VERSION}\n${esc(label)}\nOrganization: ${esc(state.payload?.organization?.display_name || organizationKey())}\n${esc(JSON.stringify(data || state.backend || state.payload || {}, null, 2))}</pre>` : "";
  }

  function precheckHtml() {
    return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application</div><h1>${esc(pageTitle())}</h1><p>${esc(pageIntro())}</p></div><div class="syncetc-apply-body"><div class="syncetc-precheck-split"><section class="syncetc-section"><span class="syncetc-pill">Apply or update your application</span><h2 style="margin-top:10px">Start or continue</h2><p>Enter your basic information first. We will check whether you already have an application on file so we can avoid duplicate applications and help you continue securely.</p><form id="syncetc-apply-precheck-form"><div class="syncetc-grid">${preField("first_name","First name","text",true,placeholder("Wilbur"))}${preField("last_name","Last name","text",true,placeholder("Wright"))}${preField("date_of_birth","Date of birth","date",true)}${preField("email","Email","email",true,`${placeholder("wilbur.wright@example.com")} autocomplete="email" inputmode="email"`)}${preField("phone","Mobile phone","tel",true,`${placeholder("(555) 123-4567")} autocomplete="tel" inputmode="tel"`)}</div><div id="syncetc-precheck-alert"></div><div class="syncetc-actions"><button id="syncetc-precheck-submit" class="syncetc-btn" type="submit" ${state.precheckBusy ? "disabled" : ""}>${state.precheckBusy ? "Checking…" : "Continue"}</button></div></form></section><aside class="syncetc-section"><h3>Already applied?</h3><p>Use this same page. If your information matches an existing application, we will help you continue through the secure applicant portal.</p><p class="syncetc-small">For privacy, your application status and details are only shown after secure applicant login.</p><div class="syncetc-actions left"><button type="button" class="syncetc-btn secondary" id="syncetc-open-applicant-portal">Open Applicant Portal</button></div></aside></div>${debugBlock("Precheck mode", state.backend || state.payload)}</div></section></div>`;
  }

  function precheckResultHtml(result) {
    const kind = clean(result.result || "possible_match");
    const isActive = kind === "active_match";
    const isPrior = kind === "prior_match";
    const alertKind = isActive ? "info" : isPrior ? "warn" : "warn";
    const title = isActive ? "Continue through the applicant portal" : isPrior ? "This may be a reapplication" : "Possible existing application";
    const portalAvailable = obj(result.portal).available !== false;
    const email = clean(obj(result.prefill).email || state.prefill.email || "");
    return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application</div><h1>${esc(pageTitle())}</h1><p>${esc(pageIntro())}</p></div><div class="syncetc-apply-body"><section class="syncetc-section"><span class="syncetc-pill">Precheck complete</span><h2 style="margin-top:10px">${esc(title)}</h2><div class="syncetc-alert ${alertKind}">${esc(result.message || "This information may match an application already on file.")}</div><div id="syncetc-precheck-action-alert"></div>${isActive ? `<p class="syncetc-small" style="margin-top:12px">We did not open a duplicate application form because this looks like an active application. If this is not you, contact the organization.</p><div class="syncetc-actions left">${portalAvailable ? `<button type="button" class="syncetc-btn" id="syncetc-precheck-request-link" data-email="${attr(email)}">${state.portalRequestBusy ? "Sending…" : "Send secure login link"}</button><button type="button" class="syncetc-btn secondary" id="syncetc-precheck-open-portal" data-email="${attr(email)}">Open Applicant Portal</button>` : `<button type="button" class="syncetc-btn secondary" id="syncetc-precheck-back">Back</button>`}</div>` : `<p class="syncetc-small" style="margin-top:12px">You may continue, but the organization may review this as a possible duplicate or reapplication.</p><div class="syncetc-actions left"><button type="button" class="syncetc-btn" id="syncetc-precheck-continue">Continue with application</button><button type="button" class="syncetc-btn secondary" id="syncetc-precheck-request-link" data-email="${attr(email)}">${state.portalRequestBusy ? "Sending…" : "Send secure login link instead"}</button><button type="button" class="syncetc-btn ghost" id="syncetc-precheck-back">Back</button></div>`}${debugBlock("Precheck result", result)}</section></div></section></div>`;
  }

  function formHtml() {
    const org = state.payload?.organization?.display_name || "this organization";
    const notice = state.formNotice ? `<div class="syncetc-alert ${esc(state.formNoticeKind || "ok")}">${esc(state.formNotice)}</div>` : "";
    return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application details</div><h1>${esc(pageTitle())}</h1><p>${esc(pageIntro())}</p></div><form id="syncetc-apply-form" class="syncetc-apply-body"><input class="syncetc-hidden" name="website" autocomplete="off"><input type="hidden" name="form_elapsed_ms" id="app-form-elapsed">${notice}<section class="syncetc-section"><h2>Basic information</h2><p>Start with your identity and contact details.</p><div class="syncetc-grid">${field("first_name","First name", "text", true, placeholder("Wilbur"))}${field("last_name","Last name", "text", true, placeholder("Wright"))}${field("date_of_birth","Date of birth", "date", true)}${field("email","Email", "email", true, `${placeholder("wilbur.wright@example.com")} autocomplete="email" inputmode="email"`)}${field("phone","Mobile phone", "tel", true, `${placeholder("(555) 123-4567")} autocomplete="tel" inputmode="tel"`)}${field("home_phone","Home phone", "tel", false, `${placeholder("Optional")} autocomplete="tel" inputmode="tel"`)}</div></section><section class="syncetc-section"><h2>Address and background</h2><div class="syncetc-grid">${field("address_1","Street address", "text", true, placeholder("Street address"))}${field("address_2","Address line 2", "text", false, placeholder("Apartment, suite, hangar, etc. optional"))}${field("city","City", "text", true, placeholder("City"))}${field("state","State", "text", true, placeholder("State"))}${field("zip","ZIP", "text", true, `${placeholder("12345")} inputmode="numeric" autocomplete="postal-code"`)}${field("employer","Employer", "text", false, placeholder("Optional"))}${field("occupation","Occupation", "text", false, placeholder("Optional"))}</div></section><section class="syncetc-section"><h2>Aviation qualifications</h2><p>This default aviation form can be customized later by organization. Instrument and aircraft-specific qualifications belong under ratings / endorsements.</p><div class="syncetc-grid">${field("pilot_certificate_number","Pilot certificate number", "text", true, placeholder("FAA certificate number"))}${select("certificate_level","Certificate level", [["student","Student Pilot"],["sport","Sport Pilot"],["recreational","Recreational Pilot"],["private","Private Pilot"],["commercial","Commercial Pilot"],["atp","ATP"],["cfi","Flight Instructor / CFI"],["other","Other"]], true)}${field("ratings","Ratings / endorsements", "text", false, placeholder("Instrument, multi-engine, complex, high-performance, tailwheel, etc."))}${select("medical_class","Medical / BasicMed status", [["","Select medical status"],["class_1","Class 1 medical"],["class_2","Class 2 medical"],["class_3","Class 3 medical"],["basicmed","BasicMed"],["not_applicable","Not applicable"],["other","Other / explain below"]], false)}${field("last_medical_date","Last medical date", "date")}${field("total_hours","Total flight hours", "text", false, placeholder("Approximate total hours"))}${field("night_hours","Night hours", "text", false, placeholder("Approximate night hours"))}${field("ifr_hours","IFR hours", "text", false, placeholder("Approximate instrument/IFR hours"))}${field("complex_hours","Complex hours", "text", false, placeholder("Approximate complex hours"))}</div><div style="margin-top:12px">${textarea("aircraft_experience","Aircraft types and approximate hours", false, "Example: C172 - 120 hrs; PA28 - 40 hrs; complex/tailwheel/etc.")}${textarea("last_bfr","Last BFR / checkride details", false, "Example: BFR completed 05/2025 in C172 with John Smith, CFI.")}</div></section><section class="syncetc-section"><h2>Safety and review questions</h2><div class="syncetc-grid">${select("accident_history","Aircraft accident / incident history", [["","Select one"],["no","No"],["yes","Yes"]], true)}${select("faa_history","FAA action history", [["","Select one"],["no","No"],["yes","Yes"],["pending","Pending / unsure"]], true)}</div><div class="syncetc-grid" style="margin-top:12px">${textarea("accident_details","Accident / incident details", false, "If yes, briefly explain dates, aircraft, and outcome.")}${textarea("faa_details","FAA action details", false, "If yes or pending, briefly explain status and outcome if known.")}</div></section><section class="syncetc-section"><h2>Interest and referral</h2><div class="syncetc-grid">${textarea("why_join","Why do you want to join?", true, "Tell us why you are interested in this organization and how you expect to participate.")}${textarea("expected_flying","Expected type of flying", false, "Example: local proficiency flying, cross-country trips, instrument currency, training, etc.")}${field("how_hear_us","How did you hear about us?", "text", true, placeholder("Website, member referral, airport, social media, etc."))}${field("referred_by","Referred by", "text", false, placeholder("Member name, if applicable"))}</div><div style="margin-top:12px">${textarea("additional_notes","Anything else you want to tell us?", false, "Optional. Share anything else that would help the organization review your application.")}</div></section><div id="syncetc-apply-alert"></div><div class="syncetc-actions"><button type="button" id="syncetc-apply-back" class="syncetc-btn secondary">Back to start</button><button id="syncetc-apply-submit" class="syncetc-btn" type="submit">Submit Application</button></div>${debugBlock(`Full form for ${org}`, state.precheck || state.backend || state.payload)}</form></section></div>`;
  }

  function successHtml(result) {
    const portal = result.applicant_portal || {};
    const portalBlock = portal.available !== false ? `<div class="syncetc-alert ok"><strong>Applicant portal:</strong> You can return later to update information or complete requested next steps through the secure applicant portal.</div><div class="syncetc-actions left"><button type="button" class="syncetc-btn" id="syncetc-success-request-link">Send secure login link</button><button type="button" class="syncetc-btn secondary" id="syncetc-success-open-portal">Go to Applicant Portal</button></div><div id="syncetc-success-alert"></div>` : `<div class="syncetc-alert info">If the organization requests more information, you will receive instructions by email.</div>`;
    return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application Received</div><h1>Thank you for applying.</h1><p>Your application has been received. The organization will review it and follow up if more information is needed.</p></div><div class="syncetc-apply-body"><div class="syncetc-alert ok">Application received. Reference: ${esc(result.applicant_key || result.application_id || "received")}</div>${portalBlock}${DEBUG ? `<pre class="syncetc-debug">Apply page ${VERSION}\n${esc(JSON.stringify(result, null, 2))}</pre>` : ""}</div></section></div>`;
  }

  function collectPrecheck() {
    return { first_name: preValue("first_name"), last_name: preValue("last_name"), date_of_birth: preValue("date_of_birth"), email: preValue("email"), phone: preValue("phone") };
  }
  function collect() { return {
    first_name: value("first_name"), last_name: value("last_name"), date_of_birth: value("date_of_birth"), email: value("email"), phone: value("phone"), home_phone: value("home_phone"), address_1: value("address_1"), address_2: value("address_2"), city: value("city"), state: value("state"), zip: value("zip"), employer: value("employer"), occupation: value("occupation"), pilot_certificate_number: value("pilot_certificate_number"), certificate_level: value("certificate_level"), ratings: value("ratings"), medical_class: value("medical_class"), last_medical_date: value("last_medical_date"), total_hours: value("total_hours"), night_hours: value("night_hours"), ifr_hours: value("ifr_hours"), complex_hours: value("complex_hours"), aircraft_experience: value("aircraft_experience"), last_bfr: value("last_bfr"), accident_history: value("accident_history"), accident_details: value("accident_details"), faa_history: value("faa_history"), faa_details: value("faa_details"), why_join: value("why_join"), expected_flying: value("expected_flying"), how_hear_us: value("how_hear_us"), referred_by: value("referred_by"), additional_notes: value("additional_notes"), custom_answers_json: { additional_notes: value("additional_notes") }, precheck_result_json: precheckForSubmit(), form_elapsed_ms: Date.now() - state.formStartedAt, source_url: location.href, website: document.querySelector('input[name="website"]')?.value || "" };
  }
  function precheckForSubmit() {
    const p = obj(state.precheck);
    if (!Object.keys(p).length) return { result: "not_run", version: VERSION };
    return { version: VERSION, result: clean(p.result), match_strength: clean(p.match_strength), flag_for_review: p.flag_for_review === true, checked_at: clean(obj(p.duplicate_check).checked_at), reasons: Array.isArray(obj(p.duplicate_check).reasons) ? obj(p.duplicate_check).reasons : [] };
  }

  function setApplicantEmailHint(email) {
    try { if (email) sessionStorage.setItem("syncetc_applicant_email_hint", email); } catch (_) {}
  }

  function setFieldError(name, msg, prefix = "app") {
    const id = prefix === "pre" ? `pre-${name}` : `app-${name}`;
    const el = byId(id);
    const err = document.querySelector(`[data-error-for="${CSS.escape(id)}"], [data-error-for="${CSS.escape(name)}"]`);
    if (el) {
      el.classList.toggle("syncetc-invalid", Boolean(msg));
      if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    }
    if (err) err.textContent = msg || "";
  }
  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v)); }
  function validatePhone(v) { const digits = clean(v).replace(/\D/g, ""); return digits.length >= 7 && digits.length <= 15; }
  function validateField(name) {
    const v = value(name);
    let msg = "";
    if (name === "email" && v && !validateEmail(v)) msg = "Please enter a valid email address.";
    if ((name === "phone" || name === "home_phone") && v && !validatePhone(v)) msg = "Please enter a valid phone number.";
    if (name === "zip" && v && !/^\d{5}(-\d{4})?$/.test(v)) msg = "Please enter a valid ZIP code, like 12345 or 12345-6789.";
    setFieldError(name, msg, "app");
    return !msg;
  }
  function validateStructuredFields() {
    const fields = ["email", "phone", "home_phone", "zip"];
    const bad = fields.filter((name) => !validateField(name));
    if (bad.length) { const first = byId(`app-${bad[0]}`); if (first) first.focus(); return false; }
    return true;
  }

  function alert(msg, type="error") { const el = byId("syncetc-apply-alert"); if (el) el.innerHTML = msg ? `<div class="syncetc-alert ${type}">${esc(msg)}</div>` : ""; }
  function precheckAlert(msg, type="error") { const el = byId("syncetc-precheck-alert"); if (el) el.innerHTML = msg ? `<div class="syncetc-alert ${type}">${esc(msg)}</div>` : ""; }
  function actionAlert(id, msg, type="ok") { const el = byId(id); if (el) el.innerHTML = msg ? `<div class="syncetc-alert ${type}">${esc(msg)}</div>` : ""; }

  async function sendPortalLink(email, alertId) {
    const cleanEmail = clean(email || state.prefill.email || value("email"));
    if (!validateEmail(cleanEmail)) { actionAlert(alertId, "Enter a valid application email first.", "error"); return; }
    state.portalRequestBusy = true;
    setApplicantEmailHint(cleanEmail);
    const btns = document.querySelectorAll("#syncetc-precheck-request-link,#syncetc-success-request-link");
    btns.forEach((btn) => { btn.disabled = true; btn.textContent = "Sending…"; });
    try {
      const data = await callPublic("request_applicant_portal_access", { organization_key: organizationKey(), site_key: siteKey(), email: cleanEmail, redirect_to: location.origin + "/applicant-portal" });
      actionAlert(alertId, clean(data.message || "If an eligible application exists for that email, we will send applicant portal instructions."), "ok");
    } catch (_) {
      actionAlert(alertId, "If an eligible application exists for that email, we will send applicant portal instructions.", "ok");
    } finally {
      state.portalRequestBusy = false;
      btns.forEach((btn) => { btn.disabled = false; btn.textContent = btn.id === "syncetc-success-request-link" ? "Send secure login link" : "Send secure login link"; });
    }
  }

  function openApplicantPortal(email) {
    setApplicantEmailHint(clean(email || state.prefill.email || value("email")));
    location.href = "/applicant-portal";
  }

  function showPrecheck() {
    state.submitted = false;
    state.dirty = false;
    mountBody(precheckHtml(), state.payload);
    bindPrecheck();
  }

  function showApplicationForm(result, notice, noticeKind) {
    state.precheck = result || state.precheck || { result: "not_run", version: VERSION };
    const prefill = obj(result?.prefill);
    if (Object.keys(prefill).length) state.prefill = { ...state.prefill, ...prefill };
    state.formNotice = notice || clean(result?.message || "Continue with the application below.");
    state.formNoticeKind = noticeKind || (result?.flag_for_review ? "warn" : "ok");
    state.formStartedAt = Date.now();
    mountBody(formHtml(), state.payload);
    bindApplicationForm();
    bindNavAwayProtection();
  }

  function bindPrecheck() {
    const portal = byId("syncetc-open-applicant-portal");
    if (portal) portal.onclick = () => openApplicantPortal(state.prefill.email || preValue("email"));
    const form = byId("syncetc-apply-precheck-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.precheckBusy) return;
      precheckAlert("");
      if (!form.reportValidity()) return;
      const data = collectPrecheck();
      if (!validateEmail(data.email)) { setFieldError("email", "Please enter a valid email address.", "pre"); return; }
      if (!validatePhone(data.phone)) { setFieldError("phone", "Please enter a valid phone number.", "pre"); return; }
      state.prefill = { ...state.prefill, ...data };
      state.precheckBusy = true;
      const btn = byId("syncetc-precheck-submit");
      if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
      try {
        const result = await callPublic("precheck_applicant_application", { organization_key: organizationKey(), site_key: siteKey(), page_key: pageKey(), ...data });
        state.precheck = result;
        const mergedPrefill = obj(result.prefill);
        state.prefill = { ...state.prefill, ...mergedPrefill };
        if (result.result === "no_match") {
          showApplicationForm(result, result.message || "No active application match was found. Continue with the application below.", "ok");
        } else {
          mountBody(precheckResultHtml(result), state.payload);
          bindPrecheckDecision(result);
        }
      } catch (error) {
        precheckAlert(error instanceof Error ? error.message : String(error), "error");
      } finally {
        state.precheckBusy = false;
        if (btn) { btn.disabled = false; btn.textContent = "Continue"; }
      }
    });
  }

  function bindPrecheckDecision(result) {
    const back = byId("syncetc-precheck-back");
    if (back) back.onclick = showPrecheck;
    const cont = byId("syncetc-precheck-continue");
    if (cont) cont.onclick = () => showApplicationForm(result, result.message || "Continue below. This may be flagged for organization review.", result.flag_for_review ? "warn" : "ok");
    const request = byId("syncetc-precheck-request-link");
    if (request) request.onclick = () => sendPortalLink(request.dataset.email || state.prefill.email, "syncetc-precheck-action-alert");
    const open = byId("syncetc-precheck-open-portal");
    if (open) open.onclick = () => openApplicantPortal(open.dataset.email || state.prefill.email);
  }

  function bindApplicationForm() {
    const back = byId("syncetc-apply-back");
    if (back) back.onclick = () => { if (!state.dirty || window.confirm("Discard this application form and go back to the start?")) showPrecheck(); };
    const form = byId("syncetc-apply-form");
    if (!form) return;
    form.addEventListener("input", (event) => { if (!state.submitted) state.dirty = true; const name = event.target?.name; if (["email","phone","home_phone","zip"].includes(name)) validateField(name); });
    form.addEventListener("change", (event) => { if (!state.submitted) state.dirty = true; const name = event.target?.name; if (["email","phone","home_phone","zip"].includes(name)) validateField(name); });
    ["email","phone","home_phone","zip"].forEach((name) => { const el = byId(`app-${name}`); if (el) el.addEventListener("blur", () => validateField(name)); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.submitting) return;
      alert("");
      if (!form.reportValidity()) return;
      if (!validateStructuredFields()) { alert("Please fix the highlighted field before submitting."); return; }
      state.submitting = true;
      const btn = byId("syncetc-apply-submit");
      if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }
      try {
        const result = await callPublic("submit_applicant_application", { organization_key: organizationKey(), site_key: siteKey(), page_key: pageKey(), ...collect() });
        state.submitted = true;
        state.dirty = false;
        setApplicantEmailHint(value("email"));
        mountBody(successHtml(result), state.payload);
        bindSuccess(result, value("email"));
      } catch (error) {
        const backend = state.backend || {};
        if (backend.possible_duplicate) {
          const portal = backend.applicant_portal || {};
          alert(clean(backend.message || "This may match an existing application. Please continue through the Applicant Portal rather than submitting a duplicate."), "error");
          const el = byId("syncetc-apply-alert");
          if (el && portal.portal_url) el.insertAdjacentHTML("beforeend", `<div class="syncetc-actions left"><button type="button" id="syncetc-duplicate-request-link" class="syncetc-btn">Send secure login link</button><button type="button" id="syncetc-duplicate-open-portal" class="syncetc-btn secondary">Open Applicant Portal</button></div>`);
          const req = byId("syncetc-duplicate-request-link");
          if (req) req.onclick = () => sendPortalLink(value("email"), "syncetc-apply-alert");
          const open = byId("syncetc-duplicate-open-portal");
          if (open) open.onclick = () => openApplicantPortal(value("email"));
        } else {
          alert(error instanceof Error ? error.message : String(error));
        }
      } finally {
        state.submitting = false;
        if (btn && !state.submitted) { btn.disabled = false; btn.textContent = "Submit Application"; }
      }
    });
  }

  function bindSuccess(result, email) {
    const req = byId("syncetc-success-request-link");
    if (req) req.onclick = () => sendPortalLink(email, "syncetc-success-alert");
    const open = byId("syncetc-success-open-portal");
    if (open) open.onclick = () => openApplicantPortal(email);
  }

  function bindNavAwayProtection() {
    if (state.navAwayBound) return;
    state.navAwayBound = true;
    window.addEventListener("beforeunload", (event) => { if (!state.dirty || state.submitted) return; event.preventDefault(); event.returnValue = ""; });
    document.addEventListener("click", (event) => {
      if (!state.dirty || state.submitted) return;
      const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (!window.confirm("You have unsaved application information. Leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    }, true);
  }

  async function init() {
    const r = root();
    if (!r) return;
    mark("boot:start", location.pathname);
    r.innerHTML = `<div style="padding:20px">Loading application…</div>`;
    markRootReadyFallback(r);
    try {
      const payload = await callPublic("get_apply_page", { organization_key: organizationKey(), site_key: siteKey(), page_key: pageKey(), render_mode: DEBUG ? "debug" : "public" });
      state.payload = payload;
      showPrecheck();
    } catch (error) {
      if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.renderError === "function" && state.payload) {
        window.SyncEtcPublicShell.renderError(r, `Unable to load application form. ${error instanceof Error ? error.message : String(error)}`, state.payload);
      } else {
        r.innerHTML = `<div style="padding:20px;color:#991b1b;font-weight:800">Unable to load application form. ${esc(error instanceof Error ? error.message : String(error))}</div>`;
        r.classList.remove("syncetc-public-shell-ready");
        r.classList.add("syncetc-public-shell-error");
        r.style.visibility = "visible";
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
