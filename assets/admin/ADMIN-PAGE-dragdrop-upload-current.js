
(function(){
  "use strict";

  const ROOT_ID = "syncetc-upload-widget-root";

  function createWidget() {
    const root = document.getElementById(ROOT_ID);
    if(!root) return;

    const container = document.createElement("div");
    container.style.border = "2px dashed #c7d2e2";
    container.style.padding = "20px";
    container.style.borderRadius = "8px";
    container.style.textAlign = "center";
    container.innerText = "Drag & Drop files here to upload";
    container.addEventListener("dragover", e => e.preventDefault());
    container.addEventListener("drop", e => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if(files.length === 0) return;
      console.log("Dropped files:", files.map(f => f.name));
      container.innerText = files.map(f => f.name).join(", ") + " uploaded (demo)";
    });

    root.appendChild(container);
  }

  if(document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
