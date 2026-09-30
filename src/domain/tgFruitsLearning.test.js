import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLearningCatalogue } from '../lib/learningCatalogue.js';
import { learnSupplierProductMappings } from './invoiceLearning.js';
import { refreshPendingInvoice } from './reusablePurchasing.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('TG Fruits confirmed supplier identity and conversion survive second/third invoices without cross-supplier learning', async () => {
  const companyId=id(1), locationId=id(2), supplierId=id(3), productId=id(4), departmentId=id(5);
  const product={id:productId,companyId,name:'VINE TOMATOES',active:true};
  const first={id:id(6),supplier:'TG Fruits Ltd',supplierId:id(99),items:[{
    id:id(7),supplierId:id(99),productName:'VINE TOMATOES',rawDescription:'VINE TOMATOES BOX',packSize:'BOX',
    matchedProductId:productId,productResolution:'manual_match',productMatchSource:'manual_selection',
    department:'Food',departmentId,quantity:2,unitCost:8.5,
    conversionRule:{purchaseUnit:'box',baseQuantity:3,baseUnit:'kg',confirmed:true},
  }]};
  const original=JSON.stringify(first);
  const learning=learnSupplierProductMappings({invoice:first,products:[product],companyId,locationId,supplierId});
  assert.equal(learning.learned[0].supplierId,supplierId,'resolved supplier wins over stale line UUID');
  let catalogueCalls=0;
  const client={from:()=>({select:()=>({eq:()=>({eq:async()=>({data:[{id:departmentId,name:'Food',company_id:companyId,active:true}]})})})}),
    rpc:async(name,payload)=>{
      catalogueCalls++;
      assert.equal(name,'resolve_invoice_catalogue_v1');
      assert.equal(payload.p_company_id,companyId);
      assert.equal(payload.p_location_id,locationId);
      return {data:{...payload.p_invoice,supplierId,items:payload.p_invoice.items.map(line=>({...line,matchedProductId:productId,departmentId}))}};
    }};
  const resolved=await resolveLearningCatalogue(client,learning.learned,{companyId,locationId});
  assert.equal(catalogueCalls,1);
  assert.equal(JSON.stringify(first),original,'source invoice unchanged');
  const rules=resolved.map(row=>({...row,relationalId:id(8),persistenceSource:'relational'}));
  for (const number of [2,3]) {
    const pending={id:id(10+number),supplier:'TG Fruits Ltd',supplierId,status:'Pending',items:[{
      id:id(20+number),productName:'VINE TOMATOES',rawDescription:'VINE TOMATOES BOX',packSize:'BOX',quantity:1,unitCost:9,
    }]};
    const applied=refreshPendingInvoice(pending,JSON.parse(JSON.stringify(rules)),[product],companyId,locationId);
    assert.equal(applied.items[0].matchedProductId,productId);
    assert.equal(applied.items[0].productMatchSource,'learned_rule');
    assert.equal(applied.items[0].needsReview,false);
    assert.deepEqual(applied.items[0].conversionRule,first.items[0].conversionRule);
    const other=refreshPendingInvoice({...pending,supplier:'Other supplier',supplierId:id(90)},rules,[product],companyId,locationId);
    assert.notEqual(other.items[0].matchedProductId,productId);
  }
});
