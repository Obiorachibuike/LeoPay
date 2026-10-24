import { defineConfig } from "drizzle-kit";
import "./scripts/load-env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/leopay",
  },
  strict: true,
  verbose: true,
});
