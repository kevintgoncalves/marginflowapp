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
