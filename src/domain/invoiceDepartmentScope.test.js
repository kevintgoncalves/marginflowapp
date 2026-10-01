import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceWithVerifiedDepartments } from './invoiceDepartmentScope.js';
const companyId='d041a485-aec1-4df6-9eea-e402e18dbd28';
const food={id:'37b61b09-9680-4858-b1c5-733ccc3ba1e2',company_id:companyId,name:'Food',active:true};
test('an unambiguous sole active company department resolves a stale local label to its remote id',()=>{
 const invoice={documentNumber:'draft-1',supplierId:'supplier-1',items:[{department:'Local prep label',departmentId:'',quantity:1,unitCost:11}]};
 const before=JSON.stringify(invoice);
 const resolved=invoiceWithVerifiedDepartments(invoice,[food],companyId);
 assert.equal(resolved.items[0].departmentId,food.id);
 assert.equal(resolved.items[0].department,'Food');
 assert.equal(JSON.stringify(invoice),before);
});
test('explicit Food decision resolves remote id without changing financial inputs',()=>{
 const invoice={items:[{department:'Food',departmentId:'',quantity:1.85,unitCost:2.5,conversionRule:{baseUnit:'kg',baseQuantity:1}}]};
 const resolved=invoiceWithVerifiedDepartments(invoice,[food],companyId);
 assert.equal(resolved.items[0].departmentId,food.id);
 assert.equal(resolved.items[0].quantity,1.85);assert.equal(resolved.items[0].unitCost,2.5);
 assert.deepEqual(resolved.items[0].conversionRule,invoice.items[0].conversionRule);
 assert.throws(()=>invoiceWithVerifiedDepartments(invoice,[food],'other-company'));
});
test('department resolution is isolated by company and ambiguous active choices require review',()=>{
 const other={...food,id:'48b61b09-9680-4858-b1c5-733ccc3ba1e3',company_id:'other-company'};
 const drinks={...food,id:'58b61b09-9680-4858-b1c5-733ccc3ba1e4',name:'Drinks'};
 const invoice={items:[{department:'Unknown local label',departmentId:'',quantity:1,unitCost:2}]};
 assert.throws(()=>invoiceWithVerifiedDepartments(invoice,[other],companyId),/Select an active company department/);
 assert.throws(()=>invoiceWithVerifiedDepartments(invoice,[food,drinks],companyId),/Select an active company department/);
 assert.throws(()=>invoiceWithVerifiedDepartments({...invoice,items:[{...invoice.items[0],departmentId:other.id}]},[food,other],companyId),/Select an active company department/);
});
test('a name-only draft resolves the active department for the current company and location',()=>{
 const locationId='68b61b09-9680-4858-b1c5-733ccc3ba1e5';
 const current={...food,id:'78b61b09-9680-4858-b1c5-733ccc3ba1e6',name:'Prep Kitchen',location_id:locationId};
 const otherLocation={...current,id:'88b61b09-9680-4858-b1c5-733ccc3ba1e7',location_id:'other-location'};
 const companyDefault={...current,id:'98b61b09-9680-4858-b1c5-733ccc3ba1e8',location_id:null};
 const invoice={items:[{department:'  PREP\u00a0KITCHEN  ',departmentId:'',quantity:1,unitCost:2}]};
 const resolved=invoiceWithVerifiedDepartments(invoice,[otherLocation,companyDefault,current],{companyId,locationId});
 assert.equal(resolved.items[0].departmentId,current.id);
  assert.equal(resolved.items[0].department,current.name);
});
test('a stale local department ID falls back to the exact active department name in the current location',()=>{
 const locationId='a8b61b09-9680-4858-b1c5-733ccc3ba1e5';
 const current={...food,id:'b8b61b09-9680-4858-b1c5-733ccc3ba1e6',name:'Kitchen Made',location_id:locationId};
 const staleDraft={items:[{department:' kitchen made ',departmentId:'local-settings-id',quantity:1,unitCost:2}]};
 const resolved=invoiceWithVerifiedDepartments(staleDraft,[current],{companyId,locationId});
 assert.equal(resolved.items[0].departmentId,current.id);
 assert.equal(resolved.items[0].department,'Kitchen Made');
});
test('department IDs never cross company or location boundaries and stale IDs resolve only to the current scoped name',()=>{
 const locationId='a8b61b09-9680-4858-b1c5-733ccc3ba1e9';
 const current={...food,id:'b8b61b09-9680-4858-b1c5-733ccc3ba1ea',name:'Production',location_id:locationId};
 const foreignLocation={...current,id:'c8b61b09-9680-4858-b1c5-733ccc3ba1eb',location_id:'foreign-location'};
 const byName={items:[{department:'Production',departmentId:'',quantity:1,unitCost:2}]};
 const byForeignId={items:[{...byName.items[0],departmentId:foreignLocation.id}]};
 assert.throws(()=>invoiceWithVerifiedDepartments(byName,[foreignLocation],{companyId,locationId}),/Select an active company department/);
 const resolved=invoiceWithVerifiedDepartments(byForeignId,[current,foreignLocation],{companyId,locationId});
 assert.equal(resolved.items[0].departmentId,current.id);
});
