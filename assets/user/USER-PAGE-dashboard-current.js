// USER-PAGE-dashboard-current.js
// Internal Version: 2026-06-13-110-A
// Purpose: Member/user dashboard launch pad. Shows profile action only when needed, quick links, next event, and backend-fetched METAR cards.

(function () {
  "use strict";

  const VERSION = "2026-06-13-110-A";
  const ROOT_IDS = ["syncetc-member-dashboard-root", "syncetc-user-dashboard-root"];
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  const DEBUG = new URLSearchParams(location.search).get("syncetc_debug") === "1";
  const DIAG_START = (performance && performance.now) ? performance.now() : Date.now();
  const diagSteps = [];

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let platformAdmin = false;
  let dashboard = null;
  let backend = null;
  let authChecked = false;
  let loading = false;
  let message = `Version ${VERSION}`;
  let messageKind = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];

  function nowMs() { return Math.round(((performance && performance.now) ? performance.now() : Date.now()) - DIAG_START); }
  function diag(step, detail = "") {
    if (!DEBUG) return;
    diagSteps.push({ ms: nowMs(), step, detail: String(detail || "") });
    try { console.log(`[SyncEtc member dashboard ${VERSION}] ${step}`, detail || ""); } catch {}
  }

  function rootEl() {
    let root = ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean);
    if (!root) { root = document.createElement("div"); root.id = ROOT_IDS[0]; document.body.appendChild(root); }
    return root;
  }

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

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function shouldWaitForSession() { try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; } catch { return false; } }
  function clearJustLoggedIn() { try { window.sessionStorage.removeItem("syncetc_just_logged_in"); } catch {} }
  async function getStableSession() {
    const attempts = shouldWaitForSession() ? 14 : 3;
    for (let i = 0; i < attempts; i += 1) {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.access_token) { clearJustLoggedIn(); return data.session; }
      if (i < attempts - 1) await sleep(150);
    }
    clearJustLoggedIn();
    return null;
  }

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r: 31, g: 79, b: 130 };
    return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, alpha) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${alpha})`; }
  function getText(source, field, fallback) { const v = obj(source)[field]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }

  function styleConfig(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    const spacing = obj(profile.spacing_json);
    const effects = obj(profile.effects_json);
    const layout = obj(profile.layout_json);
    const primary = getText(colors, "brand_primary", "#1f4f82");
    const secondary = getText(colors, "brand_secondary", "#eef3f8");
    const surface = getText(colors, "surface", "#ffffff");
    const text = getText(colors, "text", "#172033");
    const width = getText(spacing, "page_width", getText(layout, "default_width", "wide"));
    const corners = getText(effects, "corners", "soft");
    const radius = corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px";
    return { primary, secondary, surface, text, muted: rgba(text, .68), border: rgba(primary, .16), soft: rgba(primary, .08), shadow: `0 14px 42px ${rgba(primary, .14)}`, radius, pageWidth: width === "narrow" ? "880px" : width === "normal" ? "1040px" : "1180px" };
  }

  function cssVars(cfg) {
    return `--md-primary:${cfg.primary};--md-secondary:${cfg.secondary};--md-surface:${cfg.surface};--md-text:${cfg.text};--md-muted:${cfg.muted};--md-border:${cfg.border};--md-soft:${cfg.soft};--md-shadow:${cfg.shadow};--md-radius:${cfg.radius};--md-page-width:${cfg.pageWidth};`;
  }

  function selectedAccess() {
    const fromDash = obj(dashboard?.access);
    if (fromDash.organization_id) return fromDash;
    return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null;
  }

  function setShellState() {
    const row = selectedAccess();
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: "user",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizations: access.map((a) => ({ id: a.organization_id, name: a.organization_name, key: a.organization_key })),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
      activePageKey: "member-dashboard",
    });
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function loadDashboard() {
    loading = true;
    render();
    const payload = selectedOrgId ? { organization_id: selectedOrgId } : {};
    const res = await call("get_member_dashboard", payload);
    platformAdmin = Boolean(res.platform_admin);
    access = arr(res.access);
    dashboard = obj(res.dashboard);
    const dashOrgId = clean(obj(dashboard.access).organization_id);
    if (dashOrgId) selectedOrgId = dashOrgId;
    else if (!selectedOrgId && access[0]) selectedOrgId = String(access[0].organization_id);
    loading = false;
    setShellState();
    render();
  }

  async function refreshAuth() {
    diag("auth:start");
    await ensureSupabase();
    const session = await getStableSession();
    token = session?.access_token || "";
    email = session?.user?.email || "";
    authChecked = true;
    if (!token) { access = []; selectedOrgId = ""; platformAdmin = false; dashboard = null; backend = null; loading = false; setShellState(); render(); return; }
    try { await loadDashboard(); setMessage("Dashboard loaded.", "ok"); }
    catch (e) { loading = false; backend = { ok:false, message:e.message || String(e) }; setShellState(); setMessage(e.message || String(e), "warn"); }
  }

  async function login() {
    await ensureSupabase();
    const e = clean($("member-email")?.value).toLowerCase();
    const p = $("member-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
    await refreshAuth();
  }

  async function resetPassword() {
    await ensureSupabase();
    const e = clean($("member-email")?.value || email).toLowerCase();
    if (!e) throw new Error("Enter your email first.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested.", "ok");
  }

  async function runButton(buttonId, workingText, fn) {
    const btn = $(buttonId);
    const old = btn?.textContent || "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = workingText || "Working…"; }
      return await fn();
    } catch (e) {
      backend = { ok:false, message:e.message || String(e) };
      setMessage(e.message || String(e), "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  function fmtDateTime(value, timeZone = "America/New_York") {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return clean(value);
    try { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(d); }
    catch { return d.toLocaleString(); }
  }

  function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return clean(value);
    try { return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" }).format(d); }
    catch { return d.toLocaleDateString(); }
  }

  function portalPage(row, pageKeys) {
    const keys = Array.isArray(pageKeys) ? pageKeys.map(key) : [key(pageKeys)];
    return arr(row?.portal_pages).find((page) => keys.includes(key(page.page_key || page.template_key)) && page.show_in_nav !== false) || null;
  }
  function pagePath(page, fallback) { return clean(page?.path || (page?.page_slug ? `/${String(page.page_slug).replace(/^\/+/, "")}` : "")) || fallback; }

  function linkCard(label, subtitle, href, options = {}) {
    const disabled = options.disabled || !href || href === "#";
    const tag = disabled ? "span" : "a";
    const attrs = disabled ? "" : `href="${esc(href)}"`;
    const suffix = options.placeholder ? ` <em>(placeholder)</em>` : "";
    return `<${tag} ${attrs} class="md-link-card ${disabled ? "is-disabled" : ""}"><strong>${esc(label)}${suffix}</strong><span>${esc(subtitle || "")}</span></${tag}>`;
  }

  function quickLinks(row) {
    const caps = obj(row?.capabilities);
    const myProfile = pagePath(portalPage(row, ["my-profile", "profile"]), "/my-profile");
    const docs = pagePath(portalPage(row, ["member-documents", "documents"]), "/member-documents");
    const roster = pagePath(portalPage(row, ["roster", "member-roster"]), "/roster");
    const gallery = pagePath(portalPage(row, ["submit-gallery", "gallery-submission"]), "/submit-gallery");
    return [
      { label:"My Profile", subtitle:"Update contact details and photo", href:myProfile },
      { label:"Member Documents", subtitle:"Member-only documents and resources", href:docs, disabled: !caps.can_view_member_documents && !platformAdmin },
      { label:"Roster", subtitle:"Member directory", href:roster, disabled: !caps.can_view_roster && !platformAdmin },
      { label:"Calendar / Events", subtitle:"Open the full club calendar", href:"/calendar" },
      { label:"Submit to Gallery", subtitle:"Photos and media links", href:gallery, disabled: !caps.can_submit_gallery && !platformAdmin },
      { label:"Flight Scheduler", subtitle:"Reservations and aircraft schedule", href:"#", disabled:true, placeholder:true },
      { label:"Report Maintenance Squawk", subtitle:"Aircraft maintenance reporting", href:"#", disabled:true, placeholder:true },
      { label:"Club Forum", subtitle:"Member discussions and mentions", href:"#", disabled:true, placeholder:true },
    ];
  }

  function renderLogin() {
    return `<div class="md-card"><h2>Log in</h2><p class="md-help">Use your organization login to open your member dashboard.</p><div class="md-login-grid"><input id="member-email" type="email" placeholder="Email" autocomplete="username"><input id="member-password" type="password" placeholder="Password" autocomplete="current-password"><button id="member-login" class="md-btn" type="button">Log in</button></div><div class="md-actions"><button id="member-reset" class="md-btn secondary" type="button">Send password reset</button></div></div>`;
  }

  function renderProfileAction(summary) {
    if (!summary?.needs_update) return "";
    const missing = arr(summary.missing_labels);
    return `<a href="/my-profile" class="md-alert-card md-profile-action"><div><span class="md-eyebrow danger">Profile needs update</span><h2>Update your profile</h2><p>${missing.length ? `Missing or incomplete: ${esc(missing.join(", "))}.` : "Some required profile information needs attention."}</p></div><span class="md-btn secondary">Go to My Profile</span></a>`;
  }

  function renderNextEvent(event) {
    if (!event?.event_id) {
      return `<section class="md-card md-next-event"><span class="md-eyebrow">Calendar</span><h2>Next club event</h2><p class="md-help">No upcoming club events are currently listed.</p><a class="md-btn secondary" href="/calendar">Open full calendar</a></section>`;
    }
    const tz = clean(event.timezone || "America/New_York");
    const when = fmtDateTime(event.starts_at, tz);
    const location = clean(event.location_name || obj(event.location_json).name || obj(event.location_json).label || event.location_address);
    return `<section class="md-card md-next-event"><span class="md-eyebrow">Calendar</span><h2>Next club event</h2><div class="md-event-box"><span class="md-mini">${esc(event.event_type_label || event.category || "Club event")}</span>${event.rsvp_enabled ? `<span class="md-mini ok">RSVP open</span>` : ""}<h3>${esc(event.title || "Upcoming event")}</h3>${when ? `<p><strong>${esc(when)}</strong></p>` : ""}${location ? `<p>${esc(location)}</p>` : ""}${event.summary ? `<p class="md-help">${esc(event.summary)}</p>` : ""}<a class="md-small-link" href="/calendar">Open full calendar</a></div></section>`;
  }

  function weatherClass(cat) {
    const c = key(cat || "unknown");
    if (c === "vfr") return "vfr";
    if (c === "mvfr") return "mvfr";
    if (c === "ifr") return "ifr";
    if (c === "lifr") return "lifr";
    return "unknown";
  }

  function renderWeatherCard(w) {
    if (!w?.ok) {
      return `<article class="md-weather-card failed"><div class="md-weather-head"><div><span class="md-eyebrow danger">Weather fetch failed</span><h3>${esc(w?.station || "Station")}</h3><p>${esc(w?.label || "")}</p></div><span class="md-category unknown">Error</span></div><pre>${esc(w?.error || "No diagnostic returned.")}</pre>${w?.endpoint ? `<p class="md-help">Endpoint: ${esc(w.endpoint)}</p>` : ""}</article>`;
    }
    const details = obj(w.details);
    const raw = clean(w.raw_text || w.raw_metar || "No raw METAR returned.");
    const parts = [details.wind_text, details.visibility_text, details.ceiling_text, details.temperature_text, details.altimeter_text].map(clean).filter(Boolean);
    return `<article class="md-weather-card"><div class="md-weather-head"><div><span class="md-eyebrow">${esc(w.station)}</span><h3>${esc(w.label || w.station)}</h3></div><span class="md-category ${weatherClass(w.flight_category)}">${esc(w.flight_category || "Unknown")}</span></div><div class="md-raw">${esc(raw)}</div>${parts.length ? `<div class="md-weather-details">${parts.map((p) => `<span>${esc(p)}</span>`).join("")}</div>` : ""}<p class="md-help"><strong>Observed:</strong> ${esc(w.observed_utc || "unknown UTC")}${w.observed_local ? ` · ${esc(w.observed_local)} local` : ""}</p><p class="md-help"><strong>Last updated:</strong> ${esc(w.fetched_utc || "unknown UTC")}${w.fetched_local ? ` · ${esc(w.fetched_local)} local` : ""}${w.cache_hit ? " · cached" : ""}</p></article>`;
  }

  function renderWeather() {
    const weather = arr(dashboard?.weather);
    return `<section class="md-card md-weather-section"><div class="md-section-head"><div><span class="md-eyebrow">Airport weather</span><h2>METARs</h2></div><span class="md-mini">AviationWeather.gov</span></div><div class="md-weather-grid">${weather.length ? weather.map(renderWeatherCard).join("") : `<article class="md-weather-card failed"><h3>Weather not loaded</h3><p>No weather payload was returned by the backend.</p></article>`}</div><p class="md-disclaimer">METAR and flight category information on this dashboard is provided as a member convenience only. It is not a substitute for an official weather briefing. Always confirm conditions through official channels before flight.</p></section>`;
  }

  function renderDashboard() {
    if (!authChecked) return `<div class="md-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></div>`;
    if (!token) return renderLogin();
    if (loading && !dashboard) return `<div class="md-card"><h2>Loading dashboard…</h2><p>Please wait while SyncEtc loads your organization dashboard.</p></div>`;
    if (!access.length && !dashboard?.access) return `<div class="md-card"><h2>No organization access found</h2><p>Your login is valid, but this account is not linked to an active organization affiliation.</p></div>`;

    const row = selectedAccess() || {};
    const profileSummary = obj(dashboard?.profile_summary);
    const displayName = clean(profileSummary.first_name || profileSummary.display_name || obj(dashboard?.profile).first_name || obj(dashboard?.profile).display_name || email.split("@")[0] || "member");
    const orgName = clean(row.organization_name || "your organization");
    const links = quickLinks(row);

    return `
      <section class="md-card md-hero"><span class="md-eyebrow light">Member dashboard</span><h1>Welcome back, ${esc(displayName)}</h1><p>Your quick launch pad for ${esc(orgName)}.</p></section>
      ${renderProfileAction(profileSummary)}
      <div class="md-grid top-grid">
        <section class="md-card"><span class="md-eyebrow">Member tools</span><h2>Quick links</h2><div class="md-link-grid">${links.map((l) => linkCard(l.label, l.subtitle, l.href, l)).join("")}</div></section>
        ${renderNextEvent(obj(dashboard?.next_event))}
      </div>
      ${renderWeather()}
    `;
  }

  function diagnosticsHtml() {
    if (!DEBUG) return "";
    const lines = diagSteps.map((d) => `${String(d.ms).padStart(6," ")}ms  ${d.step}${d.detail ? " — " + d.detail : ""}`).join("\n");
    return `<details class="md-card"><summary>Dashboard diagnostics</summary><pre class="md-backend">SyncEtc Member Dashboard ${esc(VERSION)}\nEmail: ${esc(email || "none")}\nSelected org: ${esc(selectedOrgId || "none")}\nAccess rows: ${esc(access.length)}\nBackend version: ${esc(backend?.version || "none")}\nWeather cards: ${esc(arr(dashboard?.weather).length)}\n\nSteps:\n${esc(lines)}\n\nBackend result:\n${esc(JSON.stringify(backend || {}, null, 2))}</pre></details>`;
  }

  function render() {
    const root = rootEl();
    if (!root) return;
    const cfg = styleConfig(selectedAccess());
    root.innerHTML = `
      <style>
        .md-wrap{${cssVars(cfg)}max-width:var(--md-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--md-text);box-sizing:border-box}.md-wrap *{box-sizing:border-box}.md-card{background:rgba(255,255,255,.94);border:1px solid var(--md-border);border-radius:var(--md-radius);box-shadow:var(--md-shadow);padding:20px;margin:16px 0}.md-hero{background:linear-gradient(135deg,var(--md-primary),${rgba(cfg.primary,.76)});color:#fff}.md-hero h1{margin:8px 0 6px;font-size:40px;line-height:1.05;color:#fff;letter-spacing:-.03em}.md-hero p{color:rgba(255,255,255,.9);font-weight:800}.md-eyebrow{display:inline-flex;align-items:center;width:max-content;border-radius:999px;background:var(--md-soft);color:var(--md-primary);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px}.md-eyebrow.light{background:rgba(255,255,255,.16);color:#fff}.md-eyebrow.danger{background:#fee2e2;color:#991b1b}.md-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.md-link-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.md-link-card{min-height:76px;border:1px solid var(--md-border);border-radius:16px;background:#fff;color:var(--md-primary);text-decoration:none;padding:13px;display:flex;flex-direction:column;justify-content:center;gap:5px;font-weight:900}.md-link-card:hover{transform:translateY(-1px);box-shadow:0 10px 24px ${rgba(cfg.primary,.12)}}.md-link-card span{font-size:12px;color:var(--md-muted);font-weight:800}.md-link-card em{font-style:normal;font-size:11px;color:#7c5a00}.md-link-card.is-disabled{background:#f5f7fb;color:#6b7280;cursor:default}.md-link-card.is-disabled:hover{transform:none;box-shadow:none}.md-alert-card{border:1px solid #fecaca;background:#fff7f7;color:#991b1b;text-decoration:none;display:flex;align-items:center;justify-content:space-between;gap:16px}.md-alert-card h2{margin:9px 0 6px;color:#991b1b}.md-alert-card p{margin:0;color:#7f1d1d;font-weight:800}.md-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:999px;border:1px solid var(--md-primary);background:var(--md-primary);color:#fff;font-weight:950;padding:9px 15px;text-decoration:none;cursor:pointer}.md-btn.secondary{background:#fff;color:var(--md-primary)}.md-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.md-login-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center}.md-wrap input{min-height:44px;border:1px solid var(--md-border);border-radius:12px;padding:10px 12px}.md-section-head,.md-weather-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.md-mini{display:inline-flex;border-radius:999px;background:var(--md-soft);color:var(--md-primary);padding:5px 9px;font-size:11px;font-weight:950;text-transform:uppercase}.md-mini.ok{background:#dcfce7;color:#166534}.md-event-box{border:1px solid var(--md-border);border-radius:16px;padding:14px;margin-top:12px}.md-event-box h3{margin:10px 0 6px;font-size:20px;color:var(--md-primary)}.md-small-link{font-size:12px;font-weight:950;color:var(--md-primary);text-transform:uppercase;text-decoration:none}.md-weather-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}.md-weather-card{border:1px solid var(--md-border);border-radius:16px;background:#fff;padding:15px}.md-weather-card.failed{border-color:#fecaca;background:#fff7f7}.md-weather-card h3{margin:5px 0 4px;color:var(--md-primary)}.md-weather-card pre{white-space:pre-wrap;overflow:auto;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:10px;color:#991b1b;font-weight:800}.md-category{display:inline-flex;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:950;background:#e5e7eb;color:#374151}.md-category.vfr{background:#dcfce7;color:#166534}.md-category.mvfr{background:#dbeafe;color:#1d4ed8}.md-category.ifr{background:#fee2e2;color:#991b1b}.md-category.lifr{background:#f3e8ff;color:#6b21a8}.md-raw{margin-top:12px;background:#f8fafc;border:1px solid #dbe3ef;border-radius:12px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#172033}.md-weather-details{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.md-weather-details span{border-radius:999px;background:var(--md-soft);color:var(--md-primary);font-size:12px;font-weight:850;padding:5px 8px}.md-help{color:var(--md-muted);font-size:13px;line-height:1.45;font-weight:700}.md-disclaimer{margin:14px 0 0;color:var(--md-muted);font-size:12px;line-height:1.45;font-weight:800}.md-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:360px;overflow:auto}details summary{cursor:pointer;font-weight:950;color:var(--md-primary)}.md-message{display:inline-flex;margin-top:10px;border-radius:12px;padding:9px 11px;font-size:13px;font-weight:900;background:${messageKind === "ok" ? "#e7f6ec" : messageKind === "warn" ? "#fff7ec" : "rgba(255,255,255,.14)"};color:${messageKind === "ok" ? "#14532d" : messageKind === "warn" ? "#8a4d00" : "inherit"}}@media(max-width:920px){.md-grid,.md-weather-grid,.md-link-grid,.md-login-grid{grid-template-columns:1fr}.md-hero h1{font-size:32px}.md-alert-card{align-items:flex-start;flex-direction:column}}
      </style>
      <div class="md-wrap">
        ${renderDashboard()}
        <div class="md-message ${esc(messageKind)}">${esc(message)}</div>
        ${diagnosticsHtml()}
      </div>`;
    $("member-login")?.addEventListener("click", () => runButton("member-login", "Logging in…", login));
    $("member-reset")?.addEventListener("click", () => runButton("member-reset", "Sending…", resetPassword));
  }

  async function handleOrganizationChange(nextOrgId) {
    nextOrgId = String(nextOrgId || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId;
    try { await loadDashboard(); setMessage("Organization loaded.", "ok"); }
    catch (e) { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); }
  }

  window.addEventListener("syncetc:portal-auth-changed", () => { refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); }); });
  window.addEventListener("syncetc:portal-organization-change-request", (event) => { handleOrganizationChange(event.detail?.organizationId || event.detail?.organization_id); });
  window.addEventListener("syncetc:portal-organization-change", (event) => { handleOrganizationChange(event.detail?.organization_id || event.detail?.organizationId); });

  function boot() { refreshAuth().catch((e) => { backend = { ok:false, message:e?.message || String(e) }; authChecked = true; loading = false; setShellState(); render(); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
