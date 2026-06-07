// ADMIN-PAGE-access-admin-current.js
// Internal Version: 2026-06-06-004-D
// Purpose: Platform Access Tools for bootstrapping/troubleshooting single-login access. Adds membership editing controls and cleaner platform header.

(function () {
  "use strict";

  const VERSION = "2026-06-06-004-D";
  const ROOT_ID = "syncetc-access-admin-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const PLATFORM_LOGO = "https://bxywokidhgppmlzyqvem.supabase.co/storage/v1/object/public/core-assets/SyncEtc-logo-compact.png";

  let supabaseClient = null;
  let token = "";
  let userEmail = "";
  let organizations = [];
  let people = [];
  let statuses = [];
  let membershipClasses = [];
  let applicationStages = [];
  let roles = [];
  let memberships = [];
  let selectedOrgId = "";
  let editingMembershipId = "";
  let backend = null;
  let globalMessage = `Version ${VERSION}`;
  let globalKind = "";
  let actionMessages = {};

  const $ = (id) => document.getElementById(id);
  const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");

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

  function setGlobal(message, kind = "") {
    globalMessage = message || `Version ${VERSION}`;
    globalKind = kind;
    const el = $("access-status");
    if (el) { el.textContent = globalMessage; el.className = `access-pill ${kind}`; }
  }

  function setActionMessage(key, message, kind = "") {
    actionMessages[key] = { message, kind };
    const el = $(`access-action-${key}`);
    if (el) { el.textContent = message || ""; el.className = `access-action-message ${kind}`; }
  }

  function setBackend(data) {
    backend = data || null;
    const el = $("access-backend");
    if (el) el.textContent = JSON.stringify(backend || {}, null, 2);
  }

  function actionMarkup(key) {
    const item = actionMessages[key] || {};
    return `<div id="access-action-${esc(key)}" class="access-action-message ${esc(item.kind || "")}">${esc(item.message || "")}</div>`;
  }

  async function runButton(buttonId, messageKey, workingText, fn) {
    const btn = $(buttonId);
    const original = btn ? btn.textContent : "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = workingText || "Working…"; }
      setActionMessage(messageKey, workingText || "Working…", "info");
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setActionMessage(messageKey, msg, "warn");
      setGlobal(msg, "warn");
      setBackend({ ok: false, message: msg });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    userEmail = data?.session?.user?.email || "";
    if (window.SyncEtcAdminShell?.setAuthState) window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: Boolean(token), email: userEmail });
    if (token) await loadInitial();
    render();
  }

  async function login() {
    await ensureSupabase();
    const email = emailNorm($("access-email")?.value);
    const password = $("access-password")?.value || "";
    if (!email || !password) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshAuth();
    setGlobal(`Logged in as ${email}`, "ok");
  }

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    token = ""; userEmail = ""; organizations = []; people = []; statuses = []; membershipClasses = []; applicationStages = []; roles = []; memberships = []; selectedOrgId = ""; editingMembershipId = ""; backend = null;
    setGlobal("Logged out.", "ok");
    render();
  }

  async function sendPasswordReset(email, key = "auth") {
    await ensureSupabase();
    const target = emailNorm(email);
    if (!target) throw new Error("Enter an email address first.");
    const redirectTo = `${window.location.origin}/password-reset`;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(target, { redirectTo });
    if (error) throw error;
    setActionMessage(key, `Password reset email requested for ${target}.`, "ok");
    setGlobal("Password reset email requested.", "ok");
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    setBackend(json);
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  function orgLabel(o) { return `${o.display_name || o.legal_name || o.organization_key || "Organization"} (${o.organization_key || o.organization_id})`; }
  function sortByOrderThenLabel(list, keyName) { return [...list].sort((a,b) => (a.sort_order || 999) - (b.sort_order || 999) || String(a.label || a[keyName] || "").localeCompare(String(b.label || b[keyName] || ""))); }
  function lifecycleStatuses(list) { const order = ["applicant","invited","pending","active","inactive","suspended","expelled","former","archived","blocked"]; return [...list].sort((a,b) => { const ai = order.indexOf(a.status_key); const bi = order.indexOf(b.status_key); if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi); return (a.sort_order || 999) - (b.sort_order || 999); }); }

  async function loadInitial() {
    const orgRes = await call("platform_list_organizations");
    organizations = orgRes.organizations || [];
    if (!selectedOrgId && organizations[0]) selectedOrgId = String(organizations[0].organization_id);
    if (selectedOrgId && !organizations.some((o) => String(o.organization_id) === selectedOrgId) && organizations[0]) selectedOrgId = String(organizations[0].organization_id);
    await Promise.all([loadOptions(), loadPeople(), loadMemberships()]);
  }

  async function loadOptions() {
    if (!selectedOrgId) return;
    const res = await call("platform_list_role_status_options", { organization_id: selectedOrgId });
    statuses = lifecycleStatuses(res.statuses || []);
    membershipClasses = sortByOrderThenLabel(res.membership_classes || [], "class_key");
    applicationStages = sortByOrderThenLabel(res.application_stages || [], "stage_key");
    roles = sortByOrderThenLabel(res.roles || [], "role_key");
  }

  async function loadPeople() {
    const res = await call("platform_list_people", { search: $("access-person-search")?.value || "" });
    people = res.people || [];
  }

  async function loadMemberships() {
    if (!selectedOrgId) return;
    const res = await call("platform_list_memberships", { organization_id: selectedOrgId });
    memberships = res.memberships || [];
  }

  function selectedRoleKeys() {
    return Array.from(document.querySelectorAll("input[name='access-role']:checked")).map((el) => el.value);
  }

  function editingMembership() {
    return memberships.find((m) => String(m.membership_id) === String(editingMembershipId)) || null;
  }

  function clearEdit() {
    editingMembershipId = "";
    render();
  }

  function editMembership(id) {
    editingMembershipId = String(id || "");
    setGlobal("Editing affiliation. Save or cancel below.", "info");
    render();
    const form = document.getElementById("access-affiliation-form");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function confirmMembershipSafety(existing, newStatusKey, newRoleKeys) {
    const restrictive = ["suspended", "expelled", "archived", "blocked"];
    if (restrictive.includes(newStatusKey)) {
      if (!window.confirm(`Confirm: set this affiliation to ${newStatusKey}? This should block normal organization access.`)) return false;
    }

    const oldRoles = new Set((existing?.role_keys || []).map(String));
    const nextRoles = new Set((newRoleKeys || []).map(String));
    if (oldRoles.has("organization-admin") && !nextRoles.has("organization-admin")) {
      if (!window.confirm("Confirm: remove Organization Admin from this affiliation?")) return false;
    }

    if (!nextRoles.size) {
      if (!window.confirm("Confirm: save this affiliation with no roles?")) return false;
    }
    return true;
  }

  async function savePersonMembership() {
    if (!selectedOrgId) throw new Error("Select an organization first.");
    const current = editingMembership();
    const statusKey = $("access-status-key")?.value || "active";
    const classKey = $("access-class-key")?.value || "";
    const stageKey = $("access-stage-key")?.value || "";
    const roleKeys = selectedRoleKeys();

    if (current) {
      if (!confirmMembershipSafety(current, statusKey, roleKeys)) {
        setActionMessage("person", "Save canceled.", "warn");
        return null;
      }
      const memberRes = await call("platform_upsert_membership", {
        organization_id: selectedOrgId,
        person_id: current.person_id,
        status_key: statusKey,
        membership_class_key: classKey,
        application_stage_key: stageKey,
        role_keys: roleKeys,
        title: $("access-member-title")?.value || "",
        member_number: $("access-member-number")?.value || ""
      });
      editingMembershipId = "";
      await loadMemberships();
      render();
      setActionMessage("person", "Affiliation updated.", "ok");
      setGlobal("Affiliation updated.", "ok");
      return memberRes;
    }

    const email = emailNorm($("access-person-email")?.value);
    const displayName = clean($("access-person-name")?.value);
    if (!email && !displayName) throw new Error("Enter at least an email or display name.");

    const personRes = await call("platform_upsert_person", { primary_email: email, display_name: displayName, status: "active" });
    const person = personRes.person;
    if (!person?.person_id) throw new Error("Person save did not return a person_id.");

    const linkRes = email ? await call("platform_link_auth_user_by_email", { primary_email: email, display_name: displayName, status: "active" }) : { linked: false };

    const memberRes = await call("platform_upsert_membership", {
      organization_id: selectedOrgId,
      person_id: person.person_id,
      status_key: statusKey,
      membership_class_key: classKey,
      application_stage_key: stageKey,
      role_keys: roleKeys,
      title: $("access-member-title")?.value || "",
      member_number: $("access-member-number")?.value || ""
    });

    await loadPeople(); await loadMemberships(); render();
    if (linkRes && linkRes.linked === false) {
      setActionMessage("person", "Person and affiliation saved. Login is not linked yet.", "warn");
      setGlobal("Person saved; login not linked yet.", "warn");
    } else {
      setActionMessage("person", "Person, login link, and affiliation saved.", "ok");
      setGlobal("Person and access saved.", "ok");
    }
    return memberRes;
  }

  async function seedSelfOrgAdmin() {
    if (!selectedOrgId) throw new Error("Select an organization first.");
    await call("platform_seed_self_as_org_admin", { organization_id: selectedOrgId });
    await loadOptions(); await loadMemberships(); render();
    setActionMessage("seed", "You are now seeded as organization admin for the selected organization.", "ok");
    setGlobal("Organization admin test access saved.", "ok");
  }

  async function sendInvite() {
    const email = emailNorm($("access-auth-email")?.value || $("access-person-email")?.value);
    const res = await call("platform_invite_auth_user_by_email", { email });
    if (res.already_exists) { setActionMessage("auth", res.message || "Login already exists. Use password reset if needed.", "warn"); setGlobal("Login already exists.", "warn"); }
    else { setActionMessage("auth", res.message || `Invitation requested for ${email}.`, "ok"); setGlobal("Invitation requested.", "ok"); }
  }

  function renderLogin() {
    return `
      <section class="access-card access-login-card">
        ${token ? `<div class="access-auth-row"><span class="access-pill ok">${esc(userEmail)}</span><button class="access-btn secondary" id="access-logout">Log out</button></div>` : ""}
        <div class="access-brand-row">
          <div class="access-logo-card"><img src="${esc(PLATFORM_LOGO)}" alt="SyncEtc logo"></div>
          <div class="access-hero-copy"><div class="access-eyebrow">Platform Access Tools</div><h1>Platform Access Tools</h1><p>Internal SyncEtc tools for bootstrapping and diagnosing access. Not the everyday customer roster workflow.</p></div>
        </div>
        ${token ? "" : `<div class="access-login-grid"><input id="access-email" type="email" placeholder="Platform admin email"><input id="access-password" type="password" placeholder="Password"><button class="access-btn" id="access-login">Log in</button></div><div class="access-login-actions"><button class="access-link-btn" id="access-login-reset" type="button">Send password reset email</button><a class="access-link-btn" href="/password-reset">Open password reset page</a></div>`}
      </section>`;
  }

  function roleCheckboxes(selectedKeys) {
    const selected = new Set((selectedKeys || ["member"]).map(String));
    return roles.map((r) => {
      const checked = selected.has(r.role_key);
      const label = r.role_key === "member" ? "User / Member" : r.label;
      return `<label class="access-check"><input type="checkbox" name="access-role" value="${esc(r.role_key)}" ${checked ? "checked" : ""}> <span><strong>${esc(label)}</strong><small>${esc(r.role_key)}</small></span></label>`;
    }).join("");
  }

  function optionRows(rows, keyField, includeBlank, blankLabel, selectedValue) {
    return `${includeBlank ? `<option value="" ${!selectedValue ? "selected" : ""}>${esc(blankLabel || "None")}</option>` : ""}${rows.map((r) => `<option value="${esc(r[keyField])}" ${String(r[keyField]) === String(selectedValue || "") ? "selected" : ""}>${esc(r.label)} (${esc(r[keyField])})</option>`).join("")}`;
  }

  function renderOrgContext() {
    if (organizations.length === 1) {
      return `<div class="access-single-org">${esc(orgLabel(organizations[0]))}</div>`;
    }
    return `<select id="access-org-select">${organizations.map((o) => `<option value="${esc(o.organization_id)}" ${String(o.organization_id) === selectedOrgId ? "selected" : ""}>${esc(orgLabel(o))}</option>`).join("")}</select>`;
  }

  function renderAffiliationForm() {
    const m = editingMembership();
    const isEdit = Boolean(m);
    const selectedStatus = m?.membership_status_key || "active";
    const selectedClass = m?.membership_class_key || "";
    const selectedStage = m?.application_stage_key || "";
    const selectedRoles = isEdit ? (m.role_keys || []) : ["member"];
    const nameValue = isEdit ? (m.display_name || "") : "";
    const emailValue = isEdit ? (m.email || m.primary_email || "") : "";
    const titleValue = isEdit ? (m.title || "") : "";
    const memberNumberValue = isEdit ? (m.member_number || "") : "";

    return `
      <section class="access-card" id="access-affiliation-form">
        <div class="access-card-head"><h2>${isEdit ? "Edit organization affiliation" : "Create/link person and organization affiliation"}</h2>${isEdit ? `<button class="access-btn small secondary" id="access-cancel-edit">Cancel edit</button>` : ""}</div>
        ${isEdit ? `<div class="access-edit-banner">Editing ${esc(nameValue || emailValue || "selected person")}. Person name/email editing will be handled in a later roster tool.</div>` : ""}
        <div class="access-two">
          <div><label>Email</label><input id="access-person-email" type="email" placeholder="user@example.com" value="${esc(emailValue)}" ${isEdit ? "disabled" : ""}></div>
          <div><label>Display name</label><input id="access-person-name" type="text" placeholder="Jane Smith" value="${esc(nameValue)}" ${isEdit ? "disabled" : ""}></div>
        </div>
        <div class="access-three">
          <div><label>Lifecycle status</label><select id="access-status-key">${optionRows(statuses, "status_key", false, "", selectedStatus)}</select></div>
          <div><label>Membership class</label><select id="access-class-key">${optionRows(membershipClasses, "class_key", true, "No class / not a member class", selectedClass)}</select></div>
          <div><label>Application/onboarding stage</label><select id="access-stage-key">${optionRows(applicationStages, "stage_key", true, "No application stage", selectedStage)}</select></div>
        </div>
        <div class="access-two"><div><label>Reference #</label><input id="access-member-number" type="text" value="${esc(memberNumberValue)}" placeholder="Optional"></div><div><label>Title / note</label><input id="access-member-title" type="text" value="${esc(titleValue)}" placeholder="President, Treasurer, Instructor, Manager, etc."></div></div>
        <div class="access-help"><strong>Use lifecycle for access safety.</strong> Use class for dues/privileges and stage for applicant/onboarding workflow.</div>
        <div class="access-role-box">${roleCheckboxes(selectedRoles)}</div>
        <button class="access-btn" id="access-save-person">${isEdit ? "Save affiliation changes" : "Save person + organization affiliation"}</button>
        <div class="access-help">Platform-only emergency/diagnostic tool. Customer roster editing comes later under Organization Admin.</div>
        ${actionMarkup("person")}
      </section>`;
  }

  function renderMembershipRows() {
    if (!memberships.length) return `<tr><td colspan="8">No affiliations found for this organization.</td></tr>`;
    return memberships.map((m) => {
      const statusClass = m.blocks_access || ["suspended","expelled","archived","blocked"].includes(String(m.membership_status_key || "")) ? "danger" : m.can_view_member_portal ? "ok" : "warn";
      return `<tr>
        <td><button class="access-btn small secondary access-edit-btn" data-membership-id="${esc(m.membership_id)}">Edit</button></td>
        <td>${esc(m.display_name || "")}</td>
        <td>${esc(m.email || m.primary_email || "")}</td>
        <td><span class="access-pill ${statusClass}">${esc(m.membership_status_label || m.membership_status_key || "")}</span></td>
        <td>${esc(m.membership_class_label || m.membership_class_key || "")}</td>
        <td>${esc(m.application_stage_label || m.application_stage_key || "")}</td>
        <td>${(m.role_keys || []).map((r) => `<span class="access-mini">${esc(r)}</span>`).join(" ")}</td>
        <td class="access-perms">${(m.permission_keys || []).slice(0, 12).map((p) => `<span>${esc(p)}</span>`).join(" ")}${(m.permission_keys || []).length > 12 ? " …" : ""}</td>
      </tr>`;
    }).join("");
  }

  function renderApp() {
    if (!token) return `<div class="access-card"><strong>Login required.</strong> This page is for platform admins.</div>`;
    return `
      <section class="access-card access-note">
        <h2>What this page is</h2>
        <p><strong>Purpose:</strong> internal platform troubleshooting and emergency access repair.</p>
        <p>Lifecycle status controls access safety; membership class controls dues/privileges; application stage controls applicant/onboarding workflow; roles grant permissions.</p>
      </section>

      <section class="access-grid">
        <div class="access-card"><div class="access-card-head"><h2>Organization context</h2><button class="access-btn small secondary" id="access-refresh">Refresh</button></div>${renderOrgContext()}<div class="access-help">All statuses, classes, stages, and roles are organization-scoped.</div><button class="access-btn" id="access-seed-self">Seed myself as organization admin</button>${actionMarkup("seed")}</div>
        <div class="access-card"><h2>Account tools</h2><label>Email</label><input id="access-auth-email" type="email" placeholder="user@example.com"><div class="access-button-row"><button class="access-btn" id="access-send-reset">Send password reset</button><button class="access-btn secondary" id="access-send-invite">Send sign-up/invite</button></div><div class="access-help">Password reset is for existing logins. Invite is for users without a login.</div>${actionMarkup("auth")}</div>
      </section>

      ${renderAffiliationForm()}

      <section class="access-grid">
        <div class="access-card"><div class="access-card-head"><h2>People search</h2><button class="access-btn small secondary" id="access-search-people-btn">Search</button></div><input id="access-person-search" type="text" placeholder="Search people by name/email"><div class="access-people-list">${people.slice(0, 25).map((p) => `<div class="access-person-row"><strong>${esc(p.display_name || "(No name)")}</strong><span>${esc(p.primary_email || "")}</span></div>`).join("")}</div></div>
        <div class="access-card"><h2>Vocabulary loaded</h2><p><strong>Lifecycle statuses:</strong> ${statuses.length}</p><p><strong>Membership classes:</strong> ${membershipClasses.length}</p><p><strong>Application stages:</strong> ${applicationStages.length}</p><p><strong>Roles:</strong> ${roles.length}</p></div>
      </section>

      <section class="access-card"><div class="access-card-head"><h2>Affiliations for selected organization</h2><span class="access-pill">${memberships.length} rows</span></div><div class="access-table-wrap"><table class="access-table"><thead><tr><th>Edit</th><th>Name</th><th>Email</th><th>Lifecycle</th><th>Class</th><th>Stage</th><th>Roles</th><th>Permissions</th></tr></thead><tbody>${renderMembershipRows()}</tbody></table></div></section>

      <section class="access-card"><h2>Backend results</h2><pre id="access-backend" class="access-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></section>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID); if (!root) return;
    root.innerHTML = `
      <style>
        .access-wrap{max-width:1180px;margin:22px auto 52px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.access-card{background:rgba(255,255,255,.96);border:1px solid rgba(18,54,90,.16);border-radius:22px;box-shadow:0 10px 28px rgba(12,38,64,.12);padding:20px;margin:16px 0}.access-login-card{position:relative;background:linear-gradient(135deg,#0b1f4f,#12365a 58%,#ff6500);color:#fff;padding:22px 24px 20px}.access-brand-row{display:flex;align-items:center;gap:18px;padding-right:230px}.access-logo-card{background:#fff;border-radius:18px;padding:10px 14px;box-shadow:0 8px 18px rgba(0,0,0,.16);display:inline-flex}.access-logo-card img{width:155px;max-width:32vw;height:auto;object-fit:contain}.access-login-card h1{color:#fff;margin:6px 0;font-size:32px;line-height:1.05}.access-login-card p{color:rgba(255,255,255,.92)!important;margin:0;max-width:720px}.access-hero-copy{min-width:0}.access-auth-row{position:absolute;right:18px;top:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.access-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.access-note{border-left:7px solid #ff6500}.access-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.access-card h2{margin:0 0 12px;color:#0b2744}.access-card p{color:#294968;line-height:1.5}.access-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.access-login-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center;margin-top:16px}.access-login-actions,.access-button-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.access-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.access-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.access-wrap input,.access-wrap select{width:100%;min-height:42px;border:1px solid rgba(18,54,90,.22);border-radius:12px;padding:10px 12px;margin:5px 0 12px;background:#fff;color:#172033}.access-wrap input[disabled]{background:#eef2f7;color:#586579}.access-wrap label{display:block;font-size:12px;font-weight:900;color:#24435f}.access-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease,opacity .15s ease}.access-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(12,38,64,.18);background:#0b2744}.access-btn[disabled]{opacity:.62;cursor:wait;transform:none}.access-btn.secondary{background:#fff;color:#12365a}.access-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.access-link-btn{border:none;background:transparent;color:#fff;text-decoration:underline;font-weight:800;cursor:pointer;padding:4px}.access-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#eaf5ff;color:#12365a;font-size:12px;font-weight:900}.access-pill.ok{background:#e7f6ec;color:#14532d}.access-pill.warn{background:#fff7ec;color:#8a4d00}.access-pill.danger{background:#fee2e2;color:#991b1b}.access-action-message{display:none;margin-top:10px;padding:11px 13px;border-radius:13px;font-size:13px;font-weight:800;line-height:1.4}.access-action-message.info,.access-action-message.ok,.access-action-message.warn{display:block}.access-action-message.info{background:#eaf5ff;color:#12365a;border:1px solid rgba(18,54,90,.16)}.access-action-message.ok{background:#e7f6ec;color:#14532d;border:1px solid rgba(20,83,45,.18)}.access-action-message.warn{background:#fff7ec;color:#8a4d00;border:1px solid rgba(138,77,0,.24)}.access-help{font-size:13px;color:#5d6b78;line-height:1.45;margin:8px 0 12px}.access-edit-banner{background:#fff7ec;border:1px solid rgba(255,101,0,.25);border-radius:14px;color:#7a3900;font-weight:800;padding:11px 13px;margin-bottom:14px}.access-single-org{border:1px solid rgba(18,54,90,.18);border-radius:12px;background:#f8fbfe;padding:11px 12px;font-weight:900;color:#12365a;margin:5px 0 12px}.access-role-box{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0 14px}.access-check{display:flex!important;gap:8px;align-items:flex-start;padding:9px;border:1px solid rgba(18,54,90,.14);border-radius:12px;background:#f8fbfe}.access-check input{width:auto!important;min-height:auto!important;margin:2px 0 0!important}.access-check small{display:block;color:#5d6b78;margin-top:3px}.access-table-wrap{overflow:auto;border:1px solid rgba(18,54,90,.12);border-radius:14px}.access-table{width:100%;border-collapse:collapse;font-size:13px}.access-table th,.access-table td{padding:10px;border-bottom:1px solid rgba(18,54,90,.10);text-align:left;vertical-align:top}.access-table th{background:#eef6ff;color:#12365a}.access-mini{display:inline-flex;border-radius:999px;background:#eef6ff;color:#12365a;padding:3px 7px;margin:2px;font-size:11px;font-weight:800}.access-perms span{display:inline-block;color:#4d6378;font-size:11px;margin:2px 5px 2px 0}.access-person-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(18,54,90,.08)}.access-backend{min-height:120px;max-height:320px;overflow:auto;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px}.access-status-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.access-edit-btn{white-space:nowrap}@media(max-width:900px){.access-brand-row{padding-right:0}.access-auth-row{position:static;margin-bottom:14px;justify-content:flex-start}.access-grid,.access-login-grid,.access-two,.access-three,.access-role-box{grid-template-columns:1fr}.access-login-card h1{font-size:28px}}
      </style>
      <div class="access-wrap">${renderLogin()}<div class="access-status-row"><span id="access-status" class="access-pill ${esc(globalKind)}">${esc(globalMessage)}</span></div>${renderApp()}</div>`;

    $("access-login")?.addEventListener("click", () => runButton("access-login", "login", "Logging in…", login));
    $("access-login-reset")?.addEventListener("click", () => runButton("access-login-reset", "login", "Requesting reset…", () => sendPasswordReset($("access-email")?.value, "login")));
    $("access-logout")?.addEventListener("click", () => runButton("access-logout", "login", "Logging out…", logout));
    $("access-refresh")?.addEventListener("click", () => runButton("access-refresh", "seed", "Refreshing…", async () => { await loadInitial(); render(); setActionMessage("seed", "Refreshed.", "ok"); }));
    $("access-org-select")?.addEventListener("change", async (e) => { selectedOrgId = e.target.value; editingMembershipId = ""; await loadOptions(); await loadMemberships(); render(); });
    $("access-seed-self")?.addEventListener("click", () => runButton("access-seed-self", "seed", "Saving access…", seedSelfOrgAdmin));
    $("access-save-person")?.addEventListener("click", () => runButton("access-save-person", "person", editingMembershipId ? "Saving changes…" : "Saving person…", savePersonMembership));
    $("access-cancel-edit")?.addEventListener("click", clearEdit);
    $("access-send-reset")?.addEventListener("click", () => runButton("access-send-reset", "auth", "Sending reset…", () => sendPasswordReset($("access-auth-email")?.value, "auth")));
    $("access-send-invite")?.addEventListener("click", () => runButton("access-send-invite", "auth", "Sending invite…", sendInvite));
    $("access-search-people-btn")?.addEventListener("click", () => runButton("access-search-people-btn", "person", "Searching…", async () => { await loadPeople(); render(); setActionMessage("person", "People search refreshed.", "ok"); }));
    document.querySelectorAll(".access-edit-btn").forEach((btn) => btn.addEventListener("click", () => editMembership(btn.dataset.membershipId)));
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { render(); setGlobal(e.message, "warn"); }));
})();
