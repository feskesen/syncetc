// SB-EDGE-core-admin-action-v1.ts
// Internal Version: 2026-06-03-001
// Purpose: Controlled admin backend for early SyncEtc Customer Builder and platform-admin operations.
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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
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
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string: ${key}`);
  }
  return value.trim();
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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "method_not_allowed",
      message: "Use POST.",
    });
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
    return jsonResponse(401, {
      ok: false,
      error: "missing_auth",
      message: "Missing Authorization bearer token.",
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);

  if (authError || !authData?.user?.email) {
    return jsonResponse(401, {
      ok: false,
      error: "invalid_auth",
      message: "Could not verify authenticated user.",
    });
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
    return jsonResponse(500, {
      ok: false,
      error: "admin_lookup_failed",
      message: adminError.message,
    });
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
    return jsonResponse(400, {
      ok: false,
      error: "invalid_json",
      message: "Request body must be valid JSON.",
    });
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

      return jsonResponse(200, {
        ok: true,
        action,
        customers: data || [],
      });
    }

    if (action === "get_customer") {
      const customerId = requireString(body, "customer_id");

      const { data, error } = await serviceClient
        .from("core_customers")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;

      return jsonResponse(200, {
        ok: true,
        action,
        customer: data,
      });
    }

    if (action === "create_customer") {
      const displayName = requireString(body, "display_name");
      const proposedKey = normalizeKey(String(body.customer_key || displayName));

      if (!proposedKey) {
        return jsonResponse(400, {
          ok: false,
          error: "invalid_customer_key",
          message: "Customer key could not be generated.",
        });
      }

      const payload = {
        customer_key: proposedKey,
        legal_name: typeof body.legal_name === "string" ? body.legal_name.trim() || null : null,
        display_name: displayName,
        customer_type: typeof body.customer_type === "string" && body.customer_type.trim()
          ? body.customer_type.trim()
          : "generic",
        vertical: typeof body.vertical === "string" && body.vertical.trim()
          ? body.vertical.trim()
          : "generic",
        status: typeof body.status === "string" && body.status.trim()
          ? body.status.trim()
          : "draft",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      };

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      const { error: styleError } = await serviceClient
        .from("core_customer_style_profiles")
        .insert({
          customer_id: customer.customer_id,
          profile_name: "Default",
          colors_json: {},
          typography_json: {},
          spacing_json: {},
          density: "normal",
          card_style: "standard",
          hero_style: "standard",
          is_active: true,
        });

      if (styleError) throw styleError;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customer.customer_id, body, {
        customer_id: customer.customer_id,
        customer_key: customer.customer_key,
      });

      return jsonResponse(200, {
        ok: true,
        action,
        customer,
      });
    }

    if (action === "update_customer") {
      const customerId = requireString(body, "customer_id");

      const allowedFields = [
        "legal_name",
        "display_name",
        "customer_type",
        "vertical",
        "status",
        "notes",
      ];

      const updatePayload: JsonRecord = {};

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updatePayload[field] = body[field];
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        return jsonResponse(400, {
          ok: false,
          error: "no_update_fields",
          message: "No allowed update fields were provided.",
        });
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

      return jsonResponse(200, {
        ok: true,
        action,
        customer,
      });
    }

    if (action === "archive_customer") {
      const customerId = requireString(body, "customer_id");

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, {
        customer_id: customerId,
        status: "archived",
      });

      return jsonResponse(200, {
        ok: true,
        action,
        customer,
      });
    }

    if (action === "recover_customer") {
      const customerId = requireString(body, "customer_id");

      const { data: customer, error } = await serviceClient
        .from("core_customers")
        .update({
          status: "draft",
          archived_at: null,
        })
        .eq("customer_id", customerId)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(serviceClient, actorEmail, action, "core_customers", customerId, body, {
        customer_id: customerId,
        status: "draft",
      });

      return jsonResponse(200, {
        ok: true,
        action,
        customer,
      });
    }

    if (action === "list_templates") {
      const { data, error } = await serviceClient
        .from("core_template_registry")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return jsonResponse(200, {
        ok: true,
        action,
        templates: data || [],
      });
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

// SB-EDGE-core-admin-action-v1.ts END
