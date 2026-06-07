// USER-PAGE-roster-current.js
// Internal Version: 2026-06-07-011-A
// Purpose: Logged-in user-facing organization roster. Read-only, organization-branded, privacy-filtered member directory.

(function () {
  "use strict";

  const VERSION = "2026-06-07-011-A";
  const ROOT_IDS = ["syncetc-user-roster-root", "syncetc-member-roster-root"];
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let token = "";
  let email = "";
  let access = [];
  let selectedOrgId = "";
  let roster = [];
  let summary = { total: 0, membership_classes: {} };
  let expanded = new Set();
  let searchDraft = "";
  let searchTerm = "";
  let searchTimer = null;
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let backend = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  const emailNorm = (v) => clean(v).toLowerCase();

  function rootEl() { return ROOT_IDS.map((id) => document.getElementById(id)).find(Boolean); }
  function selectedAccess() { return access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }

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
      organizations: access.map((a) => ({ id: a.organization_id, name: a.organization_name, key: a.organization_key })),
      styleProfile: row?.style_profile || null,
      accessRow: row || null,
    });
  }

  function setMessage(text, kind = "") { message = text || `Version ${VERSION}`; messageKind = kind; render(); }

  async function refreshAuth() {
    await ensureSupabase();
    const { data } = await supabaseClient.auth.getSession();
    token = data?.session?.access_token || "";
    email = data?.session?.user?.email || "";
    if (token) await loadAccessAndRoster();
    setShellState();
    render();
  }

  async function login() {
    await ensureSupabase();
    const e = emailNorm($("roster-email")?.value);
    const p = $("roster-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    await refreshAuth();
    setMessage(`Logged in as ${e}`, "ok");
  }

  async function logout() {
    await ensureSupabase();
    await supabaseClient.auth.signOut();
    token = ""; email = ""; access = []; selectedOrgId = ""; roster = []; expanded = new Set();
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
    const res = await fetch(EDGE_URL, { method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => ({}));
    backend = json;
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || `Action failed: ${action}`);
    return json;
  }

  async function loadAccessAndRoster() {
    const dash = await call("get_user_dashboard", selectedOrgId ? { organization_id: selectedOrgId } : {});
    access = dash.access || [];
    if (!selectedOrgId && access[0]) selectedOrgId = String(access[0].organization_id);
    setShellState();
    const row = selectedAccess();
    if (row && obj(row.capabilities).can_view_roster) await loadRoster();
    else { roster = []; summary = { total: 0, membership_classes: {} }; }
  }

  async function loadRoster() {
    if (!selectedOrgId) return;
    const res = await call("organization_list_roster", { organization_id: selectedOrgId });
    roster = res.people || [];
    summary = res.summary || { total: roster.length, membership_classes: {} };
  }

  async function runButton(id, label, fn) {
    const btn = $(id); const old = btn?.textContent || "";
    try { if (btn) { btn.disabled = true; btn.textContent = label || "Working…"; } return await fn(); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function loginCard() {
    return `<div class="roster-card"><h2>Login required</h2><p>This roster contains private organization information. Log in with your organization account.</p><div class="roster-login"><input id="roster-email" type="email" placeholder="Email"><input id="roster-password" type="password" placeholder="Password"><button id="roster-login" class="roster-btn">Log in</button><button id="roster-reset" class="roster-btn secondary">Forgot password?</button></div></div>`;
  }

  function filteredRows() {
    const q = clean(searchTerm).toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => clean(r.search_text).toLowerCase().includes(q));
  }

  function visibleSummary(rows) {
    const counts = {};
    rows.forEach((r) => { const label = clean(r.membership_class_label || "Unclassified"); counts[label] = (counts[label] || 0) + 1; });
    return counts;
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
    return `<div class="roster-summary-bar"><span class="roster-summary-pill"><strong>${esc(rows.length)}</strong> Visible</span>${pills}<button id="roster-open-all" class="roster-toggle-btn" type="button">Open all</button><button id="roster-close-all" class="roster-toggle-btn" type="button">Close all</button><button id="roster-export" class="roster-toggle-btn" type="button">Export CSV</button><button id="roster-print" class="roster-print-btn" type="button">Print roster</button></div>`;
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

  function csvEscape(v) { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function exportCsv() {
    const rows = filteredRows();
    const header = ["Name","Address 1","Address 2 / Apt","Full Address","City","State","Zip","Phone","Email"];
    const csvRows = [header.join(",")].concat(rows.map((r) => {
      const a = obj(r.address);
      return [r.display_name, a.address1, a.address2, a.full_address, a.city, a.state, a.zip, r.phone, r.email].map(csvEscape).join(",");
    }));
    const blob = new Blob([csvRows.join("\r\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const org = selectedAccess()?.organization_key || "organization";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${org}-roster.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("CSV export created.", "ok");
  }

  function renderContent() {
    if (!token) return loginCard();
    if (!access.length) return `<div class="roster-card"><h2>No organization access found</h2><p>Your login is valid, but it is not linked to an active organization affiliation.</p></div>`;
    const row = selectedAccess();
    if (!obj(row.capabilities).can_view_roster) return `<div class="roster-card"><h2>Roster unavailable</h2><p>This organization has not granted roster access to this account.</p></div>`;
    const rows = filteredRows();
    return `<div class="roster-card roster-note">Roster contains private organization information. Use only for organization purposes.</div>${renderSummary(rows)}<div class="roster-search-panel"><div class="roster-search-wrap"><input id="roster-search" type="search" value="${esc(searchDraft)}" placeholder="Search by name, phone, email, city, role, class…" aria-label="Search roster"><button id="roster-clear" class="roster-clear ${searchDraft ? "show" : ""}" type="button">×</button></div><div class="roster-search-count">Showing ${esc(rows.length)} of ${esc(roster.length)}</div></div><div class="roster-legend"><span><strong>CFI</strong> = Club instructor</span><span><strong>IFR</strong> = Instrument rated</span><span><strong>NIGHT</strong> = Club night checkout</span></div><div class="roster-list">${renderRows(rows)}</div>`;
  }

  function render() {
    const root = rootEl(); if (!root) return;
    const cfg = styleConfig(selectedAccess());
    root.innerHTML = `<style>
      .roster-wrap{${cssVars(cfg)}max-width:var(--roster-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--roster-text);box-sizing:border-box}.roster-wrap *{box-sizing:border-box}.roster-card,.roster-shell{background:rgba(255,255,255,.95);border:1px solid var(--roster-border);border-radius:var(--roster-radius);box-shadow:var(--roster-shadow);padding:20px;margin:16px 0}.roster-hero{background:linear-gradient(135deg,var(--roster-primary),${rgba(cfg.primary,.78)});color:#fff}.roster-hero h1{margin:8px 0 6px;color:#fff;font-size:clamp(32px,4vw,48px);line-height:1.05}.roster-hero p{color:rgba(255,255,255,.9);font-weight:800}.roster-eyebrow{display:inline-flex;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.roster-message{display:inline-flex;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:13px;font-weight:900;background:rgba(255,255,255,.18);color:#fff}.roster-message.ok{background:#e7f6ec;color:#14532d}.roster-message.warn{background:#fff7ec;color:#8a4d00}.roster-note{font-weight:900;color:var(--roster-primary);background:var(--roster-soft);box-shadow:none}.roster-login{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:center}.roster-wrap input{width:100%;min-height:42px;border:1px solid var(--roster-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--roster-text)}.roster-btn,.roster-toggle-btn,.roster-print-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 13px;border-radius:999px;border:1px solid var(--roster-primary);background:var(--roster-primary);color:#fff;font-weight:950;cursor:pointer;text-decoration:none}.roster-btn.secondary,.roster-toggle-btn{background:#fff;color:var(--roster-primary);border-color:var(--roster-border)}.roster-btn:hover,.roster-toggle-btn:hover,.roster-print-btn:hover{filter:brightness(.94);transform:translateY(-1px)}.roster-summary-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:16px;background:rgba(255,255,255,.9);border:1px solid var(--roster-border);border-radius:var(--roster-radius);box-shadow:0 8px 24px ${rgba(cfg.primary,.08)};margin:16px 0}.roster-summary-pill{display:inline-flex;padding:8px 12px;border-radius:999px;background:#fff;color:var(--roster-primary);border:1px solid var(--roster-border);font-size:12px;font-weight:900}.roster-summary-pill strong{margin-right:4px}.roster-print-btn{margin-left:auto}.roster-search-panel{position:sticky;top:10px;z-index:10;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:14px 0;padding:12px;border:1px solid var(--roster-border);border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 12px 28px ${rgba(cfg.primary,.12)};backdrop-filter:blur(8px)}.roster-search-wrap{position:relative}.roster-search-wrap input{border-radius:999px;padding-right:42px}.roster-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:999px;border:1px solid var(--roster-border);background:var(--roster-soft);color:var(--roster-primary);font-weight:950;display:none;cursor:pointer}.roster-clear.show{display:inline-flex;align-items:center;justify-content:center}.roster-search-count{padding:8px 12px;border-radius:999px;background:var(--roster-primary);color:#fff;font-size:12px;font-weight:950;white-space:nowrap}.roster-legend{margin:0 0 14px;padding:12px 14px;border:1px solid var(--roster-border);border-radius:16px;background:var(--roster-soft);font-size:12px;color:var(--roster-muted);font-weight:800}.roster-legend span{margin-right:16px}.roster-legend strong{color:var(--roster-primary)}.roster-list{border:1px solid var(--roster-border);border-radius:18px;overflow:hidden;background:#fff}.roster-row{border-bottom:1px solid var(--roster-border);background:#fff}.roster-row:last-child{border-bottom:none}.roster-row.open{background:linear-gradient(180deg,var(--roster-soft),rgba(255,255,255,.94))}.roster-row-main{width:100%;min-height:58px;padding:11px 14px;display:grid;grid-template-columns:24px minmax(0,1.7fr) minmax(0,2fr) minmax(0,1.25fr) minmax(120px,.9fr) minmax(110px,.85fr);gap:10px;align-items:center;border:none;background:transparent;text-align:left;cursor:pointer;font-family:inherit;color:var(--roster-text)}.roster-row-main:hover{background:var(--roster-soft)}.roster-chevron{font-weight:950;color:var(--roster-primary)}.roster-name-cell strong{font-weight:950;color:var(--roster-primary)}.roster-email-cell,.roster-phone-cell{font-size:13px;color:${rgba(cfg.primary,.86)};font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-title-pill{display:inline-flex;margin-left:7px;padding:4px 8px;border-radius:999px;background:#fff2d7;color:#8a4b00;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.roster-aviation-pill,.roster-type-pill{display:inline-flex;margin:2px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--roster-border);background:var(--roster-soft);color:var(--roster-primary)}.roster-type-pill{background:#e7f6ec;color:#14532d}.roster-row-details{display:none;padding:0 14px 14px}.roster-row.open .roster-row-details{display:block}.roster-row-details-inner{display:grid;grid-template-columns:1fr 1fr 150px;gap:16px;padding:16px;border:1px solid var(--roster-border);border-radius:16px;background:rgba(255,255,255,.92)}.roster-detail-block h3{margin:0 0 8px;color:var(--roster-primary);font-size:12px;text-transform:uppercase;letter-spacing:.05em}.roster-detail-block p{margin:4px 0;font-size:13px;font-weight:750}.roster-detail-block a{color:var(--roster-primary);font-weight:950;text-decoration:none}.muted{color:var(--roster-muted)}.roster-photo-box{display:flex;align-items:center;justify-content:center}.roster-photo-box img,.roster-photo-placeholder{width:130px;height:130px;border-radius:18px;object-fit:cover;border:1px solid var(--roster-border);box-shadow:0 8px 22px ${rgba(cfg.primary,.14)}}.roster-photo-placeholder{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--roster-primary),${rgba(cfg.primary,.74)});color:#fff;font-size:36px;font-weight:950}.roster-empty{padding:22px;text-align:center;color:var(--roster-muted);font-weight:900}.roster-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:240px;overflow:auto}@media(max-width:980px){.roster-row-main{grid-template-columns:24px minmax(0,1.5fr) minmax(0,1.5fr);grid-auto-rows:auto}.roster-phone-cell,.roster-pill-cell,.roster-class-cell{grid-column:auto}.roster-row-details-inner{grid-template-columns:1fr}.roster-print-btn{margin-left:0}.roster-login,.roster-search-panel{grid-template-columns:1fr}}@media(max-width:650px){.roster-row-main{grid-template-columns:24px minmax(0,1fr)}.roster-email-cell,.roster-phone-cell,.roster-pill-cell,.roster-class-cell{grid-column:2}.roster-summary-bar>*{width:100%;justify-content:center}.roster-wrap{padding:0 10px}}@media print{#syncetc-portal-shell,#syncetc-portal-footer,.roster-search-panel,.roster-toggle-btn,.roster-print-btn,details.roster-debug{display:none!important}.roster-wrap{max-width:none;margin:0;padding:0}.roster-card,.roster-row-details-inner,.roster-list{box-shadow:none}.roster-row-details{display:block!important}.roster-row-main{break-inside:avoid}.roster-hero{background:#fff!important;color:#000!important}.roster-hero h1,.roster-hero p{color:#000!important}}
    </style><div class="roster-wrap"><section class="roster-card roster-hero"><div class="roster-eyebrow">Roster</div><h1>Roster</h1><p>Search, tap, or click a row to see contact details.</p><div class="roster-message ${esc(messageKind)}">${esc(message)}</div></section>${renderContent()}<details class="roster-card roster-debug"><summary>Diagnostics</summary><pre class="roster-backend">${esc(JSON.stringify(backend || {}, null, 2))}</pre></details></div>`;

    $("roster-login")?.addEventListener("click", () => runButton("roster-login", "Logging in…", login));
    $("roster-reset")?.addEventListener("click", () => runButton("roster-reset", "Sending…", resetPassword));
    $("roster-search")?.addEventListener("input", (e) => {
      searchDraft = e.target.value || "";
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTerm = searchDraft; render(); }, 300);
      $("roster-clear")?.classList.toggle("show", Boolean(searchDraft));
    });
    $("roster-clear")?.addEventListener("click", () => { searchDraft = ""; searchTerm = ""; render(); });
    document.querySelectorAll("[data-roster-toggle]").forEach((btn) => btn.addEventListener("click", () => { const id = btn.getAttribute("data-roster-toggle"); if (!id) return; expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }));
    $("roster-open-all")?.addEventListener("click", () => { filteredRows().forEach((r) => expanded.add(clean(r.membership_id || r.person_id))); render(); });
    $("roster-close-all")?.addEventListener("click", () => { expanded = new Set(); render(); });
    $("roster-export")?.addEventListener("click", exportCsv);
    $("roster-print")?.addEventListener("click", () => window.print());
  }

  async function handleOrganizationChange(nextOrgId) {
    nextOrgId = String(nextOrgId || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    selectedOrgId = nextOrgId; roster = []; expanded = new Set(); searchDraft = ""; searchTerm = "";
    try { await loadAccessAndRoster(); setMessage("Organization loaded.", "ok"); }
    catch (e) { setMessage(e.message || String(e), "warn"); }
    render();
  }

  window.addEventListener("syncetc:portal-logout-request", () => { if (token) logout().catch((e) => setMessage(e.message || String(e), "warn")); });
  window.addEventListener("syncetc:portal-login-request", () => { render(); setTimeout(() => $("roster-email")?.focus(), 0); });
  window.addEventListener("syncetc:portal-organization-change-request", (event) => handleOrganizationChange(event.detail?.organizationId || event.detail?.organization_id));
  window.addEventListener("syncetc:portal-organization-change", (event) => handleOrganizationChange(event.detail?.organization_id || event.detail?.organizationId));
  document.addEventListener("DOMContentLoaded", () => refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); }));
})();
