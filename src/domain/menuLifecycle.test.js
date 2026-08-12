import assert from "node:assert/strict";
import test from "node:test";
import { MENU_STATUSES, isMenuArchived, updateMenuStatus, visibleMenus } from "./menuLifecycle.js";

const seasonalMenu = {
  id: "summer-menu",
  name: "Summer menu",
  status: MENU_STATUSES.ACTIVE,
  subcategories: [{ id: "mains", dishes: [{ id: "pasta", name: "Pasta", sellingPrice: 14.5 }] }],
};

test("changing a menu lifecycle status preserves dishes and costing data", () => {
  const archived = updateMenuStatus({ ...seasonalMenu, archivedFromStatus: MENU_STATUSES.ACTIVE }, MENU_STATUSES.ARCHIVED);

  assert.equal(isMenuArchived(archived), true);
  assert.deepEqual(archived.subcategories, seasonalMenu.subcategories);
  assert.equal("archivedFromStatus" in archived, false);
});

test("archived menus are hidden by default and status changes restore them to the normal selector", () => {
  const archived = updateMenuStatus(seasonalMenu, MENU_STATUSES.ARCHIVED);
  const menus = [seasonalMenu, archived];

  assert.deepEqual(visibleMenus(menus).map((menu) => menu.id), [seasonalMenu.id]);
  assert.deepEqual(visibleMenus(menus, true).map((menu) => menu.id), [seasonalMenu.id, archived.id]);

  const restored = updateMenuStatus(archived, MENU_STATUSES.DRAFT);
  assert.equal(restored.status, MENU_STATUSES.DRAFT);
  assert.deepEqual(restored.subcategories, seasonalMenu.subcategories);

  const reactivated = updateMenuStatus(archived, MENU_STATUSES.ACTIVE);
  assert.equal(reactivated.status, MENU_STATUSES.ACTIVE);
  assert.deepEqual(reactivated.subcategories, seasonalMenu.subcategories);
});
