import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveSubscriptionStatus,
  hasEffectiveFeature,
  resolveCompanyEntitlements,
} from './entitlements.js';

const now = new Date('2026-08-13T12:00:00.000Z');
const basic = ['dashboard', 'sales', 'invoices', 'invoice_ai'];
const plus = [...basic, 'products', 'suppliers', 'stocktake', 'invoice_control_centre', 'recipes', 'waste'];
const pro = [...plus, 'menu_costing', 'labour', 'ai_insights', 'advanced_reporting'];

test('existing company is active Pro with the full feature set', () => {
  const access = resolveCompanyEntitlements({
    subscription: { status: 'active' },
    planFeatureKeys: pro,
    now,
  });

  assert.equal(access.effectiveStatus, 'active');
  assert.equal(access.writeAccess, true);
  assert.deepEqual(access.featureKeys, [...pro].sort());
});

test('Basic, Plus and Pro feature matrices are additive and invoice AI is included in each', () => {
  const basicAccess = resolveCompanyEntitlements({ subscription: { status: 'active' }, planFeatureKeys: basic, now });
  const plusAccess = resolveCompanyEntitlements({ subscription: { status: 'active' }, planFeatureKeys: plus, now });
  const proAccess = resolveCompanyEntitlements({ subscription: { status: 'active' }, planFeatureKeys: pro, now });

  assert.equal(hasEffectiveFeature(basicAccess, 'invoice_ai'), true);
  assert.equal(hasEffectiveFeature(basicAccess, 'products'), false);
  assert.equal(hasEffectiveFeature(plusAccess, 'products'), true);
  assert.equal(hasEffectiveFeature(plusAccess, 'menu_costing'), false);
  assert.equal(hasEffectiveFeature(proAccess, 'advanced_reporting'), true);
});

test('a valid trial receives Pro features and expires immediately from its authoritative end timestamp', () => {
  const validTrial = resolveCompanyEntitlements({
    subscription: { status: 'trialing', trialEndsAt: '2026-08-14T12:00:00.000Z' },
    planFeatureKeys: basic,
    trialPlanFeatureKeys: pro,
    now,
  });
  const expiredTrial = resolveCompanyEntitlements({
    subscription: { status: 'trialing', trialEndsAt: '2026-08-13T11:59:59.000Z' },
    planFeatureKeys: basic,
    trialPlanFeatureKeys: pro,
    now,
  });

  assert.equal(validTrial.trialIsValid, true);
  assert.equal(hasEffectiveFeature(validTrial, 'advanced_reporting'), true);
  assert.equal(validTrial.writeAccess, true);
  assert.equal(getEffectiveSubscriptionStatus({ status: 'trialing', trialEndsAt: '2026-08-13T11:59:59.000Z' }, now), 'expired');
  assert.equal(expiredTrial.effectiveStatus, 'expired');
  assert.equal(expiredTrial.writeAccess, false);
  assert.equal(hasEffectiveFeature(expiredTrial, 'dashboard'), true);
});

test('custom entitlements supplement the plan without plan-name checks', () => {
  const access = resolveCompanyEntitlements({
    subscription: { status: 'active' },
    planFeatureKeys: basic,
    customFeatureKeys: ['workforce_scheduling'],
    now,
  });

  assert.equal(hasEffectiveFeature(access, 'workforce_scheduling'), true);
});
