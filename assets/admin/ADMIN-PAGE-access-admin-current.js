// ADMIN-PAGE-access-admin-current.js
// Internal Version: 2026-06-06-001
// Purpose: Platform/corporate admin tool for linking Supabase Auth users to people, organizations, memberships, roles, and permissions.

(function () {
  "use strict";

  const VERSION = "2026-06-06-001";
  const ROOT_ID = "syncetc-access-admin-root";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let userEmail = "";
  let organizations = [];
  let people = [];
  let statuses = [];
  let roles = [];
  let memberships = [];
  let selectedOrgId = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const emailNorm = (v) => clean(v).toLowerCase();

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

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    userEmail = data?.session?.user?.email || "";
    if (window.SyncEtcAdminShell?.setAuthState) {
      window.SyncEtcAdminShell.setAuthState({ required: true, authenticated: Boolean(token), email: userEmail });
    }
    if (token) await loadInitial();
    render();
  }

  async function login() {
    await ensureSupabase();
    const email = $("access-email").value;
    const password = $("access-password").value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshAuth();
  }

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    token = ""; userEmail = ""; organizations = []; people = []; memberships = [];
    render();
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const json = await res.json().catch(() => ({}));
    setBackend(json);
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  function setBackend(data) { const el = $("access-backend"); if (el) el.textContent = JSON.stringify(data, null, 2); }
  function setStatus(message, kind = "") { const el = $("access-status"); if (el) { el.textContent = message || ""; el.className = `access-pill ${kind}`; } }
  function orgLabel(o) { return `${o.display_name || o.legal_name || o.organization_key || "Organization"} (${o.organization_key || o.organization_id})`; }

  async function loadInitial() {
    const orgRes = await call("platform_list_organizations");
    organizations = orgRes.organizations || [];
    if (!selectedOrgId && organizations[0]) selectedOrgId = String(organizations[0].organization_id);
    await Promise.all([loadOptions(), loadPeople(), loadMemberships()]);
  }

  async function loadOptions() {
    if (!selectedOrgId) return;
    const res = await call("platform_list_role_status_options", { organization_id: selectedOrgId });
    statuses = res.statuses || [];
    roles = res.roles || [];
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

  async function savePersonMembership() {
    const primaryEmail = emailNorm($("access-person-email").value);
    const displayName = clean($("access-person-name").value);
    if (!primaryEmail && !displayName) throw new Error("Enter at least a person email or display name.");
    const personRes = await call("platform_upsert_person", { primary_email: primaryEmail, display_name: displayName });
    const person = personRes.person;

    let linkRes = null;
    if (primaryEmail) linkRes = await call("platform_link_auth_user_by_email", { email: primaryEmail, display_name: displayName });

    const roleKeys = selectedRoleKeys();
    if (!roleKeys.length) throw new Error("Select at least one role.");
    const statusKey = $("access-status-key").value || "full-member";
    await call("platform_upsert_membership", {
      organization_id: selectedOrgId,
      person_id: person.person_id,
      status_key: statusKey,
      role_keys: roleKeys,
      title: $("access-member-title").value,
      member_number: $("access-member-number").value
    });

    await loadPeople();
    await loadMemberships();
    render();
    setStatus(linkRes && linkRes.linked === false ? "Person/membership saved. Auth user not found yet; have them sign up, then link again." : "Person, link, and membership saved.", "ok");
  }

  async function seedSelfOrgAdmin() {
    if (!selectedOrgId) throw new Error("Select an organization first.");
    await call("platform_seed_self_as_org_admin", { organization_id: selectedOrgId });
    await loadMemberships();
    render();
    setStatus("You are seeded as organization admin for this organization.", "ok");
  }

  function renderLogin() {
    return `
      <section class="access-card access-login-card">
        <div>
          <div class="access-eyebrow">Platform Access</div>
          <h1>Access Admin</h1>
          <p>Link Supabase Auth users to people, organizations, membership statuses, and roles.</p>
        </div>
        ${token ? `
          <div class="access-auth-row">
            <span class="access-pill ok">Logged in as ${esc(userEmail)}</span>
            <button class="access-btn secondary" id="access-logout">Log out</button>
          </div>` : `
          <div class="access-login-grid">
            <input id="access-email" type="email" placeholder="Platform admin email">
            <input id="access-password" type="password" placeholder="Password">
            <button class="access-btn" id="access-login">Log in</button>
          </div>`}
      </section>`;
  }

  function renderApp() {
    if (!token) return `<div class="access-card"><strong>Login required.</strong> This page is for platform admins.</div>`;
    return `
      <section class="access-grid">
        <div class="access-card">
          <div class="access-card-head">
            <h2>Organization</h2>
            <button class="access-btn small secondary" id="access-refresh">Refresh</button>
          </div>
          <select id="access-org-select">
            ${organizations.map((o) => `<option value="${esc(o.organization_id)}" ${String(o.organization_id) === selectedOrgId ? "selected" : ""}>${esc(orgLabel(o))}</option>`).join("")}
          </select>
          <div class="access-help">The customer/member access model is organization-scoped. One person may belong to many organizations.</div>
          <button class="access-btn" id="access-seed-self">Seed myself as organization admin</button>
        </div>

        <div class="access-card">
          <h2>Create/link person</h2>
          <label>Email</label>
          <input id="access-person-email" type="email" placeholder="member@example.com">
          <label>Display name</label>
          <input id="access-person-name" type="text" placeholder="Jane Smith">
          <div class="access-two">
            <div><label>Status</label><select id="access-status-key">${statuses.map((s) => `<option value="${esc(s.status_key)}">${esc(s.label)} (${esc(s.status_key)})</option>`).join("")}</select></div>
            <div><label>Member #</label><input id="access-member-number" type="text" placeholder="Optional"></div>
          </div>
          <label>Title / note</label>
          <input id="access-member-title" type="text" placeholder="Board Member, Instructor, Treasurer, etc.">
          <div class="access-role-box">
            ${roles.map((r) => `<label class="access-check"><input type="checkbox" name="access-role" value="${esc(r.role_key)}" ${r.role_key === "member" ? "checked" : ""}> <span><strong>${esc(r.label)}</strong><small>${esc(r.role_key)}</small></span></label>`).join("")}
          </div>
          <button class="access-btn" id="access-save-person">Save person + membership</button>
          <div class="access-help">If a Supabase Auth user already exists with this email, the account is linked. If not, the person/membership is ready and can be linked after first login.</div>
        </div>
      </section>

      <section class="access-card">
        <div class="access-card-head">
          <h2>Memberships for selected organization</h2>
          <span class="access-pill">${memberships.length} rows</span>
        </div>
        <div class="access-table-wrap">
          <table class="access-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Roles</th><th>Permissions</th></tr></thead>
            <tbody>${memberships.map((m) => `
              <tr>
                <td>${esc(m.display_name || "")}</td>
                <td>${esc(m.email || m.primary_email || "")}</td>
                <td><span class="access-pill ${m.can_view_member_portal ? "ok" : "warn"}">${esc(m.membership_status_label || m.membership_status_key || "")}</span></td>
                <td>${(m.role_keys || []).map((r) => `<span class="access-mini">${esc(r)}</span>`).join(" ")}</td>
                <td class="access-perms">${(m.permission_keys || []).slice(0, 10).map((p) => `<span>${esc(p)}</span>`).join(" ")}${(m.permission_keys || []).length > 10 ? " …" : ""}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>

      <section class="access-card">
        <div class="access-card-head"><h2>People search</h2><button class="access-btn small secondary" id="access-search-people-btn">Search</button></div>
        <input id="access-person-search" type="text" placeholder="Search people by name/email">
        <div class="access-people-list">${people.slice(0, 25).map((p) => `<div class="access-person-row"><strong>${esc(p.display_name || "(No name)")}</strong><span>${esc(p.primary_email || "")}</span></div>`).join("")}</div>
      </section>

      <section class="access-card">
        <h2>Backend results</h2>
        <pre id="access-backend" class="access-backend"></pre>
      </section>`;
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = `
      <style>
        .access-wrap{max-width:1180px;margin:26px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:#172033}.access-card{background:rgba(255,255,255,.94);border:1px solid rgba(18,54,90,.16);border-radius:22px;box-shadow:0 10px 28px rgba(12,38,64,.12);padding:20px;margin:16px 0}.access-login-card{background:linear-gradient(135deg,#12365a,#2f80c4);color:#fff}.access-login-card h1{color:#fff;margin:6px 0}.access-login-card p{color:rgba(255,255,255,.88)}.access-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.access-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:16px}.access-card h2{margin:0 0 12px;color:#0b2744}.access-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.access-login-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center}.access-auth-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.access-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.access-wrap input,.access-wrap select{width:100%;min-height:42px;border:1px solid rgba(18,54,90,.22);border-radius:12px;padding:10px 12px;margin:5px 0 12px;background:#fff;color:#172033}.access-wrap label{display:block;font-size:12px;font-weight:900;color:#24435f}.access-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 15px;border-radius:999px;border:1px solid #12365a;background:#12365a;color:#fff;font-weight:900;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.access-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(12,38,64,.18);background:#0b2744}.access-btn.secondary{background:#fff;color:#12365a}.access-btn.small{min-height:32px;font-size:12px;padding:7px 12px}.access-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;background:#eaf5ff;color:#12365a;font-size:12px;font-weight:900}.access-pill.ok{background:#e7f6ec;color:#14532d}.access-pill.warn{background:#fff7ec;color:#8a4d00}.access-help{font-size:13px;color:#5d6b78;line-height:1.45;margin:8px 0 12px}.access-role-box{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0 14px}.access-check{display:flex!important;gap:8px;align-items:flex-start;padding:9px;border:1px solid rgba(18,54,90,.14);border-radius:12px;background:#f8fbfe}.access-check input{width:auto!important;min-height:auto!important;margin:2px 0 0!important}.access-check small{display:block;color:#5d6b78;margin-top:3px}.access-table-wrap{overflow:auto;border:1px solid rgba(18,54,90,.12);border-radius:14px}.access-table{width:100%;border-collapse:collapse;font-size:13px}.access-table th,.access-table td{padding:10px;border-bottom:1px solid rgba(18,54,90,.10);text-align:left;vertical-align:top}.access-table th{background:#eef6ff;color:#12365a}.access-mini{display:inline-flex;border-radius:999px;background:#eef6ff;color:#12365a;padding:3px 7px;margin:2px;font-size:11px;font-weight:800}.access-perms span{display:inline-block;color:#4d6378;font-size:11px;margin:2px 5px 2px 0}.access-person-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(18,54,90,.08)}.access-backend{min-height:120px;max-height:320px;overflow:auto;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px}.access-status-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}@media(max-width:850px){.access-grid,.access-login-grid,.access-two,.access-role-box{grid-template-columns:1fr}}
      </style>
      <div class="access-wrap">
        ${renderLogin()}
        <div class="access-status-row"><span id="access-status" class="access-pill">Version ${VERSION}</span></div>
        ${renderApp()}
      </div>`;

    $("access-login")?.addEventListener("click", () => login().catch((e) => setStatus(e.message, "warn")));
    $("access-logout")?.addEventListener("click", () => logout().catch((e) => setStatus(e.message, "warn")));
    $("access-refresh")?.addEventListener("click", () => loadInitial().then(render).catch((e) => setStatus(e.message, "warn")));
    $("access-org-select")?.addEventListener("change", async (e) => { selectedOrgId = e.target.value; await loadOptions(); await loadMemberships(); render(); });
    $("access-seed-self")?.addEventListener("click", () => seedSelfOrgAdmin().catch((e) => setStatus(e.message, "warn")));
    $("access-save-person")?.addEventListener("click", () => savePersonMembership().catch((e) => setStatus(e.message, "warn")));
    $("access-search-people-btn")?.addEventListener("click", () => loadPeople().then(render).catch((e) => setStatus(e.message, "warn")));
  }

  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { render(); setStatus(e.message, "warn"); }));
})();
