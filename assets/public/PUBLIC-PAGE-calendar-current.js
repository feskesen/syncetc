// PUBLIC-PAGE-calendar-current.js
// Internal Version: 2026-06-09-093-E
// Purpose: Calendar / Events renderer with List, Compact, and Month views; connected multi-day month ribbons; public-safe event images/summaries; organization-themed event detail modal.

(function () {
  "use strict";

  const VERSION = "2026-06-09-093-E";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const PUBLIC_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-public-render`;
  const ACCESS_EDGE_URL = `${SUPABASE_URL}/functions/v1/core-access-action`;
  const ROOT_SELECTOR = "#syncetc-calendar-page-root";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const DEBUG = new URLSearchParams(location.search).has("syncetc_debug") || new URLSearchParams(location.search).has("debug");

  let supabaseClient = null;
  let publicPayload = null;

  const state = {
    events: [],
    view: "list",
    dateFilter: "upcoming",
    typeFilter: "",
    search: "",
    selectedEventId: "",
    viewer: "public",
    accessRow: null,
    monthCursor: firstOfMonth(new Date()),
  };

  function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function e(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function attr(v) { return e(v).replace(/`/g, "&#096;"); }
  function getJson(o, k) { const v = o && typeof o === "object" ? o[k] : null; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function getText(o, k, f = "") { const v = o && typeof o === "object" ? o[k] : undefined; return typeof v === "string" && v.trim() ? v.trim() : f; }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, days) { const n = new Date(d); n.setDate(n.getDate() + days); return n; }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function startOfWeek(d) { return addDays(startOfDay(d), -startOfDay(d).getDay()); }
  function endOfWeek(d) { return addDays(startOfWeek(d), 6); }
  function minDate(a, b) { return a.getTime() <= b.getTime() ? a : b; }
  function maxDate(a, b) { return a.getTime() >= b.getTime() ? a : b; }
  function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  function dayStartFromValue(v) { const d = parseDate(v); return d ? startOfDay(d) : null; }
  function fmtDate(v) { const d = parseDate(v); return d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : ""; }
  function fmtDateShort(v) { const d = parseDate(v); return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""; }
  function fmtTime(v) { const d = parseDate(v); return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""; }
  function month(v) { const d = parseDate(v); return d ? d.toLocaleDateString(undefined, { month: "short" }) : ""; }
  function day(v) { const d = parseDate(v); return d ? String(d.getDate()) : ""; }
  function year(v) { const d = parseDate(v); return d ? String(d.getFullYear()) : ""; }
  function monthTitle(d) { return d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
  function todayStart() { return startOfDay(new Date()); }

  function safeColor(v, fallback) {
    const s = clean(v);
    return /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(s) ? s : fallback;
  }

  function hashAccent(seed, cfg) {
    const colors = [cfg.primary, "#2f80c4", "#8a4d00", "#7c3aed", "#0f766e", "#b91c1c", "#475569"];
    const text = clean(seed || "event");
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return colors[h % colors.length] || cfg.primary;
  }

  function normalizeType(ev) {
    return clean(ev.event_type_label || ev.category || ev.event_type_key || getJson(ev, "event_type_json").label || "Event").toLowerCase();
  }

  function eventTypeLabel(ev) {
    return clean(ev.event_type_label || ev.category || getJson(ev, "event_type_json").label || "Event");
  }

  function eventAccent(ev, cfg) {
    const settings = getJson(ev, "settings_json");
    const type = getJson(ev, "event_type_json");
    return safeColor(
      ev.event_accent_color || ev.accent_color || ev.category_color || ev.event_type_color ||
      settings.accent_color || type.accent_color || type.color,
      hashAccent(eventTypeLabel(ev) || ev.title, cfg),
    );
  }

  function eventImage(ev, payload) {
    const settings = getJson(ev, "settings_json");
    const type = getJson(ev, "event_type_json");
    const loc = getJson(ev, "location_json");
    const asset = getJson(ev, "event_image_asset_json");
    const typeAsset = getJson(type, "image_asset_json");
    const direct = clean(
      ev.event_image_url || ev.image_url || ev.primary_image_url || ev.hero_image_url || ev.thumbnail_url ||
      asset.public_url || asset.url || settings.image_url || settings.event_image_url ||
      type.image_url || type.default_image_url || type.icon_url || typeAsset.public_url || typeAsset.url ||
      loc.image_url || loc.icon_url,
    );
    if (direct) return { url: direct, source: "event" };
    const logo = clean(payload?.site_shell?.logo?.url || payload?.site_shell?.logo?.original_url || payload?.organization?.logo_url || "");
    return logo ? { url: logo, source: "organization" } : { url: "", source: "fallback" };
  }

  function addressText(ev) { return clean(ev.location_address || ev.address || ev.street_address || ev.location_full_address || getJson(ev, "location_json").address || getJson(ev, "location_json").location_address); }
  function locationName(ev) { return clean(ev.location_name || getJson(ev, "location_json").location_name || getJson(ev, "location_json").name); }
  function mapQuery(ev) { const address = addressText(ev); const loc = locationName(ev); return clean(ev.map_query || [loc, address].filter(Boolean).join(" ")); }
  function mapsEmbedUrl(ev) { const embed = clean(ev.map_embed_url); if (embed) return embed; const q = mapQuery(ev); return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : ""; }
  function mapsOpenUrl(ev) { const q = mapQuery(ev); return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : ""; }
  function eventHref(ev) { return `/event-rsvp?event=${encodeURIComponent(ev.event_id || "")}`; }

  function eventEndDay(ev) {
    const start = dayStartFromValue(ev.starts_at);
    const end = dayStartFromValue(ev.ends_at);
    if (!start) return null;
    if (!end || end.getTime() < start.getTime()) return start;
    return end;
  }

  function isPast(ev) {
    const end = eventEndDay(ev);
    return end ? end.getTime() < todayStart().getTime() : false;
  }

  function searchTokens(ev) {
    const dates = [fmtDate(ev.starts_at), fmtDateShort(ev.starts_at), fmtDate(ev.ends_at), fmtDateShort(ev.ends_at)].join(" ");
    return [
      ev.title, ev.event_key, ev.event_type_label, ev.category, ev.location_name, ev.location_address,
      ev.map_query, ev.summary, ev.description, dates,
    ].map(clean).join(" ").toLowerCase();
  }

  function styleConfig(payload) {
    const p = payload?.style_profile || {};
    const c = getJson(p, "colors_json");
    const primary = getText(c, "brand_primary", "#1f4f82");
    const surface = getText(c, "surface", "#ffffff");
    const text = getText(c, "text", "#172033");
    return {
      primary,
      surface,
      text,
      secondary: getText(c, "brand_secondary", "#eef3f8"),
      soft: getText(c, "soft", "#f6f9fb"),
      border: "rgba(31,79,130,.18)",
      muted: "rgba(23,32,51,.68)",
      shadow: "0 14px 42px rgba(12,38,64,.14)",
    };
  }

  function css(cfg) {
    return `
      .syncetc-cal-page{width:100%;font-family:Arial,Helvetica,sans-serif;color:${cfg.text}}.syncetc-cal-page *{box-sizing:border-box}.syncetc-cal-shell{background:rgba(255,255,255,.94);border:1px solid ${cfg.border};border-radius:26px;box-shadow:${cfg.shadow};overflow:hidden}.syncetc-cal-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:32px;background:linear-gradient(135deg,${cfg.primary},rgba(31,79,130,.72));color:#fff}.syncetc-cal-eyebrow{display:inline-flex;margin-bottom:12px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.syncetc-cal-hero h1{margin:0;font-size:clamp(32px,4vw,50px);line-height:1.05}.syncetc-cal-hero p{max-width:820px;margin:12px 0 0;line-height:1.6;color:rgba(255,255,255,.9)}.syncetc-cal-main{padding:0;background:linear-gradient(180deg,rgba(31,79,130,.06),rgba(255,255,255,.9))}.syncetc-cal-toolbar{padding:20px 24px;border-bottom:1px solid ${cfg.border};background:#fff}.syncetc-cal-toolbar-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}.syncetc-cal-search{flex:1;min-width:240px;padding:11px 14px;border:1px solid ${cfg.border};border-radius:999px;font:inherit}.syncetc-cal-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.syncetc-cal-pill,.syncetc-cal-mode,.syncetc-month-nav{border:1px solid ${cfg.border};background:#fff;color:${cfg.primary};border-radius:999px;padding:9px 13px;font-weight:900;font-size:12px;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,background .12s ease,color .12s ease,border-color .12s ease}.syncetc-cal-pill:hover,.syncetc-cal-mode:hover,.syncetc-month-nav:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(12,38,64,.13);border-color:${cfg.primary}}.syncetc-cal-pill:active,.syncetc-cal-mode:active,.syncetc-month-nav:active{transform:translateY(0);box-shadow:0 2px 8px rgba(12,38,64,.12)}.syncetc-cal-pill.is-active,.syncetc-cal-mode.is-active{background:${cfg.primary};color:#fff;border-color:${cfg.primary}}.syncetc-cal-count{padding:14px 24px;border-bottom:1px solid ${cfg.border};font-weight:900;color:${cfg.muted};font-size:13px}.syncetc-cal-grid{display:grid;gap:16px;padding:22px 24px 28px}.syncetc-event-card{--event-accent:${cfg.primary};display:grid;grid-template-columns:96px minmax(0,1fr) 140px;gap:16px;border:1px solid ${cfg.border};border-left:7px solid var(--event-accent);border-radius:18px;background:#fff;box-shadow:0 8px 20px rgba(12,38,64,.08);overflow:hidden;cursor:pointer;transition:box-shadow .14s ease,transform .14s ease,border-color .14s ease}.syncetc-event-card:hover{border-color:var(--event-accent);box-shadow:0 12px 26px rgba(12,38,64,.13);transform:translateY(-1px)}.syncetc-datebox{background:${cfg.primary};color:#fff;text-align:center;display:grid;align-content:center;min-height:118px}.syncetc-date-month{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.syncetc-date-day{font-size:34px;line-height:1;font-weight:950}.syncetc-date-year{font-size:12px}.syncetc-event-body{padding:18px 0}.syncetc-tags{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}.syncetc-tag{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:${cfg.secondary};color:${cfg.primary};font-size:11px;font-weight:900;text-transform:uppercase}.syncetc-tag.accent{background:color-mix(in srgb,var(--event-accent) 12%,white);color:var(--event-accent);border:1px solid color-mix(in srgb,var(--event-accent) 18%,transparent)}.syncetc-tag.personal{background:#fff7ec;color:#8a4d00;border:1px solid rgba(138,77,0,.18)}.syncetc-tag.needed{background:#fee2e2;color:#991b1b;border:1px solid rgba(153,27,27,.18)}.syncetc-tag.rsvp-link{cursor:pointer;text-decoration:none}.syncetc-tag.rsvp-link:hover{filter:brightness(.96);box-shadow:0 3px 10px rgba(12,38,64,.10)}.syncetc-event-card h3{margin:0 0 5px;font-size:22px;color:${cfg.text};overflow-wrap:anywhere}.syncetc-event-meta{font-size:13px;color:${cfg.muted};font-weight:800}.syncetc-event-summary{margin:10px 0;color:${cfg.text};line-height:1.55}.syncetc-event-actionhint{margin-top:8px;font-size:12px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;color:${cfg.primary}}.syncetc-event-art{display:grid;place-items:center;border-left:1px solid ${cfg.border};background:rgba(31,79,130,.04);padding:16px}.syncetc-event-art img{width:104px;height:88px;border-radius:16px;border:1px solid ${cfg.border};object-fit:cover;background:#fff}.syncetc-event-icon{width:78px;height:78px;border-radius:16px;border:1px solid ${cfg.border};display:grid;place-items:center;background:#fff;color:var(--event-accent)}.syncetc-event-icon svg{width:48px;height:48px}.syncetc-cal-grid.compact{gap:10px}.syncetc-event-card.compact{grid-template-columns:72px minmax(0,1fr) 66px;border-radius:14px}.syncetc-event-card.compact .syncetc-datebox{min-height:76px}.syncetc-event-card.compact .syncetc-date-day{font-size:26px}.syncetc-event-card.compact .syncetc-date-year,.syncetc-event-card.compact .syncetc-event-summary,.syncetc-event-card.compact .syncetc-event-actionhint{display:none}.syncetc-event-card.compact .syncetc-event-body{padding:12px 0}.syncetc-event-card.compact h3{font-size:17px}.syncetc-event-card.compact .syncetc-event-art{padding:8px}.syncetc-event-card.compact .syncetc-event-art img{width:48px;height:48px;border-radius:10px}.syncetc-event-card.compact .syncetc-event-icon{width:44px;height:44px}.syncetc-event-card.compact .syncetc-event-icon svg{width:28px;height:28px}.syncetc-empty{padding:22px;border:1px dashed ${cfg.border};border-radius:18px;background:#fff;color:${cfg.muted};text-align:center;font-weight:800}.syncetc-month-shell{padding:18px 24px 28px}.syncetc-month-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.syncetc-month-title{margin:0;font-size:24px;color:${cfg.primary}}.syncetc-month-controls{display:flex;gap:8px;flex-wrap:wrap}.syncetc-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.syncetc-month-dow{font-size:12px;font-weight:950;text-transform:uppercase;color:${cfg.muted};padding:0 8px 4px}.syncetc-month-day{min-height:124px;border:1px solid ${cfg.border};border-radius:16px;background:#fff;padding:8px;display:flex;flex-direction:column;gap:6px;overflow:visible}.syncetc-month-day.outside{opacity:.48;background:#f8fafc}.syncetc-month-day.today{box-shadow:0 0 0 3px color-mix(in srgb,${cfg.primary} 18%,transparent)}.syncetc-month-num{font-size:13px;font-weight:950;color:${cfg.primary}}.syncetc-month-events{display:grid;gap:5px;position:relative;overflow:visible}.syncetc-month-event,.syncetc-month-event-spacer{min-height:37px}.syncetc-month-event{--event-accent:${cfg.primary};position:relative;z-index:1;font:12px/1.22 Arial,Helvetica,sans-serif;text-align:left;color:${cfg.text};background:color-mix(in srgb,var(--event-accent) 9%,#fff);border:1px solid color-mix(in srgb,var(--event-accent) 20%,transparent);border-bottom:5px solid var(--event-accent);border-radius:10px;padding:5px 7px;cursor:pointer;overflow:hidden}.syncetc-month-event:hover{z-index:4;box-shadow:0 4px 12px rgba(12,38,64,.16);filter:brightness(.99)}.syncetc-month-event.single{border-left:5px solid var(--event-accent);border-right:5px solid var(--event-accent)}.syncetc-month-event.start{border-left:5px solid var(--event-accent);border-top-right-radius:3px;border-bottom-right-radius:3px;margin-right:-12px;padding-right:16px}.syncetc-month-event.end{border-right:5px solid var(--event-accent);border-top-left-radius:3px;border-bottom-left-radius:3px;margin-left:-12px;padding-left:16px}.syncetc-month-event.continues-left{border-left-color:transparent;border-top-left-radius:0;border-bottom-left-radius:0;margin-left:-12px;padding-left:16px}.syncetc-month-event.continues-right{border-right-color:transparent;border-top-right-radius:0;border-bottom-right-radius:0;margin-right:-12px;padding-right:16px}.syncetc-month-event.row-start{margin-left:0;padding-left:7px}.syncetc-month-event.row-end{margin-right:0;padding-right:7px}.syncetc-month-event.middle{border-left-color:transparent;border-right-color:transparent;border-radius:3px;margin-left:-12px;margin-right:-12px;padding-left:16px;padding-right:16px}.syncetc-month-event b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.syncetc-month-event small{display:block;color:${cfg.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.syncetc-month-more{font-size:12px;font-weight:900;color:${cfg.muted};padding:0 3px}.syncetc-month-event-spacer{pointer-events:none}.syncetc-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}.syncetc-modal{--event-accent:${cfg.primary};width:min(860px,96vw);max-height:90vh;overflow:auto;border-radius:24px;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.32);border:1px solid ${cfg.border}}.syncetc-modal-head{display:flex;justify-content:space-between;gap:16px;padding:26px 28px;color:#fff;background:linear-gradient(135deg,${cfg.primary},color-mix(in srgb,${cfg.primary} 70%,#000));border-radius:24px 24px 0 0}.syncetc-modal-head h2{margin:0;font-size:32px;line-height:1.1}.syncetc-modal-head p{margin:8px 0 0;color:rgba(255,255,255,.9)}.syncetc-close{width:42px;height:42px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;border-radius:999px;font-size:28px;line-height:1;cursor:pointer}.syncetc-close:hover{background:rgba(255,255,255,.24)}.syncetc-modal-main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;padding:22px;background:${cfg.soft}}.syncetc-detail-card{border:1px solid ${cfg.border};background:#fff;border-radius:18px;padding:16px;margin-bottom:14px}.syncetc-detail-label{font-size:11px;font-weight:950;color:${cfg.primary};letter-spacing:.07em;text-transform:uppercase;margin-bottom:7px}.syncetc-media-card{padding:0;overflow:hidden}.syncetc-media-card img{display:block;width:100%;max-height:300px;object-fit:cover;background:#fff}.syncetc-rsvp-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:11px 15px;background:${cfg.primary};color:#fff;text-decoration:none;font-weight:950;border:1px solid ${cfg.primary}}.syncetc-rsvp-btn:hover{filter:brightness(.95)}.syncetc-address-text{line-height:1.45}.syncetc-map-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.syncetc-map-link{font-size:12px;font-weight:900;color:${cfg.primary}}.syncetc-map-frame{width:100%;height:210px;border:0;border-radius:14px;background:#f8fafc}.syncetc-map-placeholder{padding:16px;border:1px dashed ${cfg.border};border-radius:14px;color:${cfg.muted};text-align:center;font-weight:800}.syncetc-posted{font-size:12px;color:${cfg.muted};font-weight:800;text-align:right}.syncetc-debug{margin:18px 24px 24px;padding:14px;background:#0f172a;color:#dbeafe;border-radius:14px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;overflow:auto}.syncetc-mobile-only{display:none}@media(max-width:760px){.syncetc-cal-hero{padding:24px;display:block}.syncetc-event-card,.syncetc-event-card.compact{grid-template-columns:74px minmax(0,1fr);gap:12px}.syncetc-event-art{display:none}.syncetc-month-grid{gap:4px}.syncetc-month-day{min-height:94px;border-radius:12px;padding:6px}.syncetc-month-dow{font-size:10px;padding:0 4px 3px}.syncetc-month-event{font-size:11px;padding:5px}.syncetc-modal-main{grid-template-columns:1fr}.syncetc-modal-head h2{font-size:25px}.syncetc-cal-toolbar-row{display:grid}.syncetc-cal-search{min-width:0;width:100%}}`;
  }

  function visibleEvents() {
    const q = clean(state.search).toLowerCase();
    const today = todayStart();
    return (state.events || []).filter((ev) => {
      if (state.dateFilter === "upcoming" && isPast(ev)) return false;
      if (state.dateFilter === "past" && !isPast(ev)) return false;
      if (state.typeFilter && normalizeType(ev) !== state.typeFilter) return false;
      if (q && !searchTokens(ev).includes(q)) return false;
      return true;
    }).sort((a, b) => {
      const ad = parseDate(a.starts_at)?.getTime() || 0;
      const bd = parseDate(b.starts_at)?.getTime() || 0;
      return ad - bd || clean(a.title).localeCompare(clean(b.title));
    });
  }

  function eventActionHint(ev) { return ev.rsvp_enabled ? "Click for details or RSVP" : "Click for details"; }

  function personalRsvpStatus(ev) {
    const raw = clean(ev.viewer_rsvp_status || ev.my_rsvp_status || ev.my_rsvp?.response_status || ev.current_user_rsvp?.response_status).toLowerCase();
    const attending = Number(ev.viewer_attendee_count || ev.my_rsvp?.attendee_count || ev.current_user_rsvp?.attendee_count || 0);
    if (!raw) return "";
    if (raw === "yes") return attending > 1 ? `Your RSVP: Yes · Party of ${attending}` : "Your RSVP: Yes";
    if (raw === "maybe") return "Your RSVP: Maybe";
    if (raw === "no") return "Your RSVP: No";
    if (raw === "waitlist") return "Your RSVP: Waitlist";
    return "Your RSVP: Needed";
  }

  function rsvpPillHtml(ev) {
    if (!ev.rsvp_enabled) return "";
    const personal = personalRsvpStatus(ev) || (ev.public_can_rsvp || ev.viewer_can_rsvp || ev.can_rsvp ? "RSVP" : "View RSVP");
    return `<a class="syncetc-tag personal rsvp-link" href="${attr(eventHref(ev))}" data-rsvp-jump="1">${e(personal)}</a>`;
  }

  function calendarIconSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="14" width="44" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 25h44" stroke="currentColor" stroke-width="4"/><path d="M22 10v10M42 10v10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M21 34h7M36 34h7M21 43h7M36 43h7" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
  }

  function eventArtHtml(ev, payload, large) {
    const img = eventImage(ev, payload || {});
    if (img.url) return `<img src="${attr(img.url)}" alt="${attr(ev.title || "Event image")}" loading="lazy">`;
    return `<div class="syncetc-event-icon">${calendarIconSvg()}</div>`;
  }

  function dateRangeText(ev) {
    const start = fmtDate(ev.starts_at);
    const st = fmtTime(ev.starts_at);
    const endDay = eventEndDay(ev);
    const startDay = dayStartFromValue(ev.starts_at);
    const endDateText = ev.ends_at && endDay && startDay && !sameDay(endDay, startDay) ? ` – ${fmtDate(ev.ends_at)}` : "";
    return clean(`${start}${endDateText}${st ? ", " + st : ""}`);
  }

  function eventCard(ev, compact = false) {
    const cfg = styleConfig(publicPayload || {});
    const accent = eventAccent(ev, cfg);
    const meta = [dateRangeText(ev), locationName(ev)].filter(Boolean).join(" • ");
    const rsvpPill = rsvpPillHtml(ev);
    const summary = clean(ev.summary || ev.short_summary || "");
    return `<article class="syncetc-event-card ${compact ? "compact" : ""}" style="--event-accent:${attr(accent)}" data-event-id="${attr(ev.event_id)}"><div class="syncetc-datebox"><div class="syncetc-date-month">${e(month(ev.starts_at))}</div><div class="syncetc-date-day">${e(day(ev.starts_at))}</div><div class="syncetc-date-year">${e(year(ev.starts_at))}</div></div><div class="syncetc-event-body"><div class="syncetc-tags"><span class="syncetc-tag accent">${e(eventTypeLabel(ev))}</span>${rsvpPill}${ev.rsvp_audience && ev.rsvp_audience !== "public" ? `<span class="syncetc-tag">${e(ev.rsvp_audience)}</span>` : ""}</div><h3>${e(ev.title)}</h3><div class="syncetc-event-meta">${e(meta)}</div>${summary ? `<p class="syncetc-event-summary">${e(summary)}</p>` : ""}<div class="syncetc-event-actionhint">${e(eventActionHint(ev))}</div></div><div class="syncetc-event-art">${eventArtHtml(ev, publicPayload || {}, false)}</div></article>`;
  }

  function eventsForMonthDay(dayDate) {
    const dayMs = startOfDay(dayDate).getTime();
    return visibleEvents().filter((ev) => {
      const s = dayStartFromValue(ev.starts_at);
      const eDay = eventEndDay(ev);
      if (!s || !eDay) return false;
      return s.getTime() <= dayMs && eDay.getTime() >= dayMs;
    });
  }

  function monthEventPart(ev, dayDate) {
    const s = dayStartFromValue(ev.starts_at);
    const eDay = eventEndDay(ev);
    if (!s || !eDay) return "single";
    const isStart = sameDay(s, dayDate);
    const isEnd = sameDay(eDay, dayDate);
    const continuesBefore = s.getTime() < startOfDay(dayDate).getTime();
    const continuesAfter = eDay.getTime() > startOfDay(dayDate).getTime();
    const rowStart = dayDate.getDay() === 0;
    const rowEnd = dayDate.getDay() === 6;
    if (isStart && isEnd) return "single";
    const classes = [];
    if (isStart) classes.push("start"); else if (continuesBefore) classes.push("continues-left");
    if (isEnd) classes.push("end"); else if (continuesAfter) classes.push("continues-right");
    if (rowStart && !isStart && continuesBefore) classes.push("row-start");
    if (rowEnd && !isEnd && continuesAfter) classes.push("row-end");
    if (!classes.length) classes.push("middle");
    return classes.join(" ");
  }

  function monthEventSubtext(ev, dayDate) {
    const s = dayStartFromValue(ev.starts_at);
    const eDay = eventEndDay(ev);
    if (!s || !eDay) return fmtTime(ev.starts_at);
    const isStart = sameDay(s, dayDate);
    const isEnd = sameDay(eDay, dayDate);
    const st = fmtTime(ev.starts_at);
    const et = fmtTime(ev.ends_at);
    if (isStart && isEnd) return st;
    if (isStart) return st ? `starts ${st}` : "starts";
    if (isEnd) return et ? `… until ${et}` : "… ends";
    return "… continuing …";
  }

  function monthEventsWithLanes(days) {
    const gridStart = startOfDay(days[0]);
    const gridEnd = startOfDay(days[days.length - 1]);
    const monthEvents = visibleEvents().filter((ev) => {
      const s = dayStartFromValue(ev.starts_at);
      const end = eventEndDay(ev);
      return s && end && s.getTime() <= gridEnd.getTime() && end.getTime() >= gridStart.getTime();
    }).sort((a, b) => {
      const as = dayStartFromValue(a.starts_at)?.getTime() || 0;
      const bs = dayStartFromValue(b.starts_at)?.getTime() || 0;
      if (as !== bs) return as - bs;
      const ae = eventEndDay(a)?.getTime() || as;
      const be = eventEndDay(b)?.getTime() || bs;
      return (be - bs) - (ae - as);
    });
    const laneEnds = [];
    const laneById = new Map();
    monthEvents.forEach((ev) => {
      const s = maxDate(dayStartFromValue(ev.starts_at), gridStart);
      const end = minDate(eventEndDay(ev), gridEnd);
      const startMs = s.getTime();
      let lane = laneEnds.findIndex((endMs) => endMs < startMs);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = end.getTime();
      laneById.set(String(ev.event_id), lane);
    });
    return { monthEvents, laneById };
  }

  function monthViewHtml() {
    const cfg = styleConfig(publicPayload || {});
    const cursor = firstOfMonth(state.monthCursor || new Date());
    const first = firstOfMonth(cursor);
    const gridStart = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const { laneById } = monthEventsWithLanes(days);
    const maxVisibleLanes = 4;
    const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `<section class="syncetc-month-shell"><div class="syncetc-month-head"><h2 class="syncetc-month-title">${e(monthTitle(cursor))}</h2><div class="syncetc-month-controls"><button class="syncetc-month-nav" data-month-nav="prev">← Previous</button><button class="syncetc-month-nav" data-month-nav="today">This Month</button><button class="syncetc-month-nav" data-month-nav="next">Next →</button></div></div><div class="syncetc-month-grid">${dows.map((d) => `<div class="syncetc-month-dow">${e(d)}</div>`).join("")}${days.map((d) => {
      const inMonth = d.getMonth() === cursor.getMonth();
      const allDayEvents = eventsForMonthDay(d).sort((a, b) => (laneById.get(String(a.event_id)) ?? 999) - (laneById.get(String(b.event_id)) ?? 999));
      const visibleDayEvents = allDayEvents.filter((ev) => (laneById.get(String(ev.event_id)) ?? 999) < maxVisibleLanes);
      const maxLane = Math.max(-1, ...visibleDayEvents.map((ev) => laneById.get(String(ev.event_id)) ?? 0));
      const byLane = new Map(visibleDayEvents.map((ev) => [laneById.get(String(ev.event_id)) ?? 0, ev]));
      const extra = Math.max(0, allDayEvents.length - visibleDayEvents.length);
      const slots = Array.from({ length: Math.max(0, maxLane + 1) }, (_, lane) => {
        const ev = byLane.get(lane);
        if (!ev) return `<div class="syncetc-month-event-spacer" aria-hidden="true"></div>`;
        const accent = eventAccent(ev, cfg);
        const part = monthEventPart(ev, d);
        const subtext = monthEventSubtext(ev, d);
        return `<button type="button" class="syncetc-month-event ${attr(part)}" style="--event-accent:${attr(accent)}" data-event-id="${attr(ev.event_id)}"><b>${e(ev.title)}</b>${subtext ? `<small>${e(subtext)}</small>` : ""}</button>`;
      }).join("");
      return `<div class="syncetc-month-day ${inMonth ? "" : "outside"} ${sameDay(d, new Date()) ? "today" : ""}"><div class="syncetc-month-num">${d.getDate()}</div><div class="syncetc-month-events">${slots}${extra ? `<div class="syncetc-month-more">+${extra} more</div>` : ""}</div></div>`;
    }).join("")}</div></section>`;
  }

  function modalHtml(ev, cfg, payload) {
    const accent = eventAccent(ev, cfg);
    const meta = [dateRangeText(ev), locationName(ev)].filter(Boolean).join(" • ");
    const can = ev.public_can_rsvp || ev.viewer_can_rsvp || ev.can_rsvp;
    const loc = locationName(ev);
    const addr = addressText(ev);
    const embed = mapsEmbedUrl(ev);
    const open = mapsOpenUrl(ev);
    const posted = clean(ev.posted_by_name || ev.created_by_name || ev.updated_by_email || ev.created_by_email || ev.posted_by_email);
    const summary = clean(ev.summary || ev.short_summary || "");
    const description = clean(ev.description || ev.full_description || "");
    return `<div class="syncetc-modal-backdrop" id="syncetc-event-modal"><div class="syncetc-modal"><header class="syncetc-modal-head"><div><div class="syncetc-cal-eyebrow">${e(eventTypeLabel(ev))}</div><h2>${e(ev.title)}</h2><p>${e(meta)}</p></div><button class="syncetc-close" id="syncetc-modal-close" aria-label="Close">×</button></header><main class="syncetc-modal-main"><section><div class="syncetc-detail-card syncetc-media-card">${eventArtHtml(ev, payload, true)}</div><div class="syncetc-detail-card"><div class="syncetc-detail-label">Details</div>${summary ? `<p><strong>${e(summary)}</strong></p>` : ""}${description ? `<p>${e(description)}</p>` : (!summary ? `<p>No additional details have been posted yet.</p>` : "")}${ev.rsvp_enabled ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><a class="syncetc-rsvp-btn" href="${attr(eventHref(ev))}">${can ? "RSVP / View Attendees" : "View RSVP"}</a></div>` : ""}</div></section><aside><div class="syncetc-detail-card"><div class="syncetc-detail-label">Date and time</div>${e(dateRangeText(ev) || "Not set")}</div><div class="syncetc-detail-card"><div class="syncetc-detail-label">Location</div><div class="syncetc-address-text">${e(loc || "Location not set")}</div></div><div class="syncetc-detail-card"><div class="syncetc-detail-label">Address</div><div class="syncetc-address-text">${addr ? e(addr) : "Address not provided"}</div></div><div class="syncetc-detail-card"><div class="syncetc-detail-label">RSVP</div>${ev.rsvp_enabled ? `Audience: ${e(ev.rsvp_audience || "public")}<br>Capacity: ${e(ev.capacity || "No limit")}` : "RSVP is not enabled."}</div><div class="syncetc-detail-card syncetc-map-card"><div class="syncetc-map-head"><span class="syncetc-detail-label" style="margin:0">Map</span>${open ? `<a class="syncetc-map-link" target="_blank" rel="noopener" href="${attr(open)}">Open in Maps</a>` : ""}</div>${embed ? `<iframe class="syncetc-map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${attr(embed)}"></iframe>` : `<div class="syncetc-map-placeholder">Map will appear when an address is provided.</div>`}</div>${posted ? `<div class="syncetc-posted">Posted by: ${e(posted)}</div>` : ""}</aside></main></div></div>`;
  }

  function renderEventsArea() {
    const list = visibleEvents();
    if (state.view === "month") return monthViewHtml();
    const compact = state.view === "compact";
    return `<section class="syncetc-cal-grid ${compact ? "compact" : ""}" id="syncetc-cal-list">${list.length ? list.map((ev) => eventCard(ev, compact)).join("") : `<div class="syncetc-empty">No events match this view.</div>`}</section>`;
  }

  function renderBody(payload) {
    const cfg = styleConfig(payload);
    const settings = payload.page_settings || {};
    const content = getJson(settings, "content_json");
    const label = getText(content, "events_label", getText(content, "hero_eyebrow", "Calendar"));
    const title = getText(content, "events_title", getText(content, "hero_title", "Calendar / Events"));
    const intro = getText(content, "events_intro", getText(content, "hero_intro", "Upcoming meetings, fly-outs, work parties, and events."));
    const uniqueTypes = [...new Set((state.events || []).map((ev) => normalizeType(ev)).filter(Boolean))].slice(0, 10);
    const list = visibleEvents();
    return {
      css: css(cfg),
      html: `<section class="syncetc-cal-page"><div class="syncetc-cal-shell"><header class="syncetc-cal-hero"><div><div class="syncetc-cal-eyebrow">${e(label)}</div><h1>${e(title)}</h1>${intro ? `<p>${e(intro)}</p>` : ""}</div><div class="syncetc-cal-filters"><button class="syncetc-cal-mode ${state.view === "month" ? "is-active" : ""}" data-view="month">Month</button><button class="syncetc-cal-mode ${state.view === "list" ? "is-active" : ""}" data-view="list">List</button><button class="syncetc-cal-mode ${state.view === "compact" ? "is-active" : ""}" data-view="compact">Compact</button></div></header><main class="syncetc-cal-main"><section class="syncetc-cal-toolbar"><div class="syncetc-cal-toolbar-row"><input id="syncetc-cal-search" class="syncetc-cal-search" value="${attr(state.search)}" placeholder="Search title, type, location, address, or date"><div class="syncetc-cal-filters"><button class="syncetc-cal-pill ${state.dateFilter === "upcoming" ? "is-active" : ""}" data-date-filter="upcoming">Upcoming</button><button class="syncetc-cal-pill ${state.dateFilter === "past" ? "is-active" : ""}" data-date-filter="past">Past</button><button class="syncetc-cal-pill ${state.dateFilter === "all" ? "is-active" : ""}" data-date-filter="all">All Dates</button>${uniqueTypes.map((t) => `<button class="syncetc-cal-pill ${state.typeFilter === t ? "is-active" : ""}" data-type-filter="${attr(t)}">${e(t.replace(/\b\w/g, (c) => c.toUpperCase()))}</button>`).join("")}${state.typeFilter ? `<button class="syncetc-cal-pill" data-type-filter="">Clear Type</button>` : ""}</div></div></section><div class="syncetc-cal-count">${list.length} visible event${list.length === 1 ? "" : "s"}.</div>${renderEventsArea()}${DEBUG ? `<pre class="syncetc-debug">Calendar ${VERSION}\nViewer: ${e(state.viewer)}\nEvents: ${state.events.length}\nView: ${e(state.view)}\nFilter: ${e(state.dateFilter)}${state.typeFilter ? `\nType: ${e(state.typeFilter)}` : ""}</pre>` : ""}</main></div></section>`,
    };
  }

  function mount(payload) {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    const built = renderBody(payload);
    if (window.SyncEtcPublicShell && typeof window.SyncEtcPublicShell.render === "function") {
      window.SyncEtcPublicShell.render({ root, payload, activePageKey: payload.page?.page_key || "calendar", extraCss: built.css, bodyHtml: built.html });
    } else {
      root.innerHTML = `<style>${built.css}</style>${built.html}`;
    }
    bind(payload);
  }

  function rerender(payload) { mount(payload || publicPayload || {}); }

  function bind(payload) {
    document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => { state.view = btn.dataset.view || "list"; rerender(payload); }));
    document.querySelectorAll("[data-date-filter]").forEach((btn) => btn.addEventListener("click", () => { state.dateFilter = btn.dataset.dateFilter || "upcoming"; rerender(payload); }));
    document.querySelectorAll("[data-type-filter]").forEach((btn) => btn.addEventListener("click", () => { state.typeFilter = btn.dataset.typeFilter || ""; rerender(payload); }));
    document.querySelectorAll("[data-month-nav]").forEach((btn) => btn.addEventListener("click", () => {
      const action = btn.dataset.monthNav;
      const base = firstOfMonth(state.monthCursor || new Date());
      if (action === "prev") state.monthCursor = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      else if (action === "next") state.monthCursor = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      else state.monthCursor = firstOfMonth(new Date());
      rerender(payload);
    }));
    const search = document.getElementById("syncetc-cal-search");
    if (search) search.addEventListener("input", () => { state.search = search.value || ""; rerender(payload); });
    bindCards(payload);
  }

  function bindCards(payload) {
    const cfg = styleConfig(payload);
    document.querySelectorAll('[data-rsvp-jump="1"]').forEach((link) => link.addEventListener("click", (ev) => { ev.stopPropagation(); }));
    document.querySelectorAll("[data-event-id]").forEach((el) => {
      if (el.dataset.boundOpen === "1") return;
      el.dataset.boundOpen = "1";
      el.addEventListener("click", (evt) => {
        if (evt.target && evt.target.closest && evt.target.closest('[data-rsvp-jump="1"]')) return;
        const ev = state.events.find((x) => String(x.event_id) === String(el.dataset.eventId));
        if (!ev) return;
        document.getElementById("syncetc-event-modal")?.remove();
        document.body.insertAdjacentHTML("beforeend", modalHtml(ev, cfg, payload));
        const close = () => document.getElementById("syncetc-event-modal")?.remove();
        document.getElementById("syncetc-modal-close")?.addEventListener("click", close);
        document.getElementById("syncetc-event-modal")?.addEventListener("click", (clickEvt) => { if (clickEvt.target.id === "syncetc-event-modal") close(); });
      });
    });
  }

  async function publicCall(action, body) {
    const res = await fetch(PUBLIC_EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Unable to load calendar.");
    return json;
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || !window.supabase.createClient) {
      await new Promise((resolve, reject) => {
        const existing = [...document.scripts].find((s) => String(s.src || "").includes("supabase-js"));
        if (existing && window.supabase?.createClient) return resolve();
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Supabase script failed.")), { once: true });
          return;
        }
        const sc = document.createElement("script");
        sc.src = SUPABASE_JS;
        sc.onload = () => resolve();
        sc.onerror = () => reject(new Error("Supabase script failed."));
        document.head.appendChild(sc);
      });
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  async function accessCall(action, token, body) {
    const res = await fetch(ACCESS_EDGE_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Access action failed.");
    return json;
  }

  function maybeSetInitialMonth(events) {
    const upcoming = (events || []).filter((ev) => !isPast(ev) && parseDate(ev.starts_at)).sort((a, b) => parseDate(a.starts_at).getTime() - parseDate(b.starts_at).getTime())[0];
    if (upcoming) state.monthCursor = firstOfMonth(parseDate(upcoming.starts_at));
    else state.monthCursor = firstOfMonth(new Date());
  }

  async function tryLoadMemberEvents(payload) {
    try {
      const sb = await ensureSupabase();
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const access = await accessCall("get_user_dashboard", token, { organization_id: payload.organization?.organization_id });
      const row = (access.access || [])[0];
      if (!row?.organization_id) return;
      const events = await accessCall("member_list_events", token, { organization_id: row.organization_id, include_hidden: false, include_past: true });
      if (Array.isArray(events.events) && events.events.length) {
        state.events = events.events;
        state.viewer = row.is_organization_admin ? "admin" : "user";
        state.accessRow = row;
        maybeSetInitialMonth(state.events);
        mount(payload);
      }
    } catch (err) {
      if (DEBUG) console.warn("member calendar load failed", err);
    }
  }

  async function load(root) {
    const org = root.dataset.organizationKey || root.dataset.customerKey || "test-customer-1";
    const page = root.dataset.pageKey || "calendar";
    root.innerHTML = '<div style="padding:20px">Loading calendar…</div>';
    publicPayload = await publicCall("get_calendar_page", { organization_key: org, page_key: page, render_mode: DEBUG ? "debug" : "public" });
    state.events = Array.isArray(publicPayload.events) ? publicPayload.events : [];
    state.viewer = "public";
    maybeSetInitialMonth(state.events);
    mount(publicPayload);
    await tryLoadMemberEvents(publicPayload);
  }

  function init() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    load(root).catch((err) => {
      root.innerHTML = `<div style="padding:20px;border:1px solid #f0b4b4;background:#fee2e2;color:#991b1b;border-radius:12px">${e(err.message)}</div>`;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
