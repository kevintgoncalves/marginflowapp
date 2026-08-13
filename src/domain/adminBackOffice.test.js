import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_PERMISSION_GROUPS,
  companyMatchesFilters,
  effectiveSubscriptionStatus,
  trialDisplay,
} from './adminBackOffice.js';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813110000_internal_admin_back_office_4c.sql', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const internalAdminSource = readFileSync(new URL('../components/InternalAdmin.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('internal navigation is separate from the customer workspace', () => {
  assert.deepEqual(ADMIN_NAV_ITEMS.map((item) => item.label), [
    'Overview',
    'Companies',
    'Subscriptions',
    'Plans & Features',
    'Internal Staff',
    'Audit Log',
    'Support',
    'Settings',
  ]);
  assert.match(mainSource, /if \(!internalStaff && currentPathname\(\)\.startsWith\("\/internal"\)\)/);
  assert.match(mainSource, /return <InternalAdmin onOpenSupport=/);
});

test('customer sign out and admin subscription purpose stay visible in the UI contract', () => {
  assert.match(mainSource, /className="sidebar-signout" onClick=\{onSignOut\}/);
  assert.match(internalAdminSource, /Find workspaces, see who uses them/);
  assert.match(internalAdminSource, /Manage plan access, trial dates, and subscription status/);
  assert.match(internalAdminSource, /Extend 7 days/);
  assert.match(internalAdminSource, /Cancel access/);
  assert.match(stylesSource, /\.admin-shell \{[\s\S]*background: var\(--bg\)/);
});

test('admin company filters and subscription trial states remain deterministic', () => {
  const company = {
    name: 'Kitchen Made',
    trading_name: 'Kitchen Made Ltd',
    subscription_status: 'trialing',
    plan_slug: 'pro',
  };
  assert.equal(companyMatchesFilters(company, { search: 'kitchen', status: 'trialing', plan: 'pro' }), true);
  assert.equal(companyMatchesFilters(company, { search: 'missing' }), false);
  assert.equal(companyMatchesFilters(company, { status: 'active' }), false);
  assert.equal(effectiveSubscriptionStatus({ status: 'trialing', trial_ends_at: '2020-01-01T00:00:00Z' }), 'expired');
  assert.equal(trialDisplay({ status: 'trialing', trial_ends_at: '2026-08-20T00:00:00Z' }, '2026-08-13T00:00:00Z'), '7 days remaining');
});

test('4C migration keeps subscription, staff, support, and audit paths server-authorized', () => {
  assert.match(migration, /create table if not exists public\.internal_staff_invites/i);
  assert.match(migration, /create table if not exists public\.internal_support_sessions/i);
  assert.match(migration, /create or replace function public\.admin_update_subscription/i);
  assert.match(migration, /create or replace function public\.admin_update_internal_staff/i);
  assert.match(migration, /unsupported staff status/i);
  assert.match(migration, /if p_status is not null and not public\.has_internal_permission\('staff\.disable'\)/i);
  assert.match(migration, /create or replace function public\.open_support_workspace/i);
  assert.match(migration, /feature_keys/i);
  assert.match(migration, /record_internal_audit_event\('subscription\.plan_changed'/i);
  assert.match(migration, /record_internal_audit_event\('support\.workspace_opened'/i);
  assert.match(migration, /record_internal_audit_event\('support\.workspace_closed'/i);
  assert.match(migration, /revoke all on table public\.internal_staff_invites, public\.internal_support_sessions/i);
  assert.match(migration, /delete from public\.internal_role_permissions[\s\S]*support\.workspace_write/i);
  assert.doesNotMatch(migration, /settings\.country_code/i);
});

test('permission groups expose granular overrides without granting support writes by default', () => {
  const keys = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.keys);
  assert.ok(keys.includes('customer_users.disable'));
  assert.ok(keys.includes('customer_users.password_reset'));
  assert.ok(keys.includes('support.workspace_view'));
  assert.ok(keys.includes('support.workspace_write'));
  assert.ok(keys.includes('staff.disable'));
  assert.match(migration, /delete from public\.internal_role_permissions[\s\S]*role_key = 'support'[\s\S]*permission_key = 'support\.workspace_write'/i);
});

test('customer settings keep destructive recovery owner-only and remove customer cloud migration UI', () => {
  assert.doesNotMatch(mainSource, /Migrate all local data to cloud/);
  assert.match(mainSource, /Type the company name to reset/);
  assert.match(mainSource, /showRecoveryTools=\{recoveryToolsEnabled[\s\S]*authMembership\?\.role_label[\s\S]*owner/);
  assert.match(mainSource, /readOnly \? Promise\.resolve\(\[\]\) : loadLegacyInvoiceArchive/);
});
