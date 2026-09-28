import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsSectionFromUrl, workspaceUrl,settingsLeaves} from './settingsNavigation.js';
test('settings links preserve workspace query context and round-trip every leaf',()=>{
 for(const [section] of settingsLeaves){const href=workspaceUrl('https://example.test/?demo=true&page=dashboard','settings',section);assert.equal(new URL(href).searchParams.get('demo'),'true');assert.equal(settingsSectionFromUrl(href),section);}
});
test('non-settings navigation removes stale section and unknown section falls back safely',()=>{
 assert.equal(new URL(workspaceUrl('https://example.test/?page=settings&section=users','products')).searchParams.has('section'),false);
 assert.equal(settingsSectionFromUrl('https://example.test/?page=settings&section=unknown'),'profile');
});
