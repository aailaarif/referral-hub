import dotenv from "dotenv";
dotenv.config();

import { connectDb } from "./db.js";
import { buildApp } from "./app.js";

await connectDb(process.env.MONGO_URI);

const app = buildApp();

// Azure sets PORT. Fallback helps local runs.
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log("API running on port", port);
});