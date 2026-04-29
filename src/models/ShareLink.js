import mongoose from "mongoose";

const ShareLinkSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, unique: true, index: true, required: true },
    referralId: { type: String, index: true, required: true },

    // patient_view: view only
    // download: view + download
    // upload: view + upload
    // full: view + upload + download
    scope: { type: String, enum: ["patient_view", "download", "upload", "full"], required: true },

    expiresAt: { type: Date, required: true },
    maxUses: { type: Number, default: 1 },
    uses: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("ShareLink", ShareLinkSchema);