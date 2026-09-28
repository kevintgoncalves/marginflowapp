export function numberValue(value, fallback = 0) {
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function amountsAlmostEqual(left, right, absoluteTolerance = 0.03, relativeTolerance = 0.015) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  return Math.abs(leftNumber - rightNumber) <= Math.max(absoluteTolerance, Math.abs(rightNumber) * relativeTolerance);
}

export function normalizeHeader(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function roundMoney(value) {
  return Number(numberValue(value, 0).toFixed(2));
}

export function roundQuantity(value) {
  return Number(numberValue(value, 0).toFixed(4));
}
