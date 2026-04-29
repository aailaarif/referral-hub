import dotenv from "dotenv";
dotenv.config();

import { connectDb } from "./db.js";
import { buildApp } from "./app.js";

async function main() {
  try {
    await connectDb(process.env.MONGO_URI);

    const app = buildApp();

    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
      console.log("API running on port", port);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
}

main();