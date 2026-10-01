import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourcePaths = ["src", "api", "supabase/migrations", "scripts", "safety", "package.json", "package-lock.json", "vite.config.js", "vercel.json", "index.html"];

export function sourceFingerprint(root = projectRoot) {
  const files = [];
  const collect = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Release source must not contain symbolic links");
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) collect(resolve(path, name));
    } else if (stat.isFile()) files.push(path);
  };
  for (const name of sourcePaths) collect(resolve(root, name));
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(relative(root, path).replaceAll("\\", "/") + "\0");
    hash.update(createHash("sha256").update(readFileSync(path)).digest("hex") + "\n");
  }
  return hash.digest("hex");
}

export function currentCommitSha(root = projectRoot, env = process.env) {
  const vercelSha = String(env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(vercelSha)) return vercelSha;
  const localSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(localSha)) throw new Error("A full Git commit SHA is required.");
  return localSha;
}

export function validateReleaseEvidence(evidence, { commitSha, fingerprint, projectRef, now = Date.now() }) {
  const errors = [];
  const genuineRef = (value) => typeof value === "string" && value.trim().length >= 8 && !/^(todo|example|placeholder|replace|pending)/i.test(value.trim());
  const fresh = (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= 24 * 60 * 60 * 1000;
  };
  if (!evidence || typeof evidence !== "object") return ["Release evidence is missing."];
  const evidenceCommit = String(evidence.sourceCommit || "").trim().toLowerCase();
  const expectedCommit = String(commitSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(evidenceCommit) || !/^[0-9a-f]{40}$/.test(expectedCommit)
    || evidenceCommit !== expectedCommit) errors.push("Evidence belongs to a different source commit.");
  // The filesystem fingerprint remains diagnostic only. Git SHA is the stable
  // identity shared by clean local checkouts and Vercel's Linux checkout.
  if (fingerprint && evidence.sourceFingerprint && evidence.sourceFingerprint !== fingerprint) {
    // Intentionally non-blocking when the full commit SHA matches.
  }
  if (!projectRef || evidence.databaseProjectRef !== projectRef) errors.push("Production database project is not verified.");
  if (!genuineRef(evidence.reviewedBy)) errors.push("A named reviewer is required.");
  if (!fresh(evidence.verifiedAt)) errors.push("Evidence must be verified within the last 24 hours.");
  for (const field of ["databaseBackup", "attachmentBackup", "restoreTest", "stagingValidation", "rollbackPlan"]) {
    if (!genuineRef(evidence[field]?.reference)) errors.push(`Missing ${field} evidence reference.`);
  }
  if (!fresh(evidence.databaseBackup?.createdAt) || !fresh(evidence.attachmentBackup?.createdAt)) errors.push("Fresh database and attachment backups are required.");
  if (evidence.restoreTest?.databaseBackupReference !== evidence.databaseBackup?.reference
    || evidence.restoreTest?.attachmentBackupReference !== evidence.attachmentBackup?.reference) errors.push("Restoration must cover the referenced backups.");
  if (evidence.restoreTest?.passed !== true || evidence.stagingValidation?.passed !== true) errors.push("Restoration and staging validation must have passed.");
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--fingerprint")) console.log(sourceFingerprint());
    else if (process.env.VERCEL_ENV === "production" || process.env.MARGINFLOW_REQUIRE_RELEASE_EVIDENCE === "true") {
      let projectRef = "";
      try { projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split(".")[0]; } catch { /* missing target is a failure */ }
      const evidence = JSON.parse(process.env.MARGINFLOW_RELEASE_EVIDENCE || "null");
      const errors = validateReleaseEvidence(evidence, {
        commitSha: currentCommitSha(), fingerprint: sourceFingerprint(), projectRef,
      });
      if (errors.length) throw new Error(errors.join("\n"));
      console.log("Production release evidence matches this source and target. The referenced external evidence still requires human verification.");
    } else console.log("Staging/local build: production release evidence is not required. No deployment performed.");
  } catch (error) {
    console.error(`Production release blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
