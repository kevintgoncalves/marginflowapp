import React, { useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bot,
  Boxes,
  ChefHat,
  Edit3,
  Eye,
  Gauge,
  Home,
  LineChart,
  PackageSearch,
  Plus,
  ReceiptText,
  Save,
  Search,
  Settings,
  Sparkles,
  Store,
  Trash2,
  Upload,
  UtensilsCrossed,
  X,
} from "lucide-react";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const emptyInvoiceDraft = () => ({ files: [], invoiceText: "", items: [], supplier: "", date: today(), invoiceNumber: "", status: "Idle", editingInvoiceId: "" });
const defaultDepartments = ["Kitchen Made", "Bought In", "Bar", "Non-food"];
const departmentTypes = ["Food", "Bar", "Bought In", "Non-food", "Excluded"];
const departmentContextPages = ["dashboard", "stocktake", "waste", "gp"];
const rangePresets = ["Today", "Specific date", "This week", "Last week", "This month", "Last month", "Custom range"];

const defaultDepartmentSettings = [
  { id: uid(), name: "Kitchen Made", type: "Food", targetGp: 75, active: true },
  { id: uid(), name: "Bought In", type: "Bought In", targetGp: 72, active: true },
  { id: uid(), name: "Bar", type: "Bar", targetGp: 78, active: true },
  { id: uid(), name: "Non-food", type: "Non-food", targetGp: 0, active: true },
];

const defaultCompanySettings = {
  companyName: "Reading Room",
  tradingName: "Reading Room",
  address: "1 Market Street, London",
  postcode: "W1A 1AA",
  country: "United Kingdom",
  vatNumber: "GB123456789",
  email: "hello@readingroom.example",
  phone: "020 7000 0000",
  website: "https://readingroom.example",
};

const defaultFinancialSettings = {
  currency: "GBP",
  weekStartsOn: "Monday",
  targetGp: 75,
  defaultVat: 20,
  fiscalYearStartMonth: "April",
  timezone: "Europe/London",
};

const defaultMenuSettings = {
  defaultMenuTargetGp: 75,
  allowMenuTargetOverride: true,
  allowSubcategoryTargetOverride: true,
  allowDishTargetOverride: true,
};

const defaultInvoiceSettings = {
  requireApprovalBeforeGp: true,
  defaultInvoiceDepartment: "Kitchen Made",
  defaultVat: 20,
  allowUnknownSuppliers: true,
  autoCreateProductsAfterApproval: true,
};

const defaultAiSettings = {
  enableAiInvoiceReading: true,
  enableAiProductMatching: true,
  autoMatchConfidenceThreshold: 90,
  requireManualApprovalBelowThreshold: true,
  productMatchingSensitivity: "Medium",
};

const initialSuppliers = [
  { id: uid(), name: "Albion Fine Foods", category: "Dry / chilled", contact: "Orders", email: "orders@albion.example", phone: "020 7000 0101", active: true },
  { id: uid(), name: "TG Fruits", category: "Produce", contact: "Sales", email: "sales@tgfruits.example", phone: "020 7000 0202", active: true },
  { id: uid(), name: "Woods", category: "Wholesale", contact: "Account manager", email: "orders@woods.example", phone: "020 7000 0303", active: true },
  { id: uid(), name: "BNFS", category: "Fish", contact: "Fish desk", email: "", phone: "020 7000 0404", active: true },
  { id: uid(), name: "Cheese Man", category: "Dairy", contact: "", email: "", phone: "", active: true },
  { id: uid(), name: "Coburn & Baker", category: "Bakery", contact: "", email: "", phone: "", active: true },
];

const initialProducts = [
  {
    id: uid(),
    name: "Eggs Box x180 Large",
    supplier: "Cheese Man",
    packSize: "180 each",
    quantity: 1,
    unitCost: 45,
    department: "Kitchen Made",
    aliases: ["Large Eggs Box", "Eggs Large"],
    supplierPrices: [{ supplier: "Cheese Man", price: 45, date: "2026-06-01" }],
    priceHistory: [{ date: "2026-06-01", supplier: "Cheese Man", price: 45 }],
  },
  {
    id: uid(),
    name: "Chestnut Mushrooms",
    supplier: "Woods",
    packSize: "2.25kg",
    quantity: 1,
    unitCost: 9.4,
    department: "Kitchen Made",
    aliases: ["Chestnut Mushroom", "Mushroom Chestnut", "Chestnuts Mushrooms"],
    supplierPrices: [
      { supplier: "TG Fruits", price: 8.9, date: "2026-06-04" },
      { supplier: "Woods", price: 9.4, date: "2026-06-10" },
    ],
    priceHistory: [
      { date: "2026-06-04", supplier: "TG Fruits", price: 8.9 },
      { date: "2026-06-10", supplier: "Woods", price: 9.4 },
    ],
  },
  {
    id: uid(),
    name: "Squish Orange Juice",
    supplier: "Albion Fine Foods",
    packSize: "1ltr",
    quantity: 1,
    unitCost: 4.69,
    department: "Bar",
    aliases: ["Orange Juice Squish", "Squish OJ"],
    supplierPrices: [{ supplier: "Albion Fine Foods", price: 4.69, date: "2026-06-07" }],
    priceHistory: [{ date: "2026-06-07", supplier: "Albion Fine Foods", price: 4.69 }],
  },
  {
    id: uid(),
    name: "Croissant",
    supplier: "Coburn & Baker",
    packSize: "each",
    quantity: 1,
    unitCost: 1.16,
    department: "Bought In",
    aliases: ["Butter Croissant"],
    supplierPrices: [{ supplier: "Coburn & Baker", price: 1.16, date: "2026-06-08" }],
    priceHistory: [{ date: "2026-06-08", supplier: "Coburn & Baker", price: 1.16 }],
  },
  {
    id: uid(),
    name: "Cherry Tomatoes",
    supplier: "TG Fruits",
    packSize: "6x1kg",
    quantity: 1,
    unitCost: 11.8,
    department: "Kitchen Made",
    aliases: ["Tomatoes 6x1kg", "Tomato Box"],
    supplierPrices: [{ supplier: "TG Fruits", price: 11.8, date: "2026-06-09" }],
    priceHistory: [{ date: "2026-06-09", supplier: "TG Fruits", price: 11.8 }],
  },
];

const initialInvoices = [
  {
    id: uid(),
    invoiceNumber: "11676921",
    supplier: "Albion Fine Foods",
    date: "2026-06-07",
    status: "Approved",
    items: [
      { id: uid(), productName: "Squish Orange Juice", packSize: "1ltr", quantity: 3, unitCost: 4.69, supplier: "Albion Fine Foods", department: "Bar" },
      { id: uid(), productName: "Semi-Skimmed Milk", packSize: "2ltr", quantity: 2, unitCost: 1.29, supplier: "Albion Fine Foods", department: "Kitchen Made" },
    ],
  },
  {
    id: uid(),
    invoiceNumber: "807893",
    supplier: "TG Fruits",
    date: "2026-06-08",
    status: "Approved",
    items: [
      { id: uid(), productName: "Chestnut Mushrooms", packSize: "2.25kg", quantity: 4, unitCost: 8.9, supplier: "TG Fruits", department: "Kitchen Made" },
      { id: uid(), productName: "Lemons", packSize: "per kg", quantity: 3, unitCost: 1.96, supplier: "TG Fruits", department: "Kitchen Made" },
    ],
  },
];

const initialSales = [
  { id: uid(), day: "Mon", date: "2026-06-01", department: "Total", grossSales: 1585.86, vatRate: 20, sales: 1321.55 },
  { id: uid(), day: "Tue", date: "2026-06-02", department: "Total", grossSales: 980.82, vatRate: 20, sales: 817.35 },
  { id: uid(), day: "Wed", date: "2026-06-03", department: "Total", grossSales: 806.7, vatRate: 20, sales: 672.25 },
  { id: uid(), day: "Thu", date: "2026-06-04", department: "Total", grossSales: 1776.42, vatRate: 20, sales: 1480.35 },
  { id: uid(), day: "Fri", date: "2026-06-05", department: "Total", grossSales: 4018.2, vatRate: 20, sales: 3348.5 },
  { id: uid(), day: "Sat", date: "2026-06-06", department: "Total", grossSales: 3854.7, vatRate: 20, sales: 3212.25 },
  { id: uid(), day: "Sun", date: "2026-06-07", department: "Total", grossSales: 1242.95, vatRate: 20, sales: 1035.79 },
];

const initialStocktakes = [
  {
    id: uid(),
    date: "2026-06-09",
    department: "Kitchen Made",
    lines: [
      { id: uid(), productName: "Chestnut Mushrooms", quantity: 6, unitCost: 8.9, stockValue: 53.4 },
      { id: uid(), productName: "Eggs Box x180 Large", quantity: 2, unitCost: 45, stockValue: 90 },
      { id: uid(), productName: "Cherry Tomatoes", quantity: 4, unitCost: 11.8, stockValue: 47.2 },
    ],
    totalValue: 4000,
  },
];

const initialWaste = [
  { id: uid(), date: "2026-06-08", department: "Kitchen Made", productName: "Hake garnish", quantity: 1, unitCost: 18.4, reason: "Overproduction", notes: "", cost: 18.4 },
  { id: uid(), date: "2026-06-08", department: "Bar", productName: "Squish Orange Juice", quantity: 2, unitCost: 4.69, reason: "FOH mistake", notes: "", cost: 9.38 },
  { id: uid(), date: "2026-06-07", department: "Bought In", productName: "Croissant", quantity: 6, unitCost: 1.16, reason: "Spoiled", notes: "", cost: 6.96 },
];

const initialRecipes = [
  {
    id: uid(),
    name: "Mushrooms on Toast Base",
    yieldQuantity: 4,
    yieldUnit: "portions",
    ingredients: [
      { id: uid(), productId: "", productName: "Chestnut Mushrooms", supplier: "TG Fruits", quantity: 1, unitCost: 8.9 },
      { id: uid(), productId: "", productName: "Croissant", supplier: "Coburn & Baker", quantity: 2, unitCost: 1.16 },
    ],
  },
];

const initialMenus = [
  {
    id: uid(),
    name: "Summer Menu",
    season: "Summer",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    targetGp: 75,
    status: "Active",
    subcategories: [
      {
        id: uid(),
        name: "Breakfast",
        targetGp: 75,
        dishes: [
          { id: uid(), name: "Bacon & Egg Muffin", sellingPrice: 9.9, recipeIds: [], manualCost: 1.98, targetGp: 75, status: "Active" },
          { id: uid(), name: "Mushrooms on Toast", sellingPrice: 11.5, recipeIds: [], manualCost: 1.72, targetGp: 75, status: "Draft" },
        ],
      },
    ],
  },
];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
  { id: "products", label: "Products", icon: PackageSearch },
  { id: "suppliers", label: "Suppliers", icon: Store },
  { id: "stocktake", label: "Stocktake", icon: Boxes },
  { id: "recipes", label: "Recipes", icon: ChefHat },
  { id: "menu", label: "Menu Costing", icon: UtensilsCrossed },
  { id: "waste", label: "Waste", icon: Trash2 },
  { id: "gp", label: "GP Analysis", icon: Gauge },
  { id: "ai", label: "AI Insights", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value) || 0);
}

function percent(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function netFromGross(gross, vatRate = 20) {
  const divisor = 1 + (numberValue(vatRate, 0) / 100);
  return divisor ? Number((numberValue(gross, 0) / divisor).toFixed(2)) : numberValue(gross, 0);
}

function lineTotal(item) {
  const extractedLineTotal = numberValue(item.lineTotal, 0);
  if (extractedLineTotal > 0) return extractedLineTotal;
  return (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
}

function amountsAlmostEqual(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= Math.max(0.03, Math.abs(right) * 0.015);
}

function invoiceUnitCostFromExtraction(line) {
  const quantity = numberValue(line.quantity, 1);
  const unitCost = numberValue(line.unitCost, 0);
  const extractedLineTotal = numberValue(line.lineTotal, 0);

  if (quantity > 0 && extractedLineTotal > 0 && !amountsAlmostEqual(quantity * unitCost, extractedLineTotal)) {
    return Number((extractedLineTotal / quantity).toFixed(4));
  }

  return unitCost;
}

function invoiceDateTokenPattern() {
  return "\\b(?:\\d{1,2}[-/][A-Z]{3}|\\d{1,2}[./-]\\d{1,2}(?:[./-]\\d{2,4})?|20\\d{2}-\\d{2}-\\d{2})\\b";
}

function invoiceRowDateTokenPattern() {
  return "\\b\\d{1,2}[-/][A-Z]{3}\\b";
}

function invoiceNumberMatches(text) {
  const spacedText = text.replace(/(\d+[.,]\d{2})(?=\d+[.,]\d{2})/g, "$1 ");
  const matches = [];
  const pattern = /(^|\s)(-?\d+(?:[.,]\d{1,2})?)(?=\s|$)/g;
  let match;
  while ((match = pattern.exec(spacedText))) {
    const value = numberValue(match[2].replace(",", "."), NaN);
    if (Number.isFinite(value)) matches.push({ value, index: match.index + match[1].length });
  }
  return matches;
}

function splitInvoiceProductAndPack(description) {
  const cleaned = description.replace(/\s+/g, " ").trim();
  const packPattern = /\b(?:X?\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL|OZ|LB)|KILO|BOX(?:\s+[A-Z0-9]+)?|BAG|PUNNET|PNT(?:\s+SINGLE)?|SINGLE(?:\s+(?:KG|MED))?|BUNCH(?:\s*\([^)]+\))?|CASE|EACH|PACK|TRAY|BTL|TIN|CAN)\b/i;
  const match = cleaned.match(packPattern);
  if (!match || match.index < 2) return { productName: cleaned, packSize: "" };
  return {
    productName: cleaned.slice(0, match.index).trim(),
    packSize: cleaned.slice(match.index).trim(),
  };
}

function parseTgFruitsInvoiceRow(rowText) {
  const qtyDateMatch = rowText.match(new RegExp(`^\\s*(-?\\d+(?:[.,]\\d{1,2})?)\\s+${invoiceRowDateTokenPattern()}\\s+(.+)$`, "i"));
  if (qtyDateMatch) {
    const quantityValue = numberValue(qtyDateMatch[1].replace(",", "."), 0);
    const rowBody = qtyDateMatch[2].trim();
    const numbers = invoiceNumberMatches(rowBody);
    if (quantityValue > 0 && numbers.length >= 3) {
      for (let index = 0; index <= numbers.length - 3; index += 1) {
        const vat = numbers[index].value;
        const lineTotalValue = numbers[index + 1]?.value;
        const unitCostValue = numbers[index + 2]?.value;
        if (vat < 0 || unitCostValue <= 0 || lineTotalValue <= 0) continue;
        if (!amountsAlmostEqual(quantityValue * unitCostValue, lineTotalValue)) continue;

        const description = rowBody.slice(0, numbers[index].index).trim();
        const { productName, packSize } = splitInvoiceProductAndPack(description);
        if (!/[A-Za-z]{2}/.test(productName)) return null;
        return {
          productName,
          packSize,
          quantity: quantityValue,
          unitCost: unitCostValue,
          lineTotal: lineTotalValue,
        };
      }
    }
  }

  const withoutDate = rowText.replace(new RegExp(`^\\s*${invoiceDateTokenPattern()}\\s*`, "i"), "").trim();
  const numbers = invoiceNumberMatches(withoutDate);
  if (numbers.length < 4) return null;

  for (let index = numbers.length - 4; index >= 0; index -= 1) {
    const vat = numbers[index].value;
    const lineTotalValue = numbers[index + 1]?.value;
    const unitCostValue = numbers[index + 2]?.value;
    const quantityValue = numbers[index + 3]?.value;
    if (vat < 0 || quantityValue <= 0 || unitCostValue <= 0 || lineTotalValue <= 0) continue;
    if (!amountsAlmostEqual(quantityValue * unitCostValue, lineTotalValue)) continue;

    const description = withoutDate.slice(0, numbers[index].index).trim();
    const { productName, packSize } = splitInvoiceProductAndPack(description);
    if (!/[A-Za-z]{2}/.test(productName)) return null;
    return {
      productName,
      packSize,
      quantity: quantityValue,
      unitCost: unitCostValue,
      lineTotal: lineTotalValue,
    };
  }

  return null;
}

function extractTgFruitsInvoiceRows(invoiceText) {
  const normalizedText = invoiceText.replace(/\r/g, "\n").replace(/\s+/g, " ");
  const qtyDatePattern = new RegExp(`(?:^|\\s)(-?\\d+(?:[.,]\\d{1,2})?)\\s+${invoiceRowDateTokenPattern()}`, "gi");
  const qtyDateMatches = [...normalizedText.matchAll(qtyDatePattern)];
  const rows = [];

  qtyDateMatches.forEach((match, index) => {
    const start = match.index + (match[0].startsWith(" ") ? 1 : 0);
    const end = qtyDateMatches[index + 1]?.index ?? normalizedText.length;
    const row = parseTgFruitsInvoiceRow(normalizedText.slice(start, end).trim());
    if (row) rows.push(row);
  });

  if (!rows.length) {
    const datePattern = new RegExp(invoiceDateTokenPattern(), "gi");
    const dateMatches = [...normalizedText.matchAll(datePattern)];
    dateMatches.forEach((match, index) => {
      const start = match.index;
      const end = dateMatches[index + 1]?.index ?? normalizedText.length;
      const row = parseTgFruitsInvoiceRow(normalizedText.slice(start, end).trim());
      if (row) rows.push(row);
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.productName}|${row.packSize}|${row.quantity}|${row.unitCost}|${row.lineTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function singlePackFromCasePack(packSize) {
  const match = packSize.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:x|\*)\s*(.+?)\s*$/i);
  return match ? { caseUnits: numberValue(match[1], 1), singlePackSize: match[2].replace(/\s+/g, " ").trim() } : { caseUnits: 1, singlePackSize: packSize };
}

function parseEliteInvoiceRows(invoiceText) {
  const text = invoiceText.replace(/\r/g, "\n").replace(/\s+/g, " ");
  const rowPattern = /(?:^|\s)\d{1,2}\s+[A-Z0-9]+\s+(?:(?=[A-Z0-9]*\d)[A-Z0-9]+\s+)?(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:x|\*)\s*\d+(?:[.,]\d+)?\s*(?:KG|G|LTR|L|ML|CL|OZ|LB))\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d{2}))\s+\d+\b/gi;
  const rows = [];
  let match;

  while ((match = rowPattern.exec(text))) {
    const [, productName, packSizeRaw, quantityRaw, unitPriceRaw, lineValueRaw] = match;
    const packSize = packSizeRaw.replace(/\s+/g, " ").replace(/\*/g, "x").trim();
    const splitQuantity = numberValue(quantityRaw.replace(",", "."), 1);
    const caseUnitPrice = numberValue(unitPriceRaw.replace(",", "."), 0);
    const lineTotalValue = numberValue(lineValueRaw.replace(",", "."), 0);
    const { caseUnits, singlePackSize } = singlePackFromCasePack(packSize);
    const splitUnitCost = splitQuantity > 0 ? Number((lineTotalValue / splitQuantity).toFixed(4)) : caseUnitPrice;
    const isSplitPack = caseUnits > 1 && lineTotalValue > 0 && !amountsAlmostEqual(splitQuantity * caseUnitPrice, lineTotalValue);

    rows.push({
      productName: productName.replace(/\s+/g, " ").trim(),
      packSize: isSplitPack ? singlePackSize : packSize,
      quantity: splitQuantity,
      unitCost: isSplitPack ? splitUnitCost : caseUnitPrice,
      lineTotal: lineTotalValue || splitQuantity * caseUnitPrice,
    });
  }

  return rows;
}

function normalizeInvoiceUnitCost(item) {
  const quantity = numberValue(item.quantity, 1);
  const unitCost = numberValue(item.unitCost, 0);
  const extractedLineTotal = numberValue(item.lineTotal, 0);

  if (quantity > 0 && extractedLineTotal > 0 && !amountsAlmostEqual(quantity * unitCost, extractedLineTotal)) {
    return Number((extractedLineTotal / quantity).toFixed(4));
  }

  return unitCost;
}

function defaultDepartmentSplits(department = "Kitchen Made") {
  return [{ id: uid(), department: department || "Kitchen Made", percentage: 100 }];
}

function normalizeDepartmentSplits(item, fallbackDepartment = "Kitchen Made") {
  const source = Array.isArray(item.departmentSplits) && item.departmentSplits.length
    ? item.departmentSplits
    : defaultDepartmentSplits(item.department || fallbackDepartment);

  return source.map((split) => ({
    id: split.id || uid(),
    department: split.department || fallbackDepartment,
    percentage: numberValue(split.percentage, 0),
  }));
}

function departmentSplitTotal(item) {
  return normalizeDepartmentSplits(item, item.department).reduce((sum, split) => sum + numberValue(split.percentage), 0);
}

function splitIsValid(item) {
  return Math.abs(departmentSplitTotal(item) - 100) < 0.01;
}

function splitSummary(item) {
  return normalizeDepartmentSplits(item, item.department)
    .map((split) => `${split.department} ${numberValue(split.percentage).toFixed(0)}%`)
    .join(" / ");
}

function lineTotalForDepartment(item, selectedDepartment) {
  const total = lineTotal(item);
  if (selectedDepartment === "All departments") return total;
  return normalizeDepartmentSplits(item, item.department)
    .filter((split) => split.department === selectedDepartment)
    .reduce((sum, split) => sum + total * (numberValue(split.percentage) / 100), 0);
}

function primaryDepartment(item) {
  return normalizeDepartmentSplits(item, item.department)[0]?.department || item.department || "Kitchen Made";
}

function invoiceTotal(invoice) {
  return (invoice.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
}

function departmentMatches(rowDepartment, selectedDepartment) {
  return selectedDepartment === "All departments" || rowDepartment === selectedDepartment;
}

function compactPlural(token) {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

function productTokens(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(compactPlural);
}

function orderedProductKey(value = "") {
  return productTokens(value).join("");
}

function unorderedProductKey(value = "") {
  return [...productTokens(value)].sort().join("");
}

function productAliases(product) {
  return [product.name, ...(product.aliases || [])].filter(Boolean);
}

function productSimilarity(a, b) {
  const aTokens = new Set(productTokens(a));
  const bTokens = new Set(productTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = intersection / union;
  const orderedMatch = orderedProductKey(a).includes(orderedProductKey(b)) || orderedProductKey(b).includes(orderedProductKey(a));
  return Math.max(jaccard, orderedMatch ? 0.72 : 0);
}

function matchProduct(productName, products) {
  const lower = productName.trim().toLowerCase();
  if (!lower) return null;

  for (const product of products) {
    if (productAliases(product).some((alias) => alias.toLowerCase() === lower)) {
      return { product, confidence: 1, method: "Exact match" };
    }
  }

  const ordered = orderedProductKey(productName);
  const unordered = unorderedProductKey(productName);
  for (const product of products) {
    if (productAliases(product).some((alias) => orderedProductKey(alias) === ordered || unorderedProductKey(alias) === unordered)) {
      return { product, confidence: 0.94, method: "Normalized match" };
    }
  }

  let best = null;
  products.forEach((product) => {
    productAliases(product).forEach((alias) => {
      const score = productSimilarity(productName, alias);
      if (!best || score > best.score) best = { product, score };
    });
  });

  if (!best || best.score < 0.45) return null;
  return { product: best.product, confidence: Math.min(0.89, 0.55 + best.score * 0.42), method: "AI similarity" };
}

function enrichInvoiceLine(line, products, aiSettings = defaultAiSettings) {
  if (!aiSettings.enableAiProductMatching) {
    return { ...line, matchConfidence: 0, matchStatus: "Product matching disabled", matchedProductId: "", suggestedProductId: "", suggestedProductName: "" };
  }
  const match = matchProduct(line.productName, products);
  if (!match) {
    return { ...line, matchConfidence: 0, matchStatus: "Create new product", matchedProductId: "", suggestedProductId: "", suggestedProductName: "" };
  }
  const autoMatchThreshold = Math.max(0, Math.min(1, numberValue(aiSettings.autoMatchConfidenceThreshold, 90) / 100));
  if (match.confidence >= autoMatchThreshold) {
    return {
      ...line,
      productName: match.product.name,
      matchedProductId: match.product.id,
      matchConfidence: match.confidence,
      matchStatus: `${match.method} - auto matched`,
      suggestedProductId: "",
      suggestedProductName: "",
    };
  }
  if (match.confidence < 0.6 || !aiSettings.requireManualApprovalBelowThreshold) {
    return { ...line, matchConfidence: match.confidence, matchStatus: "Create new product", matchedProductId: "", suggestedProductId: "", suggestedProductName: "" };
  }
  return {
    ...line,
    matchedProductId: "",
    suggestedProductId: match.product.id,
    suggestedProductName: match.product.name,
    matchConfidence: match.confidence,
    matchStatus: "Needs confirmation",
  };
}

function canReadFileAsText(file) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.type.includes("csv") ||
    /\.(csv|txt|tsv|json)$/i.test(name)
  );
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }

  return pages.join("\n");
}

async function textFromInvoiceFiles(files) {
  const chunks = [];

  for (const file of Array.from(files || [])) {
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      chunks.push(await extractPdfText(file));
    } else if (canReadFileAsText(file)) {
      chunks.push(await file.text());
    }
  }

  return chunks.map((text) => text.trim()).filter(Boolean).join("\n\n");
}

function parseSalesCsv(text, departmentNames = [], defaultVatRate = 20) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2 && !/^date$/i.test(cells[0]))
    .map((cells) => {
      const [date, second, third] = cells;
      const hasDepartment = cells.length >= 3;
      const department = hasDepartment ? second : "Total";
      const grossSales = numberValue(hasDepartment ? third : second, 0);
      const vatRate = numberValue(cells[3], defaultVatRate);
      return {
        id: uid(),
        date,
        day: new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
        department: departmentNames.includes(department) ? department : department || "Total",
        grossSales,
        vatRate,
        sales: netFromGross(grossSales, vatRate),
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.grossSales > 0);
}

function normalizeSalesRows(rows) {
  return rows.map((row) => ({
    ...row,
    id: row.id || uid(),
    department: row.department || "Total",
    grossSales: numberValue(row.grossSales, numberValue(row.sales)),
    vatRate: numberValue(row.vatRate, 20),
    sales: row.grossSales ? netFromGross(row.grossSales, row.vatRate ?? 20) : numberValue(row.sales),
  }));
}

function cheapestOffer(product, products) {
  const prices = collectSupplierPrices(product, products);
  return prices.sort((a, b) => a.price - b.price)[0] || { supplier: product.supplier, price: numberValue(product.unitCost) };
}

function productGroupMatches(a, b) {
  const aKeys = new Set(productAliases(a).map(unorderedProductKey));
  return productAliases(b).some((alias) => aKeys.has(unorderedProductKey(alias)));
}

function collectSupplierPrices(product, products) {
  const prices = [];
  const addPrice = (supplier, price, date = today()) => {
    const numeric = numberValue(price);
    if (!supplier || !numeric) return;
    const existing = prices.find((entry) => entry.supplier === supplier);
    if (!existing || existing.date <= date) {
      if (existing) existing.price = numeric;
      else prices.push({ supplier, price: numeric, date });
    }
  };

  products.filter((candidate) => productGroupMatches(product, candidate)).forEach((candidate) => {
    addPrice(candidate.supplier, candidate.unitCost, candidate.priceHistory?.at(-1)?.date);
    (candidate.supplierPrices || []).forEach((entry) => addPrice(entry.supplier, entry.price, entry.date));
  });

  return prices;
}

function buildProductRows(products) {
  return products.map((product) => {
    const cheapest = cheapestOffer(product, products);
    const difference = cheapest.price ? ((numberValue(product.unitCost) - cheapest.price) / cheapest.price) * 100 : 0;
    return {
      ...product,
      cheapestSupplier: `${cheapest.supplier} ${money(cheapest.price)}`,
      priceDifference: difference,
      aliasesLabel: (product.aliases || []).join(", "),
    };
  });
}

function supplierExists(suppliers, name) {
  return suppliers.some((supplier) => supplier.name.toLowerCase() === name.trim().toLowerCase());
}

function ensureSupplierList(suppliers, name) {
  if (!name.trim() || supplierExists(suppliers, name)) return suppliers;
  return [...suppliers, { id: uid(), name: name.trim(), category: "New supplier", contact: "", email: "", phone: "", active: true }];
}

function mergeInvoiceProducts(products, items, invoiceDate) {
  const next = [...products];

  items.forEach((item) => {
    const invoiceUnitCost = normalizeInvoiceUnitCost(item);
    const match = item.matchedProductId
      ? { product: next.find((product) => product.id === item.matchedProductId), confidence: 1 }
      : matchProduct(item.productName, next);
    const index = match?.product ? next.findIndex((product) => product.id === match.product.id) : -1;
    const historyEntry = { date: invoiceDate, supplier: item.supplier, price: invoiceUnitCost };
    const supplierEntry = { supplier: item.supplier, price: invoiceUnitCost, date: invoiceDate };

    if (index >= 0 && match.confidence > 0.9) {
      const aliases = new Set([...(next[index].aliases || [])]);
      if (item.productName && item.productName.toLowerCase() !== next[index].name.toLowerCase()) aliases.add(item.productName);
      const supplierPrices = [...(next[index].supplierPrices || []).filter((entry) => entry.supplier !== item.supplier), supplierEntry];
      next[index] = {
        ...next[index],
        supplier: item.supplier,
        packSize: item.packSize,
        quantity: numberValue(item.quantity, 1),
        unitCost: invoiceUnitCost,
        department: primaryDepartment(item),
        departmentSplits: normalizeDepartmentSplits(item, item.department),
        aliases: [...aliases],
        supplierPrices,
        priceHistory: [...(next[index].priceHistory || []), historyEntry],
      };
      return;
    }

    next.push({
      id: uid(),
      name: item.productName,
      supplier: item.supplier,
      packSize: item.packSize,
      quantity: numberValue(item.quantity, 1),
      unitCost: invoiceUnitCost,
      department: primaryDepartment(item),
      departmentSplits: normalizeDepartmentSplits(item, item.department),
      aliases: [],
      supplierPrices: [supplierEntry],
      priceHistory: [historyEntry],
    });
  });

  return next;
}

function spendBySupplier(invoices, suppliers, dateRange = { start: "0000-01-01", end: "9999-12-31" }) {
  return suppliers.map((supplier) => {
    const spend = invoices
      .filter((invoice) => invoice.supplier === supplier.name && dateInRange(invoice.date, dateRange))
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
    return { ...supplier, spend };
  });
}

function wasteCost(row) {
  return numberValue(row.quantity) * numberValue(row.unitCost);
}

function latestStocktakeValue(stocktakes, selectedDepartment, departmentNames = defaultDepartments, dateRange = { start: "0000-01-01", end: "9999-12-31" }) {
  const relevant = stocktakes
    .filter((stocktake) => departmentMatches(stocktake.department, selectedDepartment) && stocktake.date <= dateRange.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (selectedDepartment === "All departments") {
    const latestByDepartment = departmentNames.map((department) => relevant.find((stocktake) => stocktake.department === department)).filter(Boolean);
    return latestByDepartment.reduce((sum, stocktake) => sum + numberValue(stocktake.totalValue), 0);
  }
  return numberValue(relevant[0]?.totalValue);
}

function previousStocktakeValue(stocktakes, selectedDepartment, departmentNames = defaultDepartments, beforeDate = today()) {
  if (selectedDepartment === "All departments") {
    return departmentNames.reduce((sum, department) => sum + previousStocktakeValue(stocktakes, department, departmentNames, beforeDate), 0);
  }
  const previous = stocktakes
    .filter((stocktake) => stocktake.department === selectedDepartment && stocktake.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return numberValue(previous?.totalValue);
}

function previousStocktakeRecord(stocktakes, selectedDepartment, beforeDate = today()) {
  return stocktakes
    .filter((stocktake) => stocktake.department === selectedDepartment && stocktake.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function shortDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(parseDate(date));
}

function hasPreviousStocktake(stocktakes, selectedDepartment, departmentNames = defaultDepartments, beforeDate = today()) {
  if (selectedDepartment === "All departments") {
    return departmentNames.some((department) => hasPreviousStocktake(stocktakes, department, departmentNames, beforeDate));
  }
  return stocktakes.some((stocktake) => stocktake.department === selectedDepartment && stocktake.date < beforeDate);
}

function salesForDepartment(salesRows, selectedDepartment) {
  const totalRows = salesRows.filter((row) => !row.department || row.department === "Total");
  if (selectedDepartment === "All departments") {
    return totalRows.length
      ? totalRows.reduce((sum, row) => sum + numberValue(row.sales), 0)
      : salesRows.reduce((sum, row) => sum + numberValue(row.sales), 0);
  }

  const departmentRows = salesRows.filter((row) => row.department === selectedDepartment);
  return departmentRows.length
    ? departmentRows.reduce((sum, row) => sum + numberValue(row.sales), 0)
    : totalRows.reduce((sum, row) => sum + numberValue(row.sales), 0);
}

function calculateMetrics(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames) {
  const salesRows = sales.filter((row) => dateInRange(row.date, dateRange));
  const filteredInvoices = invoices.filter((invoice) => dateInRange(invoice.date, dateRange));
  const filteredWaste = wasteItems.filter((item) => dateInRange(item.date, dateRange));
  const salesTotal = salesForDepartment(salesRows, department);
  const invoiceItems = filteredInvoices.flatMap((invoice) => invoice.items || []);
  const purchases = invoiceItems.reduce((sum, item) => sum + lineTotalForDepartment(item, department), 0);
  const allPurchases = filteredInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const openingStock = previousStocktakeValue(stocktakes, department, departmentNames, dateRange.start);
  const closingStock = latestStocktakeValue(stocktakes, department, departmentNames, dateRange);
  const waste = filteredWaste.filter((item) => departmentMatches(item.department, department)).reduce((sum, item) => sum + wasteCost(item), 0);
  const stocktakeCost = openingStock + purchases - closingStock;
  const realCostIncludingWaste = stocktakeCost + waste;

  return {
    sales: salesTotal,
    purchases,
    allPurchases,
    openingStock,
    closingStock,
    stocktakeCost,
    realCostIncludingWaste,
    invoiceGp: salesTotal ? ((salesTotal - purchases) / salesTotal) * 100 : 0,
    stocktakeGp: salesTotal ? ((salesTotal - stocktakeCost) / salesTotal) * 100 : 0,
    realGp: salesTotal ? ((salesTotal - realCostIncludingWaste) / salesTotal) * 100 : 0,
    waste,
    wastePercent: salesTotal ? (waste / salesTotal) * 100 : 0,
    stockVariance: closingStock - openingStock,
    salesRows,
    invoiceItems,
    invoices: filteredInvoices,
  };
}

function recipeBatchCost(recipe) {
  return (recipe.ingredients || []).reduce((sum, ingredient) => sum + numberValue(ingredient.quantity, 1) * numberValue(ingredient.unitCost), 0);
}

function recipeUnitCost(recipe) {
  return numberValue(recipe.yieldQuantity) ? recipeBatchCost(recipe) / numberValue(recipe.yieldQuantity) : 0;
}

function dishCost(dish, recipes) {
  const linkedRecipeCost = (dish.recipeIds || []).reduce((sum, recipeId) => {
    const recipe = recipes.find((item) => item.id === recipeId);
    return sum + (recipe ? recipeUnitCost(recipe) : 0);
  }, 0);
  return linkedRecipeCost + numberValue(dish.manualCost);
}

function gpFor(cost, price) {
  const sellingPrice = numberValue(price);
  return sellingPrice ? ((sellingPrice - numberValue(cost)) / sellingPrice) * 100 : 0;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
}

function safeReadLocalStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function safeReadLocalStorageArray(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in private or embedded preview contexts.
  }
}

function storedStateUpdater(setState, key) {
  return (value) => {
    setState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      saveLocalStorage(key, next);
      return next;
    });
  };
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date(`${today()}T00:00:00`) : date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date, weekStartsOn = "Monday") {
  const next = new Date(date);
  const day = next.getDay();
  const startDay = weekStartsOn === "Sunday" ? 0 : 1;
  const diff = (day - startDay + 7) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function resolveDateRange(range, weekStartsOn = "Monday") {
  if (range.preset === "Custom range") return { start: range.startDate, end: range.endDate };
  if (range.preset === "Specific date") {
    const date = range.specificDate || range.startDate || today();
    return { start: date, end: date };
  }

  const current = parseDate(today());
  if (range.preset === "Today") return { start: toIsoDate(current), end: toIsoDate(current) };

  if (range.preset === "This week") {
    const start = startOfWeek(current, weekStartsOn);
    return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
  }

  if (range.preset === "Last week") {
    const thisStart = startOfWeek(current, weekStartsOn);
    const start = addDays(thisStart, -7);
    return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
  }

  if (range.preset === "This month") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }

  const start = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  const end = new Date(current.getFullYear(), current.getMonth(), 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function dateInRange(date, range) {
  return date >= range.start && date <= range.end;
}

function formatRangeDate(date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parseDate(date));
}

function rangeLabel(rangeState, range) {
  return `${rangeState.preset}: ${formatRangeDate(range.start)} - ${formatRangeDate(range.end)}`;
}

function activeDepartmentNames(departmentSettings) {
  const active = departmentSettings.filter((department) => department.active).map((department) => department.name);
  return active.length ? active : defaultDepartments;
}

function targetForDepartment(departmentSettings, department, fallback) {
  if (department === "All departments") return numberValue(fallback, 75);
  return numberValue(departmentSettings.find((item) => item.name === department)?.targetGp, fallback);
}

function App() {
  const [active, setActive] = useState("dashboard");
  const [departmentSettings, setDepartmentSettingsState] = useState(() => safeReadLocalStorageArray("marginflow.departmentSettings", defaultDepartmentSettings));
  const departmentNames = activeDepartmentNames(departmentSettings);
  const departmentOptions = ["All departments", ...departmentNames];
  const [department, setDepartmentState] = useState(() => {
    try {
      const stored = localStorage.getItem("marginflow.department") || "Kitchen Made";
      return stored;
    } catch {
      return "Kitchen Made";
    }
  });
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [products, setProductsState] = useState(() => safeReadLocalStorageArray("marginflow.products", initialProducts));
  const [suppliers, setSuppliersState] = useState(() => safeReadLocalStorageArray("marginflow.suppliers", initialSuppliers));
  const [invoices, setInvoicesState] = useState(() => safeReadLocalStorageArray("marginflow.invoices", initialInvoices));
  const [sales, setSalesState] = useState(() => normalizeSalesRows(safeReadLocalStorageArray("marginflow.sales", initialSales)));
  const [stocktakes, setStocktakesState] = useState(() => safeReadLocalStorageArray("marginflow.stocktakes", initialStocktakes));
  const [wasteItems, setWasteItems] = useState(initialWaste);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [menus, setMenus] = useState(initialMenus);
  const [companySettings, setCompanySettingsState] = useState(() => safeReadLocalStorage("marginflow.companySettings", defaultCompanySettings));
  const [financialSettings, setFinancialSettingsState] = useState(() => safeReadLocalStorage("marginflow.financialSettings", defaultFinancialSettings));
  const [menuSettings, setMenuSettingsState] = useState(() => safeReadLocalStorage("marginflow.menuSettings", defaultMenuSettings));
  const [invoiceSettings, setInvoiceSettingsState] = useState(() => safeReadLocalStorage("marginflow.invoiceSettings", defaultInvoiceSettings));
  const [aiSettings, setAiSettingsState] = useState(() => safeReadLocalStorage("marginflow.aiSettings", defaultAiSettings));
  const [dateRangeState, setDateRangeState] = useState({ preset: "This month", startDate: "2026-06-01", endDate: today() });
  const [draft, setDraft] = useState(() => emptyInvoiceDraft());
  const setProducts = storedStateUpdater(setProductsState, "marginflow.products");
  const setSuppliers = storedStateUpdater(setSuppliersState, "marginflow.suppliers");
  const setInvoices = storedStateUpdater(setInvoicesState, "marginflow.invoices");
  const setSales = storedStateUpdater(setSalesState, "marginflow.sales");
  const setStocktakes = storedStateUpdater(setStocktakesState, "marginflow.stocktakes");

  const setCompanySettings = (value) => {
    setCompanySettingsState(value);
    saveLocalStorage("marginflow.companySettings", value);
  };
  const setFinancialSettings = (value) => {
    setFinancialSettingsState(value);
    saveLocalStorage("marginflow.financialSettings", value);
  };
  const setMenuSettings = (value) => {
    setMenuSettingsState(value);
    saveLocalStorage("marginflow.menuSettings", value);
  };
  const setInvoiceSettings = (value) => {
    setInvoiceSettingsState(value);
    saveLocalStorage("marginflow.invoiceSettings", value);
  };
  const setAiSettings = (value) => {
    setAiSettingsState(value);
    saveLocalStorage("marginflow.aiSettings", value);
  };
  const setDepartmentSettings = (value) => {
    setDepartmentSettingsState(value);
    saveLocalStorage("marginflow.departmentSettings", value);
  };

  const dateRange = useMemo(() => resolveDateRange(dateRangeState, financialSettings.weekStartsOn), [dateRangeState, financialSettings.weekStartsOn]);
  const metrics = useMemo(() => calculateMetrics(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames), [invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames]);
  const supplierSpend = useMemo(() => spendBySupplier(invoices, suppliers, dateRange), [invoices, suppliers, dateRange]);
  const gpTarget = targetForDepartment(departmentSettings, department, financialSettings.targetGp);
  const ActiveIcon = navItems.find((item) => item.id === active)?.icon || Home;
  const hasDepartmentContext = departmentContextPages.includes(active);

  const setDepartment = (value) => {
    setDepartmentState(value);
    setDepartmentOpen(false);
    try {
      localStorage.setItem("marginflow.department", value);
    } catch {
      // Local storage is best-effort in preview environments.
    }
  };

  const approveInvoice = () => {
    if (!draft.items.length) return;
    const invalidSplit = draft.items.find((item) => !splitIsValid(item));
    if (invalidSplit) {
      setDraft((current) => ({ ...current, status: `Department split must total 100% for ${invalidSplit.productName}.` }));
      return;
    }
    const supplier = draft.supplier || draft.items[0]?.supplier || "Unknown Supplier";
    const normalizedItems = draft.items.map((item) => {
      const departmentSplits = normalizeDepartmentSplits(item, item.department || invoiceSettings.defaultInvoiceDepartment);
      return {
        ...item,
        supplier: item.supplier || supplier,
        unitCost: normalizeInvoiceUnitCost(item),
        department: departmentSplits[0]?.department || item.department,
        departmentSplits,
      };
    });
    const invoice = {
      id: draft.editingInvoiceId || uid(),
      invoiceNumber: draft.invoiceNumber || `MF-${String(invoices.length + 1).padStart(4, "0")}`,
      supplier,
      date: draft.date || today(),
      status: "Approved",
      items: normalizedItems,
    };
    setInvoices((current) => (
      draft.editingInvoiceId
        ? current.map((item) => (item.id === draft.editingInvoiceId ? invoice : item))
        : [invoice, ...current]
    ));
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(current, normalizedItems, invoice.date));
    setDraft(emptyInvoiceDraft());
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MF</div>
          <div>
            <strong>MarginFlow</strong>
            <span>Hospitality profit management</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={active === item.id ? "active" : ""} key={item.id} onClick={() => setActive(item.id)} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-card">
          <Sparkles size={18} />
          <strong>AI assisted workflows</strong>
          <p>Invoices and stock imports use matching confidence, aliases and review steps before changes affect GP.</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MarginFlow v3</p>
            <h1>{navItems.find((item) => item.id === active)?.label}</h1>
            <p>Turn invoices, stock, recipes, waste and menus into live hospitality margin control.</p>
          </div>
        </header>

        {hasDepartmentContext && (
          <div className="view-context">
            <button className="view-title" onClick={() => setDepartmentOpen((current) => !current)} type="button">
              <ActiveIcon size={20} />
              <span>Viewing {department}</span>
              <span aria-hidden="true">▼</span>
            </button>
            {active === "dashboard" && <span className="range-chip">{rangeLabel(dateRangeState, dateRange)}</span>}
            {departmentOpen && (
              <div className="department-menu">
                {departmentOptions.map((option) => (
                  <button className={department === option ? "active" : ""} key={option} onClick={() => setDepartment(option)} type="button">
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {active === "dashboard" && <Dashboard dateRange={dateRange} dateRangeState={dateRangeState} department={department} gpTarget={gpTarget} metrics={metrics} setDateRangeState={setDateRangeState} supplierSpend={supplierSpend} />}
        {active === "invoices" && (
          <Invoices
            aiSettings={aiSettings}
            draft={draft}
            setDraft={setDraft}
            invoices={invoices}
            invoiceSettings={invoiceSettings}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            products={products}
            departmentNames={departmentNames}
            approveInvoice={approveInvoice}
            setInvoices={setInvoices}
          />
        )}
        {active === "products" && <Products departmentNames={departmentNames} products={products} setProducts={setProducts} suppliers={suppliers} />}
        {active === "suppliers" && <Suppliers suppliers={suppliers} setSuppliers={setSuppliers} supplierSpend={supplierSpend} />}
        {active === "stocktake" && (
          <Stocktake
            department={department}
            departmentNames={departmentNames}
            products={products}
            setProducts={setProducts}
            setStocktakes={setStocktakes}
            stocktakes={stocktakes}
          />
        )}
        {active === "recipes" && <Recipes products={products} recipes={recipes} setRecipes={setRecipes} />}
        {active === "menu" && <MenuCosting financialSettings={financialSettings} menuSettings={menuSettings} menus={menus} recipes={recipes} setMenus={setMenus} />}
        {active === "waste" && <Waste department={department} departmentNames={departmentNames} products={products} setWasteItems={setWasteItems} wasteItems={wasteItems} />}
        {active === "gp" && <GpAnalysis dateRange={dateRange} dateRangeState={dateRangeState} department={department} departmentNames={departmentNames} financialSettings={financialSettings} gpTarget={gpTarget} metrics={metrics} sales={sales} setDateRangeState={setDateRangeState} setSales={setSales} supplierSpend={supplierSpend} />}
        {active === "ai" && <AiInsights metrics={metrics} products={products} supplierSpend={supplierSpend} />}
        {active === "settings" && (
          <SettingsPanel
            aiSettings={aiSettings}
            companySettings={companySettings}
            departmentSettings={departmentSettings}
            financialSettings={financialSettings}
            invoiceSettings={invoiceSettings}
            menuSettings={menuSettings}
            setAiSettings={setAiSettings}
            setCompanySettings={setCompanySettings}
            setDepartmentSettings={setDepartmentSettings}
            setFinancialSettings={setFinancialSettings}
            setInvoiceSettings={setInvoiceSettings}
            setMenuSettings={setMenuSettings}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({ dateRange, dateRangeState, department, gpTarget, metrics, setDateRangeState, supplierSpend }) {
  const recentInvoices = [...metrics.invoices].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Panel title="Dashboard date range" action={rangeLabel(dateRangeState, dateRange)}>
        <DateRangeControls dateRangeState={dateRangeState} setDateRangeState={setDateRangeState} />
      </Panel>
      <div className="metric-grid">
        <Metric label="Net sales" value={money(metrics.sales)} delta={rangeLabel(dateRangeState, dateRange)} />
        <Metric label="Invoice spend" value={money(metrics.purchases)} delta={department} />
        <Metric label="Invoice GP" value={percent(metrics.invoiceGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.invoiceGp >= gpTarget ? "good" : "warn"} />
        <Metric label="Stocktake GP" value={percent(metrics.stocktakeGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.stocktakeGp >= gpTarget ? "good" : "warn"} />
        <Metric label="Waste cost" value={money(metrics.waste)} delta={`${percent(metrics.wastePercent)} of sales`} tone="warn" />
      </div>
      <div className="dashboard-layout">
        <Panel title="Profit flow" action={rangeLabel(dateRangeState, dateRange)}>
          <BarSeries rows={metrics.salesRows} valueKey="sales" />
        </Panel>
        <Panel title="Supplier spend" action={rangeLabel(dateRangeState, dateRange)}>
          <DonutBars rows={supplierSpend} />
        </Panel>
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="Recent invoices">
          <DataTable
            columns={[
              { key: "invoiceNumber", label: "Invoice" },
              { key: "supplier", label: "Supplier" },
              { key: "date", label: "Date" },
              { key: "total", label: "Total", render: (_, row) => money(invoiceTotal(row)) },
            ]}
            rows={recentInvoices}
          />
        </Panel>
        <Panel title="Cost alerts">
          <InsightList metrics={metrics} />
        </Panel>
      </div>
    </>
  );
}

function DateRangeControls({ dateRangeState, setDateRangeState }) {
  return (
    <div className="form-grid six range-grid">
      <label>
        Range
        <select value={dateRangeState.preset} onChange={(event) => setDateRangeState({ ...dateRangeState, preset: event.target.value })}>
          {rangePresets.map((preset) => <option key={preset}>{preset}</option>)}
        </select>
      </label>
      {dateRangeState.preset === "Specific date" && (
        <Field label="Date" type="date" value={dateRangeState.specificDate || dateRangeState.startDate || today()} onChange={(value) => setDateRangeState({ ...dateRangeState, specificDate: value, startDate: value, endDate: value })} />
      )}
      {dateRangeState.preset === "Custom range" && (
        <>
          <Field label="Start date" type="date" value={dateRangeState.startDate} onChange={(value) => setDateRangeState({ ...dateRangeState, startDate: value })} />
          <Field label="End date" type="date" value={dateRangeState.endDate} onChange={(value) => setDateRangeState({ ...dateRangeState, endDate: value })} />
        </>
      )}
    </div>
  );
}

function Invoices({ aiSettings, departmentNames, draft, setDraft, invoiceSettings, invoices, suppliers, setSuppliers, products, approveInvoice, setInvoices }) {
  const [dragging, setDragging] = useState(false);
  const [splitEditorId, setSplitEditorId] = useState(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const readControllerRef = useRef(null);
  const uploadRunRef = useRef(0);
  const isReading = draft.status === "Reading invoice with AI...";
  const statusTone = draft.status.startsWith("AI failed") ? "error" : draft.status.startsWith("AI extracted") ? "success" : "info";
  const hasDraftWork = draft.files.length || draft.invoiceText.trim() || draft.items.length || draft.supplier.trim() || draft.invoiceNumber.trim();
  const showCreateSupplier = draft.supplier.trim() && !supplierExists(suppliers, draft.supplier);

  const cancelDraft = () => {
    readControllerRef.current?.abort();
    readControllerRef.current = null;
    uploadRunRef.current += 1;
    setSplitEditorId(null);
    setUploadInputKey((current) => current + 1);
    setDraft(emptyInvoiceDraft());
  };

  const addFiles = async (files) => {
    const uploaded = Array.from(files || []);
    if (!uploaded.length) return;
    const uploadRun = uploadRunRef.current + 1;
    uploadRunRef.current = uploadRun;
    setDraft((current) => ({ ...current, files: [...current.files, ...uploaded], status: `${uploaded.length} file(s) uploaded` }));
    const uploadedText = await textFromInvoiceFiles(uploaded);
    if (uploadRunRef.current !== uploadRun) return;
    if (uploadedText) {
      setDraft((current) => ({
        ...current,
        invoiceText: [current.invoiceText, uploadedText].filter(Boolean).join("\n\n"),
        status: `${uploaded.length} file(s) uploaded`,
      }));
    }
  };

  const createSupplier = () => {
    setSuppliers((current) => ensureSupplierList(current, draft.supplier));
    setDraft((current) => ({ ...current, status: `${current.supplier} created` }));
  };

  const readInvoice = async () => {
    if (!aiSettings.enableAiInvoiceReading) {
      setDraft((current) => ({ ...current, status: "AI failed. AI invoice reading is disabled in Settings." }));
      return;
    }
    const uploadedText = draft.invoiceText.trim() ? "" : await textFromInvoiceFiles(draft.files);
    const invoiceText = [draft.invoiceText, uploadedText].filter(Boolean).join("\n\n").trim();

    if (!invoiceText) {
      setDraft((current) => ({ ...current, status: "AI failed. Paste invoice text or OCR text first." }));
      return;
    }

    readControllerRef.current?.abort();
    const controller = new AbortController();
    readControllerRef.current = controller;
    setDraft((current) => ({ ...current, invoiceText, status: "Reading invoice with AI..." }));

    const buildInvoiceItems = (sourceLines, supplier) => sourceLines.map((line) => {
      const quantity = numberValue(line.quantity, 1);
      const unitCost = invoiceUnitCostFromExtraction(line);
      return enrichInvoiceLine(
        {
          id: uid(),
          productName: line.productName || "Unknown product",
          packSize: line.packSize || "",
          quantity,
          unitCost,
          lineTotal: numberValue(line.lineTotal, quantity * unitCost),
          supplier,
          department: line.department || line.suggested_department || departmentForProduct(line.productName, departmentNames, invoiceSettings.defaultInvoiceDepartment),
          departmentSplits: defaultDepartmentSplits(line.department || line.suggested_department || departmentForProduct(line.productName, departmentNames, invoiceSettings.defaultInvoiceDepartment)),
          source: "OpenAI",
        },
        products,
        aiSettings
      );
    });

    const invoiceKey = invoiceText.toLowerCase();
    const draftSupplier = draft.supplier || (invoiceKey.includes("tg fruits") ? "TG Fruits" : invoiceKey.includes("elite") ? "Elite Fine Foods Ltd" : "");
    const preParsedLines = invoiceKey.includes("tg fruits")
      ? extractTgFruitsInvoiceRows(invoiceText)
      : invoiceKey.includes("elite fine foods") || invoiceKey.includes("elite sales")
        ? parseEliteInvoiceRows(invoiceText)
        : [];

    if (preParsedLines.length >= 2) {
      const supplier = draftSupplier || "Unknown Supplier";
      setDraft((current) => ({
        ...current,
        supplier,
        invoiceText,
        items: buildInvoiceItems(preParsedLines, supplier),
        status: `AI extracted ${preParsedLines.length} lines. Please review before approving.`,
      }));
      readControllerRef.current = null;
      return;
    }

    try {
      const response = await fetch("/.netlify/functions/read-invoice-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          invoiceText,
          suppliers,
          products: products.map((product) => ({
            name: product.productName,
            supplier: product.supplier,
            packSize: product.packSize,
            aliases: product.aliases || [],
          })),
        }),
      });
      const payload = await response.json().catch(() => ({ error: "AI returned an invalid response" }));
      if (!response.ok) throw new Error(payload.detail || payload.error || "AI failed");
      if (readControllerRef.current !== controller) return;

      const supplier = payload.supplier || draft.supplier || "Unknown Supplier";
      const supplierKey = supplier.toLowerCase();
      const deterministicLines = supplierKey.includes("tg fruits") || invoiceKey.includes("tg fruits")
        ? extractTgFruitsInvoiceRows(invoiceText)
        : supplierKey.includes("elite") || invoiceKey.includes("elite fine foods") || invoiceKey.includes("elite sales")
          ? parseEliteInvoiceRows(invoiceText)
          : [];
      const sourceLines = deterministicLines.length >= 2 ? deterministicLines : (payload.lines || []);
      const items = buildInvoiceItems(sourceLines, supplier);

      setDraft((current) => ({
        ...current,
        supplier,
        invoiceNumber: payload.invoiceNumber || current.invoiceNumber,
        date: payload.invoiceDate || current.date || today(),
        items,
        status: `AI extracted ${items.length} lines. Please review before approving.`,
      }));
    } catch (error) {
      if (error.name === "AbortError") return;
      setDraft((current) => ({ ...current, status: `AI failed. ${error.message}` }));
    } finally {
      if (readControllerRef.current === controller) readControllerRef.current = null;
    }
  };

  const updateDraftItem = (id, field, value) => {
    const numericFields = ["quantity", "unitCost"];
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: numericFields.includes(field) ? Number(value) : value };
        if (numericFields.includes(field)) {
          updated.lineTotal = numberValue(updated.quantity) * numberValue(updated.unitCost);
        }
        return field === "productName" ? enrichInvoiceLine(updated, products, aiSettings) : updated;
      }),
    }));
  };

  const updateDraftItemSplit = (itemId, splitId, field, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) return item;
        const departmentSplits = normalizeDepartmentSplits(item, item.department).map((split) => (
          split.id === splitId
            ? { ...split, [field]: field === "percentage" ? Number(value) : value }
            : split
        ));
        return { ...item, department: departmentSplits[0]?.department || item.department, departmentSplits };
      }),
    }));
  };

  const addDraftItemSplit = (itemId) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) return item;
        const departmentSplits = normalizeDepartmentSplits(item, item.department);
        return { ...item, departmentSplits: [...departmentSplits, { id: uid(), department: departmentNames[0] || "Kitchen Made", percentage: 0 }] };
      }),
    }));
  };

  const removeDraftItemSplit = (itemId, splitId) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) return item;
        const departmentSplits = normalizeDepartmentSplits(item, item.department).filter((split) => split.id !== splitId);
        const nextSplits = departmentSplits.length ? departmentSplits : defaultDepartmentSplits(item.department || departmentNames[0]);
        return { ...item, department: nextSplits[0]?.department || item.department, departmentSplits: nextSplits };
      }),
    }));
  };

  const splitEditorItem = draft.items.find((item) => item.id === splitEditorId);

  const applySuggestion = (id) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== id) return item;
        const product = products.find((candidate) => candidate.id === item.suggestedProductId);
        return product
          ? { ...item, productName: product.name, matchedProductId: product.id, suggestedProductId: "", suggestedProductName: "", matchStatus: "Suggestion accepted", matchConfidence: 1 }
          : item;
      }),
    }));
  };

  const addManualLine = () => {
    const supplier = draft.supplier || suppliers[0]?.name || "Unknown Supplier";
    setDraft((current) => ({
      ...current,
      supplier,
      items: [
        ...current.items,
        { id: uid(), productName: "New Product", packSize: "", quantity: 1, unitCost: 0, supplier, department: invoiceSettings.defaultInvoiceDepartment, departmentSplits: defaultDepartmentSplits(invoiceSettings.defaultInvoiceDepartment), matchStatus: "Create new product", matchConfidence: 0 },
      ],
      status: "Manual review",
    }));
  };

  const editApprovedInvoice = (invoice) => {
    const supplier = invoice.supplier || "Unknown Supplier";
    setSplitEditorId(null);
    setDraft({
      files: [],
      invoiceText: "",
      items: (invoice.items || []).map((item) => ({
        ...item,
        id: item.id || uid(),
        supplier: item.supplier || supplier,
        departmentSplits: normalizeDepartmentSplits(item, item.department || invoiceSettings.defaultInvoiceDepartment),
      })),
      supplier,
      date: invoice.date || today(),
      invoiceNumber: invoice.invoiceNumber || "",
      status: `Editing approved invoice ${invoice.invoiceNumber || ""}. Review and confirm to save changes.`,
      editingInvoiceId: invoice.id,
    });
  };

  const deleteApprovedInvoice = (id) => {
    const invoice = invoices.find((item) => item.id === id);
    const label = invoice?.invoiceNumber ? `invoice ${invoice.invoiceNumber}` : "this invoice";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setInvoices((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="page-grid">
      <Panel title="Invoice workflow" action={draft.status}>
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <Upload size={30} />
          <h3>Upload invoice PDF or image</h3>
          <p>Drag and drop files here, or choose a file. Extracted lines stay in review until approved.</p>
          <label className="file-button">
            Choose invoice
            <input
              accept="image/*,.pdf,.txt,.csv,.tsv,text/plain,text/csv"
              key={uploadInputKey}
              multiple
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        </div>
        <div className="invoice-meta">
          <label>
            Supplier
            <input list="supplier-list" value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
            <datalist id="supplier-list">
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.name} />)}
            </datalist>
          </label>
          <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label>Invoice number<input value={draft.invoiceNumber} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} /></label>
        </div>
        {showCreateSupplier && (
          <div className="button-row left tight">
            <button className="ghost" onClick={createSupplier} type="button"><Plus size={16} />Create supplier</button>
          </div>
        )}
        <label className="invoice-text">Pasted or OCR invoice text<textarea rows={7} value={draft.invoiceText} onChange={(event) => setDraft({ ...draft, invoiceText: event.target.value })} /></label>
        <div className="file-list">
          {draft.files.map((file, index) => (
            <span key={`${file.name}-${index}`}>{file.name}<button onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><X size={14} /></button></span>
          ))}
        </div>
        {draft.status !== "Idle" && <div className={`invoice-status ${statusTone}`}>{draft.status}</div>}
        <div className="button-row left">
          <button disabled={isReading} onClick={readInvoice} type="button"><Sparkles size={16} />Read Invoice</button>
          <button className="ghost" onClick={addManualLine} type="button">Add Manual Line</button>
          <button className="ghost danger" disabled={!hasDraftWork} onClick={cancelDraft} type="button"><X size={16} />Cancel Upload</button>
          <button disabled={!draft.items.length || isReading} onClick={approveInvoice} type="button"><Save size={16} />{draft.editingInvoiceId ? "Save Invoice" : "Confirm Invoice"}</button>
        </div>
      </Panel>

      <Panel title="Review invoice lines" action={`${draft.items.length} line(s)`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Product", "Pack size", "Quantity", "Unit cost", "Department split", "Supplier", "Line total", ""].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {draft.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input value={item.productName} onChange={(event) => updateDraftItem(item.id, "productName", event.target.value)} />
                    {item.suggestedProductName && (
                      <button className="match-hint" onClick={() => applySuggestion(item.id)} type="button">
                        Did you mean: {item.suggestedProductName}?
                      </button>
                    )}
                    {!item.suggestedProductName && item.matchStatus && <small className="line-note">{item.matchStatus}</small>}
                  </td>
                  <td><input value={item.packSize} onChange={(event) => updateDraftItem(item.id, "packSize", event.target.value)} /></td>
                  <td><input min="0" step="0.01" type="number" value={item.quantity} onChange={(event) => updateDraftItem(item.id, "quantity", event.target.value)} /></td>
                  <td><input min="0" step="0.01" type="number" value={item.unitCost} onChange={(event) => updateDraftItem(item.id, "unitCost", event.target.value)} /></td>
                  <td>
                    <button className={`split-button ${splitIsValid(item) ? "" : "invalid"}`} onClick={() => setSplitEditorId(item.id)} type="button">
                      {splitSummary(item)}
                    </button>
                    {!splitIsValid(item) && <small className="line-note error">Split must total 100%</small>}
                  </td>
                  <td><input value={item.supplier} onChange={(event) => updateDraftItem(item.id, "supplier", event.target.value)} /></td>
                  <td>{money(lineTotal(item))}</td>
                  <td><button className="icon danger" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((line) => line.id !== item.id) }))} type="button"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {splitEditorItem && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal" role="dialog" aria-modal="true" aria-label="Department split">
            <div className="modal-header">
              <div>
                <h3>Department split</h3>
                <p>{splitEditorItem.productName} · {money(lineTotal(splitEditorItem))}</p>
              </div>
              <button className="icon" onClick={() => setSplitEditorId(null)} type="button"><X size={16} /></button>
            </div>
            <div className="split-list">
              {normalizeDepartmentSplits(splitEditorItem, splitEditorItem.department).map((split) => (
                <div className="split-row" key={split.id}>
                  <select value={split.department} onChange={(event) => updateDraftItemSplit(splitEditorItem.id, split.id, "department", event.target.value)}>
                    {departmentNames.map((dept) => <option key={dept}>{dept}</option>)}
                  </select>
                  <input min="0" max="100" step="1" type="number" value={split.percentage} onChange={(event) => updateDraftItemSplit(splitEditorItem.id, split.id, "percentage", event.target.value)} />
                  <span>{money(lineTotal(splitEditorItem) * (numberValue(split.percentage) / 100))}</span>
                  <button className="icon danger" onClick={() => removeDraftItemSplit(splitEditorItem.id, split.id)} type="button"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className={`split-total ${splitIsValid(splitEditorItem) ? "valid" : "invalid"}`}>
              Total split: {departmentSplitTotal(splitEditorItem).toFixed(0)}%
              {!splitIsValid(splitEditorItem) && <span>Department split must total 100%</span>}
            </div>
            <div className="button-row left">
              <button className="ghost" onClick={() => addDraftItemSplit(splitEditorItem.id)} type="button"><Plus size={16} />Add split</button>
              <button disabled={!splitIsValid(splitEditorItem)} onClick={() => setSplitEditorId(null)} type="button">Done</button>
            </div>
          </div>
        </div>
      )}

      <Panel title="Approved invoices">
        <DataTable
          columns={[
            { key: "invoiceNumber", label: "Invoice" },
            { key: "supplier", label: "Supplier" },
            { key: "date", label: "Date" },
            { key: "items", label: "Lines", render: (items) => items.length },
            { key: "total", label: "Total", render: (_, row) => money(invoiceTotal(row)) },
            { key: "status", label: "Status", render: (value) => <Badge tone="green">{value}</Badge> },
          ]}
          onEdit={editApprovedInvoice}
          onDelete={deleteApprovedInvoice}
          rows={invoices}
        />
      </Panel>
    </div>
  );
}

function Products({ departmentNames, products, setProducts, suppliers }) {
  const empty = { name: "", supplier: suppliers[0]?.name || "", packSize: "", quantity: 1, unitCost: 0, department: departmentNames[0] || "Kitchen Made", aliases: "" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const rows = useMemo(() => buildProductRows(products), [products]);

  const saveProduct = () => {
    if (!form.name.trim()) return;
    const aliases = String(form.aliases || "").split(",").map((alias) => alias.trim()).filter(Boolean);
    const payload = {
      ...form,
      aliases,
      unitCost: numberValue(form.unitCost),
      quantity: numberValue(form.quantity, 1),
      supplierPrices: [{ supplier: form.supplier, price: numberValue(form.unitCost), date: today() }],
    };
    if (editingId) {
      setProducts((current) => current.map((product) => (product.id === editingId ? { ...product, ...payload, priceHistory: [...(product.priceHistory || []), { date: today(), supplier: payload.supplier, price: payload.unitCost }] } : product)));
    } else {
      setProducts((current) => [...current, { ...payload, id: uid(), priceHistory: [{ date: today(), supplier: payload.supplier, price: payload.unitCost }] }]);
    }
    setForm(empty);
    setEditingId("");
  };

  return (
    <div className="page-grid">
      <Panel title={editingId ? "Edit product" : "Add product"}>
        <div className="form-grid six">
          <Field label="Product" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <label>Supplier<select value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></label>
          <Field label="Pack size" value={form.packSize} onChange={(value) => setForm({ ...form, packSize: value })} />
          <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
          <Field label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
          <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
          <Field label="Aliases" value={form.aliases} onChange={(value) => setForm({ ...form, aliases: value })} />
        </div>
        <div className="button-row left"><button onClick={saveProduct} type="button"><Plus size={16} />{editingId ? "Save Product" : "Add Product"}</button></div>
      </Panel>
      <Panel title="Product database" action="Aliases + supplier comparison">
        <DataTable
          columns={[
            { key: "name", label: "Product" },
            { key: "supplier", label: "Current supplier" },
            { key: "unitCost", label: "Current cost", render: (value) => money(value) },
            { key: "cheapestSupplier", label: "Cheapest supplier" },
            { key: "priceDifference", label: "Price difference", render: (value) => (value > 0 ? `+${percent(value)}` : percent(value)) },
            { key: "packSize", label: "Pack" },
            { key: "department", label: "Department" },
            { key: "priceHistory", label: "Price history", render: (history) => `${history?.length || 0} entries` },
          ]}
          onDelete={(id) => setProducts((current) => current.filter((product) => product.id !== id))}
          onEdit={(row) => {
            setForm({ ...row, aliases: (row.aliases || []).join(", ") });
            setEditingId(row.id);
          }}
          rows={rows}
        />
      </Panel>
    </div>
  );
}

function Suppliers({ suppliers, setSuppliers, supplierSpend }) {
  const empty = { name: "", category: "", contact: "", email: "", phone: "", active: true };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");

  const saveSupplier = () => {
    if (!form.name.trim()) return;
    if (editingId) setSuppliers((current) => current.map((supplier) => (supplier.id === editingId ? { ...supplier, ...form } : supplier)));
    else setSuppliers((current) => [...current, { ...form, id: uid() }]);
    setForm(empty);
    setEditingId("");
  };

  return (
    <div className="page-grid">
      <Panel title={editingId ? "Edit supplier" : "Add supplier"}>
        <div className="form-grid six">
          <Field label="Supplier" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <Field label="Contact" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <label>Status<select value={form.active ? "Active" : "Inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
        </div>
        <div className="button-row left"><button onClick={saveSupplier} type="button"><Plus size={16} />{editingId ? "Save Supplier" : "Add Supplier"}</button></div>
      </Panel>
      <Panel title="Supplier directory" action="Spend totals">
        <DataTable
          columns={[
            { key: "name", label: "Supplier" },
            { key: "category", label: "Category" },
            { key: "contact", label: "Contact" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "spend", label: "Spend total", render: (value) => money(value) },
            { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "amber"}>{value ? "Active" : "Inactive"}</Badge> },
          ]}
          onDelete={(id) => setSuppliers((current) => current.filter((supplier) => supplier.id !== id))}
          onEdit={(row) => {
            setForm(row);
            setEditingId(row.id);
          }}
          rows={supplierSpend}
        />
      </Panel>
    </div>
  );
}

function Stocktake({ department, departmentNames, products, setProducts, stocktakes, setStocktakes }) {
  const stocktakeDepartment = department === "All departments" ? departmentNames[0] || "Kitchen Made" : department;
  const emptyForm = {
    id: "",
    date: today(),
    department: stocktakeDepartment,
    entryMode: "Product List",
    openingStockMode: "Automatic",
    manualOpeningType: "Manual Total Value",
    manualOpeningValue: 0,
    openingProductSearch: "",
    openingLines: [],
    productSearch: "",
    lines: [],
  };
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [viewingStocktake, setViewingStocktake] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const visibleStocktakes = stocktakes.filter((stocktake) => departmentMatches(stocktake.department, department));
  const previousStocktake = previousStocktakeRecord(stocktakes, form.department, form.date);
  const automaticOpeningStock = previousStocktakeValue(stocktakes, form.department, departmentNames, form.date);
  const openingProductTotal = (form.openingLines || []).reduce((sum, line) => sum + numberValue(line.stockValue), 0);
  const openingStockValue = form.openingStockMode === "Automatic"
    ? automaticOpeningStock
    : form.manualOpeningType === "Opening Product List"
      ? openingProductTotal
      : numberValue(form.manualOpeningValue);
  const currentStockValue = form.lines.reduce((sum, line) => sum + numberValue(line.stockValue), 0);
  const productSuggestions = form.productSearch
    ? products.filter((product) => productAliases(product).some((alias) => alias.toLowerCase().includes(form.productSearch.toLowerCase()))).slice(0, 8)
    : [];
  const openingProductSuggestions = form.openingProductSearch
    ? products.filter((product) => productAliases(product).some((alias) => alias.toLowerCase().includes(form.openingProductSearch.toLowerCase()))).slice(0, 8)
    : [];

  const newStocktake = () => {
    setForm({ ...emptyForm, date: today(), department: stocktakeDepartment });
    setStatus("");
  };

  const productLineFromProduct = (product, quantity = 1) => {
    const unitCost = numberValue(product.unitCost);
    return {
      id: uid(),
      productName: product.name,
      matchedProductId: product.id,
      supplier: product.supplier || "",
      packSize: product.packSize || "",
      department: product.department || form.department,
      quantity,
      unitCost,
      stockValue: numberValue(quantity) * unitCost,
      matchStatus: "Matched",
    };
  };

  const addManualLine = () => {
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        { id: uid(), productName: "", matchedProductId: "", supplier: "", packSize: "", department: current.department, quantity: 1, unitCost: 0, stockValue: 0, matchStatus: "Manual entry" },
      ],
    }));
  };

  const addProductLine = (product) => {
    if (!product) return;
    setForm((current) => ({
      ...current,
      productSearch: "",
      department: product.department || current.department,
      lines: [...current.lines, productLineFromProduct(product)],
    }));
  };

  const updateLine = (id, field, value) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: ["quantity", "unitCost"].includes(field) ? Number(value) : value };
        if (field === "productName") {
          const match = matchProduct(value, products);
          if (match) {
            updated.productName = match.product.name;
            updated.matchedProductId = match.product.id;
            updated.supplier = match.product.supplier || "";
            updated.packSize = match.product.packSize || "";
            updated.department = match.product.department || current.department;
            updated.unitCost = match.product.unitCost;
            updated.matchStatus = match.confidence > 0.9 ? "Matched" : `Possible match: ${match.product.name}`;
          } else {
            updated.matchedProductId = "";
            updated.matchStatus = "Create product on save";
          }
        }
        updated.stockValue = numberValue(updated.quantity) * numberValue(updated.unitCost);
        return updated;
      }),
    }));
  };

  const addOpeningLine = (product) => {
    setForm((current) => ({
      ...current,
      openingProductSearch: "",
      openingLines: [
        ...(current.openingLines || []),
        product ? productLineFromProduct(product) : { id: uid(), productName: "", matchedProductId: "", supplier: "", packSize: "", department: current.department, quantity: 1, unitCost: 0, stockValue: 0, matchStatus: "Manual opening" },
      ],
    }));
  };

  const updateOpeningLine = (id, field, value) => {
    setForm((current) => ({
      ...current,
      openingLines: (current.openingLines || []).map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: ["quantity", "unitCost"].includes(field) ? Number(value) : value };
        if (field === "productName") {
          const match = matchProduct(value, products);
          if (match) {
            updated.productName = match.product.name;
            updated.matchedProductId = match.product.id;
            updated.supplier = match.product.supplier || "";
            updated.packSize = match.product.packSize || "";
            updated.department = match.product.department || current.department;
            updated.unitCost = match.product.unitCost;
            updated.matchStatus = match.confidence > 0.9 ? "Matched" : `Possible match: ${match.product.name}`;
          } else {
            updated.matchedProductId = "";
            updated.matchStatus = "Manual opening";
          }
        }
        updated.stockValue = numberValue(updated.quantity) * numberValue(updated.unitCost);
        return updated;
      }),
    }));
  };

  const importCsv = async (file) => {
    if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim())).filter((row) => row[0]);
    const [, ...dataRows] = rows;
    const imported = dataRows.map(([productName, quantity, unitCost]) => {
      const match = matchProduct(productName, products);
      const cost = unitCost ? numberValue(unitCost) : numberValue(match?.product?.unitCost);
      return {
        id: uid(),
        productName: match?.product?.name || productName,
        matchedProductId: match?.product?.id || "",
        supplier: match?.product?.supplier || "",
        packSize: match?.product?.packSize || "",
        department: match?.product?.department || form.department,
        quantity: numberValue(quantity),
        unitCost: cost,
        stockValue: numberValue(quantity) * cost,
        matchStatus: match ? (match.confidence > 0.9 ? "Matched" : `Possible match: ${match.product.name}`) : "Create product on save",
      };
    });
    setForm((current) => ({ ...current, lines: [...current.lines, ...imported] }));
    setStatus(`Imported ${imported.length} CSV line(s).`);
  };

  const saveStocktake = () => {
    const incomplete = form.lines.some((line) => !line.productName.trim() || !numberValue(line.quantity) || !numberValue(line.unitCost));
    const incompleteOpening = form.openingStockMode === "Manual" && form.manualOpeningType === "Opening Product List"
      ? (form.openingLines || []).some((line) => !line.productName.trim() || !numberValue(line.quantity) || !numberValue(line.unitCost))
      : false;
    if (!form.lines.length || incomplete) {
      setStatus("Every line needs product name, quantity and unit cost before saving.");
      return;
    }
    if (incompleteOpening) {
      setStatus("Every opening stock line needs product name, quantity and unit cost before saving.");
      return;
    }

    let nextProducts = [...products];
    const ensureProduct = (line) => {
      const match = line.matchedProductId ? nextProducts.find((product) => product.id === line.matchedProductId) : matchProduct(line.productName, nextProducts)?.product;
      if (match) return line;
      const product = {
        id: uid(),
        name: line.productName,
        supplier: line.supplier || "Unknown Supplier",
        packSize: line.packSize || "",
        quantity: 1,
        unitCost: numberValue(line.unitCost),
        department: line.department || form.department,
        aliases: [],
        supplierPrices: [],
        priceHistory: [{ date: form.date, supplier: "Stocktake", price: numberValue(line.unitCost) }],
      };
      nextProducts = [...nextProducts, product];
      return { ...line, matchedProductId: product.id, supplier: product.supplier, matchStatus: "Created product" };
    };

    const savedLines = form.lines.map(ensureProduct);
    const savedOpeningLines = (form.openingLines || []).map(ensureProduct);

    const normalizedLines = savedLines.map((line) => ({ ...line, stockValue: numberValue(line.quantity) * numberValue(line.unitCost) }));
    const normalizedOpeningLines = savedOpeningLines.map((line) => ({ ...line, stockValue: numberValue(line.quantity) * numberValue(line.unitCost) }));
    const totalValue = normalizedLines.reduce((sum, line) => sum + numberValue(line.stockValue), 0);
    const savedOpeningValue = form.openingStockMode === "Automatic"
      ? automaticOpeningStock
      : form.manualOpeningType === "Opening Product List"
        ? normalizedOpeningLines.reduce((sum, line) => sum + numberValue(line.stockValue), 0)
        : numberValue(form.manualOpeningValue);
    const stocktake = {
      id: form.id || uid(),
      date: form.date,
      department: form.department,
      entryMode: form.entryMode,
      openingStockMode: form.openingStockMode,
      manualOpeningType: form.manualOpeningType,
      manualOpeningValue: numberValue(form.manualOpeningValue),
      openingLines: normalizedOpeningLines,
      openingStockValue: savedOpeningValue,
      openingSourceDate: form.openingStockMode === "Automatic" ? previousStocktake?.date || "" : "",
      lines: normalizedLines,
      totalValue,
      status: "Saved",
    };
    setProducts(nextProducts);
    setStocktakes((current) => form.id ? current.map((item) => (item.id === form.id ? stocktake : item)) : [stocktake, ...current]);
    setForm({ ...emptyForm, date: today(), department: form.department, entryMode: form.entryMode });
    setStatus(`Saved stocktake at ${money(totalValue)}.`);
  };

  const editStocktake = (stocktake) => {
    setForm({
      id: stocktake.id,
      date: stocktake.date,
      department: stocktake.department,
      entryMode: stocktake.entryMode || "Manual Entry",
      openingStockMode: stocktake.openingStockMode || "Automatic",
      manualOpeningType: stocktake.manualOpeningType || "Manual Total Value",
      manualOpeningValue: numberValue(stocktake.manualOpeningValue ?? stocktake.openingStockValue),
      openingProductSearch: "",
      openingLines: (stocktake.openingLines || []).map((line) => ({ ...line, id: line.id || uid(), stockValue: numberValue(line.quantity) * numberValue(line.unitCost) })),
      productSearch: "",
      lines: (stocktake.lines || []).map((line) => ({ ...line, id: line.id || uid(), stockValue: numberValue(line.quantity) * numberValue(line.unitCost) })),
    });
    setStatus(`Editing stocktake from ${stocktake.date}.`);
  };

  const confirmDeleteStocktake = () => {
    if (!deleteTarget) return;
    setStocktakes((current) => current.filter((stocktake) => stocktake.id !== deleteTarget.id));
    setDeleteTarget(null);
    setStatus("Stocktake deleted.");
  };

  const csv = ["Product,Quantity,Unit cost,Stock value", ...form.lines.map((line) => `${line.productName},${line.quantity},${line.unitCost},${line.stockValue}`)].join("\n");

  return (
    <div className="page-grid">
      <Panel title="Stocktake" action={form.id ? "Editing saved stocktake" : "Create stocktake"}>
        <div className="form-grid six stocktake-controls">
          <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
          <label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        </div>
        <div className="radio-section">
          <strong>Entry mode</strong>
          <div className="radio-row">
            {["Product List", "Manual Entry", "CSV Import"].map((mode) => (
              <label key={mode}><input checked={form.entryMode === mode} onChange={() => setForm({ ...form, entryMode: mode })} type="radio" />{mode}</label>
            ))}
          </div>
        </div>
        <div className="radio-section">
          <strong>Opening stock mode</strong>
          <div className="radio-row">
            {["Automatic", "Manual"].map((mode) => (
              <label key={mode}><input checked={form.openingStockMode === mode} onChange={() => setForm({ ...form, openingStockMode: mode })} type="radio" />{mode === "Manual" ? "Manual / First Stocktake" : mode}</label>
            ))}
          </div>
        </div>
        {form.openingStockMode === "Automatic" ? (
          <div className="stocktake-summary">
            <span>Opening Stock</span>
            <strong>{money(openingStockValue)}</strong>
            <small>{previousStocktake ? `Auto calculated from: ${shortDate(previousStocktake.date)} stocktake` : "No previous stocktake found. Opening stock set to £0."}</small>
          </div>
        ) : (
          <>
            <div className="radio-section compact">
              <strong>Manual opening type</strong>
              <div className="radio-row">
                {["Manual Total Value", "Opening Product List"].map((mode) => (
                  <label key={mode}><input checked={form.manualOpeningType === mode} onChange={() => setForm({ ...form, manualOpeningType: mode })} type="radio" />{mode}</label>
                ))}
              </div>
            </div>
            {form.manualOpeningType === "Manual Total Value" ? (
              <div className="form-grid six">
                <label>Opening Stock<input min="0" step="0.01" type="number" value={form.manualOpeningValue} onChange={(event) => setForm({ ...form, manualOpeningValue: event.target.value })} /></label>
              </div>
            ) : (
              <>
                <div className="form-grid six">
                  <label>Opening product search<input placeholder="Type product name..." value={form.openingProductSearch} onChange={(event) => setForm({ ...form, openingProductSearch: event.target.value })} /></label>
                </div>
                {openingProductSuggestions.length > 0 && (
                  <div className="suggestion-list">
                    {openingProductSuggestions.map((product) => <button key={product.id} onClick={() => addOpeningLine(product)} type="button">{product.name}<span>{product.packSize || "Unit"} · {money(product.unitCost)} · {product.supplier}</span></button>)}
                  </div>
                )}
                <div className="button-row left tight">
                  <button className="ghost" onClick={() => addOpeningLine()} type="button"><Plus size={16} />Add product</button>
                </div>
                <div className="table-wrap compact-table">
                  <table>
                    <thead><tr>{["Product", "Quantity", "Unit Cost", "Stock Value", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
                    <tbody>
                      {(form.openingLines || []).map((line) => (
                        <tr key={line.id}>
                          <td><input value={line.productName} onChange={(event) => updateOpeningLine(line.id, "productName", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={line.quantity} onChange={(event) => updateOpeningLine(line.id, "quantity", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateOpeningLine(line.id, "unitCost", event.target.value)} /></td>
                          <td>{money(line.stockValue)}</td>
                          <td><button className="icon danger" onClick={() => setForm((current) => ({ ...current, openingLines: (current.openingLines || []).filter((item) => item.id !== line.id) }))} type="button"><Trash2 size={15} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="stocktake-summary slim"><span>Opening Stock Total</span><strong>{money(openingStockValue)}</strong></div>
              </>
            )}
          </>
        )}
        <div className="button-row left">
          {form.entryMode === "Manual Entry" && <button onClick={addManualLine} type="button"><Plus size={16} />Add Product</button>}
          <button onClick={saveStocktake} type="button"><Save size={16} />Save Stocktake</button>
        </div>
        {form.entryMode === "Product List" && (
          <>
            <div className="form-grid">
              <label>Search products<input placeholder="Type product name..." value={form.productSearch} onChange={(event) => setForm({ ...form, productSearch: event.target.value })} /></label>
            </div>
            {productSuggestions.length > 0 && (
              <div className="suggestion-list">
                {productSuggestions.map((product) => <button key={product.id} onClick={() => addProductLine(product)} type="button">{product.name}<span>{product.packSize || "Unit"} · {money(product.unitCost)} · {product.supplier}</span></button>)}
              </div>
            )}
          </>
        )}
        {form.entryMode === "CSV Import" && (
          <div className="form-grid six">
            <label>CSV Import<input accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} type="file" /></label>
            <a className="file-button secondary" download="stocktake.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>CSV Export</a>
          </div>
        )}
        {status && <div className="invoice-status info">{status}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr>{["Product", "Unit", "Quantity", "Unit cost", "Stock value", "Match", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {form.lines.map((line) => (
                <tr key={line.id}>
                  <td><input readOnly={form.entryMode === "Product List" && Boolean(line.matchedProductId) && !form.id} value={line.productName} onChange={(event) => updateLine(line.id, "productName", event.target.value)} /></td>
                  <td><input value={line.packSize || ""} onChange={(event) => updateLine(line.id, "packSize", event.target.value)} /></td>
                  <td><input min="0" step="0.01" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} /></td>
                  <td><input min="0" readOnly={form.entryMode === "Product List" && Boolean(line.matchedProductId) && !form.id} step="0.01" type="number" value={line.unitCost} onChange={(event) => updateLine(line.id, "unitCost", event.target.value)} /></td>
                  <td>{money(line.stockValue)}</td>
                  <td><small className="line-note">{line.matchStatus}{line.supplier ? ` · ${line.supplier}` : ""}</small></td>
                  <td><button className="icon danger" onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) }))} type="button"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stocktake-summary slim"><span>Closing Stock</span><strong>{money(currentStockValue)}</strong></div>
      </Panel>
      <Panel title="Saved stocktakes">
        <div className="button-row left tight">
          <button onClick={newStocktake} type="button"><Plus size={16} />New Stocktake</button>
        </div>
        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "department", label: "Department" },
            { key: "lines", label: "Lines", render: (lines) => lines.length },
            { key: "totalValue", label: "Stock value", render: (value) => money(value) },
            { key: "status", label: "Status", render: (value) => <Badge tone="green">{value || "Saved"}</Badge> },
            { key: "actions", label: "Actions", render: (_, row) => (
              <div className="row-actions">
                <button className="ghost" onClick={() => setViewingStocktake(row)} type="button"><Eye size={15} />View</button>
                <button className="ghost" onClick={() => editStocktake(row)} type="button"><Edit3 size={15} />Edit</button>
                <button className="ghost danger" onClick={() => setDeleteTarget(row)} type="button"><Trash2 size={15} />Delete</button>
              </div>
            ) },
          ]}
          rows={visibleStocktakes}
        />
      </Panel>
      {viewingStocktake && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal" role="dialog" aria-modal="true" aria-label="View stocktake">
            <div className="modal-header">
              <div>
                <h3>Stocktake</h3>
                <p>{viewingStocktake.department} · {viewingStocktake.date} · {money(viewingStocktake.totalValue)}</p>
              </div>
              <button className="icon" onClick={() => setViewingStocktake(null)} type="button"><X size={16} /></button>
            </div>
            <div className="compact-row">
              <span>Opening Stock</span>
              <span>{viewingStocktake.openingStockMode || "Automatic"}</span>
              <strong>{money(viewingStocktake.openingStockValue)}</strong>
            </div>
            <div className="split-list">
              {(viewingStocktake.lines || []).map((line) => (
                <div className="compact-row" key={line.id}>
                  <span>{line.productName}</span>
                  <span>{line.quantity} x {money(line.unitCost)}</span>
                  <strong>{money(line.stockValue)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal" role="dialog" aria-modal="true" aria-label="Delete stocktake">
            <div className="modal-header">
              <div>
                <h3>Delete stocktake</h3>
                <p>Are you sure you want to delete this stocktake?</p>
              </div>
              <button className="icon" onClick={() => setDeleteTarget(null)} type="button"><X size={16} /></button>
            </div>
            <div className="button-row left">
              <button className="ghost" onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className="ghost danger" onClick={confirmDeleteStocktake} type="button">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Recipes({ products, recipes, setRecipes }) {
  const empty = { name: "", yieldQuantity: 1, yieldUnit: "portions", productSearch: "", ingredientQuantity: 1, ingredients: [] };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const suggestions = form.productSearch
    ? products.filter((product) => productAliases(product).some((alias) => alias.toLowerCase().includes(form.productSearch.toLowerCase()))).slice(0, 5)
    : [];

  const addIngredient = (product = suggestions[0]) => {
    if (!product) return;
    const cheapest = cheapestOffer(product, products);
    setForm((current) => ({
      ...current,
      productSearch: "",
      ingredientQuantity: 1,
      ingredients: [...current.ingredients, { id: uid(), productId: product.id, productName: product.name, supplier: cheapest.supplier, quantity: numberValue(current.ingredientQuantity, 1), unitCost: cheapest.price }],
    }));
  };

  const saveRecipe = () => {
    if (!form.name.trim()) return;
    const payload = { id: editingId || uid(), name: form.name, yieldQuantity: numberValue(form.yieldQuantity, 1), yieldUnit: form.yieldUnit, ingredients: form.ingredients };
    if (editingId) setRecipes((current) => current.map((recipe) => (recipe.id === editingId ? payload : recipe)));
    else setRecipes((current) => [payload, ...current]);
    setForm(empty);
    setEditingId("");
  };

  const rows = recipes.map((recipe) => ({
    ...recipe,
    yieldLabel: `${recipe.yieldQuantity} ${recipe.yieldUnit}`,
    batchCost: recipeBatchCost(recipe),
    unitCost: recipeUnitCost(recipe),
    linked: recipe.ingredients.length,
  }));

  return (
    <div className="page-grid">
      <Panel title={editingId ? "Edit recipe" : "Create recipe"}>
        <div className="form-grid six">
          <Field label="Recipe name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Yield quantity" type="number" value={form.yieldQuantity} onChange={(value) => setForm({ ...form, yieldQuantity: value })} />
          <Field label="Yield unit" value={form.yieldUnit} onChange={(value) => setForm({ ...form, yieldUnit: value })} />
          <Field label="Ingredient quantity" type="number" value={form.ingredientQuantity} onChange={(value) => setForm({ ...form, ingredientQuantity: value })} />
          <label>
            Ingredients
            <input placeholder="Type Mush..." value={form.productSearch} onChange={(event) => setForm({ ...form, productSearch: event.target.value })} />
          </label>
        </div>
        {suggestions.length > 0 && (
          <div className="suggestion-list">
            {suggestions.map((product) => {
              const cheapest = cheapestOffer(product, products);
              return <button key={product.id} onClick={() => addIngredient(product)} type="button">{product.name}<span>{cheapest.supplier} {money(cheapest.price)}</span></button>;
            })}
          </div>
        )}
        <div className="stack-list tight">
          {form.ingredients.map((ingredient) => (
            <div className="compact-row" key={ingredient.id}>
              <span>{ingredient.productName}</span>
              <span>{ingredient.supplier}</span>
              <strong>{ingredient.quantity} x {money(ingredient.unitCost)}</strong>
              <button className="icon danger" onClick={() => setForm((current) => ({ ...current, ingredients: current.ingredients.filter((item) => item.id !== ingredient.id) }))} type="button"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="button-row left">
          <button onClick={() => addIngredient()} type="button"><Plus size={16} />Add Ingredient</button>
          <button onClick={saveRecipe} type="button"><Save size={16} />{editingId ? "Save Recipe" : "Create Recipe"}</button>
        </div>
      </Panel>
      <Panel title="Recipe costing">
        <DataTable
          columns={[
            { key: "name", label: "Recipe" },
            { key: "yieldLabel", label: "Yield" },
            { key: "batchCost", label: "Batch cost", render: (value) => money(value) },
            { key: "unitCost", label: "Unit cost", render: (value) => money(value) },
            { key: "linked", label: "Ingredients" },
          ]}
          onDelete={(id) => setRecipes((current) => current.filter((recipe) => recipe.id !== id))}
          onEdit={(row) => {
            setForm({ name: row.name, yieldQuantity: row.yieldQuantity, yieldUnit: row.yieldUnit, productSearch: "", ingredientQuantity: 1, ingredients: row.ingredients });
            setEditingId(row.id);
          }}
          rows={rows}
        />
      </Panel>
    </div>
  );
}

function MenuCosting({ financialSettings, menuSettings, menus, recipes, setMenus }) {
  const defaultTarget = numberValue(menuSettings.defaultMenuTargetGp, financialSettings.targetGp);
  const [menuForm, setMenuForm] = useState({ name: "", season: "", startDate: today(), endDate: today(), targetGp: defaultTarget, status: "Draft" });
  const [activeMenuId, setActiveMenuId] = useState(menus[0]?.id || "");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [dishForm, setDishForm] = useState({ subcategoryId: menus[0]?.subcategories[0]?.id || "", name: "", sellingPrice: 0, recipeId: "", manualCost: 0, targetGp: "", status: "Draft" });
  const activeMenu = menus.find((menu) => menu.id === activeMenuId) || menus[0];
  const subcategories = activeMenu?.subcategories || [];
  const dishRows = (activeMenu?.subcategories || []).flatMap((subcategory) =>
    subcategory.dishes.map((dish) => {
      const cost = dishCost(dish, recipes);
      const gp = gpFor(cost, dish.sellingPrice);
      const dishTarget = menuSettings.allowDishTargetOverride ? numberValue(dish.targetGp) : 0;
      const subcategoryTarget = menuSettings.allowSubcategoryTargetOverride ? numberValue(subcategory.targetGp) : 0;
      const menuTargetValue = menuSettings.allowMenuTargetOverride ? numberValue(activeMenu.targetGp) : 0;
      const target = dishTarget || subcategoryTarget || menuTargetValue || defaultTarget;
      return {
        ...dish,
        id: dish.id,
        subcategory: subcategory.name,
        cost,
        gp,
        targetGp: target,
        variance: gp - target,
      };
    })
  );
  const menuGp = average(dishRows.map((dish) => dish.gp));
  const menuTarget = (menuSettings.allowMenuTargetOverride ? numberValue(activeMenu?.targetGp) : 0) || defaultTarget;
  const estimatedTotalCost = dishRows.reduce((sum, dish) => sum + dish.cost, 0);

  const createMenu = () => {
    if (!menuForm.name.trim()) return;
    const menu = { ...menuForm, id: uid(), targetGp: numberValue(menuForm.targetGp, defaultTarget), subcategories: [] };
    setMenus((current) => [menu, ...current]);
    setActiveMenuId(menu.id);
    setMenuForm({ name: "", season: "", startDate: today(), endDate: today(), targetGp: defaultTarget, status: "Draft" });
  };

  const addSubcategory = () => {
    if (!activeMenu || !subcategoryName.trim()) return;
    const subcategory = { id: uid(), name: subcategoryName, targetGp: activeMenu.targetGp, dishes: [] };
    setMenus((current) => current.map((menu) => (menu.id === activeMenu.id ? { ...menu, subcategories: [...menu.subcategories, subcategory] } : menu)));
    setDishForm((current) => ({ ...current, subcategoryId: subcategory.id }));
    setSubcategoryName("");
  };

  const addDish = () => {
    if (!activeMenu || !dishForm.subcategoryId || !dishForm.name.trim()) return;
    const dish = {
      id: uid(),
      name: dishForm.name,
      sellingPrice: numberValue(dishForm.sellingPrice),
      recipeIds: dishForm.recipeId ? [dishForm.recipeId] : [],
      manualCost: numberValue(dishForm.manualCost),
      targetGp: dishForm.targetGp === "" ? "" : numberValue(dishForm.targetGp),
      status: dishForm.status,
    };
    setMenus((current) => current.map((menu) => {
      if (menu.id !== activeMenu.id) return menu;
      return {
        ...menu,
        subcategories: menu.subcategories.map((subcategory) => (subcategory.id === dishForm.subcategoryId ? { ...subcategory, dishes: [...subcategory.dishes, dish] } : subcategory)),
      };
    }));
    setDishForm({ subcategoryId: dishForm.subcategoryId, name: "", sellingPrice: 0, recipeId: "", manualCost: 0, targetGp: "", status: "Draft" });
  };

  return (
    <div className="page-grid">
      <Panel title="Create menu">
        <div className="form-grid six">
          <Field label="Name" value={menuForm.name} onChange={(value) => setMenuForm({ ...menuForm, name: value })} />
          <Field label="Season / Type" value={menuForm.season} onChange={(value) => setMenuForm({ ...menuForm, season: value })} />
          <Field label="Start date" type="date" value={menuForm.startDate} onChange={(value) => setMenuForm({ ...menuForm, startDate: value })} />
          <Field label="End date" type="date" value={menuForm.endDate} onChange={(value) => setMenuForm({ ...menuForm, endDate: value })} />
          <Field label="Target GP %" type="number" value={menuForm.targetGp} onChange={(value) => setMenuForm({ ...menuForm, targetGp: value })} readOnly={!menuSettings.allowMenuTargetOverride} />
          <label>Status<select value={menuForm.status} onChange={(event) => setMenuForm({ ...menuForm, status: event.target.value })}><option>Draft</option><option>Active</option><option>Archived</option></select></label>
        </div>
        <div className="button-row left"><button onClick={createMenu} type="button"><Plus size={16} />Create Menu</button></div>
      </Panel>

      {activeMenu && (
        <>
          <div className="metric-grid compact">
            <Metric label="Menu GP" value={percent(menuGp)} delta="Average GP without sales mix" tone={menuGp >= menuTarget ? "good" : "warn"} />
            <Metric label="Target GP" value={percent(menuTarget)} delta={activeMenu.name} />
            <Metric label="Variance" value={percent(menuGp - menuTarget)} delta={`${dishRows.length} dishes`} tone={menuGp >= menuTarget ? "good" : "warn"} />
            <Metric label="Number of dishes" value={dishRows.length} delta="Active menu" />
            <Metric label="Estimated total cost" value={money(estimatedTotalCost)} delta="All dishes" />
          </div>
          <Panel title="Menu hierarchy" action={activeMenu.name}>
            <div className="form-grid six">
              <label>Menu<select value={activeMenu.id} onChange={(event) => setActiveMenuId(event.target.value)}>{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></label>
              <Field label="Add subcategory" value={subcategoryName} onChange={setSubcategoryName} />
              <label>Dish subcategory<select value={dishForm.subcategoryId} onChange={(event) => setDishForm({ ...dishForm, subcategoryId: event.target.value })}>{subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label>
              <Field label="Dish name" value={dishForm.name} onChange={(value) => setDishForm({ ...dishForm, name: value })} />
              <Field label="Selling price" type="number" value={dishForm.sellingPrice} onChange={(value) => setDishForm({ ...dishForm, sellingPrice: value })} />
              <label>Linked recipe<select value={dishForm.recipeId} onChange={(event) => setDishForm({ ...dishForm, recipeId: event.target.value })}><option value="">None</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label>
              <Field label="Manual ingredients cost" type="number" value={dishForm.manualCost} onChange={(value) => setDishForm({ ...dishForm, manualCost: value })} />
              <Field label="Dish target GP %" type="number" value={dishForm.targetGp} onChange={(value) => setDishForm({ ...dishForm, targetGp: value })} readOnly={!menuSettings.allowDishTargetOverride} />
              <label>Status<select value={dishForm.status} onChange={(event) => setDishForm({ ...dishForm, status: event.target.value })}><option>Draft</option><option>Active</option><option>Archived</option></select></label>
            </div>
            <div className="button-row left">
              <button className="ghost" onClick={addSubcategory} type="button"><Plus size={16} />Add Subcategory</button>
              <button onClick={addDish} type="button"><Plus size={16} />Add Dish</button>
            </div>
          </Panel>
          <Panel title="Subcategory summary">
            <div className="stack-list">
              {subcategories.map((subcategory) => {
                const rows = dishRows.filter((dish) => dish.subcategory === subcategory.name);
                const gp = average(rows.map((dish) => dish.gp));
                const target = numberValue(subcategory.targetGp, menuTarget);
                return <div className="compact-row" key={subcategory.id}><span>{subcategory.name}</span><strong>{percent(gp)}</strong><span>Target {percent(target)}</span><Badge tone={gp >= target ? "green" : "amber"}>{percent(gp - target)}</Badge><span>{rows.length} dishes</span></div>;
              })}
            </div>
          </Panel>
          <Panel title="Dish table">
            <DataTable
              columns={[
                { key: "name", label: "Dish" },
                { key: "subcategory", label: "Subcategory" },
                { key: "cost", label: "Cost", render: (value) => money(value) },
                { key: "sellingPrice", label: "Selling price", render: (value) => money(value) },
                { key: "gp", label: "GP %", render: (value) => percent(value) },
                { key: "targetGp", label: "Target GP %", render: (value) => percent(value) },
                { key: "variance", label: "Variance", render: (value) => <Badge tone={value >= 0 ? "green" : value > -5 ? "amber" : "red"}>{percent(value)}</Badge> },
                { key: "status", label: "Status" },
              ]}
              rows={dishRows}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

function Waste({ department, departmentNames, products, wasteItems, setWasteItems }) {
  const visibleWaste = wasteItems.filter((item) => departmentMatches(item.department, department)).map((item) => ({ ...item, cost: wasteCost(item) }));
  const [form, setForm] = useState({ date: today(), department: department === "All departments" ? departmentNames[0] || "Kitchen Made" : department, productName: "", quantity: 1, unitCost: 0, reason: "Spoiled", notes: "" });

  const updateProduct = (value) => {
    const match = matchProduct(value, products);
    setForm({ ...form, productName: value, unitCost: match?.product?.unitCost ?? form.unitCost });
  };

  const addWaste = () => {
    if (!form.productName.trim()) return;
    setWasteItems((current) => [{ ...form, id: uid(), cost: wasteCost(form) }, ...current]);
    setForm({ date: today(), department: form.department, productName: "", quantity: 1, unitCost: 0, reason: "Spoiled", notes: "" });
  };

  return (
    <div className="page-grid">
      <Panel title="Create waste">
        <div className="form-grid six">
          <Field label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
          <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
          <label>Product<input list="product-list" value={form.productName} onChange={(event) => updateProduct(event.target.value)} /></label>
          <datalist id="product-list">{products.map((product) => <option key={product.id} value={product.name} />)}</datalist>
          <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
          <Field label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
          <label>Reason<select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}>{["Spoiled", "Overproduction", "FOH mistake", "Kitchen mistake", "Expired", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <Field label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        </div>
        <div className="button-row left"><button onClick={addWaste} type="button"><Plus size={16} />Add Waste</button></div>
      </Panel>
      <Panel title="Waste tracking" action="Separate cost line">
        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "department", label: "Department" },
            { key: "productName", label: "Product" },
            { key: "quantity", label: "Quantity" },
            { key: "unitCost", label: "Unit cost", render: (value) => money(value) },
            { key: "reason", label: "Reason" },
            { key: "notes", label: "Notes" },
            { key: "cost", label: "Waste cost", render: (value) => money(value) },
          ]}
          onDelete={(id) => setWasteItems((current) => current.filter((item) => item.id !== id))}
          rows={visibleWaste}
        />
      </Panel>
    </div>
  );
}

function SalesManager({ defaultVatRate, departmentNames, sales, setSales }) {
  const empty = { date: today(), department: "Total", grossSales: 0, vatRate: defaultVatRate };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const departmentOptions = ["Total", ...departmentNames];

  const saveSale = () => {
    if (!form.date || !numberValue(form.grossSales)) return;
    const grossSales = numberValue(form.grossSales);
    const vatRate = numberValue(form.vatRate, defaultVatRate);
    const payload = {
      ...form,
      id: editingId || uid(),
      day: new Date(`${form.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
      grossSales,
      vatRate,
      sales: netFromGross(grossSales, vatRate),
    };
    setSales((current) => editingId ? current.map((row) => (row.id === editingId ? payload : row)) : [payload, ...current]);
    setForm(empty);
    setEditingId("");
    setStatus("Sales saved");
  };

  const importSales = async (file) => {
    if (!file) return;
    const imported = parseSalesCsv(await file.text(), departmentNames, defaultVatRate);
    if (!imported.length) {
      setStatus("CSV import found no sales rows. Use date,gross or date,department,gross,vatRate.");
      return;
    }
    setSales((current) => [...imported, ...current]);
    setStatus(`${imported.length} sales row(s) imported`);
  };

  return (
    <Panel title="Sales input" action="Manual or CSV">
      <div className="form-grid six">
        <Field label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <label>Sales type<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <Field label="Gross sales" type="number" value={form.grossSales} onChange={(value) => setForm({ ...form, grossSales: value })} />
        <Field label="VAT %" type="number" value={form.vatRate} onChange={(value) => setForm({ ...form, vatRate: value })} />
        <Field label="Net sales" type="number" readOnly value={netFromGross(form.grossSales, form.vatRate)} />
        <label>CSV Import<input accept=".csv,text/csv" onChange={(event) => importSales(event.target.files?.[0])} type="file" /></label>
      </div>
      {status && <div className="invoice-status info">{status}</div>}
      <div className="button-row left">
        <button onClick={saveSale} type="button"><Save size={16} />{editingId ? "Save Sales" : "Add Sales"}</button>
        {editingId && <button className="ghost" onClick={() => { setForm(empty); setEditingId(""); }} type="button">Cancel Edit</button>}
      </div>
      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "department", label: "Sales type" },
          { key: "grossSales", label: "Gross", render: (value) => money(value) },
          { key: "vatRate", label: "VAT %", render: (value) => percent(value) },
          { key: "sales", label: "Net", render: (value) => money(value) },
        ]}
        onDelete={(id) => setSales((current) => current.filter((row) => row.id !== id))}
        onEdit={(row) => {
          setForm({ date: row.date, department: row.department || "Total", grossSales: row.grossSales ?? row.sales, vatRate: row.vatRate ?? defaultVatRate });
          setEditingId(row.id);
        }}
        rows={sales}
      />
    </Panel>
  );
}

function GpAnalysis({ dateRange, dateRangeState, department, departmentNames, financialSettings, gpTarget, metrics, sales, setDateRangeState, setSales, supplierSpend }) {
  const costIncreaseRows = metrics.invoiceItems.map((item) => ({ id: item.id, name: item.productName, supplier: item.supplier, increase: item.unitCost > 5 ? 12.4 : 4.2, cost: item.unitCost }));
  const monthlyRows = [
    { day: "Apr", sales: metrics.sales * 0.82 },
    { day: "May", sales: metrics.sales * 0.91 },
    { day: "Jun", sales: metrics.sales },
  ];

  return (
    <>
      <Panel title="GP date range" action={rangeLabel(dateRangeState, dateRange)}>
        <DateRangeControls dateRangeState={dateRangeState} setDateRangeState={setDateRangeState} />
      </Panel>
      <div className="metric-grid">
        <Metric label="Invoice GP" value={percent(metrics.invoiceGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.invoiceGp >= gpTarget ? "good" : "warn"} />
        <Metric label="Stocktake GP" value={percent(metrics.stocktakeGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.stocktakeGp >= gpTarget ? "good" : "warn"} />
        <Metric label="Real GP incl. waste" value={percent(metrics.realGp)} delta={`${formatRangeDate(dateRange.start)} - ${formatRangeDate(dateRange.end)}`} tone={metrics.realGp >= gpTarget ? "good" : "warn"} />
        <Metric label="Waste %" value={percent(metrics.wastePercent)} delta={money(metrics.waste)} tone="warn" />
        <Metric label="Stock variance" value={money(metrics.stockVariance)} delta="Closing - opening" />
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="Weekly trends"><LineSeries rows={metrics.salesRows} valueKey="sales" /></Panel>
        <Panel title="Monthly trends"><BarSeries rows={monthlyRows} valueKey="sales" /></Panel>
      </div>
      <SalesManager defaultVatRate={financialSettings.defaultVat} departmentNames={departmentNames} sales={sales} setSales={setSales} />
      <div className="dashboard-layout secondary">
        <Panel title="Top suppliers">
          <DataTable
            columns={[
              { key: "name", label: "Supplier" },
              { key: "category", label: "Category" },
              { key: "spend", label: "Spend", render: (value) => money(value) },
            ]}
            rows={[...supplierSpend].sort((a, b) => b.spend - a.spend)}
          />
        </Panel>
        <Panel title="Top cost increases">
          <DataTable columns={[{ key: "name", label: "Product" }, { key: "supplier", label: "Supplier" }, { key: "cost", label: "Cost", render: money }, { key: "increase", label: "Increase", render: percent }]} rows={costIncreaseRows} />
        </Panel>
      </div>
      <Panel title="Formula checks" action="Restaurant GP logic">
        <div className="code-card">
          <p>Invoice GP = (food sales - purchases) / food sales x 100</p>
          <p>Stocktake real cost = opening stock + purchases - closing stock</p>
          <p>Real GP including waste = (food sales - (stocktake real cost + waste)) / food sales x 100</p>
        </div>
      </Panel>
    </>
  );
}

function AiInsights({ metrics, products, supplierSpend }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask MarginFlow AI about GP drops, supplier cost, price increases, or menu pricing. Mock answers are used until the backend is connected to OpenAI." },
  ]);

  const ask = async (preset = question) => {
    if (!preset.trim()) return;
    const prompt = preset.trim();
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setQuestion("");
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, context: { metrics, products, supplierSpend } }),
      });
      if (!response.ok) throw new Error("Backend unavailable");
      const payload = await response.json();
      setMessages((current) => [...current, { role: "assistant", text: payload.answer }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: mockAiAnswer(prompt, metrics, products, supplierSpend) }]);
    }
  };

  return (
    <div className="ai-layout">
      <Panel title="Ask MarginFlow AI" action="Mock mode">
        <div className="prompt-row">
          <input placeholder="Ask why GP dropped..." value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} />
          <button onClick={() => ask()} type="button"><Bot size={16} />Ask</button>
        </div>
        <div className="quick-prompts">
          {["Why did GP drop?", "Which products increased most?", "Which supplier costs most?", "What should I increase prices on?"].map((item) => <button className="ghost" key={item} onClick={() => ask(item)} type="button">{item}</button>)}
        </div>
        <div className="chat-panel">
          {messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}
        </div>
      </Panel>
      <Panel title="AI backend structure">
        <div className="code-card">
          <p>Invoices call <code>POST /.netlify/functions/read-invoice-ai</code>.</p>
          <p>The backend owns <code>OPENAI_API_KEY</code>. The browser never receives it.</p>
          <p>Product matching uses exact, normalized and similarity confidence before approval updates products.</p>
        </div>
      </Panel>
    </div>
  );
}

function SettingsPanel({
  aiSettings,
  companySettings,
  departmentSettings,
  financialSettings,
  invoiceSettings,
  menuSettings,
  setAiSettings,
  setCompanySettings,
  setDepartmentSettings,
  setFinancialSettings,
  setInvoiceSettings,
  setMenuSettings,
}) {
  const departmentEmpty = { name: "", type: "Food", targetGp: financialSettings.targetGp, active: true };
  const [departmentForm, setDepartmentForm] = useState(departmentEmpty);
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [dataStatus, setDataStatus] = useState("");

  const updateCompany = (field, value) => setCompanySettings({ ...companySettings, [field]: value });
  const updateFinancial = (field, value) => setFinancialSettings({ ...financialSettings, [field]: value });
  const updateMenu = (field, value) => setMenuSettings({ ...menuSettings, [field]: value });
  const updateInvoice = (field, value) => setInvoiceSettings({ ...invoiceSettings, [field]: value });
  const updateAi = (field, value) => setAiSettings({ ...aiSettings, [field]: value });

  const saveDepartment = () => {
    if (!departmentForm.name.trim()) return;
    const payload = { ...departmentForm, targetGp: numberValue(departmentForm.targetGp), active: Boolean(departmentForm.active) };
    if (editingDepartmentId) {
      setDepartmentSettings(departmentSettings.map((department) => (department.id === editingDepartmentId ? { ...department, ...payload } : department)));
    } else {
      setDepartmentSettings([...departmentSettings, { ...payload, id: uid() }]);
    }
    setDepartmentForm(departmentEmpty);
    setEditingDepartmentId("");
  };

  const backup = {
    companySettings,
    financialSettings,
    departmentSettings,
    menuSettings,
    invoiceSettings,
    aiSettings,
    exportedAt: new Date().toISOString(),
  };
  const backupHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}`;
  const departmentCsv = ["Department,Type,Target GP,Active", ...departmentSettings.map((department) => `${department.name},${department.type},${department.targetGp},${department.active ? "Active" : "Inactive"}`)].join("\n");

  const importBackup = async (file) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.companySettings) setCompanySettings({ ...defaultCompanySettings, ...payload.companySettings });
      if (payload.financialSettings) setFinancialSettings({ ...defaultFinancialSettings, ...payload.financialSettings });
      if (Array.isArray(payload.departmentSettings)) setDepartmentSettings(payload.departmentSettings);
      if (payload.menuSettings) setMenuSettings({ ...defaultMenuSettings, ...payload.menuSettings });
      if (payload.invoiceSettings) setInvoiceSettings({ ...defaultInvoiceSettings, ...payload.invoiceSettings });
      if (payload.aiSettings) setAiSettings({ ...defaultAiSettings, ...payload.aiSettings });
      setDataStatus("Backup imported.");
    } catch {
      setDataStatus("Import failed. Choose a MarginFlow backup JSON file.");
    }
  };

  const resetDemoSettings = () => {
    setCompanySettings(defaultCompanySettings);
    setFinancialSettings(defaultFinancialSettings);
    setDepartmentSettings(defaultDepartmentSettings);
    setMenuSettings(defaultMenuSettings);
    setInvoiceSettings(defaultInvoiceSettings);
    setAiSettings(defaultAiSettings);
    setDepartmentForm(departmentEmpty);
    setEditingDepartmentId("");
    setDataStatus("Demo settings restored.");
  };

  return (
    <div className="settings-grid">
      <Panel title="Company settings">
        <div className="form-grid six">
          <Field label="Company name" value={companySettings.companyName} onChange={(value) => updateCompany("companyName", value)} />
          <Field label="Trading name" value={companySettings.tradingName} onChange={(value) => updateCompany("tradingName", value)} />
          <Field label="Address" value={companySettings.address} onChange={(value) => updateCompany("address", value)} />
          <Field label="Postcode" value={companySettings.postcode} onChange={(value) => updateCompany("postcode", value)} />
          <Field label="Country" value={companySettings.country} onChange={(value) => updateCompany("country", value)} />
          <Field label="VAT number" value={companySettings.vatNumber} onChange={(value) => updateCompany("vatNumber", value)} />
          <Field label="Email" type="email" value={companySettings.email} onChange={(value) => updateCompany("email", value)} />
          <Field label="Phone" value={companySettings.phone} onChange={(value) => updateCompany("phone", value)} />
          <Field label="Website" value={companySettings.website} onChange={(value) => updateCompany("website", value)} />
        </div>
      </Panel>

      <Panel title="Financial settings">
        <div className="form-grid six">
          <label>Currency<select value={financialSettings.currency} onChange={(event) => updateFinancial("currency", event.target.value)}><option>GBP</option><option>EUR</option><option>USD</option></select></label>
          <label>Week starts on<select value={financialSettings.weekStartsOn} onChange={(event) => updateFinancial("weekStartsOn", event.target.value)}><option>Monday</option><option>Sunday</option></select></label>
          <Field label="Default target GP %" type="number" value={financialSettings.targetGp} onChange={(value) => updateFinancial("targetGp", numberValue(value))} />
          <Field label="Default VAT %" type="number" value={financialSettings.defaultVat} onChange={(value) => updateFinancial("defaultVat", numberValue(value))} />
          <label>Fiscal year start month<select value={financialSettings.fiscalYearStartMonth} onChange={(event) => updateFinancial("fiscalYearStartMonth", event.target.value)}>{["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => <option key={month}>{month}</option>)}</select></label>
          <Field label="Timezone" value={financialSettings.timezone} onChange={(value) => updateFinancial("timezone", value)} />
        </div>
      </Panel>

      <Panel title="Department settings">
        <div className="form-grid six">
          <Field label="Department" value={departmentForm.name} onChange={(value) => setDepartmentForm({ ...departmentForm, name: value })} />
          <label>Department type<select value={departmentForm.type} onChange={(event) => setDepartmentForm({ ...departmentForm, type: event.target.value })}>{departmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <Field label="Department target GP %" type="number" value={departmentForm.targetGp} onChange={(value) => setDepartmentForm({ ...departmentForm, targetGp: value })} />
          <label>Status<select value={departmentForm.active ? "Active" : "Inactive"} onChange={(event) => setDepartmentForm({ ...departmentForm, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
        </div>
        <div className="button-row left">
          <button onClick={saveDepartment} type="button"><Plus size={16} />{editingDepartmentId ? "Save Department" : "Add Department"}</button>
        </div>
        <DataTable
          columns={[
            { key: "name", label: "Department" },
            { key: "type", label: "Department type" },
            { key: "targetGp", label: "Target GP %", render: (value) => percent(value) },
            { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "amber"}>{value ? "Active" : "Inactive"}</Badge> },
          ]}
          onDelete={(id) => setDepartmentSettings(departmentSettings.filter((department) => department.id !== id))}
          onEdit={(row) => {
            setDepartmentForm(row);
            setEditingDepartmentId(row.id);
          }}
          rows={departmentSettings}
        />
      </Panel>

      <Panel title="Menu costing settings">
        <div className="form-grid six">
          <Field label="Default menu target GP %" type="number" value={menuSettings.defaultMenuTargetGp} onChange={(value) => updateMenu("defaultMenuTargetGp", numberValue(value))} />
          <CheckboxField checked={menuSettings.allowMenuTargetOverride} label="Allow menu target override" onChange={(value) => updateMenu("allowMenuTargetOverride", value)} />
          <CheckboxField checked={menuSettings.allowSubcategoryTargetOverride} label="Allow subcategory target override" onChange={(value) => updateMenu("allowSubcategoryTargetOverride", value)} />
          <CheckboxField checked={menuSettings.allowDishTargetOverride} label="Allow dish target override" onChange={(value) => updateMenu("allowDishTargetOverride", value)} />
        </div>
      </Panel>

      <Panel title="Invoice settings">
        <div className="form-grid six">
          <CheckboxField checked={invoiceSettings.requireApprovalBeforeGp} label="Require approval before invoice affects GP" onChange={(value) => updateInvoice("requireApprovalBeforeGp", value)} />
          <label>Default invoice department<select value={invoiceSettings.defaultInvoiceDepartment} onChange={(event) => updateInvoice("defaultInvoiceDepartment", event.target.value)}>{departmentSettings.filter((department) => department.active).map((department) => <option key={department.id}>{department.name}</option>)}</select></label>
          <Field label="Default VAT %" type="number" value={invoiceSettings.defaultVat} onChange={(value) => updateInvoice("defaultVat", numberValue(value))} />
          <CheckboxField checked={invoiceSettings.allowUnknownSuppliers} label="Allow unknown suppliers" onChange={(value) => updateInvoice("allowUnknownSuppliers", value)} />
          <CheckboxField checked={invoiceSettings.autoCreateProductsAfterApproval} label="Auto-create products after invoice approval" onChange={(value) => updateInvoice("autoCreateProductsAfterApproval", value)} />
        </div>
      </Panel>

      <Panel title="AI settings">
        <div className="form-grid six">
          <CheckboxField checked={aiSettings.enableAiInvoiceReading} label="Enable AI invoice reading" onChange={(value) => updateAi("enableAiInvoiceReading", value)} />
          <CheckboxField checked={aiSettings.enableAiProductMatching} label="Enable AI product matching" onChange={(value) => updateAi("enableAiProductMatching", value)} />
          <Field label="Auto-match confidence threshold" type="number" value={aiSettings.autoMatchConfidenceThreshold} onChange={(value) => updateAi("autoMatchConfidenceThreshold", numberValue(value))} />
          <CheckboxField checked={aiSettings.requireManualApprovalBelowThreshold} label="Require manual approval below threshold" onChange={(value) => updateAi("requireManualApprovalBelowThreshold", value)} />
          <label>Product matching sensitivity<select value={aiSettings.productMatchingSensitivity} onChange={(event) => updateAi("productMatchingSensitivity", event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
        </div>
      </Panel>

      <Panel title="Data settings">
        <div className="button-row left">
          <a className="file-button secondary" download="marginflow-backup.json" href={backupHref}>Export backup</a>
          <label className="file-button secondary">Import backup<input accept="application/json,.json" onChange={(event) => importBackup(event.target.files?.[0])} type="file" /></label>
          <a className="file-button secondary" download="marginflow-departments.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(departmentCsv)}`}>Export CSV</a>
          <button className="ghost" onClick={resetDemoSettings} type="button">Reset demo data</button>
        </div>
        {dataStatus && <div className="invoice-status info">{dataStatus}</div>}
      </Panel>
    </div>
  );
}

function DataTable({ columns, rows, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: columns[0]?.key || "", dir: "asc" });
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return [...rows]
      .filter((row) => JSON.stringify(row).toLowerCase().includes(lower))
      .sort((a, b) => {
        const av = String(a[sort.key] ?? "");
        const bv = String(b[sort.key] ?? "");
        return sort.dir === "asc" ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
      });
  }, [rows, query, sort]);

  const toggleSort = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));

  return (
    <>
      <div className="table-toolbar">
        <label><Search size={15} /><input placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}><button className="sort-button" onClick={() => toggleSort(column.key)} type="button">{column.label}<ArrowDownUp size={13} /></button></th>
              ))}
              {(onEdit || onDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>)}
                {(onEdit || onDelete) && (
                  <td>
                    <div className="row-actions">
                      {onEdit && <button className="icon" onClick={() => onEdit(row)} type="button"><Edit3 size={15} /></button>}
                      {onDelete && <button className="icon danger" onClick={() => onDelete(row.id)} type="button"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, value, onChange, type = "text", readOnly = false }) {
  return <label>{label}<input readOnly={readOnly} type={type} value={value} onChange={(event) => onChange?.(event.target.value)} /></label>;
}

function CheckboxField({ checked, label, onChange }) {
  return (
    <label className="checkbox-field">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function Metric({ label, value, delta, tone = "default" }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </div>
      {children}
    </section>
  );
}

function BarSeries({ rows, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return (
    <div className="bar-series thin">
      {rows.map((row) => (
        <div className="bar-column" key={row.day}>
          <div className="bar-track"><div className="bar-fill" style={{ height: `${((Number(row[valueKey]) || 0) / max) * 100}%` }} /></div>
          <span>{row.day}</span>
        </div>
      ))}
    </div>
  );
}

function LineSeries({ rows, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  const points = rows.map((row, index) => `${(index / Math.max(rows.length - 1, 1)) * 100},${100 - ((Number(row[valueKey]) || 0) / max) * 88}`).join(" ");
  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points} />
      </svg>
      <div className="chart-labels">{rows.map((row) => <span key={row.day}>{row.day}</span>)}</div>
    </div>
  );
}

function DonutBars({ rows }) {
  const max = Math.max(...rows.map((row) => row.spend), 1);
  return <div className="donut-list">{rows.map((row) => <div key={row.id || row.name}><span>{row.name}</span><strong>{money(row.spend)}</strong><i style={{ width: `${(row.spend / max) * 100}%` }} /></div>)}</div>;
}

function InsightList({ metrics }) {
  return (
    <div className="stack-list">
      <Opportunity title="Invoice GP" body={`Invoice GP is ${percent(metrics.invoiceGp)}. Review high-value invoices before the next order.`} />
      <Opportunity title="Stocktake cost" body={`Opening + purchases - closing gives ${money(metrics.stocktakeCost)} real cost used.`} />
      <Opportunity title="Waste pressure" body={`Waste is ${money(metrics.waste)} or ${percent(metrics.wastePercent)} of current sales.`} />
    </div>
  );
}

function Opportunity({ title, body }) {
  return <div className="opportunity"><div><AlertTriangle size={18} /></div><article><strong>{title}</strong><p>{body}</p></article></div>;
}

function Badge({ children, tone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function departmentForProduct(name = "", departmentNames = defaultDepartments, fallback = "Kitchen Made") {
  const lower = name.toLowerCase();
  const pick = (department) => (departmentNames.includes(department) ? department : fallback);
  if (lower.includes("juice") || lower.includes("wine") || lower.includes("beer")) return pick("Bar");
  if (lower.includes("blue roll") || lower.includes("napkin") || lower.includes("clean")) return pick("Non-food");
  if (lower.includes("croissant") || lower.includes("cake") || lower.includes("bread")) return pick("Bought In");
  return pick(fallback);
}

function mockAiAnswer(question, metrics, products, supplierSpend) {
  const lower = question.toLowerCase();
  if (lower.includes("supplier")) {
    const top = [...supplierSpend].sort((a, b) => b.spend - a.spend)[0];
    return `${top?.name || "No supplier"} is currently the highest-cost supplier at ${money(top?.spend || 0)}. Review high-value invoice lines before the next order.`;
  }
  if (lower.includes("product") || lower.includes("increased")) {
    const top = [...products].sort((a, b) => b.unitCost - a.unitCost)[0];
    return `${top?.name || "No product"} is one of the highest-cost products at ${money(top?.unitCost || 0)}. Check its latest invoice against previous price history.`;
  }
  if (lower.includes("price")) {
    return "Start with dishes below 75% GP or dishes using products that recently increased. Increase selling price only where volume and guest perception can support it.";
  }
  return `Real GP including waste is currently ${percent(metrics.realGp)}. Check invoice spend, stock variance and waste by department.`;
}

const rootElement = document.getElementById("root");
const root = rootElement._marginFlowRoot || createRoot(rootElement);
rootElement._marginFlowRoot = root;
root.render(<App />);
