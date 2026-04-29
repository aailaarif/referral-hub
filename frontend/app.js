// ====== CONFIG ======
const BASE_URL = "http://localhost:3001"; // backend

// ====== DOM ======
const baseUrlLabel = document.getElementById("baseUrlLabel");
baseUrlLabel.textContent = BASE_URL;

const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const detailSection = document.getElementById("detailSection");

const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const specialistClinicIdEl = document.getElementById("specialistClinicId");
const reasonEl = document.getElementById("reason");
const createReferralBtn = document.getElementById("createReferralBtn");
const createMsg = document.getElementById("createMsg");

const refreshBtn = document.getElementById("refreshBtn");
const referralsList = document.getElementById("referralsList");

const closeDetailBtn = document.getElementById("closeDetailBtn");
const detailBody = document.getElementById("detailBody");
const statusSelect = document.getElementById("statusSelect");
const updateStatusBtn = document.getElementById("updateStatusBtn");
const detailMsg = document.getElementById("detailMsg");

// ====== STATE ======
let currentReferralId = null;
let lastReferral = null; // store last loaded referral details
let lastTokenPayload = null; // decoded JWT payload

// ====== HELPERS ======
function getToken() {
    return localStorage.getItem("accessToken");
}
function setToken(token) {
    localStorage.setItem("accessToken", token);
}
function clearToken() {
    localStorage.removeItem("accessToken");
}

function decodeJwt(token) {
    try {
        const part = token.split(".")[1];
        const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json);
    } catch {
        return null;
    }
}

async function api(path, { method = "GET", body } = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!res.ok) {
        const msg = data?.error || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

function setLoggedInUI(isLoggedIn) {
    loginSection.classList.toggle("hidden", isLoggedIn);
    appSection.classList.toggle("hidden", !isLoggedIn);
    logoutBtn.classList.toggle("hidden", !isLoggedIn);

    if (!isLoggedIn) {
        whoami.textContent = "Not logged in";
        return;
    }

    const roles = lastTokenPayload?.roles?.join(", ") || "unknown role";
    const clinic = lastTokenPayload?.clinicId ? ` • clinic: ${lastTokenPayload.clinicId}` : "";
    whoami.textContent = `Logged in • roles: ${roles}${clinic}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
}

function isReferrer() {
    return lastTokenPayload?.roles?.includes("referrer_staff");
}
function isSpecialist() {
    return lastTokenPayload?.roles?.includes("specialist_staff");
}

function hideDetails() {
    currentReferralId = null;
    lastReferral = null;
    detailSection.classList.add("hidden");
    detailBody.innerHTML = "";
    detailMsg.textContent = "";
}

// ====== ACTIONS ======
async function login() {
    loginError.textContent = "";
    const email = emailEl.value.trim();
    const password = passwordEl.value;

    try {
        const data = await api("/auth/login", { method: "POST", body: { email, password } });
        setToken(data.accessToken);

        lastTokenPayload = decodeJwt(data.accessToken);
        setLoggedInUI(true);

        await loadReferrals();
    } catch (e) {
        loginError.textContent = e.message;
    }
}

async function logout() {
    clearToken();
    lastTokenPayload = null;
    setLoggedInUI(false);
    referralsList.innerHTML = "";
    hideDetails();
}

async function loadReferrals() {
    referralsList.innerHTML = `<div class="muted">Loading...</div>`;
    try {
        const data = await api("/referrals");
        const referrals = data.referrals || [];

        if (!referrals.length) {
            referralsList.innerHTML = `<div class="muted">No referrals found.</div>`;
            return;
        }

        referralsList.innerHTML = referrals.map(r => `
      <div class="item">
        <div>
          <div><strong>${escapeHtml(r.referralId)}</strong></div>
          <div class="muted small">status: ${escapeHtml(r.status)} • updated: ${new Date(r.updatedAt).toLocaleString()}</div>
        </div>
        <button data-open="${escapeHtml(r.referralId)}" class="secondary">Open</button>
      </div>
    `).join("");

        referralsList.querySelectorAll("button[data-open]").forEach(btn => {
            btn.addEventListener("click", () => openDetails(btn.getAttribute("data-open")));
        });
    } catch (e) {
        referralsList.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
}

async function createReferral() {
    createMsg.textContent = "";
    const specialistClinicId = specialistClinicIdEl.value.trim();
    const reason = reasonEl.value.trim();

    if (!specialistClinicId || !reason) {
        createMsg.textContent = "Please fill specialistClinicId and reason.";
        return;
    }

    try {
        const data = await api("/referrals", {
            method: "POST",
            body: { specialistClinicId, reason }
        });
        createMsg.textContent = `Created: ${data.referralId}`;
        specialistClinicIdEl.value = "";
        reasonEl.value = "";
        await loadReferrals();
    } catch (e) {
        createMsg.textContent = `Error: ${e.message}`;
    }
}

async function openDetails(referralId) {
    detailMsg.textContent = "";
    currentReferralId = referralId;
    detailSection.classList.remove("hidden");
    detailBody.innerHTML = `<div class="muted">Loading...</div>`;

    try {
        const data = await api(`/referrals/${encodeURIComponent(referralId)}`);
        lastReferral = data.referral;

        renderDetails();
    } catch (e) {
        lastReferral = null;
        detailBody.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
}

function renderDetails() {
    const r = lastReferral;
    if (!r) return;

    const notes = Array.isArray(r.notes) ? r.notes : [];
    const requests = Array.isArray(r.requests) ? r.requests : [];
    const timeline = Array.isArray(r.timeline) ? r.timeline : [];

    // buttons enabled based on role
    const canSendNote =
        (isReferrer() && r.referrerClinicId === lastTokenPayload?.clinicId) ||
        (isSpecialist() && r.specialistClinicId === lastTokenPayload?.clinicId);

    const canRequestMoreInfo = isSpecialist() && r.specialistClinicId === lastTokenPayload?.clinicId;

    detailBody.innerHTML = `
    <div class="grid2">
      <div>
        <div class="muted small">Referral ID</div>
        <div><strong>${escapeHtml(r.referralId)}</strong></div>
      </div>
      <div>
        <div class="muted small">Status</div>
        <div>${escapeHtml(r.status)}</div>
      </div>
      <div>
        <div class="muted small">Referrer Clinic</div>
        <div>${escapeHtml(r.referrerClinicId)}</div>
      </div>
      <div>
        <div class="muted small">Specialist Clinic</div>
        <div>${escapeHtml(r.specialistClinicId)}</div>
      </div>
    </div>

    <div style="margin-top:12px;">
      <div class="muted small">Reason</div>
      <div>${escapeHtml(r.reason)}</div>
    </div>

    <hr style="margin:16px 0; border:0; border-top:1px solid #2a2f3a;" />

    <div>
      <div class="row space">
        <h3 style="margin:0;">Notes</h3>
      </div>

      <div class="list" style="margin-top:10px;">
        ${notes.length ? notes.slice().reverse().map(n => `
          <div class="item">
            <div>
              <div><strong>${escapeHtml(n.authorId)}</strong></div>
              <div class="muted small">${new Date(n.at).toLocaleString()}</div>
            </div>
            <div style="max-width: 520px;">${escapeHtml(n.message)}</div>
          </div>
        `).join("") : `<div class="muted">No notes yet.</div>`}
      </div>

      <div class="row" style="margin-top:10px;">
        <input id="noteInput" class="grow" placeholder="Write a message..." />
        <button id="sendNoteBtn" ${canSendNote ? "" : "disabled"}>Send</button>
      </div>
      <div class="muted small">${canSendNote ? "" : "You don't have permission to add notes for this referral."}</div>
    </div>

    <hr style="margin:16px 0; border:0; border-top:1px solid #2a2f3a;" />

    <div>
      <div class="row space">
        <h3 style="margin:0;">Requests for More Info</h3>
      </div>

      <div class="list" style="margin-top:10px;">
        ${requests.length ? requests.slice().reverse().map(req => `
          <div class="item">
            <div>
              <div><strong>Request ${escapeHtml(req.requestId)}</strong> • <span class="muted">status: ${escapeHtml(req.status)}</span></div>
              <div class="muted small">${req.createdAt ? new Date(req.createdAt).toLocaleString() : ""}</div>
              <div class="muted small">Items: ${escapeHtml((req.items || []).join(", "))}</div>
            </div>
            <div class="row">
              <button class="secondary" data-fulfill="${escapeHtml(req.requestId)}" ${isReferrer() && req.status === "open" ? "" : "disabled"}>Mark fulfilled</button>
              <button class="secondary" data-close="${escapeHtml(req.requestId)}" ${isSpecialist() && req.status !== "closed" ? "" : "disabled"}>Close</button>
            </div>
          </div>
        `).join("") : `<div class="muted">No requests yet.</div>`}
      </div>

      <div style="margin-top:10px;">
        <label>
          Specialist: request more info (comma-separated)
          <input id="requestItemsInput" placeholder="Lab results, Insurance card, Imaging report" />
        </label>
        <button id="createRequestBtn" ${canRequestMoreInfo ? "" : "disabled"} style="margin-top:8px;">Request more info</button>
        <div class="muted small">${canRequestMoreInfo ? "" : "Only the specialist clinic can create requests."}</div>
      </div>
    </div>

    <hr style="margin:16px 0; border:0; border-top:1px solid #2a2f3a;" />

    <div>
      <h3 style="margin:0 0 10px;">Timeline</h3>
      <div class="list">
        ${timeline.length ? timeline.slice().reverse().map(ev => `
          <div class="item">
            <div>
              <div><strong>${escapeHtml(ev.type)}</strong></div>
              <div class="muted small">${new Date(ev.at).toLocaleString()}</div>
            </div>
            <div class="muted small">${escapeHtml(JSON.stringify(ev.details || {}))}</div>
          </div>
        `).join("") : `<div class="muted">No timeline events.</div>`}
      </div>
    </div>
  `;

    // wire up note send
    const noteInput = document.getElementById("noteInput");
    const sendNoteBtn = document.getElementById("sendNoteBtn");
    if (sendNoteBtn) {
        sendNoteBtn.addEventListener("click", async () => {
            const msg = (noteInput?.value || "").trim();
            if (!msg) return;
            await sendNote(msg);
            noteInput.value = "";
        });
    }

    // wire up request creation
    const requestItemsInput = document.getElementById("requestItemsInput");
    const createRequestBtn = document.getElementById("createRequestBtn");
    if (createRequestBtn) {
        createRequestBtn.addEventListener("click", async () => {
            const raw = (requestItemsInput?.value || "").trim();
            if (!raw) return;
            const items = raw.split(",").map(x => x.trim()).filter(Boolean);
            if (!items.length) return;
            await createRequest(items);
            requestItemsInput.value = "";
        });
    }

    // wire up fulfill/close buttons
    detailBody.querySelectorAll("button[data-fulfill]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const requestId = btn.getAttribute("data-fulfill");
            await updateRequestStatus(requestId, "fulfilled");
        });
    });

    detailBody.querySelectorAll("button[data-close]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const requestId = btn.getAttribute("data-close");
            await updateRequestStatus(requestId, "closed");
        });
    });
}

async function sendNote(message) {
    detailMsg.textContent = "";
    try {
        await api(`/referrals/${encodeURIComponent(currentReferralId)}/notes`, {
            method: "POST",
            body: { message }
        });
        detailMsg.textContent = "Note sent.";
        await openDetails(currentReferralId);
        await loadReferrals();
    } catch (e) {
        detailMsg.textContent = `Error: ${e.message}`;
    }
}

async function createRequest(items) {
    detailMsg.textContent = "";
    try {
        const data = await api(`/referrals/${encodeURIComponent(currentReferralId)}/requests`, {
            method: "POST",
            body: { items }
        });
        detailMsg.textContent = `Requested more info (${data.requestId}).`;
        await openDetails(currentReferralId);
    } catch (e) {
        detailMsg.textContent = `Error: ${e.message} (Are you logged in as specialist?)`;
    }
}

async function updateRequestStatus(requestId, status) {
    detailMsg.textContent = "";
    try {
        await api(`/referrals/${encodeURIComponent(currentReferralId)}/requests/${encodeURIComponent(requestId)}`, {
            method: "PATCH",
            body: { status }
        });
        detailMsg.textContent = `Request ${requestId} updated to ${status}.`;
        await openDetails(currentReferralId);
    } catch (e) {
        detailMsg.textContent = `Error: ${e.message}`;
    }
}

async function updateStatus() {
    detailMsg.textContent = "";
    if (!currentReferralId) return;

    try {
        const status = statusSelect.value;
        const data = await api(`/referrals/${encodeURIComponent(currentReferralId)}`, {
            method: "PATCH",
            body: { status }
        });
        detailMsg.textContent = `Updated status to: ${data.status}`;
        await openDetails(currentReferralId);
        await loadReferrals();
    } catch (e) {
        detailMsg.textContent = `Error: ${e.message} (Are you logged in as specialist?)`;
    }
}

// ====== WIRE UP ======
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
refreshBtn.addEventListener("click", loadReferrals);
createReferralBtn.addEventListener("click", createReferral);
closeDetailBtn.addEventListener("click", hideDetails);
updateStatusBtn.addEventListener("click", updateStatus);

// auto-login UI if token exists
if (getToken()) {
    lastTokenPayload = decodeJwt(getToken());
    setLoggedInUI(true);
    loadReferrals();
} else {
    setLoggedInUI(false);
}