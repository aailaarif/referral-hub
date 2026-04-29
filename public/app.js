// Same-origin base (works for Azure + local single-app)
const BASE_URL = "";

const $ = (id) => document.getElementById(id);

// Sections
const loginSection = $("loginSection");
const appSection = $("appSection");
const createSection = $("createSection");
const detailSection = $("detailSection");

// Topbar
const rolePill = $("rolePill");
const logoutBtn = $("logoutBtn");

// Login
const emailEl = $("email");
const passwordEl = $("password");
const loginBtn = $("loginBtn");
const seedDemoBtn = $("seedDemoBtn");
const loginError = $("loginError");

// Dashboard
const whoami = $("whoami");
const canDo = $("canDo");
const cantDo = $("cantDo");

// Create
const specialistClinicIdEl = $("specialistClinicId");
const reasonEl = $("reason");
const patientEmailEl = $("patientEmail");
const patientNameEl = $("patientName");
const createReferralBtn = $("createReferralBtn");
const createMsg = $("createMsg");

// List
const refreshBtn = $("refreshBtn");
const referralsList = $("referralsList");

// Details
const closeDetailBtn = $("closeDetailBtn");
const detailHeader = $("detailHeader");
const detailMsg = $("detailMsg");

// Panels
const panels = {
  overview: $("tab_overview"),
  notes: $("tab_notes"),
  requests: $("tab_requests"),
  attachments: $("tab_attachments"),
  timeline: $("tab_timeline")
};

let currentReferralId = null;
let lastReferral = null;
let tokenPayload = null;
let patientPortalMode = false;

// ---------------------------
// Helpers
// ---------------------------
function getToken() { return localStorage.getItem("accessToken"); }
function setToken(t) { localStorage.setItem("accessToken", t); }
function clearToken() { localStorage.removeItem("accessToken"); }

function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch { return null; }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function api(path, { method="GET", body } = {}) {
  const token = getToken();
  const headers = {};
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new Error("API unreachable. Is the server running?");
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function roles(){ return tokenPayload?.roles || []; }
function isReferrer(){ return roles().includes("referrer_staff"); }
function isSpecialist(){ return roles().includes("specialist_staff"); }
function isPatient(){ return roles().includes("patient"); }
function isAdmin(){ return roles().includes("admin"); }

function setLoggedInUI(isLoggedIn){
  loginSection.classList.toggle("hidden", isLoggedIn);
  appSection.classList.toggle("hidden", !isLoggedIn);
  logoutBtn.classList.toggle("hidden", !isLoggedIn);
  rolePill.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn){
    rolePill.className = "pill pill-gray hidden";
    rolePill.textContent = "Not logged in";
  }
}

function statusPill(status){
  const s = String(status || "");
  if (s === "closed") return `<span class="pill pill-good">✅ closed</span>`;
  if (s === "scheduled") return `<span class="pill pill-warn">📅 scheduled</span>`;
  if (s === "received") return `<span class="pill pill-info">📥 received</span>`;
  if (s === "sent") return `<span class="pill pill-gray">📤 sent</span>`;
  return `<span class="pill pill-gray">${escapeHtml(s)}</span>`;
}

function setPermissionsUI(){
  const r = roles();
  whoami.textContent =
    `roles: ${r.join(", ")}${tokenPayload?.clinicId ? ` • clinic: ${tokenPayload.clinicId}` : ""}${patientPortalMode ? " • patient portal mode" : ""}`;

  const yes = [];
  const no = [];

  if (isReferrer()){
    yes.push("Create referrals", "Message specialist in referral", "Upload attachments", "Fulfill info requests");
    no.push("Change referral status (specialist only)");
  }
  if (isSpecialist()){
    yes.push("Receive referrals for your clinic", "Change status (received/scheduled/closed)", "Request more info", "Message referrer", "Download attachments");
    no.push("Create referrals (referrer only)");
  }
  if (isPatient()){
    yes.push("View your referral status + timeline (limited)");
    no.push("No editing: status/notes/requests/uploads");
  }
  if (isAdmin()){
    yes.push("See everything (admin)", "Reset demo data (local dev)");
    no.push("—");
  }

  canDo.innerHTML = yes.map(x => `<li>${escapeHtml(x)}</li>`).join("");
  cantDo.innerHTML = no.map(x => `<li>${escapeHtml(x)}</li>`).join("");

  const allowCreate = (isReferrer() || isAdmin()) && !patientPortalMode;
  createSection.classList.toggle("hidden", !allowCreate);

  if (isAdmin()) { rolePill.className = "pill pill-info"; rolePill.textContent = "🛡️ admin"; }
  else if (isSpecialist()) { rolePill.className = "pill pill-info"; rolePill.textContent = "👩‍⚕️ specialist"; }
  else if (isReferrer()) { rolePill.className = "pill pill-warn"; rolePill.textContent = "🧑‍💼 referrer"; }
  else if (isPatient()) { rolePill.className = "pill pill-gray"; rolePill.textContent = "🧑 patient"; }
  else { rolePill.className = "pill pill-gray"; rolePill.textContent = "user"; }
}

function setActiveTab(name){
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(`.tab[data-tab="${name}"]`).forEach(t => t.classList.add("active"));
  Object.entries(panels).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
}

// ---------------------------
// Auth actions
// ---------------------------
async function seedDemo(){
  try {
    await api("/auth/seed-demo", { method:"POST", body:{} });
    loginError.textContent = "✅ Demo users seeded. Use quick login buttons.";
  } catch (e){
    loginError.textContent = e.message;
  }
}

async function resetDemoData(){
  try {
    const data = await api("/demo/reset", { method: "POST", body: {} });
    alert(`Demo reset OK.\nReferral: ${data.demo.referralId}`);
    await loadReferrals();
  } catch (e){
    alert(`Reset failed: ${e.message}`);
  }
}

async function login(email, password, { portal=false } = {}){
  loginError.textContent = "";
  patientPortalMode = portal;

  try {
    const data = await api("/auth/login", { method:"POST", body:{ email, password } });
    setToken(data.accessToken);
    tokenPayload = decodeJwt(data.accessToken);
    setLoggedInUI(true);
    setPermissionsUI();
    await loadReferrals();

    // If admin, offer reset in console (and you can also call resetDemoData() manually)
    if (isAdmin()) console.log("Admin logged in. You can call resetDemoData() from console.");
  } catch (e){
    loginError.textContent = e.message;
  }
}

function logout(){
  clearToken();
  tokenPayload = null;
  patientPortalMode = false;
  setLoggedInUI(false);
  referralsList.innerHTML = "";
  hideDetails();
}

// ---------------------------
// List + Create
// ---------------------------
async function loadReferrals(){
  referralsList.innerHTML = `<div class="muted">Loading…</div>`;
  try {
    const data = await api("/referrals");
    const referrals = data.referrals || [];

    if (!referrals.length){
      referralsList.innerHTML = `<div class="muted">No referrals found.</div>`;
      return;
    }

    referralsList.innerHTML = referrals.map(r => `
      <div class="item">
        <div>
          <div><strong>${escapeHtml(r.referralId)}</strong> ${statusPill(r.status)}</div>
          <div class="meta">updated: ${new Date(r.updatedAt).toLocaleString()}</div>
        </div>
        <button class="btn btn-ghost" data-open="${escapeHtml(r.referralId)}">Open →</button>
      </div>
    `).join("");

    referralsList.querySelectorAll("button[data-open]").forEach(btn => {
      btn.addEventListener("click", () => openDetails(btn.getAttribute("data-open")));
    });
  } catch (e){
    referralsList.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
  }
}

async function createReferral(){
  createMsg.textContent = "";
  const specialistClinicId = specialistClinicIdEl.value.trim();
  const reason = reasonEl.value.trim();
  const patientEmail = patientEmailEl.value.trim();
  const patientName = patientNameEl.value.trim();

  if (!specialistClinicId || !reason){
    createMsg.textContent = "Please fill specialist clinic ID + reason.";
    return;
  }

  try {
    const body = { specialistClinicId, reason };
    if (patientEmail) body.patientEmail = patientEmail;
    if (patientName) body.patientName = patientName;

    const data = await api("/referrals", { method:"POST", body });
    createMsg.textContent = `✅ Created ${data.referralId}`;

    specialistClinicIdEl.value = "";
    reasonEl.value = "";
    patientEmailEl.value = "";
    patientNameEl.value = "";

    await loadReferrals();
  } catch (e){
    createMsg.textContent = `Error: ${e.message}`;
  }
}

// ---------------------------
// Details
// ---------------------------
function hideDetails(){
  currentReferralId = null;
  lastReferral = null;
  detailSection.classList.add("hidden");
  detailHeader.innerHTML = "";
  Object.values(panels).forEach(p => p.innerHTML = "");
  detailMsg.textContent = "";
}

async function openDetails(referralId){
  currentReferralId = referralId;
  detailSection.classList.remove("hidden");
  detailMsg.textContent = "";
  detailHeader.innerHTML = `<div class="muted">Loading…</div>`;
  Object.values(panels).forEach(p => p.innerHTML = "");

  try {
    const data = await api(`/referrals/${encodeURIComponent(referralId)}`);
    lastReferral = data.referral;

    detailHeader.innerHTML = `
      <div><strong>${escapeHtml(lastReferral.referralId)}</strong></div>
      ${statusPill(lastReferral.status)}
      ${lastReferral.referrerClinicId ? `<div class="pill pill-gray">🏷️ referrer: ${escapeHtml(lastReferral.referrerClinicId)}</div>` : ""}
      ${lastReferral.specialistClinicId ? `<div class="pill pill-gray">🏥 specialist: ${escapeHtml(lastReferral.specialistClinicId)}</div>` : ""}
    `;

    renderTabs();
    setActiveTab("overview");
  } catch (e){
    detailHeader.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
  }
}

function renderTabs(){
  const r = lastReferral;
  if (!r) return;

  const limited = patientPortalMode || (isPatient() && !isAdmin());

  const notes = Array.isArray(r.notes) ? r.notes : [];
  const reqs = Array.isArray(r.requests) ? r.requests : [];
  const atts = Array.isArray(r.attachments) ? r.attachments : [];
  const tl = Array.isArray(r.timeline) ? r.timeline : [];

  const reason = r.reason || (limited ? "—" : "");
  const patientLine =
    (r.patientName || r.patientEmail)
      ? `${r.patientName || ""} ${r.patientEmail ? `(${r.patientEmail})` : ""}`
      : "—";

  panels.overview.innerHTML = `
    <div class="kv">
      <div class="k">Referral ID</div><div class="v">${escapeHtml(r.referralId)}</div>
      <div class="k">Status</div><div class="v">${escapeHtml(r.status)}</div>
      <div class="k">Reason</div><div class="v">${escapeHtml(reason)}</div>
      <div class="k">Patient</div><div class="v">${escapeHtml(patientLine)}</div>
    </div>

    <div class="divider"></div>

    <div class="row">
      <label class="field" style="flex:1;">
        <span>Update status (specialist/admin)</span>
        <select id="statusSelect">
          <option value="received">received</option>
          <option value="scheduled">scheduled</option>
          <option value="closed">closed</option>
        </select>
      </label>
      <button id="updateStatusBtn" class="btn btn-primary">Update</button>
    </div>
    <div class="muted small">${limited ? "Patient portal is read-only." : ""}</div>
  `;

  const updateBtn = document.getElementById("updateStatusBtn");
  updateBtn.disabled = !(isSpecialist() || isAdmin()) || limited;
  updateBtn.addEventListener("click", updateStatus);

  if (limited) {
    panels.notes.innerHTML = `<div class="muted">Patient portal: notes hidden.</div>`;
    panels.requests.innerHTML = `<div class="muted">Patient portal: requests hidden.</div>`;
    panels.attachments.innerHTML = `<div class="muted">Patient portal: attachments hidden.</div>`;
  } else {
    panels.notes.innerHTML = `
      <div class="list">
        ${notes.length ? notes.slice().reverse().map(n => `
          <div class="item">
            <div>
              <strong>💬 ${escapeHtml(n.authorUserId)}</strong>
              <div class="meta">${new Date(n.at).toLocaleString()}</div>
            </div>
            <div style="max-width:560px;">${escapeHtml(n.message)}</div>
          </div>
        `).join("") : `<div class="muted">No notes yet.</div>`}
      </div>

      <div class="divider"></div>

      <div class="row">
        <input id="noteInput" placeholder="Write a message…" />
        <button id="sendNoteBtn" class="btn btn-primary">Send</button>
      </div>
    `;
    const sendBtn = document.getElementById("sendNoteBtn");
    sendBtn.disabled = !(isReferrer() || isSpecialist() || isAdmin());
    sendBtn.addEventListener("click", sendNote);

    panels.requests.innerHTML = `
      <div class="list">
        ${reqs.length ? reqs.slice().reverse().map(q => `
          <div class="item">
            <div>
              <strong>🧾 ${escapeHtml(q.requestId)}</strong>
              <div class="meta">status: ${escapeHtml(q.status)} • items: ${escapeHtml((q.items||[]).join(", "))}</div>
            </div>
            <div class="row">
              <button class="btn btn-ghost" data-fulfill="${escapeHtml(q.requestId)}">Mark fulfilled</button>
              <button class="btn btn-ghost" data-close="${escapeHtml(q.requestId)}">Close</button>
            </div>
          </div>
        `).join("") : `<div class="muted">No requests yet.</div>`}
      </div>

      <div class="divider"></div>

      <label class="field">
        <span>Specialist: request more info (comma-separated)</span>
        <input id="requestItems" placeholder="Lab results, Insurance card, Imaging report" />
      </label>
      <button id="createRequestBtn" class="btn btn-primary">Request more info</button>
      <div class="muted small">${(isSpecialist() || isAdmin()) ? "" : "Only specialist/admin can create requests."}</div>
    `;
    panels.requests.querySelectorAll("button[data-fulfill]").forEach(b => {
      b.disabled = !(isReferrer() || isAdmin());
      b.addEventListener("click", () => updateRequestStatus(b.getAttribute("data-fulfill"), "fulfilled"));
    });
    panels.requests.querySelectorAll("button[data-close]").forEach(b => {
      b.disabled = !(isSpecialist() || isAdmin());
      b.addEventListener("click", () => updateRequestStatus(b.getAttribute("data-close"), "closed"));
    });
    const createRequestBtn = document.getElementById("createRequestBtn");
    createRequestBtn.disabled = !(isSpecialist() || isAdmin());
    createRequestBtn.addEventListener("click", createRequest);

    panels.attachments.innerHTML = `
      <div class="list">
        ${atts.length ? atts.slice().reverse().map(a => `
          <div class="item">
            <div>
              <strong>📎 ${escapeHtml(a.filename)}</strong>
              <div class="meta">${new Date(a.uploadedAt).toLocaleString()} • ${Math.round(a.sizeBytes/1024)} KB</div>
            </div>
            <button class="btn btn-ghost" data-download="${escapeHtml(a.attachmentId)}">Download</button>
          </div>
        `).join("") : `<div class="muted">No attachments yet.</div>`}
      </div>

      <div class="divider"></div>

      <label class="field">
        <span>Upload attachment (referrer/specialist/admin)</span>
        <input id="fileInput" type="file" />
      </label>
      <button id="uploadBtn" class="btn btn-primary">Upload</button>

      <div class="divider"></div>

      <label class="field">
        <span>Create share link</span>
        <select id="shareScope">
          <option value="patient_view">patient_view (view only)</option>
          <option value="download">download (view + download)</option>
          <option value="upload">upload (view + upload)</option>
          <option value="full">full (view + upload + download)</option>
        </select>
      </label>

      <div class="grid2">
        <label class="field"><span>Expires (minutes)</span><input id="shareMins" value="60" /></label>
        <label class="field"><span>Max uses</span><input id="shareUses" value="1" /></label>
      </div>

      <button id="createShareBtn" class="btn btn-ghost">Create share link</button>
      <div id="shareOut" class="muted small"></div>
    `;

    panels.attachments.querySelectorAll("button[data-download]").forEach(b => {
      b.addEventListener("click", () => downloadAttachment(b.getAttribute("data-download")));
    });

    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = !(isReferrer() || isSpecialist() || isAdmin());
    uploadBtn.addEventListener("click", uploadAttachment);

    const createShareBtn = document.getElementById("createShareBtn");
    createShareBtn.disabled = !(isReferrer() || isSpecialist() || isAdmin());
    createShareBtn.addEventListener("click", createShareLink);
  }

  panels.timeline.innerHTML = `
    <div class="list">
      ${tl.length ? tl.slice().reverse().map(e => `
        <div class="item">
          <div>
            <strong>⏱ ${escapeHtml(e.type)}</strong>
            <div class="meta">${new Date(e.at).toLocaleString()}</div>
          </div>
          <div class="meta">${escapeHtml(JSON.stringify(e.details||{}))}</div>
        </div>
      `).join("") : `<div class="muted">No timeline events.</div>`}
    </div>
  `;
}

// ---------------------------
// Detail actions
// ---------------------------
async function updateStatus() {
  const sel = document.getElementById("statusSelect");
  if (!sel || !currentReferralId) return;

  const status = sel.value;
  try {
    await api(`/referrals/${encodeURIComponent(currentReferralId)}`, { method: "PATCH", body: { status } });
    detailMsg.textContent = "✅ Status updated";
    await openDetails(currentReferralId);
    await loadReferrals();
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function sendNote() {
  const input = document.getElementById("noteInput");
  const message = input?.value?.trim();
  if (!message) return;

  try {
    await api(`/referrals/${encodeURIComponent(currentReferralId)}/notes`, { method: "POST", body: { message } });
    input.value = "";
    detailMsg.textContent = "✅ Note sent";
    await openDetails(currentReferralId);
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function createRequest() {
  const input = document.getElementById("requestItems");
  const raw = input?.value?.trim();
  if (!raw) return;

  const items = raw.split(",").map(x => x.trim()).filter(Boolean);
  if (!items.length) return;

  try {
    await api(`/referrals/${encodeURIComponent(currentReferralId)}/requests`, { method: "POST", body: { items } });
    input.value = "";
    detailMsg.textContent = "✅ Request created";
    await openDetails(currentReferralId);
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function updateRequestStatus(requestId, status) {
  try {
    await api(`/referrals/${encodeURIComponent(currentReferralId)}/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: { status }
    });
    detailMsg.textContent = `✅ Request ${status}`;
    await openDetails(currentReferralId);
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function uploadAttachment() {
  const fileInput = document.getElementById("fileInput");
  if (!fileInput?.files?.[0]) {
    detailMsg.textContent = "Choose a file first.";
    return;
  }

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);

  try {
    await api(`/referrals/${encodeURIComponent(currentReferralId)}/attachments`, { method: "POST", body: fd });
    fileInput.value = "";
    detailMsg.textContent = "✅ Uploaded";
    await openDetails(currentReferralId);
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function downloadAttachment(attachmentId) {
  try {
    const data = await api(`/referrals/${encodeURIComponent(currentReferralId)}/attachments/${encodeURIComponent(attachmentId)}/download`);
    if (data?.url) window.open(data.url, "_blank");
  } catch (e) {
    detailMsg.textContent = `Error: ${e.message}`;
  }
}

async function createShareLink() {
  const scope = document.getElementById("shareScope")?.value || "download";
  const expiresInMinutes = Number(document.getElementById("shareMins")?.value || 60);
  const maxUses = Number(document.getElementById("shareUses")?.value || 1);
  const out = document.getElementById("shareOut");

  try {
    const data = await api(`/referrals/${encodeURIComponent(currentReferralId)}/share-links`, {
      method: "POST",
      body: { scope, expiresInMinutes, maxUses }
    });

    // ✅ Pretty share page:
    // open /share.html#TOKEN
    const token = data.token;
    const link = token ? `/share.html#${token}` : (data.url || "");
    out.innerHTML = link
      ? `🔗 Share page: <a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`
      : "Created share link.";
  } catch (e) {
    out.textContent = `Error: ${e.message}`;
  }
}

// ---------------------------
// Wire up UI
// ---------------------------
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.getAttribute("data-tab")));
});

loginBtn.addEventListener("click", () => login(emailEl.value.trim(), passwordEl.value, { portal:false }));
logoutBtn.addEventListener("click", logout);
seedDemoBtn.addEventListener("click", seedDemo);
refreshBtn.addEventListener("click", async () => {
  // Admin-only: quick demo reset via console if you want
  if (isAdmin()) console.log("Admin: you can run resetDemoData() in console to reset demo.");
  await loadReferrals();
});
createReferralBtn.addEventListener("click", createReferral);
closeDetailBtn.addEventListener("click", hideDetails);

document.querySelectorAll("button[data-login]").forEach(b => {
  b.addEventListener("click", async () => {
    const role = b.getAttribute("data-login");
    await seedDemo();
    if (role === "referrer") return login("referrer@test.com", "pass123", { portal:false });
    if (role === "specialist") return login("specialist@test.com", "pass123", { portal:false });
    if (role === "patient") return login("patient@test.com", "pass123", { portal:false });
    if (role === "admin") return login("admin@test.com", "pass123", { portal:false });
    if (role === "patientView") return login("patient@test.com", "pass123", { portal:true });
  });
});

// Auto login
if (getToken()){
  tokenPayload = decodeJwt(getToken());
  setLoggedInUI(true);
  setPermissionsUI();
  loadReferrals();
} else {
  setLoggedInUI(false);
}

// Expose admin helper in console
window.resetDemoData = resetDemoData;