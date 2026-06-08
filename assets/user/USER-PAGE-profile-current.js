// USER-PAGE-profile-current.js
// Internal Version: 2026-06-08-024-B
// Purpose: User-facing My Profile page. Self-service contact/profile photo updates only; membership/access fields remain read-only.

(function () {
  "use strict";

  const VERSION = "2026-06-08-024-B";
  const ROOT_IDS = ["syncetc-user-profile-root", "syncetc-my-profile-root", "syncetc-member-profile-root"];
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let platformAdmin = false;
  let profile = null;
  let pageInfo = null;
  let backend = null;
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let authChecked = false;
  let loading = false;
  let dirty = false;
  let loadedOnce = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  const DEBUG = new URLSearchParams(location.search).get("syncetc_debug") === "1";
  const debugStart = performance.now();
  const debugSteps = [];

  function elapsed() { return Math.round(performance.now() - debugStart); }
  function mark(step, detail = "") { if (DEBUG) debugSteps.push({ ms: elapsed(), step, detail: String(detail || "") }); }

  function rootEl() {
    let root = ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean);
    if (!root) { root = document.createElement("div"); root.id = ROOT_IDS[0]; document.body.appendChild(root); }
    return root;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
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
    if (!/^[0-9a-f]{6}$/i.test(c)) throw new Error("STYLE CONFIGURATION ERROR: active organization style is missing a valid primary color.");
    return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, field, fallback = "") { const v = obj(source)[field]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }
  function styleConfig(row) {
    const profileObj = obj(row?.style_profile);
    const colors = obj(profileObj.colors_json);
    const spacing = obj(profileObj.spacing_json);
    const effects = obj(profileObj.effects_json);
    const layout = obj(profileObj.layout_json);
    const primary = getText(colors, "brand_primary", "");
    const secondary = getText(colors, "brand_secondary", "");
    const surface = getText(colors, "surface", "");
    const text = getText(colors, "text", "");
    const width = getText(spacing, "page_width", getText(layout, "default_width", ""));
    if (!primary || !secondary || !surface || !text || !width) throw new Error("STYLE CONFIGURATION ERROR: active organization style profile was not loaded for My Profile.");
    const corners = getText(effects, "corners", "soft");
    const radius = corners === "sharp" ? "10px" : corners === "pill" ? "28px" : "22px";
    return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius, pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px" };
  }
  function cssVars(cfg) { return `--profile-primary:${cfg.primary};--profile-secondary:${cfg.secondary};--profile-surface:${cfg.surface};--profile-text:${cfg.text};--profile-muted:${cfg.muted};--profile-border:${cfg.border};--profile-soft:${cfg.soft};--profile-strong-soft:${cfg.strongSoft};--profile-shadow:${cfg.shadow};--profile-radius:${cfg.radius};--profile-page-width:${cfg.pageWidth};`; }

  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }
  function optionsFromAccess() { return access.map((row) => ({ organization_id: row.organization_id, organization_name: row.organization_name, organization_key: row.organization_key })); }

  function setShellState() {
    const row = selectedAccess();
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: "user",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      organizationId: row?.organization_id || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizationOptions: optionsFromAccess(),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
      activePageKey: "my-profile"
    });
  }

  async function getToken() {
    await ensureSupabase();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    return token;
  }

  async function call(action, payload = {}) {
    const activeToken = token || await getToken();
    if (!activeToken) throw new Error("Login required.");
    const res = await fetch(EDGE_URL, { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${activeToken}`, "apikey":SUPABASE_ANON_KEY }, body: JSON.stringify({ action, ...payload }) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok:false, message:text || `HTTP ${res.status}` }; }
    backend = data;
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }
  function setDirty(v = true) { dirty = Boolean(v); }

  async function refresh() {
    loading = true;
    mark("refresh:start");
    try {
      await ensureSupabase();
      const { data } = await supabaseClient.auth.getSession();
      token = data?.session?.access_token || "";
      email = data?.session?.user?.email || "";
      authChecked = true;
      if (!token) {
        access = [];
        selectedOrgId = "";
        platformAdmin = false;
        profile = null;
        pageInfo = null;
        setShellState();
        loading = false;
        render();
        return;
      }
      const dash = await call("get_user_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
      platformAdmin = Boolean(dash.platform_admin);
      access = arr(dash.access);
      if (!access.length) throw new Error("No organization access found for this account.");
      if (!selectedOrgId || !access.some((row) => String(row.organization_id) === String(selectedOrgId))) selectedOrgId = access[0].organization_id;
      setShellState();
      const prof = await call("member_get_my_profile", { organization_id: selectedOrgId });
      profile = prof.profile || null;
      pageInfo = prof.page || null;
      setShellState();
      message = `Version ${VERSION}`;
      messageKind = "";
      loadedOnce = true;
    } catch (error) {
      message = error.message || String(error);
      messageKind = "warn";
    } finally {
      loading = false;
      render();
      mark("refresh:done");
    }
  }

  function neutralCss() {
    return `#${ROOT_IDS[0]},#${ROOT_IDS[1]},#${ROOT_IDS[2]}{font-family:Arial,Helvetica,sans-serif;max-width:1060px;margin:24px auto;padding:0 18px;color:#172033;box-sizing:border-box} .profile-card{background:#fff;border:1px solid #d9e0ea;border-radius:20px;padding:22px;box-shadow:0 14px 42px rgba(23,32,51,.08)} .profile-login-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px}.profile-login-grid input{min-height:44px;border:1px solid #c7d2e2;border-radius:12px;padding:10px}.profile-btn{border:0;border-radius:999px;background:#1f4f82;color:#fff;font-weight:900;padding:10px 15px;cursor:pointer}@media(max-width:720px){.profile-login-grid{grid-template-columns:1fr}.profile-btn{width:100%}}`;
  }

  function fullCss(cfg) {
    return `
      .profile-wrap{${cssVars(cfg)}max-width:var(--profile-page-width);margin:24px auto 30px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--profile-text);box-sizing:border-box}.profile-wrap *{box-sizing:border-box}
      .profile-card{background:rgba(255,255,255,.96);border:1px solid var(--profile-border);border-radius:var(--profile-radius);box-shadow:var(--profile-shadow);padding:22px;margin:16px 0}.profile-hero{background:linear-gradient(135deg,var(--profile-primary),${rgba(cfg.primary,.78)});color:#fff}.profile-hero h1{margin:10px 0 8px;font-size:clamp(32px,4vw,48px);color:#fff;letter-spacing:-.04em}.profile-hero p{margin:0;color:rgba(255,255,255,.9);line-height:1.45}.profile-eyebrow{display:inline-flex;border-radius:999px;background:rgba(255,255,255,.16);padding:6px 10px;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.profile-message{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.15);font-weight:900}.profile-message.ok{background:rgba(16,185,129,.18)}.profile-message.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}
      .profile-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.7fr);gap:16px}.profile-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.profile-name-grid{display:grid;grid-template-columns:1.1fr .8fr 1.1fr .55fr;gap:14px;align-items:start}.phone-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.profile-address-grid{display:grid;grid-template-columns:1.4fr .7fr .5fr;gap:12px}.profile-emergency-grid{display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:14px}.profile-subhead{margin:20px 0 10px;font-size:20px;letter-spacing:-.02em}.profile-textable{display:flex;gap:7px;align-items:center;margin-top:8px;font-size:12px;font-weight:850;color:var(--profile-muted)}.profile-field{display:grid;gap:6px;font-weight:850}.profile-field span{font-size:13px}.profile-field input,.profile-field select{width:100%;min-height:44px;border:1px solid var(--profile-border);border-radius:14px;padding:10px 12px;font:inherit;color:var(--profile-text);background:#fff}.profile-field input[readonly]{background:#f8fafc;color:var(--profile-muted)}.profile-field small{font-weight:650;color:var(--profile-muted);line-height:1.35}.profile-readonly{background:var(--profile-soft);border:1px solid var(--profile-border);border-radius:16px;padding:13px 14px}.profile-readonly strong{color:var(--profile-primary)}
      .profile-photo-card{display:grid;grid-template-columns:140px minmax(0,1fr);gap:18px;align-items:center}.profile-photo-preview{width:128px;height:128px;border-radius:24px;background:linear-gradient(135deg,var(--profile-primary),${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--profile-border);box-shadow:0 12px 28px ${rgba(cfg.primary,.16)}}.profile-photo-preview img{width:100%;height:100%;object-fit:cover}.profile-photo-preview span{font-size:38px;font-weight:950}.profile-drop{border:1px dashed var(--profile-border);border-radius:18px;background:var(--profile-soft);padding:18px;text-align:center;min-height:128px;display:grid;align-content:center;gap:8px}.profile-drop.dragover{box-shadow:0 0 0 3px var(--profile-strong-soft);border-color:var(--profile-primary)}.profile-drop strong{color:var(--profile-primary)}.profile-actions,.profile-phone-grid{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.profile-btn{border:0;border-radius:999px;background:var(--profile-primary);color:#fff;font-weight:950;padding:11px 16px;cursor:pointer}.profile-btn.secondary{background:var(--profile-strong-soft);color:var(--profile-primary)}.profile-btn.danger{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.profile-btn:disabled{opacity:.58;cursor:not-allowed}.profile-phone-grid{align-items:flex-end}.profile-primary-pick{display:flex;gap:7px;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--profile-border);border-radius:14px;background:var(--profile-soft);font-weight:900;color:var(--profile-primary)}.profile-summary-list{display:grid;gap:8px}.profile-summary-list div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--profile-border);padding-bottom:8px}.profile-summary-list span{color:var(--profile-muted);font-weight:750}.profile-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font:12px/1.45 Consolas,Monaco,monospace;max-height:260px;overflow:auto;display:${DEBUG ? "block" : "none"}}
      @media(max-width:1000px){.profile-name-grid,.phone-grid-3,.profile-emergency-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){.profile-grid,.profile-form-grid{grid-template-columns:1fr}.profile-photo-card{grid-template-columns:1fr}.profile-photo-preview{margin:auto}.profile-address-grid{grid-template-columns:1fr}}@media(max-width:640px){.profile-name-grid,.phone-grid-3,.profile-emergency-grid{grid-template-columns:1fr}.profile-btn{width:100%}.profile-phone-grid{display:grid;grid-template-columns:1fr}}
    `;
  }

  function initialsFromProfile() {
    const name = clean(profile?.display_name || email || "User");
    return name.split(/\s+/).filter(Boolean).slice(0,2).map((p) => p.charAt(0)).join("").toUpperCase() || "U";
  }

  function renderLogin(root) {
    root.style.visibility = "visible";
    root.innerHTML = `<style>${neutralCss()}</style><div class="profile-card"><h1>Login required</h1><p>Use your SyncEtc login to update your profile.</p><div class="profile-login-grid"><input id="profile-login-email" type="email" placeholder="Email" autocomplete="username"><input id="profile-login-password" type="password" placeholder="Password" autocomplete="current-password"><button id="profile-login-submit" class="profile-btn" type="button">Log in</button></div>${messageKind ? `<p><strong>${esc(message)}</strong></p>` : ""}</div>`;
    $("profile-login-submit")?.addEventListener("click", async () => {
      try {
        const loginEmail = clean($("profile-login-email")?.value).toLowerCase();
        const password = $("profile-login-password")?.value || "";
        const client = await ensureSupabase();
        const { error } = await client.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        await refresh();
      } catch (error) { setMessage(error.message || String(error), "warn"); }
    });
  }

  function renderStyleError(root, errorText) {
    root.style.visibility = "visible";
    root.innerHTML = `<div style="max-width:1060px;margin:32px auto;padding:24px;border:4px solid #b91c1c;border-radius:18px;background:#fff;color:#b91c1c;font:900 28px/1.25 Arial,Helvetica,sans-serif;">STYLE CONFIGURATION ERROR<br><small style="font-size:16px;color:#7f1d1d;">${esc(errorText)}</small></div>`;
  }

  function render() {
    const root = rootEl();
    if (!authChecked) { root.style.visibility = "hidden"; return; }
    if (!token) { renderLogin(root); return; }
    const row = selectedAccess();
    if (!row) {
      root.style.visibility = "visible";
      root.innerHTML = `<style>${neutralCss()}</style><div class="profile-card"><h1>No organization access found</h1><p>Your login is valid, but this account is not linked to an active organization profile.</p></div>`;
      return;
    }
    let cfg;
    try { cfg = styleConfig(row); } catch (error) { renderStyleError(root, error.message || String(error)); return; }
    if (loading && !loadedOnce) { root.style.visibility = "hidden"; return; }
    if (!profile) {
      root.style.visibility = "visible";
      root.innerHTML = `<style>${fullCss(cfg)}</style><main class="profile-wrap"><section class="profile-card profile-hero"><span class="profile-eyebrow">My Profile</span><h1>My Profile</h1><p>${esc(message || "Profile could not be loaded.")}</p></section></main>`;
      return;
    }

    const photo = clean(profile.photo_url);
    const roleText = arr(profile.role_labels).join(", ") || arr(profile.role_keys).join(", ") || "User";
    const emailReadOnly = clean(profile.primary_email || profile.email || email);
    const messageClass = messageKind ? ` ${messageKind}` : "";
    root.style.visibility = "visible";
    root.innerHTML = `<style>${fullCss(cfg)}</style><main class="profile-wrap"><section class="profile-card profile-hero"><span class="profile-eyebrow">My Profile</span><h1>My Profile</h1><p>Update your contact information, emergency contact, and profile photo. Membership and access settings are managed separately.</p><div class="profile-message${messageClass}">${esc(message)}</div></section>
      <section class="profile-card"><h2>Contact Information</h2>
        <div class="profile-name-grid">
          <label class="profile-field"><span>Preferred first name</span><input id="profile-preferred" value="${esc(profile.preferred_first_name)}"></label>
          <label class="profile-field"><span>Middle name / initial</span><input id="profile-middle" value="${esc(profile.middle_name)}"></label>
          <label class="profile-field"><span>Last name</span><input value="${esc(profile.last_name)}" readonly><small>Contact your organization to change your last name.</small></label>
          <label class="profile-field"><span>Suffix</span><input id="profile-suffix" value="${esc(profile.suffix)}" placeholder="Jr., Sr., III"></label>
        </div>
        <div class="profile-form-grid phone-grid-3" style="margin-top:14px;">${phoneField("mobile","Mobile phone",profile.mobile_phone)}${phoneField("home","Home phone",profile.home_phone)}${phoneField("work","Work phone",profile.work_phone)}</div>
        <div class="profile-form-grid" style="margin-top:14px;"><label class="profile-field"><span>Street address</span><input id="profile-address1" value="${esc(profile.address_1)}"></label><label class="profile-field"><span>Address line 2</span><input id="profile-address2" value="${esc(profile.address_2)}"></label></div>
        <div class="profile-address-grid" style="margin-top:14px;"><label class="profile-field"><span>City</span><input id="profile-city" value="${esc(profile.city)}"></label><label class="profile-field"><span>State</span><input id="profile-state" value="${esc(profile.state)}"></label><label class="profile-field"><span>Zip</span><input id="profile-zip" value="${esc(profile.zip)}"></label></div>
        <h3 class="profile-subhead">Emergency contact</h3>
        <div class="profile-emergency-grid"><label class="profile-field"><span>Name</span><input id="profile-emergency-name" value="${esc(profile.emergency_contact_name)}"></label><label class="profile-field"><span>Relationship</span><input id="profile-emergency-relationship" value="${esc(profile.emergency_contact_relationship)}" placeholder="Spouse, parent, friend…"></label><label class="profile-field"><span>Phone</span><input id="profile-emergency-phone" value="${esc(profile.emergency_contact_phone)}" inputmode="tel"></label></div>
        <div class="profile-actions" style="margin-top:18px;"><button id="profile-save" class="profile-btn" type="button">Update Profile</button><button id="profile-refresh" class="profile-btn secondary" type="button">Refresh</button></div>
      </section>
      <section class="profile-grid">
        <div class="profile-card profile-photo-card"><div class="profile-photo-preview">${photo ? `<img src="${esc(photo)}" alt="${esc(profile.display_name || "Profile photo")}">` : `<span>${esc(initialsFromProfile())}</span>`}</div><div id="profile-photo-drop" class="profile-drop"><strong>Change profile photo</strong><p>Drag one photo here or click to choose a file.</p><small>JPG, PNG, or WebP under 5 MB. Photos save immediately.</small><div class="profile-actions"><button id="profile-photo-choose" class="profile-btn secondary" type="button">Choose photo</button>${photo ? `<button id="profile-photo-remove" class="profile-btn danger" type="button">Remove photo</button>` : ""}<input id="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div></div>
        <div class="profile-card"><h2>Account email</h2><label class="profile-field"><span>Current login email</span><input value="${esc(emailReadOnly)}" readonly><small>Changing your login email requires confirmation.</small></label><div class="profile-actions" style="margin-top:12px;"><input id="profile-new-email" type="email" placeholder="New email address" style="flex:1;min-height:44px;border:1px solid var(--profile-border);border-radius:14px;padding:10px 12px;"><button id="profile-email-change" class="profile-btn" type="button">Request email change</button></div></div>
      </section>
      <section class="profile-card"><h2>Membership summary</h2><p class="profile-readonly">These fields are read-only. Ask your organization administrator if they are wrong.</p><div class="profile-summary-list"><div><strong>Status</strong><span>${esc(profile.lifecycle_status_label || profile.lifecycle_status_key || "")}</span></div><div><strong>Membership class</strong><span>${esc(profile.membership_class_label || profile.membership_class_key || "")}</span></div><div><strong>Application/onboarding stage</strong><span>${esc(profile.application_stage_label || profile.application_stage_key || "")}</span></div><div><strong>Roles</strong><span>${esc(roleText)}</span></div><div><strong>Member number</strong><span>${esc(profile.member_number || "")}</span></div><div><strong>Title/position</strong><span>${esc(profile.title || "")}</span></div></div></section><pre class="profile-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></main>`;
    bindFormEvents();
  }

  function phoneField(id, label, value) {
    const checked = key(profile?.primary_phone_type || "mobile") === id ? "checked" : "";
    const textCapable = Boolean(profile?.mobile_can_text || profile?.can_text_mobile || profile?.sms_ok);
    const textOption = id === "mobile" ? `<label class="profile-textable"><input id="profile-mobile-can-text" type="checkbox" ${textCapable ? "checked" : ""}> Can receive texts</label>` : "";
    return `<div class="profile-phone-grid"><label class="profile-field" style="flex:1;"><span>${esc(label)}</span><input id="profile-${id}-phone" value="${esc(value)}" inputmode="tel">${textOption}</label><label class="profile-primary-pick"><input type="radio" name="profile-primary-phone" value="${esc(id)}" ${checked}> Preferred</label></div>`;
  }

  function bindFormEvents() {
    ["profile-preferred","profile-middle","profile-suffix","profile-mobile-phone","profile-home-phone","profile-work-phone","profile-address1","profile-address2","profile-city","profile-state","profile-zip","profile-emergency-name","profile-emergency-relationship","profile-emergency-phone"].forEach((id) => $(id)?.addEventListener("input", () => setDirty(true)));
    document.querySelectorAll("input[name='profile-primary-phone']").forEach((el) => el.addEventListener("change", () => setDirty(true)));
    $("profile-mobile-can-text")?.addEventListener("change", () => setDirty(true));
    $("profile-save")?.addEventListener("click", () => runButton("profile-save", "Saving…", saveProfile));
    $("profile-refresh")?.addEventListener("click", () => { if (!dirty || confirm("Discard unsaved changes and refresh?") ) { dirty = false; refresh(); } });
    $("profile-photo-choose")?.addEventListener("click", () => $("profile-photo-input")?.click());
    $("profile-photo-input")?.addEventListener("change", (event) => { const file = event.target.files?.[0]; if (file) runButton("profile-photo-choose", "Uploading…", () => uploadPhoto(file)); event.target.value = ""; });
    $("profile-photo-remove")?.addEventListener("click", () => runButton("profile-photo-remove", "Removing…", removePhoto));
    const drop = $("profile-photo-drop");
    if (drop) {
      drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("dragover"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
      drop.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("dragover"); const file = event.dataTransfer?.files?.[0]; if (file) runButton("profile-photo-choose", "Uploading…", () => uploadPhoto(file)); });
    }
    $("profile-email-change")?.addEventListener("click", () => runButton("profile-email-change", "Requesting…", requestEmailChange));
  }

  async function runButton(id, label, fn) {
    const btn = $(id);
    const old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = label; }
    try { await fn(); }
    catch (error) { setMessage(error.message || String(error), "warn"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function selectedPrimaryPhoneType() { return clean(document.querySelector("input[name='profile-primary-phone']:checked")?.value || "mobile"); }
  async function saveProfile() {
    const payload = {
      organization_id: selectedOrgId,
      preferred_first_name: clean($("profile-preferred")?.value),
      middle_name: clean($("profile-middle")?.value),
      suffix: clean($("profile-suffix")?.value),
      mobile_phone: clean($("profile-mobile-phone")?.value),
      home_phone: clean($("profile-home-phone")?.value),
      work_phone: clean($("profile-work-phone")?.value),
      primary_phone_type: selectedPrimaryPhoneType(),
      mobile_can_text: Boolean($("profile-mobile-can-text")?.checked),
      address_1: clean($("profile-address1")?.value),
      address_2: clean($("profile-address2")?.value),
      city: clean($("profile-city")?.value),
      state: clean($("profile-state")?.value),
      zip: clean($("profile-zip")?.value),
      emergency_contact_name: clean($("profile-emergency-name")?.value),
      emergency_contact_relationship: clean($("profile-emergency-relationship")?.value),
      emergency_contact_phone: clean($("profile-emergency-phone")?.value),
    };
    const res = await call("member_save_my_profile", payload);
    profile = res.profile || profile;
    pageInfo = res.page || pageInfo;
    dirty = false;
    setMessage("Profile saved.", "ok");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read selected photo."));
      reader.readAsDataURL(file);
    });
  }
  async function uploadPhoto(file) {
    if (!file) throw new Error("Choose a photo first.");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Use an image under 5 MB.");
    const dataUrl = await readFileAsDataUrl(file);
    const res = await call("member_upload_profile_photo", { organization_id: selectedOrgId, file_name: file.name, content_type: file.type, data_url: dataUrl });
    profile = res.profile || profile;
    setMessage("Photo saved.", "ok");
  }
  async function removePhoto() {
    if (!confirm("Remove your profile photo?")) return;
    const res = await call("member_remove_profile_photo", { organization_id: selectedOrgId });
    profile = res.profile || profile;
    setMessage("Photo removed.", "ok");
  }
  async function requestEmailChange() {
    const newEmail = clean($("profile-new-email")?.value).toLowerCase();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Enter a valid new email address.");
    if (!confirm(`Request login email change to ${newEmail}?`)) return;
    const client = await ensureSupabase();
    const { error } = await client.auth.updateUser({ email: newEmail });
    if (error) throw error;
    try { await call("member_request_email_change", { organization_id: selectedOrgId, new_email: newEmail, redirect_to: `${location.origin}/my-profile` }); } catch {}
    setMessage("Email change requested. Check the new email address for confirmation before using it to log in.", "ok");
  }

  window.addEventListener("beforeunload", (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("syncetc:portal-organization-change", (event) => {
    const next = clean(event.detail?.organization_id || event.detail?.organizationId);
    if (next && next !== selectedOrgId) { selectedOrgId = next; profile = null; loadedOnce = false; refresh(); }
  });
  window.addEventListener("syncetc:portal-auth-changed", () => { loadedOnce = false; refresh(); });

  async function boot() {
    rootEl().style.visibility = "hidden";
    await refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
