// CORE-COMPONENT-admin-shell-current.js
// Header / Tools integration for SyncEtc

(function() {
  "use strict";
  const toolsBtnId = "syncetc-tools-btn";
  let btn = document.getElementById(toolsBtnId);
  if (!btn) {
    btn = document.createElement("button");
    btn.id = toolsBtnId;
    btn.textContent = "Tools";
    btn.style.position = "fixed";
    btn.style.top = "10px";
    btn.style.right = "10px";
    btn.style.zIndex = "100000";
    document.body.appendChild(btn);
  }

  btn.addEventListener("click", () => {
    const widget = document.getElementById("syncetc-dragdrop-widget-root");
    if (widget) {
      widget.style.display = widget.style.display === "none" ? "block" : "none";
    }
  });
})();