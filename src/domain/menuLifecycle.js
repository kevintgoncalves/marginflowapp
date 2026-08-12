export const MENU_STATUSES = Object.freeze({
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DRAFT: "Draft",
});

export function isMenuArchived(menu = {}) {
  return menu.status === MENU_STATUSES.ARCHIVED;
}

export function visibleMenus(menus = [], showArchived = false) {
  return menus.filter((menu) => showArchived || !isMenuArchived(menu));
}

export function archiveMenu(menu = {}) {
  if (isMenuArchived(menu)) return menu;
  return {
    ...menu,
    archivedFromStatus: menu.status || MENU_STATUSES.ACTIVE,
    status: MENU_STATUSES.ARCHIVED,
  };
}

export function restoreMenu(menu = {}) {
  if (!isMenuArchived(menu)) return menu;
  const { archivedFromStatus, ...rest } = menu;
  return {
    ...rest,
    status: archivedFromStatus && archivedFromStatus !== MENU_STATUSES.ARCHIVED
      ? archivedFromStatus
      : MENU_STATUSES.ACTIVE,
  };
}
