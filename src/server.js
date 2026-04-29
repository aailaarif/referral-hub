import dotenv from "dotenv";
dotenv.config();

import { connectDb } from "./db.js";
import { buildApp } from "./app.js";

await connectDb(process.env.MONGO_URI);

const app = buildApp();
app.listen(process.env.PORT, () => {
  console.log("API running on port", process.env.PORT);
});
