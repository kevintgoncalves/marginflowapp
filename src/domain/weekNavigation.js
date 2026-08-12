function localDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mondayWeekStart(value) {
  const date = localDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7));
  return isoDate(date);
}

export function shiftMondayWeek(weekStart, direction) {
  const date = localDate(weekStart);
  date.setDate(date.getDate() + (direction * 7));
  return isoDate(date);
}

export function mondaySundayWeekDates(weekStart) {
  const monday = localDate(mondayWeekStart(weekStart));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return isoDate(date);
  });
}
