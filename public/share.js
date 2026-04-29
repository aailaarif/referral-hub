const scopePill = document.getElementById("scopePill");
const msg = document.getElementById("msg");
const summary = document.getElementById("summary");
const attachmentsEl = document.getElementById("attachments");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function getTokenFromHash() {
  return (location.hash || "").replace("#", "").trim();
}

async function api(path, { method="GET", body } = {}) {
  const headers = {};
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function setScope(scope) {
  if (scope === "full") { scopePill.className = "pill pill-info"; scopePill.textContent = "full"; return; }
  if (scope === "download") { scopePill.className = "pill pill-info"; scopePill.textContent = "download"; return; }
  if (scope === "upload") { scopePill.className = "pill pill-warn"; scopePill.textContent = "upload"; return; }
  scopePill.className = "pill pill-gray";
  scopePill.textContent = scope || "patient_view";
}

function render(referral, perms, token) {
  summary.innerHTML = `
    <div class="kv">
      <div class="k">Referral ID</div><div class="v">${escapeHtml(referral.referralId)}</div>
      <div class="k">Status</div><div class="v">${escapeHtml(referral.status)}</div>
      <div class="k">Specialist clinic</div><div class="v">${escapeHtml(referral.specialistClinicId)}</div>
      <div class="k">Timeline events</div><div class="v">${escapeHtml((referral.timeline||[]).length)}</div>
    </div>
  `;

  const atts = referral.attachments || [];
  attachmentsEl.innerHTML = atts.length ? atts.map(a => `
    <div class="item">
      <div>
        <strong>📎 ${escapeHtml(a.filename)}</strong>
        <div class="meta">${a.uploadedAt ? new Date(a.uploadedAt).toLocaleString() : ""}</div>
      </div>
      <button class="btn btn-ghost" data-dl="${escapeHtml(a.attachmentId)}">Download</button>
    </div>
  `).join("") : `<div class="muted">No attachments.</div>`;

  // download buttons
  attachmentsEl.querySelectorAll("button[data-dl]").forEach(btn => {
    btn.disabled = !perms.canDownload;
    btn.addEventListener("click", async () => {
      const attachmentId = btn.getAttribute("data-dl");
      const data = await api(`/share/${encodeURIComponent(token)}/attachments/${encodeURIComponent(attachmentId)}/download`);
      if (data?.url) window.open(data.url, "_blank");
    });
  });

  // upload controls
  uploadBtn.disabled = !perms.canUpload;
  fileInput.disabled = !perms.canUpload;
}

async function main() {
  const token = getTokenFromHash();
  if (!token) {
    msg.textContent = "Missing token. Use a link like /share.html#TOKEN";
    return;
  }

  try {
    const data = await api(`/share/${encodeURIComponent(token)}`);
    setScope(data.scope);
    msg.textContent = `Permissions: upload=${data.permissions.canUpload} • download=${data.permissions.canDownload}`;

    render(data.referral, data.permissions, token);

    uploadBtn.onclick = async () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      await api(`/share/${encodeURIComponent(token)}/attachments`, { method: "POST", body: fd });
      location.reload();
    };
  } catch (e) {
    msg.textContent = `Error: ${e.message}`;
  }
}

main();