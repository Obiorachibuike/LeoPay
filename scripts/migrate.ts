/**
 * Applies database migrations. Usage: npm run db:migrate
 */
import "./load-env";
import { db, closeDb, describeDatabase } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { env } from "../src/lib/env";

async function main() {
  const target = describeDatabase();
  console.log(`Applying migrations to ${target.driver} ${target.target}`);
  await runMigrations(db);
  console.log("Migrations applied successfully.");
  await closeDb();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
