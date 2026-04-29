import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

import { requireAuth } from "../middleware/requireAuth.js";
import User from "../models/User.js";
import Referral from "../models/Referral.js";
import ShareLink from "../models/ShareLink.js";

const router = Router();

function requireDemoResetEnabled(req, res, next) {
  if (process.env.ALLOW_DEMO_RESET !== "true") {
    return res.status(403).json({ error: "Demo reset disabled (set ALLOW_DEMO_RESET=true)" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.roles?.includes("admin")) return res.status(403).json({ error: "Admin only" });
  next();
}

async function upsertUser({ email, password, roles, clinicId }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });
  if (user) {
    const merged = Array.from(new Set([...(user.roles || []), ...(roles || [])]));
    user.roles = merged;
    user.clinicId = clinicId ?? user.clinicId;
    await user.save();
    return user;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  user = await User.create({ email: normalizedEmail, passwordHash, roles, clinicId });
  return user;
}

router.post("/reset", requireAuth, requireAdmin, requireDemoResetEnabled, async (req, res) => {
  // Wipe only app data (safe for demo)
  await Referral.deleteMany({});
  await ShareLink.deleteMany({});

  // Ensure demo users exist (and roles are correct)
  const referrer = await upsertUser({ email: "referrer@test.com", password: "pass123", roles: ["referrer_staff"], clinicId: "clinicA" });
  const specialist = await upsertUser({ email: "specialist@test.com", password: "pass123", roles: ["specialist_staff"], clinicId: "clinicB" });
  const patient = await upsertUser({ email: "patient@test.com", password: "pass123", roles: ["patient"], clinicId: null });
  const admin = await upsertUser({ email: "admin@test.com", password: "pass123", roles: ["admin"], clinicId: null });

  const referralId = `R-${new Date().getFullYear()}-${nanoid(8)}`;

  const referral = await Referral.create({
    referralId,
    referrerClinicId: "clinicA",
    specialistClinicId: "clinicB",
    createdByUserId: referrer._id.toString(),
    patientUserId: patient._id.toString(),
    patientEmail: "patient@test.com",
    patientName: "Jane Doe",
    reason: "Demo: cardiology consult requested",
    status: "sent",
    timeline: [{ at: new Date(), type: "created", byUserId: referrer._id.toString(), details: { demo: true } }],
    notes: [
      { noteId: nanoid(10), at: new Date(), authorUserId: referrer._id.toString(), message: "Hi! Sending referral with initial notes for review." }
    ],
    requests: [
      { requestId: nanoid(10), createdAt: new Date(), createdByUserId: specialist._id.toString(), items: ["Insurance card", "Recent labs"], status: "open", updatedAt: new Date() }
    ],
    attachments: []
  });

  // add timeline events for note + request
  await Referral.updateOne(
    { _id: referral._id },
    {
      $push: {
        timeline: {
          $each: [
            { at: new Date(), type: "note_added", byUserId: referrer._id.toString(), details: { demo: true } },
            { at: new Date(), type: "request_created", byUserId: specialist._id.toString(), details: { demo: true } }
          ]
        }
      }
    }
  );

  res.json({
    ok: true,
    demo: {
      referralId: referral.referralId,
      logins: [
        { role: "referrer", email: "referrer@test.com", password: "pass123" },
        { role: "specialist", email: "specialist@test.com", password: "pass123" },
        { role: "patient", email: "patient@test.com", password: "pass123" },
        { role: "admin", email: "admin@test.com", password: "pass123" }
      ]
    }
  });
});

export default router;