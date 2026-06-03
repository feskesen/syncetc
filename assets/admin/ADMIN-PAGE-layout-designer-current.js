// ADMIN-PAGE-layout-designer-current.js
// Internal Version: 2026-06-03-001
// Purpose: Layout Designer v1 for customer-wide style profile selection and preview.
// Uses core_customer_style_profiles through core-admin-action Edge Function.
// Backend diagnostics include Copy result button.

(function () {
  "use strict";

  const VERSION = "2026-06-03-001";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const ROOT_ID = "syncetc-layout-designer-root";

  let supabaseClient = null;
  let customers = [];
  let selectedCustomerId = "";
  let activeStyleProfile = null;

  const PRESETS = {
    "clean-blue": {
      label: "Clean Blue",
      colors_json: {
        brand_primary: "#1f4f82",
        brand_secondary: "#eef3f8",
        surface: "#ffffff",
        text: "#172033"
      },
      typography_json: {
        font_family: "system",
        heading_scale: "normal",
        body_scale: "normal"
      },
      spacing_json: {
        page_width: "normal",
        section_spacing: "normal",
        card_padding: "normal"
      },
      density: "normal",
      card_style: "standard",
      hero_style: "standard"
    },
    "ops-slate": {
      label: "Ops Slate",
      colors_json: {
        brand_primary: "#24324a",
        brand_secondary: "#e8edf4",
        surface: "#ffffff",
        text: "#111827"
      },
      typography_json: {
        font_family: "system",
        heading_scale: "compact",
        body_scale: "normal"
      },
      spacing_json: {
        page_width: "wide",
        section_spacing: "compact",
        card_padding: "compact"
      },
      density: "compact",
      card_style: "panel",
      hero_style: "dashboard"
    },
    "field-green": {
      label: "Field Green",
      colors_json: {
        brand_primary: "#265c2b",
        brand_secondary: "#edf7ed",
        surface: "#ffffff",
        text: "#142417"
      },
      typography_json: {
        font_family: "system",
        heading_scale: "normal",
        body_scale: "normal"
      },
      spacing_json: {
        page_width: "wide",
        section_spacing: "normal",
        card_padding: "normal"
      },
      density: "normal",
      card_style: "soft",
      hero_style: "bold"
    }
  };

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(message) {
    const el = document.getElementById("se-status");
    if (el) el.textContent = message;
  }

  function setOutput(value) {
    const el = document.getElementById("se-output");
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  async function copyOutput() {
    const el = document.getElementById("se-output");
    const text = el ? el.textContent || "" : "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Backend result copied to clipboard.");
    } catch {
      setStatus("Copy failed. Select the backend result manually.");
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    await loadScript(SUPABASE_JS_URL);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase JS did not load correctly.");

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;

    const { data } = await supabaseClient.auth.getSession();
    if (data?.session?.user?.email) {
      setStatus(`Logged in as ${data.session.user.email}`);
      await loadCustomers();
    } else {
      setStatus("No active login session. Log in first.");
    }
  }

  async function getAccessToken() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("No active Supabase Auth session. Log in first.");
    return token;
  }

  async function callCoreAdminAction(action, payload = {}) {
    const token = await getAccessToken();

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ action, ...payload })
    });

    let result;
    try {
      result = await response.json();
    } catch {
      result = { ok: false, error: "non_json_response", status: response.status, text: await response.text() };
    }

    setOutput({ http_status: response.status, result });

    if (!response.ok || result.ok === false) {
      const message = result.message || result.error || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return result;
  }

  function getFormPayload() {
    const colors_json = {
      brand_primary: document.getElementById("se-brand-primary")?.value || "#1f4f82",
      brand_secondary: document.getElementById("se-brand-secondary")?.value || "#eef3f8",
      surface: document.getElementById("se-surface")?.value || "#ffffff",
      text: document.getElementById("se-text")?.value || "#172033"
    };

    const typography_json = {
      font_family: document.getElementById("se-font-family")?.value || "system",
      heading_scale: document.getElementById("se-heading-scale")?.value || "normal",
      body_scale: document.getElementById("se-body-scale")?.value || "normal"
    };

    const spacing_json = {
      page_width: document.getElementById("se-page-width")?.value || "normal",
      section_spacing: document.getElementById("se-section-spacing")?.value || "normal",
      card_padding: document.getElementById("se-card-padding")?.value || "normal"
    };

    return {
      profile_name: document.getElementById("se-profile-name")?.value || "Default",
      colors_json,
      typography_json,
      spacing_json,
      density: document.getElementById("se-density")?.value || "normal",
      card_style: document.getElementById("se-card-style")?.value || "standard",
      hero_style: document.getElementById("se-hero-style")?.value || "standard"
    };
  }

  function applyPayloadToForm(profile) {
    const colors = profile?.colors_json || {};
    const typography = profile?.typography_json || {};
    const spacing = profile?.spacing_json || {};

    document.getElementById("se-profile-name").value = profile?.profile_name || "Default";
    document.getElementById("se-brand-primary").value = colors.brand_primary || "#1f4f82";
    document.getElementById("se-brand-secondary").value = colors.brand_secondary || "#eef3f8";
    document.getElementById("se-surface").value = colors.surface || "#ffffff";
    document.getElementById("se-text").value = colors.text || "#172033";
    document.getElementById("se-font-family").value = typography.font_family || "system";
    document.getElementById("se-heading-scale").value = typography.heading_scale || "normal";
    document.getElementById("se-body-scale").value = typography.body_scale || "normal";
    document.getElementById("se-page-width").value = spacing.page_width || "normal";
    document.getElementById("se-section-spacing").value = spacing.section_spacing || "normal";
    document.getElementById("se-card-padding").value = spacing.card_padding || "normal";
    document.getElementById("se-density").value = profile?.density || "normal";
    document.getElementById("se-card-style").value = profile?.card_style || "standard";
    document.getElementById("se-hero-style").value = profile?.hero_style || "standard";

    renderPreview();
  }

  function renderPreview() {
    const payload = getFormPayload();
    const colors = payload.colors_json;
    const spacing = payload.spacing_json;
    const typography = payload.typography_json;

    const width = spacing.page_width === "wide" ? "100%" : spacing.page_width === "narrow" ? "760px" : "960px";
    const padding = spacing.card_padding === "compact" ? "14px" : spacing.card_padding === "generous" ? "28px" : "20px";
    const heroPadding = payload.hero_style === "bold" ? "32px" : payload.hero_style === "dashboard" ? "18px" : "24px";
    const radius = payload.card_style === "sharp" ? "4px" : payload.card_style === "soft" ? "18px" : "12px";
    const headingSize = typography.heading_scale === "compact" ? "24px" : typography.heading_scale === "large" ? "34px" : "29px";

    const preview = document.getElementById("se-preview");
    if (!preview) return;

    preview.innerHTML = `
      <div style="max-width:${width};margin:0 auto;">
        <div style="border:1px solid #d9e0ea;border-radius:${radius};background:${colors.surface};padding:${padding};color:${colors.text};">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid ${colors.brand_secondary};padding-bottom:14px;margin-bottom:14px;">
            <div style="font-weight:900;color:${colors.brand_primary};">SyncEtc Preview</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Home</span>
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Aircraft</span>
              <span style="border:1px solid ${colors.brand_primary};border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:${colors.brand_primary};">Calendar</span>
            </div>
          </div>
          <div style="background:${colors.brand_primary};color:white;border-radius:${radius};padding:${heroPadding};margin-bottom:14px;">
            <div style="display:inline-block;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;margin-bottom:10px;">HERO EYEBROW</div>
            <h2 style="margin:0 0 8px 0;font-size:${headingSize};line-height:1.1;">Customer Page Title</h2>
            <p style="margin:0;line-height:1.5;">This preview shows how customer-wide style choices affect shared page structure.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            <div style="border:1px solid ${colors.brand_secondary};border-radius:${radius};padding:${padding};"><strong>Card one</strong><br><span style="font-size:13px;">Surface, spacing, borders.</span></div>
            <div style="border:1px solid ${colors.brand_secondary};border-radius:${radius};padding:${padding};"><strong>Card two</strong><br><span style="font-size:13px;">Typography and density.</span></div>
            <div style="border:1px solid ${colors.brand_secondary};border-radius:${radius};padding:${padding};"><strong>Card three</strong><br><span style="font-size:13px;">Reusable render blocks.</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderShell() {
    ensureRoot().innerHTML = `
      <style>
        #${ROOT_ID} {
          font-family: Arial, Helvetica, sans-serif;
          color: #172033;
          background: #f5f7fb;
          min-height: 100vh;
          padding: 28px 18px;
          box-sizing: border-box;
        }
        #${ROOT_ID} * { box-sizing: border-box; }
        .se-wrap { max-width: 1180px; margin: 0 auto; }
        .se-card {
          background: #ffffff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23, 32, 51, 0.08);
          padding: 22px;
          margin-bottom: 18px;
        }
        .se-title { margin: 0 0 6px 0; font-size: 28px; line-height: 1.15; letter-spacing: -0.02em; }
        .se-subtitle { margin: 0; color: #5d6b82; font-size: 15px; line-height: 1.45; }
        .se-badge { display:inline-flex;border-radius:999px;background:#e9f1fb;color:#1f4f82;font-size:12px;font-weight:700;padding:6px 10px;margin-top:10px; }
        .se-grid { display:grid;grid-template-columns:380px 1fr;gap:18px;align-items:start; }
        .se-field { display:flex;flex-direction:column;gap:6px;margin-bottom:12px; }
        .se-label { font-size:13px;font-weight:800;color:#26344d; }
        .se-input,.se-select { width:100%;border:1px solid #c7d2e2;border-radius:10px;padding:10px 11px;font-size:14px;background:#fff;color:#172033; }
        .se-actions { display:flex;flex-wrap:wrap;gap:10px;margin-top:14px; }
        .se-button { border:1px solid #1f4f82;background:#1f4f82;color:#fff;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer; }
        .se-button.secondary { background:#fff;color:#1f4f82; }
        .se-status { margin-top:12px;padding:12px;border-radius:10px;background:#eef3f8;border:1px solid #d6e0ec;color:#26344d;font-size:14px;white-space:pre-wrap; }
        .se-output { margin-top:14px;background:#101827;color:#e7edf6;border-radius:12px;padding:14px;overflow:auto;min-height:100px;max-height:320px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.45; }
        .se-section-title { margin:18px 0 10px 0;font-size:16px;font-weight:900;color:#1f2a44;border-top:1px solid #e3e9f2;padding-top:14px; }
        @media (max-width: 900px) { .se-grid { grid-template-columns:1fr; } }
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">Layout Designer</h1>
          <p class="se-subtitle">Customer-wide style profile controls. These are bounded choices intended for reusable generated pages.</p>
          <div class="se-badge">ADMIN-PAGE-layout-designer-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <h2 class="se-title" style="font-size:22px;">Platform Admin Login</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;">
            <label class="se-field"><span class="se-label">Email</span><input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username"></label>
            <label class="se-field"><span class="se-label">Password</span><input id="se-password" class="se-input" type="password" autocomplete="current-password"></label>
          </div>
          <div class="se-actions">
            <button id="se-login" class="se-button">Log in</button>
            <button id="se-logout" class="se-button secondary">Log out</button>
            <button id="se-refresh" class="se-button secondary">Refresh</button>
          </div>
          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>

        <section class="se-grid">
          <div>
            <section class="se-card">
              <h2 class="se-title" style="font-size:22px;">Style Controls</h2>

              <label class="se-field">
                <span class="se-label">Customer</span>
                <select id="se-customer-select" class="se-select"><option value="">Log in and load customers...</option></select>
              </label>

              <label class="se-field">
                <span class="se-label">Apply preset</span>
                <select id="se-preset" class="se-select">
                  <option value="">Choose preset...</option>
                  ${Object.entries(PRESETS).map(([key, preset]) => `<option value="${escapeHtml(key)}">${escapeHtml(preset.label)}</option>`).join("")}
                </select>
              </label>

              <div class="se-section-title">Profile</div>
              <label class="se-field"><span class="se-label">Profile Name</span><input id="se-profile-name" class="se-input" type="text" value="Default"></label>

              <div class="se-section-title">Colors</div>
              <label class="se-field"><span class="se-label">Brand Primary</span><input id="se-brand-primary" class="se-input" type="text" value="#1f4f82"></label>
              <label class="se-field"><span class="se-label">Brand Secondary</span><input id="se-brand-secondary" class="se-input" type="text" value="#eef3f8"></label>
              <label class="se-field"><span class="se-label">Surface</span><input id="se-surface" class="se-input" type="text" value="#ffffff"></label>
              <label class="se-field"><span class="se-label">Text</span><input id="se-text" class="se-input" type="text" value="#172033"></label>

              <div class="se-section-title">Typography</div>
              <label class="se-field"><span class="se-label">Font Family</span><select id="se-font-family" class="se-select"><option value="system">system</option></select></label>
              <label class="se-field"><span class="se-label">Heading Scale</span><select id="se-heading-scale" class="se-select"><option value="compact">compact</option><option value="normal">normal</option><option value="large">large</option></select></label>
              <label class="se-field"><span class="se-label">Body Scale</span><select id="se-body-scale" class="se-select"><option value="compact">compact</option><option value="normal">normal</option><option value="large">large</option></select></label>

              <div class="se-section-title">Layout</div>
              <label class="se-field"><span class="se-label">Page Width</span><select id="se-page-width" class="se-select"><option value="narrow">narrow</option><option value="normal">normal</option><option value="wide">wide</option></select></label>
              <label class="se-field"><span class="se-label">Section Spacing</span><select id="se-section-spacing" class="se-select"><option value="compact">compact</option><option value="normal">normal</option><option value="generous">generous</option></select></label>
              <label class="se-field"><span class="se-label">Card Padding</span><select id="se-card-padding" class="se-select"><option value="compact">compact</option><option value="normal">normal</option><option value="generous">generous</option></select></label>
              <label class="se-field"><span class="se-label">Density</span><select id="se-density" class="se-select"><option value="compact">compact</option><option value="normal">normal</option><option value="comfortable">comfortable</option></select></label>
              <label class="se-field"><span class="se-label">Card Style</span><select id="se-card-style" class="se-select"><option value="standard">standard</option><option value="soft">soft</option><option value="panel">panel</option><option value="sharp">sharp</option></select></label>
              <label class="se-field"><span class="se-label">Hero Style</span><select id="se-hero-style" class="se-select"><option value="standard">standard</option><option value="bold">bold</option><option value="dashboard">dashboard</option></select></label>

              <div class="se-actions">
                <button id="se-save" class="se-button">Save to customer</button>
                <button id="se-preview-refresh" class="se-button secondary">Refresh preview</button>
              </div>
            </section>

            <section class="se-card">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                <h2 class="se-title" style="font-size:22px;">Last Backend Result</h2>
                <button id="se-copy-output" class="se-button secondary">Copy result</button>
              </div>
              <pre id="se-output" class="se-output">{}</pre>
            </section>
          </div>

          <section class="se-card">
            <h2 class="se-title" style="font-size:22px;">Preview</h2>
            <p class="se-subtitle">Immediate approximation of the active customer-wide style profile.</p>
            <div id="se-preview" style="margin-top:16px;"></div>
          </section>
        </section>
      </main>
    `;
  }

  function renderCustomerSelect() {
    const select = document.getElementById("se-customer-select");
    if (!select) return;

    if (!customers.length) {
      select.innerHTML = `<option value="">No customers found</option>`;
      return;
    }

    select.innerHTML = `<option value="">Select customer...</option>` + customers.map((customer) => `
      <option value="${escapeHtml(customer.customer_id)}" ${customer.customer_id === selectedCustomerId ? "selected" : ""}>
        ${escapeHtml(customer.display_name)} (${escapeHtml(customer.customer_key)})
      </option>
    `).join("");
  }

  async function loadCustomers() {
    setStatus("Loading customers...");
    const result = await callCoreAdminAction("list_customers");
    customers = Array.isArray(result.customers) ? result.customers : [];

    if (!selectedCustomerId && customers.length) selectedCustomerId = customers[0].customer_id;

    renderCustomerSelect();

    if (selectedCustomerId) await loadActiveStyleProfile();

    setStatus("Customers loaded.");
  }

  async function loadActiveStyleProfile() {
    if (!selectedCustomerId) return;
    setStatus("Loading active style profile...");
    const result = await callCoreAdminAction("get_active_style_profile", { customer_id: selectedCustomerId });
    activeStyleProfile = result.style_profile;
    applyPayloadToForm(activeStyleProfile);
    setStatus("Active style profile loaded.");
  }

  async function saveStyleProfile() {
    if (!selectedCustomerId) {
      setStatus("Select a customer first.");
      return;
    }

    const payload = getFormPayload();
    setStatus("Saving style profile...");

    const result = await callCoreAdminAction("update_active_style_profile", {
      customer_id: selectedCustomerId,
      ...payload
    });

    activeStyleProfile = result.style_profile;
    applyPayloadToForm(activeStyleProfile);
    setStatus("Style profile saved.");
  }

  function bindEvents() {
    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("se-email")?.value || "";
        const password = document.getElementById("se-password")?.value || "";
        setStatus("Logging in...");
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatus(`Logged in as ${data?.user?.email || email}`);
        await loadCustomers();
      } catch (error) {
        setStatus("Login failed.");
        setOutput({ ok: false, event: "login_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        customers = [];
        selectedCustomerId = "";
        activeStyleProfile = null;
        renderCustomerSelect();
        setStatus("Logged out.");
      } catch (error) {
        setOutput({ ok: false, event: "logout_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-refresh")?.addEventListener("click", async () => {
      try { await loadCustomers(); }
      catch (error) {
        setStatus("Refresh failed.");
        setOutput({ ok: false, event: "refresh_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-customer-select")?.addEventListener("change", async (event) => {
      try {
        selectedCustomerId = event.target.value || "";
        if (selectedCustomerId) await loadActiveStyleProfile();
      } catch (error) {
        setStatus("Style profile load failed.");
        setOutput({ ok: false, event: "style_profile_load_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-preset")?.addEventListener("change", (event) => {
      const preset = PRESETS[event.target.value];
      if (!preset) return;
      applyPayloadToForm({
        profile_name: preset.label,
        colors_json: preset.colors_json,
        typography_json: preset.typography_json,
        spacing_json: preset.spacing_json,
        density: preset.density,
        card_style: preset.card_style,
        hero_style: preset.hero_style
      });
    });

    document.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", renderPreview);
      el.addEventListener("change", renderPreview);
    });

    document.getElementById("se-save")?.addEventListener("click", async () => {
      try { await saveStyleProfile(); }
      catch (error) {
        setStatus("Save failed.");
        setOutput({ ok: false, event: "save_failed", message: error instanceof Error ? error.message : String(error) });
      }
    });

    document.getElementById("se-preview-refresh")?.addEventListener("click", renderPreview);
    document.getElementById("se-copy-output")?.addEventListener("click", copyOutput);
  }

  async function boot() {
    renderShell();
    bindEvents();
    renderPreview();

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.");
      setOutput({ ok: false, event: "supabase_init_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

// ADMIN-PAGE-layout-designer-current.js END
