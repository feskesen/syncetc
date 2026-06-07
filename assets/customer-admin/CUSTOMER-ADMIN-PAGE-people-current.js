// CUSTOMER-ADMIN-PAGE-people-current.js
// Internal Version: 2026-06-06-005-A
// Purpose: Organization Admin People & Access page. Customer-facing roster/search/editor for people, members, applicants, and onboarding users.

(function () {
  "use strict";

  const VERSION = "2026-06-06-005-A";
  const ROOT_ID = "syncetc-organization-people-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let allAccess = [];
  let adminAccess = null;
  let selectedOrgId = "";
  let options = { statuses: [], membership_classes: [], application_stages: [], roles: [] };
  let people = [];
  let selected = null;
  let mode = "view";
  let search = "";
  let filter = "all";
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let busy = false;
  let backend = null;
  let debounceTimer = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  const bool = (v) => v === true;
  const hasPerm = (row, p) => arr(row?.permission_keys).includes(p);
  const canManagePeople = (row) => hasPerm(row,"people.manage_members") || hasPerm(row,"people.manage_applicants") || hasPerm(row,"access.manage_memberships") || hasPerm(row,"organization.manage_settings") || hasPerm(row,"organization.super_admin");
  const canManageAccess = (row) => bool(obj(row?.capabilities).can_manage_access) || hasPerm(row,"access.manage_memberships") || hasPerm(row,"organization.manage_settings") || hasPerm(row,"organization.super_admin");
  const isAdminRow = (row) => row?.is_organization_admin || bool(obj(row?.capabilities).can_view_organization_admin) || hasPerm(row,"organization.admin.open") || hasPerm(row,"organization.view_admin");
  const adminRows = () => allAccess.filter(isAdminRow);
  const selectedRow = () => adminAccess || adminRows().find((r) => String(r.organization_id) === selectedOrgId) || adminRows()[0] || null;
  const selectedPerson = () => selected;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) await loadScript(SUPABASE_JS);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 };
    return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, prop, fallback) { const v = obj(source)[prop]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function styleConfig(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const effects = obj(profile.effects_json);
    const spacing = obj(profile.spacing_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors,"brand_primary","#1f4f82");
    const secondary = getText(colors,"brand_secondary","#eef3f8");
    const surface = getText(colors,"surface","#ffffff");
    const text = getText(colors,"text","#172033");
    const corners = getText(effects,"corners","soft");
    const width = getText(spacing,"page_width",getText(layout,"default_width","wide"));
    return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius: corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px", pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1220px" };
  }
  function cssVars(cfg) { return `--people-primary:${cfg.primary};--people-secondary:${cfg.secondary};--people-surface:${cfg.surface};--people-text:${cfg.text};--people-muted:${cfg.muted};--people-border:${cfg.border};--people-soft:${cfg.soft};--people-strong-soft:${cfg.strongSoft};--people-shadow:${cfg.shadow};--people-radius:${cfg.radius};--people-page-width:${cfg.pageWidth};`; }

  function setShellState() {
    const row = selectedRow();
    window.SyncEtcPortalShell?.setState?.({ authenticated: Boolean(token), email, mode: "org-admin", organizationName: row?.organization_name || "", organizationKey: row?.organization_key || "", styleProfile: row?.style_profile || null, accessRow: row || null });
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    if (token) await loadAccess();
    setShellState();
    render();
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function login() {
    await ensureSupabase();
    const loginEmail = clean($("people-login-email")?.value).toLowerCase();
    const password = $("people-login-password")?.value || "";
    if (!loginEmail || !password) throw new Error("Enter email and password.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: loginEmail, password });
    if (error) throw error;
    token = data?.session?.access_token || "";
    email = data?.user?.email || loginEmail;
    await loadAccess();
    setMessage("Logged in.", "ok");
  }
  async function logout() { await ensureSupabase(); await supabaseClient.auth.signOut(); token = ""; email = ""; allAccess = []; adminAccess = null; selectedOrgId = ""; people = []; selected = null; options = { statuses: [], membership_classes: [], application_stages: [], roles: [] }; setShellState(); render(); }
  async function resetOwnPassword() { await ensureSupabase(); const loginEmail = clean($("people-login-email")?.value || email).toLowerCase(); if (!loginEmail) throw new Error("Enter email first."); const { error } = await supabaseClient.auth.resetPasswordForEmail(loginEmail, { redirectTo: "https://syncetc.webflow.io/password-reset" }); if (error) throw error; setMessage("Password reset email requested.", "ok"); }

  async function runButton(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { busy = true; if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { busy = false; if (btn) { btn.disabled = false; btn.textContent = old; } render(); }
  }

  async function loadAccess() {
    const res = await call("get_my_access");
    allAccess = res.access || [];
    if (!selectedOrgId && adminRows()[0]) selectedOrgId = String(adminRows()[0].organization_id);
    if (selectedOrgId) await loadOrgContext();
    setShellState();
  }

  async function loadOrgContext() {
    if (!selectedOrgId) return;
    const dash = await call("get_organization_admin_dashboard", { organization_id: selectedOrgId });
    adminAccess = dash.access || null;
    const vocab = await call("organization_list_access_vocabulary", { organization_id: selectedOrgId });
    options = { statuses: vocab.statuses || [], membership_classes: vocab.membership_classes || [], application_stages: vocab.application_stages || [], roles: vocab.roles || [] };
    await loadPeople();
    setShellState();
  }

  async function loadPeople() {
    if (!selectedOrgId) return;
    const res = await call("organization_list_people", { organization_id: selectedOrgId, include_archived: true, filter: "all" });
    people = res.people || [];
    if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
  }

  function getProfile(row = selected || {}) { return obj(row.profile_json); }
  function profileValue(section, prop, fallback = "") { return clean(obj(getProfile()[section])[prop] ?? fallback); }
  function profileBool(section, prop) { return obj(getProfile()[section])[prop] === true; }

  function optionList(items, selectedValue, keyProp, labelProp, blankLabel = "—") {
    const rows = [`<option value="">${esc(blankLabel)}</option>`];
    rows.push(...arr(items).map((item) => `<option value="${esc(item[keyProp])}" ${String(item[keyProp]) === String(selectedValue || "") ? "selected" : ""}>${esc(item[labelProp] || item[keyProp])}</option>`));
    return rows.join("");
  }

  function input(id, label, value = "", type = "text", help = "") {
    return `<label class="people-field"><span>${esc(label)}</span><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}">${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  }
  function textarea(id, label, value = "", help = "") {
    return `<label class="people-field people-field-wide"><span>${esc(label)}</span><textarea id="${esc(id)}">${esc(value)}</textarea>${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  }
  function checkbox(id, label, checked = false, disabled = false) {
    return `<label class="people-check"><input id="${esc(id)}" type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(label)}</span></label>`;
  }
  function pill(text, cls = "") { return text ? `<span class="people-pill ${esc(cls)}">${esc(text)}</span>` : ""; }
  function linkPhone(phone) { const v = clean(phone); return v ? `<a href="tel:${esc(v.replace(/[^0-9+]/g,""))}">${esc(v)}</a>` : `<span class="muted">—</span>`; }
  function linkEmail(mail) { const v = clean(mail); return v ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : `<span class="muted">—</span>`; }

  function filteredPeople() {
    const s = search.toLowerCase();
    return people.filter((p) => {
      const status = key(p.lifecycle_status_key);
      const stage = key(p.application_stage_key);
      const stageCat = key(p.application_stage_category);
      const lifecycle = key(p.lifecycle_category);
      const archived = !!(p.membership_archived_at || p.person_archived_at || status === "archived" || lifecycle === "archived");
      const restricted = !!(p.blocks_access || ["suspended","expelled","blocked"].includes(status) || ["suspended","expelled","blocked"].includes(lifecycle));
      let ok = true;
      if (filter === "archived") ok = archived;
      else if (archived) ok = false;
      else if (filter === "active") ok = status === "active";
      else if (filter === "applicants") ok = ["applicant","invited","pending"].includes(status) || ["applicant","prospect"].includes(stageCat);
      else if (filter === "waitlist") ok = stage === "waitlist";
      else if (filter === "onboarding") ok = stage === "onboarding" || stageCat === "onboarding" || ["invited","pending"].includes(status);
      else if (filter === "former") ok = ["former","inactive"].includes(status) || ["former","inactive"].includes(lifecycle);
      else if (filter === "restricted") ok = restricted;
      if (!ok) return false;
      if (!s) return true;
      const hay = [p.display_name,p.first_name,p.last_name,p.primary_email,p.email,p.phone,p.primary_phone,p.member_number,p.title,p.lifecycle_status_label,p.membership_class_label,p.application_stage_label,...arr(p.role_labels),...arr(p.role_keys)].map(clean).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }

  function counts() {
    const oldFilter = filter;
    const keys = ["all","active","applicants","waitlist","onboarding","former","restricted","archived"];
    const out = {};
    keys.forEach((f) => { filter = f; out[f] = filteredPeople().length; });
    filter = oldFilter;
    return out;
  }

  function renderLogin() {
    if (token) return `<div class="people-auth"><span class="people-pill ok">Logged in as ${esc(email)}</span><button id="people-logout" class="people-btn secondary">Log out</button></div>`;
    return `<div class="people-login"><input id="people-login-email" type="email" placeholder="Email"><input id="people-login-password" type="password" placeholder="Password"><button id="people-login" class="people-btn">Log in</button><button id="people-reset-own" class="people-link-btn" type="button">Forgot password?</button></div>`;
  }

  function renderOrgSelector() {
    const rows = adminRows();
    if (!rows.length) return "";
    if (rows.length === 1) return `<div class="people-context-single">${esc(rows[0].organization_name)} <span>${esc(rows[0].organization_key)}</span></div>`;
    return `<select id="people-org-select">${rows.map((a) => `<option value="${esc(a.organization_id)}" ${String(a.organization_id) === selectedOrgId ? "selected" : ""}>${esc(a.organization_name)} (${esc(a.organization_key)})</option>`).join("")}</select>`;
  }

  function renderToolbar() {
    const c = counts();
    const filters = [
      ["all","All People"],["active","Active"],["applicants","Applicants"],["waitlist","Waitlist"],["onboarding","Onboarding"],["former","Former"],["restricted","Suspended / Expelled"],["archived","Archived"]
    ];
    return `<section class="people-card people-toolbar"><div class="people-search-wrap"><input id="people-search" value="${esc(search)}" placeholder="Search names, emails, phones, roles, member numbers…"><button id="people-clear-search" class="people-icon-btn" title="Clear">×</button></div><div class="people-toolbar-actions"><button id="people-new" class="people-btn">New person</button><button id="people-export" class="people-btn secondary">CSV export</button><button id="people-print" class="people-btn secondary">Print / PDF</button><button id="people-refresh" class="people-btn secondary">Refresh</button></div><div class="people-filters">${filters.map(([f,label]) => `<button class="people-filter ${filter===f ? "active" : ""}" data-filter="${esc(f)}">${esc(label)} <strong>${c[f] || 0}</strong></button>`).join("")}</div></section>`;
  }

  function renderPeopleList() {
    const rows = filteredPeople();
    if (!rows.length) return `<section class="people-card"><h2>No people found</h2><p class="muted">Try another search or filter.</p></section>`;
    return `<section class="people-card people-list-card"><div class="people-list-head"><h2>${rows.length} ${rows.length === 1 ? "person" : "people"}</h2><span class="muted">Click a name to view or edit details.</span></div><div class="people-table-wrap"><table class="people-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Status</th><th>Class</th><th>Stage</th><th>Roles</th></tr></thead><tbody>${rows.map((p) => `<tr class="${selected?.membership_id === p.membership_id ? "selected" : ""}" data-membership-id="${esc(p.membership_id)}"><td><button class="people-name-btn" data-open="${esc(p.membership_id)}"><strong>${esc(p.display_name || "Unnamed")}</strong>${p.member_number ? `<small>#${esc(p.member_number)}</small>` : ""}</button></td><td>${linkPhone(p.phone)}</td><td>${linkEmail(p.email)}</td><td>${pill(p.lifecycle_status_label || p.lifecycle_status_key, p.blocks_access ? "warn" : "")}</td><td>${pill(p.membership_class_label || "")}</td><td>${pill(p.application_stage_label || "")}</td><td><div class="people-role-list">${arr(p.role_labels).slice(0,3).map((r) => pill(r)).join("")}${arr(p.role_labels).length > 3 ? pill(`+${arr(p.role_labels).length - 3}`) : ""}</div></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderEditor() {
    const row = selectedPerson();
    const access = selectedRow();
    const mayEdit = canManagePeople(access);
    const mayEditRoles = canManageAccess(access);
    if (!row) return `<section class="people-card people-empty"><h2>Select a person</h2><p>Choose someone from the list, or create a new person. This single People page covers members, applicants, onboarding users, former people, and restricted records.</p></section>`;
    const profile = getProfile(row);
    const contact = obj(profile.contact);
    const emergency = obj(profile.emergency);
    const aviation = obj(profile.aviation);
    const background = obj(profile.background);
    const applicant = obj(profile.applicant);
    const admin = obj(profile.admin);
    return `<section class="people-card people-editor"><div class="people-editor-head"><div><h2>${esc(row.display_name || "New person")}</h2><div class="people-pill-row">${pill(row.lifecycle_status_label || row.lifecycle_status_key, row.blocks_access ? "warn" : "")}${pill(row.membership_class_label)}${pill(row.application_stage_label)}${row.login_linked ? pill("Login linked","ok") : pill("No login yet","warn")}</div></div><div class="people-editor-actions"><button id="people-save" class="people-btn" ${mayEdit ? "" : "disabled"}>Save</button><button id="people-invite" class="people-btn secondary" ${mayEdit ? "" : "disabled"}>Send invite</button><button id="people-reset-password" class="people-btn secondary" ${mayEdit ? "" : "disabled"}>Password reset</button></div></div>${!mayEdit ? `<p class="people-warning">You can view this roster, but you do not have permission to edit people.</p>` : ""}
      <details open><summary>Basic info</summary><div class="people-form-grid">${input("people-first-name","First name",row.first_name)}${input("people-last-name","Last name",row.last_name)}${input("people-display-name","Display name",row.display_name)}${input("people-primary-email","Primary email",row.primary_email,"email","Changing this does not directly set a password.")}${input("people-primary-phone","Primary phone",row.primary_phone,"tel")}${input("people-member-number","Member / account number",row.member_number)}${input("people-title","Title / position",row.title)}${input("people-joined-at","Joined date",String(row.joined_at || "").slice(0,10),"date")}</div></details>
      <details open><summary>Membership / access</summary><div class="people-form-grid"><label class="people-field"><span>Lifecycle status</span><select id="people-status-key">${optionList(options.statuses,row.lifecycle_status_key,"status_key","label","Select status")}</select><small>Status is the broad safety gate.</small></label><label class="people-field"><span>Membership class</span><select id="people-class-key">${optionList(options.membership_classes,row.membership_class_key,"class_key","label","No class")}</select><small>Class controls business rules like dues/privileges.</small></label><label class="people-field"><span>Application / onboarding stage</span><select id="people-stage-key">${optionList(options.application_stages,row.application_stage_key,"stage_key","label","No stage")}</select><small>Stage tracks applicants and onboarding.</small></label>${textarea("people-notes","Internal membership notes",row.notes)}</div></details>
      <details><summary>Roles</summary><p class="muted">Roles control what this person can do. Only organization access managers can change roles.</p><div class="people-check-grid">${arr(options.roles).map((role) => checkbox(`role-${role.role_key}`, role.label || role.role_key, arr(row.role_keys).includes(role.role_key), !mayEditRoles)).join("")}</div>${!mayEditRoles ? `<p class="people-warning">Role editing is locked for your account.</p>` : ""}</details>
      <details><summary>Contact info</summary><div class="people-form-grid">${input("people-mobile-phone","Mobile phone",contact.mobile_phone || row.phone,"tel")}${input("people-home-phone","Home phone",contact.home_phone,"tel")}${input("people-work-phone","Work phone",contact.work_phone,"tel")}${input("people-address","Street address",contact.address)}${input("people-city","City",contact.city)}${input("people-state","State",contact.state)}${input("people-zip","ZIP",contact.zip)}${input("people-emergency-name","Emergency contact",emergency.name)}${input("people-emergency-phone","Emergency phone",emergency.phone,"tel")}${input("people-emergency-relation","Emergency relation",emergency.relation)}</div></details>
      <details><summary>Aviation / operational profile</summary><div class="people-check-grid">${checkbox("people-club-cfi","CFI / instructor",aviation.club_cfi)}${checkbox("people-maintenance","Maintenance crew",aviation.on_maintenance_crew)}${checkbox("people-ifr-rated","IFR rated",aviation.ifr_rated)}${checkbox("people-night-checkout","Night checkout",aviation.club_night_checkout)}</div><div class="people-form-grid">${input("people-bfr-expiry","Flight review / BFR expiry",aviation.bfr_expiry_date,"date")}${input("people-last-checkout","Last organization checkout",aviation.last_club_checkout,"date")}${input("people-medical-expiry","Medical expiry",aviation.medical_expiry_date,"date")}${input("people-last-medical","Last medical date",aviation.last_medical_date,"date")}${input("people-medical-class","Medical class",aviation.medical_class)}${input("people-application-date","Application date",aviation.application_date || applicant.application_date,"date")}${input("people-employer","Employer",background.employer)}${input("people-occupation","Occupation",background.occupation)}${input("people-ratings","Ratings",aviation.ratings)}${input("people-pilot-certificate","Pilot certificate #",aviation.pilot_certificate_number)}${input("people-aircraft-types","Aircraft types",aviation.aircraft_types)}${input("people-bfr-aircraft","BFR aircraft",aviation.bfr_aircraft)}${input("people-clubs-fbos","Prior clubs/FBOs",aviation.clubs_fbos)}${input("people-flying-type","Type of flying",aviation.flying_type)}${input("people-total-hours","Total hours",aviation.total_hours,"number")}${input("people-night-hours","Night hours",aviation.total_night_hours,"number")}${input("people-ifr-hours","IFR hours",aviation.total_ifr_hours,"number")}${input("people-complex-hours","Complex hours",aviation.total_complex_hours,"number")}</div></details>
      <details><summary>Applicant notes</summary><div class="people-form-grid">${input("people-objectives","Objectives",applicant.objectives)}${input("people-how-hear","How they heard about us",applicant.how_hear_us)}${textarea("people-accident-details","Accident / incident details",applicant.accident_details)}${textarea("people-faa-details","FAA / regulatory details",applicant.faa_details)}</div></details>
      <details><summary>Admin notes</summary><div class="people-form-grid">${textarea("people-officers-notes","Officer/admin notes",admin.officers_notes)}</div></details>
    </section>`;
  }

  function renderContent() {
    if (!token) return `<section class="people-card"><h2>Login required</h2><p>This page uses the same login as the User Dashboard.</p></section>`;
    const rows = adminRows();
    if (!rows.length) return `<section class="people-card"><h2>No organization admin access</h2><p>Your account is signed in, but it does not have organization-admin permission.</p></section>`;
    return `${renderToolbar()}<div class="people-layout">${renderPeopleList()}${renderEditor()}</div>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID); if (!root) return;
    const cfg = styleConfig(selectedRow());
    root.innerHTML = `<style>
      .people-wrap{${cssVars(cfg)}max-width:var(--people-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--people-text)}.people-wrap *{box-sizing:border-box}.people-card{background:rgba(255,255,255,.94);border:1px solid var(--people-border);border-radius:var(--people-radius);box-shadow:var(--people-shadow);padding:20px;margin:16px 0}.people-hero{background:linear-gradient(135deg,var(--people-primary),${rgba(cfg.primary,.78)});color:#fff}.people-hero h1{margin:8px 0;color:#fff;font-size:clamp(30px,4vw,48px);letter-spacing:-.035em}.people-hero p{color:rgba(255,255,255,.88);max-width:900px}.people-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.people-auth,.people-login,.people-toolbar-actions,.people-editor-actions,.people-pill-row,.people-role-list{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.people-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px}.people-wrap input,.people-wrap select,.people-wrap textarea{width:100%;min-height:42px;border:1px solid var(--people-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--people-text);font:inherit}.people-wrap textarea{min-height:96px;resize:vertical}.people-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid var(--people-primary);background:var(--people-primary);color:#fff!important;font-weight:900;cursor:pointer;text-decoration:none}.people-btn.secondary{background:#fff;color:var(--people-primary)!important}.people-btn:hover{filter:brightness(.95);transform:translateY(-1px)}.people-btn[disabled]{opacity:.55;cursor:not-allowed;transform:none}.people-link-btn{border:none;background:transparent;color:#fff;text-decoration:underline;font-weight:900;cursor:pointer}.people-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:var(--people-soft);color:var(--people-primary);font-size:12px;font-weight:900;margin:2px}.people-pill.ok{background:#e7f6ec;color:#14532d}.people-pill.warn,.people-warning{background:#fff7ec;color:#8a4d00}.people-warning{border-radius:12px;padding:10px 12px;font-weight:800}.people-context-single{display:inline-flex;gap:8px;align-items:center;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-weight:900}.people-context-single span{opacity:.78}.people-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900;background:rgba(255,255,255,.16);color:#fff}.people-message.ok{background:#e7f6ec;color:#14532d}.people-message.warn{background:#fff7ec;color:#8a4d00}.people-toolbar{position:sticky;top:10px;z-index:10}.people-search-wrap{position:relative;margin-bottom:12px}.people-search-wrap input{padding-right:42px}.people-icon-btn{position:absolute;right:7px;top:6px;width:30px;height:30px;border-radius:999px;border:1px solid var(--people-border);background:#fff;color:var(--people-primary);font-weight:900;cursor:pointer}.people-filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.people-filter{border:1px solid var(--people-border);background:#fff;color:var(--people-primary);border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer}.people-filter.active{background:var(--people-primary);color:#fff}.people-filter strong{margin-left:5px}.people-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,0.95fr);gap:16px;align-items:start}.people-list-head,.people-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.people-list-head h2,.people-editor h2{margin:0 0 6px}.people-table-wrap{overflow:auto}.people-table{width:100%;border-collapse:separate;border-spacing:0 8px}.people-table th{text-align:left;color:var(--people-muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding:0 10px}.people-table td{background:#fff;border-top:1px solid var(--people-border);border-bottom:1px solid var(--people-border);padding:10px;vertical-align:middle}.people-table td:first-child{border-left:1px solid var(--people-border);border-radius:14px 0 0 14px}.people-table td:last-child{border-right:1px solid var(--people-border);border-radius:0 14px 14px 0}.people-table tr.selected td{background:var(--people-soft)}.people-name-btn{border:none;background:transparent;color:var(--people-primary);cursor:pointer;text-align:left;font:inherit}.people-name-btn strong{display:block;font-weight:900}.people-name-btn small{display:block;color:var(--people-muted);font-size:12px;margin-top:3px}.people-table a{color:var(--people-primary);font-weight:800;text-decoration:none}.muted{color:var(--people-muted)}.people-empty{text-align:center;padding:36px}.people-editor{position:sticky;top:122px}.people-editor details{border:1px solid var(--people-border);border-radius:18px;background:rgba(255,255,255,.82);margin:12px 0;overflow:hidden}.people-editor summary{cursor:pointer;padding:14px 16px;font-weight:900;color:var(--people-primary);background:var(--people-soft)}.people-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px}.people-field span{display:block;font-size:12px;font-weight:900;color:var(--people-primary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}.people-field small{display:block;color:var(--people-muted);font-size:11px;margin-top:5px}.people-field-wide{grid-column:1/-1}.people-check-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px}.people-check{display:flex;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--people-border);border-radius:14px;background:#fff;font-weight:800}.people-check input{width:auto;min-height:0}.people-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:260px;overflow:auto}@media(max-width:1050px){.people-layout{grid-template-columns:1fr}.people-editor{position:static}.people-login{grid-template-columns:1fr}}@media(max-width:720px){.people-form-grid,.people-check-grid{grid-template-columns:1fr}.people-toolbar-actions,.people-editor-actions{width:100%}.people-btn{width:100%}.people-table{min-width:780px}}@media print{#syncetc-portal-shell,.people-hero,.people-toolbar,.people-editor,.people-message{display:none!important}.people-wrap{max-width:none;margin:0;padding:0}.people-card{box-shadow:none;border:none}.people-table{font-size:11px}.people-table a{color:#000;text-decoration:none}}
    </style><div class="people-wrap"><section class="people-card people-hero"><div class="people-eyebrow">Organization Admin</div><h1>People & Access</h1><p>Search the full people pool, manage members and applicants, keep contact information current, and handle safe access updates from one place.</p>${renderLogin()}<div style="margin-top:12px">${renderOrgSelector()}</div><div class="people-message ${esc(messageKind)}">${esc(message)}</div></section>${renderContent()}<details class="people-card"><summary>Backend result</summary><pre class="people-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></details></div>`;
    bindEvents();
  }

  function bindEvents() {
    $("people-login")?.addEventListener("click", () => runButton("people-login", "Logging in…", login));
    $("people-logout")?.addEventListener("click", () => runButton("people-logout", "Logging out…", logout));
    $("people-reset-own")?.addEventListener("click", () => runButton("people-reset-own", "Sending…", resetOwnPassword));
    $("people-org-select")?.addEventListener("change", async (e) => { selectedOrgId = e.target.value; adminAccess = null; selected = null; try { await loadOrgContext(); setMessage("Organization loaded.", "ok"); } catch (err) { setMessage(err.message || String(err), "warn"); } render(); });
    $("people-search")?.addEventListener("input", (e) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { search = e.target.value || ""; render(); }, 140); });
    $("people-clear-search")?.addEventListener("click", () => { search = ""; render(); });
    document.querySelectorAll(".people-filter").forEach((btn) => btn.addEventListener("click", () => { filter = btn.getAttribute("data-filter") || "all"; render(); }));
    document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => { const id = btn.getAttribute("data-open"); selected = people.find((p) => p.membership_id === id) || null; mode = "view"; render(); }));
    $("people-new")?.addEventListener("click", () => { selected = blankPerson(); mode = "new"; render(); });
    $("people-refresh")?.addEventListener("click", () => runButton("people-refresh", "Refreshing…", async () => { await loadOrgContext(); setMessage("Refreshed.", "ok"); }));
    $("people-export")?.addEventListener("click", exportCsv);
    $("people-print")?.addEventListener("click", () => window.print());
    $("people-save")?.addEventListener("click", () => runButton("people-save", "Saving…", saveSelected));
    $("people-invite")?.addEventListener("click", () => runButton("people-invite", "Sending…", sendInvite));
    $("people-reset-password")?.addEventListener("click", () => runButton("people-reset-password", "Sending…", sendPasswordReset));
  }

  function blankPerson() {
    const applicant = arr(options.statuses).find((s) => s.status_key === "applicant") || arr(options.statuses)[0] || {};
    return { person_id:"", membership_id:"", display_name:"", first_name:"", last_name:"", primary_email:"", primary_phone:"", phone:"", member_number:"", title:"", lifecycle_status_key:applicant.status_key || "applicant", membership_class_key:"", application_stage_key:"", role_keys:[], role_labels:[], profile_json:{ contact:{}, emergency:{}, aviation:{}, background:{}, applicant:{}, admin:{} }, notes:"", login_linked:false };
  }

  function readForm() {
    const roleKeys = [];
    arr(options.roles).forEach((role) => { if ($(`role-${role.role_key}`)?.checked) roleKeys.push(role.role_key); });
    const profile = {
      contact: { mobile_phone: clean($("people-mobile-phone")?.value), home_phone: clean($("people-home-phone")?.value), work_phone: clean($("people-work-phone")?.value), address: clean($("people-address")?.value), city: clean($("people-city")?.value), state: clean($("people-state")?.value), zip: clean($("people-zip")?.value) },
      emergency: { name: clean($("people-emergency-name")?.value), phone: clean($("people-emergency-phone")?.value), relation: clean($("people-emergency-relation")?.value) },
      aviation: { club_cfi: bool($("people-club-cfi")?.checked), on_maintenance_crew: bool($("people-maintenance")?.checked), ifr_rated: bool($("people-ifr-rated")?.checked), club_night_checkout: bool($("people-night-checkout")?.checked), bfr_expiry_date: clean($("people-bfr-expiry")?.value), last_club_checkout: clean($("people-last-checkout")?.value), medical_expiry_date: clean($("people-medical-expiry")?.value), last_medical_date: clean($("people-last-medical")?.value), medical_class: clean($("people-medical-class")?.value), application_date: clean($("people-application-date")?.value), ratings: clean($("people-ratings")?.value), pilot_certificate_number: clean($("people-pilot-certificate")?.value), aircraft_types: clean($("people-aircraft-types")?.value), bfr_aircraft: clean($("people-bfr-aircraft")?.value), clubs_fbos: clean($("people-clubs-fbos")?.value), flying_type: clean($("people-flying-type")?.value), total_hours: clean($("people-total-hours")?.value), total_night_hours: clean($("people-night-hours")?.value), total_ifr_hours: clean($("people-ifr-hours")?.value), total_complex_hours: clean($("people-complex-hours")?.value) },
      background: { employer: clean($("people-employer")?.value), occupation: clean($("people-occupation")?.value) },
      applicant: { application_date: clean($("people-application-date")?.value), objectives: clean($("people-objectives")?.value), how_hear_us: clean($("people-how-hear")?.value), accident_details: clean($("people-accident-details")?.value), faa_details: clean($("people-faa-details")?.value) },
      admin: { officers_notes: clean($("people-officers-notes")?.value) }
    };
    const payload = { organization_id: selectedOrgId, person_id: selected?.person_id || "", membership_id: selected?.membership_id || "", first_name: clean($("people-first-name")?.value), last_name: clean($("people-last-name")?.value), display_name: clean($("people-display-name")?.value), primary_email: clean($("people-primary-email")?.value).toLowerCase(), primary_phone: clean($("people-primary-phone")?.value), member_number: clean($("people-member-number")?.value), title: clean($("people-title")?.value), joined_at: clean($("people-joined-at")?.value), status_key: clean($("people-status-key")?.value), membership_class_key: clean($("people-class-key")?.value), application_stage_key: clean($("people-stage-key")?.value), notes: clean($("people-notes")?.value), profile_json: profile };
    if (canManageAccess(selectedRow())) payload.role_keys = roleKeys;
    return payload;
  }

  async function saveSelected() {
    const payload = readForm();
    const restrictive = ["suspended","expelled","archived","blocked"].includes(key(payload.status_key));
    if (restrictive && !confirm("This status blocks or restricts access. Save anyway?")) return;
    payload.confirm_restrictive = restrictive;
    const res = await call("organization_save_person", payload);
    selected = res.person || selected;
    await loadPeople();
    if (selected?.membership_id) selected = people.find((p) => p.membership_id === selected.membership_id) || selected;
    setMessage("Person saved.", "ok");
  }

  async function sendInvite() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    const res = await call("organization_send_invite", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    await loadPeople();
    setMessage(res.message || "Invite requested.", "ok");
  }

  async function sendPasswordReset() {
    if (!selected?.membership_id) throw new Error("Select a person first.");
    const res = await call("organization_send_password_reset", { organization_id: selectedOrgId, membership_id: selected.membership_id, person_id: selected.person_id });
    setMessage(res.message || "Password reset requested.", res.sent === false ? "warn" : "ok");
  }

  function exportCsv() {
    const rows = filteredPeople();
    const headers = ["Name","Email","Phone","Member Number","Status","Class","Stage","Roles","Title"];
    const csvRows = [headers.join(",")];
    rows.forEach((p) => { const vals = [p.display_name,p.email,p.phone,p.member_number,p.lifecycle_status_label,p.membership_class_label,p.application_stage_label,arr(p.role_labels).join("; "),p.title].map((v) => `"${String(v ?? "").replace(/"/g,'""')}"`); csvRows.push(vals.join(",")); });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `people-${selectedRow()?.organization_key || "organization"}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message }; render(); }));
})();
