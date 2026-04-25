import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const start = async () => {
  await connectDatabase(env.mongodbUri);
  const app = createApp();

  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
