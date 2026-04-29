import { Router } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";

const router = Router();

// GET /download/:token
router.get("/:token", (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const filePath = payload.p;

    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send("File not found");
    return res.download(filePath);
  } catch {
    return res.status(403).send("Invalid or expired token");
  }
});

export default router;