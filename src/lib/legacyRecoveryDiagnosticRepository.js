import { diagnoseLaptopRecoveryConflicts } from "../domain/legacyRecoveryDiagnostics.js";
import { previewLaptopLegacyRecovery } from "./legacyRecoveryRepository.js";

export async function diagnoseLaptopLegacyRecovery(client, snapshot, scope, {
  exampleLimit = 15,
  previewRecovery = previewLaptopLegacyRecovery,
} = {}) {
  const preview = await previewRecovery(client, snapshot, scope);
  return {
    preview,
    report: diagnoseLaptopRecoveryConflicts(preview, { exampleLimit }),
  };
}
