import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const expected = JSON.parse(readFileSync(resolve(root, "safety/migration-checksums.json"), "utf8"));
const actualFiles = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
const failures = [];
for (const name of actualFiles) {
  const digest = createHash("sha256").update(readFileSync(resolve(root, "supabase/migrations", name))).digest("hex");
  if (!Object.hasOwn(expected, name)) failures.push(`Unreviewed migration: ${name}`);
  else if (expected[name] !== digest) failures.push(`Existing migration changed: ${name}`);
}
for (const name of Object.keys(expected)) if (!actualFiles.includes(name)) failures.push(`Migration removed: ${name}`);
if (failures.length) {
  console.error(failures.join("\n"));
  console.error("Data safety check FAILED. Review the migration and its preservation tests; do not regenerate the baseline just to bypass this check.");
  process.exitCode = 1;
} else {
  console.log(`Data safety check passed: ${actualFiles.length} original migrations unchanged; no new migration. This does not verify live backups or production configuration.`);
}
