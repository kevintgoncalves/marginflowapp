export const MENU_STATUSES = Object.freeze({
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DRAFT: "Draft",
});

export const MENU_STATUS_OPTIONS = Object.freeze(Object.values(MENU_STATUSES));

export function isMenuArchived(menu = {}) {
  return menu.status === MENU_STATUSES.ARCHIVED;
}

export function visibleMenus(menus = [], showArchived = false) {
  return menus.filter((menu) => showArchived || !isMenuArchived(menu));
}

export function updateMenuStatus(menu = {}, status) {
  const { archivedFromStatus: _archivedFromStatus, ...menuData } = menu;

  return {
    ...menuData,
    status: MENU_STATUS_OPTIONS.includes(status) ? status : MENU_STATUSES.DRAFT,
  };
}
