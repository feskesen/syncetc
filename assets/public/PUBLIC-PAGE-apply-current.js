// PUBLIC-PAGE-apply-current.js
// Internal Version: 2026-06-10-098-A
// Purpose: Public Apply Now / applicant intake page for SyncEtc aviation-club default workflow.

(function () {
  "use strict";

  const VERSION = "2026-06-10-098-A";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const PUBLIC_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ROOT_SELECTOR = "#syncetc-apply-page-root, [data-syncetc-page='apply-now']";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");
  const state = { startedAt: performance.now(), steps: [], payload: null, submitting: false, submitted: false, dirty: false, error: "", backend: null, formStartedAt: Date.now() };

  function mark(label, detail) { state.steps.push({ t: Math.round(performance.now() - state.startedAt), label, detail: detail || "" }); if (DEBUG) console.info(`[SyncEtc apply ${VERSION}] ${label}`, detail || ""); }
  function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function raw(v) { return String(v ?? "").trim(); }
  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function root() { return document.querySelector(ROOT_SELECTOR); }
  function rootData() { const r = root(); return r ? r.dataset : {}; }
  function colors() { const p = state.payload?.style_profile || {}; const c = obj(p.colors_json); return { primary: clean(c.brand_primary || "#1f4f82"), secondary: clean(c.brand_secondary || "#eef3f8"), surface: clean(c.surface || "#ffffff"), text: clean(c.text || "#172033") }; }

  async function callPublic(action, body) {
    const res = await fetch(PUBLIC_EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json().catch(() => ({}));
    state.backend = json;
    if (!res.ok || json.ok === false) throw new Error(clean(json.message || json.error || `Request failed (${res.status})`));
    return json;
  }

  function css() { const c = colors(); return `
    .syncetc-apply{width:100%;max-width:none;margin:24px 0 56px;padding:0;font-family:Arial,Helvetica,sans-serif;color:${c.text}}.syncetc-apply *{box-sizing:border-box}.syncetc-apply-card{background:rgba(255,255,255,.95);border:1px solid color-mix(in srgb,${c.primary} 16%,transparent);border-radius:26px;box-shadow:0 14px 42px rgba(12,38,64,.14);overflow:hidden}.syncetc-apply-hero{padding:30px;background:linear-gradient(135deg,${c.primary},color-mix(in srgb,${c.primary} 78%,#fff 22%));color:#fff}.syncetc-apply-eyebrow{display:inline-flex;margin-bottom:10px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.syncetc-apply-hero h1{margin:0;color:#fff;font-size:clamp(32px,4vw,52px);line-height:1}.syncetc-apply-hero p{max-width:820px;margin:12px 0 0;color:rgba(255,255,255,.9);line-height:1.6}.syncetc-apply-body{padding:22px;background:linear-gradient(180deg,${c.secondary},rgba(255,255,255,.86))}.syncetc-section{margin:0 0 16px;padding:16px;border-radius:20px;background:#fff;border:1px solid color-mix(in srgb,${c.primary} 14%,transparent);box-shadow:0 8px 20px rgba(12,38,64,.07)}.syncetc-section h2{margin:0 0 6px;color:${c.primary};font-size:20px}.syncetc-section p{margin:0 0 12px;color:rgba(23,32,51,.68);line-height:1.5;font-size:13px}.syncetc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.syncetc-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.syncetc-field{display:grid;gap:5px}.syncetc-field span{min-height:28px;display:flex;align-items:flex-end;font-size:12px;color:${c.primary};font-weight:950}.syncetc-input,.syncetc-select,.syncetc-textarea{width:100%;min-height:42px;padding:10px 12px;border-radius:13px;border:1px solid color-mix(in srgb,${c.primary} 18%,transparent);font:14px/1.4 Arial,Helvetica,sans-serif;color:${c.text};background:#fff}.syncetc-textarea{min-height:108px;resize:vertical}.syncetc-input:focus,.syncetc-select:focus,.syncetc-textarea:focus{outline:none;border-color:${c.primary};box-shadow:0 0 0 3px color-mix(in srgb,${c.primary} 13%,transparent)}.syncetc-input.syncetc-invalid,.syncetc-select.syncetc-invalid,.syncetc-textarea.syncetc-invalid{border-color:#b91c1c;box-shadow:0 0 0 3px rgba(185,28,28,.10)}.syncetc-field-error{min-height:15px;color:#b91c1c;font-size:11px;font-weight:850;line-height:1.25}.syncetc-required{color:#991b1b}.syncetc-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px}.syncetc-btn{min-height:40px;padding:10px 18px;border-radius:999px;border:1px solid ${c.primary};background:${c.primary};color:#fff;font-weight:950;cursor:pointer}.syncetc-btn:disabled{opacity:.55;cursor:not-allowed}.syncetc-alert{margin:12px 0 0;padding:12px 14px;border-radius:15px;border:1px solid color-mix(in srgb,${c.primary} 18%,transparent);background:#fff;font-weight:800;line-height:1.45}.syncetc-alert.error{background:#fee2e2;color:#991b1b;border-color:#fecaca}.syncetc-alert.ok{background:#e7f6ec;color:#166534;border-color:#bbf7d0}.syncetc-hidden{position:absolute;left:-9999px;opacity:0}.syncetc-debug{margin-top:14px;padding:14px;border-radius:18px;background:#0f172a;color:#dbeafe;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}@media(max-width:760px){.syncetc-apply{padding:0}.syncetc-grid,.syncetc-grid-3{grid-template-columns:1fr}.syncetc-apply-body{padding:14px}.syncetc-actions{justify-content:stretch}.syncetc-btn{width:100%}}
  `; }

  function field(name, label, type = "text", required = false, extra = "") { return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><input class="syncetc-input" id="app-${name}" name="${esc(name)}" type="${esc(type)}" ${required ? "required" : ""} ${extra}><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`; }
  function placeholder(text) { return `placeholder="${esc(text)}"`; }
  function textarea(name, label, required = false, ph = "") { return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><textarea class="syncetc-textarea" id="app-${name}" name="${esc(name)}" ${required ? "required" : ""} placeholder="${esc(ph)}"></textarea><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`; }
  function select(name, label, opts, required = false) { return `<label class="syncetc-field"><span>${esc(label)}${required ? ' <b class="syncetc-required">*</b>' : ''}</span><select class="syncetc-select" id="app-${name}" name="${esc(name)}" ${required ? "required" : ""}>${opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select><small class="syncetc-field-error" data-error-for="${esc(name)}"></small></label>`; }

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
      window.SyncEtcPublicShell.render({
        root: r,
        payload: payload || state.payload || {},
        activePageKey,
        extraCss: css(),
        bodyHtml,
      });
    } else {
      r.innerHTML = `<style>${css()}</style>${bodyHtml}`;
      markRootReadyFallback(r);
    }
  }

  function formHtml() {
    const org = state.payload?.organization?.display_name || "this organization";
    const page = state.payload?.page_settings || {};
    const title = clean(page.title || "Apply Now");
    const intro = clean(page.intro_text || "Submit your application and tell us about your flying background.");
    return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application</div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div><form id="syncetc-apply-form" class="syncetc-apply-body"><input class="syncetc-hidden" name="website" autocomplete="off"><input type="hidden" name="form_elapsed_ms" id="app-form-elapsed"><section class="syncetc-section"><h2>Basic information</h2><p>Start with your identity and contact details.</p><div class="syncetc-grid">${field("first_name","First name", "text", true, placeholder("Wilbur"))}${field("last_name","Last name", "text", true, placeholder("Wright"))}${field("date_of_birth","Date of birth", "date", true)}${field("email","Email", "email", true, `${placeholder("wilbur.wright@example.com")} autocomplete="email" inputmode="email"`)}${field("phone","Mobile phone", "tel", true, `${placeholder("(555) 123-4567")} autocomplete="tel" inputmode="tel"`)}${field("home_phone","Home phone", "tel", false, `${placeholder("Optional")} autocomplete="tel" inputmode="tel"`)}</div></section><section class="syncetc-section"><h2>Address and background</h2><div class="syncetc-grid">${field("address_1","Street address", "text", true, placeholder("Street address"))}${field("address_2","Address line 2", "text", false, placeholder("Apartment, suite, hangar, etc. optional"))}${field("city","City", "text", true, placeholder("City"))}${field("state","State", "text", true, placeholder("State"))}${field("zip","ZIP", "text", true, `${placeholder("12345")} inputmode="numeric" autocomplete="postal-code"`)}${field("employer","Employer", "text", false, placeholder("Optional"))}${field("occupation","Occupation", "text", false, placeholder("Optional"))}</div></section><section class="syncetc-section"><h2>Aviation qualifications</h2><p>This default aviation form can be customized later by organization. Instrument and aircraft-specific qualifications belong under ratings / endorsements.</p><div class="syncetc-grid">${field("pilot_certificate_number","Pilot certificate number", "text", true, placeholder("FAA certificate number"))}${select("certificate_level","Certificate level", [["student","Student Pilot"],["sport","Sport Pilot"],["recreational","Recreational Pilot"],["private","Private Pilot"],["commercial","Commercial Pilot"],["atp","ATP"],["cfi","Flight Instructor / CFI"],["other","Other"]], true)}${field("ratings","Ratings / endorsements", "text", false, placeholder("Instrument, multi-engine, complex, high-performance, tailwheel, etc."))}${select("medical_class","Medical / BasicMed status", [["","Select medical status"],["class_1","Class 1 medical"],["class_2","Class 2 medical"],["class_3","Class 3 medical"],["basicmed","BasicMed"],["not_applicable","Not applicable"],["other","Other / explain below"]], false)}${field("last_medical_date","Last medical date", "date")}${field("total_hours","Total flight hours", "text", false, placeholder("Approximate total hours"))}${field("night_hours","Night hours", "text", false, placeholder("Approximate night hours"))}${field("ifr_hours","IFR hours", "text", false, placeholder("Approximate instrument/IFR hours"))}${field("complex_hours","Complex hours", "text", false, placeholder("Approximate complex hours"))}</div><div style="margin-top:12px">${textarea("aircraft_experience","Aircraft types and approximate hours", false, "Example: C172 - 120 hrs; PA28 - 40 hrs; complex/tailwheel/etc.")}${textarea("last_bfr","Last BFR / checkride details", false, "Example: BFR completed 05/2025 in C172 with John Smith, CFI.")}</div></section><section class="syncetc-section"><h2>Safety and review questions</h2><div class="syncetc-grid">${select("accident_history","Aircraft accident / incident history", [["","Select one"],["no","No"],["yes","Yes"]], true)}${select("faa_history","FAA action history", [["","Select one"],["no","No"],["yes","Yes"],["pending","Pending / unsure"]], true)}</div><div class="syncetc-grid" style="margin-top:12px">${textarea("accident_details","Accident / incident details", false, "If yes, briefly explain dates, aircraft, and outcome.")}${textarea("faa_details","FAA action details", false, "If yes or pending, briefly explain status and outcome if known.")}</div></section><section class="syncetc-section"><h2>Interest and referral</h2><div class="syncetc-grid">${textarea("why_join","Why do you want to join?", true, "Tell us why you are interested in this organization and how you expect to participate.")}${textarea("expected_flying","Expected type of flying", false, "Example: local proficiency flying, cross-country trips, instrument currency, training, etc.")}${field("how_hear_us","How did you hear about us?", "text", true, placeholder("Website, member referral, airport, social media, etc."))}${field("referred_by","Referred by", "text", false, placeholder("Member name, if applicable"))}</div><div style="margin-top:12px">${textarea("additional_notes","Anything else you want to tell us?", false, "Optional. Share anything else that would help the organization review your application.")}</div></section><div id="syncetc-apply-alert"></div><div class="syncetc-actions"><button id="syncetc-apply-submit" class="syncetc-btn" type="submit">Submit Application</button></div>${DEBUG ? `<pre class="syncetc-debug">Apply page ${VERSION}\nOrganization: ${esc(org)}\n${esc(JSON.stringify(state.backend || state.payload || {}, null, 2))}</pre>` : ""}</form></section></div>`;
  }

  function successHtml(result) { return `<div class="syncetc-apply"><section class="syncetc-apply-card"><div class="syncetc-apply-hero"><div class="syncetc-apply-eyebrow">Application Received</div><h1>Thank you for applying.</h1><p>Your application has been received. The organization will review it and follow up if more information is needed.</p></div><div class="syncetc-apply-body"><div class="syncetc-alert ok">Application received. Reference: ${esc(result.applicant_key || result.application_id || "received")}</div>${DEBUG ? `<pre class="syncetc-debug">Apply page ${VERSION}\n${esc(JSON.stringify(result, null, 2))}</pre>` : ""}</div></section></div>`; }

  function value(name) { const el = document.getElementById(`app-${name}`); return el ? raw(el.value) : ""; }
  function collect() { return {
    first_name: value("first_name"), last_name: value("last_name"), date_of_birth: value("date_of_birth"), email: value("email"), phone: value("phone"), home_phone: value("home_phone"), address_1: value("address_1"), address_2: value("address_2"), city: value("city"), state: value("state"), zip: value("zip"), employer: value("employer"), occupation: value("occupation"), pilot_certificate_number: value("pilot_certificate_number"), certificate_level: value("certificate_level"), ratings: value("ratings"), medical_class: value("medical_class"), last_medical_date: value("last_medical_date"), total_hours: value("total_hours"), night_hours: value("night_hours"), ifr_hours: value("ifr_hours"), complex_hours: value("complex_hours"), aircraft_experience: value("aircraft_experience"), last_bfr: value("last_bfr"), accident_history: value("accident_history"), accident_details: value("accident_details"), faa_history: value("faa_history"), faa_details: value("faa_details"), why_join: value("why_join"), expected_flying: value("expected_flying"), how_hear_us: value("how_hear_us"), referred_by: value("referred_by"), additional_notes: value("additional_notes"), custom_answers_json: { additional_notes: value("additional_notes") }, form_elapsed_ms: Date.now() - state.formStartedAt, website: document.querySelector('input[name="website"]')?.value || "" }; }

  function setFieldError(name, msg) {
    const el = document.getElementById(`app-${name}`);
    const err = document.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (el) {
      el.classList.toggle("syncetc-invalid", Boolean(msg));
      if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    }
    if (err) err.textContent = msg || "";
  }
  function validateField(name) {
    const v = value(name);
    let msg = "";
    if (name === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Please enter a valid email address.";
    if ((name === "phone" || name === "home_phone") && v) {
      const digits = v.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) msg = "Please enter a valid phone number.";
    }
    if (name === "zip" && v && !/^\d{5}(-\d{4})?$/.test(v)) msg = "Please enter a valid ZIP code, like 12345 or 12345-6789.";
    setFieldError(name, msg);
    return !msg;
  }
  function validateStructuredFields() {
    const fields = ["email", "phone", "home_phone", "zip"];
    const bad = fields.filter((name) => !validateField(name));
    if (bad.length) {
      const first = document.getElementById(`app-${bad[0]}`);
      if (first) first.focus();
      return false;
    }
    return true;
  }

  function alert(msg, type="error") { const el = document.getElementById("syncetc-apply-alert"); if (el) el.innerHTML = msg ? `<div class="syncetc-alert ${type}">${esc(msg)}</div>` : ""; }
  function bind() { const form = document.getElementById("syncetc-apply-form"); if (!form) return; form.addEventListener("input", (event) => { if (!state.submitted) state.dirty = true; const name = event.target?.name; if (["email","phone","home_phone","zip"].includes(name)) validateField(name); }); form.addEventListener("change", (event) => { if (!state.submitted) state.dirty = true; const name = event.target?.name; if (["email","phone","home_phone","zip"].includes(name)) validateField(name); }); ["email","phone","home_phone","zip"].forEach((name) => { const el = document.getElementById(`app-${name}`); if (el) el.addEventListener("blur", () => validateField(name)); }); form.addEventListener("submit", async (event) => { event.preventDefault(); if (state.submitting) return; alert(""); if (!form.reportValidity()) return; if (!validateStructuredFields()) { alert("Please fix the highlighted field before submitting."); return; } state.submitting = true; const btn = document.getElementById("syncetc-apply-submit"); if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; } try { const ds = rootData(); const result = await callPublic("submit_applicant_application", { organization_key: ds.organizationKey || ds.customerKey || "test-customer-1", site_key: ds.siteKey || "primary", page_key: ds.pageKey || "apply-now", ...collect() }); state.submitted = true; state.dirty = false; mountBody(successHtml(result), state.payload); } catch (error) {
        const backend = state.backend || {};
        if (backend.possible_duplicate) {
          alert(clean(backend.message || "This may match an existing application. Use applicant login or password reset rather than submitting a duplicate."), "error");
        } else {
          alert(error instanceof Error ? error.message : String(error));
        }
      } finally { state.submitting = false; if (btn && !state.submitted) { btn.disabled = false; btn.textContent = "Submit Application"; } } }); }
  function bindNavAwayProtection() { window.addEventListener("beforeunload", (event) => { if (!state.dirty || state.submitted) return; event.preventDefault(); event.returnValue = ""; }); document.addEventListener("click", (event) => { if (!state.dirty || state.submitted) return; const link = event.target && event.target.closest ? event.target.closest("a[href]") : null; if (!link) return; const href = link.getAttribute("href") || ""; if (!href || href.startsWith("#") || href.startsWith("javascript:")) return; if (!window.confirm("You have unsaved application information. Leave this page?")) { event.preventDefault(); event.stopPropagation(); } }, true); }

  async function init() { const r = root(); if (!r) return; mark("boot:start", location.pathname); r.innerHTML = `<div style="padding:20px">Loading application…</div>`; markRootReadyFallback(r); try { const ds = rootData(); const payload = await callPublic("get_apply_page", { organization_key: ds.organizationKey || ds.customerKey || "test-customer-1", site_key: ds.siteKey || "primary", page_key: ds.pageKey || "apply-now", render_mode: DEBUG ? "debug" : "public" }); state.payload = payload; mountBody(formHtml(), payload); bind(); bindNavAwayProtection(); } catch (error) { if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.renderError === "function" && state.payload) {
        window.SyncEtcPublicShell.renderError(r, `Unable to load application form. ${error instanceof Error ? error.message : String(error)}`, state.payload);
      } else {
        r.innerHTML = `<div style="padding:20px;color:#991b1b;font-weight:800">Unable to load application form. ${esc(error instanceof Error ? error.message : String(error))}</div>`;
        r.classList.remove("syncetc-public-shell-ready");
        r.classList.add("syncetc-public-shell-error");
        r.style.visibility = "visible";
      } } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
