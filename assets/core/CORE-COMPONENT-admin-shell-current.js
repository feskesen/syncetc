// CORE-COMPONENT-admin-shell-current.js
// Internal Version: 2026-06-12-109-B
// Purpose: Shared SyncEtc admin shell header with logo and admin navigation bubbles.
// Logo source: Supabase Storage public core-assets bucket.
// Live filename is stable. Track versions internally, in Git history, and in local saved copies.

(function () {
  "use strict";

  const VERSION = "2026-06-12-109-B";
  const SHELL_ID = "syncetc-admin-shell";
  const LOGO_URL = "https://bxywokidhgppmlzyqvem.supabase.co/storage/v1/object/public/core-assets/SyncEtc-logo-compact.png";

  const NAV_ITEMS = [
    {
      label: "Customer Builder",
      href: "/customer-builder",
      match: "/customer-builder"
    },
    {
      label: "Platform Access Tools",
      href: "/access-admin",
      match: "/access-admin"
    },
    {
      label: "Page Setup",
      href: "/page-setup",
      match: "/page-setup"
    },
    {
      label: "Header & Navigation Manager",
      href: "/header-navigation-setup",
      match: "/header-navigation-setup"
    },
    {
      label: "Template Detail",
      href: "/template-detail",
      match: "/template-detail"
    },
    {
      label: "Page Editor",
      href: "/page-editor",
      match: "/page-editor"
    },
    {
      label: "Customer Assets",
      href: "/customer-assets",
      match: "/customer-assets"
    },
    {
      label: "Aircraft Admin",
      href: "/aircraft-admin",
      match: "/aircraft-admin"
    },
    {
      label: "Media Library",
      href: "/media-library",
      match: "/media-library"
    },
    {
      label: "Documents",
      href: "/documents-admin",
      match: "/documents-admin"
    },
    {
      label: "Events",
      href: "/events-admin",
      match: "/events-admin"
    },
    {
      label: "Layout Designer",
      href: "/layout-designer",
      match: "/layout-designer"
    },
    {
      label: "Renderer Preview",
      href: "/renderer-preview",
      match: "/renderer-preview"
    }
  ];

  const dirtyState = {
    dirty: false,
    message: "You have unsaved changes. Leave anyway?"
  };

  const authState = {
    required: false,
    authenticated: false,
    email: ""
  };

  function setAuthState(options = {}) {
    authState.required = !!options.required;
    authState.authenticated = !!options.authenticated;
    authState.email = String(options.email || "");

    document.documentElement.dataset.syncetcAdminAuthRequired = authState.required ? "true" : "false";
    document.documentElement.dataset.syncetcAdminAuthenticated = authState.authenticated ? "true" : "false";

    const shell = document.getElementById(SHELL_ID);
    if (shell) {
      shell.dataset.authRequired = authState.required ? "true" : "false";
      shell.dataset.authenticated = authState.authenticated ? "true" : "false";
    }
  }

  function getAuthState() {
    return { ...authState };
  }

  function setDirty(value, message) {
    dirtyState.dirty = !!value;
    if (message) dirtyState.message = String(message);
  }

  function isDirty() {
    return !!dirtyState.dirty;
  }

  function clearDirty() {
    setDirty(false);
  }

  function confirmIfDirty(message) {
    if (!isDirty()) return true;
    return window.confirm(message || dirtyState.message);
  }

  function bindDirtyNavigationGuard() {
    if (window.__syncetcAdminDirtyGuardBound) return;
    window.__syncetcAdminDirtyGuardBound = true;

    window.addEventListener("beforeunload", function (event) {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = dirtyState.message;
      return dirtyState.message;
    });

    document.addEventListener("click", function (event) {
      const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link || !isDirty()) return;
      if (link.target === "_blank") return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      const url = new URL(link.href, window.location.href);
      if (url.href === window.location.href) return;

      event.preventDefault();
      if (confirmIfDirty()) {
        clearDirty();
        window.location.href = url.href;
      }
    }, true);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCurrentPath() {
    return window.location.pathname || "/";
  }

  function isActive(item) {
    return getCurrentPath().replace(/\/$/, "") === item.match;
  }

  function renderNavItem(item) {
    const active = isActive(item);
    const className = [
      "se-shell-pill",
      active ? "active" : "",
      item.disabled ? "disabled" : ""
    ].filter(Boolean).join(" ");

    if (item.disabled) {
      return `
        <span class="${className}" title="Coming soon">
          ${escapeHtml(item.label)}
        </span>
      `;
    }

    return `
      <a class="${className}" href="${escapeHtml(item.href)}">
        ${escapeHtml(item.label)}
      </a>
    `;
  }

  function renderShell() {
    if (document.getElementById(SHELL_ID)) return;

    const shell = document.createElement("div");
    shell.id = SHELL_ID;

    shell.innerHTML = `
      <style>
        #${SHELL_ID} {
          font-family: Arial, Helvetica, sans-serif;
          background: #ffffff;
          border-bottom: 1px solid #d9e0ea;
          color: #172033;
          position: sticky;
          top: 0;
          z-index: 9999;
          box-shadow: 0 4px 18px rgba(23, 32, 51, 0.06);
        }

        #${SHELL_ID} * {
          box-sizing: border-box;
        }

        #${SHELL_ID} .se-shell-inner {
          max-width: 1180px;
          margin: 0 auto;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        #${SHELL_ID} .se-shell-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 120px;
          text-decoration: none;
        }

        #${SHELL_ID} .se-shell-logo {
          display: block;
          width: auto;
          height: 34px;
          max-width: 160px;
          object-fit: contain;
        }

        #${SHELL_ID} .se-shell-nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        #${SHELL_ID} .se-shell-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          border: 1px solid #c7d2e2;
          border-radius: 999px;
          background: #ffffff;
          color: #1f2a44;
          min-width: 112px;
          padding: 8px 12px;
          font-size: 13px;
          text-align: center;
          font-weight: 800;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
          transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        #${SHELL_ID} .se-shell-pill:hover {
          border-color: #1f4f82;
          color: #1f4f82;
          background: #f4f8fd;
        }

        #${SHELL_ID} .se-shell-pill.active {
          border-color: #1f4f82;
          background: #1f4f82;
          color: #ffffff;
        }

        #${SHELL_ID} .se-shell-pill.disabled {
          opacity: 0.55;
          cursor: not-allowed;
          background: #f4f6f9;
          color: #5d6b82;
        }

        #${SHELL_ID} .se-shell-version {
          display: none;
        }

        @media (max-width: 720px) {
          #${SHELL_ID} .se-shell-inner {
            align-items: flex-start;
            flex-direction: column;
          }

          #${SHELL_ID} .se-shell-nav {
            justify-content: flex-start;
          }

          #${SHELL_ID} .se-shell-pill {
            font-size: 12px;
            min-height: 32px;
            min-width: auto;
            padding: 7px 10px;
          }
        }
      </style>

      <div class="se-shell-inner">
        <a class="se-shell-brand" href="/customer-builder" aria-label="SyncEtc admin home">
          <img class="se-shell-logo" src="${escapeHtml(LOGO_URL)}" alt="SyncEtc">
        </a>

        <nav class="se-shell-nav" aria-label="SyncEtc admin navigation">
          ${NAV_ITEMS.map(renderNavItem).join("")}
        </nav>

        <span class="se-shell-version">CORE-COMPONENT-admin-shell-current.js | ${escapeHtml(VERSION)}</span>
      </div>
    `;

    document.body.prepend(shell);
  }

  function boot() {
    renderShell();
    bindDirtyNavigationGuard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.SyncEtcAdminShell = {
    version: VERSION,
    render: renderShell,
    setDirty,
    clearDirty,
    isDirty,
    confirmIfDirty,
    setAuthState,
    getAuthState
  };
})();

// CORE-COMPONENT-admin-shell-current.js END
