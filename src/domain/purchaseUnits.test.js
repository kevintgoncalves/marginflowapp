import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretPurchasePack } from './purchaseUnits.js';
import { purchaseConversion } from './reusablePurchasing.js';
import { matchInvoiceLineToExistingProduct } from './invoiceProductMatching.js';
import { saveSupplierConversion, conversionForMapping } from '../lib/supplierConversionRepository.js';
for (const [pack, purchaseUnit, cost, expected, unit] of [
  ['X5KG GREEN','box',11,2.2,'kg'], ['X10KG NET','sack',10,1,'kg'],
  ['12X500G','case',18,3,'kg'], ['6X1L','case',12,2,'l'], ['4KG LONG','case',8,2,'kg'],
]) test(`${pack}: original purchase total and normalized price remain separate`, () => {
  const line = {quantity:1,unitCost:cost,lineTotal:cost,packSize:pack,unitOfMeasure:'kg',conversionRule:interpretPurchasePack(pack,purchaseUnit)};
  const before = JSON.stringify(line); const result = purchaseConversion(line);
  assert.equal(result.valid,true); assert.equal(result.price,expected); assert.equal(result.unit,unit); assert.equal(result.net,cost);
  assert.equal(JSON.stringify(line),before);
});
test('X5KG cannot be mistaken for one kg by the legacy unit selector',()=>{
 assert.equal(purchaseConversion({quantity:1,unitCost:11,packSize:'X5KG GREEN',unitOfMeasure:'kg'}).price,2.2);
});
test('punnet with unknown weight requires equivalence confirmation and never produces kg',()=>{
 const conversionRule=interpretPurchasePack('SINGLE PNT');
 const line={quantity:2,unitCost:3,packSize:'SINGLE PNT',conversionRule};
 assert.equal(purchaseConversion(line).valid,false);
 const result=purchaseConversion({...line,conversionRule:{...conversionRule,confirmed:true}});
 assert.equal(result.unit,'punnet');assert.equal(result.price,3);assert.equal(result.weightUnknown,true);assert.equal(result.volume,2);
});
test('ambiguous packaging stays unconverted without changing invoice totals',()=>{
 const line={quantity:1,unitCost:11,packSize:'5 OR 10 KG',conversionRule:interpretPurchasePack('5 OR 10 KG')};
 assert.equal(purchaseConversion(line).valid,false);assert.equal(purchaseConversion(line).net,11);
});
test('persist and reload Supplier Product conversion idempotently with strict scope',async()=>{
 const rows=[];
 const client={from(){let filters=[],action='select',payload;const q={
  select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]===v);return q},
  insert(value){action='insert';payload=value;return q},update(value){action='update';payload=value;return q},
  then(resolve){let selected=rows.filter(r=>filters.every(f=>f(r)));if(action==='insert'){const row={id:'format-1',...payload};rows.push(row);selected=[row]}if(action==='update')selected.forEach(r=>Object.assign(r,payload));return Promise.resolve({data:selected,error:null}).then(resolve)}
 };return q}};
 const mapping={companyId:'company-a',supplierId:'supplier-a',productId:'product-a',packSize:'X5KG GREEN',conversionRule:interpretPurchasePack('X5KG GREEN','box')};
 await saveSupplierConversion(client,mapping,'company-a');await saveSupplierConversion(client,mapping,'company-a');assert.equal(rows.length,1);
 const saved={company_id:'company-a',supplier_id:'supplier-a',product_id:'product-a',pack_size:'X5KG GREEN'};
 const conversionRule=conversionForMapping(saved,JSON.parse(JSON.stringify(rows)));
 assert.equal(conversionRule.baseQuantity,5);
 for(const changes of [{company_id:'company-b'},{supplier_id:'supplier-b'},{product_id:'product-b'},{pack_size:'X10KG NET'}])assert.equal(conversionForMapping({...saved,...changes},rows),undefined);
 const rule={...saved,id:'rule',supplierDescription:'COURGETTES',mappingSource:'manual_selection',conversionRule};
 const input={organisationId:'company-a',supplierId:'supplier-a',rawDescription:'COURGETTES',packSize:'X5KG GREEN',existingProducts:[{id:'product-a',companyId:'company-a'}],supplierMappings:[{...rule,packSize:saved.pack_size}]};
 const match=matchInvoiceLineToExistingProduct(input);assert.equal(match.conversionRule.baseQuantity,5);
 assert.equal(purchaseConversion({quantity:1,unitCost:11,conversionRule:match.conversionRule}).price,2.2);
 assert.equal(matchInvoiceLineToExistingProduct({...input,supplierId:'supplier-b'}).matchedProductId,null);
 assert.equal(matchInvoiceLineToExistingProduct({...input,organisationId:'company-b'}).matchedProductId,null);
 assert.equal(matchInvoiceLineToExistingProduct({...input,packSize:'X10KG NET'}).conversionRule,undefined);
});

test('direct KILO and litre purchases preserve invoice inputs and reusable unit definitions', async () => {
  for (const packSize of ['KILO', 'KG', 'LITRE', 'L', 'LTR']) {
    const weight = ['KILO', 'KG'].includes(packSize);
    const conversionRule = interpretPurchasePack(packSize);
    assert.equal(conversionRule.purchaseUnit, weight ? 'kg' : 'litre');
    assert.equal(conversionRule.baseQuantity, 1);
    assert.equal(conversionRule.baseUnit, weight ? 'kg' : 'l');
    const line = { productName: 'SWEET POTATO', packSize, quantity: 1.85, unitCost: 2.50 };
    const before = JSON.stringify(line);
    const result = purchaseConversion(line);
    assert.equal(result.valid, true);
    assert.equal(result.price, 2.50);
    assert.equal(result.volume, 1.85);
    assert.equal(new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(result.net), '£4.63');
    assert.equal(JSON.stringify(line), before);
    let stored;
    const client = { from() { const query = { select() { return query; }, eq() { return query; }, is() { return query; },
      insert(row) { stored = {id:'format', ...row}; return query; },
      then(resolve) { return Promise.resolve({data: stored ? [stored] : [], error:null}).then(resolve); }
    }; return query; } };
    await saveSupplierConversion(client, {supplierId:'s',productId:'p',packSize,conversionRule}, 'c');
    const loaded = conversionForMapping({company_id:'c',supplier_id:'s',product_id:'p',pack_size:packSize}, [JSON.parse(JSON.stringify(stored))]);
    assert.equal(loaded.purchaseUnit, conversionRule.purchaseUnit);
    assert.equal(purchaseConversion({...line,conversionRule:loaded}).price, 2.50);
  }
});
