const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PRODUCT_MERGE_SNAPSHOT_MODULES = Object.freeze([
  "products",
  "supplierProductMappings",
  "invoiceLineCorrections",
  "invoices",
  "stocktakes",
  "recipes",
  "menus",
  "wasteItems",
]);

export function productMergeSnapshotModules(snapshot = {}) {
  return Object.fromEntries(PRODUCT_MERGE_SNAPSHOT_MODULES.map((key) => [key, Array.isArray(snapshot[key]) ? snapshot[key] : []]));
}

export async function persistAtomicProductMerge(client, {
  companyId = "",
  locationId = "",
  keepProductId = "",
  mergeProductIds = [],
  nextSnapshot = {},
  expectedModuleRevisions = {},
} = {}) {
  const sourceIds = [...new Set(mergeProductIds.filter((id) => id && id !== keepProductId))];
  if (!client || !uuidPattern.test(companyId) || !uuidPattern.test(keepProductId) || !sourceIds.length || sourceIds.some((id) => !uuidPattern.test(id)) || (locationId && !uuidPattern.test(locationId))) {
    throw new Error("Product merge needs canonical company and product identifiers.");
  }
  const revisions = Object.fromEntries(PRODUCT_MERGE_SNAPSHOT_MODULES
    .filter((key) => key !== "invoices")
    .map((key) => [key, Number(expectedModuleRevisions[key] || 0)]));
  const { data, error } = await client.rpc("merge_product_v2", {
    p_company_id: companyId,
    p_location_id: locationId || null,
    p_keep_product_id: keepProductId,
    p_merge_product_ids: sourceIds,
    p_snapshot_modules: productMergeSnapshotModules(nextSnapshot),
    p_expected_module_revisions: revisions,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
