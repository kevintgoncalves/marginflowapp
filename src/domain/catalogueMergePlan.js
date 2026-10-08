import { analyzeProductMerge, suggestCanonicalProduct } from './productMerge.js';
import { verifiedMergePreview } from '../lib/productMergePreviewRepository.js';

// Review-only: explicit original IDs and an explicit decision are mandatory.
// A similarity score or product name is never treated as an approval.
export async function prepareCatalogueMergePlan({ companyId, groups, loadEvidence }) {
  const seen = new Set();
  const report = [];
  for (const group of groups) {
    const ids = [...new Set(group.productIds || [])];
    const base = { reference: group.reference, decision: group.decision, originalIds: ids };
    if (String(group.decision || '').trim().toLocaleLowerCase('pt-PT') !== 'unir') {
      report.push({ ...base, status: 'not_approved', keepId: null, archiveIds: [] });
      continue;
    }
    if (ids.length < 2 || ids.some(id => seen.has(id))) {
      report.push({ ...base, status: 'blocked', error: 'Missing original IDs or product belongs to more than one group.', archiveIds: [] });
      continue;
    }
    ids.forEach(id => seen.add(id));
    try {
      const evidence = await loadEvidence(companyId, ids);
      const keep = suggestCanonicalProduct(evidence.products, evidence.usageByProduct);
      const analysis = analyzeProductMerge({products:evidence.products}, {companyId,keepProductId:keep?.id,mergeProductIds:ids.filter(id=>id!==keep?.id)});
      const preview = verifiedMergePreview(analysis,evidence,companyId,ids,keep?.id);
      if (!preview) throw new Error('Complete scoped evidence could not be verified.');
      report.push({...base,status:preview.canMerge?'ready_for_review':'blocked',keepId:keep.id,
        archiveIds:ids.filter(id=>id!==keep.id),usageByProduct:preview.usageByProduct,
        affected:preview.totals,conflicts:preview.conflicts,aliasesToAdd:preview.aliasesToAdd});
    } catch(error) { report.push({...base,status:'blocked',archiveIds:[],error:error.message}); }
  }
  return report;
}
