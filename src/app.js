import express from "express";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.routes.js";
import referralRoutes from "./routes/referrals.routes.js";
import shareRoutes from "./routes/share.routes.js";
import downloadRoutes from "./routes/download.routes.js";
import demoRoutes from "./routes/demo.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "10mb" }));
  app.use(mongoSanitize());

  // ok for same-origin; helps if you run frontend elsewhere
  app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/auth", authRoutes);
  app.use("/referrals", referralRoutes);

  // Public routes
  app.use("/share", shareRoutes);
  app.use("/download", downloadRoutes);

  // Demo reset route
  app.use("/demo", demoRoutes);

  // Serve frontend
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}