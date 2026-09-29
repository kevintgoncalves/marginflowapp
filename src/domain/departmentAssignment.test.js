import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredInvoiceDepartment, departmentAssignmentForLine } from './departmentAssignment.js';

test('new invoice defaults use the active company departments', () => {
  assert.equal(configuredInvoiceDepartment('Kitchen Made', ['Food', 'Drinks']), 'Food');
  assert.equal(configuredInvoiceDepartment('Drinks', ['Food', 'Drinks']), 'Drinks');
  assert.equal(configuredInvoiceDepartment('Kitchen Made', []), '');
});

test('existing invalid department is retained for explicit review, not silently reassigned', () => {
  assert.equal(departmentAssignmentForLine({ department: 'Kitchen Made' }, {
    departmentNames: ['Food', 'Drinks'], fallbackDepartment: 'Food',
  }).department, 'Kitchen Made');
  assert.equal(departmentAssignmentForLine({ department: 'Food' }, {
    departmentNames: ['Food', 'Drinks'],
  }).department, 'Food');
});
