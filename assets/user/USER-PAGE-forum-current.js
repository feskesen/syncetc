// MEMBER-PAGE-forum-current.js
// Internal Version: 2026-06-13-111-A
// Purpose: Member-only organization message board foundation with categories, topics, replies, simple polls, mentions groundwork, and admin moderation.

(function () {
  "use strict";

  const VERSION = "2026-06-13-111-A";
  const ROOT_IDS = ["syncetc-member-forum-root", "syncetc-user-forum-root", "syncetc-forum-root"];
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  const DEBUG = new URLSearchParams(location.search).get("syncetc_debug") === "1";
  const initialTopicId = new URLSearchParams(location.search).get("topic") || new URLSearchParams(location.search).get("forum_topic_id") || "";
  const diagSteps = [];
  const startMs = (performance && performance.now) ? performance.now() : Date.now();

  let supabaseClient = null;
  let token = "";
  let email = "";
  let backend = null;
  let authChecked = false;
  let loading = false;
  let message = `Version ${VERSION}`;
  let messageKind = "";
  let access = [];
  let forumAccessRow = null;
  let selectedOrgId = "";
  let platformAdmin = false;
  let categories = [];
  let topics = [];
  let selectedTopic = null;
  let replies = [];
  let members = [];
  let canModerate = false;
  let unreadMentionCount = 0;
  let preferences = {};
  let dirty = false;
  let createTopicType = "discussion";
  let categoryFilter = "";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  const clean = (v) => String(v ?? "").replace(/\s+/g," ").trim();
  const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = (v) => Array.isArray(v) ? v : [];

  function diag(step, detail = "") {
    if (!DEBUG) return;
    const now = Math.round(((performance && performance.now) ? performance.now() : Date.now()) - startMs);
    diagSteps.push({ ms: now, step, detail: String(detail || "") });
    try { console.log(`[SyncEtc message board ${VERSION}] ${step}`, detail || ""); } catch {}
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
  function cssVars(cfg) { return `--mf-primary:${cfg.primary};--mf-secondary:${cfg.secondary};--mf-surface:${cfg.surface};--mf-text:${cfg.text};--mf-muted:${cfg.muted};--mf-border:${cfg.border};--mf-soft:${cfg.soft};--mf-shadow:${cfg.shadow};--mf-radius:${cfg.radius};--mf-page-width:${cfg.pageWidth};`; }

  function selectedAccess() { return forumAccessRow || access.find((row) => String(row.organization_id) === String(selectedOrgId)) || access[0] || null; }

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
      activePageKey: "forum",
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

  function memberRows(rows) {
    return arr(rows).filter((row) => !row.blocks_access && (obj(row.capabilities).can_view_user_dashboard || obj(row.capabilities).can_view_organization_admin || row.platform_override));
  }

  async function ensureOrganizationContext() {
    if (selectedOrgId) return;
    const res = await call("get_my_access", {});
    platformAdmin = Boolean(res.platform_admin);
    access = memberRows(res.access);
    selectedOrgId = clean(access[0]?.organization_id);
    if (!selectedOrgId) throw new Error("No member organization was found for this login.");
  }

  function applyContext(res) {
    forumAccessRow = obj(res.access);
    if (forumAccessRow.organization_id) {
      selectedOrgId = clean(forumAccessRow.organization_id);
      const existingIndex = access.findIndex((row) => clean(row.organization_id) === selectedOrgId);
      if (existingIndex >= 0) access[existingIndex] = { ...access[existingIndex], ...forumAccessRow };
      else access = [forumAccessRow, ...access];
    }
    platformAdmin = Boolean(res.platform_admin);
    categories = arr(res.categories);
    topics = arr(res.topics);
    replies = arr(res.replies);
    selectedTopic = obj(res.selected_topic);
    if (!selectedTopic.forum_topic_id) selectedTopic = null;
    members = arr(res.members);
    canModerate = Boolean(res.can_moderate);
    unreadMentionCount = Number(res.unread_mention_count || 0);
    preferences = obj(res.preferences);
    setShellState();
  }

  async function loadForum(extra = {}) {
    loading = true;
    render();
    await ensureOrganizationContext();
    const res = await call("member_forum_get_context", { organization_id: selectedOrgId, forum_category_id: categoryFilter, forum_topic_id: initialTopicId || "", ...extra });
    applyContext(res);
    loading = false;
    render();
  }

  async function refreshAuth() {
    diag("auth:start");
    await ensureSupabase();
    const session = await getStableSession();
    token = session?.access_token || "";
    email = session?.user?.email || "";
    authChecked = true;
    if (!token) { access = []; selectedOrgId = ""; platformAdmin = false; categories = []; topics = []; selectedTopic = null; replies = []; backend = null; loading = false; setShellState(); render(); return; }
    try { await loadForum(); setMessage("Message board loaded.", "ok"); }
    catch (e) { loading = false; backend = { ok:false, message:e.message || String(e) }; setShellState(); setMessage(e.message || String(e), "warn"); }
  }

  async function login() {
    await ensureSupabase();
    const e = clean($("forum-email")?.value).toLowerCase();
    const p = $("forum-password")?.value || "";
    if (!e || !p) throw new Error("Enter email and password.");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    try { window.sessionStorage.setItem("syncetc_just_logged_in", "1"); } catch {}
    await refreshAuth();
  }

  async function runButton(buttonId, workingText, fn) {
    const btn = buttonId ? $(buttonId) : null;
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

  function fmt(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return clean(value);
    try { return new Intl.DateTimeFormat("en-US", { dateStyle:"medium", timeStyle:"short" }).format(d); }
    catch { return d.toLocaleString(); }
  }

  function confirmDirty() {
    if (!dirty) return true;
    return window.confirm("You have unsaved message board text. Leave without saving?");
  }
  function setDirty(next = true) { dirty = next; }

  function renderLogin() {
    return `<div class="mf-card"><h2>Log in</h2><p class="mf-help">Use your organization login to open the member message board.</p><div class="mf-login-grid"><input id="forum-email" type="email" placeholder="Email" autocomplete="username"><input id="forum-password" type="password" placeholder="Password" autocomplete="current-password"><button id="forum-login" class="mf-btn" type="button">Log in</button></div></div>`;
  }

  function renderCategories() {
    const allActive = !categoryFilter;
    return `<aside class="mf-card mf-categories"><div class="mf-section-head"><div><span class="mf-eyebrow">Categories</span><h2>Message board</h2></div>${unreadMentionCount ? `<span class="mf-attention">${unreadMentionCount} mention${unreadMentionCount === 1 ? "" : "s"}</span>` : ""}</div><button class="mf-cat ${allActive ? "is-active" : ""}" data-category="">All topics</button>${categories.map((cat) => `<button class="mf-cat ${categoryFilter === cat.forum_category_id ? "is-active" : ""}" data-category="${esc(cat.forum_category_id)}"><strong>${esc(cat.label)}</strong><span>${esc(cat.description || "")}</span>${cat.posting_mode === "admins_only" ? `<em>Admin posts</em>` : ""}</button>`).join("")}</aside>`;
  }

  function renderMentionSelect(id) {
    if (!members.length) return "";
    return `<label>Mentions<select id="${id}" multiple size="4">${members.map((m) => `<option value="${esc(m.person_id)}">${esc(m.display_name)}${m.email ? ` — ${esc(m.email)}` : ""}</option>`).join("")}</select><span class="mf-help">Optional. Selected members receive an in-site mention alert.</span></label>`;
  }

  function selectedMentionIds(id) {
    const el = $(id);
    if (!el) return [];
    return Array.from(el.selectedOptions || []).map((o) => o.value).filter(Boolean);
  }

  function renderCreateTopic() {
    const activeCats = categories.filter((cat) => cat.status === "active" && (cat.posting_mode === "members" || canModerate));
    return `<section class="mf-card mf-create"><span class="mf-eyebrow">New topic</span><h2>Start a discussion</h2><p class="mf-help">Post a topic for members of this organization.</p><div class="mf-form-grid"><label>Category<select id="forum-new-category">${activeCats.map((cat) => `<option value="${esc(cat.forum_category_id)}">${esc(cat.label)}</option>`).join("")}</select></label><label>Topic type<select id="forum-new-type"><option value="discussion">Discussion</option><option value="trip">Trip planning</option><option value="poll">Poll</option>${canModerate ? `<option value="announcement">Announcement</option>` : ""}</select></label></div><label>Title<input id="forum-new-title" type="text" maxlength="180" placeholder="Topic title"></label><label>Message<textarea id="forum-new-body" rows="5" placeholder="Write your message…"></textarea></label><div id="forum-trip-wrap" class="mf-extra" style="display:${createTopicType === "trip" ? "block" : "none"}"><div class="mf-form-grid"><label>Destination<input id="forum-trip-destination" type="text" placeholder="Destination or idea"></label><label>Proposed date<input id="forum-trip-date" type="text" placeholder="Optional"></label></div></div><div id="forum-poll-wrap" class="mf-extra" style="display:${createTopicType === "poll" ? "block" : "none"}"><label>Poll options<textarea id="forum-new-poll-options" rows="5" placeholder="One option per line"></textarea></label><p class="mf-help">Add one option per line.</p></div>${renderMentionSelect("forum-new-mentions")}<button id="forum-create-topic" class="mf-btn" type="button">Post topic</button></section>`;
  }

  function topicBadge(topic) {
    if (topic.topic_type === "poll") return "Poll";
    if (topic.topic_type === "trip") return "Trip";
    if (topic.topic_type === "announcement") return "Announcement";
    return clean(topic.category?.label || "Topic");
  }

  function renderTopicList() {
    const empty = `<div class="mf-empty"><strong>No topics yet.</strong><span>Start the first topic for this category.</span></div>`;
    return `<section class="mf-card mf-topic-list"><div class="mf-section-head"><div><span class="mf-eyebrow">Topics</span><h2>Recent discussions</h2></div><span class="mf-mini">${esc(topics.length)} topics</span></div><div class="mf-list">${topics.length ? topics.map((topic) => `<button class="mf-topic ${selectedTopic?.forum_topic_id === topic.forum_topic_id ? "is-active" : ""}" data-topic="${esc(topic.forum_topic_id)}"><span class="mf-topic-top"><strong>${topic.pinned ? "📌 " : ""}${esc(topic.title)}</strong><em>${esc(topicBadge(topic))}</em></span><span>${esc(topic.created_by_name || "Member")} · ${esc(fmt(topic.last_activity_at || topic.created_at))}</span><small>${esc(topic.reply_count || 0)} replies${topic.locked ? " · locked" : ""}${topic.mention_count ? ` · ${esc(topic.mention_count)} mentions` : ""}</small></button>`).join("") : empty}</div></section>`;
  }

  function renderPoll(topic) {
    const poll = obj(topic?.poll);
    if (!poll.forum_poll_id) return "";
    const options = arr(poll.options);
    const selected = new Set(arr(poll.viewer_vote_option_ids).map(String));
    const total = options.reduce((sum, opt) => sum + Number(opt.vote_count || 0), 0);
    return `<div class="mf-poll"><h3>${esc(poll.question || "Poll")}</h3>${options.map((option) => { const count = Number(option.vote_count || 0); const pct = total ? Math.round((count / total) * 100) : 0; const isSelected = selected.has(String(option.forum_poll_option_id)); return `<button class="mf-poll-option ${isSelected ? "is-selected" : ""}" data-vote-poll="${esc(poll.forum_poll_id)}" data-vote-option="${esc(option.forum_poll_option_id)}" ${topic.locked || poll.status !== "active" ? "disabled" : ""}><span><strong>${esc(option.option_text)}</strong>${isSelected ? " · your vote" : ""}</span><em>${count} vote${count === 1 ? "" : "s"} · ${pct}%</em><i style="width:${pct}%"></i></button>`; }).join("")}<p class="mf-help">${total} total vote${total === 1 ? "" : "s"}. ${poll.allow_multiple ? "Multiple selections are allowed." : "You can change your vote while the poll is open."}</p></div>`;
  }

  function renderTrip(topic) {
    const trip = obj(topic.trip_json);
    if (topic.topic_type !== "trip" || (!trip.destination && !trip.proposed_date)) return "";
    return `<div class="mf-trip"><strong>Trip planning</strong>${trip.destination ? `<span>Destination: ${esc(trip.destination)}</span>` : ""}${trip.proposed_date ? `<span>Proposed date: ${esc(trip.proposed_date)}</span>` : ""}</div>`;
  }

  function renderReplies() {
    if (!replies.length) return `<div class="mf-empty"><strong>No replies yet.</strong><span>Be the first to respond.</span></div>`;
    return replies.map((reply) => `<article class="mf-reply ${reply.status !== "active" ? "is-hidden" : ""}"><div class="mf-reply-head"><strong>${esc(reply.created_by_name || "Member")}</strong><span>${esc(fmt(reply.created_at))}</span></div><p>${esc(reply.body).replace(/\n/g,"<br>")}</p>${reply.status !== "active" ? `<em>${esc(reply.status)}</em>` : ""}</article>`).join("");
  }

  function renderModeration(topic) {
    if (!canModerate || !topic?.forum_topic_id) return "";
    return `<div class="mf-actions mf-moderation"><button class="mf-btn secondary" data-moderate="${topic.pinned ? "unpin" : "pin"}">${topic.pinned ? "Unpin" : "Pin"}</button><button class="mf-btn secondary" data-moderate="${topic.locked ? "unlock" : "lock"}">${topic.locked ? "Unlock" : "Lock"}</button>${topic.status === "hidden" ? `<button class="mf-btn secondary" data-moderate="restore">Restore</button>` : `<button class="mf-btn secondary" data-moderate="hide">Hide</button>`}</div>`;
  }

  function renderTopicDetail() {
    const topic = selectedTopic;
    if (!topic?.forum_topic_id) return `<section class="mf-card mf-detail"><span class="mf-eyebrow">Topic</span><h2>Select a topic</h2><p class="mf-help">Choose a topic from the list or start a new discussion.</p></section>`;
    return `<section class="mf-card mf-detail"><div class="mf-topic-detail-head"><div><span class="mf-eyebrow">${esc(topicBadge(topic))}</span><h2>${esc(topic.title)}</h2><p class="mf-help">Posted by ${esc(topic.created_by_name || "Member")} · ${esc(fmt(topic.created_at))}${topic.locked ? " · Locked" : ""}</p></div>${topic.pinned ? `<span class="mf-mini">Pinned</span>` : ""}</div><p class="mf-topic-body">${esc(topic.body).replace(/\n/g,"<br>")}</p>${renderTrip(topic)}${renderPoll(topic)}${renderModeration(topic)}<hr><div class="mf-section-head"><div><span class="mf-eyebrow">Replies</span><h3>${esc(topic.reply_count || 0)} replies</h3></div></div><div class="mf-replies">${renderReplies()}</div>${topic.locked && !canModerate ? `<p class="mf-help">This topic is locked.</p>` : `<label>Reply<textarea id="forum-reply-body" rows="4" placeholder="Write a reply…"></textarea></label>${renderMentionSelect("forum-reply-mentions")}<button id="forum-create-reply" class="mf-btn" type="button">Post reply</button>`}</section>`;
  }

  function renderBoard() {
    if (!authChecked) return `<div class="mf-card"><h2>Checking login…</h2><p>Please wait while SyncEtc confirms your session.</p></div>`;
    if (!token) return renderLogin();
    if (loading && !categories.length) return `<div class="mf-card"><h2>Loading message board…</h2><p>Please wait while SyncEtc loads organization topics.</p></div>`;
    if (!access.length && !forumAccessRow) return `<div class="mf-card"><h2>No organization access found</h2><p>Your login is valid, but this account is not linked to an active organization membership.</p></div>`;
    const orgName = clean(selectedAccess()?.organization_name || "your organization");
    return `<section class="mf-card mf-hero"><span class="mf-eyebrow light">Message board</span><h1>${esc(orgName)} Message Board</h1><p>Post topics, reply to member discussions, plan trips, and run simple polls inside your organization.</p></section><div class="mf-layout"><div>${renderCategories()}${renderCreateTopic()}</div><div>${renderTopicList()}${renderTopicDetail()}</div></div>`;
  }

  function diagnosticsHtml() {
    if (!DEBUG) return "";
    const lines = diagSteps.map((d) => `${String(d.ms).padStart(6," ")}ms  ${d.step}${d.detail ? " — " + d.detail : ""}`).join("\n");
    return `<details class="mf-card"><summary>Message board diagnostics</summary><pre class="mf-backend">SyncEtc Message Board ${esc(VERSION)}\nEmail: ${esc(email || "none")}\nSelected org: ${esc(selectedOrgId || "none")}\nAccess rows: ${esc(access.length)}\nBackend version: ${esc(backend?.version || "none")}\nCategories: ${esc(categories.length)}\nTopics: ${esc(topics.length)}\nSelected topic: ${esc(selectedTopic?.forum_topic_id || "none")}\nUnread mentions: ${esc(unreadMentionCount)}\n\nSteps:\n${esc(lines)}\n\nBackend result:\n${esc(JSON.stringify(backend || {}, null, 2))}</pre></details>`;
  }

  function render() {
    const root = rootEl();
    if (!root) return;
    const cfg = styleConfig(selectedAccess());
    root.innerHTML = `<style>
      .mf-wrap{${cssVars(cfg)}max-width:var(--mf-page-width);margin:24px auto 56px;padding:0 18px;font-family:Arial,Helvetica,sans-serif;color:var(--mf-text);box-sizing:border-box}.mf-wrap *{box-sizing:border-box}.mf-card{background:rgba(255,255,255,.95);border:1px solid var(--mf-border);border-radius:var(--mf-radius);box-shadow:var(--mf-shadow);padding:20px;margin:16px 0}.mf-hero{background:linear-gradient(135deg,var(--mf-primary),${rgba(cfg.primary,.76)});color:#fff}.mf-hero h1{margin:8px 0 6px;font-size:38px;line-height:1.05;color:#fff;letter-spacing:-.03em}.mf-hero p{color:rgba(255,255,255,.9);font-weight:850}.mf-eyebrow{display:inline-flex;align-items:center;width:max-content;border-radius:999px;background:var(--mf-soft);color:var(--mf-primary);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px}.mf-eyebrow.light{background:rgba(255,255,255,.16);color:#fff}.mf-layout{display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start}.mf-section-head,.mf-topic-detail-head,.mf-topic-top,.mf-reply-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.mf-categories{position:sticky;top:12px}.mf-cat,.mf-topic{width:100%;text-align:left;border:1px solid var(--mf-border);border-radius:16px;background:#fff;color:var(--mf-text);padding:12px;margin-top:9px;cursor:pointer}.mf-cat:hover,.mf-topic:hover{border-color:var(--mf-primary);box-shadow:0 8px 22px ${rgba(cfg.primary,.10)}}.mf-cat.is-active,.mf-topic.is-active{border-color:var(--mf-primary);background:var(--mf-soft)}.mf-cat strong,.mf-topic strong{display:block;color:var(--mf-primary)}.mf-cat span,.mf-topic span,.mf-topic small{display:block;color:var(--mf-muted);font-size:12px;font-weight:800;margin-top:4px}.mf-cat em,.mf-topic em{font-style:normal;display:inline-flex;border-radius:999px;background:var(--mf-soft);color:var(--mf-primary);font-size:11px;font-weight:950;padding:4px 7px}.mf-form-grid,.mf-login-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mf-wrap label{display:block;margin:10px 0 6px;font-weight:950;color:var(--mf-text)}.mf-wrap input,.mf-wrap select,.mf-wrap textarea{width:100%;min-height:42px;border:1px solid var(--mf-border);border-radius:12px;padding:10px 12px;background:#fff;color:var(--mf-text);font:inherit}.mf-wrap textarea{resize:vertical}.mf-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:999px;border:1px solid var(--mf-primary);background:var(--mf-primary);color:#fff;font-weight:950;padding:9px 15px;text-decoration:none;cursor:pointer;margin-top:8px}.mf-btn.secondary{background:#fff;color:var(--mf-primary)}.mf-btn:disabled{opacity:.58;cursor:not-allowed}.mf-help{color:var(--mf-muted);font-size:13px;line-height:1.45;font-weight:750}.mf-mini,.mf-attention{display:inline-flex;border-radius:999px;background:var(--mf-soft);color:var(--mf-primary);padding:5px 9px;font-size:11px;font-weight:950;text-transform:uppercase}.mf-attention{background:#fee2e2;color:#991b1b}.mf-empty{border:1px dashed var(--mf-border);border-radius:16px;padding:16px;color:var(--mf-muted);font-weight:850}.mf-empty strong,.mf-empty span{display:block}.mf-topic-body{font-size:15px;line-height:1.55;font-weight:750;background:#f8fafc;border:1px solid #dbe3ef;border-radius:16px;padding:14px}.mf-detail hr{border:0;border-top:1px solid var(--mf-border);margin:18px 0}.mf-reply{border:1px solid var(--mf-border);border-radius:16px;padding:13px;margin:10px 0;background:#fff}.mf-reply.is-hidden{opacity:.65}.mf-reply p{margin:8px 0 0;line-height:1.5}.mf-actions{display:flex;gap:8px;flex-wrap:wrap}.mf-moderation{border-top:1px solid var(--mf-border);padding-top:10px;margin-top:12px}.mf-poll,.mf-trip{border:1px solid var(--mf-border);border-radius:16px;padding:14px;margin:14px 0;background:#fff}.mf-trip span{display:block;color:var(--mf-muted);font-weight:850;margin-top:4px}.mf-poll h3{margin:0 0 10px;color:var(--mf-primary)}.mf-poll-option{position:relative;overflow:hidden;display:block;width:100%;border:1px solid var(--mf-border);border-radius:14px;background:#fff;text-align:left;padding:11px;margin:8px 0;cursor:pointer}.mf-poll-option i{position:absolute;left:0;top:0;bottom:0;background:var(--mf-soft);z-index:0}.mf-poll-option span,.mf-poll-option em{position:relative;z-index:1;display:flex;justify-content:space-between;gap:10px}.mf-poll-option em{font-style:normal;color:var(--mf-muted);font-weight:850}.mf-poll-option.is-selected{border-color:var(--mf-primary)}.mf-extra{border-left:4px solid var(--mf-primary);padding-left:12px}.mf-message{display:inline-flex;margin-top:10px;border-radius:12px;padding:9px 11px;font-size:13px;font-weight:900;background:${messageKind === "ok" ? "#e7f6ec" : messageKind === "warn" ? "#fff7ec" : "rgba(255,255,255,.14)"};color:${messageKind === "ok" ? "#14532d" : messageKind === "warn" ? "#8a4d00" : "inherit"}}.mf-backend{white-space:pre-wrap;background:#0f172a;color:#e5eefb;border-radius:14px;padding:14px;font-size:12px;max-height:360px;overflow:auto}details summary{cursor:pointer;font-weight:950;color:var(--mf-primary)}@media(max-width:980px){.mf-layout,.mf-form-grid,.mf-login-grid{grid-template-columns:1fr}.mf-categories{position:static}.mf-hero h1{font-size:31px}.mf-topic-detail-head,.mf-topic-top,.mf-reply-head{display:block}}
    </style><div class="mf-wrap">${renderBoard()}<div class="mf-message ${esc(messageKind)}">${esc(message)}</div>${diagnosticsHtml()}</div>`;
    bindEvents();
  }

  function bindEvents() {
    $("forum-login")?.addEventListener("click", () => runButton("forum-login", "Logging in…", login));
    document.querySelectorAll(".mf-cat").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDirty()) return; categoryFilter = btn.getAttribute("data-category") || ""; setDirty(false); loadForum({ forum_category_id: categoryFilter, forum_topic_id: "" }).catch((e) => setMessage(e.message || String(e), "warn")); }));
    document.querySelectorAll(".mf-topic").forEach((btn) => btn.addEventListener("click", () => { if (!confirmDirty()) return; setDirty(false); loadForum({ forum_topic_id: btn.getAttribute("data-topic") || "" }).catch((e) => setMessage(e.message || String(e), "warn")); }));
    $("forum-new-type")?.addEventListener("change", (e) => { createTopicType = e.target.value || "discussion"; render(); });
    ["forum-new-title","forum-new-body","forum-new-poll-options","forum-reply-body","forum-trip-destination","forum-trip-date"].forEach((id) => $(id)?.addEventListener("input", () => setDirty(true)));
    $("forum-create-topic")?.addEventListener("click", () => runButton("forum-create-topic", "Posting…", createTopic));
    $("forum-create-reply")?.addEventListener("click", () => runButton("forum-create-reply", "Posting…", createReply));
    document.querySelectorAll(".mf-poll-option").forEach((btn) => btn.addEventListener("click", () => runButton("", "", () => votePoll(btn.getAttribute("data-vote-poll") || "", btn.getAttribute("data-vote-option") || ""))));
    document.querySelectorAll("[data-moderate]").forEach((btn) => btn.addEventListener("click", () => runButton("", "", () => moderateTopic(btn.getAttribute("data-moderate") || ""))));
  }

  async function createTopic() {
    const pollOptions = ($("forum-new-poll-options")?.value || "").split(/\r?\n/).map(clean).filter(Boolean);
    const payload = {
      organization_id: selectedOrgId,
      forum_category_id: clean($("forum-new-category")?.value),
      topic_type: clean($("forum-new-type")?.value || createTopicType || "discussion"),
      title: clean($("forum-new-title")?.value),
      body: $("forum-new-body")?.value || "",
      poll_question: clean($("forum-new-title")?.value),
      poll_options: pollOptions,
      trip_destination: clean($("forum-trip-destination")?.value),
      trip_date: clean($("forum-trip-date")?.value),
      mentioned_person_ids: selectedMentionIds("forum-new-mentions"),
    };
    const res = await call("member_forum_create_topic", payload);
    applyContext(res);
    setDirty(false);
    setMessage("Topic posted.", "ok");
    render();
  }

  async function createReply() {
    const body = $("forum-reply-body")?.value || "";
    if (!selectedTopic?.forum_topic_id) throw new Error("Choose a topic first.");
    const res = await call("member_forum_create_reply", { organization_id: selectedOrgId, forum_topic_id: selectedTopic.forum_topic_id, body, mentioned_person_ids: selectedMentionIds("forum-reply-mentions") });
    applyContext(res);
    setDirty(false);
    setMessage("Reply posted.", "ok");
    render();
  }

  async function votePoll(pollId, optionId) {
    if (!pollId || !optionId) throw new Error("Choose a poll option.");
    const res = await call("member_forum_vote_poll", { organization_id: selectedOrgId, forum_poll_id: pollId, forum_poll_option_id: optionId });
    applyContext(res);
    setMessage("Vote saved.", "ok");
    render();
  }

  async function moderateTopic(action) {
    if (!selectedTopic?.forum_topic_id) throw new Error("Choose a topic first.");
    if (action === "hide" && !window.confirm("Hide this topic from members?")) return;
    const res = await call("member_forum_moderate_topic", { organization_id: selectedOrgId, forum_topic_id: selectedTopic.forum_topic_id, moderation_action: action });
    applyContext(res);
    setMessage("Moderation saved.", "ok");
    render();
  }

  async function handleOrganizationChange(nextOrgId) {
    nextOrgId = String(nextOrgId || "");
    if (!nextOrgId || nextOrgId === selectedOrgId) return;
    if (!confirmDirty()) return;
    selectedOrgId = nextOrgId;
    forumAccessRow = null;
    setDirty(false);
    try { await loadForum({ organization_id: nextOrgId, forum_topic_id: "" }); setMessage("Organization loaded.", "ok"); }
    catch (e) { backend = { ok:false, message:e.message || String(e) }; setMessage(e.message || String(e), "warn"); }
  }

  window.addEventListener("beforeunload", (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("syncetc:portal-auth-changed", () => { refreshAuth().catch((e) => { backend = { ok:false, message:e.message || String(e) }; render(); }); });
  window.addEventListener("syncetc:portal-organization-change-request", (event) => { handleOrganizationChange(event.detail?.organizationId || event.detail?.organization_id); });
  window.addEventListener("syncetc:portal-organization-change", (event) => { handleOrganizationChange(event.detail?.organization_id || event.detail?.organizationId); });

  function boot() { refreshAuth().catch((e) => { backend = { ok:false, message:e?.message || String(e) }; authChecked = true; loading = false; setShellState(); render(); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
