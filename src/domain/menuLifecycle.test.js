import assert from "node:assert/strict";
import test from "node:test";
import { MENU_STATUSES, archiveMenu, isMenuArchived, restoreMenu, visibleMenus } from "./menuLifecycle.js";

const seasonalMenu = {
  id: "summer-menu",
  name: "Summer menu",
  status: MENU_STATUSES.ACTIVE,
  subcategories: [{ id: "mains", dishes: [{ id: "pasta", name: "Pasta", sellingPrice: 14.5 }] }],
};

test("archiving a menu preserves its dishes and prior lifecycle state", () => {
  const archived = archiveMenu(seasonalMenu);

  assert.equal(isMenuArchived(archived), true);
  assert.equal(archived.archivedFromStatus, MENU_STATUSES.ACTIVE);
  assert.deepEqual(archived.subcategories, seasonalMenu.subcategories);
});

test("archived menus are hidden by default and restore returns them to the normal selector", () => {
  const archived = archiveMenu(seasonalMenu);
  const menus = [seasonalMenu, archived];

  assert.deepEqual(visibleMenus(menus).map((menu) => menu.id), [seasonalMenu.id]);
  assert.deepEqual(visibleMenus(menus, true).map((menu) => menu.id), [seasonalMenu.id, archived.id]);

  const restored = restoreMenu(archived);
  assert.equal(restored.status, MENU_STATUSES.ACTIVE);
  assert.equal("archivedFromStatus" in restored, false);
  assert.deepEqual(restored.subcategories, seasonalMenu.subcategories);
});
