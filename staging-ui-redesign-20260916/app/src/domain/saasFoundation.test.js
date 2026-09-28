import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813090000_saas_foundation_4a.sql', import.meta.url),
  'utf8',
);
const enumMigration = readFileSync(
  new URL('../../supabase/migrations/20260813085900_add_expired_subscription_status.sql', import.meta.url),
  'utf8',
);

test('SaaS foundation keeps internal staff explicit and separate from customer membership', () => {
  assert.match(migration, /create table if not exists public\.internal_staff_accounts/i);
  assert.match(migration, /staff\.role_key = 'super_admin'/i);
  assert.doesNotMatch(migration, /profiles?\.metadata.*platform_role/i);
  assert.match(migration, /Customer company membership and customer roles never create rows here/i);
});

test('SaaS foundation prevents customer subscription and staff-role mutation through normal RLS access', () => {
  assert.match(migration, /create policy subscriptions_write_internal/i);
  assert.match(migration, /has_internal_permission\('subscriptions\.change_plan'\)/i);
  assert.match(migration, /create policy internal_staff_accounts_write_permission_admin/i);
  assert.match(migration, /has_internal_permission\('staff\.edit_permissions'\)/i);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger\s+on table public\.internal_audit_log from authenticated/i);
});

test('SaaS foundation provisions a dormant fourteen-day trial and resolves expiry from time', () => {
  assert.match(enumMigration, /add value if not exists 'expired'/i);
  assert.match(migration, /'trialing',\s+14,/i);
  assert.match(migration, /'trial_start_pending', true/i);
  assert.match(migration, /subscription\.trial_ends_at <= now\(\)/i);
  assert.match(migration, /'expired'::marginflow\.subscription_status/i);
});
