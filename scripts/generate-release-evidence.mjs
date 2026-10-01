import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentCommitSha, sourceFingerprint, validateReleaseEvidence } from "./check-production-release.mjs";

const evidencePath = resolve(process.argv[2] || "release-evidence.json");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
evidence.sourceCommit = currentCommitSha();
evidence.sourceFingerprint = sourceFingerprint();

const errors = validateReleaseEvidence(evidence, {
  commitSha: currentCommitSha(),
  fingerprint: sourceFingerprint(),
  projectRef: evidence.databaseProjectRef,
});
if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ sourceCommit: evidence.sourceCommit, sourceFingerprint: evidence.sourceFingerprint }));
