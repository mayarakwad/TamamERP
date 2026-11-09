import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Same default as the app (src/lib/db-core.ts), so a fresh copy installs before .env exists.
    url: process.env.DATABASE_URL ?? "file:./data/tamam.db",
  },
});
