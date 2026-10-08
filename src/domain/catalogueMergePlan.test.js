import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCatalogueMergePlan } from './catalogueMergePlan.js';
import { mergeSelectionKey, verifiedMergePreview } from '../lib/productMergePreviewRepository.js';
import { analyzeProductMerge } from './productMerge.js';
const products=[{id:'original-a',company_id:'company',name:'Orange juice',packSize:'1L'},
 {id:'original-b',company_id:'company',name:'Orange juice',packSize:'1L'}];
const evidence={key:mergeSelectionKey('company',products.map(p=>p.id)),products,conflicts:[],usageByProduct:{'original-a':{invoiceLines:1,supplierMappings:1},'original-b':{invoiceLines:1200,recipeIngredients:2,supplierMappings:3}}};
test('approved merge report uses original IDs and complete remote usage, never mutates data',async()=>{
 const original=structuredClone(evidence);
 const result=await prepareCatalogueMergePlan({companyId:'company',groups:[{reference:'group-1',decision:'Unir',productIds:products.map(p=>p.id)}],loadEvidence:async()=>evidence});
 assert.equal(result[0].keepId,'original-b');assert.deepEqual(result[0].archiveIds,['original-a']);assert.equal(result[0].affected.invoiceLines,1201);
 assert.equal(result[0].status,'ready_for_review');assert.deepEqual(evidence,original);
});
test('keep separate and unapproved similar names never enter a merge plan',async()=>{
 let reads=0;
 const result=await prepareCatalogueMergePlan({companyId:'company',groups:[{reference:'Cherry Tomatoes',decision:'manter separados',productIds:['c','d']},{reference:"Corn Flakes Kellogg’s",decision:'manter separados',productIds:['e','f']},{reference:'Similar',decision:'',productIds:['g','h']}],loadEvidence:async()=>{reads++;}});
 assert.equal(reads,0);assert.ok(result.every(row=>row.status==='not_approved'&&row.archiveIds.length===0));
});
test('incomplete reads and shared stocktake/recipe references block a proposed merge',async()=>{
 const group={decision:'Unir',productIds:products.map(p=>p.id)};
 const failed=await prepareCatalogueMergePlan({companyId:'company',groups:[group],loadEvidence:async()=>{throw Error('Incomplete historical page');}});
 assert.equal(failed[0].status,'blocked');assert.deepEqual(failed[0].archiveIds,[]);
 const conflict={type:'shared_reference',level:'blocking',message:'Shared recipe needs review'};
 const blocked=await prepareCatalogueMergePlan({companyId:'company',groups:[group],loadEvidence:async()=>({...evidence,conflicts:[conflict]})});
 assert.equal(blocked[0].status,'blocked');assert.ok(blocked[0].conflicts.includes(conflict));
});
test('preview recommendation uses remote links and remains within the selected pair',()=>{
 const analysis=analyzeProductMerge({products},{companyId:'company',keepProductId:'original-a',mergeProductIds:['original-b']});
 const preview=verifiedMergePreview(analysis,evidence,'company',products.map(p=>p.id),'original-a');
 assert.equal(preview.recommendedKeepProductId,'original-b');assert.equal(preview.canonicalProduct.id,'original-a');
});
