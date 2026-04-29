import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), roles: user.roles, clinicId: user.clinicId || null },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );
}

async function upsertDemoUser({ email, password, roles, clinicId }) {
  const existing = await User.findOne({ email });
  if (existing) return { user: existing, existed: true };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, roles, clinicId });
  return { user, existed: false };
}

// Seed ONE user (safe)
router.post("/seed-user", async (req, res) => {
  const { email, password, roles = [], clinicId = "clinicA" } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email + password required" });

  const { user, existed } = await upsertDemoUser({ email, password, roles, clinicId });
  res.status(existed ? 200 : 201).json({ id: user._id, existed });
});

// Seed ALL demo users (safe)
router.post("/seed-demo", async (req, res) => {
  const demo = [
    { email: "referrer@test.com", password: "pass123", roles: ["referrer_staff"], clinicId: "clinicA" },
    { email: "specialist@test.com", password: "pass123", roles: ["specialist_staff"], clinicId: "clinicB" },
    { email: "patient@test.com", password: "pass123", roles: ["patient"], clinicId: null },
    { email: "admin@test.com", password: "pass123", roles: ["admin"], clinicId: null }
  ];

  const results = [];
  for (const u of demo) {
    const { user, existed } = await upsertDemoUser(u);
    results.push({ email: u.email, existed, id: user._id });
  }

  res.json({ ok: true, users: results });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email + password required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(403).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(403).json({ error: "Invalid credentials" });

  const accessToken = signToken(user);
  res.json({ accessToken });
});

router.post("/logout", (req, res) => res.json({ ok: true }));

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: { id: req.user.sub, roles: req.user.roles, clinicId: req.user.clinicId }
  });
});

export default router;