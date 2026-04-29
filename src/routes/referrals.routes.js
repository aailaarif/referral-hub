import { Router } from "express";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import multer from "multer";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { requireAuth } from "../middleware/requireAuth.js";
import Referral from "../models/Referral.js";
import ShareLink from "../models/ShareLink.js";

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ---------------- Helpers ----------------
function isReferrer(user) { return user.roles?.includes("referrer_staff"); }
function isSpecialist(user) { return user.roles?.includes("specialist_staff"); }
function isPatient(user) { return user.roles?.includes("patient"); }
function isAdmin(user) { return user.roles?.includes("admin"); }

function canAccessReferral(user, referral) {
  if (isAdmin(user)) return true;
  if (isReferrer(user) && referral.referrerClinicId === user.clinicId) return true;
  if (isSpecialist(user) && referral.specialistClinicId === user.clinicId) return true;
  if (isPatient(user) && referral.patientUserId && referral.patientUserId === user.sub) return true;
  return false;
}

function patientLimitedView(referral) {
  return {
    referralId: referral.referralId,
    status: referral.status,
    specialistClinicId: referral.specialistClinicId,
    timeline: (referral.timeline || []).map(e => ({ at: e.at, type: e.type, details: e.details }))
  };
}

const allowedTransitions = {
  sent: ["received"],
  received: ["scheduled", "closed"],
  scheduled: ["closed"],
  closed: []
};

// ---------------- Referrals ----------------

// POST /referrals
router.post("/", requireAuth, async (req, res) => {
  if (!isReferrer(req.user) && !isAdmin(req.user)) return res.status(403).json({ error: "Forbidden" });

  const { specialistClinicId, reason, patientUserId, patientName, patientEmail } = req.body || {};
  if (!specialistClinicId || !reason) return res.status(400).json({ error: "specialistClinicId and reason required" });

  const referralId = `R-${new Date().getFullYear()}-${nanoid(8)}`;

  const referral = await Referral.create({
    referralId,
    referrerClinicId: req.user.clinicId || "admin",
    specialistClinicId,
    createdByUserId: req.user.sub,

    patientUserId: patientUserId || undefined,
    patientName: patientName || undefined,
    patientEmail: patientEmail ? String(patientEmail).trim().toLowerCase() : undefined,

    reason,
    status: "sent",
    timeline: [{ at: new Date(), type: "created", byUserId: req.user.sub, details: {} }],
    notes: [],
    requests: [],
    attachments: []
  });

  res.status(201).set("Location", `/referrals/${referral.referralId}`).json({ referralId: referral.referralId });
});

// GET /referrals
router.get("/", requireAuth, async (req, res) => {
  let filter = {};

  if (isAdmin(req.user)) filter = {};
  else if (isSpecialist(req.user)) filter = { specialistClinicId: req.user.clinicId };
  else if (isReferrer(req.user)) filter = { referrerClinicId: req.user.clinicId };
  else if (isPatient(req.user)) filter = { patientUserId: req.user.sub };
  else return res.status(403).json({ error: "Forbidden" });

  const referrals = await Referral.find(filter).sort({ updatedAt: -1 }).lean();

  if (isPatient(req.user) && !isAdmin(req.user)) {
    return res.json({ referrals: referrals.map(r => ({ referralId: r.referralId, status: r.status, updatedAt: r.updatedAt })) });
  }

  res.json({ referrals });
});

// GET /referrals/:referralId
router.get("/:referralId", requireAuth, async (req, res) => {
  const referral = await Referral.findOne({ referralId: req.params.referralId }).lean();
  if (!referral) return res.status(404).json({ error: "Not found" });

  if (!canAccessReferral(req.user, referral)) return res.status(403).json({ error: "Forbidden" });

  if (isPatient(req.user) && !isAdmin(req.user)) {
    return res.json({ referral: patientLimitedView(referral) });
  }

  res.json({ referral });
});

// PATCH /referrals/:referralId (status)
router.patch("/:referralId", requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!["sent", "received", "scheduled", "closed"].includes(status)) return res.status(400).json({ error: "Bad status" });

  const referral = await Referral.findOne({ referralId: req.params.referralId });
  if (!referral) return res.status(404).json({ error: "Not found" });

  if (!(isSpecialist(req.user) || isAdmin(req.user))) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin(req.user) && referral.specialistClinicId !== req.user.clinicId) return res.status(403).json({ error: "Forbidden" });

  const current = referral.status;
  if (!allowedTransitions[current].includes(status)) {
    return res.status(400).json({ error: "Invalid status transition", current, next: status });
  }

  referral.timeline ??= [];
  referral.status = status;
  referral.timeline.push({ at: new Date(), type: "status_changed", byUserId: req.user.sub, details: { from: current, to: status } });

  await referral.save();
  res.json({ referralId: referral.referralId, status: referral.status });
});

// ---------------- Notes ----------------
router.post("/:referralId/notes", requireAuth, async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message required" });

  const referral = await Referral.findOne({ referralId: req.params.referralId });
  if (!referral) return res.status(404).json({ error: "Not found" });
  if (!canAccessReferral(req.user, referral)) return res.status(403).json({ error: "Forbidden" });

  if (!(isReferrer(req.user) || isSpecialist(req.user) || isAdmin(req.user))) return res.status(403).json({ error: "Forbidden" });

  referral.notes ??= [];
  referral.timeline ??= [];

  referral.notes.push({ noteId: nanoid(10), at: new Date(), authorUserId: req.user.sub, message });
  referral.timeline.push({ at: new Date(), type: "note_added", byUserId: req.user.sub, details: {} });

  await referral.save();
  res.status(201).json({ ok: true });
});

// ---------------- Requests ----------------
router.post("/:referralId/requests", requireAuth, async (req, res) => {
  if (!(isSpecialist(req.user) || isAdmin(req.user))) return res.status(403).json({ error: "Forbidden" });

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items[] required" });

  const referral = await Referral.findOne({ referralId: req.params.referralId });
  if (!referral) return res.status(404).json({ error: "Not found" });
  if (!isAdmin(req.user) && referral.specialistClinicId !== req.user.clinicId) return res.status(403).json({ error: "Forbidden" });

  referral.requests ??= [];
  referral.timeline ??= [];

  const requestId = nanoid(10);
  referral.requests.push({
    requestId,
    createdAt: new Date(),
    createdByUserId: req.user.sub,
    items: items.map(String),
    status: "open",
    updatedAt: new Date()
  });

  referral.timeline.push({ at: new Date(), type: "request_created", byUserId: req.user.sub, details: { requestId } });

  await referral.save();
  res.status(201).json({ requestId });
});

router.patch("/:referralId/requests/:requestId", requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!["fulfilled", "closed"].includes(status)) return res.status(400).json({ error: "status must be fulfilled or closed" });

  const referral = await Referral.findOne({ referralId: req.params.referralId });
  if (!referral) return res.status(404).json({ error: "Not found" });
  if (!canAccessReferral(req.user, referral)) return res.status(403).json({ error: "Forbidden" });

  referral.requests ??= [];
  referral.timeline ??= [];

  const reqItem = referral.requests.find(r => r.requestId === req.params.requestId);
  if (!reqItem) return res.status(404).json({ error: "Request not found" });

  const refOk = isReferrer(req.user) && referral.referrerClinicId === req.user.clinicId;
  const specOk = isSpecialist(req.user) && referral.specialistClinicId === req.user.clinicId;

  if (!isAdmin(req.user)) {
    if (status === "fulfilled" && !refOk) return res.status(403).json({ error: "Forbidden" });
    if (status === "closed" && !specOk) return res.status(403).json({ error: "Forbidden" });
  }

  reqItem.status = status;
  reqItem.updatedAt = new Date();

  referral.timeline.push({ at: new Date(), type: "request_updated", byUserId: req.user.sub, details: { requestId: reqItem.requestId, status } });

  await referral.save();
  res.json({ ok: true });
});

// ---------------- Attachments ----------------
router.post("/:referralId/attachments", requireAuth, upload.single("file"), async (req, res) => {
  const referral = await Referral.findOne({ referralId: req.params.referralId });
  if (!referral) return res.status(404).json({ error: "Not found" });

  const canUpload =
    isAdmin(req.user) ||
    (isReferrer(req.user) && referral.referrerClinicId === req.user.clinicId) ||
    (isSpecialist(req.user) && referral.specialistClinicId === req.user.clinicId);

  if (!canUpload) return res.status(403).json({ error: "Forbidden" });
  if (!req.file) return res.status(400).json({ error: "file is required (multipart/form-data key: file)" });

  // ✅ self-heal old referrals
  referral.attachments ??= [];
  referral.timeline ??= [];

  const attachmentId = nanoid(10);
  referral.attachments.push({
    attachmentId,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    storagePath: req.file.path,
    uploadedByUserId: req.user.sub,
    uploadedAt: new Date()
  });

  referral.timeline.push({ at: new Date(), type: "attachment_added", byUserId: req.user.sub, details: { attachmentId, filename: req.file.originalname } });

  await referral.save();
  res.status(201).json({ attachmentId });
});

router.get("/:referralId/attachments", requireAuth, async (req, res) => {
  const referral = await Referral.findOne({ referralId: req.params.referralId }).lean();
  if (!referral) return res.status(404).json({ error: "Not found" });
  if (!canAccessReferral(req.user, referral)) return res.status(403).json({ error: "Forbidden" });

  res.json({ attachments: referral.attachments || [] });
});

router.get("/:referralId/attachments/:attachmentId/download", requireAuth, async (req, res) => {
  const referral = await Referral.findOne({ referralId: req.params.referralId }).lean();
  if (!referral) return res.status(404).json({ error: "Not found" });
  if (!canAccessReferral(req.user, referral)) return res.status(403).json({ error: "Forbidden" });

  const a = (referral.attachments || []).find(x => x.attachmentId === req.params.attachmentId);
  if (!a) return res.status(404).json({ error: "Attachment not found" });

  const token = jwt.sign(
    { referralId: referral.referralId, attachmentId: a.attachmentId, p: a.storagePath },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

  res.json({ url: `/download/${token}` });
});

// ---------------- Share Links ----------------
router.post("/:referralId/share-links", requireAuth, async (req, res) => {
  try {
    const { scope, expiresInMinutes, maxUses } = req.body || {};

    if (!["patient_view", "download", "upload", "full"].includes(scope)) {
      return res.status(400).json({ error: "scope invalid" });
    }

    const mins = Number(expiresInMinutes || 60);
    const uses = Number(maxUses || 1);

    const referral = await Referral.findOne({ referralId: req.params.referralId }).lean();
    if (!referral) return res.status(404).json({ error: "Referral not found" });

    const canCreate =
      isAdmin(req.user) ||
      (isReferrer(req.user) && referral.referrerClinicId === req.user.clinicId) ||
      (isSpecialist(req.user) && referral.specialistClinicId === req.user.clinicId);

    if (!canCreate) return res.status(403).json({ error: "Forbidden" });

    const rawToken = nanoid(40);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + mins * 60 * 1000);

    await ShareLink.create({
      tokenHash,
      referralId: referral.referralId,
      scope,
      expiresAt,
      maxUses: uses,
      uses: 0
    });

    res.status(201).json({ token: rawToken, url: `/share/${rawToken}`, scope, expiresAt, maxUses: uses });
  } catch (err) {
    console.error("share-links create failed:", err);
    res.status(500).json({ error: "Failed to create share link", detail: String(err?.message || err) });
  }
});

export default router;