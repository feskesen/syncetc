// ADMIN-PAGE-dragdrop-upload-current.js
// Drag-and-drop upload widget for SyncEtc
// Version: v1

(function() {
  "use strict";

  const ROOT_ID = "syncetc-dragdrop-widget-root";
  const PUB_KEY = "sb_publishable_okF_HCqwt-0zcSqlifSZ7g_1kCXxdCA";

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function createWidget() {
    const root = ensureRoot();
    root.innerHTML = `
      <style>
        #${ROOT_ID} {position:fixed;bottom:20px;right:20px;width:350px;z-index:99999;font-family:sans-serif;}
        #${ROOT_ID} .dd-header {background:#1f4f82;color:#fff;padding:8px;border-radius:6px 6px 0 0;cursor:pointer;}
        #${ROOT_ID} .dd-body {background:#f5f7fb;border:1px solid #d9e0ea;border-radius:0 0 6px 6px;padding:8px;display:flex;flex-direction:column;height:250px;}
        #${ROOT_ID} #dd-messages {flex:1;overflow-y:auto;margin-bottom:8px;}
        #${ROOT_ID} #dd-input {flex:0;display:flex;}
        #${ROOT_ID} #dd-input input {flex:1;padding:4px;}
        #${ROOT_ID} #dd-input button {padding:4px 8px;margin-left:4px;}
        .dd-msg {margin-bottom:4px;padding:4px;border-radius:4px;}
        .dd-user {background:#e1f0ff;text-align:right;}
        .dd-system {background:#f0f0f0;text-align:left;}
      </style>
      <div class="dd-header">Drag & Drop Upload</div>
      <div class="dd-body">
        <div id="dd-messages"></div>
        <div id="dd-dropzone" style="flex:1;border:2px dashed #ccc;border-radius:4px;padding:8px;display:flex;align-items:center;justify-content:center;">Drop files here or click to select</div>
      </div>
    `;

    const dropzone = root.querySelector("#dd-dropzone");
    dropzone.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => handleFiles(input.files);
      input.click();
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#1f4f82";
    });

    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#ccc";
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#ccc";
      handleFiles(e.dataTransfer.files);
    });
  }

  async function handleFiles(files) {
    const msgContainer = document.getElementById("dd-messages");
    for (const file of files) {
      const msg = document.createElement("div");
      msg.className = "dd-msg dd-system";
      msg.textContent = `Uploading ${file.name}...`;
      msgContainer.appendChild(msg);
      msg.scrollIntoView({behavior:"smooth"});
      try {
        const formData = new FormData();
        formData.append("file", file);
        const path = `core-assets/customers/test-customer-1/banners/${file.name}`;
        formData.append("path", path);

        // Example Supabase POST upload endpoint
        const resp = await fetch("https://bxywokidhgppmlzyqvem.supabase.co/storage/v1/object/admin-upload", {
          method: "POST",
          headers: {
            "apikey": PUB_KEY
          },
          body: formData
        });

        if (resp.ok) {
          const data = await resp.json();
          msg.textContent = `Uploaded ${file.name}: ${data.public_url}`;
        } else {
          msg.textContent = `Failed to upload ${file.name}: ${resp.statusText}`;
        }
      } catch(err) {
        msg.textContent = `Error uploading ${file.name}: ${err.message}`;
      }
    }
  }

  createWidget();
})();