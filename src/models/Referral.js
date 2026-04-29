import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    attachmentId: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storagePath: { type: String, required: true },
    uploadedByUserId: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const NoteSchema = new mongoose.Schema(
  {
    noteId: { type: String, required: true },
    at: { type: Date, default: Date.now },
    authorUserId: { type: String, required: true },
    message: { type: String, required: true }
  },
  { _id: false }
);

const RequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },

    // ✅ IMPORTANT FIX:
    // Older data may not have this field. Do NOT require it.
    // New requests created by the API will still set it.
    createdByUserId: { type: String, default: "legacy_unknown" },

    items: { type: [String], default: [] },
    status: { type: String, enum: ["open", "fulfilled", "closed"], default: "open" },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const TimelineEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },
    byUserId: { type: String },
    details: { type: Object, default: {} }
  },
  { _id: false }
);

const ReferralSchema = new mongoose.Schema(
  {
    referralId: { type: String, unique: true, index: true, required: true },

    referrerClinicId: { type: String, required: true },
    specialistClinicId: { type: String, required: true },
    createdByUserId: { type: String, required: true },

    patientUserId: { type: String },
    patientName: { type: String },
    patientEmail: { type: String },

    reason: { type: String, required: true },

    status: { type: String, enum: ["sent", "received", "scheduled", "closed"], default: "sent" },

    // ✅ defaults prevent undefined.push crashes
    timeline: { type: [TimelineEventSchema], default: [] },
    notes: { type: [NoteSchema], default: [] },
    requests: { type: [RequestSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model("Referral", ReferralSchema);