import { buildLaptopRecoveryPreview } from "../domain/legacyRecovery.js";
import { loadRelationalInvoices } from "./invoiceRepository.js";

function scopedCatalogQuery(query, scope) {
  let scoped = query.eq("company_id", scope.companyId);
  if (scope.locationId) scoped = scoped.or(`location_id.is.null,location_id.eq.${scope.locationId}`);
  else scoped = scoped.is("location_id", null);
  return scoped;
}

async function loadTable(client, table, columns, scope) {
  const { data, error } = await scopedCatalogQuery(client.from(table).select(columns), scope);
  if (error) throw error;
  return data || [];
}

export async function loadLegacyRecoveryRelationalState(client, scope) {
  if (!client) throw new Error("Relational cloud access is required for laptop recovery.");
  const [suppliers, products, departments, invoices, resolutions, supplierProductMappings, invoiceLineCorrections] = await Promise.all([
    loadTable(client, "suppliers", "id,company_id,location_id,name,category,contact_name,email,phone,active,parser_key,metadata", scope),
    loadTable(client, "products", "id,company_id,location_id,supplier_id,department_id,name,pack_size,quantity,unit_cost,aliases,active,archived_at,merged_into_product_id,merge_metadata,metadata", scope),
    loadTable(client, "departments", "id,company_id,location_id,name,department_type,active,metadata", scope),
    loadRelationalInvoices(client, scope),
    loadTable(client, "marginflow_recovery_resolutions", "id,company_id,location_id,resolution_type,source_key,decision,target_id,value,metadata,revision,active,created_at,updated_at", scope),
    loadTable(client, "supplier_product_mappings", "id,supplier_id,supplier_product_code,supplier_description,product_id,allocation_mode,department_id,auto_apply,confirmation_count,active,source,metadata", scope),
    loadTable(client, "invoice_line_corrections", "id,supplier_id,invoice_id,invoice_line_id,product_id,supplier_product_code,product_name,field_name,original_value,corrected_value,metadata,created_at", scope),
  ]);
  return { suppliers, products, departments, invoices, resolutions, supplierProductMappings, invoiceLineCorrections };
}

export async function previewLaptopLegacyRecovery(client, snapshot, scope) {
  const relational = await loadLegacyRecoveryRelationalState(client, scope);
  return buildLaptopRecoveryPreview({ snapshot, relational, scope });
}

function syncedInvoice(invoice, result = {}) {
  return {
    ...invoice,
    syncStatus: "synced",
    syncError: "",
    relationalId: result.invoice_id || invoice.id,
    syncRevision: Number(result.sync_revision || invoice.syncRevision || 1),
    syncedAt: result.saved_at || new Date().toISOString(),
    persistenceSource: "relational",
  };
}

export async function recoverLaptopLegacyData(client, preview, {
  onInvoicePersisted = () => {},
} = {}) {
  if (!client || preview?.source !== "current_laptop") {
    throw new Error("A fresh current-laptop recovery preview is required before migration.");
  }
  const scope = preview.scope || {};
  let catalog = { suppliers_inserted: 0, suppliers_existing: 0, products_inserted: 0, products_existing: 0 };
  if (preview.suppliers.migrate.length || preview.products.migrate.length) {
    const { data, error } = await client.rpc("recover_legacy_catalog_v1", {
      p_company_id: scope.companyId,
      p_location_id: scope.locationId || null,
      p_suppliers: preview.suppliers.migrate,
      p_products: preview.products.migrate,
    });
    if (error) throw error;
    catalog = Array.isArray(data) ? data[0] : data;
  }

  let archive = { products_inserted: 0, products_existing: 0, invoices_inserted: 0, invoices_existing: 0 };
  if (preview.products.archived.length || preview.invoices.archived.length) {
    const { data, error } = await client.rpc("archive_legacy_recovery_v1", {
      p_company_id: scope.companyId,
      p_location_id: scope.locationId || null,
      p_products: preview.products.archived,
      p_invoices: preview.invoices.archived,
    });
    if (error) throw error;
    archive = Array.isArray(data) ? data[0] : data;
  }

  const imported = [];
  const failed = [];
  for (const invoice of preview.invoices.migrate) {
    try {
      const { data, error } = await client.rpc("recover_legacy_invoice_v1", {
        p_company_id: scope.companyId,
        p_location_id: scope.locationId || null,
        p_invoice: invoice,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      const synced = syncedInvoice(invoice, result || {});
      imported.push(synced);
      onInvoicePersisted(synced);
    } catch (error) {
      failed.push({ invoice, error: error.message || "Recovery import failed." });
    }
  }

  const verified = preview.invoices.already.map(({ cloud }) => cloud);
  verified.forEach(onInvoicePersisted);
  return {
    catalog,
    archive,
    imported,
    verified,
    failed,
    conflicts: preview.invoices.conflicts,
  };
}
