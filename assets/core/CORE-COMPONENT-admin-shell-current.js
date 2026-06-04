// CORE-COMPONENT-admin-shell-current.js
// Internal Version: 2026-06-03-005
// Purpose: Shared SyncEtc admin shell header with logo and admin navigation bubbles.
// Logo source: Supabase Storage public core-assets bucket.
// Live filename is stable. Track versions internally, in Git history, and in local saved copies.

(function () {
  "use strict";

  const VERSION = "2026-06-03-001";
  const SHELL_ID = "syncetc-admin-shell";
  const LOGO_URL = "https://bxywokidhgppmlzyqvem.supabase.co/storage/v1/object/public/core-assets/SyncEtc-logo-compact.png";

  const NAV_ITEMS = [
    {
      label: "Customer Builder",
      href: "/customer-builder",
      match: "/customer-builder"
    },
    {
      label: "Page Setup",
      href: "/page-setup",
      match: "/page-setup"
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
          padding: 8px 12px;
          font-size: 13px;
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.SyncEtcAdminShell = {
    version: VERSION,
    render: renderShell
  };
})();

// CORE-COMPONENT-admin-shell-current.js END


// Added drag-and-drop widget root for Tools and Widgets
const widgetRootDiv = document.createElement('div');
widgetRootDiv.id = 'syncetc-upload-widget-root';
document.body.appendChild(widgetRootDiv);
