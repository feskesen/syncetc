// index.ts
// Deploy target: Supabase Edge Function named core-public-render
// JWT verification: OFF
// Internal Version: 2026-06-10-107-C
// Purpose: public-safe render payloads for SyncEtc pages, including Home, Aircraft, Gallery, Info/FAQ, Documents, Calendar/Events, applicant intake, and privacy-first contact inquiry intake.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
type SupabaseClientAny = any;
declare const Deno: { env: { get: (key: string) => string | undefined } };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
    },
  });
}

function normalizeKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonObject(value: unknown): JsonRecord {
  return isObject(value) ? value : {};
}

function boolFromJson(source: JsonRecord, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

function money(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function encodeStoragePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeStoragePath(path: string): string {
  try {
    return decodeURIComponent(path.replace(/^\/+/, ""));
  } catch {
    return path.replace(/^\/+/, "");
  }
}

function getStoragePathFromPublicReference(supabaseUrl: string, bucket: string, pathOrUrl: unknown): string | null {
  const value = cleanString(pathOrUrl);
  if (!value || value === "#" || value.toLowerCase() === "null") return null;

  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, "");
  }

  try {
    const project = new URL(supabaseUrl);
    const url = new URL(value);
    if (url.origin !== project.origin) return null;

    const objectPrefix = `/storage/v1/object/public/${bucket}/`;
    const renderPrefix = `/storage/v1/render/image/public/${bucket}/`;

    if (url.pathname.startsWith(objectPrefix)) {
      return decodeStoragePath(url.pathname.slice(objectPrefix.length));
    }

    if (url.pathname.startsWith(renderPrefix)) {
      return decodeStoragePath(url.pathname.slice(renderPrefix.length));
    }

    return null;
  } catch {
    return null;
  }
}

function publicStorageObjectUrl(supabaseUrl: string, bucket: string, pathOrUrl: unknown): string | null {
  const value = cleanString(pathOrUrl);
  if (!value || value === "#" || value.toLowerCase() === "null") return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeStoragePath(value)}`;
}

function publicStorageImageUrl(
  supabaseUrl: string,
  bucket: string,
  pathOrUrl: unknown,
  maxWidth: number,
  quality = 72,
): string | null {
  const storagePath = getStoragePathFromPublicReference(supabaseUrl, bucket, pathOrUrl);
  if (!storagePath) return publicStorageObjectUrl(supabaseUrl, bucket, pathOrUrl);

  const boundedMax = Math.max(1, Math.min(2500, Math.round(maxWidth)));
  const safeQuality = Math.max(20, Math.min(100, Math.round(quality)));
  const params = new URLSearchParams();

  // Supabase crops when only one dimension is supplied.
  // Use a square bounding box with resize=contain so this behaves like "max side" sizing, not forced cropping.
  params.set("width", String(boundedMax));
  params.set("height", String(boundedMax));
  params.set("resize", "contain");
  params.set("quality", String(safeQuality));

  return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${encodeStoragePath(storagePath)}?${params.toString()}`;
}

function publicStorageImageSrcset(
  supabaseUrl: string,
  bucket: string,
  pathOrUrl: unknown,
  widths: number[],
  quality = 72,
): string | null {
  const storagePath = getStoragePathFromPublicReference(supabaseUrl, bucket, pathOrUrl);
  if (!storagePath) return null;

  const uniqueWidths = Array.from(new Set(widths))
    .filter((width) => Number.isFinite(width) && width > 0)
    .sort((a, b) => a - b);

  if (!uniqueWidths.length) return null;

  return uniqueWidths
    .map((width) => `${publicStorageImageUrl(supabaseUrl, bucket, storagePath, width, quality)} ${width}w`)
    .join(", ");
}

function extractYouTubeId(raw: unknown): string {
  const value = cleanString(raw);
  if (!value) return "";

  const srcMatch = value.match(/src=["']([^"']+)["']/i);
  const cleaned = srcMatch?.[1] ? srcMatch[1] : value;

  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") return parts[0] || "";

    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      const watchId = parsed.searchParams.get("v");
      if (watchId) return watchId;

      const embedIndex = parts.indexOf("embed");
      if (embedIndex !== -1 && parts[embedIndex + 1]) return parts[embedIndex + 1];

      const shortsIndex = parts.indexOf("shorts");
      if (shortsIndex !== -1 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];

      const liveIndex = parts.indexOf("live");
      if (liveIndex !== -1 && parts[liveIndex + 1]) return parts[liveIndex + 1];
    }
  } catch {
    // fall through to regex extraction
  }

  const patterns = [
    /youtube\.com\/embed\/([^?&"'<>\/\s]+)/i,
    /youtube\.com\/watch\?[^"'<>]*v=([^?&"'<>\/\s]+)/i,
    /youtube\.com\/shorts\/([^?&"'<>\/\s]+)/i,
    /youtube\.com\/live\/([^?&"'<>\/\s]+)/i,
    /youtu\.be\/([^?&"'<>\/\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return match[1];
  }

  return /^[a-zA-Z0-9_-]{8,20}$/.test(cleaned) ? cleaned : "";
}

function youtubeMeta(rawUrl: unknown, rawId: unknown = ""): JsonRecord {
  const id = cleanString(rawId) || extractYouTubeId(rawUrl);
  if (!id) {
    return {
      id: "",
      embed_url: cleanString(rawUrl),
      watch_url: cleanString(rawUrl),
      thumbnail_url: "",
    };
  }

  const encoded = encodeURIComponent(id);
  return {
    id,
    embed_url: `https://www.youtube.com/embed/${encoded}`,
    watch_url: `https://www.youtube.com/watch?v=${encoded}`,
    thumbnail_url: `https://img.youtube.com/vi/${encoded}/hqdefault.jpg`,
    thumbnail_fallbacks: [
      `https://img.youtube.com/vi/${encoded}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${encoded}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${encoded}/mqdefault.jpg`,
      `https://img.youtube.com/vi/${encoded}/default.jpg`,
    ],
  };
}

function pickPublicStyle(style: JsonRecord | null): JsonRecord {
  if (!style) return {};
  return {
    style_profile_id: style.style_profile_id ?? null,
    profile_name: style.profile_name ?? null,
    colors_json: jsonObject(style.colors_json),
    typography_json: jsonObject(style.typography_json),
    spacing_json: jsonObject(style.spacing_json),
    layout_json: jsonObject(style.layout_json),
    effects_json: jsonObject(style.effects_json),
    media_json: jsonObject(style.media_json),
    component_json: jsonObject(style.component_json),
    density: style.density ?? "normal",
    card_style: style.card_style ?? "standard",
    hero_style: style.hero_style ?? "standard",
  };
}

function pickPublicAircraft(row: JsonRecord, supabaseUrl: string, options: JsonRecord, ratesByAsset: Map<string, JsonRecord>): JsonRecord {
  const aircraftId = String(row.operational_asset_id || row.aircraft_id || "");
  const rateRow = ratesByAsset.get(aircraftId) || {};
  const showRates = boolFromJson(options, "show_public_rates", false);
  const showAnnual = boolFromJson(options, "show_public_annual_due", false);

  return {
    aircraft_id: aircraftId,
    asset_key: row.asset_key ?? null,
    display_name: row.display_name ?? null,
    short_name: row.short_name ?? null,
    public_label: row.public_label ?? null,
    identifier: row.identifier ?? null,
    tail_number: row.tail_number ?? row.identifier ?? row.display_name ?? null,
    aircraft_type: row.aircraft_type ?? row.aircraft_model ?? null,
    aircraft_make: row.aircraft_make ?? null,
    aircraft_model: row.aircraft_model ?? row.aircraft_type ?? null,
    aircraft_year: row.aircraft_year ?? row.model_year ?? null,
    model_year: row.model_year ?? row.aircraft_year ?? null,
    category_class: row.category_class ?? null,
    seat_count: row.seat_count ?? null,
    engine_type: row.engine_type ?? null,
    fuel_type: row.fuel_type ?? null,
    home_base: row.home_base ?? null,
    summary: row.summary ?? null,
    description: row.description ?? null,
    aircraft_description_plain: row.aircraft_description_plain ?? row.summary ?? row.description ?? null,
    // Use transformed URLs rather than raw originals.
    // The card URL is larger than the visible CSS box so high-DPI displays do not look soft.
    // The large URL is for click-to-enlarge/lightbox inspection without loading the original upload.
    primary_photo_url: publicStorageImageUrl(supabaseUrl, "core-assets", row.primary_photo_url, 1200, 76),
    primary_photo_large_url: publicStorageImageUrl(supabaseUrl, "core-assets", row.primary_photo_url, 1600, 78),
    primary_photo_original_url: publicStorageObjectUrl(supabaseUrl, "core-assets", row.primary_photo_url),
    primary_photo_srcset: publicStorageImageSrcset(supabaseUrl, "core-assets", row.primary_photo_url, [480, 800, 1200, 1600], 76),
    panel_photo_url: publicStorageImageUrl(supabaseUrl, "core-assets", row.panel_photo_url, 1200, 76),
    panel_photo_large_url: publicStorageImageUrl(supabaseUrl, "core-assets", row.panel_photo_url, 1600, 78),
    panel_photo_original_url: publicStorageObjectUrl(supabaseUrl, "core-assets", row.panel_photo_url),
    panel_photo_srcset: publicStorageImageSrcset(supabaseUrl, "core-assets", row.panel_photo_url, [480, 800, 1200, 1600], 76),
    hourly_rate: showRates ? money(rateRow.hourly_rate) : null,
    annual_due: showAnnual ? money(rateRow.annual_due) : null,
    sort_order: row.sort_order ?? 100,
  };
}

async function getPublicAircraftRates(
  serviceClient: SupabaseClientAny,
  aircraftIds: string[],
): Promise<Map<string, JsonRecord>> {
  const map = new Map<string, JsonRecord>();
  if (!aircraftIds.length) return map;

  const { data, error } = await serviceClient
    .from("core_operational_asset_rates")
    .select("operational_asset_id, rate_key, amount, currency_code, status, archived_at")
    .in("operational_asset_id", aircraftIds)
    .in("rate_key", ["hourly-rental", "annual-due"])
    .eq("status", "active")
    .is("archived_at", null);

  if (error) throw error;

  for (const row of data || []) {
    const id = String(row.operational_asset_id || "");
    const existing = map.get(id) || {};
    if (row.rate_key === "hourly-rental") existing.hourly_rate = row.amount;
    if (row.rate_key === "annual-due") existing.annual_due = row.amount;
    existing.currency_code = row.currency_code || existing.currency_code || "USD";
    map.set(id, existing);
  }

  return map;
}

async function getAircraftPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "aircraft") || "aircraft";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  if (!organizationKey) {
    return { ok: false, error: "missing_organization_key", message: "Missing organization_key/customer_key." };
  }

  const { data: organization, error: organizationError } = await serviceClient
    .from("core_organizations")
    .select("organization_id, organization_key, display_name, organization_type, vertical, status, archived_at")
    .eq("organization_key", organizationKey)
    .is("archived_at", null)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) {
    return { ok: false, error: "organization_not_found", message: "Organization not found or archived." };
  }

  if (organization.status === "archived" || organization.status === "paused") {
    return { ok: false, error: "organization_unavailable", message: "Organization is not available." };
  }

  const organizationId = String(organization.organization_id);

  const { data: site, error: siteError } = await serviceClient
    .from("core_sites")
    .select("site_id, organization_id, site_key, site_name, site_type, status, primary_domain, default_subdomain, settings_json, archived_at")
    .eq("organization_id", organizationId)
    .eq("site_key", siteKey)
    .is("archived_at", null)
    .maybeSingle();

  if (siteError) throw siteError;

  const { data: page, error: pageError } = await serviceClient
    .from("core_customer_pages")
    .select("customer_page_id, customer_id, organization_id, site_id, template_id, page_key, page_slug, status, nav_label, sort_order, show_in_nav, archived_at")
    .eq("organization_id", organizationId)
    .eq("page_key", pageKey)
    .is("archived_at", null)
    .maybeSingle();

  if (pageError) throw pageError;
  if (!page) {
    return { ok: false, error: "page_not_enabled", message: "This page is not enabled for the selected organization." };
  }

  if (page.status !== "published") {
    return { ok: false, error: "page_not_published", message: "This page exists but is not published." };
  }

  const { data: template, error: templateError } = await serviceClient
    .from("core_template_registry")
    .select("template_id, template_key, template_name, template_category, module_key, access_default, build_status, render_contract_json")
    .eq("template_id", String(page.template_id))
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template || template.template_key !== "aircraft") {
    return { ok: false, error: "wrong_template", message: "The requested page is not using the Aircraft template." };
  }

  if (!String(template.access_default || "public").includes("public") && template.access_default !== "public") {
    return { ok: false, error: "page_not_public", message: "This template is not public." };
  }

  try { await assertPublicPageAccess(serviceClient, page as JsonRecord, template as JsonRecord); }
  catch (error) { return { ok: false, error: "page_not_public", message: error instanceof Error ? error.message : String(error) }; }

  const { data: settings, error: settingsError } = await serviceClient
    .from("core_page_settings")
    .select("page_settings_id, customer_page_id, title, intro_text, labels_json, options_json, visibility_json, content_json, updated_at")
    .eq("customer_page_id", String(page.customer_page_id))
    .maybeSingle();

  if (settingsError) throw settingsError;

  const { data: style, error: styleError } = await serviceClient
    .from("core_customer_style_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (styleError) throw styleError;

  const options = jsonObject(settings?.options_json);
  const showRates = boolFromJson(options, "show_public_rates", false);
  const showAnnual = boolFromJson(options, "show_public_annual_due", false);

  const { data: aircraftRows, error: aircraftError } = await serviceClient
    .from("module_aircraft_public_v1")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("tail_number", { ascending: true });

  if (aircraftError) throw aircraftError;

  const aircraftIds = (aircraftRows || [])
    .map((row: JsonRecord) => String(row.operational_asset_id || row.aircraft_id || ""))
    .filter(Boolean);

  const ratesByAsset = showRates || showAnnual
    ? await getPublicAircraftRates(serviceClient, aircraftIds)
    : new Map<string, JsonRecord>();

  const aircraft = (aircraftRows || [])
    .map((row: JsonRecord) => pickPublicAircraft(row, supabaseUrl, options, ratesByAsset));

  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site || null, style || null);

  return {
    ok: true,
    action: "get_aircraft_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: settings ? {
      title: settings.title,
      intro_text: settings.intro_text,
      labels_json: jsonObject(settings.labels_json),
      options_json: options,
      visibility_json: jsonObject(settings.visibility_json),
      content_json: jsonObject(settings.content_json),
      updated_at: settings.updated_at,
    } : {
      title: page.nav_label || "Aircraft",
      intro_text: "",
      labels_json: {},
      options_json: {},
      visibility_json: {},
      content_json: {},
      updated_at: null,
    },
    style_profile: pickPublicStyle(style || null),
    aircraft,
    debug: renderMode === "debug" ? {
      aircraft_count: aircraft.length,
      page_settings_found: Boolean(settings),
      active_style_profile_found: Boolean(style),
    } : undefined,
  };
}



function pageHref(pageSlug: unknown, pageKey: unknown): string {
  const raw = cleanString(pageSlug || pageKey || "");
  if (!raw) return "/";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) return raw;
  if (raw.startsWith("#")) return raw;
  if (raw.startsWith("/")) return raw;
  const slug = normalizeKey(raw);
  if (!slug) return "/";
  return slug === "home" ? "/home" : `/${slug}`;
}

function publicSiteSettings(site: JsonRecord | null): JsonRecord {
  return jsonObject(site?.settings_json);
}


function normalizeAccessLevel(value: unknown, fallback = "public"): string {
  const raw = normalizeKey(value || fallback).replace(/-/g, "_");
  if (["public", "logged_in", "user", "organization_admin", "platform_admin", "disabled"].includes(raw)) return raw;
  if (["member", "members"].includes(raw)) return "user";
  if (["admin", "admins", "org_admin"].includes(raw)) return "organization_admin";
  return fallback;
}

function normalizeRiskLevel(value: unknown, fallback = "normal_restricted"): string {
  const raw = normalizeKey(value || fallback).replace(/-/g, "_");
  if (["low_public", "normal_restricted", "sensitive_user_data", "sensitive_admin_data", "platform_system"].includes(raw)) return raw;
  return fallback;
}

async function assertPublicPageAccess(serviceClient: SupabaseClientAny, page: JsonRecord, template: JsonRecord | null): Promise<JsonRecord | null> {
  const templateDefault = cleanString(template?.access_default || "public");
  let setting: JsonRecord | null = null;
  try {
    const { data, error } = await serviceClient
      .from("core_page_access_settings")
      .select("*")
      .eq("customer_page_id", String(page.customer_page_id || ""))
      .is("archived_at", null)
      .maybeSingle();
    if (!error && data) setting = data as JsonRecord;
  } catch {
    setting = null;
  }

  const accessLevel = normalizeAccessLevel(setting?.access_level || templateDefault, templateDefault === "public" ? "public" : "user");
  const riskLevel = normalizeRiskLevel(setting?.risk_level, accessLevel === "public" ? "low_public" : "normal_restricted");
  const publicRendererEnabled = setting ? setting.public_renderer_enabled === true : accessLevel === "public";
  const dangerousPublicAllowed = setting ? setting.dangerous_public_allowed === true : false;

  if (accessLevel !== "public") {
    throw new Error("This page is not configured for public access.");
  }

  if (["sensitive_user_data", "sensitive_admin_data", "platform_system"].includes(riskLevel) && !(publicRendererEnabled && dangerousPublicAllowed)) {
    throw new Error("This page is classified as sensitive and does not have an approved public-safe renderer.");
  }

  return setting;
}

async function getPublicNavigationBundle(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  siteId: string | null,
): Promise<JsonRecord> {
  try {
    let query = serviceClient
      .from("core_public_navigation_v2")
      .select("*")
      .eq("organization_id", organizationId)
      .order("row_sort_order", { ascending: true })
      .order("sort_order", { ascending: true });

    if (siteId) query = query.eq("site_id", siteId);
    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length) {
      const first = data[0] as JsonRecord;
      const rowMap = new Map<string, JsonRecord>();
      const items = (data as JsonRecord[]).map((row: JsonRecord) => {
        const rowKey = normalizeKey(row.row_key || "public");
        if (rowKey && !rowMap.has(rowKey)) {
          rowMap.set(rowKey, {
            row_key: rowKey,
            row_label: cleanString(row.row_label || "PUBLIC"),
            sort_order: row.row_sort_order || 10,
            visibility_rule: row.row_visibility_rule || "always",
          });
        }
        return {
          item_key: row.item_key || row.page_key,
          page_key: row.page_key,
          page_slug: row.page_slug,
          nav_label: row.nav_label || row.page_key,
          label: row.nav_label || row.page_key,
          href: pageHref(row.href || row.page_slug, row.page_key),
          sort_order: row.sort_order ?? 100,
          order: row.sort_order ?? 100,
          row_key: rowKey,
          access_level: row.access_level || "public",
          risk_level: row.risk_level || "low_public",
          template_key: row.template_key ?? row.page_key,
        };
      });
      return {
        navigation_profile: {
          navigation_profile_id: first.navigation_profile_id || null,
          header_layout_key: first.header_layout_key || "pill-rows",
          show_logo: first.show_logo !== false,
          show_large_title: first.show_large_title !== false,
          show_org_context_row: first.show_org_context_row === true,
          show_user_badge: first.show_user_badge !== false,
          show_logout_button: first.show_logout_button !== false,
        },
        navigation_rows: Array.from(rowMap.values()),
        navigation_items: items,
        nav_items: items,
      };
    }
  } catch {
    // Migration not installed yet or view unavailable; use legacy public nav below.
  }

  let legacyQuery = serviceClient
    .from("core_public_navigation_v1")
    .select("organization_id, site_id, customer_page_id, page_key, page_slug, nav_label, sort_order, template_key")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("nav_label", { ascending: true });

  if (siteId) legacyQuery = legacyQuery.eq("site_id", siteId);
  const { data, error } = await legacyQuery;
  if (error) throw error;

  const items = (data || []).map((row: JsonRecord) => ({
    page_key: row.page_key,
    page_slug: row.page_slug,
    nav_label: row.nav_label || row.page_key,
    label: row.nav_label || row.page_key,
    href: pageHref(row.page_slug, row.page_key),
    sort_order: row.sort_order ?? 100,
    order: row.sort_order ?? 100,
    row_key: "public",
    template_key: row.template_key ?? row.page_key,
  }));

  return {
    navigation_profile: { header_layout_key: "pill-rows", show_org_context_row: false },
    navigation_rows: [{ row_key: "public", row_label: "PUBLIC", sort_order: 10, visibility_rule: "always" }],
    navigation_items: items,
    nav_items: items,
  };
}

async function getPublicNavigation(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  siteId: string | null,
): Promise<JsonRecord[]> {
  const bundle = await getPublicNavigationBundle(serviceClient, organizationId, siteId);
  return (bundle.nav_items || []) as JsonRecord[];
}

async function getPublicLogo(
  serviceClient: SupabaseClientAny,
  supabaseUrl: string,
  style: JsonRecord | null,
  site: JsonRecord | null,
): Promise<JsonRecord | null> {
  const styleLogoId = cleanString(style?.logo_asset_id);
  const settings = publicSiteSettings(site);
  const settingsLogoUrl = cleanString(settings.logo_url);

  if (styleLogoId) {
    const { data, error } = await serviceClient
      .from("core_assets")
      .select("asset_id, asset_type, url, storage_path, alt_text, mime_type, status, archived_at")
      .eq("asset_id", styleLogoId)
      .maybeSingle();

    if (error) throw error;

    if (data && data.status !== "archived" && !data.archived_at) {
      const source = data.storage_path || data.url;
      return {
        asset_id: data.asset_id,
        url: publicStorageImageUrl(supabaseUrl, "core-assets", source, 360, 78),
        original_url: publicStorageObjectUrl(supabaseUrl, "core-assets", source),
        alt_text: data.alt_text || settings.logo_alt_text || "Organization logo",
      };
    }
  }

  if (settingsLogoUrl) {
    return {
      asset_id: null,
      url: publicStorageImageUrl(supabaseUrl, "core-assets", settingsLogoUrl, 360, 78),
      original_url: publicStorageObjectUrl(supabaseUrl, "core-assets", settingsLogoUrl),
      alt_text: settings.logo_alt_text || "Organization logo",
    };
  }

  return null;
}

async function getPublicSiteShell(
  serviceClient: SupabaseClientAny,
  supabaseUrl: string,
  organization: JsonRecord,
  site: JsonRecord | null,
  style: JsonRecord | null,
): Promise<JsonRecord> {
  const siteId = site?.site_id ? String(site.site_id) : null;
  const settings = publicSiteSettings(site);
  const navigationBundle = await getPublicNavigationBundle(serviceClient, String(organization.organization_id), siteId);
  const navItems = Array.isArray(navigationBundle.nav_items) ? navigationBundle.nav_items : [];
  const logo = await getPublicLogo(serviceClient, supabaseUrl, style, site);

  return {
    organization_name: organization.display_name || organization.organization_key || "Organization",
    organization_key: organization.organization_key,
    site_name: site?.site_name || organization.display_name || "Site",
    site_key: site?.site_key || "primary",
    logo,
    badge_text: settings.badge_text || "",
    nav_items: navItems,
    public_nav_items: navItems,
    navigation_profile: navigationBundle.navigation_profile || { header_layout_key: "pill-rows", show_org_context_row: false },
    navigation_rows: navigationBundle.navigation_rows || [],
    navigation_items: navigationBundle.navigation_items || navItems,
    login_label: settings.login_label || "Login",
    login_url: settings.member_login_url || "/login",
    footer_mode: settings.footer_mode || "enabled",
    footer_note: settings.footer_note || "",
  };
}

async function resolvePublicPageContext(
  serviceClient: SupabaseClientAny,
  organizationKey: string,
  siteKey: string,
  pageKey: string,
  expectedTemplateKey: string,
): Promise<JsonRecord> {
  if (!organizationKey) {
    return { ok: false, error: "missing_organization_key", message: "Missing organization_key/customer_key." };
  }

  const { data: organization, error: organizationError } = await serviceClient
    .from("core_organizations")
    .select("organization_id, organization_key, display_name, organization_type, vertical, status, archived_at")
    .eq("organization_key", organizationKey)
    .is("archived_at", null)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) {
    return { ok: false, error: "organization_not_found", message: "Organization not found or archived." };
  }

  if (organization.status === "archived" || organization.status === "paused") {
    return { ok: false, error: "organization_unavailable", message: "Organization is not available." };
  }

  const organizationId = String(organization.organization_id);

  const { data: site, error: siteError } = await serviceClient
    .from("core_sites")
    .select("site_id, organization_id, site_key, site_name, site_type, status, primary_domain, default_subdomain, settings_json, archived_at")
    .eq("organization_id", organizationId)
    .eq("site_key", siteKey || "primary")
    .is("archived_at", null)
    .maybeSingle();

  if (siteError) throw siteError;

  const { data: page, error: pageError } = await serviceClient
    .from("core_customer_pages")
    .select("customer_page_id, customer_id, organization_id, site_id, template_id, page_key, page_slug, status, nav_label, sort_order, show_in_nav, archived_at")
    .eq("organization_id", organizationId)
    .eq("page_key", pageKey)
    .is("archived_at", null)
    .maybeSingle();

  if (pageError) throw pageError;
  if (!page) {
    return { ok: false, error: "page_not_enabled", message: "This page is not enabled for the selected organization." };
  }

  if (page.status !== "published") {
    return { ok: false, error: "page_not_published", message: "This page exists but is not published." };
  }

  const { data: template, error: templateError } = await serviceClient
    .from("core_template_registry")
    .select("template_id, template_key, template_name, template_category, module_key, access_default, build_status, render_contract_json")
    .eq("template_id", String(page.template_id))
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template || template.template_key !== expectedTemplateKey) {
    return { ok: false, error: "wrong_template", message: `The requested page is not using the ${expectedTemplateKey} template.` };
  }

  if (template.access_default !== "public") {
    return { ok: false, error: "page_not_public", message: "This template is not public." };
  }

  try { await assertPublicPageAccess(serviceClient, page as JsonRecord, template as JsonRecord); }
  catch (error) { return { ok: false, error: "page_not_public", message: error instanceof Error ? error.message : String(error) }; }

  const { data: settings, error: settingsError } = await serviceClient
    .from("core_page_settings")
    .select("page_settings_id, customer_page_id, title, intro_text, labels_json, options_json, visibility_json, content_json, updated_at")
    .eq("customer_page_id", String(page.customer_page_id))
    .maybeSingle();

  if (settingsError) throw settingsError;

  const { data: style, error: styleError } = await serviceClient
    .from("core_customer_style_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (styleError) throw styleError;

  return {
    ok: true,
    organization,
    site: site || null,
    page,
    template,
    settings: settings || null,
    style: style || null,
  };
}

async function getFeaturedHomePhoto(
  serviceClient: SupabaseClientAny,
  supabaseUrl: string,
  organizationId: string,
  siteId: string | null,
): Promise<JsonRecord | null> {
  const { data, error } = await serviceClient
    .from("core_gallery_featured_public_v1")
    .select("gallery_media_id, organization_id, site_id, title, caption, credit, alt_text, storage_bucket, storage_path, public_url, thumbnail_url, sort_order, created_at")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const candidates = (data || []).filter((row: JsonRecord) => {
    if (!siteId) return true;
    return !row.site_id || String(row.site_id) === siteId;
  });

  if (!candidates.length) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const bucket = cleanString(chosen.storage_bucket || "core-assets") || "core-assets";
  const source = chosen.storage_path || chosen.public_url || chosen.thumbnail_url;

  return {
    gallery_media_id: chosen.gallery_media_id,
    title: chosen.title || null,
    caption: chosen.caption || null,
    credit: chosen.credit || null,
    alt_text: chosen.alt_text || chosen.caption || chosen.title || "Featured photo",
    image_url: publicStorageImageUrl(supabaseUrl, bucket, source, 1400, 78),
    image_large_url: publicStorageImageUrl(supabaseUrl, bucket, source, 1800, 80),
    image_srcset: publicStorageImageSrcset(supabaseUrl, bucket, source, [640, 1000, 1400, 1800], 78),
  };
}

async function getHomePagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "home") || "home";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "home");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Home",
    intro_text: "",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const options = jsonObject(pageSettings.options_json);
  const visibility = jsonObject(pageSettings.visibility_json);
  const showFeatured = boolFromJson(options, "show_featured_photo", true);
  const featuredPhoto = showFeatured
    ? await getFeaturedHomePhoto(serviceClient, supabaseUrl, String(organization.organization_id), site?.site_id ? String(site.site_id) : null)
    : null;

  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);

  return {
    ok: true,
    action: "get_home_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    featured_photo: featuredPhoto,
    debug: renderMode === "debug" ? {
      featured_photo_found: Boolean(featuredPhoto),
      page_settings_found: Boolean(settings),
      active_style_profile_found: Boolean(style),
      visibility,
    } : undefined,
  };
}

async function getGalleryMedia(
  serviceClient: SupabaseClientAny,
  supabaseUrl: string,
  organizationId: string,
  siteId: string | null,
  options: JsonRecord,
): Promise<JsonRecord[]> {
  const showFeaturedFirst = boolFromJson(options, "show_featured_first", true);
  let query = serviceClient
    .from("core_gallery_public_v1")
    .select("gallery_media_id, organization_id, site_id, title, caption, credit, alt_text, media_type, source_type, external_url, external_provider, external_id, storage_bucket, storage_path, public_url, thumbnail_url, is_featured, sort_order, metadata_json, created_at")
    .eq("organization_id", organizationId);

  if (showFeaturedFirst) {
    query = query.order("is_featured", { ascending: false });
  }

  query = query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(250);

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .filter((row: JsonRecord) => {
      if (!siteId) return true;
      return !row.site_id || String(row.site_id) === siteId;
    })
    .map((row: JsonRecord) => {
      const bucket = cleanString(row.storage_bucket || "core-assets") || "core-assets";
      const mediaType = cleanString(row.media_type || "image") || "image";
      const sourceType = cleanString(row.source_type || (mediaType === "external_video" ? "youtube" : "supabase"));
      const isVideo = mediaType === "external_video" || mediaType === "video";

      if (isVideo) {
        const external = row.external_url || row.public_url;
        const yt = sourceType === "youtube" || cleanString(row.external_provider) === "youtube"
          ? youtubeMeta(external, row.external_id)
          : { id: cleanString(row.external_id), embed_url: cleanString(external), watch_url: cleanString(external), thumbnail_url: cleanString(row.thumbnail_url), thumbnail_fallbacks: [] };

        const thumbnailSource = row.thumbnail_url || yt.thumbnail_url || row.storage_path || row.public_url;
        const supabaseThumb = row.thumbnail_url || row.storage_path
          ? publicStorageImageUrl(supabaseUrl, bucket, thumbnailSource, 1200, 76)
          : null;

        return {
          gallery_media_id: row.gallery_media_id,
          media_type: mediaType,
          source_type: sourceType,
          title: row.title || null,
          caption: row.caption || null,
          credit: row.credit || null,
          alt_text: row.alt_text || row.caption || row.title || "Gallery video",
          is_featured: Boolean(row.is_featured),
          sort_order: row.sort_order,
          created_at: row.created_at,
          video_id: yt.id || row.external_id || null,
          video_embed_url: yt.embed_url || row.external_url || row.public_url || null,
          video_watch_url: yt.watch_url || row.external_url || row.public_url || null,
          thumbnail_url: supabaseThumb || yt.thumbnail_url || row.thumbnail_url || null,
          thumbnail_fallbacks: Array.isArray(yt.thumbnail_fallbacks) ? yt.thumbnail_fallbacks : [],
        };
      }

      const source = row.storage_path || row.public_url || row.thumbnail_url;
      return {
        gallery_media_id: row.gallery_media_id,
        media_type: "image",
        source_type: sourceType,
        title: row.title || null,
        caption: row.caption || null,
        credit: row.credit || null,
        alt_text: row.alt_text || row.caption || row.title || "Gallery photo",
        is_featured: Boolean(row.is_featured),
        sort_order: row.sort_order,
        created_at: row.created_at,
        image_url: publicStorageImageUrl(supabaseUrl, bucket, source, 1200, 76),
        image_large_url: publicStorageImageUrl(supabaseUrl, bucket, source, 1800, 80),
        image_srcset: publicStorageImageSrcset(supabaseUrl, bucket, source, [480, 800, 1200, 1600, 1800], 76),
      };
    });
}

async function getGalleryPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "gallery") || "gallery";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "gallery");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Gallery",
    intro_text: "",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const options = jsonObject(pageSettings.options_json);
  const galleryMedia = await getGalleryMedia(serviceClient, supabaseUrl, String(organization.organization_id), site?.site_id ? String(site.site_id) : null, options);
  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);

  return {
    ok: true,
    action: "get_gallery_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    gallery_media: galleryMedia,
    debug: renderMode === "debug" ? {
      media_count: galleryMedia.length,
      page_settings_found: Boolean(settings),
      active_style_profile_found: Boolean(style),
    } : undefined,
  };
}


function cleanContactField(value: unknown, maxLen: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}


async function getInfoFaqItems(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  siteId: string | null,
  customerPageId: string,
  options: JsonRecord,
): Promise<JsonRecord[]> {
  if (boolFromJson(options, "show_faq_section", true) === false) return [];

  let query = serviceClient
    .from("core_info_faq_public_v1")
    .select("faq_item_id, organization_id, site_id, customer_page_id, faq_key, category, question, answer, sort_order, metadata_json, created_at")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .filter((row: JsonRecord) => {
      if (row.customer_page_id && String(row.customer_page_id) !== customerPageId) return false;
      if (siteId && row.site_id && String(row.site_id) !== siteId) return false;
      return true;
    })
    .map((row: JsonRecord) => ({
      faq_item_id: row.faq_item_id,
      faq_key: row.faq_key || null,
      category: row.category || null,
      question: row.question || "",
      answer: row.answer || "",
      sort_order: row.sort_order ?? 100,
      metadata_json: jsonObject(row.metadata_json),
    }));
}

function parseManualOfficers(raw: unknown): JsonRecord[] {
  const text = cleanString(raw);
  if (!text) return [];

  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        officer_id: `manual-${index + 1}`,
        source: "manual",
        officer_title: parts[0] || "",
        display_name: parts[1] || parts[0] || "",
        email: parts[2] || null,
        note: parts[3] || null,
        sort_order: index + 1000,
      };
    })
    .filter((row) => cleanString(row.display_name) || cleanString(row.officer_title));
}

async function getDynamicOfficers(
  serviceClient: SupabaseClientAny,
  organizationId: string,
): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_public_officers_v1")
    .select("membership_id, person_id, display_name, officer_title, role_key, role_label, sort_order, primary_email, email_override")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("officer_title", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: JsonRecord) => ({
    officer_id: row.membership_id || row.person_id,
    source: "dynamic",
    display_name: row.display_name || "",
    officer_title: row.officer_title || row.role_label || row.role_key || "",
    role_key: row.role_key || null,
    email: row.email_override || row.primary_email || null,
    sort_order: row.sort_order ?? 100,
  })).filter((row: JsonRecord) => cleanString(row.display_name) || cleanString(row.officer_title));
}

async function getInfoOfficers(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  content: JsonRecord,
  options: JsonRecord,
): Promise<JsonRecord[]> {
  if (boolFromJson(options, "show_officers_card", true) === false) return [];

  const mode = cleanString(options.officer_source_mode || content.officer_source_mode || "dynamic_then_manual") || "dynamic_then_manual";
  const manualRows = parseManualOfficers(content.manual_officers_text);

  if (mode === "manual") return manualRows;

  const dynamicRows = await getDynamicOfficers(serviceClient, organizationId);
  if (mode === "dynamic") return dynamicRows;

  if (mode === "manual_then_dynamic") return manualRows.length ? manualRows : dynamicRows;
  if (mode === "hybrid") return [...dynamicRows, ...manualRows];

  return dynamicRows.length ? dynamicRows : manualRows;
}

async function getInfoPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "info") || "info";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "info");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Info",
    intro_text: "",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const content = jsonObject(pageSettings.content_json);
  const options = jsonObject(pageSettings.options_json);
  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);
  const siteId = site?.site_id ? String(site.site_id) : null;
  const faqItems = await getInfoFaqItems(serviceClient, String(organization.organization_id), siteId, String(page.customer_page_id), options);
  const officers = await getInfoOfficers(serviceClient, String(organization.organization_id), content, options);

  return {
    ok: true,
    action: "get_info_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    faq_items: faqItems,
    officers,
    debug: renderMode === "debug" ? {
      faq_count: faqItems.length,
      officer_count: officers.length,
      page_settings_found: Boolean(settings),
      active_style_profile_found: Boolean(style),
    } : undefined,
  };
}


async function getPublishedPublicDocuments(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_documents_public_v1")
    .select("*")
    .eq("organization_id", organizationId)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function attachDocumentSignedUrls(serviceClient: SupabaseClientAny, docs: JsonRecord[]): Promise<JsonRecord[]> {
  const out: JsonRecord[] = [];
  for (const doc of docs) {
    let previewSignedUrl: string | null = null;
    let downloadSignedUrl: string | null = null;
    const bucket = cleanString(doc.storage_bucket || "core-documents") || "core-documents";
    const path = cleanString(doc.storage_path);
    const fileName = cleanString(doc.original_file_name || doc.title || "document") || "document";
    if (path) {
      const { data: previewData, error: previewError } = await serviceClient.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      if (!previewError && previewData?.signedUrl) previewSignedUrl = previewData.signedUrl;

      const { data: downloadData, error: downloadError } = await serviceClient.storage
        .from(bucket)
        .createSignedUrl(path, 3600, { download: fileName });
      if (!downloadError && downloadData?.signedUrl) downloadSignedUrl = downloadData.signedUrl;
    }
    out.push({
      ...doc,
      preview_signed_url: previewSignedUrl,
      download_signed_url: downloadSignedUrl,
      signed_url: downloadSignedUrl || previewSignedUrl,
      signed_url_expires_in: 3600,
    });
  }
  return out;
}

async function getDocumentsPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "documents") || "documents";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "documents");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Documents",
    intro_text: "",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);
  const publicDocs = await getPublishedPublicDocuments(serviceClient, String(organization.organization_id));
  const documents = await attachDocumentSignedUrls(serviceClient, publicDocs);

  return {
    ok: true,
    action: "get_documents_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    documents,
    debug: renderMode === "debug" ? {
      public_document_count: documents.length,
      page_settings_found: Boolean(settings),
      active_style_profile_found: Boolean(style),
    } : undefined,
  };
}


function validContactEmail(value: unknown): string {
  const email = cleanContactField(value, 240).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function contactSpamAssessment(body: JsonRecord, message: string, email: string): JsonRecord {
  const reasons: string[] = [];
  let score = 0;
  const hp = cleanContactField(body.hp_field || body["hp-field"] || body.website || body.company, 200);
  if (hp) { score += 100; reasons.push("honeypot_filled"); }
  const elapsed = Number(body.elapsed_ms || body.elapsedMs || body.time_on_page_ms || 0);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 1800) { score += 25; reasons.push("submitted_too_quickly"); }
  if (message.length < 10) { score += 15; reasons.push("message_too_short"); }
  if (/https?:\/\//i.test(message) && message.length < 120) { score += 15; reasons.push("short_message_with_url"); }
  if (/(crypto|forex|casino|seo|backlink|whatsapp|telegram|loan|viagra)/i.test(message)) { score += 20; reasons.push("spam_keyword"); }
  if (!email) { score += 40; reasons.push("invalid_email"); }
  return { score, reasons, honeypot: Boolean(hp), elapsed_ms: Number.isFinite(elapsed) ? elapsed : null };
}

async function duplicateRecentContactCount(serviceClient: SupabaseClientAny, organizationId: string, email: string): Promise<number> {
  if (!organizationId || !email) return 0;
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  try {
    const { count, error } = await serviceClient
      .from("core_contact_inquiries")
      .select("contact_inquiry_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("email", email)
      .gte("created_at", cutoff);
    if (error) return 0;
    return Number(count || 0);
  } catch {
    return 0;
  }
}

async function writeContactInquiryEvent(
  serviceClient: SupabaseClientAny,
  inquiryId: string | null,
  organizationId: string,
  eventType: string,
  metadata: JsonRecord = {},
): Promise<void> {
  if (!inquiryId) return;
  try {
    await serviceClient.from("core_contact_inquiry_events").insert({
      contact_inquiry_id: inquiryId,
      organization_id: organizationId,
      event_type: eventType,
      actor_role: "public",
      metadata_json: metadata,
    });
  } catch (error) {
    console.error("contact_inquiry_event_write_failed", error);
  }
}

// =======================
// Applicant Intake 0097
// =======================

function publicValidEmail(value: unknown): string {
  const email = cleanString(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanLimited(value: unknown, max = 1000): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalDate(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function yesNo(value: unknown): string {
  const raw = normalizeKey(value || "no");
  return ["yes", "no", "pending"].includes(raw) ? raw : "no";
}


function escapeHtml0107(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

async function getApplicantSettingsPublic0107(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord> {
  try {
    const { data, error } = await serviceClient.from("core_applicant_settings").select("*").eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    return (data || {}) as JsonRecord;
  } catch (_) {
    return {};
  }
}

function applicantPortalAccessMode0107(value: unknown): string {
  const raw = normalizeKey(value || "accepted_onboarding").replace(/-/g, "_");
  return ["none", "after_submitted", "manual", "info_requested", "accepted_onboarding"].includes(raw) ? raw : "accepted_onboarding";
}

function applicantPortalAllowedPublic0107(settings: JsonRecord, app: JsonRecord): boolean {
  const mode = applicantPortalAccessMode0107(settings.portal_access_mode || settings.applicant_portal_access_rule || settings.applicant_account_mode);
  const status = normalizeKey(app.applicant_status || app.status || app.stage_key || "new").replace(/-/g, "_");
  if (mode === "none") return false;
  if (mode === "after_submitted") return true;
  if (mode === "manual") return Boolean(app.portal_access_granted || app.portal_access_granted_at || app.applicant_user_id);
  if (mode === "info_requested") return Boolean(app.portal_access_granted) || ["waitlist", "invited_to_interview", "onboarding", "ready_for_final_review"].includes(status);
  return Boolean(app.portal_access_granted) || ["onboarding", "ready_for_final_review"].includes(status);
}

async function getApplicantPortalPublicPayload0107(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  if (!organizationKey) return { ok: false, error: "missing_organization_key", message: "Missing organization key." };
  const { data: organization, error: orgError } = await serviceClient.from("core_organizations").select("*").eq("organization_key", organizationKey).is("archived_at", null).maybeSingle();
  if (orgError) throw orgError;
  if (!organization) return { ok: false, error: "organization_not_found", message: "Organization not found." };
  const organizationId = String(organization.organization_id);
  const { data: site } = await serviceClient.from("core_sites").select("*").eq("organization_id", organizationId).eq("site_key", siteKey).is("archived_at", null).maybeSingle();
  const { data: page } = await serviceClient.from("core_customer_pages").select("*").eq("organization_id", organizationId).eq("page_key", "applicant-portal").is("archived_at", null).maybeSingle();
  const { data: style } = await serviceClient.from("core_customer_style_profiles").select("*").eq("organization_id", organizationId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const settings = await getApplicantSettingsPublic0107(serviceClient, organizationId);
  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization as JsonRecord, (site || null) as JsonRecord | null, (style || null) as JsonRecord | null);
  return {
    ok: true,
    action: "get_applicant_portal_public",
    version: "2026-06-10-107-C",
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site || null,
    site_shell: siteShell,
    page: page || null,
    style_profile: pickPublicStyle(style || null),
    settings: {
      portal_access_mode: settings.portal_access_mode || "accepted_onboarding",
      allow_applicant_updates: settings.allow_applicant_updates !== false,
      show_waitlist_position: settings.show_waitlist_position === true,
      applicant_account_mode: settings.applicant_account_mode || settings.portal_access_mode || "accepted_onboarding",
    },
  };
}

async function sendApplicantPortalAccessEmail0107(serviceClient: SupabaseClientAny, email: string, orgName: string, link: string): Promise<JsonRecord> {
  const apiKey = cleanLimited(Deno.env.get("RESEND_API_KEY"), 500);
  if (!apiKey) throw new Error("Missing RESEND_API_KEY.");
  const fromEmail = cleanLimited(Deno.env.get("SYNCETC_CONTACT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "no-reply@syncetc.com", 240);
  const subject = `${orgName || "Applicant Portal"} applicant portal link`;
  const text = `Use this secure link to access your applicant portal for ${orgName || "the organization"}:\n\n${link}\n\nIf you did not request this link, you can ignore this email.`;
  const html = `<p>Use this secure link to access your applicant portal for <strong>${escapeHtml0107(orgName || "the organization")}</strong>:</p><p><a href="${escapeHtml0107(link)}">Open applicant portal</a></p><p>If you did not request this link, you can ignore this email.</p>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `${orgName || "SyncEtc"} via SyncEtc <${fromEmail}>`, to: [email], subject, text, html }) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cleanLimited(json?.message || json?.error || `Resend HTTP ${response.status}`, 500));
  return { provider: "resend", provider_response: json };
}

function applicantPortalCallbackUrl0107(redirectTo: string, tokenHash: string): string {
  const fallback = "https://syncetc.webflow.io/applicant-portal";
  const safeRedirect = cleanLimited(redirectTo) || fallback;
  const url = new URL(safeRedirect, fallback);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("applicant_magic", "1");
  return url.toString();
}

async function ensureApplicantPortalAuthLink0107(serviceClient: SupabaseClientAny, email: string, redirectTo: string): Promise<string> {
  try {
    await serviceClient.auth.admin.createUser({ email, email_confirm: true, user_metadata: { syncetc_account_type: "applicant" } } as any);
  } catch (createError) {
    const msg = String((createError as Error)?.message || createError || "").toLowerCase();
    if (!msg.includes("already") && !msg.includes("registered") && !msg.includes("exists")) console.warn("applicant_portal_create_auth_user_warning", createError);
  }
  const { data, error } = await serviceClient.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } } as any);
  if (error) throw error;
  const raw: any = data || {};
  const props: any = raw.properties || {};
  let tokenHash = cleanLimited(props.hashed_token || props.token_hash || raw.hashed_token || raw.token_hash || "");
  if (!tokenHash) {
    const actionLink = cleanLimited(props.action_link || raw.action_link || "");
    if (actionLink) {
      try { tokenHash = cleanLimited(new URL(actionLink).searchParams.get("token")); } catch (_) {}
    }
  }
  if (!tokenHash) throw new Error("Could not create applicant portal login token.");
  return applicantPortalCallbackUrl0107(redirectTo, tokenHash);
}

async function requestApplicantPortalAccessPublic0107(serviceClient: SupabaseClientAny, body: JsonRecord, req: Request): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const email = publicValidEmail(body.email);
  if (!organizationKey || !email) return { ok: true, action: "request_applicant_portal_access", message: "If an eligible application exists for that email, we will send applicant portal instructions." };
  const { data: organization, error: orgError } = await serviceClient.from("core_organizations").select("organization_id, organization_key, display_name").eq("organization_key", organizationKey).is("archived_at", null).maybeSingle();
  if (orgError) throw orgError;
  if (!organization?.organization_id) return { ok: true, action: "request_applicant_portal_access", message: "If an eligible application exists for that email, we will send applicant portal instructions." };
  const organizationId = String(organization.organization_id);
  const settings = await getApplicantSettingsPublic0107(serviceClient, organizationId);
  const { data: apps, error } = await serviceClient.from("core_applications").select("*").eq("organization_id", organizationId).eq("email", email).is("archived_at", null).order("submitted_at", { ascending: false }).limit(5);
  if (error) throw error;
  const app = ((apps || []) as JsonRecord[]).find((row) => applicantPortalAllowedPublic0107(settings, row));
  if (!app) return { ok: true, action: "request_applicant_portal_access", message: "If an eligible application exists for that email, we will send applicant portal instructions." };
  try {
    const origin = cleanLimited(req.headers.get("origin") || "https://syncetc.webflow.io", 500) || "https://syncetc.webflow.io";
    const redirectTo = cleanLimited(body.redirect_to, 1000) || `${origin.replace(/\/$/, "")}/applicant-portal`;
    const link = await ensureApplicantPortalAuthLink0107(serviceClient, email, redirectTo);
    const sendResult = await sendApplicantPortalAccessEmail0107(serviceClient, email, cleanLimited(organization.display_name, 200), link);
    await serviceClient.from("core_applications").update({ portal_access_granted: true, portal_access_granted_at: new Date().toISOString(), portal_invite_last_requested_at: new Date().toISOString(), portal_invite_sent_at: new Date().toISOString(), portal_invite_request_count: Number(app.portal_invite_request_count || 0) + 1, updated_at: new Date().toISOString() }).eq("application_id", app.application_id);
    try { await serviceClient.from("core_applicant_events").insert({ application_id: app.application_id, organization_id: organizationId, event_type: "applicant_portal_link_requested", actor_email: email, note: "Applicant portal login link requested from public portal page.", metadata_json: { source: "public_applicant_portal", send_result: sendResult } }); } catch (_) {}
  } catch (sendError) {
    console.warn("applicant_portal_request_send_failed", sendError instanceof Error ? sendError.message : String(sendError));
    try { await serviceClient.from("core_applicant_events").insert({ application_id: app.application_id, organization_id: organizationId, event_type: "applicant_portal_link_failed", actor_email: email, note: "Applicant portal link request could not send email.", metadata_json: { error: sendError instanceof Error ? sendError.message : String(sendError) } }); } catch (_) {}
  }
  return { ok: true, action: "request_applicant_portal_access", message: "If an eligible application exists for that email, we will send applicant portal instructions." };
}

async function getApplyPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "apply-now") || "apply-now";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "apply-now");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;
  const organizationId = String(organization.organization_id);

  const { data: questions, error: questionError } = await serviceClient
    .from("core_applicant_custom_question_definitions")
    .select("question_key,label,help_text,field_type,options_json,is_required,sort_order")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (questionError && !String(questionError.message || "").includes("does not exist")) throw questionError;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Apply Now",
    intro_text: "Start your application for review.",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);
  return {
    ok: true,
    action: "get_apply_page",
    version: "2026-06-10-107-C",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    custom_questions: questions || [],
    applicant_portal: {
      portal_access_mode: appPortalSettings0107.portal_access_mode || "accepted_onboarding",
      applicant_account_mode: appPortalSettings0107.applicant_account_mode || appPortalSettings0107.portal_access_mode || "accepted_onboarding",
      portal_url: "/applicant-portal",
    },
    debug: renderMode === "debug" ? { page_settings_found: Boolean(settings), active_style_profile_found: Boolean(style), custom_question_count: (questions || []).length } : undefined,
  };
}

async function seedApplicantTasksForApplication(serviceClient: SupabaseClientAny, organizationId: string, applicationId: string): Promise<void> {
  try {
    const { data: definitions, error } = await serviceClient
      .from("core_applicant_task_definitions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) return;
    const rows = (definitions || []).map((task: JsonRecord) => ({
      application_id: applicationId,
      organization_id: organizationId,
      task_definition_id: task.task_definition_id || null,
      task_key: cleanString(task.task_key),
      label: cleanString(task.label),
      description: cleanString(task.description),
      responsible_party: cleanString(task.responsible_party || "admin"),
      task_type: cleanString(task.task_type || "manual"),
      is_required: task.is_required !== false,
      sort_order: Number(task.sort_order || 100),
      settings_json: jsonObject(task.settings_json),
    })).filter((row) => row.task_key && row.label);
    if (rows.length) await serviceClient.from("core_applicant_tasks").upsert(rows, { onConflict: "application_id,task_key" });
  } catch (error) {
    console.warn("applicant_task_seed_failed", error instanceof Error ? error.message : String(error));
  }
}


function maskApplicantEmail0098(email: unknown): string {
  const value = publicValidEmail(email);
  if (!value) return "masked email";
  const [local, domainFull] = value.split("@");
  const domainParts = (domainFull || "").split(".");
  const domain = domainParts[0] || "";
  const suffix = domainParts.slice(1).join(".");
  return `${(local || "").slice(0,1) || "•"}••••@${(domain || "").slice(0,1) || "•"}•••••••${suffix ? `.${suffix}` : ""}`;
}

async function findPossibleApplicantDuplicate0098(serviceClient: SupabaseClientAny, organizationId: string, firstName: string, lastName: string, dob: string | null, email: string, phone: string): Promise<JsonRecord | null> {
  const normFirst = cleanString(firstName).toLowerCase();
  const normLast = cleanString(lastName).toLowerCase();
  const normEmail = publicValidEmail(email);
  const normPhone = cleanString(phone).replace(/[^0-9]+/g, "");
  let query = serviceClient
    .from("core_applications")
    .select("application_id, first_name, last_name, date_of_birth, email, phone, submitted_at, applicant_status, archived_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .limit(25);
  if (dob) query = query.eq("date_of_birth", dob);
  const { data, error } = await query;
  if (error) throw error;
  for (const row of ((data || []) as JsonRecord[])) {
    const byNameDob = dob && cleanString(row.date_of_birth) === dob && cleanString(row.first_name).toLowerCase() === normFirst && cleanString(row.last_name).toLowerCase() === normLast;
    const byEmail = normEmail && publicValidEmail(row.email) === normEmail;
    const byPhone = normPhone && cleanString(row.phone).replace(/[^0-9]+/g, "") === normPhone;
    if (byNameDob || byEmail || byPhone) return row;
  }
  return null;
}

async function submitApplicantApplication(serviceClient: SupabaseClientAny, body: JsonRecord, req: Request): Promise<JsonRecord> {
  const hp = cleanLimited(body.hp_field || body["hp-field"] || body.website || body.company, 200);
  if (hp) return { ok: true, action: "submit_applicant_application", spam_discarded: true, message: "Thanks. Your application has been received." };

  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const pageKey = normalizeKey(body.page_key || "apply-now") || "apply-now";
  if (!organizationKey) return { ok: false, error: "missing_organization_key", message: "Missing organization key." };

  const firstName = cleanLimited(body.first_name, 120);
  const lastName = cleanLimited(body.last_name, 120);
  const email = publicValidEmail(body.email);
  const phone = cleanLimited(body.phone || body.mobile_phone, 80);
  const dob = optionalDate(body.date_of_birth || body.dob);
  const pilotCertificateNumber = cleanLimited(body.pilot_certificate_number, 100);
  const whyJoin = cleanLimited(body.why_join || body.objectives, 4000);
  const howHearUs = cleanLimited(body.how_hear_us || body.referral_source, 1000);
  if (!firstName) return { ok: false, error: "missing_first_name", message: "First name is required." };
  if (!lastName) return { ok: false, error: "missing_last_name", message: "Last name is required." };
  if (!email) return { ok: false, error: "invalid_email", message: "A valid email is required." };
  if (!phone) return { ok: false, error: "missing_phone", message: "Phone is required." };
  if (!dob) return { ok: false, error: "missing_date_of_birth", message: "Date of birth is required." };
  if (!pilotCertificateNumber) return { ok: false, error: "missing_pilot_certificate", message: "Pilot certificate number is required." };
  if (!whyJoin) return { ok: false, error: "missing_why_join", message: "Please tell us why you want to join." };
  if (!howHearUs) return { ok: false, error: "missing_referral_source", message: "Please tell us how you heard about us." };

  const { data: organization, error: organizationError } = await serviceClient
    .from("core_organizations")
    .select("organization_id, organization_key, display_name, status, archived_at")
    .eq("organization_key", organizationKey)
    .is("archived_at", null)
    .maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) return { ok: false, error: "organization_not_found", message: "Organization not found." };
  if (organization.status === "archived" || organization.status === "paused") return { ok: false, error: "organization_unavailable", message: "Organization is not available." };
  const organizationId = String(organization.organization_id);

  const { data: site, error: siteError } = await serviceClient
    .from("core_sites")
    .select("site_id, organization_id, site_key, status, archived_at")
    .eq("organization_id", organizationId)
    .eq("site_key", siteKey)
    .is("archived_at", null)
    .maybeSingle();
  if (siteError) throw siteError;
  const { data: page, error: pageError } = await serviceClient
    .from("core_customer_pages")
    .select("customer_page_id, organization_id, site_id, page_key, status, archived_at")
    .eq("organization_id", organizationId)
    .eq("page_key", pageKey)
    .is("archived_at", null)
    .maybeSingle();
  if (pageError) throw pageError;

  const messageText = [whyJoin, cleanLimited(body.expected_flying), cleanLimited(body.accident_details), cleanLimited(body.faa_details)].join(" ");
  const linkCount = (messageText.match(/https?:\/\//gi) || []).length;
  const elapsed = Number(body.form_elapsed_ms || body.elapsed_ms || 0);
  const spamSignals: string[] = [];
  if (elapsed > 0 && elapsed < 2500) spamSignals.push("too_fast");
  if (linkCount > 3) spamSignals.push("many_links");
  const spamScore = spamSignals.length;

  const addressJson = { street: cleanLimited(body.street_address || body.address_1 || body.address, 240), address_1: cleanLimited(body.address_1 || body.street_address || body.address, 240), address_2: cleanLimited(body.address_2, 240), city: cleanLimited(body.city, 120), state: cleanLimited(body.state, 80), zip: cleanLimited(body.zip || body.postal_code, 40) };
  const backgroundJson = { employer: cleanLimited(body.employer, 180), occupation: cleanLimited(body.occupation, 180) };
  const aviationJson = { pilot_certificate_number: pilotCertificateNumber, certificate_level: cleanLimited(body.certificate_level, 120), ratings: cleanLimited(body.ratings, 500), medical_status: cleanLimited(body.medical_status, 120), last_medical_date: optionalDate(body.last_medical_date), total_hours: cleanLimited(body.total_hours, 80), night_hours: cleanLimited(body.night_hours, 80), ifr_hours: cleanLimited(body.ifr_hours, 80), complex_hours: cleanLimited(body.complex_hours, 80), aircraft_types: cleanLimited(body.aircraft_types, 1000), bfr_aircraft: cleanLimited(body.bfr_aircraft, 300), bfr_date: optionalDate(body.bfr_date), other_clubs_fbos: cleanLimited(body.other_clubs_fbos, 1000), expected_flying: cleanLimited(body.expected_flying, 2000) };
  const safetyJson = { accident_history: yesNo(body.accident_history), accident_details: cleanLimited(body.accident_details, 3000), faa_action_history: yesNo(body.faa_action_history), faa_details: cleanLimited(body.faa_details, 3000) };
  const interestJson = { why_join: whyJoin, how_hear_us: howHearUs, referral_source: howHearUs };
  const metadata = { user_agent: req.headers.get("user-agent") || null, referer: req.headers.get("referer") || null, origin: req.headers.get("origin") || null, submitted_at: new Date().toISOString(), source: "public_apply_now_form", source_url: cleanLimited(body.source_url || body.sourceUrl, 1000), spam_signals: spamSignals };

  const applicantKey = normalizeKey(`${lastName}-${firstName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`) || `applicant-${Date.now().toString(36)}`;

  const possibleDuplicate = await findPossibleApplicantDuplicate0098(serviceClient, organizationId, firstName, lastName, dob, email, phone);
  if (possibleDuplicate) {
    return {
      ok: false,
      action: "submit_applicant_application",
      error: "possible_duplicate_application",
      possible_duplicate: true,
      message: `This may match an existing application. If this is you, please use applicant login or password reset for ${maskApplicantEmail0098(possibleDuplicate.email || email)} rather than submitting another application.`,
      masked_email: maskApplicantEmail0098(possibleDuplicate.email || email),
      submitted_at: possibleDuplicate.submitted_at || null,
    };
  }

  const { data: inserted, error: insertError } = await serviceClient
    .from("core_applications")
    .insert({ organization_id: organizationId, site_id: site?.site_id || null, customer_page_id: page?.customer_page_id || null, applicant_key: applicantKey, source_page_key: pageKey, source_url: cleanLimited(body.source_url || body.sourceUrl, 1000), applicant_status: "new", status: "new", stage_key: "new", first_name: firstName, last_name: lastName, display_name: `${firstName} ${lastName}`.trim(), email, primary_email: email, phone, primary_phone: phone, date_of_birth: dob, address_json: addressJson, background_json: backgroundJson, employment_json: backgroundJson, aviation_json: aviationJson, safety_json: safetyJson, interest_json: interestJson, custom_answers_json: jsonObject(body.custom_answers_json), metadata_json: metadata, spam_score: spamScore, spam_reason: spamSignals.join(", ") })
    .select("application_id, created_at")
    .single();
  if (insertError) throw insertError;
  await seedApplicantTasksForApplication(serviceClient, organizationId, String(inserted.application_id));
  try { await serviceClient.from("core_applicant_events").insert({ application_id: inserted.application_id, organization_id: organizationId, event_type: "submitted", actor_email: email, after_json: { application_id: inserted.application_id, display_name: `${firstName} ${lastName}`.trim(), email }, metadata_json: metadata }); } catch (_) {}

  const appSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);
  const portalMode0107 = applicantPortalAccessMode0107(appSettings0107.portal_access_mode || appSettings0107.applicant_account_mode);
  return { ok: true, action: "submit_applicant_application", application_id: inserted.application_id, created_at: inserted.created_at, message: "Thanks. Your application has been received.", applicant_portal: { available: portalMode0107 !== "none", portal_access_mode: portalMode0107, portal_url: "/applicant-portal" } };
}

async function submitContactInquiry(serviceClient: SupabaseClientAny, body: JsonRecord, req: Request): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const pageKey = normalizeKey(body.page_key || "home") || "home";

  const name = cleanContactField(body.name, 160);
  const email = validContactEmail(body.email);
  const phone = cleanContactField(body.phone, 80);
  const reasonKey = normalizeKey(body.reason_key || body.reason || body.subject_key || "");
  const reasonLabel = cleanContactField(body.reason_label || body.reasonLabel || body.subject || "", 200);
  const subject = reasonLabel || (reasonKey ? reasonKey.replace(/-/g, " ") : "General question");
  const message = String(body.message ?? "").trim().slice(0, 8000);
  const sourceUrl = cleanContactField(body.source_url || body.sourceUrl, 1000);
  const assessment = contactSpamAssessment(body, message, email);

  if (assessment.honeypot) {
    return { ok: true, action: "submit_contact_inquiry", spam_discarded: true, message: "Thanks. Your message has been received." };
  }

  if (!organizationKey) return { ok: false, error: "missing_organization_key", message: "Missing organization key." };
  if (!name) return { ok: false, error: "missing_name", message: "Please provide your name." };
  if (!email) return { ok: false, error: "invalid_email", message: "Please provide a valid email." };
  if (!message || message.length < 10) return { ok: false, error: "missing_message", message: "Please provide a message of at least 10 characters." };

  const { data: organization, error: organizationError } = await serviceClient
    .from("core_organizations")
    .select("organization_id, organization_key, display_name, status, archived_at")
    .eq("organization_key", organizationKey)
    .is("archived_at", null)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) return { ok: false, error: "organization_not_found", message: "Organization not found." };
  if (organization.status === "archived" || organization.status === "paused") {
    return { ok: false, error: "organization_unavailable", message: "Organization is not available." };
  }

  const organizationId = String(organization.organization_id);

  const duplicateCount = await duplicateRecentContactCount(serviceClient, organizationId, email);
  if (duplicateCount >= 2) {
    assessment.score = Number(assessment.score || 0) + 30;
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons as string[] : [];
    reasons.push("recent_duplicate_email");
    assessment.reasons = reasons;
  }

  const { data: site, error: siteError } = await serviceClient
    .from("core_sites")
    .select("site_id, organization_id, site_key, status, archived_at")
    .eq("organization_id", organizationId)
    .eq("site_key", siteKey)
    .is("archived_at", null)
    .maybeSingle();

  if (siteError) throw siteError;

  const { data: page, error: pageError } = await serviceClient
    .from("core_customer_pages")
    .select("customer_page_id, organization_id, site_id, page_key, status, archived_at")
    .eq("organization_id", organizationId)
    .eq("page_key", pageKey)
    .is("archived_at", null)
    .maybeSingle();

  if (pageError) throw pageError;

  const metadata = {
    user_agent: req.headers.get("user-agent") || null,
    referer: req.headers.get("referer") || null,
    submitted_at: new Date().toISOString(),
    source: "public_home_contact_form",
    reason_key: reasonKey || null,
    spam_assessment: assessment,
  };

  const status = Number(assessment.score || 0) >= 45 ? "spam_suspected" : "open";

  const { data: inserted, error: insertError } = await serviceClient
    .from("core_contact_inquiries")
    .insert({
      organization_id: organization.organization_id,
      site_id: site?.site_id || null,
      customer_page_id: page?.customer_page_id || null,
      source_page_key: pageKey,
      source_url: sourceUrl || null,
      name,
      email,
      phone: phone || null,
      subject,
      reason_key: reasonKey || null,
      reason_label: subject || null,
      message,
      status,
      priority: "normal",
      spam_score: Number(assessment.score || 0),
      spam_reasons: Array.isArray(assessment.reasons) ? assessment.reasons : [],
      metadata_json: metadata,
    })
    .select("contact_inquiry_id, created_at")
    .single();

  if (insertError) throw insertError;

  await writeContactInquiryEvent(serviceClient, String(inserted.contact_inquiry_id || ""), organizationId, status === "spam_suspected" ? "submitted_spam_suspected" : "submitted", { status, spam_score: assessment.score, spam_reasons: assessment.reasons });

  return {
    ok: true,
    action: "submit_contact_inquiry",
    contact_inquiry_id: inserted.contact_inquiry_id,
    created_at: inserted.created_at,
    message: "Thanks. Your message has been received.",
  };
}


function normalizeEventAudience(value: unknown, fallback = "public"): string {
  const raw = normalizeKey(value || fallback).replace(/-/g, "_");
  if (["public", "logged_in", "user", "member", "admin"].includes(raw)) return raw;
  if (["members", "users"].includes(raw)) return raw.slice(0, -1);
  if (["selected_classes", "classes", "selected_roles", "roles"].includes(raw)) return "member";
  if (["organization_admin", "org_admin", "board", "internal", "admins"].includes(raw)) return "admin";
  return fallback;
}

function eventDateIsPast(value: unknown): boolean {
  const raw = cleanString(value);
  if (!raw) return false;
  const d = new Date(raw);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

function safeInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

function eventVisibilityPublic(value: unknown): boolean {
  const raw = normalizeKey(value || "public").replace(/-/g, "_");
  return ["public", "published_public"].includes(raw);
}

function eventIsPublished(row: JsonRecord): boolean {
  const status = normalizeKey(row.status || "");
  return ["published", "active", "live"].includes(status) && !row.archived_at;
}

function safePublicEvent(row: JsonRecord, summary: JsonRecord = {}, supabaseUrl = ""): JsonRecord {
  const audience = normalizeEventAudience(row.rsvp_audience || (row.rsvp_public_enabled ? "public" : "member"));
  const rsvpEnabled = Boolean(row.rsvp_enabled);
  const publicRsvpAllowed = rsvpEnabled && Boolean(row.rsvp_public_enabled) && audience === "public";
  const deadlinePassed = eventDateIsPast(row.rsvp_deadline_at);
  const capacity = row.capacity === null || row.capacity === undefined ? null : safeInt(row.capacity, 0);
  const yesCount = safeInt(summary.yes_count, 0);
  const attendeeCount = safeInt(summary.attendee_count, 0);
  const waitlistCount = safeInt(summary.waitlist_count, 0);
  const typeJson = jsonObject(row.event_type_json);
  const locationJson = jsonObject(row.location_json);
  const eventImageAsset = jsonObject(row.event_image_asset_json);
  const typeImageAsset = jsonObject(typeJson.image_asset_json);
  const eventImagePath = cleanString(row.event_image_path || eventImageAsset.storage_path || eventImageAsset.path || "");
  const typeImagePath = cleanString(typeJson.image_storage_path || typeImageAsset.storage_path || typeImageAsset.path || "");
  const eventImageUrl = cleanString(
    row.event_image_url ||
    eventImageAsset.public_url ||
    eventImageAsset.url ||
    (supabaseUrl && eventImagePath ? publicStorageImageUrl(supabaseUrl, "core-assets", eventImagePath, 1200) : "") ||
    typeJson.image_url ||
    typeJson.default_image_url ||
    typeImageAsset.public_url ||
    typeImageAsset.url ||
    (supabaseUrl && typeImagePath ? publicStorageImageUrl(supabaseUrl, "core-assets", typeImagePath, 1200) : "")
  );
  const typeLabel = cleanString(row.event_type_label || row.category || typeJson.label || "General") || "General";
  const accentColor = cleanString(row.event_accent_color || row.accent_color || row.event_type_color || typeJson.accent_color || typeJson.color || "");
  return {
    event_id: row.event_id,
    organization_id: row.organization_id,
    event_key: row.event_key || null,
    title: row.title || "Event",
    category: typeLabel,
    event_type_key: row.event_type_key || typeJson.type_key || null,
    event_type_label: typeLabel,
    event_type_json: typeJson,
    event_accent_color: accentColor || null,
    accent_color: accentColor || null,
    visibility: row.visibility || "public",
    visibility_audience: row.visibility_audience || row.visibility || "public",
    status: row.status || null,
    starts_at: row.starts_at || null,
    ends_at: row.ends_at || null,
    timezone: row.timezone || "America/New_York",
    location_key: row.location_key || null,
    location_mode: row.location_mode || locationJson.location_mode || "in_person",
    online_platform: row.online_platform || locationJson.online_platform || null,
    online_join_url_available: Boolean(row.online_join_url),
    location_name: row.location_name || locationJson.location_name || locationJson.label || (row.location_mode === "online" ? "Online event" : null),
    location_address: row.location_mode === "online" ? null : (row.location_address || locationJson.location_address || locationJson.address || null),
    map_query: row.location_mode === "online" ? null : (row.map_query || locationJson.map_query || null),
    map_embed_url: row.location_mode === "online" ? null : (row.map_embed_url || locationJson.map_embed_url || null),
    location_json: { ...locationJson, online_join_url: undefined },
    summary: row.summary || row.short_summary || null,
    short_summary: row.summary || row.short_summary || null,
    description: row.description || row.full_description || null,
    full_description: row.description || row.full_description || null,
    featured: Boolean(row.featured),
    sort_order: row.sort_order ?? 100,
    event_image_url: eventImageUrl || null,
    image_url: eventImageUrl || null,
    event_image_path: eventImagePath || null,
    event_image_asset_json: eventImageAsset,
    organizer_person_id: row.organizer_person_id || null,
    rsvp_enabled: rsvpEnabled,
    rsvp_public_enabled: Boolean(row.rsvp_public_enabled),
    rsvp_audience: audience,
    rsvp_deadline_at: row.rsvp_deadline_at || null,
    rsvp_deadline_passed: deadlinePassed,
    public_rsvp_allowed: publicRsvpAllowed && !deadlinePassed,
    allow_guests: row.allow_guests !== false,
    max_guests_per_rsvp: safeInt(row.max_guests_per_rsvp, 0),
    capacity,
    capacity_remaining: capacity === null ? null : Math.max(0, capacity - attendeeCount),
    rsvp_waitlist_enabled: row.rsvp_waitlist_enabled !== false,
    rsvp_capacity_behavior: row.rsvp_capacity_behavior || "waitlist",
    show_attendee_list: row.show_attendee_list !== false,
    attendee_list_visibility: row.attendee_list_visibility || "logged_in",
    rsvp_summary: {
      yes: yesCount,
      maybe: safeInt(summary.maybe_count, 0),
      no: safeInt(summary.no_count, 0),
      waitlist: waitlistCount,
      attendees: attendeeCount,
      total_rsvps: safeInt(summary.total_count, 0),
    },
  };
}

async function fetchEventRsvpSummaries(serviceClient: SupabaseClientAny, eventIds: string[]): Promise<Map<string, JsonRecord>> {
  const out = new Map<string, JsonRecord>();
  const ids = Array.from(new Set(eventIds.map(cleanString).filter(Boolean)));
  if (!ids.length) return out;
  const { data, error } = await serviceClient
    .from("core_event_rsvps")
    .select("event_id,response_status,attendee_count,adult_count,child_count,guest_count,archived_at")
    .in("event_id", ids)
    .is("archived_at", null);
  if (error) throw error;
  for (const row of (data || []) as JsonRecord[]) {
    const id = cleanString(row.event_id);
    const current = out.get(id) || { yes_count: 0, maybe_count: 0, no_count: 0, waitlist_count: 0, attendee_count: 0, total_count: 0 };
    const status = normalizeKey(row.response_status || "yes").replace(/-/g, "_");
    current.total_count = safeInt(current.total_count, 0) + 1;
    if (status === "yes") {
      current.yes_count = safeInt(current.yes_count, 0) + 1;
      current.attendee_count = safeInt(current.attendee_count, 0) + safeInt(row.attendee_count, 0);
    } else if (status === "maybe") current.maybe_count = safeInt(current.maybe_count, 0) + 1;
    else if (status === "waitlist") current.waitlist_count = safeInt(current.waitlist_count, 0) + 1;
    else if (status === "no") current.no_count = safeInt(current.no_count, 0) + 1;
    out.set(id, current);
  }
  return out;
}

async function listPublicCalendarEvents(serviceClient: SupabaseClientAny, supabaseUrl: string, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_events")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", ["published", "active", "live"])
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = ((data || []) as JsonRecord[]).filter((event) => eventVisibilityPublic(event.visibility));
  const summaries = await fetchEventRsvpSummaries(serviceClient, rows.map((row) => cleanString(row.event_id)));
  return rows.map((row) => safePublicEvent(row, summaries.get(cleanString(row.event_id)) || {}, supabaseUrl));
}


function eventRsvpAudience(event: JsonRecord): string {
  const raw = cleanString(event.rsvp_audience || (event.rsvp_public_enabled ? "public" : "members")).toLowerCase().replace(/_/g, "-");
  if (["public", "logged-in", "logged_in", "members", "member", "users", "admins", "admin", "organization-admin", "roles", "classes", "none", "disabled"].includes(raw)) {
    if (raw === "logged_in") return "logged-in";
    if (raw === "member" || raw === "users") return "members";
    if (raw === "admin" || raw === "organization-admin") return "admins";
    return raw;
  }
  return event.rsvp_public_enabled ? "public" : "members";
}

function publicCanRsvpToEvent(event: JsonRecord): boolean {
  if (!event.rsvp_enabled) return false;
  if (eventRsvpAudience(event) !== "public") return false;
  if (event.rsvp_deadline_at) {
    const deadline = new Date(String(event.rsvp_deadline_at));
    if (!Number.isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) return false;
  }
  return true;
}

async function publicRsvpCounts(serviceClient: SupabaseClientAny, eventId: string): Promise<JsonRecord> {
  const { data, error } = await serviceClient
    .from("core_event_rsvps")
    .select("rsvp_id,response_status,attendee_count,archived_at")
    .eq("event_id", eventId)
    .is("archived_at", null);
  if (error) throw error;
  const rows = (data || []) as JsonRecord[];
  let yes = 0, maybe = 0, no = 0, waitlist = 0, totalAttendees = 0;
  for (const row of rows) {
    const status = cleanString(row.response_status || "no_response");
    if (status === "yes") { yes += 1; totalAttendees += Math.max(0, Number(row.attendee_count || 0)); }
    else if (status === "maybe") maybe += 1;
    else if (status === "no") no += 1;
    else if (status === "waitlist") waitlist += 1;
  }
  return { yes, maybe, no, waitlist, total_attendees: totalAttendees, total_responses: rows.length };
}

async function publicEventWithCounts(serviceClient: SupabaseClientAny, event: JsonRecord): Promise<JsonRecord> {
  const counts = await publicRsvpCounts(serviceClient, cleanString(event.event_id));
  return { ...event, rsvp_counts: counts, public_can_rsvp: publicCanRsvpToEvent(event), rsvp_audience: eventRsvpAudience(event) };
}

async function capacityOutcomeForPublicRsvp(serviceClient: SupabaseClientAny, event: JsonRecord, requestedStatus: string, requestedAttendeeCount: number): Promise<{ status: string; message: string | null }> {
  if (requestedStatus !== "yes") return { status: requestedStatus, message: null };
  const capacity = Number(event.capacity || 0);
  if (!Number.isFinite(capacity) || capacity <= 0) return { status: requestedStatus, message: null };
  const counts = await publicRsvpCounts(serviceClient, cleanString(event.event_id));
  if (Number(counts.total_attendees || 0) + Math.max(0, requestedAttendeeCount) <= capacity) return { status: requestedStatus, message: null };
  const behavior = cleanString(event.rsvp_capacity_behavior || "waitlist").toLowerCase();
  if (behavior === "block") throw new Error("This event is currently full.");
  return { status: "waitlist", message: "This event is full. Your RSVP was added to the waitlist." };
}

async function getCalendarPagePayload(serviceClient: SupabaseClientAny, supabaseUrl: string, body: JsonRecord): Promise<JsonRecord> {
  const organizationKey = normalizeKey(body.organization_key || body.customer_key || body.org_key);
  const pageKey = normalizeKey(body.page_key || "calendar") || "calendar";
  const siteKey = normalizeKey(body.site_key || "primary") || "primary";
  const renderMode = cleanString(body.render_mode || "public") || "public";

  const context = await resolvePublicPageContext(serviceClient, organizationKey, siteKey, pageKey, "calendar");
  if (context.ok === false) return context;

  const organization = context.organization as JsonRecord;
  const site = context.site as JsonRecord | null;
  const page = context.page as JsonRecord;
  const template = context.template as JsonRecord;
  const settings = context.settings as JsonRecord | null;
  const style = context.style as JsonRecord | null;

  const appPortalSettings0107 = await getApplicantSettingsPublic0107(serviceClient, organizationId);

  const pageSettings = settings ? {
    title: settings.title,
    intro_text: settings.intro_text,
    labels_json: jsonObject(settings.labels_json),
    options_json: jsonObject(settings.options_json),
    visibility_json: jsonObject(settings.visibility_json),
    content_json: jsonObject(settings.content_json),
    updated_at: settings.updated_at,
  } : {
    title: page.nav_label || "Calendar",
    intro_text: "",
    labels_json: {},
    options_json: {},
    visibility_json: {},
    content_json: {},
    updated_at: null,
  };

  const siteShell = await getPublicSiteShell(serviceClient, supabaseUrl, organization, site, style);

  // Read directly from core_events so newly-added public-safe event fields
  // (accent color, event image metadata, map fields, summaries/descriptions) do not
  // depend on the older public view definition being refreshed in the database.
  const baseEvents = await listPublicCalendarEvents(serviceClient, supabaseUrl, String(organization.organization_id));
  const hydratedEvents: JsonRecord[] = [];
  for (const event of baseEvents) hydratedEvents.push(await publicEventWithCounts(serviceClient, event));

  return {
    ok: true,
    action: "get_calendar_page",
    render_mode: renderMode,
    organization: {
      organization_id: organization.organization_id,
      organization_key: organization.organization_key,
      display_name: organization.display_name,
      organization_type: organization.organization_type,
      vertical: organization.vertical,
    },
    site: site ? {
      site_id: site.site_id,
      site_key: site.site_key,
      site_name: site.site_name,
      site_type: site.site_type,
      primary_domain: site.primary_domain,
      default_subdomain: site.default_subdomain,
      settings_json: publicSiteSettings(site),
    } : null,
    site_shell: siteShell,
    page: {
      customer_page_id: page.customer_page_id,
      page_key: page.page_key,
      page_slug: page.page_slug,
      nav_label: page.nav_label,
      status: page.status,
      show_in_nav: page.show_in_nav,
    },
    template: {
      template_id: template.template_id,
      template_key: template.template_key,
      template_name: template.template_name,
      module_key: template.module_key,
      build_status: template.build_status,
      render_contract_json: jsonObject(template.render_contract_json),
    },
    page_settings: pageSettings,
    style_profile: pickPublicStyle(style || null),
    events: hydratedEvents,
    debug: renderMode === "debug" ? { public_event_count: hydratedEvents.length, page_settings_found: Boolean(settings), active_style_profile_found: Boolean(style), rsvp_rules_version: "2026-06-09-096-A" } : undefined,
  };
}




// =======================
// Public RSVP Checklist / Bring-Items Claiming 0095
// Later declarations intentionally override the 0093 public RSVP functions above.
// =======================

async function fetchPublicEventNeeds0095(serviceClient: SupabaseClientAny, organizationId: string, eventId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_needed_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .is("archived_at", null)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: JsonRecord) => ({
    event_need_id: row.event_need_id,
    event_id: row.event_id,
    organization_id: row.organization_id,
    item_key: row.item_key || null,
    label: row.label || row.item_label || row.name || "Item",
    quantity_needed: safeInt(row.quantity_needed || row.quantity || 1, 1),
    notes: row.notes || null,
    sort_order: row.sort_order ?? 100,
    status: row.status || "active",
  }));
}

async function fetchPublicEventNeedClaims0095(serviceClient: SupabaseClientAny, organizationId: string, eventId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_needed_item_claims")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .is("archived_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function normalizePublicClaimRows0095(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = jsonObject(raw);
    const eventNeedId = cleanString(row.event_need_id || row.id);
    if (!eventNeedId) return null;
    return {
      event_need_id: eventNeedId,
      quantity_claimed: Math.max(0, Math.trunc(Number(row.quantity_claimed ?? row.quantity ?? 0))),
      note: cleanString(row.note || row.notes),
    } as JsonRecord;
  }).filter(Boolean) as JsonRecord[];
}

function uniqueStrings0095(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function personDisplayNameFromRow0095(person: JsonRecord): string {
  const profile = jsonObject(person.profile_json);
  const nameProfile = jsonObject(profile.name);
  const preferred = cleanString(nameProfile.preferred_first_name || nameProfile.preferred_name || person.first_name);
  const suffix = cleanString(nameProfile.suffix || person.suffix);
  return cleanString(person.display_name || [preferred, person.last_name, suffix].map(cleanString).filter(Boolean).join(" "));
}

function calculatedPublicClaimantName0095(row: JsonRecord, peopleById: Map<string, JsonRecord> = new Map(), peopleByEmail: Map<string, JsonRecord> = new Map()): string {
  const person = peopleById.get(cleanString(row.person_id)) || peopleByEmail.get(cleanString(row.respondent_email || row.claimed_by_email).toLowerCase()) || {};
  const personName = personDisplayNameFromRow0095(person as JsonRecord);
  return personName || cleanString(row.respondent_name) || cleanString(row.respondent_email) || cleanString(row.claimed_by_email) || "Claimed";
}

async function fetchPublicRsvpClaimNameMap0095(serviceClient: SupabaseClientAny, eventId: string, rsvpIds: string[]): Promise<Map<string, JsonRecord>> {
  const ids = uniqueStrings0095(rsvpIds);
  const out = new Map<string, JsonRecord>();
  if (!ids.length) return out;
  let rows: JsonRecord[] = [];
  const fullResult = await serviceClient
    .from("core_event_rsvps")
    .select("rsvp_id, respondent_name, respondent_email, person_id, membership_id, response_status")
    .eq("event_id", eventId)
    .in("rsvp_id", ids)
    .is("archived_at", null);
  if (fullResult.error) {
    // Older RSVP schemas may not expose person/membership columns. Degrade safely instead of crashing public RSVP.
    const basicResult = await serviceClient
      .from("core_event_rsvps")
      .select("rsvp_id, respondent_name, respondent_email, response_status")
      .eq("event_id", eventId)
      .in("rsvp_id", ids)
      .is("archived_at", null);
    if (basicResult.error) return out;
    rows = (basicResult.data || []) as JsonRecord[];
  } else {
    rows = (fullResult.data || []) as JsonRecord[];
  }
  const personIds = uniqueStrings0095(rows.map((row) => row.person_id));
  const emails = uniqueStrings0095(rows.map((row) => cleanString(row.respondent_email).toLowerCase()));
  const peopleById = new Map<string, JsonRecord>();
  const peopleByEmail = new Map<string, JsonRecord>();
  if (personIds.length || emails.length) {
    let peopleQuery = serviceClient
      .from("core_people")
      .select("person_id, display_name, first_name, last_name, primary_email, profile_json");
    if (personIds.length) peopleQuery = peopleQuery.in("person_id", personIds);
    else peopleQuery = peopleQuery.in("primary_email", emails);
    const { data: people, error: peopleError } = await peopleQuery;
    if (!peopleError) {
      for (const person of people || []) {
        peopleById.set(cleanString(person.person_id), person as JsonRecord);
        const email = cleanString(person.primary_email).toLowerCase();
        if (email) peopleByEmail.set(email, person as JsonRecord);
      }
    }
  }
  for (const row of rows) {
    out.set(cleanString(row.rsvp_id), { ...(row as JsonRecord), respondent_name: calculatedPublicClaimantName0095(row as JsonRecord, peopleById, peopleByEmail) });
  }
  return out;
}

async function buildPublicChecklist0095(serviceClient: SupabaseClientAny, organizationId: string, eventId: string, viewerRsvpId = "", includeClaimNames = true): Promise<JsonRecord> {
  const needs = await fetchPublicEventNeeds0095(serviceClient, organizationId, eventId);
  const claims = await fetchPublicEventNeedClaims0095(serviceClient, organizationId, eventId);
  const rsvpMap = includeClaimNames
    ? await fetchPublicRsvpClaimNameMap0095(serviceClient, eventId, claims.map((claim) => cleanString(claim.rsvp_id)))
    : new Map<string, JsonRecord>();
  const claimsByNeed = new Map<string, JsonRecord[]>();
  for (const claim of claims) {
    const needId = cleanString(claim.event_need_id);
    const list = claimsByNeed.get(needId) || [];
    list.push(claim);
    claimsByNeed.set(needId, list);
  }
  const items = needs.map((need) => {
    const needId = cleanString(need.event_need_id);
    const rowClaims = claimsByNeed.get(needId) || [];
    const publicClaims = rowClaims.map((claim) => {
      const rsvp = rsvpMap.get(cleanString(claim.rsvp_id)) || {};
      const name = includeClaimNames ? calculatedPublicClaimantName0095({ ...claim, ...rsvp }) : "Claimed";
      return {
        event_need_claim_id: claim.event_need_claim_id,
        event_need_id: needId,
        rsvp_id: claim.rsvp_id || null,
        quantity_claimed: safeInt(claim.quantity_claimed, 0),
        note: cleanString(claim.note),
        name,
        respondent_name: name,
        respondent_email: includeClaimNames ? cleanString(rsvp.respondent_email || claim.claimed_by_email) : "",
        mine: viewerRsvpId ? cleanString(claim.rsvp_id) === viewerRsvpId : false,
      };
    });
    const totalClaimed = publicClaims.reduce((sum, claim) => sum + safeInt(claim.quantity_claimed, 0), 0);
    const quantityNeeded = Math.max(1, safeInt(need.quantity_needed, 1));
    const myClaim = publicClaims.find((claim) => claim.mine) || { quantity_claimed: 0, note: "" };
    return {
      ...need,
      quantity_needed: quantityNeeded,
      quantity_claimed: totalClaimed,
      total_claimed: totalClaimed,
      remaining: Math.max(0, quantityNeeded - totalClaimed),
      claims: publicClaims,
      my_claim: myClaim,
    };
  });
  return { items, needed_items: items, summary: { total_items: items.length, still_needed: items.reduce((sum, item) => sum + safeInt(item.remaining, 0), 0), total_claimed: items.reduce((sum, item) => sum + safeInt(item.quantity_claimed, 0), 0) } };
}

async function replacePublicRsvpNeededItemClaims0095(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  eventId: string,
  rsvpId: string,
  body: JsonRecord,
  actorEmail: string,
  finalStatus: string,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(body, "event_needed_item_claims")) return;
  const requested = ["yes", "maybe", "waitlist"].includes(finalStatus)
    ? normalizePublicClaimRows0095(body.event_needed_item_claims)
    : [];
  const needs = await fetchPublicEventNeeds0095(serviceClient, organizationId, eventId);
  const needsById = new Map<string, JsonRecord>(needs.map((need) => [cleanString(need.event_need_id), need] as [string, JsonRecord]));
  const currentClaims = await fetchPublicEventNeedClaims0095(serviceClient, organizationId, eventId);
  const claimedByOthers = new Map<string, number>();
  for (const claim of currentClaims) {
    if (cleanString(claim.rsvp_id) === rsvpId) continue;
    const needId = cleanString(claim.event_need_id);
    claimedByOthers.set(needId, safeInt(claimedByOthers.get(needId), 0) + safeInt(claim.quantity_claimed, 0));
  }
  for (const claim of requested) {
    const needId = cleanString(claim.event_need_id);
    const need = needsById.get(needId);
    if (!need) throw new Error("One of the requested checklist items is no longer available.");
    const quantity = safeInt(claim.quantity_claimed, 0);
    const needed = Math.max(1, safeInt(need.quantity_needed, 1));
    const others = safeInt(claimedByOthers.get(needId), 0);
    if (quantity > 0 && others + quantity > needed) throw new Error(`${cleanString(need.label || "Checklist item")} only has ${Math.max(0, needed - others)} remaining.`);
  }
  const now = new Date().toISOString();
  const { error: archiveError } = await serviceClient
    .from("core_event_needed_item_claims")
    .update({ archived_at: now, status: "archived", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("rsvp_id", rsvpId)
    .is("archived_at", null);
  if (archiveError) throw archiveError;
  const inserts = requested.filter((claim) => safeInt(claim.quantity_claimed, 0) > 0).map((claim) => ({
    organization_id: organizationId,
    event_id: eventId,
    event_need_id: cleanString(claim.event_need_id),
    rsvp_id: rsvpId,
    quantity_claimed: Math.max(1, safeInt(claim.quantity_claimed, 1)),
    note: cleanString(claim.note) || null,
    status: "active",
    claimed_by_email: actorEmail || null,
    updated_at: now,
  }));
  if (inserts.length) {
    const { error: insertError } = await serviceClient.from("core_event_needed_item_claims").insert(inserts);
    if (insertError) throw insertError;
  }
}

async function getEventRsvpPagePayload(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord> {
  const eventId = cleanString(body.event_id || body.event);
  const eventKey = cleanString(body.event_key);
  const organizationKey = cleanString(body.organization_key || body.customer_key || "test-customer-1");
  let query = serviceClient.from("core_events_public_v1").select("*").limit(1);
  if (eventId) query = query.eq("event_id", eventId);
  else if (eventKey) {
    const { data: org, error: orgError } = await serviceClient.from("core_organizations").select("organization_id").eq("organization_key", organizationKey).maybeSingle();
    if (orgError) throw orgError;
    if (!org) return { ok: false, error: "organization_not_found", message: "Organization not found." };
    query = query.eq("organization_id", org.organization_id).eq("event_key", eventKey);
  } else return { ok: false, error: "missing_event", message: "Missing event id." };
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "event_not_found", message: "Event not found or not public." };
  const event = await publicEventWithCounts(serviceClient, data as JsonRecord);
  const canRsvp = publicCanRsvpToEvent(event);
  const checklist = canRsvp ? await buildPublicChecklist0095(serviceClient, cleanString(event.organization_id), cleanString(event.event_id), "", event.show_attendee_list !== false) : { items: [], needed_items: [], summary: {} };
  return { ok: true, action: "get_event_rsvp_page", event: { ...event, needed_items: checklist.items, public_can_rsvp: canRsvp }, public_can_rsvp: canRsvp, rsvp_counts: event.rsvp_counts, checklist };
}

async function submitEventRsvp(serviceClient: SupabaseClientAny, body: JsonRecord, req: Request): Promise<JsonRecord> {
  const eventId = cleanString(body.event_id || body.event);
  if (!eventId) return { ok: false, error: "missing_event", message: "Missing event id." };
  const { data: event, error: eventError } = await serviceClient.from("core_events_public_v1").select("*").eq("event_id", eventId).maybeSingle();
  if (eventError) throw eventError;
  if (!event) return { ok: false, error: "event_not_found", message: "Event not found or not public." };
  if (!publicCanRsvpToEvent(event as JsonRecord)) return { ok: false, error: "rsvp_disabled", message: "Public RSVP is not available for this event." };
  const respondentName = cleanString(body.respondent_name || body.name);
  if (!respondentName) return { ok: false, error: "missing_name", message: "Name is required." };
  const responseStatus = cleanString(body.response_status || "yes").toLowerCase();
  const requestedStatus = ["yes", "maybe", "no", "no_response", "cancelled"].includes(responseStatus) ? responseStatus : "yes";
  const isAttendingPersonally = body.is_attending_personally !== false;
  const additionalAdults = Math.max(0, Number(body.additional_adults ?? body.adult_count ?? 0));
  const additionalChildren = Math.max(0, Number(body.additional_children ?? body.child_count ?? 0));
  const attendeeCount = requestedStatus === "yes" ? Math.max(0, (isAttendingPersonally ? 1 : 0) + additionalAdults + additionalChildren) : 0;
  const outcome = await capacityOutcomeForPublicRsvp(serviceClient, event as JsonRecord, requestedStatus, attendeeCount);
  const safeStatus = outcome.status;
  const email = cleanString(body.respondent_email || body.email).toLowerCase();

  let existing: JsonRecord | null = null;
  if (email) {
    const { data: found, error: lookupError } = await serviceClient.from("core_event_rsvps").select("*").eq("event_id", event.event_id).ilike("respondent_email", email).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    existing = found || null;
  }

  const payload = {
    event_id: event.event_id,
    organization_id: event.organization_id,
    respondent_name: respondentName,
    respondent_email: email || null,
    response_status: safeStatus,
    attendee_count: attendeeCount,
    adult_count: additionalAdults,
    child_count: additionalChildren,
    additional_adults: additionalAdults,
    additional_children: additionalChildren,
    guest_count: additionalAdults + additionalChildren,
    is_attending_personally: isAttendingPersonally,
    shared_note: cleanString(body.shared_note),
    private_note: cleanString(body.private_note),
    source: "public_rsvp",
    respondent_type: "public_guest",
    metadata_json: { user_agent: req.headers.get("user-agent") || null, referer: req.headers.get("referer") || null, submitted_at: new Date().toISOString(), rsvp_rules_version: "2026-06-09-096-A" },
  };

  let saved: JsonRecord;
  if (existing?.rsvp_id) {
    const { data, error } = await serviceClient.from("core_event_rsvps").update(payload).eq("rsvp_id", existing.rsvp_id).select("rsvp_id, created_at, updated_at, response_status").single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient.from("core_event_rsvps").insert(payload).select("rsvp_id, created_at, updated_at, response_status").single();
    if (error) throw error;
    saved = data;
  }
  await replacePublicRsvpNeededItemClaims0095(serviceClient, cleanString(event.organization_id), cleanString(event.event_id), cleanString(saved.rsvp_id), body, email, safeStatus);
  return { ok: true, action: "submit_event_rsvp", rsvp_id: saved.rsvp_id, created_at: saved.created_at, updated_at: saved.updated_at, response_status: saved.response_status, message: outcome.message || "RSVP saved." };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      ok: false,
      error: "missing_environment",
      message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for public render function.",
    });
  }

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json", message: "Request body must be valid JSON." });
  }

  const action = cleanString(body.action || "get_aircraft_page");
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (action === "get_aircraft_page") {
      const result = await getAircraftPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "get_home_page") {
      const result = await getHomePagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "get_gallery_page") {
      const result = await getGalleryPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }


    if (action === "get_info_page") {
      const result = await getInfoPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }


    if (action === "get_documents_page") {
      const result = await getDocumentsPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }


    if (action === "get_calendar_page") {
      const result = await getCalendarPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "get_event_rsvp_page") {
      const result = await getEventRsvpPagePayload(serviceClient, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "submit_event_rsvp") {
      const result = await submitEventRsvp(serviceClient, body, req);
      return jsonResponse(result.ok === false ? 400 : 200, result);
    }

    if (action === "get_applicant_portal_public") {
      const result = await getApplicantPortalPublicPayload0107(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "request_applicant_portal_access") {
      const result = await requestApplicantPortalAccessPublic0107(serviceClient, body, req);
      return jsonResponse(200, result);
    }

    if (action === "get_apply_page") {
      const result = await getApplyPagePayload(serviceClient, supabaseUrl, body);
      return jsonResponse(result.ok === false ? 404 : 200, result);
    }

    if (action === "submit_apply_now" || action === "submit_applicant_application") {
      const result = await submitApplicantApplication(serviceClient, body, req);
      return jsonResponse(result.ok === false ? 400 : 200, result);
    }

    if (action === "submit_contact_inquiry") {
      const result = await submitContactInquiry(serviceClient, body, req);
      return jsonResponse(result.ok === false ? 400 : 200, result);
    }

    return jsonResponse(400, {
      ok: false,
      error: "unknown_action",
      message: `Unknown public render action: ${action || "(blank)"}`,
    });
  } catch (error) {
    console.error("core-public-render failed", error);
    return jsonResponse(500, {
      ok: false,
      error: "public_render_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
