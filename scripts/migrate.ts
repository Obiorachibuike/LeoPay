/**
 * Applies database migrations. Usage: npm run db:migrate
 */
import { db, closeDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { env } from "../src/lib/env";

async function main() {
  console.log(`Applying migrations using driver: ${env.dbDriver}`);
  await runMigrations(db);
  console.log("Migrations applied successfully.");
  await closeDb();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
