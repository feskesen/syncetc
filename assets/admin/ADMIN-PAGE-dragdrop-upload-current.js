// SB-EDGE-core-admin-action-v9.ts
// Internal Version: 2026-06-03-009
// Purpose: Controlled admin backend for SyncEtc Customer Builder, Page Setup, Page Editor, and expanded Layout Designer operations.
// Change from v8: adds customer asset restore support.
// Deploy name recommendation: core-admin-action

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required string: ${key}`);
  return value.trim();
}

function objectOrDefault(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

async function createAvailableCustomerKey(serviceClient: any, displayName: string): Promise<string> {
  const baseKey = normalizeKey(displayName);
  if (!baseKey) throw new Error("Could not generate a valid customer key from display_name.");

  const { data, error } = await serviceClient
    .from("core_customers")
    .select("customer_key")
    .or(`customer_key.eq.${baseKey},customer_key.like.${baseKey}-%`);

  if (error) throw error;

  const existingKeys = new Set((data || []).map((row: { customer_key: string }) => row.customer_key));
  if (!existingKeys.has(baseKey)) return baseKey;

  let suffix = 1;
  while (existingKeys.has(`${baseKey}-${suffix}`)) suffix += 1;
  return `${baseKey}-${suffix}`;
}

async function writeAudit(
  serviceClient: any,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string | null,
  requestJson: JsonRecord,
  resultJson: JsonRecord,
): Promise<void> {
  await serviceClient.from("core_audit_log").insert({
    actor_email: actorEmail,
    actor_role: "platform_admin",
    action,
    target_type: targetType,
    target_id: targetId,
    request_json: requestJson,
    result_json: resultJson,
  });
}

async function getFullCustomerPage(serviceClient: any, customerPageId: string): Promise<any> {
  const { data, error } = await serviceClient
    .from("core_customer_pages")
    .select("*, core_template_registry(*)")
    .eq("customer_page_id", customerPageId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOrCreatePageSettings(serviceClient: any, customerPageId: string): Promise<any> {
  const { data: existing, error: existingError } = await serviceClient
    .from("core_page_settings")
    .select("*")
    .eq("customer_page_id", customerPageId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await serviceClient
    .from("core_page_settings")
    .insert({
      customer_page_id: customerPageId,
      labels_json: {},
      options_json: {},
      visibility_json: {},
      content_json: {},
    })
    .select("*")
    .single();

  if (createError) throw createError;
  return created;
}

async function getOrCreateActiveStyleProfile(serviceClient: any, customerId: string): Promise<any> {
  const { data: existing, error: existingError } = await serviceClient
    .from("core_customer_style_profiles")
    .select("*")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await serviceClient
    .from("core_customer_style_profiles")
    .insert({
      customer_id: customerId,
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

  if (createError) throw createError;
  return created;
}

async function writeStyleHistory(
  serviceClient: any,
  actorEmail: string,
  eventType: string,
  styleProfile: any,
  note: string | null = null,
): Promise<void> {
  if (!styleProfile?.customer_id) return;

  await serviceClient.from("core_customer_style_profile_history").insert({
    customer_id: styleProfile.customer_id,
    style_profile_id: styleProfile.style_profile_id || null,
    event_type: eventType,
    snapshot_json: styleProfile,
    saved_by_email: actorEmail,
    note,
  });
}

function buildStyleUpdatePayload(body: JsonRecord): JsonRecord {
  const updatePayload: JsonRecord = {};

  if (typeof body.profile_name === "string") updatePayload.profile_name = body.profile_name.trim() || "Default";
  if (body.colors_json && typeof body.colors_json === "object") updatePayload.colors_json = objectOrDefault(body.colors_json);
  if (body.typography_json && typeof body.typography_json === "object") updatePayload.typography_json = objectOrDefault(body.typography_json);
  if (body.spacing_json && typeof body.spacing_json === "object") updatePayload.spacing_json = objectOrDefault(body.spacing_json);
  if (body.layout_json && typeof body.layout_json === "object") updatePayload.layout_json = objectOrDefault(body.layout_json);
  if (body.effects_json && typeof body.effects_json === "object") updatePayload.effects_json = objectOrDefault(body.effects_json);
  if (body.media_json && typeof body.media_json === "object") updatePayload.media_json = objectOrDefault(body.media_json);
  if (body.component_json && typeof body.component_json === "object") updatePayload.component_json = objectOrDefault(body.component_json);
  if (body.preview_json && typeof body.preview_json === "object") updatePayload.preview_json = objectOrDefault(body.preview_json);
  if (typeof body.density === "string") updatePayload.density = body.density.trim() || "normal";
  if (typeof body.card_style === "string") updatePayload.card_style = body.card_style.trim() || "standard";
  if (typeof body.hero_style === "string") updatePayload.hero_style = body.hero_style.trim() || "standard";
  if (typeof body.preset_key === "string") updatePayload.preset_key = body.preset_key.trim() || null;
  if (typeof body.preset_source === "string") updatePayload.preset_source = body.preset_source.trim() || "custom";

  return updatePayload;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, { ok: false, error: "missing_environment", message: "Missing Supabase Edge Function environment variables." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "").trim();

  if (!jwt) return jsonResponse(401, { ok: false, error: "missing_auth", message: "Missing Authorization bearer token." });

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

  if (adminError) return jsonResponse(500, { ok: false, error: "admin_lookup_failed", message: adminError.message });
  if (!adminRow) return jsonResponse(403, { ok: false, error: "not_platform_admin", message: "Authenticated user is not an active platform admin." });

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json", message: "Request body must be valid JSON." });
  }

  const action = String(body.action || "").trim();

  try {
    if (action === "ping") {
      return jsonResponse(200, { ok: true, action, actor_email: actorEmail, message: "core-admin-action is reachable and authenticated." });
    }

    if (action === "list_customers") {
      const { data, error } = await serviceClient.from("core_customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, customers: data || [] });
    }

    if (action === "get_customer") {
      const customerId = requireString(body, "customer_id");
      const { data, error } = await serviceClient.from("core_customers").select("*").eq("customer_id", customerId).maybeSingle();
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, customer: data });
    }

    if (action === "create_customer") {
      const displayName = requireString(body, "display_name");
      const generatedCustomerKey = await createAvailableCustomerKey(serviceClient, displayName);

      const payload = {
        customer_key: generatedCustomerKey,
        legal_name: typeof body.legal_name === "string" ? body.legal_name.trim() || null : null,
        display_name: displayName,
        customer_type: typeof body.customer_type === "string" && body.customer_type.trim() ? body.customer_type.trim() : "generic",
        vertical: typeof body.vertical === "string" && body.vertical.trim() ? body.vertical.trim() : "generic",
        status: typeof body.status === "string" && body.status.trim() ? body.status.trim() : "draft",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      };

      const { data: customer, error } = await serviceClient.from("core_customers").insert(payload).select("*").single();
      if (error) throw error;

      const { error: styleError } = await serviceClient.from("core_customer_style_profiles").insert({
        customer_id: customer.customer_id,
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
      });
      if (styleError) throw styleError;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customer.customer_id, body, {
        customer_id: customer.customer_id,
        customer_key: customer.customer_key,
        key_generated_from: "display_name",
      });

      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "update_customer") {
      const customerId = requireString(body, "customer_id");
      const allowedFields = ["legal_name", "display_name", "customer_type", "vertical", "status", "notes"];
      const updatePayload: JsonRecord = {};
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) updatePayload[field] = body[field];
      }
      if (Object.keys(updatePayload).length === 0) return jsonResponse(400, { ok: false, error: "no_update_fields", message: "No allowed update fields were provided." });

      const { data: before } = await serviceClient.from("core_customers").select("*").eq("customer_id", customerId).maybeSingle();
      const { data: customer, error } = await serviceClient.from("core_customers").update(updatePayload).eq("customer_id", customerId).select("*").single();
      if (error) throw error;

      await serviceClient.from("core_audit_log").insert({
        actor_email: actorEmail,
        actor_role: "platform_admin",
        action,
        target_type: "core_customers",
        target_id: customerId,
        before_json: before || null,
        after_json: customer,
        request_json: body,
        result_json: { customer_id: customerId },
      });

      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "archive_customer") {
      const customerId = requireString(body, "customer_id");
      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, { customer_id: customerId, status: "archived" });
      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "recover_customer") {
      const customerId = requireString(body, "customer_id");
      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update({ status: "draft", archived_at: null })
        .eq("customer_id", customerId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, { customer_id: customerId, status: "draft" });
      return jsonResponse(200, { ok: true, action, customer });
    }

    if (action === "list_templates") {
      const { data, error } = await serviceClient.from("core_template_registry").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, templates: data || [] });
    }

    if (action === "list_customer_pages") {
      const customerId = requireString(body, "customer_id");
      const { data, error } = await serviceClient
        .from("core_customer_pages")
        .select("*, core_template_registry(template_key, template_name, renderer_key, template_category, editable_schema_json)")
        .eq("customer_id", customerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, customer_pages: data || [] });
    }

    if (action === "enable_customer_page") {
      const customerId = requireString(body, "customer_id");
      const templateId = requireString(body, "template_id");

      const { data: template, error: templateError } = await serviceClient.from("core_template_registry").select("*").eq("template_id", templateId).maybeSingle();
      if (templateError) throw templateError;
      if (!template) throw new Error("Template not found.");

      const pageKey = normalizeKey(typeof body.page_key === "string" && body.page_key.trim() ? body.page_key : template.template_key);
      const pageSlug = normalizeKey(typeof body.page_slug === "string" && body.page_slug.trim() ? body.page_slug : pageKey);
      const navLabel = typeof body.nav_label === "string" && body.nav_label.trim() ? body.nav_label.trim() : template.template_name;

      const { data: existingPage, error: existingError } = await serviceClient
        .from("core_customer_pages")
        .select("*")
        .eq("customer_id", customerId)
        .eq("template_id", templateId)
        .maybeSingle();

      if (existingError) throw existingError;

      let customerPage;

      if (existingPage) {
        const { data, error } = await serviceClient
          .from("core_customer_pages")
          .update({
            status: "draft",
            archived_at: null,
            page_key: existingPage.page_key || pageKey,
            page_slug: existingPage.page_slug || pageSlug,
            nav_label: existingPage.nav_label || navLabel,
            show_in_nav: true,
          })
          .eq("customer_page_id", existingPage.customer_page_id)
          .select("*")
          .single();
        if (error) throw error;
        customerPage = data;
      } else {
        const { data, error } = await serviceClient
          .from("core_customer_pages")
          .insert({
            customer_id: customerId,
            template_id: templateId,
            page_key: pageKey,
            page_slug: pageSlug,
            status: typeof body.status === "string" && body.status.trim() ? body.status.trim() : "draft",
            nav_label: navLabel,
            sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : Number(template.sort_order || 100),
            show_in_nav: true,
          })
          .select("*")
          .single();

        if (error) throw error;
        customerPage = data;

        const { error: settingsError } = await serviceClient.from("core_page_settings").insert({
          customer_page_id: customerPage.customer_page_id,
          title: template.template_name,
          intro_text: "",
          labels_json: {},
          options_json: {},
          visibility_json: {},
          content_json: {},
        });
        if (settingsError) throw settingsError;
      }

      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", customerPage.customer_page_id, body, {
        customer_page_id: customerPage.customer_page_id,
        customer_id: customerId,
        template_id: templateId,
      });

      return jsonResponse(200, { ok: true, action, customer_page: customerPage });
    }

    if (action === "archive_customer_page") {
      const customerPageId = requireString(body, "customer_page_id");
      const { data, error } = await serviceClient
        .from("core_customer_pages")
        .update({ status: "archived", archived_at: new Date().toISOString(), show_in_nav: false })
        .eq("customer_page_id", customerPageId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", customerPageId, body, { customer_page_id: customerPageId, status: "archived" });
      return jsonResponse(200, { ok: true, action, customer_page: data });
    }

    if (action === "recover_customer_page") {
      const customerPageId = requireString(body, "customer_page_id");
      const { data, error } = await serviceClient
        .from("core_customer_pages")
        .update({ status: "draft", archived_at: null, show_in_nav: true })
        .eq("customer_page_id", customerPageId)
        .select("*")
        .single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customer_pages", customerPageId, body, { customer_page_id: customerPageId, status: "draft" });
      return jsonResponse(200, { ok: true, action, customer_page: data });
    }

    if (action === "get_customer_page_settings") {
      const customerPageId = requireString(body, "customer_page_id");
      const customerPage = await getFullCustomerPage(serviceClient, customerPageId);
      if (!customerPage) throw new Error("Customer page not found.");
      const pageSettings = await getOrCreatePageSettings(serviceClient, customerPageId);
      return jsonResponse(200, {
        ok: true,
        action,
        customer_page: customerPage,
        page_settings: pageSettings,
        editable_schema_json: customerPage.core_template_registry?.editable_schema_json || {},
      });
    }

    if (action === "update_customer_page") {
      const customerPageId = requireString(body, "customer_page_id");
      const allowedFields = ["nav_label", "page_slug", "status", "show_in_nav", "sort_order"];
      const updatePayload: JsonRecord = {};
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updatePayload[field] = field === "page_slug" ? normalizeKey(String(body[field] || "")) : body[field];
        }
      }
      if (Object.keys(updatePayload).length === 0) return jsonResponse(400, { ok: false, error: "no_update_fields", message: "No allowed page fields were provided." });

      const { data: before } = await serviceClient.from("core_customer_pages").select("*").eq("customer_page_id", customerPageId).maybeSingle();
      const { data, error } = await serviceClient.from("core_customer_pages").update(updatePayload).eq("customer_page_id", customerPageId).select("*").single();
      if (error) throw error;

      await serviceClient.from("core_audit_log").insert({
        actor_email: actorEmail,
        actor_role: "platform_admin",
        action,
        target_type: "core_customer_pages",
        target_id: customerPageId,
        before_json: before || null,
        after_json: data,
        request_json: body,
        result_json: { customer_page_id: customerPageId },
      });

      return jsonResponse(200, { ok: true, action, customer_page: data });
    }

    if (action === "update_page_settings") {
      const customerPageId = requireString(body, "customer_page_id");
      const pageSettings = await getOrCreatePageSettings(serviceClient, customerPageId);

      const payload = {
        title: typeof body.title === "string" ? body.title : pageSettings.title,
        intro_text: typeof body.intro_text === "string" ? body.intro_text : pageSettings.intro_text,
        labels_json: body.labels_json && typeof body.labels_json === "object" ? body.labels_json : pageSettings.labels_json,
        options_json: body.options_json && typeof body.options_json === "object" ? body.options_json : pageSettings.options_json,
        visibility_json: body.visibility_json && typeof body.visibility_json === "object" ? body.visibility_json : pageSettings.visibility_json,
        content_json: body.content_json && typeof body.content_json === "object" ? body.content_json : pageSettings.content_json,
      };

      const { data, error } = await serviceClient.from("core_page_settings").update(payload).eq("customer_page_id", customerPageId).select("*").single();
      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_page_settings", pageSettings.page_settings_id, body, {
        customer_page_id: customerPageId,
        page_settings_id: pageSettings.page_settings_id,
      });

      return jsonResponse(200, { ok: true, action, page_settings: data });
    }

    if (action === "get_active_style_profile") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      return jsonResponse(200, { ok: true, action, style_profile: styleProfile });
    }

    if (action === "list_customer_style_profiles") {
      const customerId = requireString(body, "customer_id");
      const { data, error } = await serviceClient.from("core_customer_style_profiles").select("*").eq("customer_id", customerId).order("created_at", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, style_profiles: data || [] });
    }

    if (action === "update_active_style_profile") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const updatePayload = buildStyleUpdatePayload(body);

      await writeStyleHistory(serviceClient, actorEmail, "before_save", styleProfile, typeof body.note === "string" ? body.note : null);

      const { data: updated, error: updateError } = await serviceClient
        .from("core_customer_style_profiles")
        .update(updatePayload)
        .eq("style_profile_id", styleProfile.style_profile_id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      await writeStyleHistory(serviceClient, actorEmail, "after_save", updated, typeof body.note === "string" ? body.note : null);

      await serviceClient.from("core_audit_log").insert({
        actor_email: actorEmail,
        actor_role: "platform_admin",
        action,
        target_type: "core_customer_style_profiles",
        target_id: styleProfile.style_profile_id,
        before_json: styleProfile,
        after_json: updated,
        request_json: body,
        result_json: { customer_id: customerId, style_profile_id: styleProfile.style_profile_id },
      });

      return jsonResponse(200, { ok: true, action, style_profile: updated });
    }

    if (action === "save_design_profile") {
      const customerId = requireString(body, "customer_id");
      const profileName = requireString(body, "profile_name");
      const sourceProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      const stylePayload = buildStyleUpdatePayload(body);

      const insertPayload = {
        customer_id: customerId,
        profile_name: profileName,
        colors_json: stylePayload.colors_json || sourceProfile.colors_json || {},
        typography_json: stylePayload.typography_json || sourceProfile.typography_json || {},
        spacing_json: stylePayload.spacing_json || sourceProfile.spacing_json || {},
        layout_json: stylePayload.layout_json || sourceProfile.layout_json || {},
        effects_json: stylePayload.effects_json || sourceProfile.effects_json || {},
        media_json: stylePayload.media_json || sourceProfile.media_json || {},
        component_json: stylePayload.component_json || sourceProfile.component_json || {},
        preview_json: stylePayload.preview_json || sourceProfile.preview_json || {},
        density: typeof stylePayload.density === "string" ? stylePayload.density : sourceProfile.density || "normal",
        card_style: typeof stylePayload.card_style === "string" ? stylePayload.card_style : sourceProfile.card_style || "standard",
        hero_style: typeof stylePayload.hero_style === "string" ? stylePayload.hero_style : sourceProfile.hero_style || "standard",
        preset_key: normalizeKey(profileName),
        preset_source: "customer_saved",
        logo_asset_id: sourceProfile.logo_asset_id || null,
        is_active: false,
      };

      const { data: savedProfile, error: saveError } = await serviceClient
        .from("core_customer_style_profiles")
        .insert(insertPayload)
        .select("*")
        .single();

      if (saveError) throw saveError;

      await writeStyleHistory(serviceClient, actorEmail, "saved_profile_created", savedProfile, typeof body.note === "string" ? body.note : "Saved as new design profile");

      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", savedProfile.style_profile_id, body, {
        customer_id: customerId,
        style_profile_id: savedProfile.style_profile_id,
        preset_key: savedProfile.preset_key,
      });

      return jsonResponse(200, { ok: true, action, saved_profile: savedProfile });
    }

    if (action === "apply_saved_design_profile") {
      const customerId = requireString(body, "customer_id");
      const sourceStyleProfileId = requireString(body, "source_style_profile_id");
      const activeProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      const { data: sourceProfile, error: sourceError } = await serviceClient
        .from("core_customer_style_profiles")
        .select("*")
        .eq("customer_id", customerId)
        .eq("style_profile_id", sourceStyleProfileId)
        .maybeSingle();

      if (sourceError) throw sourceError;
      if (!sourceProfile) throw new Error("Saved design profile not found for this customer.");

      await writeStyleHistory(serviceClient, actorEmail, "before_apply_saved_profile", activeProfile, `Before applying saved profile: ${sourceProfile.profile_name}`);

      const updatePayload = {
        profile_name: sourceProfile.profile_name,
        colors_json: sourceProfile.colors_json || {},
        typography_json: sourceProfile.typography_json || {},
        spacing_json: sourceProfile.spacing_json || {},
        layout_json: sourceProfile.layout_json || {},
        effects_json: sourceProfile.effects_json || {},
        media_json: sourceProfile.media_json || {},
        component_json: sourceProfile.component_json || {},
        preview_json: sourceProfile.preview_json || {},
        density: sourceProfile.density || "normal",
        card_style: sourceProfile.card_style || "standard",
        hero_style: sourceProfile.hero_style || "standard",
        preset_key: sourceProfile.preset_key || normalizeKey(sourceProfile.profile_name),
        preset_source: sourceProfile.preset_source || "customer_saved",
        logo_asset_id: sourceProfile.logo_asset_id || null,
      };

      const { data: updated, error: updateError } = await serviceClient
        .from("core_customer_style_profiles")
        .update(updatePayload)
        .eq("style_profile_id", activeProfile.style_profile_id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      await writeStyleHistory(serviceClient, actorEmail, "after_apply_saved_profile", updated, `Applied saved profile: ${sourceProfile.profile_name}`);

      return jsonResponse(200, { ok: true, action, style_profile: updated, source_profile: sourceProfile });
    }

    if (action === "list_style_profile_history") {
      const customerId = requireString(body, "customer_id");

      const { data, error } = await serviceClient
        .from("core_customer_style_profile_history")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(Number(body.limit)) ? Number(body.limit) : 10);

      if (error) throw error;

      return jsonResponse(200, { ok: true, action, history: data || [] });
    }

    if (action === "restore_style_profile_snapshot") {
      const customerId = requireString(body, "customer_id");
      const historyId = requireString(body, "history_id");
      const activeProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      const { data: historyRow, error: historyError } = await serviceClient
        .from("core_customer_style_profile_history")
        .select("*")
        .eq("customer_id", customerId)
        .eq("history_id", historyId)
        .maybeSingle();

      if (historyError) throw historyError;
      if (!historyRow) throw new Error("History snapshot not found for this customer.");

      const snapshot = historyRow.snapshot_json || {};

      await writeStyleHistory(serviceClient, actorEmail, "before_restore", activeProfile, `Before restoring history ${historyId}`);

      const updatePayload = {
        profile_name: snapshot.profile_name || "Restored Style",
        colors_json: snapshot.colors_json || {},
        typography_json: snapshot.typography_json || {},
        spacing_json: snapshot.spacing_json || {},
        layout_json: snapshot.layout_json || {},
        effects_json: snapshot.effects_json || {},
        media_json: snapshot.media_json || {},
        component_json: snapshot.component_json || {},
        preview_json: snapshot.preview_json || {},
        density: snapshot.density || "normal",
        card_style: snapshot.card_style || "standard",
        hero_style: snapshot.hero_style || "standard",
        preset_key: snapshot.preset_key || null,
        preset_source: snapshot.preset_source || "restored",
        logo_asset_id: snapshot.logo_asset_id || null,
      };

      const { data: restored, error: restoreError } = await serviceClient
        .from("core_customer_style_profiles")
        .update(updatePayload)
        .eq("style_profile_id", activeProfile.style_profile_id)
        .select("*")
        .single();

      if (restoreError) throw restoreError;

      await writeStyleHistory(serviceClient, actorEmail, "after_restore", restored, `Restored from history ${historyId}`);

      return jsonResponse(200, { ok: true, action, style_profile: restored, restored_from: historyRow });
    }


    if (action === "list_customer_assets") {
      const customerId = requireString(body, "customer_id");
      const assetType = typeof body.asset_type === "string" && body.asset_type.trim() ? body.asset_type.trim() : null;

      let query = serviceClient
        .from("core_assets")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (assetType) query = query.eq("asset_type", assetType);

      const { data, error } = await query;
      if (error) throw error;

      return jsonResponse(200, { ok: true, action, assets: data || [] });
    }

    if (action === "create_customer_asset") {
      const customerId = requireString(body, "customer_id");
      const assetType = typeof body.asset_type === "string" && body.asset_type.trim() ? body.asset_type.trim() : "general";
      const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
      const storagePath = typeof body.storage_path === "string" && body.storage_path.trim() ? body.storage_path.trim() : null;

      if (!url && !storagePath) throw new Error("Either url or storage_path is required.");

      const payload = {
        customer_id: customerId,
        asset_type: assetType,
        url,
        storage_path: storagePath,
        alt_text: typeof body.alt_text === "string" ? body.alt_text.trim() || null : null,
        mime_type: typeof body.mime_type === "string" ? body.mime_type.trim() || null : null,
        file_size_bytes: Number.isFinite(Number(body.file_size_bytes)) ? Number(body.file_size_bytes) : null,
        status: typeof body.status === "string" && body.status.trim() ? body.status.trim() : "active",
      };

      const { data: asset, error } = await serviceClient
        .from("core_assets")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_assets", asset.asset_id, body, {
        customer_id: customerId,
        asset_id: asset.asset_id,
        asset_type: asset.asset_type,
      });

      return jsonResponse(200, { ok: true, action, asset });
    }

    if (action === "archive_customer_asset") {
      const customerId = requireString(body, "customer_id");
      const assetId = requireString(body, "asset_id");

      const { data: asset, error } = await serviceClient
        .from("core_assets")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .eq("asset_id", assetId)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_assets", assetId, body, {
        customer_id: customerId,
        asset_id: assetId,
        status: "archived",
      });

      return jsonResponse(200, { ok: true, action, asset });
    }


    if (action === "restore_customer_asset") {
      const customerId = requireString(body, "customer_id");
      const assetId = requireString(body, "asset_id");

      const { data: asset, error } = await serviceClient
        .from("core_assets")
        .update({ status: "active", archived_at: null })
        .eq("customer_id", customerId)
        .eq("asset_id", assetId)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_assets", assetId, body, {
        customer_id: customerId,
        asset_id: assetId,
        status: "active",
      });

      return jsonResponse(200, { ok: true, action, asset });
    }

    if (action === "set_active_logo_asset") {
      const customerId = requireString(body, "customer_id");
      const assetId = requireString(body, "asset_id");

      const { data: asset, error: assetError } = await serviceClient
        .from("core_assets")
        .select("*")
        .eq("customer_id", customerId)
        .eq("asset_id", assetId)
        .neq("status", "archived")
        .maybeSingle();

      if (assetError) throw assetError;
      if (!asset) throw new Error("Logo asset not found for this customer.");

      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      await writeStyleHistory(serviceClient, actorEmail, "before_logo_change", styleProfile, "Before changing active logo asset");

      const { data: updatedStyleProfile, error: updateError } = await serviceClient
        .from("core_customer_style_profiles")
        .update({ logo_asset_id: assetId })
        .eq("style_profile_id", styleProfile.style_profile_id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      await writeStyleHistory(serviceClient, actorEmail, "after_logo_change", updatedStyleProfile, "After changing active logo asset");

      await writeAudit(serviceClient, actorEmail, action, "core_customer_style_profiles", styleProfile.style_profile_id, body, {
        customer_id: customerId,
        style_profile_id: styleProfile.style_profile_id,
        logo_asset_id: assetId,
      });

      return jsonResponse(200, { ok: true, action, style_profile: updatedStyleProfile, logo_asset: asset });
    }

    if (action === "clear_active_logo_asset") {
      const customerId = requireString(body, "customer_id");

      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);
      await writeStyleHistory(serviceClient, actorEmail, "before_logo_clear", styleProfile, "Before clearing active logo asset");

      const { data: updatedStyleProfile, error: updateError } = await serviceClient
        .from("core_customer_style_profiles")
        .update({ logo_asset_id: null })
        .eq("style_profile_id", styleProfile.style_profile_id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      await writeStyleHistory(serviceClient, actorEmail, "after_logo_clear", updatedStyleProfile, "After clearing active logo asset");

      return jsonResponse(200, { ok: true, action, style_profile: updatedStyleProfile });
    }

    if (action === "get_active_customer_logo") {
      const customerId = requireString(body, "customer_id");
      const styleProfile = await getOrCreateActiveStyleProfile(serviceClient, customerId);

      let logoAsset = null;
      if (styleProfile.logo_asset_id) {
        const { data, error } = await serviceClient
          .from("core_assets")
          .select("*")
          .eq("asset_id", styleProfile.logo_asset_id)
          .maybeSingle();

        if (error) throw error;
        logoAsset = data || null;
      }

      return jsonResponse(200, { ok: true, action, style_profile: styleProfile, logo_asset: logoAsset });
    }

    return jsonResponse(400, { ok: false, error: "unknown_action", message: `Unknown action: ${action || "(blank)"}` });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "action_failed",
      action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// SB-EDGE-core-admin-action-v9.ts END
