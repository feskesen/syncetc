// USER-PAGE-roster-current.js
// Internal Version: 2026-06-07-021-S
// Purpose: Logged-in user-facing organization roster. Read-only, organization-branded, privacy-filtered member directory.

(function () {
  "use strict";

  const VERSION = "2026-06-07-021-S";
  const ROOT_IDS = ["syncetc-user-roster-root", "syncetc-member-roster-root"];
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const DEBUG = new URLSearchParams(window.location.search).has("syncetc_debug") || new URLSearchParams(window.location.search).has("debug");
  const DIAG_START = (window.performance && performance.now) ? performance.now() : Date.now();
  const diagSteps = [];
  let firstVisibleAt = null;
  function nowMs() { return Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - DIAG_START); }
  function diag(step, detail = "") { if (!DEBUG) return; diagSteps.push({ ms: nowMs(), step, detail: String(detail || "") }); try { console.log(`[SyncEtc Roster Diagnostics ${VERSION}] ${step}`, detail || ""); } catch {} }

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let platformAdmin = false;
  let roster = [];
  let summary = { total: 0, membership_classes: {} };
  let pageConfig = null;
  let expanded = new Set();
  let searchDraft = "";
  let rosterFilter = "all";
  let searchTerm = "";
  let searchTimer = null;
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let backend = null;
  let authChecked = false;
  let rootRevealed = false;
  let refreshPromise = null;
  let initialRefreshComplete = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  const emailNorm = (v) => clean(v).toLowerCase();

  function rootEl() {
    let root = ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean);
    if (!root) { root = document.createElement("div"); root.id = ROOT_IDS[0]; document.body.appendChild(root); }
    if (!rootRevealed) { root.style.visibility = "hidden"; root.setAttribute("data-syncetc-roster-held", "true"); }
    return root;
  }

  function holdRoot(reason) {
    const root = rootEl();
    if (root && !rootRevealed) { root.style.visibility = "hidden"; root.setAttribute("data-syncetc-roster-held", reason || "true"); }
    diag("render:held", reason || "waiting");
  }

  function revealRoot() {
    const root = rootEl();
    if (!root) return;
    if (!rootRevealed) {
      rootRevealed = true;
      root.style.visibility = "visible";
      root.removeAttribute("data-syncetc-roster-held");
      diag("root:revealed");
    }
  }
  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }

  function loadScript(src) {
    diag("loadScript:start", src);
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { diag("loadScript:cached", src); return resolve(); }
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

  function hexToRgb(hex) {
    const c = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(c)) return { r:31,g:79,b:130 };
    return { r:parseInt(c.slice(0,2),16), g:parseInt(c.slice(2,4),16), b:parseInt(c.slice(4,6),16) };
  }
  function rgba(hex, a) { const r = hexToRgb(hex); return `rgba(${r.r}, ${r.g}, ${r.b}, ${a})`; }
  function getText(source, key, fallback) { const v = obj(source)[key]; return typeof v === "string" && v.trim() ? v.trim() : fallback; }

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
    return { primary, secondary, surface, text, muted: rgba(text,.68), border: rgba(primary,.16), soft: rgba(primary,.08), strongSoft: rgba(primary,.14), shadow: `0 14px 42px ${rgba(primary,.14)}`, radius: corners === "sharp" ? "8px" : corners === "pill" ? "30px" : "22px", pageWidth: width === "narrow" ? "900px" : width === "normal" ? "1060px" : "1180px" };
  }
  function cssVars(cfg) { return `--roster-primary:${cfg.primary};--roster-secondary:${cfg.secondary};--roster-surface:${cfg.surface};--roster-text:${cfg.text};--roster-muted:${cfg.muted};--roster-border:${cfg.border};--roster-soft:${cfg.soft};--roster-strong-soft:${cfg.strongSoft};--roster-shadow:${cfg.shadow};--roster-radius:${cfg.radius};--roster-page-width:${cfg.pageWidth};`; }
  function hasRosterStyle(row) {
    const profile = obj(row?.style_profile);
    const colors = obj(profile.colors_json);
    return Boolean(row && profile && Object.keys(profile).length && colors && Object.keys(colors).length);
  }

  function setShellState() {
    const row = selectedAccess();
    diag("setShellState", `org=${row?.organization_key || "none"} style=${hasRosterStyle(row) ? "yes" : "no"} access=${access.length}`);
    window.SyncEtcPortalShell?.setState?.({
      authenticated: Boolean(token),
      email,
      mode: "user",
      organizationName: row?.organization_name || "",
      organizationKey: row?.organization_key || "",
      organizationId: row?.organization_id || "",
      selectedOrganizationId: selectedOrgId || row?.organization_id || "",
      organizations: access.map((a) => ({ id: a.organization_id, name: a.organization_name, key: a.organization_key })),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
      platformAdmin,
    });
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function shouldWaitForSession() { try { return window.sessionStorage.getItem("syncetc_just_logged_in") === "1"; } catch { return false; } }
  function clearJustLoggedIn() { try { window.sessionStorage.removeItem("syncetc_just_logged_in"); } catch {} }
  async function getStableSession() {
    diag("getStableSession:start", shouldWaitForSession() ? "just_logged_in" : "normal");
    const attempts = shouldWaitForSession() ? 14 : 3;
    for (let i = 0; i < attempts; i += 1) {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.access_token) { diag("getStableSession:done", `logged in as ${data.session.user?.email || "unknown"}`); clearJustLoggedIn(); return data.session; }
      if (i < attempts - 1) await sleep(150);
    }
    diag("getStableSession:done", "no session");
    clearJustLoggedIn();
    return null;
  }

  async function doRefreshAuth() {
    diag("refreshAuth:start");
    await ensureSupabase();
    const session = await getStableSession();
    token = session?.access_token || "";
    email = session?.user?.email || "";
    if (!token) { access = []; selectedOrgId = ""; platformAdmin = false; roster = []; summary = { total: 0, membership_classes: {} }; pageConfig = null; }
    else { try { await loadAccessAndRoster(); } catch (e) { backend = { ok:false, message:e.message || String(e) }; authChecked = true; initialRefreshComplete = true; setShellState(); setMessage(e.message || String(e), "warn"); return; } }
    authChecked = true;
    initialRefreshComplete = true;
    diag("refreshAuth:done", token ? `logged in as ${email}` : "logged out");
    setShellState();
    render();
  }

  async function refreshAuth(force = false) {
    if (refreshPromise && !force) {
      diag("refreshAuth:in-flight", "joining existing refresh");
      return refreshPromise;
    }
    refreshPromise = doRefreshAuth().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function login() {
    await ensureSupabase();
    const e = emailNorm($("roster-email")?.value);
    const p = $("roster-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
    await refreshAuth(true);
    setMessage(`Logged in as ${e}`, "ok");
  }

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    token = ""; email = ""; access = []; selectedOrgId = ""; roster = []; expanded = new Set(); authChecked = true; initialRefreshComplete = true;
    setShellState(); render();
  }

  async function resetPassword() {
    await ensureSupabase();
    const e = emailNorm($("roster-email")?.value || email);
    if (!e) throw new Error("Enter your email first.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/password-reset` });
    if (error) throw error;
    setMessage("Password reset email requested.", "ok");
  }

  async function call(action, payload = {}) {
    if (!token) throw new Error("Log in first.");
    const t0 = nowMs();
    diag("call:start", action);
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    diag("call:response", `${action} HTTP ${res.status} in ${nowMs() - t0}ms`);
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function loadAccessAndRoster() {
    diag("loadAccessAndRoster:start", selectedOrgId || "auto");
    const dash = await call("get_user_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
    platformAdmin = Boolean(dash.platform_admin);
    access = dash.access || [];
    if (!selectedOrgId && access[0]) selectedOrgId = String(access[0].organization_id);
    setShellState();
    const row = selectedAccess();
    if (row && obj(row.capabilities).can_view_roster) await loadRoster();
    else { roster = []; summary = { total: 0, membership_classes: {} }; pageConfig = null; }
    diag("loadAccessAndRoster:done", `org=${selectedAccess()?.organization_key || "none"} roster=${roster.length}`);
  }

  async function loadRoster() {
    if (!selectedOrgId) return;
    diag("loadRoster:start", selectedOrgId);
    const res = await call("organization_list_roster", { organization_id: selectedOrgId });
    roster = res.people || [];
    summary = res.summary || { total: roster.length, membership_classes: {} };
    pageConfig = res.page || null;
    diag("loadRoster:done", `${roster.length} people`);
  }

  async function runButton(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function loginCard() {
    if (!authChecked) return `<div class="roster-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></div>`;
    return `<div class="roster-card"><h2>Login required</h2><p>This roster contains private organization information. Log in with your organization account.</p><div class="roster-login"><input id="roster-email" type="email" placeholder="Email"><input id="roster-password" type="password" placeholder="Password"><button id="roster-login" class="roster-btn">Log in</button><button id="roster-reset" class="roster-btn secondary">Forgot password?</button></div></div>`;
  }

  function rowMatchesFilter(row) {
    const filter = clean(rosterFilter || "all").toLowerCase();
    if (filter === "all" || !filter) return true;
    if (filter.startsWith("class:")) return clean(row.membership_class_key || row.membership_class_label).toLowerCase() === filter.slice(6);
    if (filter === "board") return arr(row.role_keys).map(clean).includes("board-member") || /board|president|treas|secretary|officer/i.test(clean(row.title));
    if (filter === "cfi" || filter === "ifr" || filter === "night") return arr(row.aviation_pills).map((pill) => clean(pill).toLowerCase()).includes(filter);
    return true;
  }

  function filteredRows() {
    const q = clean(searchTerm).toLowerCase();
    return roster.filter((r) => (!q || clean(r.search_text).toLowerCase().includes(q)) && rowMatchesFilter(r));
  }

  function visibleSummary(rows) {
    const counts = {};
    rows.forEach((r) => { const label = clean(r.membership_class_label || "Unclassified"); counts[label] = (counts[label] || 0) + 1; });
    return counts;
  }


  function renderFilters() {
    const classes = Array.from(new Map(roster.map((r) => [clean(r.membership_class_key || r.membership_class_label).toLowerCase(), clean(r.membership_class_label || r.membership_class_key)]).filter(([k]) => k)).entries()).sort((a,b) => a[1].localeCompare(b[1]));
    const hasBoard = roster.some((r) => arr(r.role_keys).map(clean).includes("board-member") || /board|president|treas|secretary|officer/i.test(clean(r.title)));
    const pills = Array.from(new Set(roster.flatMap((r) => arr(r.aviation_pills).map((pill) => clean(pill).toUpperCase())).filter(Boolean))).sort();
    const filters = [["all", "All"]]
      .concat(classes.map(([k,label]) => [`class:${k}`, label]))
      .concat(hasBoard ? [["board", "Board / Officers"]] : [])
      .concat(pills.map((pill) => [pill.toLowerCase(), pill]));
    return `<div class="roster-filter-row">${filters.map(([value,label]) => `<button type="button" class="roster-filter ${rosterFilter === value ? "active" : ""}" data-roster-filter="${esc(value)}">${esc(label)}</button>`).join("")}</div>`;
  }

  function telHref(phone) { const n = clean(phone).replace(/[^0-9+]/g, ""); return n ? `tel:${esc(n)}` : "#"; }
  function mailHref(email) { return clean(email) ? `mailto:${esc(email)}` : "#"; }
  function initials(name) { return clean(name).split(" ").filter(Boolean).slice(0,2).map((p) => p[0]).join("").toUpperCase() || "?"; }
  function formatDate(v) { if (!clean(v)) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? clean(v).slice(0,10) : d.toLocaleDateString(); }

  function classPill(label) { return clean(label) ? `<span class="roster-type-pill">${esc(label)}</span>` : ""; }
  function titlePill(title) { return clean(title) ? `<span class="roster-title-pill">${esc(title)}</span>` : ""; }
  function aviationPills(row) { return arr(row.aviation_pills).map((p) => `<span class="roster-aviation-pill">${esc(p)}</span>`).join(" "); }

  function renderSummary(rows) {
    const counts = visibleSummary(rows);
    const pills = Object.entries(counts).sort((a,b) => a[0].localeCompare(b[0])).map(([label,count]) => `<span class="roster-summary-pill"><strong>${esc(count)}</strong> ${esc(label)}</span>`).join("");
    return `<div class="roster-summary-bar"><span class="roster-summary-pill"><strong>${esc(rows.length)}</strong> Active Roster</span>${pills}<button id="roster-open-all" class="roster-toggle-btn" type="button">Open all</button><button id="roster-close-all" class="roster-toggle-btn" type="button">Close all</button><button id="roster-export" class="roster-toggle-btn" type="button">Export for Excel</button><button id="roster-print" class="roster-print-btn" type="button">Printable roster</button></div><div class="roster-export-help"><strong>Export for Excel:</strong> downloads a tab-separated spreadsheet file. Excel opens it like a CSV, but tabs keep names, addresses, phone numbers, and emails in cleaner columns. You can also open the file and copy/paste rows directly into Excel.</div>`;
  }

  function rowDetails(row) {
    const address = obj(row.address);
    const fullAddress = clean(address.full_address);
    return `<div class="roster-row-details-inner">
      <div class="roster-detail-block"><h3>Contact</h3>${row.phone ? `<p><strong>Phone:</strong> <a href="${telHref(row.phone)}">${esc(row.phone)}</a></p>` : `<p class="muted">No phone shown.</p>`}${row.email ? `<p><strong>Email:</strong> <a href="${mailHref(row.email)}">${esc(row.email)}</a></p>` : `<p class="muted">No email shown.</p>`}</div>
      <div class="roster-detail-block"><h3>Address</h3>${fullAddress ? `<p>${esc(address.address1)}</p>${address.address2 ? `<p>${esc(address.address2)}</p>` : ""}<p>${esc([address.city, address.state].filter(Boolean).join(", "))} ${esc(address.zip || "")}</p>` : `<p class="muted">No address shown.</p>`}${row.joined_at ? `<p><strong>Join date:</strong> ${esc(formatDate(row.joined_at))}</p>` : ""}${row.member_number ? `<p><strong>Member #:</strong> ${esc(row.member_number)}</p>` : ""}</div>
      <div class="roster-photo-box">${row.photo_url ? `<img src="${esc(row.photo_url)}" alt="${esc(row.display_name)}">` : `<div class="roster-photo-placeholder">${esc(initials(row.display_name))}</div>`}</div>
    </div>`;
  }

  function renderRows(rows) {
    if (!rows.length) return `<div class="roster-empty">No roster entries match your search.</div>`;
    return rows.map((row) => {
      const id = clean(row.membership_id || row.person_id);
      const open = expanded.has(id);
      return `<div class="roster-row ${open ? "open" : ""}" data-id="${esc(id)}">
        <button class="roster-row-main" type="button" data-roster-toggle="${esc(id)}" aria-expanded="${open ? "true" : "false"}">
          <span class="roster-chevron">${open ? "▾" : "▸"}</span>
          <span class="roster-name-cell"><strong>${esc(row.display_name)}</strong>${titlePill(row.title)}</span>
          <span class="roster-email-cell">${row.email ? esc(row.email) : ""}</span>
          <span class="roster-phone-cell">${row.phone ? esc(row.phone) : ""}</span>
          <span class="roster-pill-cell">${aviationPills(row)}</span>
          <span class="roster-class-cell">${classPill(row.membership_class_label)}</span>
        </button>
        <div class="roster-row-details">${rowDetails(row)}</div>
      </div>`;
    }).join("");
  }

  function tsvCell(v) {
    return String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
  }
  function exportForExcel() {
    const rows = filteredRows();
    const header = ["Name","Address 1","Address 2 / Apt","Full Address","City","State","Zip","Phone","Email","Membership Type","Title"];
    const tsvRows = [header.join("\t")].concat(rows.map((r) => {
      const a = obj(r.address);
      return [r.display_name, a.address1, a.address2, a.full_address, a.city, a.state, a.zip, r.phone, r.email, r.membership_class_label, r.title].map(tsvCell).join("\t");
    }));
    const blob = new Blob([tsvRows.join("\r\n")], { type:"text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const org = selectedAccess()?.organization_key || "organization";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${org}-roster.tsv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("Excel export created. The file is tab-separated so it pastes cleanly into spreadsheets.", "ok");
  }

  function printRoster() {
    const rows = filteredRows();
    const title = clean(pageConfig?.title) || "Roster";
    const org = clean(selectedAccess()?.organization_name || "Organization");
    const filterLabel = rosterFilter === "all" ? "All roster entries" : rosterFilter.replace(/^class:/, "Class: ");
    const htmlRows = rows.map((row) => {
      const a = obj(row.address);
      const address = [a.address1, a.address2, [a.city, a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join("<br>");
      return `<tr><td><strong>${esc(row.display_name)}</strong>${row.title ? `<br><small>${esc(row.title)}</small>` : ""}</td><td>${esc(row.membership_class_label || "")}</td><td>${row.phone ? esc(row.phone) : ""}</td><td>${row.email ? esc(row.email) : ""}</td><td>${address}</td></tr>`;
    }).join("");
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) { window.print(); return; }
    win.document.write(`<!doctype html><html><head><title>${esc(org)} ${esc(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111827}h1{margin:0 0 4px}p{margin:0 0 18px;color:#4b5563;font-weight:700}.meta{font-size:12px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.05em}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${esc(title)}</h1><p>${esc(org)}</p><div class="meta">${esc(rows.length)} active roster entries · ${esc(filterLabel)} · Printed ${esc(new Date().toLocaleDateString())}</div><table><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>Address</th></tr></thead><tbody>${htmlRows || `<tr><td colspan="5">No roster entries match this filter.</td></tr>`}</tbody></table></body></html>`);
    win.document.close();
    setTimeout(() => win.focus(), 100);
    setMessage("Printable roster opened.", "ok");
  }

  function renderContent() {
    if (!authChecked) return `<div class="roster-card"><h2>Checking login…</h2><p>One moment while SyncEtc checks your browser session.</p></div>`;
    if (!token) return loginCard();
    if (!access.length) return `<div class="roster-card"><h2>No organization access found</h2><p>Your login is valid, but it is not linked to an active organization affiliation.</p></div>`;
    const row = selectedAccess();
    if (!obj(row.capabilities).can_view_roster) return `<div class="roster-card"><h2>Roster unavailable</h2><p>This organization has not granted roster access to this account.</p></div>`;
    const rows = filteredRows();
    return `<div class="roster-card roster-note">Roster contains private organization information. Use only for organization purposes.</div>${renderSummary(rows)}${renderFilters()}<div class="roster-search-panel"><div class="roster-search-wrap"><input id="roster-search" type="search" value="${esc(searchDraft)}" placeholder="Search by name, phone, email, city, role, class…" aria-label="Search roster"><button id="roster-clear" class="roster-clear ${searchDraft ? "show" : ""}" type="button">×</button></div><div class="roster-search-count">Showing ${esc(rows.length)} of ${esc(roster.length)}</div></div>${roster.some((r) => arr(r.aviation_pills).length) ? `<div class="roster-legend"><span><strong>CFI</strong> = Club instructor</span><span><strong>IFR</strong> = Instrument rated</span><span><strong>NIGHT</strong> = Club night checkout</span></div>` : ""}<div class="roster-list">${renderRows(rows)}</div>`;
  }


  function rosterDiagnosticsPanel() {
    if (!DEBUG) return "";
    const row = selectedAccess();
    const visible = firstVisibleAt == null ? "not yet" : `${firstVisibleAt}ms`;
    const styleState = hasRosterStyle(row) ? "loaded" : "missing/fallback";
    const lines = diagSteps.map((d) => `${String(d.ms).padStart(6, " ")}ms  ${d.step}${d.detail ? " — " + d.detail : ""}`).join("\n");
    return `<details class="roster-card roster-debug" open><summary>Roster Diagnostics ${esc(VERSION)}</summary><pre class="roster-backend">Elapsed: ${esc(nowMs())}ms\nPath: ${esc(window.location.pathname)}\nSession: ${esc(token ? "logged in as " + email : authChecked ? "logged out" : "checking")}\nOrg: ${esc(row?.organization_key || selectedOrgId || "none")}\nStyle: ${esc(styleState)}\nVisible render: ${esc(visible)}\nRoster rows: ${esc(roster.length)}\n\nSteps:\n${esc(lines)}</pre></details>`;
  }

  function render() {
    diag("render:start", `initialRefreshComplete=${initialRefreshComplete} authChecked=${authChecked} token=${Boolean(token)} access=${access.length} roster=${roster.length}`);
    const root = rootEl(); if (!root) return;
    const styleReady = hasRosterStyle(selectedAccess());
    diag(styleReady ? "styleConfig:ready" : "styleConfig:missing", styleReady ? "organization style loaded" : "no organization style yet");
    if (refreshPromise && !styleReady) { holdRoot("waiting for active auth/access refresh"); return; }
    if (!initialRefreshComplete) { holdRoot("waiting for initial auth/access refresh"); return; }
    if (!authChecked) { holdRoot("waiting for auth check"); return; }
    if (!styleReady && (token || access.length || selectedOrgId || shouldWaitForSession())) { holdRoot("waiting for organization style"); return; }
    const cfg = styleReady ? styleConfig(selectedAccess()) : { primary: "#111827", secondary: "#f3f4f6", surface: "#ffffff", text: "#111827", muted: "rgba(17, 24, 39, .68)", border: "rgba(17, 24, 39, .16)", soft: "rgba(17, 24, 39, .06)", strongSoft: "rgba(17, 24, 39, .12)", shadow: "0 14px 42px rgba(17, 24, 39, .12)", radius: "18px", pageWidth: "1060px" };
    root.innerHTML = `<style>
      .roster-wrap{${cssVars(cfg)}max-width:var(--roster-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--roster-text);box-sizing:border-box}.roster-wrap *{box-sizing:border-box}.roster-card,.roster-shell{background:rgba(255,255,255,.95);border:1px solid var(--roster-border);border-radius:var(--roster-radius);box-shadow:var(--roster-shadow);padding:20px;margin:16px 0}.roster-hero{background:linear-gradient(135deg,var(--roster-primary),${rgba(cfg.primary,.78)});color:#fff}.roster-hero h1{margin:8px 0 6px;color:#fff;font-size:clamp(32px,4vw,48px);line-height:1.05}.roster-hero p{color:rgba(255,255,255,.9);font-weight:800}.roster-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.roster-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900;background:rgba(255,255,255,.18);color:#fff}.roster-message.ok{background:#e7f6ec;color:#14532d}.roster-message.warn{background:#fff7ec;color:#8a4d00}.roster-note{font-weight:900;color:var(--roster-primary);background:var(--roster-soft);box-shadow:none}.roster-export-note{font-size:13px;line-height:1.45;color:var(--roster-muted);box-shadow:none;background:rgba(255,255,255,.88)}.roster-export-note strong{color:var(--roster-primary)}.roster-export-help{margin:-4px 0 12px;padding:11px 14px;border:1px solid var(--roster-border);border-radius:16px;background:rgba(255,255,255,.86);color:var(--roster-muted);font-size:12px;font-weight:750;line-height:1.45}.roster-export-help strong{color:var(--roster-primary)}.roster-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:center}.roster-wrap input{width:100%;min-height:42px;border:1px solid var(--roster-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--roster-text)}.roster-btn,.roster-toggle-btn,.roster-print-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 13px;border-radius:999px;border:1px solid var(--roster-primary);background:var(--roster-primary);color:#fff;font-weight:950;cursor:pointer;text-decoration:none}.roster-btn.secondary,.roster-toggle-btn{background:#fff;color:var(--roster-primary);border-color:var(--roster-border)}.roster-btn:hover,.roster-toggle-btn:hover,.roster-print-btn:hover{filter:brightness(.94);transform:translateY(-1px)}.roster-filter-row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.roster-filter{border:1px solid var(--roster-border);background:#fff;color:var(--roster-primary);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;cursor:pointer}.roster-filter.active,.roster-filter:hover{background:var(--roster-primary);color:#fff}.roster-summary-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:16px;background:rgba(255,255,255,.9);border:1px solid var(--roster-border);border-radius:var(--roster-radius);box-shadow:0 8px 24px ${rgba(cfg.primary,.08)};margin:16px 0}.roster-summary-pill{display:inline-flex;padding:8px 12px;border-radius:999px;background:#fff;color:var(--roster-primary);border:1px solid var(--roster-border);font-size:12px;font-weight:900}.roster-summary-pill strong{margin-right:4px}.roster-print-btn{margin-left:auto}.roster-search-panel{position:sticky;top:10px;z-index:10;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:14px 0;padding:12px;border:1px solid var(--roster-border);border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 12px 28px ${rgba(cfg.primary,.12)};backdrop-filter:blur(8px)}.roster-search-wrap{position:relative}.roster-search-wrap input{border-radius:999px;padding-right:42px}.roster-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:999px;border:1px solid var(--roster-border);background:var(--roster-soft);color:var(--roster-primary);font-weight:950;display:none;cursor:pointer}.roster-clear.show{display:inline-flex;align-items:center;justify-content:center}.roster-search-count{padding:8px 12px;border-radius:999px;background:var(--roster-primary);color:#fff;font-size:12px;font-weight:950;white-space:nowrap}.roster-legend{margin:0 0 14px;padding:12px 14px;border:1px solid var(--roster-border);border-radius:16px;background:var(--roster-soft);font-size:12px;color:var(--roster-muted);font-weight:800}.roster-legend span{margin-right:16px}.roster-legend strong{color:var(--roster-primary)}.roster-list{border:1px solid var(--roster-border);border-radius:18px;overflow:hidden;background:#fff}.roster-row{border-bottom:1px solid var(--roster-border);background:#fff}.roster-row:last-child{border-bottom:none}.roster-row.open{background:linear-gradient(180deg,var(--roster-soft),rgba(255,255,255,.94))}.roster-row-main{width:100%;min-height:58px;padding:11px 14px;display:grid;grid-template-columns:24px minmax(0,1.7fr) minmax(0,2fr) minmax(0,1.25fr) minmax(120px,.9fr) minmax(110px,.85fr);gap:10px;align-items:center;border:none;background:transparent;text-align:left;cursor:pointer;font-family:inherit;color:var(--roster-text)}.roster-row-main:hover{background:var(--roster-soft)}.roster-chevron{font-weight:950;color:var(--roster-primary)}.roster-name-cell strong{font-weight:950;color:var(--roster-primary)}.roster-email-cell,.roster-phone-cell{font-size:13px;color:${rgba(cfg.primary,.86)};font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-title-pill{display:inline-flex;margin-left:7px;padding:4px 8px;border-radius:999px;background:#fff2d7;color:#8a4b00;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.roster-aviation-pill,.roster-type-pill{display:inline-flex;margin:2px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--roster-border);background:var(--roster-soft);color:var(--roster-primary)}.roster-type-pill{background:#e7f6ec;color:#14532d}.roster-row-details{display:none;padding:0 14px 14px}.roster-row.open .roster-row-details{display:block}.roster-row-details-inner{display:grid;grid-template-columns:1fr 1fr 150px;gap:16px;padding:16px;border:1px solid var(--roster-border);border-radius:16px;background:rgba(255,255,255,.92)}.roster-detail-block h3{margin:0 0 8px;color:var(--roster-primary);font-size:12px;text-transform:uppercase;letter-spacing:.05em}.roster-detail-block p{margin:4px 0;font-size:13px;font-weight:750}.roster-detail-block a{color:var(--roster-primary);font-weight:950;text-decoration:none}.muted{color:var(--roster-muted)}.roster-photo-box{display:flex;align-items:center;justify-content:center}.roster-photo-box img,.roster-photo-placeholder{width:130px;height:130px;border-radius:18px;object-fit:cover;border:1px solid var(--roster-border);box-shadow:0 8px 22px ${rgba(cfg.primary,.14)}}.roster-photo-placeholder{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--roster-primary),${rgba(cfg.primary,.74)});color:#fff;font-size:36px;font-weight:950}.roster-empty{padding:22px;text-align:center;color:var(--roster-muted);font-weight:900}.roster-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:240px;overflow:auto}@media(max-width:980px){.roster-row-main{grid-template-columns:24px minmax(0,1.5fr) minmax(0,1.5fr);grid-auto-rows:auto}.roster-phone-cell,.roster-pill-cell,.roster-class-cell{grid-column:auto}.roster-row-details-inner{grid-template-columns:1fr}.roster-print-btn{margin-left:0}.roster-login,.roster-search-panel{grid-template-columns:1fr}}@media(max-width:650px){.roster-row-main{grid-template-columns:24px minmax(0,1fr)}.roster-email-cell,.roster-phone-cell,.roster-pill-cell,.roster-class-cell{grid-column:2}.roster-summary-bar>*{width:100%;justify-content:center}.roster-wrap{padding:0 10px}}@media print{#syncetc-portal-shell,#syncetc-portal-footer,.roster-search-panel,.roster-toggle-btn,.roster-print-btn,details.roster-debug{display:none!important}.roster-wrap{max-width:none;margin:0;padding:0}.roster-card,.roster-row-details-inner,.roster-list{box-shadow:none}.roster-row-details{display:block!important}.roster-row-main{break-inside:avoid}.roster-hero{background:#fff!important;color:#000!important}.roster-hero h1,.roster-hero p{color:#000!important}}
    </style><div class="roster-wrap"><section class="roster-card roster-hero"><div class="roster-eyebrow">Roster</div><h1>${esc(clean(pageConfig?.title) || "Roster")}</h1><p>${esc(clean(pageConfig?.intro_text) || "Search, tap, or click a row to see contact details.")}</p><div class="roster-message ${esc(messageKind)}">${esc(message)}</div></section>${renderContent()}${rosterDiagnosticsPanel()}</div>`;
    if (firstVisibleAt == null) { firstVisibleAt = nowMs(); diag("root:rendered", `first visible at ${firstVisibleAt}ms`); }
    revealRoot();

    $("roster-login")?.addEventListener("click", () => runButton("roster-login", "Logging in…", login));
    $("roster-reset")?.addEventListener("click", () => runButton("roster-reset", "Sending…", resetPassword));
    $("roster-search")?.addEventListener("input", (e) => {
      searchDraft = e.target.value || "";
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTerm = searchDraft; render(); }, 300);
      $("roster-clear")?.classList.toggle("show", Boolean(searchDraft));
    });
    $("roster-clear")?.addEventListener("click", () => { searchDraft = ""; searchTerm = ""; render(); });
    document.querySelectorAll("[data-roster-filter]").forEach((btn) => btn.addEventListener("click", () => { rosterFilter = btn.getAttribute("data-roster-filter") || "all"; expanded = new Set(); render(); }));
    document.querySelectorAll("[data-roster-toggle]").forEach((btn) => btn.addEventListener("click", () => { const id = btn.getAttribute("data-roster-toggle"); if (!id) return; expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }));
    $("roster-open-all")?.addEventListener("click", () => { filteredRows().forEach((r) => expanded.add(clean(r.membership_id || r.person_id))); render(); });
    $("roster-close-all")?.addEventListener("click", () => { expanded = new Set(); render(); });
    $("roster-export")?.addEventListener("click", exportForExcel);
    $("roster-print")?.addEventListener("click", printRoster);
  }

  async function handleOrganizationChange(nextOrgId) {
    nextOrgId = String(nextOrgId || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId; roster = []; expanded = new Set(); searchDraft = ""; searchTerm = ""; rosterFilter = "all"; pageConfig = null;
    try { await loadAccessAndRoster(); setMessage("Organization loaded.", "ok"); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    render();
  }

  window.addEventListener("syncetc:portal-logout-request", () => { if (token) logout().catch((e) => setMessage(e.message || String(e), "warn")); });
  window.addEventListener("syncetc:portal-login-request", () => { render(); setTimeout(() => $("roster-email")?.focus(), 0); });
  window.addEventListener("syncetc:portal-organization-change-request", (event) => handleOrganizationChange(event.detail?.organizationId || event.detail?.organization_id));
  window.addEventListener("syncetc:portal-organization-change", (event) => handleOrganizationChange(event.detail?.organization_id || event.detail?.organizationId));
  window.addEventListener("syncetc:portal-auth-changed", () => {
    refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); });
  });

  function bootRoster() {
    diag("boot:start", window.location.pathname);
    refreshAuth().catch((e) => {
      backend = { ok:false, message:e?.message || String(e) };
      authChecked = true;
      initialRefreshComplete = true;
      try { setShellState(); } catch {}
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootRoster);
  else bootRoster();
})();
