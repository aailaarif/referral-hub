import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  roles: { type: [String], default: [] }, // ["referrer_staff","specialist_staff","patient"]
  clinicId: { type: String } // keep simple for now
});

export default mongoose.model("User", UserSchema);
