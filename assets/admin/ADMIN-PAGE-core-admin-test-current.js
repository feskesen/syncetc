// ADMIN-PAGE-core-admin-test-current.js
// Internal Version: 2026-06-04-002
// Purpose: First frontend test harness for Supabase Auth + core-admin-action Edge Function.
// Live filename is stable. Track versions internally, in Git history, and in local saved copies.

(function () {
  "use strict";

  const VERSION = "2026-06-04-002";
  const SUPABASE_URL = "https://bxywokidhgppmlzyqvem.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";
  const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/core-admin-action`;

  const ROOT_ID = "syncetc-admin-test-root";
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabaseClient = null;
  let isAuthenticated = false;
  let authenticatedEmail = "";

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

  function renderShell() {
    const root = ensureRoot();

    root.innerHTML = `
      <style>
        #${ROOT_ID} {
          font-family: Arial, Helvetica, sans-serif;
          color: #172033;
          background: #f5f7fb;
          min-height: 100vh;
          padding: 32px 18px;
          box-sizing: border-box;
        }

        #${ROOT_ID} * {
          box-sizing: border-box;
        }

        .se-wrap {
          max-width: 980px;
          margin: 0 auto;
        }

        .se-card {
          background: #ffffff;
          border: 1px solid #d9e0ea;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(23, 32, 51, 0.08);
          padding: 22px;
          margin-bottom: 18px;
        }

        .se-title {
          margin: 0 0 6px 0;
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: -0.02em;
        }

        .se-subtitle {
          margin: 0;
          color: #5d6b82;
          font-size: 15px;
          line-height: 1.45;
        }

        .se-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 18px;
        }

        .se-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .se-label {
          font-size: 13px;
          font-weight: 700;
          color: #26344d;
        }

        .se-input {
          width: 100%;
          border: 1px solid #c7d2e2;
          border-radius: 10px;
          padding: 11px 12px;
          font-size: 15px;
          background: #ffffff;
          color: #172033;
        }

        .se-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }

        .se-button {
          border: 1px solid #1f4f82;
          background: #1f4f82;
          color: #ffffff;
          border-radius: 999px;
          padding: 10px 15px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .se-button.secondary {
          background: #ffffff;
          color: #1f4f82;
        }

        .se-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .se-status {
          margin-top: 12px;
          padding: 12px;
          border-radius: 10px;
          background: #eef3f8;
          border: 1px solid #d6e0ec;
          color: #26344d;
          font-size: 14px;
          white-space: pre-wrap;
        }

        .se-output {
          margin-top: 14px;
          background: #101827;
          color: #e7edf6;
          border-radius: 12px;
          padding: 14px;
          overflow: auto;
          min-height: 120px;
          max-height: 420px;
          font-family: Consolas, Monaco, monospace;
          font-size: 13px;
          line-height: 1.45;
        }

        .se-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          background: #e9f1fb;
          color: #1f4f82;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 10px;
          margin-top: 10px;
        }

        @media (max-width: 720px) {
          .se-grid {
            grid-template-columns: 1fr;
          }
          .se-card {
            padding: 18px;
          }
        }

        .se-badge.warn{background:#fff0d9;color:#8a5200;}
        .se-badge.ok{background:#edf7ed;color:#265c2b;}
        .se-auth-gate{display:block;}
      </style>

      <main class="se-wrap">
        <section class="se-card">
          <h1 class="se-title">SyncEtc Core Admin Test</h1>
          <p class="se-subtitle">
            Tests Supabase Auth, JWT-protected Edge Function access, platform-admin authorization, and basic backend actions.
          </p>
          <div id="se-auth-label" class="se-badge warn">Not authenticated</div>
          <div class="se-badge">ADMIN-PAGE-core-admin-test-current.js | ${escapeHtml(VERSION)}</div>
        </section>

        <section class="se-card">
          <h2 class="se-title" style="font-size:22px;">Login</h2>
          <p class="se-subtitle">Use the Supabase Auth user created for frank@syncetc.com.</p>

          <div class="se-grid">
            <label class="se-field">
              <span class="se-label">Email</span>
              <input id="se-email" class="se-input" type="email" value="frank@syncetc.com" autocomplete="username">
            </label>

            <label class="se-field">
              <span class="se-label">Password</span>
              <input id="se-password" class="se-input" type="password" autocomplete="current-password">
            </label>
          </div>

          <div class="se-actions">
            <button id="se-login" class="se-button">Log in</button>
            <button id="se-logout" class="se-button secondary">Log out</button>
            <button id="se-session" class="se-button secondary">Check session</button>
          </div>

          <div id="se-status" class="se-status">Loading Supabase client...</div>
        </section>


        <section id="se-auth-gate-notice" class="se-card se-auth-gate">
          <h2 class="se-section-title">Login required</h2>
          <p class="se-subtitle">This admin page is hidden until a valid platform-admin session is active. Backend permissions still enforce access; this gate prevents accidental viewing/editing while logged out.</p>
        </section>

        <section class="se-card">
          <h2 class="se-title" style="font-size:22px;">Edge Function Tests</h2>
          <p class="se-subtitle">These calls require JWT verification plus an active platform_admin row.</p>

          <div class="se-actions" data-auth-required="true">
            <button id="se-ping" class="se-button">Ping Edge Function</button>
            <button id="se-list-customers" class="se-button secondary">List customers</button>
            <button id="se-list-templates" class="se-button secondary">List templates</button>
          </div>

          <pre id="se-output" class="se-output">{}</pre>
        </section>
      </main>
    `;
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


  function setAuthGate(authenticated, email = "") {
    isAuthenticated = !!authenticated;
    authenticatedEmail = isAuthenticated ? String(email || "") : "";

    const root = ensureRoot();
    root.dataset.authenticated = isAuthenticated ? "true" : "false";

    root.querySelectorAll("[data-auth-required='true']").forEach((el) => {
      el.style.display = isAuthenticated ? "" : "none";
    });

    const notice = document.getElementById("se-auth-gate-notice");
    if (notice) notice.style.display = isAuthenticated ? "none" : "block";

    const authLabel = document.getElementById("se-auth-label");
    if (authLabel) {
      authLabel.textContent = isAuthenticated
        ? `Authenticated: ${authenticatedEmail || "active session"}`
        : "Not authenticated";
      authLabel.className = `se-badge ${isAuthenticated ? "ok" : "warn"}`;
    }

    if (window.SyncEtcAdminShell && typeof window.SyncEtcAdminShell.setAuthState === "function") {
      window.SyncEtcAdminShell.setAuthState({
        required: true,
        authenticated: isAuthenticated,
        email: authenticatedEmail
      });
    }
  }

  function showAuthRequiredMessage(pageName = "this admin page") {
    setStatus(`Log in before using ${pageName}.`);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

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

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase JS did not load correctly.");
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.syncetcSupabase = supabaseClient;

    const { data } = await supabaseClient.auth.getSession();

    if (data?.session?.user?.email) {
      setAuthGate(true, data.session.user.email);
      setStatus(`Logged in as ${data.session.user.email}`);
    } else {
      setStatus("No active login session.");
    }
  }

  async function getAccessToken() {
    if (!supabaseClient) throw new Error("Supabase client is not ready.");

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) {
      setAuthGate(false);
      throw new Error("No active Supabase Auth session. Log in first.");
    }

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
      result = {
        ok: false,
        error: "non_json_response",
        status: response.status,
        text: await response.text()
      };
    }

    setOutput({
      http_status: response.status,
      result
    });

    return result;
  }

  function bindEvents() {
    document.getElementById("se-login")?.addEventListener("click", async () => {
      try {
        const email = document.getElementById("se-email")?.value || "";
        const password = document.getElementById("se-password")?.value || "";

        setStatus("Logging in...");

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        setAuthGate(true, data?.user?.email || email);
        setStatus(`Logged in as ${data?.user?.email || email}`);
        setOutput({ ok: true, event: "login", user_email: data?.user?.email || email });
      } catch (error) {
        setStatus("Login failed.");
        setOutput({
          ok: false,
          event: "login_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-logout")?.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        setAuthGate(false);
        setStatus("Logged out.");
        setOutput({ ok: true, event: "logout" });
      } catch (error) {
        setOutput({
          ok: false,
          event: "logout_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-session")?.addEventListener("click", async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        const userEmail = data?.session?.user?.email || null;

        setStatus(userEmail ? `Logged in as ${userEmail}` : "No active login session.");
        setOutput({
          ok: true,
          event: "session_check",
          logged_in: Boolean(userEmail),
          user_email: userEmail,
          has_access_token: Boolean(data?.session?.access_token)
        });
      } catch (error) {
        setOutput({
          ok: false,
          event: "session_check_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-ping")?.addEventListener("click", async () => {
      try {
        setStatus("Calling ping...");
        await callCoreAdminAction("ping");
        setStatus("Ping complete.");
      } catch (error) {
        setStatus("Ping failed.");
        setOutput({
          ok: false,
          event: "ping_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-list-customers")?.addEventListener("click", async () => {
      try {
        setStatus("Listing customers...");
        await callCoreAdminAction("list_customers");
        setStatus("Customer list complete.");
      } catch (error) {
        setStatus("List customers failed.");
        setOutput({
          ok: false,
          event: "list_customers_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    document.getElementById("se-list-templates")?.addEventListener("click", async () => {
      try {
        setStatus("Listing templates...");
        await callCoreAdminAction("list_templates");
        setStatus("Template list complete.");
      } catch (error) {
        setStatus("List templates failed.");
        setOutput({
          ok: false,
          event: "list_templates_failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  async function boot() {
    renderShell();
    setAuthGate(false);
    bindEvents();

    try {
      await initSupabase();
    } catch (error) {
      setStatus("Failed to initialize Supabase client.");
      setOutput({
        ok: false,
        event: "supabase_init_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

// ADMIN-PAGE-core-admin-test-current.js END
