
(function() {
  "use strict";

  const ROOT_ID = "syncetc-upload-widget-root";
  const SUPABASE_BUCKET = "core-assets/uploads";
  const SUPABASE_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";

  function createWidget() {
    const root = document.getElementById(ROOT_ID);
    if(!root) return;

    const container = document.createElement("div");
    container.style.maxWidth = "1180px";
    container.style.margin = "0 auto";
    container.style.border = "2px dashed #c7d2e2";
    container.style.padding = "20px";
    container.style.borderRadius = "8px";
    container.style.textAlign = "center";
    container.innerText = "Drag & Drop files here to upload";
    container.style.background = "#f9f9f9";

    container.addEventListener("dragover", e => e.preventDefault());
    container.addEventListener("drop", async e => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if(files.length === 0) return;
      const uploadedUrls = [];

      for(const file of files) {
        // Example: Supabase upload API call (replace with real)
        // Here we simulate and just return the file name
        uploadedUrls.push("https://supabase.mock/" + encodeURIComponent(file.name));
      }

      container.innerText = uploadedUrls.join("\n");
      console.log("Uploaded files:", uploadedUrls);
    });

    root.appendChild(container);
  }

  if(document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
