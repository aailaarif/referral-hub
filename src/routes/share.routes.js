import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { nanoid } from "nanoid";

import ShareLink from "../models/ShareLink.js";
import Referral from "../models/Referral.js";

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function isExpired(link) {
  return new Date(link.expiresAt).getTime() < Date.now();
}

function canDownload(scope) {
  return scope === "download" || scope === "full";
}
function canUpload(scope) {
  return scope === "upload" || scope === "full";
}

function shareView(referral, scope) {
  // Keep share links limited. You can tune what is visible per scope.
  return {
    referralId: referral.referralId,
    status: referral.status,
    specialistClinicId: referral.specialistClinicId,
    reason: scope === "full" ? referral.reason : undefined,
    timeline: (referral.timeline || []).map(e => ({ at: e.at, type: e.type, details: e.details })),
    attachments: (referral.attachments || []).map(a => ({
      attachmentId: a.attachmentId,
      filename: a.filename,
      uploadedAt: a.uploadedAt
    }))
  };
}

// GET /share/:token (public limited view)
router.get("/:token", async (req, res) => {
  try {
    const tokenHash = hashToken(req.params.token);
    const link = await ShareLink.findOne({ tokenHash });
    if (!link) return res.status(404).json({ error: "Invalid share link" });

    if (isExpired(link)) return res.status(410).json({ error: "Share link expired" });
    if (link.uses >= link.maxUses) return res.status(410).json({ error: "Share link has no remaining uses" });

    const referral = await Referral.findOne({ referralId: link.referralId }).lean();
    if (!referral) return res.status(404).json({ error: "Referral not found" });

    // Count one "use" on view
    link.uses += 1;
    await link.save();

    res.json({
      scope: link.scope,
      referral: shareView(referral, link.scope),
      permissions: { canUpload: canUpload(link.scope), canDownload: canDownload(link.scope) }
    });
  } catch (err) {
    console.error("share GET failed:", err);
    res.status(500).json({ error: "Share link failed", detail: String(err?.message || err) });
  }
});

// POST /share/:token/attachments (public upload if scope allows)
router.post("/:token/attachments", upload.single("file"), async (req, res) => {
  try {
    const tokenHash = hashToken(req.params.token);
    const link = await ShareLink.findOne({ tokenHash });
    if (!link) return res.status(404).json({ error: "Invalid share link" });

    if (isExpired(link)) return res.status(410).json({ error: "Share link expired" });
    if (!canUpload(link.scope)) return res.status(403).json({ error: "Share link does not allow upload" });

    const referral = await Referral.findOne({ referralId: link.referralId });
    if (!referral) return res.status(404).json({ error: "Referral not found" });

    if (!req.file) return res.status(400).json({ error: "file is required (multipart/form-data key: file)" });

    const attachmentId = nanoid(10);
    referral.attachments.push({
      attachmentId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: req.file.path,
      uploadedByUserId: "share_link",
      uploadedAt: new Date()
    });

    referral.timeline.push({
      at: new Date(),
      type: "attachment_added",
      byUserId: "share_link",
      details: { attachmentId, filename: req.file.originalname }
    });

    await referral.save();
    res.status(201).json({ attachmentId });
  } catch (err) {
    console.error("share upload failed:", err);
    res.status(500).json({ error: "Share upload failed", detail: String(err?.message || err) });
  }
});

export default router;