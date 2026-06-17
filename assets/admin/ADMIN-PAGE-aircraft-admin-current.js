// ADMIN-PAGE-aircraft-admin-current.js
// Internal Version: 2026-06-17-117-D
// Purpose: Compatibility loader for the deprecated standalone aircraft admin page. Loads the current customer-admin aircraft workbench module.

(function () {
  "use strict";

  const VERSION = "2026-06-17-117-D";
  const TARGET_VERSION = "2026-06-17-117-D";
  const TARGET_SRC = `https://feskesen.github.io/syncetc/assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js?v=${encodeURIComponent(TARGET_VERSION)}`;
  const SCRIPT_ID = `syncetc-aircraft-admin-current-loader-${TARGET_VERSION.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  window.SyncEtcAircraftAdminCompatibilityLoader = { version: VERSION, targetVersion: TARGET_VERSION };

  function loadCurrentAircraftModule() {
    if (window.SyncEtcAircraftAdmin && typeof window.SyncEtcAircraftAdmin.mount === "function") return;
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = TARGET_SRC;
    script.async = false;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCurrentAircraftModule);
  else loadCurrentAircraftModule();
})();
