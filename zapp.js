/*
  Set this after deploying Code.gs as a Google Apps Script Web App.
  Example: https://script.google.com/macros/s/XXXXXXXX/exec
*/
const API_URL = "https://script.google.com/macros/s/AKfycbzGPM-0wVrVpuo2EQk1ykkncV5BpvW2AVRawnl0yi-dgDa_s0XLI7VniCwsJw0x2DVHaQ/exec";

let requests = [];
let newAttachments = [];
let editAttachments = [];
let currentEditRequest = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindEditors();
  bindAttachmentPicker("attachmentInput", "attachmentPreview", false);
  bindAttachmentPicker("editAttachmentInput", "editAttachmentPreview", true);
  bindDropZone();
  $("requestForm").addEventListener("submit", submitRequest);
  $("clearButton").addEventListener("click", clearNewForm);
  $("refreshButton").addEventListener("click", loadRequests);
  $("searchInput").addEventListener("input", renderRequests);
  $("statusFilter").addEventListener("change", renderRequests);
  $("closeModal").addEventListener("click", closeModal);
  $("cancelEdit").addEventListener("click", closeModal);
  $("editForm").addEventListener("submit", saveEdit);
  loadRequests();
});

function bindTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "requestsTab") loadRequests();
    });
  });
}

function bindEditors() {
  document.querySelectorAll(".toolbar button").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
      const editor = $(btn.closest(".toolbar").dataset.editor);
      editor.focus();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });
}

function bindAttachmentPicker(inputId, previewId, isEdit) {
  $(inputId).addEventListener("change", async e => {
    await addImageFiles(Array.from(e.target.files), isEdit);
    e.target.value = "";
  });
}

function bindDropZone() {
  const zone = $("dropZone");
  ["dragenter","dragover"].forEach(type => zone.addEventListener(type, e => {
    e.preventDefault(); zone.classList.add("dragover");
  }));
  ["dragleave","drop"].forEach(type => zone.addEventListener(type, e => {
    e.preventDefault(); zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", async e => {
    await addImageFiles(Array.from(e.dataTransfer.files), false);
  });
  zone.addEventListener("paste", async e => {
    const files = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      await addImageFiles(files, false);
    }
  });
}

async function addImageFiles(files, isEdit) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const compressed = await compressImage(file);
      if (isEdit) editAttachments.push(compressed);
      else newAttachments.push(compressed);
    } catch (err) {
      console.error(err);
    }
  }
  renderAttachmentPreview(isEdit);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({
          name: (file.name || "pasted-image").replace(/\.[^.]+$/, "") + ".jpg",
          mimeType: "image/jpeg",
          data: dataUrl.split(",")[1],
          preview: dataUrl
        });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview(isEdit) {
  const list = isEdit ? editAttachments : newAttachments;
  const container = $(isEdit ? "editAttachmentPreview" : "attachmentPreview");
  container.innerHTML = "";
  list.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "preview-item";
    div.innerHTML = `<img src="${file.preview}" alt=""><button type="button">Remove</button>`;
    div.querySelector("button").addEventListener("click", () => {
      list.splice(index, 1);
      renderAttachmentPreview(isEdit);
    });
    container.appendChild(div);
  });
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.innerText.trim();
}

function collectForm() {
  return {
    moduleAffected: $("moduleAffected").value.trim(),
    requestTitle: $("requestTitle").value.trim(),
    description: $("description").innerHTML.trim(),
    currentBehavior: $("currentBehavior").innerHTML.trim(),
    requestedChange: $("requestedChange").innerHTML.trim(),
    additionalDetails: $("additionalDetails").innerHTML.trim(),
    attachments: newAttachments.map(({name,mimeType,data}) => ({name,mimeType,data}))
  };
}

async function submitRequest(e) {
  e.preventDefault();
  const data = collectForm();
  if (!data.moduleAffected || !data.requestTitle ||
      !htmlToText(data.description) || !htmlToText(data.currentBehavior) ||
      !htmlToText(data.requestedChange)) {
    showMessage("formMessage", "Please complete all required fields.", true);
    return;
  }

  $("submitButton").disabled = true;
  showMessage("formMessage", "Submitting…");
  try {
    await postJSON({ action: "create", data });
    showMessage("formMessage", "Request submitted successfully. It will appear in the Requests tab after the sheet is updated.", false);
    clearNewForm(false);
    setTimeout(loadRequests, 1800);
  } catch (err) {
    console.error(err);
    showMessage("formMessage", "The request could not be submitted. Check the Apps Script URL and deployment access.", true);
  } finally {
    $("submitButton").disabled = false;
  }
}

function clearNewForm(show = true) {
  $("requestForm").reset();
  ["description","currentBehavior","requestedChange","additionalDetails"].forEach(id => $(id).innerHTML = "");
  newAttachments = [];
  renderAttachmentPreview(false);
  if (show) showMessage("formMessage", "");
}

function showMessage(id, message, error = false) {
  const el = $(id);
  el.textContent = message;
  el.className = "message" + (message ? (error ? " error" : " success") : "");
}

function postJSON(payload) {
  if (!API_URL || API_URL.includes("PASTE_YOUR")) {
    return Promise.reject(new Error("API_URL is not configured."));
  }
  // text/plain avoids a browser CORS preflight. Apps Script receives the JSON
  // in e.postData.contents. no-cors means the browser cannot read the response.
  return fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {"Content-Type": "text/plain;charset=utf-8"},
    body: JSON.stringify(payload)
  }).then(() => ({ok:true}));
}

function loadRequests() {
  if (!API_URL || API_URL.includes("PASTE_YOUR")) {
    $("connectionText").textContent = "Configure API URL";
    $("connectionDot").style.background = "#ef4444";
    $("requestRows").innerHTML = `<tr><td colspan="5" class="empty">Add your Apps Script Web App URL to app.js.</td></tr>`;
    return;
  }
  $("connectionText").textContent = "Loading…";
  jsonp(API_URL + "?action=list");
}

function jsonp(url) {
  const callback = "feedbackCallback_" + Date.now();
  window[callback] = data => {
    delete window[callback];
    script.remove();
    requests = Array.isArray(data.requests) ? data.requests : [];
    $("connectionText").textContent = "Connected";
    $("connectionDot").style.background = "#16a34a";
    renderRequests();
  };
  const script = document.createElement("script");
  script.src = url + "&callback=" + callback;
  script.onerror = () => {
    delete window[callback];
    script.remove();
    $("connectionText").textContent = "Connection error";
    $("connectionDot").style.background = "#ef4444";
    $("requestRows").innerHTML = `<tr><td colspan="5" class="empty">Unable to load requests. Check Apps Script deployment and access.</td></tr>`;
  };
  document.body.appendChild(script);
}

function renderRequests() {
  const q = $("searchInput").value.toLowerCase().trim();
  const status = $("statusFilter").value;
  const filtered = requests.filter(r => {
    const hay = `${r.requestId} ${r.moduleAffected} ${r.requestTitle}`.toLowerCase();
    return (!q || hay.includes(q)) && (!status || r.status === status);
  });
  const tbody = $("requestRows");
  tbody.innerHTML = "";
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No requests found.</td></tr>`;
    return;
  }
  filtered.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(r.requestId)}</b></td>
      <td>${escapeHtml(r.moduleAffected)}</td>
      <td>${escapeHtml(r.requestTitle)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.dateRequested)}</td>`;
    tr.addEventListener("click", () => openRequest(r));
    tbody.appendChild(tr);
  });
}

function openRequest(r) {
  currentEditRequest = r;
  $("detailId").textContent = r.requestId;
  $("detailTitle").textContent = r.requestTitle;
  $("editRow").value = r.row;
  $("editModule").value = r.moduleAffected || "";
  $("editTitle").value = r.requestTitle || "";
  $("editDescription").innerHTML = r.description || "";
  $("editCurrentBehavior").innerHTML = r.currentBehavior || "";
  $("editRequestedChange").innerHTML = r.requestedChange || "";
  $("editAdditionalDetails").innerHTML = r.additionalDetails || "";
  $("editStatus").value = r.status || "New";
  editAttachments = [];
  renderAttachmentPreview(true);
  renderExistingAttachments(r.attachments || []);
  showMessage("editMessage", "");
  $("detailModal").classList.remove("hidden");
}

function renderExistingAttachments(urls) {
  const box = $("existingAttachments");
  box.innerHTML = "";
  if (!urls.length) {
    box.innerHTML = `<span style="color:#667085;font-size:13px">No attachments</span>`;
    return;
  }
  urls.forEach((url, i) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `<img src="${url}" alt="Attachment ${i+1}">`;
    box.appendChild(a);
  });
}

function closeModal() {
  $("detailModal").classList.add("hidden");
  currentEditRequest = null;
}

async function saveEdit(e) {
  e.preventDefault();
  const data = {
    row: Number($("editRow").value),
    moduleAffected: $("editModule").value.trim(),
    requestTitle: $("editTitle").value.trim(),
    description: $("editDescription").innerHTML.trim(),
    currentBehavior: $("editCurrentBehavior").innerHTML.trim(),
    requestedChange: $("editRequestedChange").innerHTML.trim(),
    additionalDetails: $("editAdditionalDetails").innerHTML.trim(),
    status: $("editStatus").value,
    attachments: editAttachments.map(({name,mimeType,data}) => ({name,mimeType,data}))
  };
  if (!data.moduleAffected || !data.requestTitle) {
    showMessage("editMessage", "Module and title are required.", true);
    return;
  }
  $("saveButton").disabled = true;
  showMessage("editMessage", "Saving…");
  try {
    await postJSON({action:"update", data});
    showMessage("editMessage", "Saved. Refreshing the request list…");
    setTimeout(() => {
      closeModal();
      loadRequests();
    }, 900);
  } catch (err) {
    showMessage("editMessage", "Could not save changes.", true);
  } finally {
    $("saveButton").disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
