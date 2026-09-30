import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceWithVerifiedDepartments } from './invoiceDepartmentScope.js';
const companyId='d041a485-aec1-4df6-9eea-e402e18dbd28';
const food={id:'37b61b09-9680-4858-b1c5-733ccc3ba1e2',company_id:companyId,name:'Food',active:true};
test('TG Fruits invalid local department cannot synchronise and its draft is unchanged',()=>{
 const invoice={documentNumber:'834914',supplierId:'41698701-6989-407d-a0a8-f9fd7edd9d23',items:[{department:'Kitchen Made',departmentId:'',quantity:1,unitCost:11}]};
 const before=JSON.stringify(invoice);
 assert.throws(()=>invoiceWithVerifiedDepartments(invoice,[food],companyId),/Select an active company department/);
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
