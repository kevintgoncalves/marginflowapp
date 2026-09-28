import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardingNeedsRedirect, validateOnboardingDraft } from './onboarding.js';
import { nextRegionalDraft, regionalDefaultsFor } from './regionalDefaults.js';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813100000_customer_onboarding_4b.sql', import.meta.url),
  'utf8',
);

const completeDraft = {
  companyName: 'Casa Margin',
  countryCode: 'PT',
  country: 'Portugal',
  language: 'pt',
  currency: 'EUR',
  timezone: 'Europe/Lisbon',
  defaultVat: 23,
  weekStartsOn: 'Monday',
  targetGp: 75,
  departments: [{ name: 'Food' }, { name: 'Drinks' }],
};

test('United Kingdom and Portugal defaults are centrally defined', () => {
  assert.deepEqual(regionalDefaultsFor('GB'), {
    code: 'GB', name: 'United Kingdom', currency: 'GBP', language: 'en', timezone: 'Europe/London', defaultVat: 20, weekStartsOn: 'Monday',
  });
  assert.deepEqual(regionalDefaultsFor('PT'), {
    code: 'PT', name: 'Portugal', currency: 'EUR', language: 'pt', timezone: 'Europe/Lisbon', defaultVat: 23, weekStartsOn: 'Monday',
  });
});

test('country changes update untouched defaults but retain manual regional overrides', () => {
  const untouched = nextRegionalDraft({ ...completeDraft, currency: 'GBP', language: 'en' }, 'PT', {});
  const overridden = nextRegionalDraft({ ...completeDraft, currency: 'USD', timezone: 'America/New_York' }, 'GB', {
    currency: true,
    timezone: true,
  });

  assert.equal(untouched.currency, 'EUR');
  assert.equal(untouched.language, 'pt');
  assert.equal(overridden.currency, 'USD');
  assert.equal(overridden.timezone, 'America/New_York');
  assert.equal(overridden.defaultVat, 20);
});

test('onboarding validation requires business, regional, financial and real department data', () => {
  assert.equal(Object.keys(validateOnboardingDraft({}, 'account')).length, 0);
  assert.equal(Object.keys(validateOnboardingDraft(completeDraft, 'review')).length, 0);
  assert.ok(validateOnboardingDraft({ ...completeDraft, companyName: ' My Company ' }, 'review').companyName);
  assert.ok(validateOnboardingDraft({ ...completeDraft, departments: [] }, 'review').departments);
  assert.ok(validateOnboardingDraft({ ...completeDraft, departments: [{ name: 'Food' }, { name: ' food ' }] }, 'review').departments);
  assert.ok(validateOnboardingDraft({ ...completeDraft, targetGp: 0 }, 'review').targetGp);
});

test('customer workspaces are routed to onboarding until complete, while internal staff are not', () => {
  assert.equal(onboardingNeedsRedirect(null), false);
  assert.equal(onboardingNeedsRedirect({ companies: { onboarding_status: 'in_progress' } }), true);
  assert.equal(onboardingNeedsRedirect({ companies: { onboarding_status: 'complete' } }), false);
  assert.equal(onboardingNeedsRedirect({ companies: {} }), false);
  assert.equal(onboardingNeedsRedirect({ companies: { onboarding_status: 'in_progress' } }, true), false);
});

test('onboarding migration persists progress, actual departments, and the server-side trial start', () => {
  assert.match(migration, /onboarding_status text not null default 'complete'/i);
  assert.match(migration, /create unique index if not exists companies_incomplete_onboarding_owner_idx/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(current_user_id::text, 0\)\)/i);
  assert.match(migration, /create or replace function public\.save_customer_onboarding_progress/i);
  assert.match(migration, /create or replace function public\.save_customer_onboarding_departments/i);
  assert.match(migration, /delete from public\.departments/i);
  assert.match(migration, /insert into public\.departments/i);
  assert.doesNotMatch(migration, /'Kitchen Made'|'Bought In'|'Non-food'/i);
  assert.match(migration, /create or replace function public\.complete_customer_onboarding/i);
  assert.match(migration, /trial_started \+ make_interval\(days => subscription\.trial_length_days\)/i);
  assert.match(migration, /set status = 'trialing'/i);
  assert.match(migration, /set onboarding_status = 'complete'/i);
  assert.match(migration, /revoke insert, update, delete on table public\.companies from authenticated/i);
});
