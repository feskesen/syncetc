// PUBLIC-PAGE-event-rsvp-current.js
// Internal Version: 2026-06-09-095-B
// Purpose: Event RSVP renderer with People-linked RSVP, public fallback, and checklist/bring-items claiming.

(function () {
  "use strict";

  const VERSION = "2026-06-09-095-B";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const PUBLIC_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ACCESS_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_SELECTOR = "#syncetc-event-rsvp-root";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");

  let supabaseClient = null;
  let token = "";
  let state = {
    mode: "public",
    payload: null,
    accessRow: null,
    organizationId: "",
    myRsvp: null,
    rsvps: [],
    saving: false,
    dirty: false,
    savedFlash: false,
  };

  function e(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function qs(name) { try { return new URLSearchParams(location.search).get(name) || ""; } catch { return ""; } }
  function val(id) { const x = document.getElementById(id); return x ? x.value : ""; }
  function checked(id) { const x = document.getElementById(id); return !!(x && x.checked); }
  function number(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function eventId() { return qs("event") || qs("event_id") || qs("id"); }
  function orgKey(root) { return root.dataset.organizationKey || root.dataset.customerKey || "test-customer-1"; }
  function safeStatus(v) { return ["yes", "maybe", "no", "waitlist", "no_response", "cancelled"].includes(v) ? v : "yes"; }

  function colorFromStyle(path, fallback) {
    try {
      const style = state.accessRow?.style_profile || state.payload?.style_profile || state.payload?.access?.style_profile || {};
      const colors = style.colors_json || {};
      return colors[path] || fallback;
    } catch { return fallback; }
  }

  function eventAccentColor() {
    const ev = state.payload?.event || {};
    return clean(ev.event_accent_color || ev.accent_color || ev.category_color || ev.event_type_color || ev.type_accent_color || ev.color || "") || colorFromStyle("brand_primary", "#265c2b");
  }

  function styleVars() {
    const brand = colorFromStyle("brand_primary", "#265c2b");
    const soft = colorFromStyle("brand_secondary", "#edf7ed");
    const text = colorFromStyle("text", "#142417");
    const surface = colorFromStyle("surface", "#ffffff");
    const accent = eventAccentColor();
    return `--rsvp-brand:${e(brand)};--rsvp-soft:${e(soft)};--rsvp-text:${e(text)};--rsvp-surface:${e(surface)};--rsvp-accent:${e(accent)};`;
  }

  function calendarReturnUrl() {
    const ret = qs("return") || qs("return_to") || qs("back");
    if (ret && /^\//.test(ret) && !/^\/\//.test(ret)) return ret;
    return "/calendar";
  }

  function leaveToCalendar() {
    if (!confirmLeaveIfDirty()) return;
    window.location.href = calendarReturnUrl();
  }

  function statusLabel(v) {
    const s = safeStatus(v);
    if (s === "yes") return "Yes";
    if (s === "maybe") return "Maybe";
    if (s === "no") return "No";
    if (s === "waitlist") return "Waitlist";
    if (s === "cancelled") return "Cancelled";
    return "No response";
  }

  function css() {
    return `
.rsvp-page{max-width:980px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:var(--rsvp-text,#142417)}
.rsvp-page *{box-sizing:border-box}.rsvp-shell{background:var(--rsvp-surface,#fff);border:1px solid color-mix(in srgb,var(--rsvp-brand,#265c2b) 18%,#d9e2ec);border-radius:24px;box-shadow:0 14px 42px rgba(12,38,64,.14);overflow:hidden}.rsvp-hero{padding:24px;background:linear-gradient(135deg,var(--rsvp-brand,#265c2b),color-mix(in srgb,var(--rsvp-brand,#265c2b) 54%,#5d99cf));color:#fff}.rsvp-hero h1{margin:0;font-size:clamp(30px,4vw,46px);letter-spacing:-.035em}.rsvp-hero p{margin:8px 0 0;color:rgba(255,255,255,.92);font-weight:800}.rsvp-main{padding:20px;background:color-mix(in srgb,var(--rsvp-soft,#edf7ed) 38%,#fff)}.rsvp-card{background:#fff;border:1px solid color-mix(in srgb,var(--rsvp-brand,#265c2b) 14%,#d9e2ec);border-radius:18px;padding:16px;margin-bottom:14px}.rsvp-event{display:grid;grid-template-columns:84px minmax(0,1fr) 112px;gap:14px;align-items:center}.rsvp-date{background:var(--rsvp-brand,#265c2b);color:#fff;border-radius:14px;text-align:center;padding:12px}.rsvp-date strong{display:block;font-size:27px}.rsvp-event-image{display:flex;align-items:center;justify-content:center;min-height:82px;border-left:1px solid #e5edf5;background:#f8fbfd;border-radius:12px;color:var(--rsvp-brand,#265c2b);font-size:38px}.rsvp-event-image img{max-width:100%;max-height:92px;object-fit:contain;border-radius:10px}.rsvp-meta{color:#44515f;font-weight:800;font-size:13px}.rsvp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rsvp-field{display:grid;gap:6px;margin-bottom:12px}.rsvp-field span,.rsvp-label{font-size:12px;font-weight:900;text-transform:uppercase;color:var(--rsvp-brand,#265c2b);letter-spacing:.04em}.rsvp-field input,.rsvp-field textarea,.rsvp-field select{width:100%;padding:11px 12px;border:1px solid #bfd0e0;border-radius:10px;font:inherit}.rsvp-status-row{display:grid;grid-template-columns:minmax(390px,450px) minmax(280px,1fr);gap:12px;align-items:end;margin-bottom:12px}.rsvp-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:stretch;width:100%}.rsvp-choice{display:flex!important;align-items:center!important;justify-content:flex-start!important;width:100%!important;min-width:0!important;height:54px!important;min-height:54px!important;padding:10px 16px!important;border-radius:14px;cursor:pointer;font-weight:900;border:1px solid transparent;text-align:left!important;overflow:hidden!important}.rsvp-choice input[type=radio]{width:16px!important;min-width:16px!important;max-width:16px!important;height:16px!important;flex:0 0 16px!important;margin:0 10px 0 0!important;padding:0!important}.rsvp-choice-text{display:block!important;flex:1 1 auto!important;min-width:0!important;text-align:left!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;font-size:14px!important;line-height:1.1!important;font-weight:900!important;text-transform:none!important;letter-spacing:0!important;color:inherit!important}.rsvp-choice.yes{background:#e7f6ec;border-color:#b9e4c7;color:#17633a}.rsvp-choice.maybe{background:#fff4d8;border-color:#f3d38a;color:#8a5700}.rsvp-choice.no{background:#fee2e2;border-color:#fecaca;color:#991b1b}.rsvp-choice.yes:has(input:checked){background:#17633a;border-color:#17633a;color:#fff}.rsvp-choice.maybe:has(input:checked){background:#8a5700;border-color:#8a5700;color:#fff}.rsvp-choice.no:has(input:checked){background:#991b1b;border-color:#991b1b;color:#fff}.rsvp-choice:has(input:checked),.rsvp-choice:has(input:checked) .rsvp-choice-text{color:#fff!important}.rsvp-check{align-self:end;display:flex;align-items:center;justify-content:flex-start;gap:9px;height:54px;min-height:54px;padding:8px 12px;border:1px solid #d9e2ec;border-radius:14px;background:#fff;font-weight:900;text-align:left;min-width:0}.rsvp-check input[type=checkbox]{width:16px;min-width:16px;max-width:16px;height:16px;flex:0 0 16px;margin:0 10px 0 0;padding:0}.rsvp-check span{display:block;min-width:0;line-height:1.1}.rsvp-check small{display:block;color:#61708a;font-size:11px;font-weight:700;margin-top:3px;line-height:1.15;white-space:normal}.rsvp-btn{border:1px solid var(--rsvp-brand,#265c2b);border-radius:999px;padding:10px 16px;background:var(--rsvp-brand,#265c2b);color:#fff;font-weight:900;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,opacity .12s ease;box-shadow:0 6px 14px rgba(12,38,64,.13)}.rsvp-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 9px 18px rgba(12,38,64,.18)}.rsvp-btn:active:not(:disabled){transform:translateY(1px);box-shadow:0 3px 8px rgba(12,38,64,.12)}.rsvp-btn:disabled{opacity:.62;cursor:not-allowed;box-shadow:none}.rsvp-btn.secondary{background:#fff;color:var(--rsvp-brand,#265c2b)}.rsvp-alert{padding:12px 14px;border-radius:12px;margin-bottom:12px;font-weight:800}.rsvp-alert.ok{background:#e7f6ec;color:#17633a}.rsvp-alert.bad{background:#fee2e2;color:#991b1b}.rsvp-alert.warn{background:#fff4d8;color:#8a5700}.rsvp-disabled{padding:18px;border:1px dashed #bfd0e0;border-radius:14px;text-align:center;color:#667;background:#fff}.rsvp-summary-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.rsvp-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.rsvp-stat{padding:12px;border:1px solid #bfd0e0;border-radius:12px;background:color-mix(in srgb,var(--rsvp-soft,#edf7ed) 60%,#fff)}.rsvp-stat small{display:block;text-transform:uppercase;font-size:10px;font-weight:900;color:var(--rsvp-brand,#265c2b)}.rsvp-stat strong{font-size:18px}.rsvp-table-wrap{overflow:auto;border:1px solid #e5edf5;border-radius:12px;margin-top:12px}.rsvp-table{width:100%;border-collapse:collapse;font-size:13px}.rsvp-table th,.rsvp-table td{border-bottom:1px solid #e5edf5;padding:8px;text-align:left}.rsvp-table th{background:color-mix(in srgb,var(--rsvp-soft,#edf7ed) 70%,#fff);font-size:11px;text-transform:uppercase}.rsvp-pill{display:inline-flex;border-radius:999px;padding:5px 9px;background:color-mix(in srgb,var(--rsvp-soft,#edf7ed) 75%,#fff);color:var(--rsvp-brand,#265c2b);font-weight:900;font-size:11px}.rsvp-pill.no-response{background:#eaf5ff;color:#1f4f82}.rsvp-save-status{display:inline-flex;align-items:center;min-height:28px;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900;color:#61708a}.rsvp-save-status.dirty{background:#fff4d8;color:#8a5700}.rsvp-save-status.saving{background:#eaf5ff;color:#1f4f82}.rsvp-save-status.saved{background:#e7f6ec;color:#17633a}.rsvp-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.rsvp-debug{padding:12px;border-radius:12px;background:#101828;color:#dbeafe;font:12px ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}.rsvp-checklist-layout{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}.rsvp-need-summary{padding:12px;border:1px solid #cfe0d1;border-radius:14px;background:color-mix(in srgb,var(--rsvp-soft,#edf7ed) 55%,#fff)}.rsvp-need-summary h4{margin:0 0 8px;color:var(--rsvp-brand,#265c2b)}.rsvp-need-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.rsvp-need-list li{display:flex;justify-content:space-between;gap:10px;padding:7px 9px;border-radius:10px;background:#fff;border:1px solid #e5edf5}.rsvp-need-row{display:grid;grid-template-columns:minmax(0,1fr) 110px minmax(180px,.8fr);gap:10px;align-items:end;padding:12px;border:1px solid #e5edf5;border-radius:14px;margin-top:10px;background:#fff}.rsvp-shell{position:relative;border-top:5px solid var(--rsvp-accent,#265c2b);border-left:5px solid var(--rsvp-accent,#265c2b);border-right:5px solid var(--rsvp-accent,#265c2b)}.rsvp-hero{position:relative;background:linear-gradient(135deg,var(--rsvp-brand,#265c2b),color-mix(in srgb,var(--rsvp-brand,#265c2b) 54%,#5d99cf))!important}.rsvp-close{position:absolute;right:18px;top:18px;width:42px;height:42px;border:1px solid rgba(255,255,255,.48);background:rgba(255,255,255,.16);color:#fff;border-radius:999px;font-size:28px;line-height:1;cursor:pointer;font-weight:700}.rsvp-close:hover{background:rgba(255,255,255,.26);transform:translateY(-1px)}.rsvp-card{margin-bottom:12px}.rsvp-main{padding:16px}.rsvp-event{grid-template-columns:76px minmax(0,1fr) 96px}.rsvp-date{border-left:4px solid var(--rsvp-accent,#265c2b);border-right:4px solid var(--rsvp-accent,#265c2b);border-top:4px solid var(--rsvp-accent,#265c2b)}.rsvp-event-image{border-left:4px solid var(--rsvp-accent,#265c2b)}.rsvp-event-image img{width:100%;height:82px;object-fit:cover}.rsvp-btn{background:var(--rsvp-brand,#265c2b)!important;border-color:var(--rsvp-brand,#265c2b)!important}.rsvp-btn.secondary{background:#fff!important;color:var(--rsvp-brand,#265c2b)!important}.rsvp-need-summary{padding:10px}.rsvp-need-row{padding:10px}.rsvp-summary-grid{gap:7px}.rsvp-claim-name{font-weight:950}.rsvp-need-title{font-weight:900;color:var(--rsvp-brand,#265c2b)}.rsvp-need-meta{font-size:12px;color:#52606d;margin-top:4px}.rsvp-claim-name{font-weight:950}.rsvp-claim-note{font-size:12px;color:#52606d}@media(max-width:720px){.rsvp-grid,.rsvp-event,.rsvp-status-row{grid-template-columns:1fr!important}.rsvp-choices{grid-template-columns:1fr!important;gap:8px}.rsvp-choice{width:100%;height:52px;min-height:52px}.rsvp-choice-text{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}.rsvp-check{width:100%;height:auto;min-height:56px;margin-top:2px}.rsvp-summary-grid{grid-template-columns:1fr 1fr}.rsvp-checklist-layout{grid-template-columns:1fr}.rsvp-need-row{grid-template-columns:1fr}}
`;
  }

  function month(v) { if (!v) return ""; try { return new Date(v).toLocaleString(undefined, { month: "short" }); } catch { return ""; } }
  function day(v) { if (!v) return ""; try { return new Date(v).getDate(); } catch { return ""; } }
  function eventImageHtml(ev) { const url = clean(ev.event_image_url || ev.image_url || ""); return url ? `<img src="${e(url)}" alt="">` : "▣"; }
  function eventHeader(ev) {
    return `<section class="rsvp-card rsvp-event"><div class="rsvp-date"><div>${e(month(ev.starts_at))}</div><strong>${e(day(ev.starts_at))}</strong><div>${new Date(ev.starts_at || Date.now()).getFullYear()}</div></div><div><div class="rsvp-pill">${e(ev.event_type_label || ev.category || "General")}</div><h2 style="margin:8px 0 4px">${e(ev.title || "Event")}</h2><div class="rsvp-meta">${e(ev.starts_at ? new Date(ev.starts_at).toLocaleString() : "")} ${ev.location_name ? " • " + e(ev.location_name) : ""}</div>${ev.location_address ? `<div class="rsvp-meta">${e(ev.location_address)}</div>` : ""}</div><div class="rsvp-event-image">${eventImageHtml(ev)}</div></section>`;
  }

  function statusChoiceHtml(current) {
    return `<div class="rsvp-field"><span>Are you coming?</span><div class="rsvp-choices"><label class="rsvp-choice yes"><input type="radio" name="rsvp-status" value="yes" ${current === "yes" ? "checked" : ""}><span class="rsvp-choice-text">Yes</span></label><label class="rsvp-choice maybe"><input type="radio" name="rsvp-status" value="maybe" ${current === "maybe" ? "checked" : ""}><span class="rsvp-choice-text">Maybe</span></label><label class="rsvp-choice no"><input type="radio" name="rsvp-status" value="no" ${current === "no" ? "checked" : ""}><span class="rsvp-choice-text">No</span></label></div></div>`;
  }

  function checklistData() {
    return state.payload?.checklist || state.payload?.rsvp_checklist || { items: [] };
  }
  function checklistItems() {
    const checklist = checklistData();
    return Array.isArray(checklist.items) ? checklist.items : Array.isArray(checklist.needed_items) ? checklist.needed_items : [];
  }
  function normalizedClaim(item) {
    const my = item.my_claim || item.viewer_claim || {};
    return { quantity: Number(my.quantity_claimed || my.quantity || 0), note: clean(my.note || "") };
  }

  function checklistHtml(canRsvp) {
    const items = checklistItems();
    if (!items.length) return "";
    const stillNeeded = items.filter((item) => Number(item.remaining || 0) > 0);
    const claimed = items.flatMap((item) => (Array.isArray(item.claims) ? item.claims : []).map((claim) => ({ item, claim })));
    const disableClaims = !canRsvp || ["no", "cancelled"].includes(document.querySelector('input[name="rsvp-status"]:checked')?.value || safeStatus(state.myRsvp?.response_status || "yes"));
    return `<section class="rsvp-card"><div class="rsvp-summary-head"><div><div class="rsvp-label">Bring-items / event needs</div><h3 style="margin:4px 0 8px">Help cover what is needed</h3></div></div><div class="rsvp-checklist-layout"><div class="rsvp-need-summary"><h4>Still needed</h4>${stillNeeded.length ? `<ul class="rsvp-need-list">${stillNeeded.map((item) => `<li><span>${e(item.label || item.item_label || "Item")}</span><strong>${e(item.remaining)}</strong></li>`).join("")}</ul>` : `<div class="rsvp-disabled" style="padding:10px">All listed items are covered.</div>`}</div><div class="rsvp-need-summary"><h4>Already claimed</h4>${claimed.length ? `<ul class="rsvp-need-list">${claimed.map(({ item, claim }) => `<li><span><span class="rsvp-claim-name">${e(claim.name || claim.respondent_name || "Claimed")}</span> — ${e(item.label || "Item")}${claim.note ? `<div class="rsvp-claim-note">${e(claim.note)}</div>` : ""}</span><strong>${e(claim.quantity_claimed || claim.quantity || 1)}</strong></li>`).join("")}</ul>` : `<div class="rsvp-disabled" style="padding:10px">Nothing claimed yet.</div>`}</div></div>${items.map((item, index) => { const claim = normalizedClaim(item); const max = Math.max(Number(item.remaining || 0) + Number(claim.quantity || 0), Number(claim.quantity || 0), 0); return `<div class="rsvp-need-row"><div><div class="rsvp-need-title">${e(item.label || item.item_label || `Item ${index + 1}`)}</div><div class="rsvp-need-meta">Needed: ${e(item.quantity_needed || 1)} • Claimed: ${e(item.quantity_claimed || item.total_claimed || 0)} • Still needed: ${e(item.remaining || 0)}</div>${item.notes ? `<div class="rsvp-need-meta">${e(item.notes)}</div>` : ""}</div><label class="rsvp-field"><span>Your quantity</span><input class="rsvp-claim-qty" data-need-id="${e(item.event_need_id || item.id)}" type="number" min="0" max="${e(max || 99)}" value="${e(claim.quantity)}" ${disableClaims ? "disabled" : ""}></label><label class="rsvp-field"><span>Item note</span><input class="rsvp-claim-note" data-need-id="${e(item.event_need_id || item.id)}" value="${e(claim.note)}" placeholder="Size, details, or clarification" ${disableClaims ? "disabled" : ""}></label></div>`; }).join("")}${disableClaims ? `<div class="rsvp-alert warn" style="margin-top:12px">Item claiming is available when your RSVP is Yes, Maybe, or Waitlist.</div>` : ""}</section>`;
  }

  function formHtml(ev) {
    const r = state.myRsvp || state.payload?.existing_rsvp || {};
    const current = safeStatus(r.response_status || "yes");
    const isMember = state.mode === "member";
    const can = ev.viewer_can_rsvp || ev.public_can_rsvp || ev.can_rsvp;
    if (!can) return `<div class="rsvp-disabled">${e(ev.viewer_rsvp_reason || "RSVP is not available for your account or this event.")}</div>`;
    const maxGuests = Number(ev.max_guests_per_rsvp || 0);
    return `<section class="rsvp-card"><div id="rsvp-alert"></div><div class="rsvp-summary-head"><div><div class="rsvp-label">Your RSVP</div><h3 style="margin:4px 0 12px">Are you coming?</h3></div>${state.myRsvp ? `<span class="rsvp-pill">Existing RSVP: ${e(statusLabel(state.myRsvp.response_status))}</span>` : `<span class="rsvp-pill">No saved RSVP yet</span>`}</div>${!isMember ? `<div class="rsvp-grid"><label class="rsvp-field"><span>Name *</span><input id="rsvp-name" value="${e(r.respondent_name || "")}"></label><label class="rsvp-field"><span>Email</span><input id="rsvp-email" type="email" value="${e(r.respondent_email || "")}"></label></div>` : ""}<div class="rsvp-status-row"><div>${statusChoiceHtml(current)}</div><label class="rsvp-check"><input id="rsvp-personal" type="checkbox" ${r.is_attending_personally !== false && r.attending_self !== false ? "checked" : ""}><span>I am attending personally<small>Uncheck only if responding for guests, but not yourself.</small></span></label></div><div class="rsvp-grid"><label class="rsvp-field"><span>Additional adults</span><input id="rsvp-adults" type="number" min="0" max="${e(maxGuests || 99)}" value="${e(r.additional_adults ?? r.adult_count ?? 0)}"></label><label class="rsvp-field"><span>Additional children</span><input id="rsvp-children" type="number" min="0" max="${e(maxGuests || 99)}" value="${e(r.additional_children ?? r.child_count ?? 0)}"></label></div><label class="rsvp-field"><span>Shared RSVP note</span><textarea id="rsvp-note" placeholder="Optional. Add what you are bringing, how you can help, or a brief note visible with your RSVP.">${e(r.shared_note || "")}</textarea></label><label class="rsvp-field"><span>Private note to self</span><textarea id="rsvp-private-note" placeholder="Optional note saved with your RSVP but not shown in the attendee list.">${e(r.private_note || "")}</textarea></label><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><strong>Total for your RSVP: <span id="rsvp-total">1</span></strong><div class="rsvp-actions"><span id="rsvp-save-status" class="rsvp-save-status"></span><button id="rsvp-submit" class="rsvp-btn">Save Changes</button></div></div></section>${checklistHtml(can)}`;
  }

  function summaryHtml() {
    const ev = state.payload?.event || {};
    const c = state.payload?.summary || state.payload?.rsvp_counts || ev.rsvp_counts || {};
    const rows = state.rsvps || [];
    const rowStatus = (r) => String(r.response_status || "no_response");
    return `<section class="rsvp-card"><div class="rsvp-summary-head"><div><div class="rsvp-label">Who's coming</div><h3 style="margin:4px 0 12px">RSVP Summary</h3></div></div><div class="rsvp-summary-grid"><div class="rsvp-stat"><small>Yes</small><strong>${e(c.yes || 0)}</strong></div><div class="rsvp-stat"><small>Maybe</small><strong>${e(c.maybe || 0)}</strong></div><div class="rsvp-stat"><small>No</small><strong>${e(c.no || 0)}</strong></div><div class="rsvp-stat"><small>Waitlist</small><strong>${e(c.waitlist || 0)}</strong></div><div class="rsvp-stat"><small>Total</small><strong>${e(c.total_attendees || c.attendees || 0)}</strong></div></div>${rows.length ? `<div class="rsvp-table-wrap"><table class="rsvp-table"><thead><tr><th>Member/contact</th><th>Status</th><th>Total</th><th>Note</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${e(r.respondent_name || r.display_name || r.email || "")}</td><td><span class="rsvp-pill ${rowStatus(r) === "no_response" ? "no-response" : ""}">${e(statusLabel(rowStatus(r)))}</span></td><td>${e(r.attendee_count || 0)}</td><td>${e(r.shared_note || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="rsvp-disabled" style="margin-top:12px">No response received so far.</div>`}</section>`;
  }

  function render() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    const ev = state.payload?.event;
    if (!ev) { root.innerHTML = `<div style="padding:20px">Loading RSVP…</div>`; return; }
    root.innerHTML = `<style>${css()}</style><section class="rsvp-page" style="${styleVars()}"><div class="rsvp-shell"><header class="rsvp-hero"><button id="rsvp-close" class="rsvp-close" type="button" aria-label="Return to calendar">×</button><div class="rsvp-pill" style="background:rgba(255,255,255,.18);color:#fff">Club Event RSVP</div><h1>Submit or update your RSVP</h1><p>Confirm the event below, update your RSVP, and see who else is coming.</p></header><main class="rsvp-main">${eventHeader(ev)}${formHtml(ev)}${summaryHtml()}${DEBUG ? `<pre class="rsvp-debug">RSVP ${VERSION}\nMode: ${e(state.mode)}\nEvent: ${e(ev.event_id)}\nCan RSVP: ${e(ev.viewer_can_rsvp || ev.public_can_rsvp || ev.can_rsvp)}\nChecklist items: ${e(checklistItems().length)}</pre>` : ""}</main></div></section>`;
    bind();
    updateTotal();
  }

  function updateTotal() {
    const status = document.querySelector('input[name="rsvp-status"]:checked')?.value || "yes";
    const total = status === "yes" ? Math.max(0, (checked("rsvp-personal") ? 1 : 0) + number(val("rsvp-adults")) + number(val("rsvp-children"))) : 0;
    const el = document.getElementById("rsvp-total");
    if (el) el.textContent = String(total);
  }

  function alert(msg, kind = "ok") {
    const el = document.getElementById("rsvp-alert");
    if (el) el.innerHTML = `<div class="rsvp-alert ${kind}">${e(msg)}</div>`;
  }

  function setDirty(value = true) { state.dirty = !!value; state.savedFlash = false; updateSaveUi(); }

  function updateSaveUi() {
    const status = document.getElementById("rsvp-save-status");
    const btn = document.getElementById("rsvp-submit");
    if (!status && !btn) return;
    if (status) {
      status.className = "rsvp-save-status";
      status.textContent = "";
      if (state.saving) { status.classList.add("saving"); status.textContent = "Saving…"; }
      else if (state.dirty) { status.classList.add("dirty"); status.textContent = "Unsaved changes"; }
      else if (state.savedFlash) { status.classList.add("saved"); status.textContent = "Saved"; }
    }
    if (btn) { btn.disabled = !!state.saving; btn.textContent = state.saving ? "Saving…" : (state.savedFlash ? "Saved" : "Save Changes"); }
  }

  function confirmLeaveIfDirty() { return !state.dirty || window.confirm("You have unsaved RSVP changes. Leave without saving?"); }
  window.addEventListener("beforeunload", function (event) { if (!state.dirty) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("keydown", function (event) { if (event.key === "Escape") leaveToCalendar(); });

  function collectClaimPayload() {
    const items = checklistItems();
    return items.map((item) => {
      const id = clean(item.event_need_id || item.id);
      return { event_need_id: id, quantity_claimed: number(document.querySelector(`.rsvp-claim-qty[data-need-id="${CSS.escape(id)}"]`)?.value || 0), note: document.querySelector(`.rsvp-claim-note[data-need-id="${CSS.escape(id)}"]`)?.value || "" };
    }).filter((row) => row.event_need_id);
  }

  function bind() {
    const trackIds = ["rsvp-name", "rsvp-email", "rsvp-personal", "rsvp-adults", "rsvp-children", "rsvp-note", "rsvp-private-note"];
    trackIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const handler = () => { updateTotal(); setDirty(true); };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });
    document.querySelectorAll('input[name="rsvp-status"]').forEach((x) => x.addEventListener("change", () => { updateTotal(); setDirty(true); render(); }));
    document.querySelectorAll(".rsvp-claim-qty,.rsvp-claim-note").forEach((x) => {
      const handler = () => setDirty(true);
      x.addEventListener("input", handler);
      x.addEventListener("change", handler);
    });
    const btn = document.getElementById("rsvp-submit");
    if (btn) btn.onclick = saveRsvp;
    const closeBtn = document.getElementById("rsvp-close");
    if (closeBtn) closeBtn.addEventListener("click", leaveToCalendar);
    updateSaveUi();
  }

  async function waitForSupabaseGlobal() {
    if (window.supabase?.createClient) return;
    await new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((s) => String(s.src || "").includes("supabase-js"));
      if (existing) {
        const started = Date.now();
        const timer = setInterval(() => {
          if (window.supabase?.createClient) { clearInterval(timer); resolve(); }
          else if (Date.now() - started > 8000) { clearInterval(timer); reject(new Error("Supabase script did not become ready.")); }
        }, 40);
        existing.addEventListener("error", () => { clearInterval(timer); reject(new Error("Supabase script failed.")); }, { once: true });
        return;
      }
      const sc = document.createElement("script");
      sc.src = SUPABASE_JS;
      sc.onload = () => resolve();
      sc.onerror = () => reject(new Error("Supabase script failed."));
      document.head.appendChild(sc);
    });
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    await waitForSupabaseGlobal();
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  async function publicCall(action, body) {
    const res = await fetch(PUBLIC_EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Action failed");
    return json;
  }

  async function accessCall(action, body) {
    const res = await fetch(ACCESS_EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Action failed");
    return json;
  }

  async function tryMemberContext(root) {
    try {
      const sb = await ensureSupabase();
      const { data } = await sb.auth.getSession();
      token = data?.session?.access_token || "";
      if (!token) return false;
      const dashboard = await accessCall("get_user_dashboard", {});
      const orgKeyWanted = orgKey(root);
      const rows = dashboard.access || [];
      const row = rows.find((r) => String(r.organization_key || "") === String(orgKeyWanted)) || rows[0];
      if (!row?.organization_id) return false;
      state.organizationId = row.organization_id;
      state.accessRow = row;
      const ctx = await accessCall("member_get_event_rsvp_context", { organization_id: row.organization_id, event_id: eventId() });
      state.mode = "member";
      state.payload = ctx;
      state.myRsvp = ctx.my_rsvp || ctx.existing_rsvp;
      state.rsvps = ctx.rsvps || [];
      return true;
    } catch (err) {
      if (DEBUG) console.warn("member rsvp context failed", err);
      return false;
    }
  }

  async function load(root) {
    root.innerHTML = `<div style="padding:20px">Loading RSVP…</div>`;
    if (await tryMemberContext(root)) { render(); return; }
    state.payload = await publicCall("get_event_rsvp_page", { event_id: eventId(), organization_key: orgKey(root) });
    state.rsvps = [];
    state.mode = "public";
    render();
  }

  async function saveRsvp() {
    if (state.saving) return;
    try {
      state.saving = true;
      updateSaveUi();
      const status = document.querySelector('input[name="rsvp-status"]:checked')?.value || "yes";
      const body = { event_id: state.payload.event.event_id, response_status: status, is_attending_personally: checked("rsvp-personal"), additional_adults: number(val("rsvp-adults")), additional_children: number(val("rsvp-children")), adult_count: number(val("rsvp-adults")), child_count: number(val("rsvp-children")), attending_self: checked("rsvp-personal"), shared_note: val("rsvp-note"), private_note: val("rsvp-private-note"), event_needed_item_claims: collectClaimPayload() };
      let res;
      if (state.mode === "member") {
        res = await accessCall("member_save_event_rsvp", { organization_id: state.organizationId, ...body });
        state.payload = res;
        state.myRsvp = res.my_rsvp || res.existing_rsvp || res.rsvp;
        state.rsvps = res.rsvps || [];
      } else {
        const name = clean(val("rsvp-name"));
        if (!name) throw new Error("Name is required.");
        res = await publicCall("submit_event_rsvp", { ...body, respondent_name: name, respondent_email: val("rsvp-email") });
        state.payload = await publicCall("get_event_rsvp_page", { event_id: eventId() });
      }
      state.dirty = false;
      state.savedFlash = true;
      render();
      alert(res.message || "RSVP saved.", "ok");
      setTimeout(() => { window.location.href = calendarReturnUrl(); }, 650);
    } catch (err) {
      alert(err.message, "bad");
    } finally {
      state.saving = false;
      updateSaveUi();
    }
  }

  function init() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    load(root).catch((err) => {
      root.innerHTML = `<div style="padding:20px;border:1px solid #f0b4b4;background:#fee2e2;color:#991b1b;border-radius:12px">${e(err.message)}</div>`;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
