import { invoiceComparisonFinancials, firstInvoiceAmount } from "./invoiceFinancials.js";

function text(value = "") {
  return String(value ?? "").trim();
}

function rounded(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function amountMatches(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

function invoiceId(invoice = {}) {
  return text(invoice.id || invoice.relationalId || invoice.relational_id);
}

export function safeFinancialHeaderRepairCandidates(preview = {}) {
  return (preview.invoices?.already || []).flatMap((entry) => {
    const local = entry.local || {};
    const cloud = entry.cloud || {};
    if (!local.id || invoiceId(local) !== invoiceId(cloud)) return [];
    const localFinancials = invoiceComparisonFinancials(local);
    const cloudFinancials = invoiceComparisonFinancials(cloud);
    const storedSubtotal = firstInvoiceAmount(cloud, ["sourceInvoiceSubtotal", "subtotal"]);
    const storedVat = firstInvoiceAmount(cloud, ["vatTotal", "taxAmount", "tax_amount"]);
    const storedDiscount = firstInvoiceAmount(cloud, ["discountAmount", "discount_amount"]);
    const storedTotal = firstInvoiceAmount(cloud, ["sourceInvoiceTotal", "total", "totalAmount", "total_amount"]);
    const localDiscount = firstInvoiceAmount(local, ["discountAmount", "discount_amount"]) || 0;
    const localCharges = localFinancials.additionalCharges || 0;
    const cloudCharges = cloudFinancials.additionalCharges || 0;
    const hasBrokenZero = (
      (Math.abs(storedSubtotal || 0) <= 0.005 && Math.abs(localFinancials.subtotal) > 0.005)
      || (Math.abs(storedTotal || 0) <= 0.005 && Math.abs(localFinancials.total) > 0.005)
    );
    const financialStructureMatches = amountMatches(localFinancials.vatTotal, cloudFinancials.vatTotal)
      && amountMatches(localDiscount, storedDiscount)
      && amountMatches(localCharges, cloudCharges);
    if (!hasBrokenZero || !financialStructureMatches || !cloud.contentFingerprint) return [];
    return [{
      invoiceId: cloud.id,
      expectedRevision: Number(cloud.syncRevision || 1),
      expectedContentFingerprint: cloud.contentFingerprint || "",
      supplier: text(local.supplier || cloud.supplier) || "Unknown supplier",
      documentNumber: text(local.documentNumber || local.invoiceNumber || cloud.documentNumber) || "(no number)",
      date: text(local.date || local.invoiceDate || cloud.date).slice(0, 10),
      stored: {
        subtotal: rounded(storedSubtotal),
        vat: rounded(storedVat),
        discount: rounded(storedDiscount),
        charges: rounded(cloudCharges),
        total: rounded(storedTotal),
      },
      proposed: {
        subtotal: localFinancials.subtotal,
        vat: localFinancials.vatTotal,
        discount: rounded(localDiscount),
        charges: rounded(localCharges),
        total: localFinancials.total,
      },
      reason: localFinancials.totalSource === "legacy_header_alias" || localFinancials.totalSource === "legacy_net_header_alias_plus_vat"
        ? "The same-UUID device record contains an explicit historical total alias and equivalent business lines."
        : "The same-UUID device record and complete equivalent lines prove the missing header values.",
      proof: {
        type: "same_uuid_equivalent_business_content",
        localTotalSource: localFinancials.totalSource,
        localSubtotalSource: localFinancials.subtotalSource,
        lineCount: (local.items || local.lines || []).length,
      },
    }];
  });
}

export function buildFinalRecoveryWorkspace({ preview = {}, report = {}, relational = {}, resolutions = [] } = {}) {
  const activeConflicts = report.conflicts || [];
  const safeRepairs = safeFinancialHeaderRepairCandidates(preview);
  const deferredSourceKeys = new Set(resolutions
    .filter((row) => row.active !== false && row.decision === "defer")
    .map((row) => text(row.source_key || row.sourceKey)));
  const deferred = activeConflicts.filter((row) => deferredSourceKeys.has(text(row.legacy?.id))).length;
  const activeBreakdownTotal = (report.breakdown || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
  const cloudIds = new Set((preview.invoices?.already || []).map((entry) => invoiceId(entry.cloud)));
  const cloudOnly = (relational.invoices || []).filter((invoice) => !cloudIds.has(invoiceId(invoice)));
  const productGroups = (preview.products?.conflicts || []).map((conflict) => {
    const candidates = conflict.candidates || [];
    const relevantProductIds = new Set([conflict.id, ...candidates.map((row) => row.id)].filter(Boolean));
    const normalizedName = text(conflict.name).toLowerCase();
    const affectedInvoices = (preview.invoices?.conflicts || []).filter((entry) => (
      (entry.local?.items || entry.local?.lines || []).some((line) => (
        relevantProductIds.has(text(line.matchedProductId || line.productId || line.product_id))
        || text(line.productName || line.product_name).toLowerCase() === normalizedName
      ))
    ));
    const supplierContext = [...new Set(affectedInvoices.flatMap((entry) => (
      (entry.local?.items || entry.local?.lines || []).filter((line) => (
        relevantProductIds.has(text(line.matchedProductId || line.productId || line.product_id))
        || text(line.productName || line.product_name).toLowerCase() === normalizedName
      )).map((line) => [
        text(entry.local?.supplier || entry.local?.supplierName),
        text(line.supplierProductCode || line.supplier_product_code),
        text(line.supplierDescription || line.description),
      ].filter(Boolean).join(" · "))
    )).filter(Boolean))];
    const supplierEvidence = (relational.supplierProductMappings || []).filter((row) => (
      row.active !== false
      && (relevantProductIds.has(row.product_id) || text(row.supplier_description).toLowerCase() === normalizedName)
    ));
    const correctionEvidence = (relational.invoiceLineCorrections || []).filter((row) => (
      relevantProductIds.has(row.product_id) || text(row.product_name).toLowerCase() === normalizedName
    ));
    const aliases = [...new Set([
      ...(Array.isArray(conflict.legacy?.aliases) ? conflict.legacy.aliases : []),
      ...candidates.flatMap((row) => Array.isArray(row.aliases) ? row.aliases : []),
    ].map(text).filter(Boolean))];
    return {
      ...conflict,
      sourceKey: conflict.id || normalizedName,
      candidates,
      supplierEvidence,
      correctionEvidence,
      aliases,
      departmentPreference: text(conflict.legacy?.department || conflict.legacy?.departmentName),
      affectedInvoiceCount: Math.max(Number(conflict.affectedInvoiceCount || 0), affectedInvoices.length),
      supplierContext,
    };
  });
  const invoiceGroups = activeConflicts.reduce((groups, conflict) => {
    const code = conflict.conflictReasonCode || "explicit_manual_review";
    const raw = (preview.invoices?.conflicts || []).find((entry) => invoiceId(entry.local) === invoiceId(conflict.legacy));
    groups[code] = [...(groups[code] || []), { ...conflict, local: raw?.local || null, cloud: raw?.cloud || null }];
    return groups;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    preview,
    report,
    relational,
    resolutions,
    safeRepairs,
    automatic: {
      localStatusFixes: (preview.invoices?.already || []).filter((entry) => entry.local?.syncStatus !== "synced").length,
      financialHeaderRepairs: safeRepairs.length,
      probableDuplicateLegacyCopies: preview.invoices?.counts?.probableDuplicateLegacyCopies || 0,
    },
    productGroups,
    invoiceGroups,
    deviceReconciliation: {
      equivalent: preview.invoices?.already || [],
      deviceOnly: preview.invoices?.migrate || [],
      conflicts: preview.invoices?.conflicts || [],
      cloudOnly,
    },
    completion: {
      legacyInvoices: preview.invoices?.counts?.legacy || 0,
      savedOrEquivalent: preview.invoices?.counts?.alreadyRelational || 0,
      needMigration: preview.invoices?.counts?.needMigration || 0,
      unresolved: Math.max(0, (preview.invoices?.counts?.conflicts || 0) - deferred),
      explicitlyDeferred: deferred,
      classificationsExact: report.classificationInvariant?.exact !== false
        && activeBreakdownTotal === (preview.invoices?.counts?.conflicts || 0),
    },
  };
}

export function recoveryCanBeMarkedComplete(workspace = {}) {
  const completion = workspace.completion || {};
  return Boolean(
    completion.classificationsExact
    && Number(completion.needMigration || 0) === 0
    && Number(completion.unresolved || 0) === 0
  );
}

export function recoveryResolutionPayload({ type, sourceKey, decision, targetId = "", value = {}, metadata = {} } = {}) {
  if (!text(type) || !text(sourceKey) || !text(decision)) throw new Error("A recovery resolution needs a type, source record and decision.");
  return {
    resolutionType: text(type),
    sourceKey: text(sourceKey),
    decision: text(decision),
    targetId: text(targetId),
    value: value && typeof value === "object" ? value : {},
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
}

export const recoveryAmountsEquivalent = amountMatches;
