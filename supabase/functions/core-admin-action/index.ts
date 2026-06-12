// index.ts
// Deploy target: Supabase Edge Function named core-admin-action
// Internal Version: 2026-06-08-088-A
// Purpose: platform-admin backend for current admin pages, media library, hardened Aircraft Admin actions, paginated history/restore, and reset-to-default workflows.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
declare const Deno: { env: { get: (key: string) => string | undefined } };

type SupabaseClientAny = any;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_STYLE_PROFILE: JsonRecord = {
  profile_name: "Clean Blue",
  preset_key: "clean-blue",
  preset_source: "system",
  colors_json: { brand_primary: "#1f4f82", brand_secondary: "#eef3f8", surface: "#ffffff", text: "#172033" },
  typography_json: { font_family: "system", heading_scale: "normal", body_scale: "normal" },
  spacing_json: { page_width: "normal", section_spacing: "normal", card_padding: "normal" },
  layout_json: { preset_layout: "standard", default_width: "normal", header: "standard", hero: "standard", section_rhythm: "normal", divider_style: "subtle", surface_structure: "cards" },
  effects_json: { shadows: "soft", borders: "standard", corners: "soft", gradients: "subtle", motion: "none", emphasis_style: "labels", surface_style: "panels" },
  media_json: { image_treatment: "inset", hero_media_treatment: "standard", background: "none", background_opacity: 0.18, background_overlay: "soft", background_blur: "none", mobile_background: "hide" },
  component_json: { show_global_banner_default: false, show_scroller_default: false, banner_style: "standard", cta_style: "standard", card_component_style: "standard", empty_state_style: "standard" },
  preview_json: { preview_mode: "generic", preview_page_key: "home", preview_customer_page_id: "", use_real_page_data: false },
  density: "normal",
  card_style: "standard",
  hero_style: "standard",
};

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string: ${key}`);
  }
  return value.trim();
}

function optionalString(body: JsonRecord, key: string, fallback = ""): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function optionalNullableString(body: JsonRecord, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalBoolean(body: JsonRecord, key: string, fallback = false): boolean {
  const value = body[key];
  return typeof value === "boolean" ? value : fallback;
}

function optionalNumber(body: JsonRecord, key: string, fallback: number): number {
  const value = body[key];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInteger(value: number, min: number, max: number): number {
  const n = Math.trunc(Number.isFinite(value) ? value : min);
  return Math.min(Math.max(n, min), max);
}

function historyEventTypesForGroup(group: string, scope: "page" | "style"): string[] | null {
  const normalized = String(group || "all").trim().toLowerCase();

  const common: Record<string, string[]> = {
    saves: ["before_save", "after_save"],
    restores: ["before_restore", "after_restore"],
    defaults: ["before_reset_to_default", "after_reset_to_default"],
    checkpoints: ["manual_checkpoint"],
  };

  const styleOnly: Record<string, string[]> = {
    profiles: ["saved_profile_created", "before_apply_saved_profile", "after_apply_saved_profile"],
  };

  if (!normalized || normalized === "all") return null;
  if (common[normalized]) return common[normalized];
  if (scope === "style" && styleOnly[normalized]) return styleOnly[normalized];
  return null;
}

function optionalJsonObject(body: JsonRecord, key: string): JsonRecord {
  const value = body[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return {};
}

function normalizePageStatus(value: unknown, fallback = "draft"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === "active") return "published";
  if (raw === "paused") return "hidden";
  if (["draft", "published", "hidden", "archived"].includes(raw)) return raw;
  return fallback;
}

function normalizeCustomerStatus(value: unknown, fallback = "draft"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["draft", "active", "paused", "archived"].includes(raw)) return raw;
  return fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeAudit(
  serviceClient: SupabaseClientAny,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string | null,
  requestJson: JsonRecord,
  resultJson: JsonRecord,
  beforeJson: JsonRecord | null = null,
  afterJson: JsonRecord | null = null,
): Promise<void> {
  try {
    await serviceClient.from("core_audit_log").insert({
      actor_email: actorEmail,
      actor_role: "platform_admin",
      action,
      target_type: targetType,
      target_id: targetId,
      before_json: beforeJson,
      after_json: afterJson,
      request_json: requestJson,
      result_json: resultJson,
    });
  } catch (error) {
    console.error("audit_write_failed", error);
  }
}

async function ensureUniqueCustomerKey(serviceClient: SupabaseClientAny, proposedKey: string): Promise<string> {
  const base = normalizeKey(proposedKey) || "organization";
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const { data, error } = await serviceClient
      .from("core_customers")
      .select("customer_id")
      .eq("customer_key", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique customer key.");
}

async function getTemplateById(serviceClient: SupabaseClientAny, templateId: string): Promise<JsonRecord | null> {
  const { data, error } = await serviceClient
    .from("core_template_registry")
    .select("*")
    .eq("template_id", templateId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getTemplateMap(serviceClient: SupabaseClientAny, templateIds: string[]): Promise<Map<string, JsonRecord>> {
  const uniqueIds = Array.from(new Set(templateIds.filter(Boolean)));
  const map = new Map<string, JsonRecord>();
  if (!uniqueIds.length) return map;

  const { data, error } = await serviceClient
    .from("core_template_registry")
    .select("*")
    .in("template_id", uniqueIds);

  if (error) throw error;
  for (const row of data || []) map.set(String(row.template_id), row);
  return map;
}

function flattenCustomerPage(page: JsonRecord, template: JsonRecord | null): JsonRecord {
  return {
    ...page,
    nav_order: page.sort_order,
    template_key: template?.template_key ?? null,
    template_name: template?.template_name ?? null,
    template_category: template?.template_category ?? null,
    renderer_key: template?.renderer_key ?? null,
    module_key: template?.module_key ?? null,
    module_category: template?.module_category ?? null,
    access_default: template?.access_default ?? null,
    complexity_level: template?.complexity_level ?? null,
    build_status: template?.build_status ?? null,
    requires_module_data: template?.requires_module_data ?? null,
    editable_schema_json: template?.editable_schema_json ?? {},
    feature_schema_json: template?.feature_schema_json ?? {},
    data_contract_json: template?.data_contract_json ?? {},
    admin_contract_json: template?.admin_contract_json ?? {},
    render_contract_json: template?.render_contract_json ?? {},
  };
}

async function getOrCreatePageSettings(
  serviceClient: SupabaseClientAny,
  customerPage: JsonRecord,
  template: JsonRecord | null,
): Promise<JsonRecord> {
  const customerPageId = String(customerPage.customer_page_id);

  const { data: existing, error: existingError } = await serviceClient
    .from("core_page_settings")
    .select("*")
    .eq("customer_page_id", customerPageId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: inserted, error: insertError } = await serviceClient
    .from("core_page_settings")
    .insert({
      customer_page_id: customerPageId,
      title: customerPage.nav_label || template?.template_name || customerPage.page_key || "Page",
      intro_text: template?.description || null,
      labels_json: {},
      options_json: {},
      visibility_json: { features: {} },
      content_json: {
        hero_title: customerPage.nav_label || template?.template_name || customerPage.page_key || "Page",
        hero_intro: template?.description || "",
      },
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function getOrCreateActiveStyleProfile(serviceClient: SupabaseClientAny, customerId: string): Promise<JsonRecord> {
  const { data: existing, error: existingError } = await serviceClient
    .from("core_customer_style_profiles")
    .select("*")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: inserted, error: insertError } = await serviceClient
    .from("core_customer_style_profiles")
    .insert({
      customer_id: customerId,
      organization_id: customerId,
      profile_name: "Default",
      colors_json: {},
      typography_json: {},
      spacing_json: {},
      layout_json: {},
      effects_json: {},
      media_json: {},
      component_json: {},
      preview_json: {},
      density: "normal",
      card_style: "standard",
      hero_style: "standard",
      preset_source: "custom",
      is_active: true,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

function stylePayloadFromBody(body: JsonRecord): JsonRecord {
  const payload: JsonRecord = {};
  const stringFields = ["profile_name", "density", "card_style", "hero_style", "preset_key", "preset_source"];
  const jsonFields = [
    "colors_json",
    "typography_json",
    "spacing_json",
    "layout_json",
    "effects_json",
    "media_json",
    "component_json",
    "preview_json",
  ];

  for (const field of stringFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = optionalString(body, field, "");
    }
  }

  for (const field of jsonFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = optionalJsonObject(body, field);
    }
  }

  return payload;
}

function stylePayloadFromSnapshot(snapshot: JsonRecord): JsonRecord {
  const payload: JsonRecord = {};
  const allowed = [
    "profile_name",
    "colors_json",
    "typography_json",
    "spacing_json",
    "layout_json",
    "effects_json",
    "media_json",
    "component_json",
    "preview_json",
    "density",
    "card_style",
    "hero_style",
    "preset_key",
    "preset_source",
    "logo_asset_id",
  ];

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) payload[field] = snapshot[field];
  }

  return payload;
}

async function addStyleHistory(
  serviceClient: SupabaseClientAny,
  customerId: string,
  styleProfile: JsonRecord,
  eventType: string,
  actorEmail: string,
  note: string | null,
): Promise<void> {
  try {
    await serviceClient.from("core_customer_style_profile_history").insert({
      customer_id: customerId,
      organization_id: customerId,
      style_profile_id: styleProfile.style_profile_id || null,
      event_type: eventType,
      snapshot_json: styleProfile,
      saved_by_email: actorEmail,
      note,
    });
  } catch (error) {
    console.error("style_history_write_failed", error);
  }
}

function pageSettingsPayloadFromSnapshot(snapshot: JsonRecord): JsonRecord {
  const rawPageSettings = (snapshot.page_settings && typeof snapshot.page_settings === "object" && !Array.isArray(snapshot.page_settings))
    ? snapshot.page_settings as JsonRecord
    : snapshot;

  const payload: JsonRecord = {};
  const stringNullableFields = ["title", "intro_text"];
  const jsonFields = ["labels_json", "options_json", "visibility_json", "content_json"];

  for (const field of stringNullableFields) {
    if (Object.prototype.hasOwnProperty.call(rawPageSettings, field)) {
      const value = rawPageSettings[field];
      payload[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }

  for (const field of jsonFields) {
    const value = rawPageSettings[field];
    payload[field] = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  return payload;
}

function buildDefaultPageSettingsPayload(customerPage: JsonRecord, template: JsonRecord | null): JsonRecord {
  const contentJson: JsonRecord = {};
  const labelsJson: JsonRecord = {};
  const optionsJson: JsonRecord = {};
  const visibilityJson: JsonRecord = { features: {} };

  const editableSchema = (template?.editable_schema_json && typeof template.editable_schema_json === "object")
    ? template.editable_schema_json as JsonRecord
    : {};
  const sections = Array.isArray(editableSchema.sections) ? editableSchema.sections as JsonRecord[] : [];

  for (const section of sections) {
    const sectionKey = String(section.key || "").toLowerCase();
    const fields = Array.isArray(section.fields) ? section.fields as JsonRecord[] : [];

    for (const field of fields) {
      const key = String(field.key || "").trim();
      if (!key) continue;

      const type = String(field.type || "text").toLowerCase();
      const hasDefault = Object.prototype.hasOwnProperty.call(field, "default");
      const defaultValue = hasDefault ? field.default : (type === "boolean" ? false : "");

      if (sectionKey.includes("label")) {
        labelsJson[key] = defaultValue ?? "";
      } else if (type === "boolean" || sectionKey.includes("option") || sectionKey.includes("display")) {
        optionsJson[key] = Boolean(defaultValue);
      } else {
        contentJson[key] = defaultValue ?? "";
      }
    }
  }

  const featureSchema = (template?.feature_schema_json && typeof template.feature_schema_json === "object")
    ? template.feature_schema_json as JsonRecord
    : {};
  const features = Array.isArray(featureSchema.features) ? featureSchema.features as JsonRecord[] : [];

  for (const feature of features) {
    const key = String(feature.key || "").trim();
    if (!key) continue;
    (visibilityJson.features as JsonRecord)[key] = Boolean(feature.default);
  }

  // Revert-to-default should clear customer-entered page copy unless the template field itself defines a default.
  // It deliberately does not change page status, slug, nav visibility, or navigation label.
  return {
    customer_page_id: customerPage.customer_page_id,
    title: null,
    intro_text: null,
    labels_json: labelsJson,
    options_json: optionsJson,
    visibility_json: visibilityJson,
    content_json: contentJson,
  };
}

async function addPageSettingsHistory(
  serviceClient: SupabaseClientAny,
  customerPage: JsonRecord,
  pageSettings: JsonRecord,
  eventType: string,
  actorEmail: string,
  note: string | null,
): Promise<void> {
  try {
    const snapshot = {
      customer_page: {
        customer_page_id: customerPage.customer_page_id,
        customer_id: customerPage.customer_id,
        organization_id: customerPage.organization_id || customerPage.customer_id,
        site_id: customerPage.site_id || null,
        template_id: customerPage.template_id || null,
        page_key: customerPage.page_key || null,
        page_slug: customerPage.page_slug || null,
        nav_label: customerPage.nav_label || null,
        status: customerPage.status || null,
        sort_order: customerPage.sort_order ?? null,
        show_in_nav: customerPage.show_in_nav ?? null,
      },
      page_settings: pageSettings,
    };

    await serviceClient.from("core_page_settings_history").insert({
      customer_page_id: customerPage.customer_page_id,
      customer_id: customerPage.customer_id,
      organization_id: customerPage.organization_id || customerPage.customer_id,
      page_settings_id: pageSettings.page_settings_id || null,
      event_type: eventType,
      snapshot_json: snapshot,
      saved_by_email: actorEmail,
      note,
    });
  } catch (error) {
    console.error("page_settings_history_write_failed", error);
  }
}

async function fetchCustomerPage(serviceClient: SupabaseClientAny, customerPageId: string): Promise<JsonRecord> {
  const { data, error } = await serviceClient
    .from("core_customer_pages")
    .select("*")
    .eq("customer_page_id", customerPageId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Customer page not found.");
  return data;
}

async function fetchLogoAsset(serviceClient: SupabaseClientAny, assetId: unknown): Promise<JsonRecord | null> {
  if (!assetId) return null;
  const { data, error } = await serviceClient
    .from("core_assets")
    .select("*")
    .eq("asset_id", String(assetId))
    .maybeSingle();

  if (error) throw error;
  return data || null;
}


function optionalNullableNumber(body: JsonRecord, key: string): number | null {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function optionalNullableDate(body: JsonRecord, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function assertReasonableModelYear(modelYear: number | null): void {
  if (modelYear === null) return;
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > currentYear + 2) {
    throw new Error(`Model year must be between 1900 and ${currentYear + 2}.`);
  }
}

async function ensureUniqueOperationalAssetKey(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  proposedKey: string,
): Promise<string> {
  const base = normalizeKey(proposedKey) || "aircraft";
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const { data, error } = await serviceClient
      .from("core_operational_assets")
      .select("operational_asset_id")
      .eq("organization_id", organizationId)
      .eq("asset_key", candidate)
      .is("archived_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique aircraft slug.");
}

function normalizeAircraftImageRole(value: unknown): "primary" | "panel" {
  const raw = String(value || "").trim().toLowerCase();
  if (["primary", "primary-photo", "aircraft", "exterior", "exterior-photo"].includes(raw)) return "primary";
  if (["panel", "panel-photo", "instrument-panel", "cockpit"].includes(raw)) return "panel";
  throw new Error("Image role must be primary or panel.");
}

function parseFlexibleBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1", "checked", "on"].includes(raw)) return true;
  if (["false", "no", "n", "0", "unchecked", "off", ""].includes(raw)) return false;
  return fallback;
}

function normalizeVisibility(value: unknown, fallback = "public"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["public", "members", "admins", "hidden"].includes(raw)) return raw;
  return fallback;
}

function normalizeOperationalRecordStatus(value: unknown, fallback = "active"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === "published") return "active";
  if (["draft", "active", "hidden", "archived"].includes(raw)) return raw;
  return fallback;
}

function normalizeAircraftStatusKey(value: unknown, doNotDispatch = false): string {
  if (doNotDispatch) return "do-not-dispatch";
  const raw = String(value || "available").trim().toLowerCase();
  if (["active", "available", "current", "dispatchable", "flying"].includes(raw)) return "available";
  if (["maintenance", "scheduled maintenance", "scheduled-maintenance"].includes(raw)) return "scheduled-maintenance";
  if (["do not dispatch", "do-not-dispatch", "dnd", "no dispatch"].includes(raw)) return "do-not-dispatch";
  if (["grounded", "down"].includes(raw)) return "grounded";
  if (["inactive", "not current", "retired", "sold", "archived"].includes(raw)) return "inactive";
  return normalizeKey(raw) || "available";
}

function firstNonEmpty(row: JsonRecord, keys: string[], fallback: unknown = ""): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
  }
  return fallback;
}

function normalizeWebflowAircraftRow(row: JsonRecord): JsonRecord {
  return {
    tail_number: firstNonEmpty(row, ["Tail Number", "tail_number", "tailNumber"]),
    asset_key: firstNonEmpty(row, ["Slug", "slug", "asset_key"]),
    aircraft_type: firstNonEmpty(row, ["Aircraft Type", "aircraft_type", "aircraftModel"]),
    model_year: firstNonEmpty(row, ["Model Year", "model_year", "aircraft_year"]),
    description: firstNonEmpty(row, ["Aircraft Description", "description", "aircraft_description"]),
    summary: firstNonEmpty(row, ["aircraft-description-plain", "Aircraft Description Plain", "summary"]),
    primary_photo_url: firstNonEmpty(row, ["Aircraft Photo", "exterior-photo-url", "primary_photo_url"]),
    panel_photo_url: firstNonEmpty(row, ["Panel Photo", "panel-photo-url", "panel_photo_url"]),
    sort_order: firstNonEmpty(row, ["Sort Order", "sort_order"], 100),
    home_base: firstNonEmpty(row, ["Home Base", "home_base"]),
    hourly_rate: firstNonEmpty(row, ["Hourly Rate", "hourly_rate"]),
    annual_due: firstNonEmpty(row, ["annual-due", "Annual Due", "annual_due"]),
    status: firstNonEmpty(row, ["Status", "status"], "Active"),
    do_not_dispatch: firstNonEmpty(row, ["Do Not Dispatch", "do_not_dispatch"], false),
    engine_notes: firstNonEmpty(row, ["engine-notes", "engine_notes"]),
    current_tach: firstNonEmpty(row, ["current-tach", "current_tach"]),
    tach_date: firstNonEmpty(row, ["tach-date", "tach_date"]),
    current_hobbs: firstNonEmpty(row, ["current-hobbs", "current_hobbs"]),
    hobbs_date: firstNonEmpty(row, ["hobbs-date", "hobbs_date"]),
    hobbs_at_last_major_overhaul: firstNonEmpty(row, ["Hobbs hours at Last MOH", "hobbs_at_last_major_overhaul"]),
    maintenance_notes_general: firstNonEmpty(row, ["maintenance-notes-general", "maintenance_notes_general"]),
    oil_change_due_tach: firstNonEmpty(row, ["oil-change-due-tach", "oil_change_due_tach"]),
    current: firstNonEmpty(row, ["current", "is_current"], true),
    source_json: { source: "webflow_aircraft_csv", original_row: row },
  };
}

async function fetchAircraftAdminRecord(
  serviceClient: SupabaseClientAny,
  operationalAssetId: string,
): Promise<JsonRecord | null> {
  const { data, error } = await serviceClient
    .from("module_aircraft_admin_v1")
    .select("*")
    .eq("operational_asset_id", operationalAssetId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertAssetRate(
  serviceClient: SupabaseClientAny,
  operationalAssetId: string,
  rateKey: string,
  label: string,
  amount: number | null,
  rateType: string,
  billingUnit: string,
): Promise<void> {
  if (amount === null) return;

  const payload = {
    operational_asset_id: operationalAssetId,
    rate_key: rateKey,
    label,
    rate_type: rateType,
    billing_unit: billingUnit,
    amount,
    currency_code: "USD",
    is_default: rateKey === "hourly-rental",
    visibility: "members",
    status: "active",
    archived_at: null,
  };

  const { data: existing, error: existingError } = await serviceClient
    .from("core_operational_asset_rates")
    .select("asset_rate_id")
    .eq("operational_asset_id", operationalAssetId)
    .eq("rate_key", rateKey)
    .is("archived_at", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.asset_rate_id) {
    const { error } = await serviceClient
      .from("core_operational_asset_rates")
      .update(payload)
      .eq("asset_rate_id", String(existing.asset_rate_id));
    if (error) throw error;
  } else {
    const { error } = await serviceClient
      .from("core_operational_asset_rates")
      .insert(payload);
    if (error) throw error;
  }
}

async function upsertAircraftRecord(
  serviceClient: SupabaseClientAny,
  input: JsonRecord,
): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const operationalAssetId = optionalNullableString(input, "operational_asset_id") || optionalNullableString(input, "aircraft_id");
  const tailNumber = optionalString(input, "tail_number", optionalString(input, "identifier", "")).toUpperCase().replace(/\s+/g, "");
  const aircraftType = optionalString(input, "aircraft_type", optionalString(input, "aircraft_model", optionalString(input, "model", "")));
  const displayNameInput = optionalString(input, "display_name", "");

  if (!tailNumber && !displayNameInput && !aircraftType) {
    throw new Error("Enter at least a tail number, display name, or aircraft type before saving.");
  }

  let existingAsset: JsonRecord | null = null;
  if (operationalAssetId) {
    const { data, error } = await serviceClient
      .from("core_operational_assets")
      .select("*")
      .eq("operational_asset_id", operationalAssetId)
      .eq("organization_id", organizationId)
      .eq("asset_type_key", "aircraft")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Aircraft not found for this organization.");
    existingAsset = data;
  }

  const assetKey = existingAsset?.asset_key
    ? String(existingAsset.asset_key)
    : await ensureUniqueOperationalAssetKey(serviceClient, organizationId, tailNumber || displayNameInput || aircraftType || "aircraft");

  const doNotDispatchInput = parseFlexibleBoolean(input.do_not_dispatch, false);
  const statusKey = normalizeAircraftStatusKey(input.status_key || input.status, doNotDispatchInput);
  const doNotDispatch = doNotDispatchInput || statusKey === "do-not-dispatch";
  const current = parseFlexibleBoolean(input.current, true);
  const visibility = normalizeVisibility(input.visibility, current ? "public" : "hidden");
  const recordStatus = normalizeOperationalRecordStatus(input.asset_record_status || input.record_status, current ? "active" : "hidden");

  const modelYear = optionalNullableNumber(input, "model_year") ?? optionalNullableNumber(input, "aircraft_year");
  assertReasonableModelYear(modelYear);

  const sortOrder = optionalNumber(input, "sort_order", 100);
  const summary = optionalNullableString(input, "summary") || optionalNullableString(input, "aircraft_description_plain");
  const description = optionalNullableString(input, "description") || optionalNullableString(input, "aircraft_description_html");
  const primaryPhotoUrl = optionalNullableString(input, "primary_photo_url") || optionalNullableString(input, "aircraft_photo_url");
  const panelPhotoUrl = optionalNullableString(input, "panel_photo_url");

  const displayName = displayNameInput || tailNumber || aircraftType || assetKey;

  const corePayload: JsonRecord = {
    organization_id: organizationId,
    site_id: optionalNullableString(input, "site_id"),
    asset_type_key: "aircraft",
    asset_key: assetKey,
    display_name: displayName,
    short_name: optionalNullableString(input, "short_name") || tailNumber || null,
    public_label: optionalNullableString(input, "public_label") || tailNumber || displayName,
    identifier: tailNumber || null,
    manufacturer: optionalNullableString(input, "aircraft_make") || optionalNullableString(input, "manufacturer"),
    model: aircraftType || null,
    model_year: modelYear,
    status_key: statusKey,
    visibility,
    summary,
    description,
    sort_order: sortOrder,
    specs_json: optionalJsonObject(input, "specs_json"),
    operational_json: optionalJsonObject(input, "operational_json"),
    settings_json: optionalJsonObject(input, "settings_json"),
    status: recordStatus,
    archived_at: recordStatus === "archived" ? nowIso() : null,
  };

  let asset: JsonRecord | null = null;

  if (operationalAssetId) {
    const { data, error } = await serviceClient
      .from("core_operational_assets")
      .update(corePayload)
      .eq("operational_asset_id", operationalAssetId)
      .eq("organization_id", organizationId)
      .eq("asset_type_key", "aircraft")
      .select("*")
      .single();
    if (error) throw error;
    asset = data;
  } else {
    const { data, error } = await serviceClient
      .from("core_operational_assets")
      .insert(corePayload)
      .select("*")
      .single();
    if (error) throw error;
    asset = data;
  }

  if (!asset?.operational_asset_id) throw new Error("Aircraft save failed before details insert.");
  const savedAssetId = String(asset.operational_asset_id);

  const detailsPayload: JsonRecord = {
    operational_asset_id: savedAssetId,
    tail_number: tailNumber || null,
    aircraft_make: optionalNullableString(input, "aircraft_make") || optionalNullableString(input, "manufacturer"),
    aircraft_model: aircraftType || null,
    aircraft_year: modelYear,
    category_class: optionalNullableString(input, "category_class"),
    seat_count: optionalNullableNumber(input, "seat_count"),
    engine_type: optionalNullableString(input, "engine_type"),
    fuel_type: optionalNullableString(input, "fuel_type"),
    home_base: optionalNullableString(input, "home_base"),
    primary_photo_url: primaryPhotoUrl,
    panel_photo_url: panelPhotoUrl,
    aircraft_description_plain: summary,
    do_not_dispatch: doNotDispatch,
    engine_notes: optionalNullableString(input, "engine_notes"),
    current_tach: optionalNullableNumber(input, "current_tach"),
    tach_date: optionalNullableDate(input, "tach_date"),
    current_hobbs: optionalNullableNumber(input, "current_hobbs"),
    hobbs_date: optionalNullableDate(input, "hobbs_date"),
    hobbs_at_last_major_overhaul: optionalNullableNumber(input, "hobbs_at_last_major_overhaul"),
    maintenance_notes_general: optionalNullableString(input, "maintenance_notes_general"),
    oil_change_due_tach: optionalNullableNumber(input, "oil_change_due_tach"),
    avionics_json: optionalJsonObject(input, "avionics_json"),
    equipment_json: optionalJsonObject(input, "equipment_json"),
    maintenance_json: optionalJsonObject(input, "maintenance_json"),
    aircraft_json: optionalJsonObject(input, "aircraft_json"),
    source_json: optionalJsonObject(input, "source_json"),
  };

  const { error: detailError } = await serviceClient
    .from("module_aircraft_details")
    .upsert(detailsPayload, { onConflict: "operational_asset_id" });
  if (detailError) throw detailError;

  await upsertAssetRate(
    serviceClient,
    savedAssetId,
    "hourly-rental",
    "Hourly Rental",
    optionalNullableNumber(input, "hourly_rate"),
    "rental",
    "hour",
  );

  await upsertAssetRate(
    serviceClient,
    savedAssetId,
    "annual-due",
    "Annual Due",
    optionalNullableNumber(input, "annual_due"),
    "fee",
    "flat",
  );

  const record = await fetchAircraftAdminRecord(serviceClient, savedAssetId);
  if (!record) throw new Error("Aircraft saved but could not be reloaded.");
  return record;
}

async function attachAircraftImageAsset(
  serviceClient: SupabaseClientAny,
  input: JsonRecord,
): Promise<{ asset: JsonRecord; aircraft: JsonRecord | null }> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const aircraftId = requireString(input, "aircraft_id");
  const role = normalizeAircraftImageRole(input.image_role || input.asset_role);
  const storagePath = optionalNullableString(input, "storage_path");
  const url = optionalNullableString(input, "url");

  if (!storagePath && !url) throw new Error("Aircraft image requires a storage_path or URL.");

  const aircraft = await fetchAircraftAdminRecord(serviceClient, aircraftId);
  if (!aircraft || String(aircraft.organization_id) !== organizationId) {
    throw new Error("Aircraft not found for this organization.");
  }

  const assetPayload: JsonRecord = {
    customer_id: organizationId,
    organization_id: organizationId,
    operational_asset_id: aircraftId,
    asset_role: role,
    asset_type: role === "primary" ? "aircraft-primary-photo" : "aircraft-panel-photo",
    url,
    storage_path: storagePath,
    alt_text: optionalNullableString(input, "alt_text") || `${aircraft.tail_number || aircraft.display_name || "Aircraft"} ${role} photo`,
    mime_type: optionalNullableString(input, "mime_type") || "image",
    file_size_bytes: Object.prototype.hasOwnProperty.call(input, "file_size_bytes") ? optionalNumber(input, "file_size_bytes", 0) : null,
    metadata_json: optionalJsonObject(input, "metadata_json"),
    status: "active",
    archived_at: null,
  };

  const { data: asset, error: assetError } = await serviceClient
    .from("core_assets")
    .insert(assetPayload)
    .select("*")
    .single();
  if (assetError) throw assetError;

  const imageUrl = url || storagePath;
  const detailPayload: JsonRecord = role === "primary"
    ? { primary_photo_url: imageUrl, primary_photo_asset_id: asset.asset_id }
    : { panel_photo_url: imageUrl, panel_photo_asset_id: asset.asset_id };

  const { error: detailError } = await serviceClient
    .from("module_aircraft_details")
    .update(detailPayload)
    .eq("operational_asset_id", aircraftId);
  if (detailError) throw detailError;

  if (role === "primary") {
    const { error: coreError } = await serviceClient
      .from("core_operational_assets")
      .update({ primary_file_asset_id: asset.asset_id })
      .eq("operational_asset_id", aircraftId)
      .eq("asset_type_key", "aircraft");
    if (coreError) throw coreError;
  }

  const updatedAircraft = await fetchAircraftAdminRecord(serviceClient, aircraftId);
  return { asset, aircraft: updatedAircraft };
}


function normalizeGalleryVisibility(value: unknown, fallback = "public"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  return ["public", "members", "admins", "hidden"].includes(raw) ? raw : fallback;
}

function normalizeGalleryStatus(value: unknown, fallback = "active"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  return ["draft", "active", "hidden", "archived"].includes(raw) ? raw : fallback;
}

function normalizeMediaType(value: unknown, fallback = "image"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  return ["image", "video", "external_video", "document", "other"].includes(raw) ? raw : fallback;
}

async function listGalleryMedia(
  serviceClient: SupabaseClientAny,
  input: JsonRecord,
): Promise<JsonRecord[]> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  const includeArchived = optionalBoolean(input, "include_archived", false);

  let query = serviceClient
    .from("core_gallery_media")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    query = query.is("archived_at", null).neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function upsertGalleryMedia(
  serviceClient: SupabaseClientAny,
  input: JsonRecord,
): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const galleryMediaId = optionalNullableString(input, "gallery_media_id");
  const title = optionalNullableString(input, "title");
  const caption = optionalNullableString(input, "caption");
  const storagePath = optionalNullableString(input, "storage_path");
  const publicUrl = optionalNullableString(input, "public_url") || optionalNullableString(input, "url");
  const thumbnailUrl = optionalNullableString(input, "thumbnail_url");
  const externalUrl = optionalNullableString(input, "external_url");
  const externalProvider = optionalNullableString(input, "external_provider");
  const externalId = optionalNullableString(input, "external_id");
  const sourceType = optionalNullableString(input, "source_type") || (externalUrl ? "youtube" : "supabase");
  const mediaType = normalizeMediaType(input.media_type, externalUrl ? "external_video" : "image");

  if (!galleryMediaId && !storagePath && !publicUrl && !thumbnailUrl && !externalUrl && !externalId) {
    throw new Error("Media record requires a storage_path, public_url, thumbnail_url, external_url, or external_id.");
  }

  const rawSort = input.sort_order;
  const sortOrder = rawSort === null || rawSort === undefined || String(rawSort).trim() === ""
    ? 100
    : optionalNumber(input, "sort_order", 100);

  const status = normalizeGalleryStatus(input.status, "active");
  const payload: JsonRecord = {
    organization_id: organizationId,
    site_id: optionalNullableString(input, "site_id"),
    customer_page_id: optionalNullableString(input, "customer_page_id"),
    media_key: optionalNullableString(input, "media_key") || normalizeKey(title || caption || storagePath || publicUrl || externalId || externalUrl || "gallery-media"),
    title,
    caption,
    credit: optionalNullableString(input, "credit"),
    alt_text: optionalNullableString(input, "alt_text") || caption || title,
    media_type: mediaType,
    source_type: sourceType,
    external_url: externalUrl,
    external_provider: externalProvider,
    external_id: externalId,
    storage_bucket: optionalString(input, "storage_bucket", "core-assets") || "core-assets",
    storage_path: storagePath,
    public_url: publicUrl || externalUrl,
    thumbnail_url: thumbnailUrl,
    visibility: normalizeGalleryVisibility(input.visibility, "public"),
    status,
    approval_status: optionalNullableString(input, "approval_status") || (status === "active" ? "approved" : "pending"),
    is_featured: optionalBoolean(input, "is_featured", false),
    sort_order: sortOrder,
    metadata_json: optionalJsonObject(input, "metadata_json"),
    archived_at: status === "archived" ? nowIso() : null,
  };

  if (galleryMediaId) {
    const { data: existing, error: existingError } = await serviceClient
      .from("core_gallery_media")
      .select("gallery_media_id")
      .eq("gallery_media_id", galleryMediaId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await serviceClient
        .from("core_gallery_media")
        .update(payload)
        .eq("gallery_media_id", galleryMediaId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }

    payload.gallery_media_id = galleryMediaId;
  } else if (optionalNullableString(input, "requested_gallery_media_id")) {
    payload.gallery_media_id = optionalNullableString(input, "requested_gallery_media_id");
  }

  const { data, error } = await serviceClient
    .from("core_gallery_media")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}


function normalizeFaqStatus(value: unknown, fallback = "active"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["draft", "active", "hidden", "archived"].includes(raw)) return raw;
  return fallback;
}

function normalizeFaqVisibility(value: unknown, fallback = "public"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["public", "members", "admins", "hidden"].includes(raw)) return raw;
  return fallback;
}

async function listInfoFaqItems(serviceClient: SupabaseClientAny, input: JsonRecord): Promise<JsonRecord[]> {
  const customerPageId = requireString(input, "customer_page_id");
  const includeArchived = optionalBoolean(input, "include_archived", false);
  const page = await fetchCustomerPage(serviceClient, customerPageId);

  let query = serviceClient
    .from("core_info_faq_items")
    .select("*")
    .eq("organization_id", String(page.organization_id || page.customer_id))
    .eq("customer_page_id", customerPageId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function upsertInfoFaqItem(serviceClient: SupabaseClientAny, input: JsonRecord): Promise<JsonRecord> {
  const customerPageId = requireString(input, "customer_page_id");
  const question = requireString(input, "question");
  const answer = requireString(input, "answer");
  const page = await fetchCustomerPage(serviceClient, customerPageId);
  const faqItemId = optionalString(input, "faq_item_id", "");
  const proposedKey = optionalString(input, "faq_key", "") || question;

  const payload: JsonRecord = {
    organization_id: page.organization_id || page.customer_id,
    site_id: page.site_id || null,
    customer_page_id: customerPageId,
    faq_key: normalizeKey(proposedKey) || null,
    category: optionalNullableString(input, "category"),
    question,
    answer,
    visibility: normalizeFaqVisibility(input.visibility, "public"),
    status: normalizeFaqStatus(input.status, "active"),
    sort_order: optionalNumber(input, "sort_order", 100),
    metadata_json: optionalJsonObject(input, "metadata_json"),
  };

  if (payload.status !== "archived") payload.archived_at = null;
  if (payload.status === "archived") payload.archived_at = nowIso();

  let query;
  if (faqItemId) {
    query = serviceClient
      .from("core_info_faq_items")
      .update(payload)
      .eq("faq_item_id", faqItemId)
      .eq("organization_id", String(page.organization_id || page.customer_id));
  } else {
    query = serviceClient
      .from("core_info_faq_items")
      .insert(payload);
  }

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

async function setInfoFaqArchiveState(serviceClient: SupabaseClientAny, input: JsonRecord, archive: boolean): Promise<JsonRecord> {
  const faqItemId = requireString(input, "faq_item_id");
  const customerPageId = requireString(input, "customer_page_id");
  const page = await fetchCustomerPage(serviceClient, customerPageId);
  const payload = archive
    ? { status: "archived", archived_at: nowIso() }
    : { status: "active", archived_at: null };

  const { data, error } = await serviceClient
    .from("core_info_faq_items")
    .update(payload)
    .eq("faq_item_id", faqItemId)
    .eq("organization_id", String(page.organization_id || page.customer_id))
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function setGalleryMediaArchiveState(
  serviceClient: SupabaseClientAny,
  input: JsonRecord,
  archive: boolean,
): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  const galleryMediaId = requireString(input, "gallery_media_id");

  const payload = archive
    ? { status: "archived", archived_at: nowIso() }
    : { status: "active", archived_at: null };

  const { data, error } = await serviceClient
    .from("core_gallery_media")
    .update(payload)
    .eq("gallery_media_id", galleryMediaId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}


function normalizeDocumentVisibility(value: unknown, fallback = "members"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["public", "members", "admins", "board", "internal"].includes(raw)) return raw;
  return fallback;
}

function normalizeDocumentStatus(value: unknown, fallback = "active"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["active", "archived"].includes(raw)) return raw;
  return fallback;
}

function normalizeDocumentVersionStatus(value: unknown, fallback = "draft"): string {
  const raw = String(value || fallback).trim().toLowerCase();
  if (["draft", "review", "approved", "published", "superseded", "rejected", "archived"].includes(raw)) return raw;
  return fallback;
}

async function writeDocumentEvent(
  serviceClient: SupabaseClientAny,
  actorUserId: string | null,
  actorEmail: string,
  eventType: string,
  documentId: string,
  versionId: string | null,
  organizationId: string,
  note: string | null = null,
  metadata: JsonRecord = {},
): Promise<void> {
  await serviceClient.from("core_document_events").insert({
    document_id: documentId,
    version_id: versionId,
    organization_id: organizationId,
    event_type: eventType,
    actor_user_id: actorUserId,
    actor_email: actorEmail || null,
    note,
    metadata_json: metadata,
  });
}

async function listDocuments(serviceClient: SupabaseClientAny, input: JsonRecord): Promise<JsonRecord[]> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  const includeArchived = optionalBoolean(input, "include_archived", false);
  const visibility = optionalNullableString(input, "visibility");
  const category = optionalNullableString(input, "category");

  let query = serviceClient
    .from("core_documents_admin_v1")
    .select("*")
    .eq("organization_id", organizationId)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null).eq("status", "active");
  if (visibility) query = query.eq("visibility", normalizeDocumentVisibility(visibility));
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function upsertDocument(serviceClient: SupabaseClientAny, input: JsonRecord, actorUserId: string | null, actorEmail: string): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const title = requireString(input, "title");
  const documentId = optionalNullableString(input, "document_id") || optionalNullableString(input, "requested_document_id");
  const proposedKey = normalizeKey(input.document_key || title);
  if (!proposedKey) throw new Error("Document key could not be generated.");

  const payload: JsonRecord = {
    organization_id: organizationId,
    site_id: optionalNullableString(input, "site_id"),
    customer_page_id: optionalNullableString(input, "customer_page_id"),
    document_key: proposedKey,
    title,
    category: optionalString(input, "category", "General") || "General",
    description: optionalNullableString(input, "description"),
    visibility: normalizeDocumentVisibility(input.visibility, "members"),
    status: normalizeDocumentStatus(input.status, "active"),
    sort_order: clampInteger(optionalNumber(input, "sort_order", 100), 0, 100000),
    updated_by_user_id: actorUserId,
  };

  let existing: JsonRecord | null = null;
  if (documentId) {
    const { data, error } = await serviceClient
      .from("core_documents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (error) throw error;
    existing = data || null;
  }

  if (existing) {
    const { data, error } = await serviceClient
      .from("core_documents")
      .update(payload)
      .eq("document_id", String(existing.document_id))
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (error) throw error;
    await writeDocumentEvent(serviceClient, actorUserId, actorEmail, "document_updated", String(data.document_id), null, organizationId, optionalNullableString(input, "note"), { title, visibility: payload.visibility });
    return data;
  }

  const insertPayload = {
    ...(documentId ? { document_id: documentId } : {}),
    ...payload,
    created_by_user_id: actorUserId,
  };

  const { data, error } = await serviceClient
    .from("core_documents")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw error;
  await writeDocumentEvent(serviceClient, actorUserId, actorEmail, "document_created", String(data.document_id), null, organizationId, optionalNullableString(input, "note"), { title, visibility: payload.visibility });
  return data;
}

async function setDocumentArchiveState(serviceClient: SupabaseClientAny, input: JsonRecord, archive: boolean, actorUserId: string | null, actorEmail: string): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  const documentId = requireString(input, "document_id");
  const payload = archive ? { status: "archived", archived_at: nowIso(), updated_by_user_id: actorUserId } : { status: "active", archived_at: null, updated_by_user_id: actorUserId };
  const { data, error } = await serviceClient
    .from("core_documents")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .select("*")
    .single();
  if (error) throw error;
  await writeDocumentEvent(serviceClient, actorUserId, actorEmail, archive ? "document_archived" : "document_restored", documentId, null, organizationId, optionalNullableString(input, "note"));
  return data;
}

async function listDocumentVersions(serviceClient: SupabaseClientAny, input: JsonRecord): Promise<JsonRecord[]> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  const documentId = requireString(input, "document_id");
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  const { data, error } = await serviceClient
    .from("core_document_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createDocumentVersion(serviceClient: SupabaseClientAny, input: JsonRecord, actorUserId: string | null, actorEmail: string): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  const documentId = requireString(input, "document_id");
  const storagePath = requireString(input, "storage_path");
  const originalFileName = requireString(input, "original_file_name");
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const { data: doc, error: docError } = await serviceClient
    .from("core_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error("Document not found for this organization.");

  const { data: maxRows, error: maxError } = await serviceClient
    .from("core_document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (maxError) throw maxError;
  const nextNumber = Number(maxRows?.[0]?.version_number || 0) + 1;
  const requestedStatus = normalizeDocumentVersionStatus(input.version_status, "draft");
  const publishNow = optionalBoolean(input, "publish_now", false);
  const initialStatus = publishNow ? "published" : requestedStatus;

  const payload = {
    document_id: documentId,
    organization_id: organizationId,
    version_number: nextNumber,
    version_label: optionalNullableString(input, "version_label") || `v${nextNumber}`,
    version_status: initialStatus,
    storage_bucket: optionalString(input, "storage_bucket", "core-documents") || "core-documents",
    storage_path: storagePath,
    original_file_name: originalFileName,
    mime_type: optionalNullableString(input, "mime_type"),
    file_size_bytes: Object.prototype.hasOwnProperty.call(input, "file_size_bytes") ? optionalNumber(input, "file_size_bytes", 0) : null,
    uploaded_by_user_id: actorUserId,
    uploaded_by_email: actorEmail || null,
    notes: optionalNullableString(input, "notes"),
    metadata_json: optionalJsonObject(input, "metadata_json"),
    published_by_user_id: publishNow ? actorUserId : null,
    published_by_email: publishNow ? actorEmail : null,
    published_at: publishNow ? nowIso() : null,
  };

  const { data: version, error } = await serviceClient
    .from("core_document_versions")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;

  await writeDocumentEvent(serviceClient, actorUserId, actorEmail, "version_uploaded", documentId, String(version.version_id), organizationId, optionalNullableString(input, "notes"), { version_number: nextNumber, version_status: initialStatus });

  if (publishNow) {
    await serviceClient
      .from("core_document_versions")
      .update({ version_status: "superseded", updated_at: nowIso() })
      .eq("document_id", documentId)
      .eq("version_status", "published")
      .neq("version_id", String(version.version_id));

    const { error: updateDocError } = await serviceClient
      .from("core_documents")
      .update({ current_published_version_id: version.version_id, current_draft_version_id: null, updated_by_user_id: actorUserId, status: "active", archived_at: null })
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);
    if (updateDocError) throw updateDocError;
    await writeDocumentEvent(serviceClient, actorUserId, actorEmail, "version_published", documentId, String(version.version_id), organizationId, optionalNullableString(input, "publish_note"), { version_number: nextNumber });
  } else {
    await serviceClient
      .from("core_documents")
      .update({ current_draft_version_id: version.version_id, updated_by_user_id: actorUserId })
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);
  }

  return version;
}

async function setDocumentVersionStatus(serviceClient: SupabaseClientAny, input: JsonRecord, targetStatus: string, actorUserId: string | null, actorEmail: string): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  const versionId = requireString(input, "version_id");
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

  const { data: version, error: versionError } = await serviceClient
    .from("core_document_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("version_id", versionId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) throw new Error("Document version not found.");

  const documentId = String(version.document_id);
  const payload: JsonRecord = { version_status: targetStatus };
  const eventMeta: JsonRecord = { version_number: version.version_number, target_status: targetStatus };

  if (targetStatus === "approved") {
    payload.approved_by_user_id = actorUserId;
    payload.approved_by_email = actorEmail || null;
    payload.approved_at = nowIso();
  }
  if (targetStatus === "rejected") {
    payload.rejected_by_user_id = actorUserId;
    payload.rejected_by_email = actorEmail || null;
    payload.rejected_at = nowIso();
  }
  if (targetStatus === "published") {
    await serviceClient
      .from("core_document_versions")
      .update({ version_status: "superseded", updated_at: nowIso() })
      .eq("document_id", documentId)
      .eq("version_status", "published")
      .neq("version_id", versionId);
    payload.published_by_user_id = actorUserId;
    payload.published_by_email = actorEmail || null;
    payload.published_at = nowIso();
  }

  const { data: updated, error } = await serviceClient
    .from("core_document_versions")
    .update(payload)
    .eq("version_id", versionId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (error) throw error;

  if (targetStatus === "published") {
    await serviceClient
      .from("core_documents")
      .update({ current_published_version_id: versionId, current_draft_version_id: null, updated_by_user_id: actorUserId, status: "active", archived_at: null })
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);
  }

  await writeDocumentEvent(serviceClient, actorUserId, actorEmail, `version_${targetStatus}`, documentId, versionId, organizationId, optionalNullableString(input, "note"), eventMeta);
  return updated;
}

async function getDocumentDownloadUrl(serviceClient: SupabaseClientAny, input: JsonRecord): Promise<JsonRecord> {
  const organizationId = optionalString(input, "organization_id", optionalString(input, "customer_id", ""));
  if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
  let versionId = optionalNullableString(input, "version_id");
  const documentId = optionalNullableString(input, "document_id");

  if (!versionId && documentId) {
    const { data: doc, error: docError } = await serviceClient
      .from("core_documents")
      .select("current_published_version_id")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (docError) throw docError;
    versionId = doc?.current_published_version_id ? String(doc.current_published_version_id) : null;
  }
  if (!versionId) throw new Error("Missing version_id and no current published version was found.");

  const { data: version, error } = await serviceClient
    .from("core_document_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("version_id", versionId)
    .maybeSingle();
  if (error) throw error;
  if (!version) throw new Error("Document version not found.");

  const expiresIn = clampInteger(optionalNumber(input, "expires_in", 3600), 60, 86400);
  const bucket = String(version.storage_bucket || "core-documents");
  const path = String(version.storage_path);
  const fileName = String(version.original_file_name || "document");

  const { data: previewSigned, error: previewError } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (previewError) throw previewError;

  const { data: downloadSigned, error: downloadError } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, { download: fileName });
  if (downloadError) throw downloadError;

  return {
    version,
    preview_signed_url: previewSigned?.signedUrl || null,
    download_signed_url: downloadSigned?.signedUrl || null,
    signed_url: downloadSigned?.signedUrl || previewSigned?.signedUrl || null,
    expires_in: expiresIn,
  };
}


async function eventsResolveOrganizationId(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<string> {
  const explicit = optionalNullableString(body, "organization_id");
  if (explicit) return explicit;
  const key = optionalNullableString(body, "organization_key") || optionalNullableString(body, "customer_key");
  if (!key) throw new Error("Missing organization_id or organization_key.");
  const { data, error } = await serviceClient
    .from("core_organizations")
    .select("organization_id")
    .eq("organization_key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Organization not found: ${key}`);
  return String(data.organization_id);
}

function eventsIsoOrNull(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${raw}`);
  return d.toISOString();
}

function eventsStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => normalizeKey(v)).filter(Boolean)));
}

function normalizeEventAudience(value: unknown, fallback = "public"): string {
  const raw = normalizeKey(value || fallback).replace(/_/g, "-");
  if (["public", "logged-in", "members", "admins", "classes", "roles", "none", "disabled"].includes(raw)) return raw;
  if (raw === "member" || raw === "users") return "members";
  if (raw === "admin" || raw === "organization-admin") return "admins";
  return fallback;
}

function normalizeCapacityBehavior(value: unknown, fallback = "waitlist"): string {
  const raw = normalizeKey(value || fallback);
  return ["waitlist", "block"].includes(raw) ? raw : fallback;
}

function normalizeAttendeeListVisibility(value: unknown, fallback = "members"): string {
  const raw = normalizeKey(value || fallback);
  return ["public", "members", "admins", "hidden"].includes(raw) ? raw : fallback;
}

async function listEvents(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord[]> {
  const organizationId = await eventsResolveOrganizationId(serviceClient, body);
  const includeArchived = optionalBoolean(body, "include_archived", false);
  let query = serviceClient
    .from("core_events")
    .select("*")
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!includeArchived) query = query.is("archived_at", null).neq("status", "archived");
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function normalizeEventVisibilityAdmin(value: unknown, fallback = "public"): string {
  const raw = String(value || fallback).trim().toLowerCase().replace(/-/g, "_");
  if (["public", "logged_in", "member", "members", "admin", "admins", "board", "internal"].includes(raw)) {
    if (raw === "members") return "member";
    if (["admins", "board", "internal"].includes(raw)) return "admin";
    return raw;
  }
  return fallback;
}

function normalizeRsvpAudienceAdmin(value: unknown, fallback = "public"): string {
  const raw = String(value || fallback).trim().toLowerCase().replace(/-/g, "_");
  if (["public", "logged_in", "member", "members", "admin", "admins", "selected_classes", "classes", "selected_roles", "roles"].includes(raw)) {
    if (raw === "members") return "member";
    if (raw === "admins") return "admin";
    if (raw === "classes") return "selected_classes";
    if (raw === "roles") return "selected_roles";
    return raw;
  }
  return fallback;
}

function optionalJsonArrayOfStrings(body: JsonRecord, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => normalizeKey(v)).filter(Boolean)));
}

async function upsertEvent(serviceClient: SupabaseClientAny, body: JsonRecord, userId: string | null): Promise<JsonRecord> {
  const organizationId = await eventsResolveOrganizationId(serviceClient, body);
  const eventId = optionalNullableString(body, "event_id");
  const title = requireString(body, "title");
  const startsAt = eventsIsoOrNull(body.starts_at);
  if (!startsAt) throw new Error("Event start date/time is required.");
  const endsAt = eventsIsoOrNull(body.ends_at);
  const proposedKey = optionalNullableString(body, "event_key") || `${normalizeKey(title)}-${startsAt.slice(0,10)}`;
  const payload: JsonRecord = {
    organization_id: organizationId,
    event_key: normalizeKey(proposedKey) || "event",
    title,
    category: optionalString(body, "category", "General") || "General",
    visibility: optionalString(body, "visibility", "public") || "public",
    visibility_audience: normalizeEventVisibilityAdmin(body.visibility_audience || body.visibility, "public"),
    status: normalizePageStatus(body.status, "draft"),
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: optionalString(body, "timezone", "America/New_York") || "America/New_York",
    location_name: optionalNullableString(body, "location_name"),
    location_address: optionalNullableString(body, "location_address"),
    summary: optionalNullableString(body, "summary"),
    description: optionalNullableString(body, "description"),
    rsvp_enabled: optionalBoolean(body, "rsvp_enabled", false),
    rsvp_public_enabled: optionalBoolean(body, "rsvp_public_enabled", false),
    rsvp_audience: normalizeRsvpAudienceAdmin(body.rsvp_audience || (optionalBoolean(body, "rsvp_public_enabled", false) ? "public" : "member"), optionalBoolean(body, "rsvp_public_enabled", false) ? "public" : "member"),
    rsvp_deadline_at: eventsIsoOrNull(body.rsvp_deadline_at),
    rsvp_waitlist_enabled: optionalBoolean(body, "rsvp_waitlist_enabled", optionalBoolean(body, "waitlist_enabled", true)),
    waitlist_enabled: optionalBoolean(body, "waitlist_enabled", optionalBoolean(body, "rsvp_waitlist_enabled", true)),
    rsvp_capacity_behavior: normalizeCapacityBehavior(body.rsvp_capacity_behavior),
    rsvp_summary_visibility: normalizeAttendeeListVisibility(body.rsvp_summary_visibility, "eligible"),
    show_attendee_list: optionalBoolean(body, "show_attendee_list", true),
    eligible_membership_class_keys: optionalJsonArrayOfStrings(body, "eligible_membership_class_keys").length ? optionalJsonArrayOfStrings(body, "eligible_membership_class_keys") : optionalJsonArrayOfStrings(body, "allowed_membership_class_keys"),
    eligible_role_keys: optionalJsonArrayOfStrings(body, "eligible_role_keys").length ? optionalJsonArrayOfStrings(body, "eligible_role_keys") : optionalJsonArrayOfStrings(body, "allowed_role_keys"),
    allowed_membership_class_keys: optionalJsonArrayOfStrings(body, "allowed_membership_class_keys").length ? optionalJsonArrayOfStrings(body, "allowed_membership_class_keys") : optionalJsonArrayOfStrings(body, "eligible_membership_class_keys"),
    allowed_role_keys: optionalJsonArrayOfStrings(body, "allowed_role_keys").length ? optionalJsonArrayOfStrings(body, "allowed_role_keys") : optionalJsonArrayOfStrings(body, "eligible_role_keys"),
    organizer_person_id: optionalNullableString(body, "organizer_person_id"),
    organizer_membership_id: optionalNullableString(body, "organizer_membership_id"),
    rsvp_settings_json: optionalJsonObject(body, "rsvp_settings_json"),
    capacity: body.capacity === null || body.capacity === undefined || body.capacity === "" ? null : optionalNumber(body, "capacity", 0),
    allow_guests: optionalBoolean(body, "allow_guests", true),
    max_guests_per_rsvp: Math.max(0, optionalNumber(body, "max_guests_per_rsvp", 0)),
    featured: optionalBoolean(body, "featured", false),
    sort_order: optionalNumber(body, "sort_order", 100),
    updated_by_user_id: userId,
  };
  if (!eventId) payload.created_by_user_id = userId;
  if (eventId) {
    const { data, error } = await serviceClient.from("core_events").update(payload).eq("event_id", eventId).select("*").single();
    if (error) throw error;
    return data;
  }
  // ensure unique key for the organization
  let baseKey = String(payload.event_key || "event");
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? baseKey : `${baseKey}-${i}`;
    const { data: existing, error: checkError } = await serviceClient
      .from("core_events")
      .select("event_id")
      .eq("organization_id", organizationId)
      .eq("event_key", candidate)
      .maybeSingle();
    if (checkError) throw checkError;
    if (!existing) {
      payload.event_key = candidate;
      break;
    }
  }
  const { data, error } = await serviceClient.from("core_events").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function setEventArchiveState(serviceClient: SupabaseClientAny, body: JsonRecord, archived: boolean, userId: string | null): Promise<JsonRecord> {
  const eventId = requireString(body, "event_id");
  const payload = archived
    ? { archived_at: nowIso(), status: "archived", updated_by_user_id: userId }
    : { archived_at: null, status: "draft", updated_by_user_id: userId };
  const { data, error } = await serviceClient.from("core_events").update(payload).eq("event_id", eventId).select("*").single();
  if (error) throw error;
  return data;
}

async function listEventRsvps(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord[]> {
  const eventId = requireString(body, "event_id");
  const { data, error } = await serviceClient
    .from("core_event_rsvp_admin_v1")
    .select("*")
    .eq("event_id", eventId)
    .is("archived_at", null)
    .order("response_status", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function normalizeAdminRsvpStatus(value: unknown): string {
  const raw = String(value || "yes").trim().toLowerCase().replace(/-/g, "_");
  return ["yes", "maybe", "no", "waitlist", "cancelled", "no_response"].includes(raw) ? raw : "yes";
}

async function upsertEventRsvpAdmin(serviceClient: SupabaseClientAny, body: JsonRecord, actorUserId: string | null, actorEmail: string): Promise<JsonRecord> {
  const eventId = requireString(body, "event_id");
  const organizationId = optionalString(body, "organization_id", optionalString(body, "customer_id", ""));
  if (!organizationId) throw new Error("Missing organization_id/customer_id.");
  const rsvpId = optionalNullableString(body, "rsvp_id");
  const status = normalizeAdminRsvpStatus(body.response_status);
  const attendingSelf = optionalBoolean(body, "attending_self", true);
  const adultCount = Math.max(0, optionalNumber(body, "adult_count", 0));
  const childCount = Math.max(0, optionalNumber(body, "child_count", 0));
  const attendeeCount = ["yes", "waitlist"].includes(status) ? Math.max(attendingSelf ? 1 : 0, (attendingSelf ? 1 : 0) + adultCount + childCount) : 0;
  let before: JsonRecord | null = null;
  if (rsvpId) {
    const { data, error } = await serviceClient.from("core_event_rsvps").select("*").eq("rsvp_id", rsvpId).eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    before = data || null;
  }
  const payload: JsonRecord = {
    event_id: eventId,
    organization_id: organizationId,
    person_id: optionalNullableString(body, "person_id"),
    membership_id: optionalNullableString(body, "membership_id"),
    respondent_name: optionalNullableString(body, "respondent_name") || optionalNullableString(body, "name") || before?.respondent_name || "Manual RSVP",
    respondent_email: optionalNullableString(body, "respondent_email") || before?.respondent_email || null,
    response_status: status,
    attendee_count: attendeeCount,
    adult_count: adultCount,
    child_count: childCount,
    guest_count: adultCount + childCount,
    attending_self: attendingSelf,
    shared_note: optionalNullableString(body, "shared_note"),
    private_note: optionalNullableString(body, "private_note"),
    admin_note: optionalNullableString(body, "admin_note"),
    rsvp_scope: optionalNullableString(body, "person_id") ? "admin_member_override" : "admin_guest_override",
    source: "platform_admin_override",
    updated_at: nowIso(),
    metadata_json: optionalJsonObject(body, "metadata_json"),
  };
  let saved: JsonRecord;
  if (before?.rsvp_id) {
    const { data, error } = await serviceClient.from("core_event_rsvps").update(payload).eq("rsvp_id", before.rsvp_id).eq("organization_id", organizationId).select("*").single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient.from("core_event_rsvps").insert(payload).select("*").single();
    if (error) throw error;
    saved = data;
  }
  try {
    await serviceClient.from("core_event_rsvp_events").insert({ event_id: eventId, rsvp_id: saved.rsvp_id, organization_id: organizationId, event_type: before ? "platform_admin_rsvp_updated" : "platform_admin_rsvp_created", actor_user_id: actorUserId, actor_email: actorEmail, before_json: before, after_json: saved });
  } catch (error) { console.error("rsvp_event_audit_failed", error); }
  return saved;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, {
      ok: false,
      error: "missing_environment",
      message: "Missing Supabase Edge Function environment variables.",
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "").trim();

  if (!jwt) {
    return jsonResponse(401, { ok: false, error: "missing_auth", message: "Missing Authorization bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);

  if (authError || !authData?.user?.email) {
    return jsonResponse(401, { ok: false, error: "invalid_auth", message: "Could not verify authenticated user." });
  }

  const actorEmail = normalizeEmail(authData.user.email);

  const { data: adminRow, error: adminError } = await serviceClient
    .from("core_admin_users")
    .select("email, role, status, customer_scope")
    .eq("email", actorEmail)
    .eq("role", "platform_admin")
    .eq("status", "active")
    .maybeSingle();

  if (adminError) {
    return jsonResponse(500, { ok: false, error: "admin_lookup_failed", message: adminError.message });
  }

  if (!adminRow) {
    return jsonResponse(403, {
      ok: false,
      error: "not_platform_admin",
      message: "Authenticated user is not an active platform admin.",
    });
  }

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json", message: "Request body must be valid JSON." });
  }

  const action = String(body.action || "").trim();

  try {
    if (action === "ping") {
      return jsonResponse(200, {
        ok: true,
        action,
        actor_email: actorEmail,
        message: "core-admin-action is reachable and authenticated.",
      });
    }

    if (action === "list_customers") {
      const { data, error } = await serviceClient
        .from("core_customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, customers: data || [] });
    }

    if (action === "get_customer") {
      const customerId = requireString(body, "customer_id");
      const { data, error } = await serviceClient
        .from("core_customers")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, customer: data });
    }

    if (action === "create_customer") {
      const displayName = requireString(body, "display_name");
      const customerKey = await ensureUniqueCustomerKey(serviceClient, optionalString(body, "customer_key", displayName));

      const payload = {
        customer_key: customerKey,
        legal_name: optionalNullableString(body, "legal_name"),
        display_name: displayName,
        customer_type: optionalString(body, "customer_type", "generic") || "generic",
        vertical: optionalString(body, "vertical", "generic") || "generic",
        status: normalizeCustomerStatus(body.status, "draft"),
        notes: optionalNullableString(body, "notes"),
      };

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;

      await getOrCreateActiveStyleProfile(serviceClient, customer.customer_id);

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customer.customer_id, body, {
        customer_id: customer.customer_id,
        customer_key: customer.customer_key,
      }, null, customer);

      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "update_customer") {
      const customerId = requireString(body, "customer_id");
      const allowedFields = ["legal_name", "display_name", "customer_type", "vertical", "status", "notes"];
      const updatePayload: JsonRecord = {};

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updatePayload[field] = field === "status" ? normalizeCustomerStatus(body[field], "draft") : body[field];
        }
      }

      if (!Object.keys(updatePayload).length) {
        return jsonResponse(400, { ok: false, error: "no_update_fields", message: "No allowed update fields were provided." });
      }

      const { data: before } = await serviceClient
        .from("core_customers")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update(updatePayload)
        .eq("customer_id", customerId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, { customer_id: customerId }, before, customer);
      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "archive_customer" || action === "recover_customer") {
      const customerId = requireString(body, "customer_id");
      const updatePayload = action === "archive_customer"
        ? { status: "archived", archived_at: nowIso() }
        : { status: "draft", archived_at: null };

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update(updatePayload)
        .eq("customer_id", customerId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, updatePayload, null, customer);
      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "list_templates") {
      let templateResult = await serviceClient
        .from("core_template_contracts_admin_v1")
        .select("*")
        .order("sort_order", { ascending: true });

      if (templateResult.error) {
        templateResult = await serviceClient
          .from("core_template_registry")
          .select("*")
          .order("sort_order", { ascending: true });
      }

      if (templateResult.error) throw templateResult.error;
      return jsonResponse(200, { ok: true, action, templates: templateResult.data || [] });
    }

    if (action === "list_customer_pages") {
      const customerId = requireString(body, "customer_id");
      const { data: pages, error } = await serviceClient
        .from("core_customer_pages")
        .select("*")
        .eq("customer_id", customerId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;

      const templates = await getTemplateMap(serviceClient, (pages || []).map((page: JsonRecord) => String(page.template_id || "")));
      const customerPages = (pages || []).map((page: JsonRecord) => flattenCustomerPage(page, templates.get(String(page.template_id)) || null));

      return jsonResponse(200, { ok: true, action, customer_pages: customerPages });
    }

    if (action === "enable_customer_page") {
      const customerId = requireString(body, "customer_id");
      const templateId = requireString(body, "template_id");
      const template = await getTemplateById(serviceClient, templateId);
      if (!template) throw new Error("Template not found.");

      const pageKey = normalizeKey(optionalString(body, "page_key", String(template.template_key || "page")));
      if (!pageKey) throw new Error("Page key could not be generated.");

      const pageSlug = normalizeKey(optionalString(body, "page_slug", pageKey));
      const navLabel = optionalString(body, "nav_label", String(template.template_name || pageKey)) || String(template.template_name || pageKey);
      const status = normalizePageStatus(body.status, "draft");

      const payload = {
        customer_id: customerId,
        organization_id: customerId,
        template_id: templateId,
        page_key: pageKey,
        page_slug: pageSlug || pageKey,
        status,
        nav_label: navLabel,
        sort_order: optionalNumber(body, "sort_order", Number(template.sort_order || 100)),
        show_in_nav: optionalBoolean(body, "show_in_nav", status === "published"),
        archived_at: status === "archived" ? nowIso() : null,
      };

      const { data: page, error } = await serviceClient
        .from("core_customer_pages")
        .upsert(payload, { onConflict: "customer_id,page_key" })
        .select("*")
        .single();
      if (error) throw error;

      const pageSettings = await getOrCreatePageSettings(serviceClient, page, template);
      const mergedPage = flattenCustomerPage(page, template);

      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", page.customer_page_id, body, {
        customer_page_id: page.customer_page_id,
        page_key: page.page_key,
      }, null, page);

      return jsonResponse(200, { ok: true, action, customer_page: mergedPage, page_settings: pageSettings });
    }

    if (action === "update_customer_page") {
      const customerPageId = requireString(body, "customer_page_id");
      const allowed = ["nav_label", "show_in_nav", "sort_order", "page_slug", "page_key"];
      const payload: JsonRecord = {};

      for (const field of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, field)) payload[field] = body[field];
      }
      if (Object.prototype.hasOwnProperty.call(body, "status")) payload.status = normalizePageStatus(body.status, "draft");
      if (payload.status && payload.status !== "archived") payload.archived_at = null;
      if (payload.status === "archived") payload.archived_at = nowIso();
      if (!Object.keys(payload).length) throw new Error("No page update fields provided.");

      const { data: before } = await serviceClient
        .from("core_customer_pages")
        .select("*")
        .eq("customer_page_id", customerPageId)
        .maybeSingle();

      const { data: page, error } = await serviceClient
        .from("core_customer_pages")
        .update(payload)
        .eq("customer_page_id", customerPageId)
        .select("*")
        .single();
      if (error) throw error;

      const template = await getTemplateById(serviceClient, String(page.template_id));
      const mergedPage = flattenCustomerPage(page, template);
      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", customerPageId, body, payload, before, page);

      return jsonResponse(200, { ok: true, action, customer_page: mergedPage });
    }

    if (action === "archive_customer_page" || action === "recover_customer_page") {
      const customerPageId = requireString(body, "customer_page_id");
      const payload = action === "archive_customer_page"
        ? { status: "archived", archived_at: nowIso() }
        : { status: "draft", archived_at: null };

      const { data: page, error } = await serviceClient
        .from("core_customer_pages")
        .update(payload)
        .eq("customer_page_id", customerPageId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", customerPageId, body, payload, null, page);
      return jsonResponse(200, { ok: true, action, customer_page: page });
    }

    if (action === "get_customer_page_settings") {
      const customerPageId = requireString(body, "customer_page_id");
      const { data: page, error: pageError } = await serviceClient
        .from("core_customer_pages")
        .select("*")
        .eq("customer_page_id", customerPageId)
        .maybeSingle();
      if (pageError) throw pageError;
      if (!page) throw new Error("Customer page not found.");

      const template = await getTemplateById(serviceClient, String(page.template_id));
      const pageSettings = await getOrCreatePageSettings(serviceClient, page, template);
      const mergedPage = flattenCustomerPage(page, template);

      return jsonResponse(200, {
        ok: true,
        action,
        customer_page: mergedPage,
        page_settings: pageSettings,
        editable_schema_json: template?.editable_schema_json || {},
        feature_schema_json: template?.feature_schema_json || {},
        data_contract_json: template?.data_contract_json || {},
        admin_contract_json: template?.admin_contract_json || {},
        render_contract_json: template?.render_contract_json || {},
      });
    }

    if (action === "update_page_settings") {
      const customerPageId = requireString(body, "customer_page_id");
      const customerPage = await fetchCustomerPage(serviceClient, customerPageId);
      const template = await getTemplateById(serviceClient, String(customerPage.template_id));
      const beforeSettings = await getOrCreatePageSettings(serviceClient, customerPage, template);

      const payload = {
        customer_page_id: customerPageId,
        title: optionalNullableString(body, "title"),
        intro_text: optionalNullableString(body, "intro_text"),
        labels_json: optionalJsonObject(body, "labels_json"),
        options_json: optionalJsonObject(body, "options_json"),
        visibility_json: optionalJsonObject(body, "visibility_json"),
        content_json: optionalJsonObject(body, "content_json"),
      };

      await addPageSettingsHistory(serviceClient, customerPage, beforeSettings, "before_save", actorEmail, optionalNullableString(body, "note") || "Before Page Editor save");

      const { data: pageSettings, error } = await serviceClient
        .from("core_page_settings")
        .upsert(payload, { onConflict: "customer_page_id" })
        .select("*")
        .single();
      if (error) throw error;

      await addPageSettingsHistory(serviceClient, customerPage, pageSettings, "after_save", actorEmail, optionalNullableString(body, "note") || "After Page Editor save");
      await writeAudit(serviceClient, actorEmail, action, "core_page_settings", String(pageSettings.page_settings_id), body, {
        customer_page_id: customerPageId,
      }, beforeSettings, pageSettings);

      return jsonResponse(200, { ok: true, action, page_settings: pageSettings });
    }

    if (action === "list_page_settings_history") {
      const customerPageId = requireString(body, "customer_page_id");
      const limit = clampInteger(optionalNumber(body, "limit", 10), 1, 100);
      const offset = clampInteger(optionalNumber(body, "offset", 0), 0, 100000);
      const eventGroup = optionalString(body, "event_group", "all") || "all";
      const eventTypes = historyEventTypesForGroup(eventGroup, "page");

      let query = serviceClient
        .from("core_page_settings_history")
        .select("*", { count: "exact" })
        .eq("customer_page_id", customerPageId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventTypes) query = query.in("event_type", eventTypes);

      const { data, error, count } = await query;
      if (error) throw error;
      const totalCount = typeof count === "number" ? count : (data || []).length;
      return jsonResponse(200, {
        ok: true,
        action,
        history: data || [],
        total_count: totalCount,
        limit,
        offset,
        event_group: eventGroup,
        has_more: offset + (data || []).length < totalCount,
      });
    }

    if (action === "restore_page_settings_snapshot") {
      const customerPageId = requireString(body, "customer_page_id");
      const historyId = requireString(body, "history_id");
      const customerPage = await fetchCustomerPage(serviceClient, customerPageId);
      const template = await getTemplateById(serviceClient, String(customerPage.template_id));
      const beforeSettings = await getOrCreatePageSettings(serviceClient, customerPage, template);

      const { data: history, error: historyError } = await serviceClient
        .from("core_page_settings_history")
        .select("*")
        .eq("customer_page_id", customerPageId)
        .eq("history_id", historyId)
        .maybeSingle();
      if (historyError) throw historyError;
      if (!history) throw new Error("Page history snapshot not found.");

      await addPageSettingsHistory(serviceClient, customerPage, beforeSettings, "before_restore", actorEmail, `Before restoring history ${historyId}`);

      const payload = {
        customer_page_id: customerPageId,
        ...pageSettingsPayloadFromSnapshot((history.snapshot_json || {}) as JsonRecord),
      };

      const { data: pageSettings, error } = await serviceClient
        .from("core_page_settings")
        .upsert(payload, { onConflict: "customer_page_id" })
        .select("*")
        .single();
      if (error) throw error;

      await addPageSettingsHistory(serviceClient, customerPage, pageSettings, "after_restore", actorEmail, `Restored history ${historyId}`);
      await writeAudit(serviceClient, actorEmail, action, "core_page_settings", String(pageSettings.page_settings_id), body, {
        customer_page_id: customerPageId,
        history_id: historyId,
      }, beforeSettings, pageSettings);

      return jsonResponse(200, { ok: true, action, page_settings: pageSettings });
    }

    if (action === "reset_page_settings_to_template_defaults") {
      const customerPageId = requireString(body, "customer_page_id");
      const customerPage = await fetchCustomerPage(serviceClient, customerPageId);
      const template = await getTemplateById(serviceClient, String(customerPage.template_id));
      const beforeSettings = await getOrCreatePageSettings(serviceClient, customerPage, template);
      const payload = buildDefaultPageSettingsPayload(customerPage, template);

      await addPageSettingsHistory(serviceClient, customerPage, beforeSettings, "before_reset_to_default", actorEmail, "Before Page Editor reset to template defaults");

      const { data: pageSettings, error } = await serviceClient
        .from("core_page_settings")
        .upsert(payload, { onConflict: "customer_page_id" })
        .select("*")
        .single();
      if (error) throw error;

      await addPageSettingsHistory(serviceClient, customerPage, pageSettings, "after_reset_to_default", actorEmail, "After Page Editor reset to template defaults");
      await writeAudit(serviceClient, actorEmail, action, "core_page_settings", String(pageSettings.page_settings_id), body, {
        customer_page_id: customerPageId,
      }, beforeSettings, pageSettings);

      return jsonResponse(200, { ok: true, action, page_settings: pageSettings });
    }

    if (action === "get_active_style_profile") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "update_active_style_profile") {
      const customerId = requireString(body, "customer_id");
      const active = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const payload = stylePayloadFromBody(body);
      payload.is_active = true;
      payload.organization_id = customerId;

      await addStyleHistory(serviceClient, customerId, active, "before_save", actorEmail, optionalNullableString(body, "note") || "Before Layout Designer save");

      const { data: styleProfile, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update(payload)
        .eq("style_profile_id", String(active.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, styleProfile, "after_save", actorEmail, optionalNullableString(body, "note") || "After Layout Designer save");
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(styleProfile.style_profile_id), body, {
        style_profile_id: styleProfile.style_profile_id,
      }, active, styleProfile);

      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "list_customer_style_profiles") {
      const customerId = requireString(body, "customer_id");
      const { data, error } = await serviceClient
        .from("core_customer_style_profiles")
        .select("*")
        .eq("customer_id", customerId)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, style_profiles: data || [] });
    }

    if (action === "save_design_profile") {
      const customerId = requireString(body, "customer_id");
      const profileName = requireString(body, "profile_name");
      const payload = {
        customer_id: customerId,
        organization_id: customerId,
        ...stylePayloadFromBody({ ...body, profile_name: profileName }),
        is_active: false,
      };

      const { data: savedProfile, error } = await serviceClient
        .from("core_customer_style_profiles")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, savedProfile, "saved_profile_created", actorEmail, optionalNullableString(body, "note"));
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(savedProfile.style_profile_id), body, {
        style_profile_id: savedProfile.style_profile_id,
      }, null, savedProfile);

      return jsonResponse(200, { ok: true, action, saved_profile: savedProfile });
    }

    if (action === "apply_saved_design_profile") {
      const customerId = requireString(body, "customer_id");
      const sourceStyleProfileId = requireString(body, "source_style_profile_id");
      const active = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      const { data: source, error: sourceError } = await serviceClient
        .from("core_customer_style_profiles")
        .select("*")
        .eq("customer_id", customerId)
        .eq("style_profile_id", sourceStyleProfileId)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) throw new Error("Saved design profile not found.");

      const payload = {
        ...stylePayloadFromSnapshot(source),
        is_active: true,
        organization_id: customerId,
      };
      delete (payload as JsonRecord).style_profile_id;

      await addStyleHistory(serviceClient, customerId, active, "before_apply_saved_profile", actorEmail, `Before applying ${source.profile_name || sourceStyleProfileId}`);

      const { data: styleProfile, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update(payload)
        .eq("style_profile_id", String(active.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, styleProfile, "after_apply_saved_profile", actorEmail, `Applied ${source.profile_name || sourceStyleProfileId}`);
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(styleProfile.style_profile_id), body, {
        source_style_profile_id: sourceStyleProfileId,
        active_style_profile_id: styleProfile.style_profile_id,
      }, active, styleProfile);

      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "list_style_profile_history") {
      const customerId = requireString(body, "customer_id");
      const limit = clampInteger(optionalNumber(body, "limit", 10), 1, 100);
      const offset = clampInteger(optionalNumber(body, "offset", 0), 0, 100000);
      const eventGroup = optionalString(body, "event_group", "all") || "all";
      const eventTypes = historyEventTypesForGroup(eventGroup, "style");

      let query = serviceClient
        .from("core_customer_style_profile_history")
        .select("*", { count: "exact" })
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventTypes) query = query.in("event_type", eventTypes);

      const { data, error, count } = await query;
      if (error) throw error;
      const totalCount = typeof count === "number" ? count : (data || []).length;
      return jsonResponse(200, {
        ok: true,
        action,
        history: data || [],
        total_count: totalCount,
        limit,
        offset,
        event_group: eventGroup,
        has_more: offset + (data || []).length < totalCount,
      });
    }

    if (action === "restore_style_profile_snapshot") {
      const customerId = requireString(body, "customer_id");
      const historyId = requireString(body, "history_id");
      const active = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      const { data: history, error: historyError } = await serviceClient
        .from("core_customer_style_profile_history")
        .select("*")
        .eq("customer_id", customerId)
        .eq("history_id", historyId)
        .maybeSingle();
      if (historyError) throw historyError;
      if (!history) throw new Error("Style history snapshot not found.");

      const snapshot = (history.snapshot_json || {}) as JsonRecord;
      const payload = {
        ...stylePayloadFromSnapshot(snapshot),
        is_active: true,
        organization_id: customerId,
      };

      await addStyleHistory(serviceClient, customerId, active, "before_restore", actorEmail, `Before restoring history ${historyId}`);

      const { data: styleProfile, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update(payload)
        .eq("style_profile_id", String(active.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, styleProfile, "after_restore", actorEmail, `Restored history ${historyId}`);
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(styleProfile.style_profile_id), body, {
        history_id: historyId,
        active_style_profile_id: styleProfile.style_profile_id,
      }, active, styleProfile);

      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "reset_active_style_profile_to_default") {
      const customerId = requireString(body, "customer_id");
      const active = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const payload = {
        ...DEFAULT_STYLE_PROFILE,
        is_active: true,
        organization_id: customerId,
      };

      await addStyleHistory(serviceClient, customerId, active, "before_reset_to_default", actorEmail, "Before Layout Designer reset to system default");

      const { data: styleProfile, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update(payload)
        .eq("style_profile_id", String(active.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, styleProfile, "after_reset_to_default", actorEmail, "After Layout Designer reset to system default");
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(styleProfile.style_profile_id), body, {
        active_style_profile_id: styleProfile.style_profile_id,
      }, active, styleProfile);

      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "get_active_customer_logo") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const logoAsset = await fetchLogoAsset(serviceClient, styleProfile.logo_asset_id);
      return jsonResponse(200, { ok: true, action, style_profile: styleProfile, logo_asset: logoAsset });
    }

    if (action === "list_customer_assets") {
      const customerId = requireString(body, "customer_id");
      const assetType = optionalNullableString(body, "asset_type");
      let query = serviceClient
        .from("core_assets")
        .select("*")
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false });

      if (assetType) query = query.eq("asset_type", assetType);
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, assets: data || [] });
    }

    if (action === "create_customer_asset") {
      const customerId = requireString(body, "customer_id");
      const payload = {
        customer_id: customerId,
        organization_id: customerId,
        operational_asset_id: optionalNullableString(body, "operational_asset_id"),
        asset_role: optionalNullableString(body, "asset_role"),
        asset_type: optionalString(body, "asset_type", "general") || "general",
        url: optionalNullableString(body, "url"),
        storage_path: optionalNullableString(body, "storage_path"),
        alt_text: optionalNullableString(body, "alt_text"),
        mime_type: optionalNullableString(body, "mime_type"),
        file_size_bytes: Object.prototype.hasOwnProperty.call(body, "file_size_bytes") ? optionalNumber(body, "file_size_bytes", 0) : null,
        metadata_json: optionalJsonObject(body, "metadata_json"),
        status: "active",
      };

      if (!payload.url && !payload.storage_path) {
        return jsonResponse(400, { ok: false, error: "missing_asset_location", message: "Asset requires url or storage_path." });
      }

      const { data: asset, error } = await serviceClient
        .from("core_assets")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_assets", String(asset.asset_id), body, {
        asset_id: asset.asset_id,
      }, null, asset);

      return jsonResponse(200, { ok: true, action, asset });
    }

    if (action === "set_active_logo_asset") {
      const customerId = requireString(body, "customer_id");
      const assetId = requireString(body, "asset_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      const { data: asset, error: assetError } = await serviceClient
        .from("core_assets")
        .select("*")
        .eq("customer_id", customerId)
        .eq("asset_id", assetId)
        .maybeSingle();
      if (assetError) throw assetError;
      if (!asset) throw new Error("Logo asset not found for this customer.");

      const { data: updatedStyle, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update({ logo_asset_id: assetId })
        .eq("style_profile_id", String(styleProfile.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, updatedStyle, "after_save", actorEmail, "Active logo changed");
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(updatedStyle.style_profile_id), body, {
        logo_asset_id: assetId,
      }, styleProfile, updatedStyle);

      return jsonResponse(200, { ok: true, action, style_profile: updatedStyle, logo_asset: asset });
    }

    if (action === "clear_active_logo_asset") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const { data: updatedStyle, error } = await serviceClient
        .from("core_customer_style_profiles")
        .update({ logo_asset_id: null })
        .eq("style_profile_id", String(styleProfile.style_profile_id))
        .select("*")
        .single();
      if (error) throw error;

      await addStyleHistory(serviceClient, customerId, updatedStyle, "after_save", actorEmail, "Active logo cleared");
      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", String(updatedStyle.style_profile_id), body, {
        logo_asset_id: null,
      }, styleProfile, updatedStyle);

      return jsonResponse(200, { ok: true, action, style_profile: updatedStyle, logo_asset: null });
    }

    if (action === "archive_customer_asset" || action === "restore_customer_asset") {
      const customerId = requireString(body, "customer_id");
      const assetId = requireString(body, "asset_id");
      const payload = action === "archive_customer_asset"
        ? { status: "archived", archived_at: nowIso() }
        : { status: "active", archived_at: null };

      const { data: asset, error } = await serviceClient
        .from("core_assets")
        .update(payload)
        .eq("customer_id", customerId)
        .eq("asset_id", assetId)
        .select("*")
        .single();
      if (error) throw error;

      if (action === "archive_customer_asset") {
        const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
        if (String(styleProfile.logo_asset_id || "") === assetId) {
          await serviceClient
            .from("core_customer_style_profiles")
            .update({ logo_asset_id: null })
            .eq("style_profile_id", String(styleProfile.style_profile_id));
        }
      }

      await writeAudit(serviceClient, actorEmail, action, "core_assets", assetId, body, payload, null, asset);
      return jsonResponse(200, { ok: true, action, asset });
    }



    if (action === "list_info_faq_items") {
      const faq_items = await listInfoFaqItems(serviceClient, body);
      return jsonResponse(200, { ok: true, action, faq_items });
    }

    if (action === "upsert_info_faq_item") {
      const faq_item = await upsertInfoFaqItem(serviceClient, body);
      await writeAudit(serviceClient, actorEmail, action, "core_info_faq_items", String(faq_item.faq_item_id), body, {
        faq_item_id: faq_item.faq_item_id,
        category: faq_item.category,
        status: faq_item.status,
        visibility: faq_item.visibility,
      }, null, faq_item);
      return jsonResponse(200, { ok: true, action, faq_item });
    }

    if (action === "archive_info_faq_item" || action === "restore_info_faq_item") {
      const faq_item = await setInfoFaqArchiveState(serviceClient, body, action === "archive_info_faq_item");
      await writeAudit(serviceClient, actorEmail, action, "core_info_faq_items", String(faq_item.faq_item_id), body, {
        faq_item_id: faq_item.faq_item_id,
        status: faq_item.status,
      }, null, faq_item);
      return jsonResponse(200, { ok: true, action, faq_item });
    }

    if (action === "list_gallery_media") {
      const media = await listGalleryMedia(serviceClient, body);
      return jsonResponse(200, { ok: true, action, media });
    }

    if (action === "upsert_gallery_media") {
      const media = await upsertGalleryMedia(serviceClient, body);
      await writeAudit(serviceClient, actorEmail, action, "core_gallery_media", String(media.gallery_media_id), body, {
        gallery_media_id: media.gallery_media_id,
        title: media.title,
        is_featured: media.is_featured,
        visibility: media.visibility,
        status: media.status,
      }, null, media);
      return jsonResponse(200, { ok: true, action, media });
    }

    if (action === "archive_gallery_media" || action === "restore_gallery_media") {
      const media = await setGalleryMediaArchiveState(serviceClient, body, action === "archive_gallery_media");
      await writeAudit(serviceClient, actorEmail, action, "core_gallery_media", String(media.gallery_media_id), body, {
        gallery_media_id: media.gallery_media_id,
        status: media.status,
      }, null, media);
      return jsonResponse(200, { ok: true, action, media });
    }



    if (action === "list_aircraft") {
      const organizationId = optionalString(body, "organization_id", optionalString(body, "customer_id", ""));
      if (!organizationId) throw new Error("Missing required organization_id/customer_id.");
      const includeArchived = optionalBoolean(body, "include_archived", false);

      let query = serviceClient
        .from("module_aircraft_admin_v1")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true })
        .order("tail_number", { ascending: true });

      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, aircraft: data || [] });
    }

    if (action === "get_aircraft") {
      const aircraftId = requireString(body, "aircraft_id");
      const aircraft = await fetchAircraftAdminRecord(serviceClient, aircraftId);
      return jsonResponse(200, { ok: true, action, aircraft });
    }

    if (action === "upsert_aircraft") {
      const aircraft = await upsertAircraftRecord(serviceClient, body);
      await writeAudit(serviceClient, actorEmail, action, "core_operational_assets", String(aircraft.operational_asset_id), body, {
        operational_asset_id: aircraft.operational_asset_id,
        asset_key: aircraft.asset_key,
        tail_number: aircraft.tail_number,
      }, null, aircraft);
      return jsonResponse(200, { ok: true, action, aircraft });
    }

    if (action === "bulk_upsert_aircraft") {
      const organizationId = optionalString(body, "organization_id", optionalString(body, "customer_id", ""));
      if (!organizationId) throw new Error("Missing required organization_id/customer_id.");

      const rawRows = Array.isArray(body.rows) ? body.rows as JsonRecord[] : [];
      if (!rawRows.length) throw new Error("Missing rows array.");
      if (rawRows.length > 100) throw new Error("Bulk import is capped at 100 rows per request.");

      const saved: JsonRecord[] = [];
      const failed: JsonRecord[] = [];

      for (let i = 0; i < rawRows.length; i += 1) {
        try {
          const normalized = normalizeWebflowAircraftRow(rawRows[i]);
          normalized.organization_id = organizationId;
          normalized.customer_id = organizationId;
          const aircraft = await upsertAircraftRecord(serviceClient, normalized);
          saved.push(aircraft);
        } catch (error) {
          failed.push({ row_index: i, message: error instanceof Error ? error.message : String(error), row: rawRows[i] });
        }
      }

      await writeAudit(serviceClient, actorEmail, action, "core_operational_assets", organizationId, body, {
        saved_count: saved.length,
        failed_count: failed.length,
      });

      return jsonResponse(200, { ok: failed.length === 0, action, saved_count: saved.length, failed_count: failed.length, aircraft: saved, failed });
    }

    if (action === "attach_aircraft_image_asset") {
      const result = await attachAircraftImageAsset(serviceClient, body);
      await writeAudit(serviceClient, actorEmail, action, "core_assets", String(result.asset.asset_id), body, {
        asset_id: result.asset.asset_id,
        aircraft_id: body.aircraft_id,
        image_role: body.image_role || body.asset_role,
      }, null, result.asset);
      return jsonResponse(200, { ok: true, action, asset: result.asset, aircraft: result.aircraft });
    }

    if (action === "archive_aircraft" || action === "restore_aircraft") {
      const aircraftId = requireString(body, "aircraft_id");
      const payload = action === "archive_aircraft"
        ? { status: "archived", archived_at: nowIso() }
        : { status: "active", archived_at: null };

      const { data: asset, error } = await serviceClient
        .from("core_operational_assets")
        .update(payload)
        .eq("operational_asset_id", aircraftId)
        .eq("asset_type_key", "aircraft")
        .select("*")
        .single();
      if (error) throw error;

      const aircraft = await fetchAircraftAdminRecord(serviceClient, aircraftId);
      await writeAudit(serviceClient, actorEmail, action, "core_operational_assets", aircraftId, body, payload, null, asset);
      return jsonResponse(200, { ok: true, action, aircraft });
    }


    if (action === "list_documents") {
      const documents = await listDocuments(serviceClient, body);
      return jsonResponse(200, { ok: true, action, documents });
    }

    if (action === "upsert_document") {
      const document = await upsertDocument(serviceClient, body, authData.user.id || null, actorEmail);
      await writeAudit(serviceClient, actorEmail, action, "core_documents", String(document.document_id), body, {
        document_id: document.document_id,
        title: document.title,
        visibility: document.visibility,
      }, null, document);
      return jsonResponse(200, { ok: true, action, document });
    }

    if (action === "archive_document" || action === "restore_document") {
      const document = await setDocumentArchiveState(serviceClient, body, action === "archive_document", authData.user.id || null, actorEmail);
      await writeAudit(serviceClient, actorEmail, action, "core_documents", String(document.document_id), body, {
        document_id: document.document_id,
        status: document.status,
      }, null, document);
      return jsonResponse(200, { ok: true, action, document });
    }

    if (action === "list_document_versions") {
      const versions = await listDocumentVersions(serviceClient, body);
      return jsonResponse(200, { ok: true, action, versions });
    }

    if (action === "create_document_version") {
      const version = await createDocumentVersion(serviceClient, body, authData.user.id || null, actorEmail);
      await writeAudit(serviceClient, actorEmail, action, "core_document_versions", String(version.version_id), body, {
        document_id: version.document_id,
        version_id: version.version_id,
        version_number: version.version_number,
        version_status: version.version_status,
      }, null, version);
      return jsonResponse(200, { ok: true, action, version });
    }

    if (["approve_document_version", "publish_document_version", "reject_document_version"].includes(action)) {
      const status = action === "approve_document_version" ? "approved" : action === "publish_document_version" ? "published" : "rejected";
      const version = await setDocumentVersionStatus(serviceClient, body, status, authData.user.id || null, actorEmail);
      await writeAudit(serviceClient, actorEmail, action, "core_document_versions", String(version.version_id), body, {
        document_id: version.document_id,
        version_id: version.version_id,
        version_status: version.version_status,
      }, null, version);
      return jsonResponse(200, { ok: true, action, version });
    }

    if (action === "get_document_download_url") {
      const result = await getDocumentDownloadUrl(serviceClient, body);
      return jsonResponse(200, { ok: true, action, ...result });
    }


    if (action === "list_events") {
      const events = await listEvents(serviceClient, body);
      return jsonResponse(200, { ok: true, action, events });
    }

    if (action === "upsert_event") {
      const event = await upsertEvent(serviceClient, body, authData.user.id || null);
      await writeAudit(serviceClient, actorEmail, action, "core_events", String(event.event_id), body, {
        event_id: event.event_id,
        title: event.title,
        visibility: event.visibility,
        status: event.status,
      }, null, event);
      return jsonResponse(200, { ok: true, action, event });
    }

    if (action === "archive_event" || action === "restore_event") {
      const event = await setEventArchiveState(serviceClient, body, action === "archive_event", authData.user.id || null);
      await writeAudit(serviceClient, actorEmail, action, "core_events", String(event.event_id), body, {
        event_id: event.event_id,
        status: event.status,
      }, null, event);
      return jsonResponse(200, { ok: true, action, event });
    }

    if (action === "list_event_rsvps") {
      const rsvps = await listEventRsvps(serviceClient, body);
      return jsonResponse(200, { ok: true, action, rsvps });
    }

    if (action === "upsert_event_rsvp") {
      const rsvp = await upsertEventRsvpAdmin(serviceClient, body, authData.user.id || null, actorEmail);
      await writeAudit(serviceClient, actorEmail, action, "core_event_rsvps", String(rsvp.rsvp_id), body, { rsvp_id: rsvp.rsvp_id, event_id: rsvp.event_id, response_status: rsvp.response_status }, null, rsvp);
      return jsonResponse(200, { ok: true, action, rsvp });
    }

    return jsonResponse(400, {
      ok: false,
      error: "unknown_action",
      message: `Unknown action: ${action || "(blank)"}`,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "action_failed",
      action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
