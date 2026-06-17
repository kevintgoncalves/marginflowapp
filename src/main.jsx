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
const rangePresets = ["Today", "Yesterday", "Specific Date", "This Week", "Last Week", "This Month", "Last Month", "This Year", "Custom Range"];

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
  salesInputMethod: "Manual Gross + Net Sales",
  gpCalculationBase: "Net Sales",
  posProvider: "Square",
  salesDataMode: "Gross + Net from POS",
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
    openingStockMode: "Manual",
    manualOpeningType: "Manual Total Value",
    manualOpeningValue: 0,
    openingStockValue: 0,
    openingLines: [],
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
  { id: "gp", label: "Sales", icon: Gauge },
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

function vatAmountFromGross(gross, vatRate = 20) {
  return Number((numberValue(gross, 0) - netFromGross(gross, vatRate)).toFixed(2));
}

function vatAmountFromGrossNet(gross, net) {
  return Number((numberValue(gross) - numberValue(net)).toFixed(2));
}

function effectiveVatRate(gross, net) {
  const netValue = numberValue(net);
  return netValue ? (vatAmountFromGrossNet(gross, netValue) / netValue) * 100 : 0;
}

function netSalesForRow(row) {
  return row?.grossSales !== undefined
    ? numberValue(row.sales)
    : numberValue(row?.sales);
}

function salesBaseForRow(row, gpCalculationBase = "Net Sales") {
  return gpCalculationBase === "Gross Sales" ? numberValue(row?.grossSales) : netSalesForRow(row);
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

function productAutocomplete(products, query, limit = 8) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  return products
    .filter((product) => productAliases(product).some((alias) => alias.toLowerCase().includes(term)))
    .slice(0, limit);
}

function recipeAutocomplete(recipes, query, limit = 8) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  return recipes.filter((recipe) => recipe.name.toLowerCase().includes(term)).slice(0, limit);
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

function isImageInvoiceFile(file) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function loadBrowserImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read ${file.name}. Use PNG, JPG, WEBP or GIF images.`));
    };
    image.src = objectUrl;
  });
}

async function imageFileToInvoiceInput(file) {
  const maxDimension = 1800;
  const image = await loadBrowserImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    fileName: file.name,
    fileType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
  };
}

async function invoiceImagesFromFiles(files) {
  return Promise.all(Array.from(files || []).filter(isImageInvoiceFile).map(imageFileToInvoiceInput));
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

function parseCurrencyCell(value) {
  return numberValue(String(value || "").replace(/[£$,]/g, ""));
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseSalesCsv(text, departmentNames = [], defaultVatRate = 20, salesInputMethod = "Manual Gross + Net Sales") {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const hasHeader = header.some((cell) => ["date", "grosssales", "netsales", "gross", "net", "department", "salestype"].includes(cell));
  const findIndex = (names) => header.findIndex((cell) => names.includes(cell));
  const dateIndex = hasHeader ? findIndex(["date", "businessdate", "day"]) : 0;
  const departmentIndex = hasHeader ? findIndex(["department", "salestype", "type", "category"]) : -1;
  const grossIndex = hasHeader ? findIndex(["grosssales", "gross", "totalsales"]) : -1;
  const netIndex = hasHeader ? findIndex(["netsales", "net", "netrevenue"]) : -1;
  const vatIndex = hasHeader ? findIndex(["vat", "vatamount", "tax", "taxamount"]) : -1;
  const vatRateIndex = hasHeader ? findIndex(["vatrate", "vatpercent", "taxrate"]) : -1;
      const discountIndex = hasHeader ? findIndex(["discounts", "discount"]) : -1;
      const refundIndex = hasHeader ? findIndex(["refunds", "refund", "returns"]) : -1;
  const serviceIndex = hasHeader ? findIndex(["servicecharge", "servicecharges", "gratuity"]) : -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .filter((cells) => cells.length >= 2)
    .map((cells) => {
      const hasDepartment = !hasHeader && cells.length >= 3;
      const date = cells[dateIndex >= 0 ? dateIndex : 0];
      const department = hasHeader
        ? cells[departmentIndex] || "Total"
        : hasDepartment ? cells[1] : "Total";
      const grossSales = hasHeader
        ? parseCurrencyCell(cells[grossIndex])
        : parseCurrencyCell(hasDepartment ? cells[2] : cells[1]);
      const vatRate = hasHeader ? numberValue(cells[vatRateIndex], defaultVatRate) : numberValue(cells[hasDepartment ? 4 : 3], defaultVatRate);
      const importedNet = hasHeader && netIndex >= 0 ? parseCurrencyCell(cells[netIndex]) : parseCurrencyCell(cells[hasDepartment ? 3 : 2]);
      const sales = importedNet || (salesInputMethod === "Auto-calculate Net Sales from VAT %" ? netFromGross(grossSales, vatRate) : 0);
      const vatAmount = sales ? vatAmountFromGrossNet(grossSales, sales) : parseCurrencyCell(cells[vatIndex]);
      const discounts = parseCurrencyCell(cells[discountIndex]);
      const refunds = parseCurrencyCell(cells[refundIndex]);
      const serviceCharge = parseCurrencyCell(cells[serviceIndex]);
      return {
        id: uid(),
        date,
        day: new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
        department: departmentNames.includes(department) ? department : department || "Total",
        grossSales,
        sales,
        vatRate,
        vatAmount,
        effectiveVatRate: effectiveVatRate(grossSales, sales),
        discounts,
        refunds,
        serviceCharge,
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.grossSales > 0);
}

function csvRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

function parseProductsCsv(text, suppliers = [], departmentNames = []) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  const hasHeader = header.some((cell) => ["product", "productname", "supplier", "packsize", "unitcost", "department"].includes(cell));
  const findIndex = (names) => header.findIndex((cell) => names.includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const nameIndex = hasHeader ? findIndex(["product", "productname", "name"]) : 0;
  const supplierIndex = hasHeader ? findIndex(["supplier", "suppliername"]) : 1;
  const packIndex = hasHeader ? findIndex(["packsize", "pack", "unit"]) : 2;
  const quantityIndex = hasHeader ? findIndex(["quantity", "qty"]) : 3;
  const costIndex = hasHeader ? findIndex(["unitcost", "cost", "price"]) : 4;
  const departmentIndex = hasHeader ? findIndex(["department", "salesdepartment"]) : 5;
  const aliasesIndex = hasHeader ? findIndex(["aliases", "alias"]) : 6;
  const defaultSupplier = suppliers[0]?.name || "";
  const defaultDepartment = departmentNames[0] || "Kitchen Made";

  return dataRows.map((cells) => ({
    id: uid(),
    name: cells[nameIndex] || "",
    supplier: cells[supplierIndex] || defaultSupplier,
    packSize: cells[packIndex] || "",
    quantity: parseCurrencyCell(cells[quantityIndex]) || 1,
    unitCost: parseCurrencyCell(cells[costIndex]),
    department: cells[departmentIndex] || defaultDepartment,
    aliases: cells[aliasesIndex] || "",
  })).filter((row) => row.name.trim());
}

function parseSuppliersCsv(text) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  const hasHeader = header.some((cell) => ["supplier", "suppliername", "category", "contact", "email", "phone", "status"].includes(cell));
  const findIndex = (names) => header.findIndex((cell) => names.includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const nameIndex = hasHeader ? findIndex(["supplier", "suppliername", "name"]) : 0;
  const categoryIndex = hasHeader ? findIndex(["category", "type"]) : 1;
  const contactIndex = hasHeader ? findIndex(["contact", "contactname"]) : 2;
  const emailIndex = hasHeader ? findIndex(["email", "emailaddress"]) : 3;
  const phoneIndex = hasHeader ? findIndex(["phone", "telephone", "mobile"]) : 4;
  const statusIndex = hasHeader ? findIndex(["status", "active"]) : 5;

  return dataRows.map((cells) => {
    const status = String(cells[statusIndex] || "Active").toLowerCase();
    return {
      id: uid(),
      name: cells[nameIndex] || "",
      category: cells[categoryIndex] || "",
      contact: cells[contactIndex] || "",
      email: cells[emailIndex] || "",
      phone: cells[phoneIndex] || "",
      active: !["inactive", "false", "no", "0"].includes(status),
    };
  }).filter((row) => row.name.trim());
}

function normalizeSalesRows(rows) {
  return rows.map((row) => {
    const grossSales = numberValue(row.grossSales, numberValue(row.sales));
    const vatRate = numberValue(row.vatRate, 20);
    const sales = row.sales !== undefined ? numberValue(row.sales) : netFromGross(grossSales, vatRate);
    return {
      ...row,
      id: row.id || uid(),
      department: row.department || "Total",
      grossSales,
      vatRate,
      sales,
      vatAmount: vatAmountFromGrossNet(grossSales, sales),
      effectiveVatRate: effectiveVatRate(grossSales, sales),
      discounts: numberValue(row.discounts),
      refunds: numberValue(row.refunds),
      serviceCharge: numberValue(row.serviceCharge),
    };
  });
}

function normalizeStocktakes(rows) {
  return rows.map((stocktake) => ({
    ...stocktake,
    id: stocktake.id || uid(),
    openingStockMode: "Manual",
    manualOpeningType: stocktake.manualOpeningType || "Manual Total Value",
    manualOpeningValue: numberValue(stocktake.manualOpeningValue ?? stocktake.openingStockValue),
    openingLines: stocktake.openingLines || [],
    openingStockValue: numberValue(stocktake.openingStockValue),
    lines: stocktake.lines || [],
    totalValue: numberValue(stocktake.totalValue),
    status: stocktake.status || "Saved",
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

function latestStocktakeRecords(stocktakes, selectedDepartment, departmentNames = defaultDepartments, dateRange = { start: "0000-01-01", end: "9999-12-31" }) {
  const relevant = stocktakes
    .filter((stocktake) => departmentMatches(stocktake.department, selectedDepartment) && stocktake.date <= dateRange.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (selectedDepartment === "All departments") {
    return departmentNames.map((department) => relevant.find((stocktake) => stocktake.department === department)).filter(Boolean);
  }
  return relevant[0] ? [relevant[0]] : [];
}

function openingStockValue(stocktakes, selectedDepartment, departmentNames = defaultDepartments, dateRange = { start: "0000-01-01", end: "9999-12-31" }) {
  return latestStocktakeRecords(stocktakes, selectedDepartment, departmentNames, dateRange)
    .reduce((sum, stocktake) => sum + numberValue(stocktake.openingStockValue), 0);
}

function salesForDepartment(salesRows, selectedDepartment, gpCalculationBase = "Net Sales") {
  const totalRows = salesRows.filter((row) => !row.department || row.department === "Total");
  if (selectedDepartment === "All departments") {
    return totalRows.length
      ? totalRows.reduce((sum, row) => sum + salesBaseForRow(row, gpCalculationBase), 0)
      : salesRows.reduce((sum, row) => sum + salesBaseForRow(row, gpCalculationBase), 0);
  }

  const departmentRows = salesRows.filter((row) => row.department === selectedDepartment);
  return departmentRows.length
    ? departmentRows.reduce((sum, row) => sum + salesBaseForRow(row, gpCalculationBase), 0)
    : totalRows.reduce((sum, row) => sum + salesBaseForRow(row, gpCalculationBase), 0);
}

function grossSalesForDepartment(salesRows, selectedDepartment) {
  const totalRows = salesRows.filter((row) => !row.department || row.department === "Total");
  if (selectedDepartment === "All departments") {
    return totalRows.length
      ? totalRows.reduce((sum, row) => sum + numberValue(row.grossSales), 0)
      : salesRows.reduce((sum, row) => sum + numberValue(row.grossSales), 0);
  }
  const departmentRows = salesRows.filter((row) => row.department === selectedDepartment);
  return departmentRows.length
    ? departmentRows.reduce((sum, row) => sum + numberValue(row.grossSales), 0)
    : totalRows.reduce((sum, row) => sum + numberValue(row.grossSales), 0);
}

function vatForDepartment(salesRows, selectedDepartment) {
  const totalRows = salesRows.filter((row) => !row.department || row.department === "Total");
  const rows = selectedDepartment === "All departments"
    ? (totalRows.length ? totalRows : salesRows)
    : salesRows.filter((row) => row.department === selectedDepartment);
  const fallbackRows = rows.length ? rows : totalRows;
  return fallbackRows.reduce((sum, row) => sum + vatAmountFromGrossNet(row.grossSales, row.sales), 0);
}

function purchasesForDepartment(invoices, selectedDepartment) {
  return invoices
    .flatMap((invoice) => invoice.items || [])
    .reduce((sum, item) => sum + lineTotalForDepartment(item, selectedDepartment), 0);
}

function wasteForDepartment(wasteItems, selectedDepartment) {
  return wasteItems
    .filter((item) => departmentMatches(item.department, selectedDepartment))
    .reduce((sum, item) => sum + wasteCost(item), 0);
}

function metricsForPeriod(invoices, sales, selectedDepartment, stocktakes, wasteItems, dateRange, departmentNames, financialSettings = defaultFinancialSettings) {
  const salesRows = normalizeSalesRows(sales.filter((row) => dateInRange(row.date, dateRange)));
  const filteredInvoices = invoices.filter((invoice) => dateInRange(invoice.date, dateRange));
  const filteredWaste = wasteItems.filter((item) => dateInRange(item.date, dateRange));
  const salesTotal = salesForDepartment(salesRows, selectedDepartment, financialSettings.gpCalculationBase || "Net Sales");
  const netSales = salesForDepartment(salesRows, selectedDepartment, "Net Sales");
  const grossSales = grossSalesForDepartment(salesRows, selectedDepartment);
  const vat = vatForDepartment(salesRows, selectedDepartment);
  const purchases = purchasesForDepartment(filteredInvoices, selectedDepartment);
  const allPurchases = filteredInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const openingStock = openingStockValue(stocktakes, selectedDepartment, departmentNames, dateRange);
  const closingStock = latestStocktakeValue(stocktakes, selectedDepartment, departmentNames, dateRange);
  const waste = wasteForDepartment(filteredWaste, selectedDepartment);
  const stocktakeCost = openingStock + purchases - closingStock;
  const realCostIncludingWaste = stocktakeCost + waste;

  return {
    grossSales,
    vat,
    netSales,
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
    invoiceItems: filteredInvoices.flatMap((invoice) => invoice.items || []),
    invoices: filteredInvoices,
  };
}

function calculateMetrics(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings = defaultFinancialSettings) {
  const base = metricsForPeriod(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings);
  const days = dateRangeDays(dateRange);
  const dailyRows = days.map((date) => {
    const period = { start: date, end: date };
    const row = metricsForPeriod(invoices, sales, department, stocktakes, wasteItems, period, departmentNames, financialSettings);
    return {
      id: date,
      date,
      day: formatRangeDate(date),
      grossSales: row.grossSales,
      vat: row.vat,
      netSales: row.netSales,
      salesBase: row.sales,
      purchases: row.purchases,
      waste: row.waste,
      invoiceGp: row.invoiceGp,
      stocktakeGp: row.stocktakeGp,
      realGp: row.realGp,
      targetGp: 0,
    };
  });
  const departmentRows = departmentNames.map((name) => {
    const row = metricsForPeriod(invoices, sales, name, stocktakes, wasteItems, dateRange, departmentNames, financialSettings);
    return {
      id: name,
      department: name,
      grossSales: row.grossSales,
      netSales: row.netSales,
      salesBase: row.sales,
      purchases: row.purchases,
      waste: row.waste,
      gp: row.invoiceGp,
      targetGp: 0,
      variance: row.invoiceGp,
    };
  });
  return { ...base, dailyRows, departmentRows };
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
  const ingredientCost = (dish.ingredients || []).reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost, numberValue(ingredient.quantity) * numberValue(ingredient.unitCost)), 0);
  return linkedRecipeCost + ingredientCost + numberValue(dish.manualCost);
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

function readMarginFlowLocalStorage() {
  const data = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("marginflow.")) data[key] = localStorage.getItem(key);
    }
  } catch {
    return data;
  }
  return data;
}

function buildFullBackupPayload() {
  const localStorageData = readMarginFlowLocalStorage();
  return {
    app: "MarginFlow",
    appVersion: "0.1.0",
    exportedAt: new Date().toISOString(),
    localStorage: localStorageData,
    ...localStorageData,
  };
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function extractBackupLocalStorage(payload) {
  if (payload?.localStorage && typeof payload.localStorage === "object") return payload.localStorage;
  return Object.fromEntries(Object.entries(payload || {}).filter(([key]) => key.startsWith("marginflow.")));
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
  if (range.preset === "Custom Range" || range.preset === "Custom range") return { start: range.startDate, end: range.endDate };
  if (range.preset === "Specific Date" || range.preset === "Specific date") {
    const date = range.specificDate || range.startDate || today();
    return { start: date, end: date };
  }

  const current = parseDate(today());
  if (range.preset === "Today") return { start: toIsoDate(current), end: toIsoDate(current) };
  if (range.preset === "Yesterday") {
    const yesterday = addDays(current, -1);
    return { start: toIsoDate(yesterday), end: toIsoDate(yesterday) };
  }

  if (range.preset === "This Week" || range.preset === "This week") {
    const start = startOfWeek(current, weekStartsOn);
    return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
  }

  if (range.preset === "Last Week" || range.preset === "Last week") {
    const thisStart = startOfWeek(current, weekStartsOn);
    const start = addDays(thisStart, -7);
    return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
  }

  if (range.preset === "This Month" || range.preset === "This month") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }

  if (range.preset === "This Year" || range.preset === "This year") {
    const start = new Date(current.getFullYear(), 0, 1);
    const end = new Date(current.getFullYear(), 11, 31);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }

  const start = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  const end = new Date(current.getFullYear(), current.getMonth(), 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function dateRangeDays(range) {
  const days = [];
  let cursor = parseDate(range.start);
  const end = parseDate(range.end);
  while (cursor <= end && days.length < 370) {
    days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

function dateRangeLength(range) {
  return dateRangeDays(range).length || 1;
}

function comparisonDateRange(range, mode) {
  if (mode === "None") return null;
  const length = dateRangeLength(range);
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  if (mode === "Same period last year") {
    return {
      start: toIsoDate(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())),
      end: toIsoDate(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())),
    };
  }
  const previousEnd = addDays(start, -1);
  return { start: toIsoDate(addDays(previousEnd, -(length - 1))), end: toIsoDate(previousEnd) };
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
  const [stocktakes, setStocktakesState] = useState(() => normalizeStocktakes(safeReadLocalStorageArray("marginflow.stocktakes", initialStocktakes)));
  const [wasteItems, setWasteItems] = useState(initialWaste);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [menus, setMenus] = useState(initialMenus);
  const [companySettings, setCompanySettingsState] = useState(() => safeReadLocalStorage("marginflow.companySettings", defaultCompanySettings));
  const [financialSettings, setFinancialSettingsState] = useState(() => ({ ...defaultFinancialSettings, ...safeReadLocalStorage("marginflow.financialSettings", defaultFinancialSettings) }));
  const [menuSettings, setMenuSettingsState] = useState(() => safeReadLocalStorage("marginflow.menuSettings", defaultMenuSettings));
  const [invoiceSettings, setInvoiceSettingsState] = useState(() => safeReadLocalStorage("marginflow.invoiceSettings", defaultInvoiceSettings));
  const [aiSettings, setAiSettingsState] = useState(() => safeReadLocalStorage("marginflow.aiSettings", defaultAiSettings));
  const [dateRangeState, setDateRangeState] = useState({ preset: "This Month", startDate: "2026-06-01", endDate: today() });
  const [draft, setDraft] = useState(() => emptyInvoiceDraft());
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
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
  const metrics = useMemo(() => calculateMetrics(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings), [invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings]);
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

  const requestDelete = ({ title = "Delete item", message = "Are you sure you want to delete this item?", onConfirm }) => {
    setDeleteConfirmation({ title, message, onConfirm });
  };

  const confirmDelete = () => {
    deleteConfirmation?.onConfirm?.();
    setDeleteConfirmation(null);
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

        {active === "dashboard" && (
          <Dashboard
            dateRange={dateRange}
            dateRangeState={dateRangeState}
            department={department}
            departmentNames={departmentNames}
            departmentSettings={departmentSettings}
            financialSettings={financialSettings}
            gpTarget={gpTarget}
            invoices={invoices}
            metrics={metrics}
            sales={sales}
            setDateRangeState={setDateRangeState}
            stocktakes={stocktakes}
            suppliers={suppliers}
            supplierSpend={supplierSpend}
            wasteItems={wasteItems}
          />
        )}
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
            setProducts={setProducts}
            departmentNames={departmentNames}
            approveInvoice={approveInvoice}
            requestDelete={requestDelete}
            setInvoices={setInvoices}
          />
        )}
        {active === "products" && <Products departmentNames={departmentNames} products={products} requestDelete={requestDelete} setProducts={setProducts} suppliers={suppliers} />}
        {active === "suppliers" && <Suppliers requestDelete={requestDelete} suppliers={suppliers} setSuppliers={setSuppliers} supplierSpend={supplierSpend} />}
        {active === "stocktake" && (
          <Stocktake
            department={department}
            departmentNames={departmentNames}
            products={products}
            requestDelete={requestDelete}
            setProducts={setProducts}
            setStocktakes={setStocktakes}
            stocktakes={stocktakes}
          />
        )}
        {active === "recipes" && <Recipes departmentNames={departmentNames} products={products} recipes={recipes} requestDelete={requestDelete} setProducts={setProducts} setRecipes={setRecipes} suppliers={suppliers} />}
        {active === "menu" && <MenuCosting financialSettings={financialSettings} menuSettings={menuSettings} menus={menus} products={products} recipes={recipes} requestDelete={requestDelete} setMenus={setMenus} />}
        {active === "waste" && <Waste department={department} departmentNames={departmentNames} products={products} requestDelete={requestDelete} setWasteItems={setWasteItems} wasteItems={wasteItems} />}
        {active === "gp" && (
          <GpAnalysis
            dateRange={dateRange}
            dateRangeState={dateRangeState}
            department={department}
            departmentNames={departmentNames}
            departmentSettings={departmentSettings}
            financialSettings={financialSettings}
            gpTarget={gpTarget}
            invoices={invoices}
            metrics={metrics}
            requestDelete={requestDelete}
            sales={sales}
            setDateRangeState={setDateRangeState}
            setSales={setSales}
            stocktakes={stocktakes}
            suppliers={suppliers}
            supplierSpend={supplierSpend}
            wasteItems={wasteItems}
          />
        )}
        {active === "ai" && <AiInsights metrics={metrics} products={products} supplierSpend={supplierSpend} />}
        {active === "settings" && (
          <SettingsPanel
            aiSettings={aiSettings}
            companySettings={companySettings}
            departmentSettings={departmentSettings}
            financialSettings={financialSettings}
            invoiceSettings={invoiceSettings}
            menuSettings={menuSettings}
            requestDelete={requestDelete}
            setAiSettings={setAiSettings}
            setCompanySettings={setCompanySettings}
            setDepartmentSettings={setDepartmentSettings}
            setFinancialSettings={setFinancialSettings}
            setInvoiceSettings={setInvoiceSettings}
            setMenuSettings={setMenuSettings}
          />
        )}
        {deleteConfirmation && (
          <DeleteConfirmationModal
            message={deleteConfirmation.message}
            onCancel={() => setDeleteConfirmation(null)}
            onDelete={confirmDelete}
            title={deleteConfirmation.title}
          />
        )}
      </main>
    </div>
  );
}

function targetForRow(departmentSettings, department, fallback) {
  return targetForDepartment(departmentSettings, department, fallback);
}

function displayDepartmentName(name) {
  return name === "Non-food" ? "Non-food / Excluded" : name;
}

function enrichPerformanceRows(metrics, departmentSettings, gpTarget) {
  return {
    dailyRows: metrics.dailyRows.map((row) => ({ ...row, targetGp: gpTarget })),
    departmentRows: metrics.departmentRows.map((row) => {
      const targetGp = targetForRow(departmentSettings, row.department, gpTarget);
      return { ...row, targetGp, variance: row.gp - targetGp };
    }),
  };
}

function changePercent(current, previous) {
  if (!numberValue(previous)) return numberValue(current) ? 100 : 0;
  return ((numberValue(current) - numberValue(previous)) / Math.abs(numberValue(previous))) * 100;
}

function totalSalesRows(rows, range) {
  const filteredRows = normalizeSalesRows(rows.filter((row) => dateInRange(row.date, range)));
  const totals = filteredRows.reduce((sum, row) => ({
    grossSales: sum.grossSales + numberValue(row.grossSales),
    netSales: sum.netSales + netSalesForRow(row),
    vat: sum.vat + vatAmountFromGrossNet(row.grossSales, row.sales),
    discounts: sum.discounts + numberValue(row.discounts),
    refunds: sum.refunds + numberValue(row.refunds),
    serviceCharge: sum.serviceCharge + numberValue(row.serviceCharge),
  }), { grossSales: 0, netSales: 0, vat: 0, discounts: 0, refunds: 0, serviceCharge: 0 });
  return {
    ...totals,
    rows: filteredRows,
    averageDailySales: totals.netSales / dateRangeLength(range),
  };
}

function salesComparisonRanges(mode, currentCustom, previousCustom, weekStartsOn) {
  if (mode === "Today vs Yesterday") {
    return {
      current: resolveDateRange({ preset: "Today" }, weekStartsOn),
      previous: resolveDateRange({ preset: "Yesterday" }, weekStartsOn),
    };
  }
  if (mode === "Today vs Last Week") {
    const current = resolveDateRange({ preset: "Today" }, weekStartsOn);
    const previousDate = toIsoDate(addDays(parseDate(current.start), -7));
    return { current, previous: { start: previousDate, end: previousDate } };
  }
  if (mode === "This Week vs Last Week") {
    return {
      current: resolveDateRange({ preset: "This Week" }, weekStartsOn),
      previous: resolveDateRange({ preset: "Last Week" }, weekStartsOn),
    };
  }
  if (mode === "This Month vs Last Month") {
    return {
      current: resolveDateRange({ preset: "This Month" }, weekStartsOn),
      previous: resolveDateRange({ preset: "Last Month" }, weekStartsOn),
    };
  }
  return { current: currentCustom, previous: previousCustom };
}

function PerformanceSummaryCards({ metrics, dateRangeState, dateRange, department, gpTarget, gpCalculationBase }) {
  return (
    <div className="metric-grid performance-grid">
      <Metric label="Gross Sales" value={money(metrics.grossSales)} delta={rangeLabel(dateRangeState, dateRange)} />
      <Metric label="Net Sales" value={money(metrics.netSales)} delta={gpCalculationBase === "Net Sales" ? "Used for GP" : "Reference only"} />
      <Metric label="Purchases" value={money(metrics.purchases)} delta={department} />
      <Metric label="Invoice GP %" value={percent(metrics.invoiceGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.invoiceGp >= gpTarget ? "good" : "warn"} />
      <Metric label="Stocktake GP %" value={percent(metrics.stocktakeGp)} delta="Opening + purchases - closing" tone={metrics.stocktakeGp >= gpTarget ? "good" : "warn"} />
      <Metric label="Waste Cost" value={money(metrics.waste)} delta={`${percent(metrics.wastePercent)} of GP base`} tone="warn" />
      <Metric label="Real GP incl. waste" value={percent(metrics.realGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.realGp >= gpTarget ? "good" : "warn"} />
    </div>
  );
}

function ComparisonCards({ comparisonMode, setComparisonMode, comparisonMetrics, metrics }) {
  return (
    <Panel title="Comparison" action={comparisonMode}>
      <div className="form-grid six compact-form">
        <label>Compare with<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value)}><option>Previous period</option><option>Same period last year</option><option>None</option></select></label>
      </div>
      {comparisonMode === "None" || !comparisonMetrics ? (
        <EmptyState />
      ) : (
        <div className="metric-grid compact">
          <Metric label="Net Sales change" value={percent(changePercent(metrics.sales, comparisonMetrics.sales))} delta={`${money(comparisonMetrics.sales)} comparison`} tone={metrics.sales >= comparisonMetrics.sales ? "good" : "warn"} />
          <Metric label="Purchases change" value={percent(changePercent(metrics.purchases, comparisonMetrics.purchases))} delta={`${money(comparisonMetrics.purchases)} comparison`} tone={metrics.purchases <= comparisonMetrics.purchases ? "good" : "warn"} />
          <Metric label="GP change" value={percent(metrics.invoiceGp - comparisonMetrics.invoiceGp)} delta={`${percent(comparisonMetrics.invoiceGp)} comparison`} tone={metrics.invoiceGp >= comparisonMetrics.invoiceGp ? "good" : "warn"} />
          <Metric label="Waste change" value={percent(changePercent(metrics.waste, comparisonMetrics.waste))} delta={`${money(comparisonMetrics.waste)} comparison`} tone={metrics.waste <= comparisonMetrics.waste ? "good" : "warn"} />
        </div>
      )}
    </Panel>
  );
}

function PerformanceCharts({ departmentRows, dailyRows, gpTarget, metrics, supplierSpend }) {
  const hasData = Boolean(metrics.sales || metrics.purchases || metrics.waste || supplierSpend.some((row) => row.spend));
  const sortedSuppliers = [...supplierSpend].sort((a, b) => b.spend - a.spend);
  const totalSupplierSpend = sortedSuppliers.reduce((sum, row) => sum + numberValue(row.spend), 0);

  if (!hasData) return <EmptyState />;

  return (
    <>
      <div className="dashboard-layout">
        <Panel title="Daily GP Chart" action="Actual vs target">
          <DailyGpChart rows={dailyRows} targetGp={gpTarget} />
        </Panel>
        <Panel title="Sales vs Purchases Chart" action="Net sales and purchases by day">
          <SalesPurchasesChart rows={dailyRows} />
        </Panel>
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="Department Breakdown" action="Gross, net, cost and GP">
          <DepartmentBreakdown rows={departmentRows} />
        </Panel>
        <Panel title="Supplier Spend" action="High to low">
          <SupplierSpendChart rows={sortedSuppliers} total={totalSupplierSpend} />
        </Panel>
      </div>
      <Panel title="Daily GP Table">
        <DailyGpTable rows={dailyRows} />
      </Panel>
    </>
  );
}

function PerformanceSections({ dateRange, dateRangeState, department, departmentNames, departmentSettings, gpTarget, invoices, metrics, sales, setDateRangeState, stocktakes, suppliers, supplierSpend, wasteItems, showSalesManager = false, financialSettings, requestDelete, setSales }) {
  const [comparisonMode, setComparisonMode] = useState("Previous period");
  const { dailyRows, departmentRows } = enrichPerformanceRows(metrics, departmentSettings, gpTarget);
  const compareRange = comparisonDateRange(dateRange, comparisonMode);
  const comparisonMetrics = compareRange ? calculateMetrics(invoices, sales, department, stocktakes, wasteItems, compareRange, departmentNames, financialSettings) : null;

  return (
    <>
      <Panel title={showSalesManager ? "GP date range" : "Dashboard date range"} action={rangeLabel(dateRangeState, dateRange)}>
        <DateRangeControls dateRangeState={dateRangeState} setDateRangeState={setDateRangeState} />
      </Panel>
      <PerformanceSummaryCards metrics={metrics} dateRangeState={dateRangeState} dateRange={dateRange} department={department} gpTarget={gpTarget} gpCalculationBase={financialSettings.gpCalculationBase || "Net Sales"} />
      <PerformanceCharts departmentRows={departmentRows} dailyRows={dailyRows} gpTarget={gpTarget} metrics={metrics} supplierSpend={supplierSpend} suppliers={suppliers} />
      <ComparisonCards comparisonMode={comparisonMode} setComparisonMode={setComparisonMode} comparisonMetrics={comparisonMetrics} metrics={metrics} />
      {showSalesManager && <SalesManager financialSettings={financialSettings} departmentNames={departmentNames} requestDelete={requestDelete} sales={sales} setSales={setSales} />}
    </>
  );
}

function Dashboard({ dateRange, dateRangeState, department, departmentNames, departmentSettings, financialSettings, gpTarget, invoices, metrics, sales, setDateRangeState, stocktakes, suppliers, supplierSpend, wasteItems }) {
  const recentInvoices = [...metrics.invoices].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PerformanceSections dateRange={dateRange} dateRangeState={dateRangeState} department={department} departmentNames={departmentNames} departmentSettings={departmentSettings} financialSettings={financialSettings} gpTarget={gpTarget} invoices={invoices} metrics={metrics} sales={sales} setDateRangeState={setDateRangeState} stocktakes={stocktakes} suppliers={suppliers} supplierSpend={supplierSpend} wasteItems={wasteItems} />
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
      {(dateRangeState.preset === "Specific Date" || dateRangeState.preset === "Specific date") && (
        <Field label="Date" type="date" value={dateRangeState.specificDate || dateRangeState.startDate || today()} onChange={(value) => setDateRangeState({ ...dateRangeState, specificDate: value, startDate: value, endDate: value })} />
      )}
      {(dateRangeState.preset === "Custom Range" || dateRangeState.preset === "Custom range") && (
        <>
          <Field label="Start date" type="date" value={dateRangeState.startDate} onChange={(value) => setDateRangeState({ ...dateRangeState, startDate: value })} />
          <Field label="End date" type="date" value={dateRangeState.endDate} onChange={(value) => setDateRangeState({ ...dateRangeState, endDate: value })} />
        </>
      )}
    </div>
  );
}

function Invoices({ aiSettings, departmentNames, draft, setDraft, invoiceSettings, invoices, suppliers, setSuppliers, products, setProducts, approveInvoice, requestDelete, setInvoices }) {
  const [dragging, setDragging] = useState(false);
  const [splitEditorId, setSplitEditorId] = useState(null);
  const [manualInvoiceOpen, setManualInvoiceOpen] = useState(false);
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
    const hasImageUpload = uploaded.some(isImageInvoiceFile);
    const uploadStatus = hasImageUpload
      ? `${uploaded.length} file(s) uploaded. Image invoices will be read directly by AI.`
      : `${uploaded.length} file(s) uploaded`;
    setDraft((current) => ({ ...current, files: [...current.files, ...uploaded], status: uploadStatus }));
    const uploadedText = await textFromInvoiceFiles(uploaded);
    if (uploadRunRef.current !== uploadRun) return;
    if (uploadedText) {
      setDraft((current) => ({
        ...current,
        invoiceText: [current.invoiceText, uploadedText].filter(Boolean).join("\n\n"),
        status: uploadStatus,
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

    readControllerRef.current?.abort();
    const controller = new AbortController();
    readControllerRef.current = controller;
    setDraft((current) => ({ ...current, invoiceText, status: "Reading invoice with AI..." }));

    let invoiceImages = [];
    try {
      invoiceImages = await invoiceImagesFromFiles(draft.files);
    } catch (error) {
      if (readControllerRef.current === controller) readControllerRef.current = null;
      setDraft((current) => ({ ...current, status: `AI failed. ${error.message}` }));
      return;
    }

    if (readControllerRef.current !== controller) return;

    if (!invoiceText && !invoiceImages.length) {
      readControllerRef.current = null;
      setDraft((current) => ({ ...current, status: "AI failed. Paste invoice text or upload a PDF/image invoice first." }));
      return;
    }

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
          invoiceImages,
          suppliers,
          products: products.map((product) => ({
            name: product.name || product.productName,
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

  const saveManualInvoice = (manualDraft) => {
    const supplier = manualDraft.supplier || suppliers[0]?.name || "Unknown Supplier";
    const items = manualDraft.items.map((item) => enrichInvoiceLine({
      ...item,
      id: item.id || uid(),
      supplier,
      quantity: numberValue(item.quantity, 1),
      unitCost: numberValue(item.unitCost),
      lineTotal: numberValue(item.lineTotal, numberValue(item.quantity, 1) * numberValue(item.unitCost)),
      department: item.department || invoiceSettings.defaultInvoiceDepartment,
      departmentSplits: normalizeDepartmentSplits(item, item.department || invoiceSettings.defaultInvoiceDepartment),
      matchStatus: "Manual invoice",
      matchConfidence: 0,
    }, products, aiSettings));

    const invalidSplit = items.find((item) => !splitIsValid(item));
    if (invalidSplit) {
      setDraft((current) => ({ ...current, status: `Department split must total 100% for ${invalidSplit.productName}.` }));
      return;
    }

    const normalizedItems = items.map((item) => {
      const departmentSplits = normalizeDepartmentSplits(item, item.department || invoiceSettings.defaultInvoiceDepartment);
      return {
        ...item,
        supplier,
        unitCost: normalizeInvoiceUnitCost(item),
        department: departmentSplits[0]?.department || item.department,
        departmentSplits,
      };
    });
    const invoice = {
      id: uid(),
      invoiceNumber: manualDraft.invoiceNumber || `MF-${String(invoices.length + 1).padStart(4, "0")}`,
      supplier,
      date: manualDraft.date || today(),
      status: "Approved",
      items: normalizedItems,
    };
    setInvoices((current) => [invoice, ...current]);
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(current, normalizedItems, invoice.date));
    setDraft(emptyInvoiceDraft());
    setManualInvoiceOpen(false);
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
    requestDelete({
      title: "Delete invoice",
      message: "Are you sure you want to delete this invoice?",
      onConfirm: () => setInvoices((current) => current.filter((item) => item.id !== id)),
    });
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
        {hasDraftWork && (
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
        )}
        {showCreateSupplier && (
          <div className="button-row left tight">
            <button className="ghost" onClick={createSupplier} type="button"><Plus size={16} />Create supplier</button>
          </div>
        )}
        {hasDraftWork && (
          <label className="invoice-text">
            Pasted or OCR invoice text <span>(optional for image invoices)</span>
            <textarea
              placeholder="Paste invoice text here, or leave blank when uploading a JPG/PNG/WEBP image."
              rows={7}
              value={draft.invoiceText}
              onChange={(event) => setDraft({ ...draft, invoiceText: event.target.value })}
            />
          </label>
        )}
        <div className="file-list">
          {draft.files.map((file, index) => (
            <span key={`${file.name}-${index}`}>{file.name}<button onClick={() => requestDelete({ title: "Delete uploaded file", message: "Are you sure you want to delete this uploaded file?", onConfirm: () => setDraft((current) => ({ ...current, files: current.files.filter((_, itemIndex) => itemIndex !== index) })) })} type="button"><X size={14} /></button></span>
          ))}
        </div>
        {draft.status !== "Idle" && <div className={`invoice-status ${statusTone}`}>{draft.status}</div>}
        <div className="button-row left">
          <button disabled={isReading} onClick={readInvoice} type="button"><Sparkles size={16} />Read Invoice</button>
          <button className="ghost" onClick={() => setManualInvoiceOpen(true)} type="button"><Plus size={16} />Add Manual Invoice</button>
          <button className="ghost danger" disabled={!hasDraftWork} onClick={cancelDraft} type="button"><X size={16} />Cancel Upload</button>
          <button disabled={!draft.items.length || isReading} onClick={approveInvoice} type="button"><Save size={16} />{draft.editingInvoiceId ? "Save Invoice" : "Confirm Invoice"}</button>
        </div>
      </Panel>

      {manualInvoiceOpen && (
        <ManualInvoiceModal
          departmentNames={departmentNames}
          invoiceSettings={invoiceSettings}
          onCancel={() => setManualInvoiceOpen(false)}
          onSave={saveManualInvoice}
          products={products}
          suppliers={suppliers}
        />
      )}

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
                  <td><button className="icon danger" onClick={() => requestDelete({ title: "Delete invoice line", message: "Are you sure you want to delete this invoice line?", onConfirm: () => setDraft((current) => ({ ...current, items: current.items.filter((line) => line.id !== item.id) })) })} type="button"><Trash2 size={15} /></button></td>
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
                  <button className="icon danger" onClick={() => requestDelete({ title: "Delete department split", message: "Are you sure you want to delete this department split?", onConfirm: () => removeDraftItemSplit(splitEditorItem.id, split.id) })} type="button"><Trash2 size={14} /></button>
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

function manualInvoiceLine(defaultDepartment, product = {}) {
  const department = product.department || defaultDepartment;
  const quantity = numberValue(product.quantity, 1) || 1;
  const unitCost = numberValue(product.unitCost);
  return {
    id: uid(),
    productName: product.name || "",
    packSize: product.packSize || "",
    quantity,
    unitCost,
    department,
    departmentSplits: defaultDepartmentSplits(department),
    lineTotal: quantity * unitCost,
    supplier: product.supplier || "",
  };
}

function ManualInvoiceModal({ departmentNames, invoiceSettings, onCancel, onSave, products, suppliers }) {
  const defaultDepartment = invoiceSettings.defaultInvoiceDepartment || departmentNames[0] || "Kitchen Made";
  const defaultSupplier = suppliers[0]?.name || "";
  const [mode, setMode] = useState("Simple Mode");
  const [status, setStatus] = useState("");
  const [simple, setSimple] = useState({
    supplier: defaultSupplier,
    department: defaultDepartment,
    invoiceNumber: "",
    date: today(),
    totalPrice: "",
  });
  const [complete, setComplete] = useState({
    supplier: defaultSupplier,
    invoiceNumber: "",
    date: today(),
    rows: [manualInvoiceLine(defaultDepartment), manualInvoiceLine(defaultDepartment)],
  });

  const updateCompleteHeader = (field, value) => setComplete((current) => ({ ...current, [field]: value }));
  const updateRow = (id, field, value) => {
    setComplete((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.id !== id) return row;
        let next = { ...row, [field]: ["quantity", "unitCost", "lineTotal", "splitPercentage"].includes(field) ? numberValue(value) : value };
        if (field === "productName") {
          const product = products.find((candidate) => candidate.name.toLowerCase() === String(value).trim().toLowerCase());
          if (product) {
            next = {
              ...next,
              productName: product.name,
              packSize: product.packSize || next.packSize,
              unitCost: numberValue(product.unitCost),
              supplier: product.supplier || next.supplier,
              department: product.department || next.department,
              departmentSplits: defaultDepartmentSplits(product.department || next.department),
            };
          }
        }
        if (field === "department") next.departmentSplits = defaultDepartmentSplits(value);
        if (field === "quantity" || field === "unitCost" || field === "productName" || field === "department") {
          next.lineTotal = numberValue(next.quantity, 1) * numberValue(next.unitCost);
        }
        if (field === "lineTotal") {
          next.unitCost = numberValue(next.quantity, 1) ? Number((numberValue(value) / numberValue(next.quantity, 1)).toFixed(4)) : next.unitCost;
        }
        if (field === "splitPercentage") {
          next.departmentSplits = [{ ...(normalizeDepartmentSplits(next, next.department)[0] || { id: uid(), department: next.department }), percentage: numberValue(value) }];
        }
        return next;
      }),
    }));
  };

  const addRow = () => setComplete((current) => ({ ...current, rows: [...current.rows, manualInvoiceLine(defaultDepartment)] }));
  const removeRow = (id) => setComplete((current) => ({ ...current, rows: current.rows.length > 1 ? current.rows.filter((row) => row.id !== id) : current.rows }));

  const save = () => {
    if (mode === "Simple Mode") {
      if (!simple.supplier.trim() || !simple.date || !numberValue(simple.totalPrice)) {
        setStatus("Supplier, date and total price are required.");
        return;
      }
      const total = numberValue(simple.totalPrice);
      onSave({
        supplier: simple.supplier,
        invoiceNumber: simple.invoiceNumber,
        date: simple.date,
        items: [{
          id: uid(),
          productName: "Manual invoice total",
          packSize: "Summary",
          quantity: 1,
          unitCost: total,
          lineTotal: total,
          department: simple.department,
          departmentSplits: defaultDepartmentSplits(simple.department),
          supplier: simple.supplier,
        }],
      });
      return;
    }

    const rows = complete.rows.filter((row) => row.productName.trim() || numberValue(row.lineTotal));
    const invalid = rows.find((row) => !row.productName.trim() || !numberValue(row.quantity) || !numberValue(row.unitCost) || !splitIsValid(row));
    if (!complete.supplier.trim() || !complete.date || !rows.length || invalid) {
      setStatus("Complete every row with product, quantity, unit cost and a 100% department split.");
      return;
    }
    onSave({
      supplier: complete.supplier,
      invoiceNumber: complete.invoiceNumber,
      date: complete.date,
      items: rows.map((row) => ({ ...row, supplier: complete.supplier, lineTotal: numberValue(row.lineTotal, numberValue(row.quantity) * numberValue(row.unitCost)) })),
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="split-modal wide manual-invoice-modal" role="dialog" aria-modal="true" aria-label="Add manual invoice">
        <div className="modal-header">
          <div>
            <h3>Add Manual Invoice</h3>
            <p>{mode}</p>
          </div>
          <button className="icon" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        <div className="segmented-control">
          {["Simple Mode", "Complete Mode"].map((option) => (
            <button className={mode === option ? "active" : ""} key={option} onClick={() => setMode(option)} type="button">{option}</button>
          ))}
        </div>
        {mode === "Simple Mode" ? (
          <div className="form-grid five">
            <label>Supplier<input list="manual-supplier-list" value={simple.supplier} onChange={(event) => setSimple({ ...simple, supplier: event.target.value })} /></label>
            <label>Department<select value={simple.department} onChange={(event) => setSimple({ ...simple, department: event.target.value })}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></label>
            <Field label="Invoice number" value={simple.invoiceNumber} onChange={(value) => setSimple({ ...simple, invoiceNumber: value })} />
            <Field label="Date" type="date" value={simple.date} onChange={(value) => setSimple({ ...simple, date: value })} />
            <Field label="Total price" type="number" value={simple.totalPrice} onChange={(value) => setSimple({ ...simple, totalPrice: value })} />
          </div>
        ) : (
          <>
            <div className="form-grid three compact-form">
              <label>Supplier<input list="manual-supplier-list" value={complete.supplier} onChange={(event) => updateCompleteHeader("supplier", event.target.value)} /></label>
              <Field label="Invoice number" value={complete.invoiceNumber} onChange={(value) => updateCompleteHeader("invoiceNumber", value)} />
              <Field label="Date" type="date" value={complete.date} onChange={(value) => updateCompleteHeader("date", value)} />
            </div>
            <div className="table-wrap manual-invoice-table">
              <table>
                <thead>
                  <tr>{["Product", "Pack size", "Quantity", "Unit cost", "Department", "Department split", "Line total", ""].map((header) => <th key={header}>{header}</th>)}</tr>
                </thead>
                <tbody>
                  {complete.rows.map((row) => (
                    <tr key={row.id}>
                      <td><input list="manual-product-list" value={row.productName} onChange={(event) => updateRow(row.id, "productName", event.target.value)} /></td>
                      <td><input value={row.packSize} onChange={(event) => updateRow(row.id, "packSize", event.target.value)} /></td>
                      <td><input min="0" step="0.01" type="number" value={row.quantity} onChange={(event) => updateRow(row.id, "quantity", event.target.value)} /></td>
                      <td><input min="0" step="0.01" type="number" value={row.unitCost} onChange={(event) => updateRow(row.id, "unitCost", event.target.value)} /></td>
                      <td><select value={row.department} onChange={(event) => updateRow(row.id, "department", event.target.value)}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></td>
                      <td><input min="0" max="100" step="1" type="number" value={departmentSplitTotal(row)} onChange={(event) => updateRow(row.id, "splitPercentage", event.target.value)} /></td>
                      <td><input min="0" step="0.01" type="number" value={numberValue(row.lineTotal, numberValue(row.quantity) * numberValue(row.unitCost))} onChange={(event) => updateRow(row.id, "lineTotal", event.target.value)} /></td>
                      <td><button className="icon danger" onClick={() => removeRow(row.id)} type="button"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row left tight">
              <button className="ghost" onClick={addRow} type="button"><Plus size={16} />Add row</button>
            </div>
          </>
        )}
        <datalist id="manual-supplier-list">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.name} />)}</datalist>
        <datalist id="manual-product-list">{products.map((product) => <option key={product.id} value={product.name} />)}</datalist>
        {status && <div className="invoice-status error">{status}</div>}
        <div className="button-row left">
          <button className="ghost" onClick={onCancel} type="button">Cancel</button>
          <button onClick={save} type="button"><Save size={16} />Save Invoice</button>
        </div>
      </div>
    </div>
  );
}

function Products({ departmentNames, products, requestDelete, setProducts, suppliers }) {
  const empty = { name: "", supplier: suppliers[0]?.name || "", packSize: "", quantity: 1, unitCost: 0, department: departmentNames[0] || "Kitchen Made", aliases: "" };
  const emptyBulkRow = () => ({ ...empty, id: uid() });
  const [form, setForm] = useState(empty);
  const [bulkRows, setBulkRows] = useState([emptyBulkRow(), emptyBulkRow()]);
  const [pendingImport, setPendingImport] = useState([]);
  const [status, setStatus] = useState("");
  const [importFileKey, setImportFileKey] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const rows = useMemo(() => buildProductRows(products), [products]);

  const productPayload = (row) => {
    const aliases = String(row.aliases || "").split(",").map((alias) => alias.trim()).filter(Boolean);
    const unitCost = numberValue(row.unitCost);
    const supplier = row.supplier || suppliers[0]?.name || "";
    return {
      ...row,
      supplier,
      aliases,
      unitCost,
      quantity: numberValue(row.quantity, 1),
      supplierPrices: [{ supplier, price: unitCost, date: today() }],
      priceHistory: [{ date: today(), supplier, price: unitCost }],
    };
  };

  const saveProduct = () => {
    if (!form.name.trim()) return;
    const payload = productPayload(form);
    setProducts((current) => current.map((product) => (product.id === editingId ? { ...product, ...payload, id: editingId, priceHistory: [...(product.priceHistory || []), { date: today(), supplier: payload.supplier, price: payload.unitCost }] } : product)));
    setForm(empty);
    setEditingId("");
    setModalOpen(false);
  };

  const saveBulkProducts = () => {
    const validRows = bulkRows.filter((row) => row.name.trim());
    if (!validRows.length) {
      setStatus("Add at least one product name.");
      return;
    }
    setProducts((current) => [...current, ...validRows.map((row) => ({ ...productPayload(row), id: uid() }))]);
    setBulkRows([emptyBulkRow(), emptyBulkRow()]);
    setPendingImport([]);
    setStatus("");
    setImportFileKey((current) => current + 1);
    setModalOpen(false);
  };

  const updateBulkRow = (id, field, value) => {
    setBulkRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: ["quantity", "unitCost"].includes(field) ? value : value } : row)));
  };

  const importProducts = async (file) => {
    if (!file) return;
    const imported = parseProductsCsv(await file.text(), suppliers, departmentNames);
    if (!imported.length) {
      setStatus("CSV import found no product rows.");
      return;
    }
    setPendingImport(imported);
    setStatus(`${imported.length} product row(s) ready for review.`);
  };

  const confirmImport = () => {
    setProducts((current) => [...current, ...pendingImport.map((row) => ({ ...productPayload(row), id: uid() }))]);
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setModalOpen(false);
  };

  const cancelImport = () => {
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setStatus("Product import cancelled.");
  };

  const openProductModal = (row = null) => {
    if (row) {
      setForm({ ...row, aliases: (row.aliases || []).join(", ") });
      setEditingId(row.id);
      setModalOpen(true);
      return;
    }
    setBulkRows([emptyBulkRow(), emptyBulkRow()]);
    setPendingImport([]);
    setStatus("");
    setEditingId("");
    setModalOpen(true);
  };

  return (
    <div className="page-grid">
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
          onDelete={(id) => requestDelete({ title: "Delete product", message: "Are you sure you want to delete this product?", onConfirm: () => setProducts((current) => current.filter((product) => product.id !== id)) })}
          onEdit={openProductModal}
          rows={rows}
          toolbarAction={<button onClick={() => openProductModal()} type="button"><Plus size={16} />Add Product</button>}
        />
      </Panel>
      {modalOpen && !editingId && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal wide bulk-modal" role="dialog" aria-modal="true" aria-label="Add products">
            <div className="modal-header">
              <div><h3>Add products</h3><p>Bulk create products</p></div>
              <button className="icon" onClick={() => setModalOpen(false)} type="button"><X size={16} /></button>
            </div>
            <div className="button-row left tight">
              <label className="file-button secondary">CSV Import<input accept=".csv,text/csv" key={importFileKey} onChange={(event) => importProducts(event.target.files?.[0])} type="file" /></label>
            </div>
            {status && <div className="invoice-status info">{status}</div>}
            {pendingImport.length > 0 && (
              <div className="import-review">
                <div className="panel-head"><h2>Review import</h2><span>{pendingImport.length} row(s)</span></div>
                <DataTable columns={[
                  { key: "name", label: "Product name" },
                  { key: "supplier", label: "Supplier" },
                  { key: "packSize", label: "Pack size" },
                  { key: "quantity", label: "Quantity" },
                  { key: "unitCost", label: "Unit cost", render: money },
                  { key: "department", label: "Department" },
                  { key: "aliases", label: "Aliases" },
                ]} rows={pendingImport} />
                <div className="button-row left">
                  <button onClick={confirmImport} type="button"><Save size={16} />Confirm Import</button>
                  <button className="ghost danger" onClick={cancelImport} type="button"><X size={16} />Cancel Import</button>
                </div>
              </div>
            )}
            <BulkProductsTable rows={bulkRows} setRows={setBulkRows} suppliers={suppliers} departmentNames={departmentNames} updateRow={updateBulkRow} />
            <div className="button-row left">
              <button className="ghost" onClick={() => setBulkRows((current) => [...current, emptyBulkRow()])} type="button"><Plus size={16} />Add Row</button>
              <button className="ghost" onClick={() => setModalOpen(false)} type="button">Cancel</button>
              <button onClick={saveBulkProducts} type="button"><Save size={16} />Save Products</button>
            </div>
          </div>
        </div>
      )}
      {modalOpen && editingId && (
        <EditModal title="Edit product" onCancel={() => setModalOpen(false)} onSave={saveProduct} saveLabel="Save Product">
          <div className="form-grid six">
            <Field label="Product name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <label>Supplier<select value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></label>
            <Field label="Pack size" value={form.packSize} onChange={(value) => setForm({ ...form, packSize: value })} />
            <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
            <Field label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
            <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
            <Field label="Aliases" value={form.aliases} onChange={(value) => setForm({ ...form, aliases: value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

function BulkProductsTable({ departmentNames, rows, setRows, suppliers, updateRow }) {
  return (
    <div className="table-wrap bulk-entry-table">
      <table>
        <thead><tr>{["Product name", "Supplier", "Pack size", "Quantity", "Unit cost", "Department", "Aliases", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><input value={row.name} onChange={(event) => updateRow(row.id, "name", event.target.value)} /></td>
              <td><select value={row.supplier} onChange={(event) => updateRow(row.id, "supplier", event.target.value)}>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></td>
              <td><input value={row.packSize} onChange={(event) => updateRow(row.id, "packSize", event.target.value)} /></td>
              <td><input min="0" step="0.01" type="number" value={row.quantity} onChange={(event) => updateRow(row.id, "quantity", event.target.value)} /></td>
              <td><input min="0" step="0.01" type="number" value={row.unitCost} onChange={(event) => updateRow(row.id, "unitCost", event.target.value)} /></td>
              <td><select value={row.department} onChange={(event) => updateRow(row.id, "department", event.target.value)}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></td>
              <td><input value={row.aliases} onChange={(event) => updateRow(row.id, "aliases", event.target.value)} /></td>
              <td><button className="icon danger" onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : current)} type="button"><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Suppliers({ requestDelete, suppliers, setSuppliers, supplierSpend }) {
  const empty = { name: "", category: "", contact: "", email: "", phone: "", active: true };
  const emptyBulkRow = () => ({ ...empty, id: uid() });
  const [form, setForm] = useState(empty);
  const [bulkRows, setBulkRows] = useState([emptyBulkRow(), emptyBulkRow()]);
  const [pendingImport, setPendingImport] = useState([]);
  const [status, setStatus] = useState("");
  const [importFileKey, setImportFileKey] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const saveSupplier = () => {
    if (!form.name.trim()) return;
    setSuppliers((current) => current.map((supplier) => (supplier.id === editingId ? { ...supplier, ...form } : supplier)));
    setForm(empty);
    setEditingId("");
    setModalOpen(false);
  };

  const saveBulkSuppliers = () => {
    const validRows = bulkRows.filter((row) => row.name.trim());
    if (!validRows.length) {
      setStatus("Add at least one supplier name.");
      return;
    }
    setSuppliers((current) => [...current, ...validRows.map((row) => ({ ...row, id: uid() }))]);
    setBulkRows([emptyBulkRow(), emptyBulkRow()]);
    setPendingImport([]);
    setStatus("");
    setImportFileKey((current) => current + 1);
    setModalOpen(false);
  };

  const updateBulkRow = (id, field, value) => {
    setBulkRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: field === "active" ? value === "Active" : value } : row)));
  };

  const importSuppliers = async (file) => {
    if (!file) return;
    const imported = parseSuppliersCsv(await file.text());
    if (!imported.length) {
      setStatus("CSV import found no supplier rows.");
      return;
    }
    setPendingImport(imported);
    setStatus(`${imported.length} supplier row(s) ready for review.`);
  };

  const confirmImport = () => {
    setSuppliers((current) => [...current, ...pendingImport.map((row) => ({ ...row, id: uid() }))]);
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setModalOpen(false);
  };

  const cancelImport = () => {
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setStatus("Supplier import cancelled.");
  };

  const openSupplierModal = (row = null) => {
    if (row) {
      setForm(row);
      setEditingId(row.id);
      setModalOpen(true);
      return;
    }
    setBulkRows([emptyBulkRow(), emptyBulkRow()]);
    setPendingImport([]);
    setStatus("");
    setEditingId("");
    setModalOpen(true);
  };

  return (
    <div className="page-grid">
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
          onDelete={(id) => requestDelete({ title: "Delete supplier", message: "Are you sure you want to delete this supplier?", onConfirm: () => setSuppliers((current) => current.filter((supplier) => supplier.id !== id)) })}
          onEdit={openSupplierModal}
          rows={supplierSpend}
          toolbarAction={<button onClick={() => openSupplierModal()} type="button"><Plus size={16} />Add Supplier</button>}
        />
      </Panel>
      {modalOpen && !editingId && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal wide bulk-modal" role="dialog" aria-modal="true" aria-label="Add suppliers">
            <div className="modal-header">
              <div><h3>Add suppliers</h3><p>Bulk create suppliers</p></div>
              <button className="icon" onClick={() => setModalOpen(false)} type="button"><X size={16} /></button>
            </div>
            <div className="button-row left tight">
              <label className="file-button secondary">CSV Import<input accept=".csv,text/csv" key={importFileKey} onChange={(event) => importSuppliers(event.target.files?.[0])} type="file" /></label>
            </div>
            {status && <div className="invoice-status info">{status}</div>}
            {pendingImport.length > 0 && (
              <div className="import-review">
                <div className="panel-head"><h2>Review import</h2><span>{pendingImport.length} row(s)</span></div>
                <DataTable columns={[
                  { key: "name", label: "Supplier" },
                  { key: "category", label: "Category" },
                  { key: "contact", label: "Contact" },
                  { key: "email", label: "Email" },
                  { key: "phone", label: "Phone" },
                  { key: "active", label: "Status", render: (value) => value ? "Active" : "Inactive" },
                ]} rows={pendingImport} />
                <div className="button-row left">
                  <button onClick={confirmImport} type="button"><Save size={16} />Confirm Import</button>
                  <button className="ghost danger" onClick={cancelImport} type="button"><X size={16} />Cancel Import</button>
                </div>
              </div>
            )}
            <BulkSuppliersTable rows={bulkRows} setRows={setBulkRows} updateRow={updateBulkRow} />
            <div className="button-row left">
              <button className="ghost" onClick={() => setBulkRows((current) => [...current, emptyBulkRow()])} type="button"><Plus size={16} />Add Row</button>
              <button className="ghost" onClick={() => setModalOpen(false)} type="button">Cancel</button>
              <button onClick={saveBulkSuppliers} type="button"><Save size={16} />Save Suppliers</button>
            </div>
          </div>
        </div>
      )}
      {modalOpen && editingId && (
        <EditModal title="Edit supplier" onCancel={() => setModalOpen(false)} onSave={saveSupplier} saveLabel="Save Supplier">
          <div className="form-grid six">
            <Field label="Supplier name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
            <Field label="Contact" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
            <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <label>Status<select value={form.active ? "Active" : "Inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
          </div>
        </EditModal>
      )}
    </div>
  );
}

function BulkSuppliersTable({ rows, setRows, updateRow }) {
  return (
    <div className="table-wrap bulk-entry-table">
      <table>
        <thead><tr>{["Supplier", "Category", "Contact", "Email", "Phone", "Status", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><input value={row.name} onChange={(event) => updateRow(row.id, "name", event.target.value)} /></td>
              <td><input value={row.category} onChange={(event) => updateRow(row.id, "category", event.target.value)} /></td>
              <td><input value={row.contact} onChange={(event) => updateRow(row.id, "contact", event.target.value)} /></td>
              <td><input value={row.email} onChange={(event) => updateRow(row.id, "email", event.target.value)} /></td>
              <td><input value={row.phone} onChange={(event) => updateRow(row.id, "phone", event.target.value)} /></td>
              <td><select value={row.active ? "Active" : "Inactive"} onChange={(event) => updateRow(row.id, "active", event.target.value)}><option>Active</option><option>Inactive</option></select></td>
              <td><button className="icon danger" onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : current)} type="button"><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stocktakeBlankLine(department, product = {}) {
  const quantity = numberValue(product.quantity, 1) || 1;
  const unitCost = numberValue(product.unitCost);
  return {
    id: uid(),
    productName: product.name || "",
    matchedProductId: product.id || "",
    supplier: product.supplier || "",
    packSize: product.packSize || "",
    department: product.department || department,
    quantity,
    unitCost,
    stockValue: quantity * unitCost,
    matchStatus: product.id ? "Matched" : "Manual entry",
  };
}

function Stocktake({ department, departmentNames, products, requestDelete, setProducts, stocktakes, setStocktakes }) {
  const defaultDepartment = department === "All departments" ? departmentNames[0] || "Kitchen Made" : department;
  const blankModal = (type = "Stocktake") => ({
    type,
    id: "",
    department: defaultDepartment,
    date: today(),
    entryMode: "Product List",
    manualValue: 0,
    lines: [stocktakeBlankLine(defaultDepartment), stocktakeBlankLine(defaultDepartment)],
    pendingImport: [],
    status: "",
    importFileKey: 0,
  });
  const [modal, setModal] = useState(null);
  const [viewingStocktake, setViewingStocktake] = useState(null);
  const visibleStocktakes = stocktakes.filter((stocktake) => departmentMatches(stocktake.department, department));

  const openModal = (type, stocktake = null) => {
    if (!stocktake) {
      setModal(blankModal(type));
      return;
    }
    const isOpening = numberValue(stocktake.openingStockValue) && !numberValue(stocktake.totalValue);
    setModal({
      ...blankModal(isOpening ? "Opening Stock" : "Stocktake"),
      id: stocktake.id,
      department: stocktake.department,
      date: stocktake.date,
      entryMode: stocktake.manualOpeningType === "Manual Value" || stocktake.entryMode === "Manual Value" ? "Manual Value" : "Product List",
      manualValue: isOpening ? stocktake.openingStockValue : stocktake.totalValue,
      lines: ((isOpening ? stocktake.openingLines : stocktake.lines) || []).map((line) => ({ ...line, id: line.id || uid(), stockValue: numberValue(line.quantity) * numberValue(line.unitCost) })),
      pendingImport: [],
      status: "",
      importFileKey: 0,
    });
  };

  const updateModalLine = (id, field, value) => {
    setModal((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.id !== id) return line;
        let updated = { ...line, [field]: ["quantity", "unitCost"].includes(field) ? numberValue(value) : value };
        if (field === "productName") {
          const match = matchProduct(value, products);
          if (match) updated = stocktakeBlankLine(current.department, match.product);
          else updated = { ...updated, matchedProductId: "", supplier: "", packSize: "", matchStatus: "Create product on save" };
        }
        updated.stockValue = numberValue(updated.quantity) * numberValue(updated.unitCost);
        return updated;
      }),
    }));
  };

  const importStocktakeCsv = async (file) => {
    if (!file || !modal) return;
    const rows = (await file.text()).split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim())).filter((row) => row[0]);
    const hasHeader = normalizeHeader(rows[0]?.[0]).includes("product");
    const imported = (hasHeader ? rows.slice(1) : rows).map(([productName, quantity, unitCost]) => {
      const match = matchProduct(productName, products);
      const product = match?.product;
      const line = product ? stocktakeBlankLine(modal.department, product) : stocktakeBlankLine(modal.department, { name: productName, quantity: 1, unitCost: numberValue(unitCost) });
      const nextQuantity = numberValue(quantity, line.quantity);
      const nextUnitCost = unitCost ? numberValue(unitCost) : line.unitCost;
      return { ...line, quantity: nextQuantity, unitCost: nextUnitCost, stockValue: nextQuantity * nextUnitCost };
    }).filter((line) => line.productName.trim());
    setModal((current) => ({ ...current, pendingImport: imported, status: `${imported.length} row(s) ready for review.` }));
  };

  const ensureStocktakeProducts = (lines, selectedDepartment, selectedDate) => {
    let nextProducts = [...products];
    const savedLines = lines.map((line) => {
      const match = line.matchedProductId ? nextProducts.find((product) => product.id === line.matchedProductId) : matchProduct(line.productName, nextProducts)?.product;
      if (match) return { ...line, matchedProductId: match.id, supplier: match.supplier || line.supplier };
      const product = {
        id: uid(),
        name: line.productName,
        supplier: line.supplier || "Stocktake",
        packSize: line.packSize || "",
        quantity: 1,
        unitCost: numberValue(line.unitCost),
        department: selectedDepartment,
        aliases: [],
        supplierPrices: [],
        priceHistory: [{ date: selectedDate, supplier: "Stocktake", price: numberValue(line.unitCost) }],
      };
      nextProducts = [...nextProducts, product];
      return { ...line, matchedProductId: product.id, supplier: product.supplier, matchStatus: "Created product" };
    });
    return { nextProducts, savedLines };
  };

  const saveModal = () => {
    if (!modal) return;
    const isManual = modal.entryMode === "Manual Value";
    const sourceLines = isManual ? [] : modal.lines.filter((line) => line.productName.trim());
    const incomplete = sourceLines.some((line) => !line.productName.trim() || !numberValue(line.quantity) || !numberValue(line.unitCost));
    if (!isManual && (!sourceLines.length || incomplete)) {
      setModal((current) => ({ ...current, status: "Every row needs product, quantity and unit cost." }));
      return;
    }
    const { nextProducts, savedLines } = ensureStocktakeProducts(sourceLines, modal.department, modal.date);
    const normalizedLines = savedLines.map((line) => ({ ...line, stockValue: numberValue(line.quantity) * numberValue(line.unitCost) }));
    const value = isManual ? numberValue(modal.manualValue) : normalizedLines.reduce((sum, line) => sum + numberValue(line.stockValue), 0);
    const isOpening = modal.type === "Opening Stock";
    const stocktake = {
      id: modal.id || uid(),
      date: modal.date,
      department: modal.department,
      entryMode: modal.entryMode,
      openingStockMode: "Manual",
      manualOpeningType: modal.entryMode,
      manualOpeningValue: isOpening && isManual ? value : 0,
      openingLines: isOpening ? normalizedLines : [],
      openingStockValue: isOpening ? value : 0,
      lines: isOpening ? [] : normalizedLines,
      totalValue: isOpening ? 0 : value,
      status: "Saved",
    };
    setProducts(nextProducts);
    setStocktakes((current) => modal.id ? current.map((item) => (item.id === modal.id ? stocktake : item)) : [stocktake, ...current]);
    setModal(null);
  };

  return (
    <div className="page-grid">
      <Panel title="Stocktake">
        <div className="button-row left">
          <button onClick={() => openModal("Opening Stock")} type="button"><Plus size={16} />Opening Stock</button>
          <button onClick={() => openModal("Stocktake")} type="button"><Plus size={16} />New Stocktake</button>
        </div>
      </Panel>
      <Panel title="Saved stocktakes">
        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "department", label: "Department" },
            { key: "openingStockValue", label: "Opening stock value", render: (value) => money(value) },
            { key: "totalValue", label: "Closing stock value", render: (value) => money(value) },
            { key: "lines", label: "Lines", render: (lines, row) => (row.openingLines?.length || 0) + (lines?.length || 0) },
            { key: "status", label: "Status", render: (value) => <Badge tone="green">{value || "Saved"}</Badge> },
            { key: "actions", label: "Actions", render: (_, row) => (
              <div className="row-actions">
                <button className="ghost" onClick={() => setViewingStocktake(row)} type="button"><Eye size={15} />View</button>
                <button className="ghost" onClick={() => openModal("Stocktake", row)} type="button"><Edit3 size={15} />Edit</button>
                <button className="ghost danger" onClick={() => requestDelete({ title: "Delete stocktake", message: "Are you sure you want to delete this stocktake?", onConfirm: () => setStocktakes((current) => current.filter((stocktake) => stocktake.id !== row.id)) })} type="button"><Trash2 size={15} />Delete</button>
              </div>
            ) },
          ]}
          rows={visibleStocktakes}
        />
      </Panel>
      {modal && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal wide stocktake-modal" role="dialog" aria-modal="true" aria-label={modal.type}>
            <div className="modal-header">
              <div><h3>{modal.type}</h3><p>{modal.department} · {modal.date}</p></div>
              <button className="icon" onClick={() => setModal(null)} type="button"><X size={16} /></button>
            </div>
            <div className="form-grid six">
              <label>Department<select value={modal.department} onChange={(event) => setModal({ ...modal, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
              <Field label="Date" type="date" value={modal.date} onChange={(value) => setModal({ ...modal, date: value })} />
            </div>
            <div className="radio-section">
              <strong>Entry mode</strong>
              <div className="radio-row">
                {["Manual Value", "Product List", "CSV Import"].map((mode) => <label key={mode}><input checked={modal.entryMode === mode} onChange={() => setModal({ ...modal, entryMode: mode })} type="radio" />{mode}</label>)}
              </div>
            </div>
            {modal.entryMode === "Manual Value" ? (
              <div className="form-grid six">
                <Field label={modal.type === "Opening Stock" ? "Opening stock value" : "Stock value"} type="number" value={modal.manualValue} onChange={(value) => setModal({ ...modal, manualValue: value })} />
              </div>
            ) : (
              <>
                {modal.entryMode === "CSV Import" && (
                  <>
                    <div className="button-row left tight">
                      <label className="file-button secondary">CSV Import<input accept=".csv,text/csv" key={modal.importFileKey} onChange={(event) => importStocktakeCsv(event.target.files?.[0])} type="file" /></label>
                    </div>
                    {modal.pendingImport.length > 0 && (
                      <div className="import-review">
                        <div className="panel-head"><h2>Review import</h2><span>{modal.pendingImport.length} row(s)</span></div>
                        <DataTable columns={[
                          { key: "productName", label: "Product" },
                          { key: "quantity", label: "Quantity" },
                          { key: "unitCost", label: "Unit cost", render: money },
                          { key: "stockValue", label: "Stock value", render: money },
                        ]} rows={modal.pendingImport} />
                        <div className="button-row left">
                          <button onClick={() => setModal((current) => ({ ...current, lines: current.pendingImport, pendingImport: [], status: "Import confirmed." }))} type="button"><Save size={16} />Confirm Import</button>
                          <button className="ghost danger" onClick={() => setModal((current) => ({ ...current, pendingImport: [], importFileKey: current.importFileKey + 1, status: "Import cancelled." }))} type="button"><X size={16} />Cancel Import</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="table-wrap bulk-entry-table stocktake-entry-table">
                  <table>
                    <thead><tr>{["Product search", "Quantity", "Unit cost", "Stock value", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
                    <tbody>
                      {modal.lines.map((line) => (
                        <tr key={line.id}>
                          <td><input list="stocktake-product-list" value={line.productName} onChange={(event) => updateModalLine(line.id, "productName", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={line.quantity} onChange={(event) => updateModalLine(line.id, "quantity", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateModalLine(line.id, "unitCost", event.target.value)} /></td>
                          <td>{money(line.stockValue)}</td>
                          <td><button className="icon danger" onClick={() => setModal((current) => ({ ...current, lines: current.lines.length > 1 ? current.lines.filter((item) => item.id !== line.id) : current.lines }))} type="button"><Trash2 size={15} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <datalist id="stocktake-product-list">{products.map((product) => <option key={product.id} value={product.name} />)}</datalist>
                <div className="button-row left tight">
                  <button className="ghost" onClick={() => setModal((current) => ({ ...current, lines: [...current.lines, stocktakeBlankLine(current.department)] }))} type="button"><Plus size={16} />Add Row</button>
                </div>
              </>
            )}
            {modal.status && <div className="invoice-status info">{modal.status}</div>}
            <div className="stocktake-summary slim"><span>Total</span><strong>{money(modal.entryMode === "Manual Value" ? modal.manualValue : modal.lines.reduce((sum, line) => sum + numberValue(line.stockValue), 0))}</strong></div>
            <div className="button-row left">
              <button className="ghost" onClick={() => setModal(null)} type="button">Cancel</button>
              <button onClick={saveModal} type="button"><Save size={16} />Save</button>
            </div>
          </div>
        </div>
      )}
      {viewingStocktake && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal" role="dialog" aria-modal="true" aria-label="View stocktake">
            <div className="modal-header">
              <div><h3>Stocktake</h3><p>{viewingStocktake.department} · {viewingStocktake.date}</p></div>
              <button className="icon" onClick={() => setViewingStocktake(null)} type="button"><X size={16} /></button>
            </div>
            {[...(viewingStocktake.openingLines || []), ...(viewingStocktake.lines || [])].map((line) => (
              <div className="compact-row" key={line.id}><span>{line.productName}</span><span>{line.quantity} x {money(line.unitCost)}</span><strong>{money(line.stockValue)}</strong></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LegacyStocktake({ department, departmentNames, products, requestDelete, setProducts, stocktakes, setStocktakes }) {
  const stocktakeDepartment = department === "All departments" ? departmentNames[0] || "Kitchen Made" : department;
  const emptyForm = {
    id: "",
    date: today(),
    department: stocktakeDepartment,
    entryMode: "Product List",
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
  const visibleStocktakes = stocktakes.filter((stocktake) => departmentMatches(stocktake.department, department));
  const openingProductTotal = (form.openingLines || []).reduce((sum, line) => sum + numberValue(line.stockValue), 0);
  const openingStockValue = form.manualOpeningType === "Opening Product List" || form.manualOpeningType === "CSV Import"
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

  const importOpeningCsv = async (file) => {
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
        matchStatus: match ? (match.confidence > 0.9 ? "Matched" : `Possible match: ${match.product.name}`) : "Manual opening",
      };
    });
    setForm((current) => ({ ...current, openingLines: [...(current.openingLines || []), ...imported] }));
    setStatus(`Imported ${imported.length} opening stock CSV line(s).`);
  };

  const saveStocktake = () => {
    const incomplete = form.lines.some((line) => !line.productName.trim() || !numberValue(line.quantity) || !numberValue(line.unitCost));
    const incompleteOpening = form.manualOpeningType !== "Manual Total Value"
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
    const savedOpeningValue = form.manualOpeningType === "Opening Product List" || form.manualOpeningType === "CSV Import"
        ? normalizedOpeningLines.reduce((sum, line) => sum + numberValue(line.stockValue), 0)
        : numberValue(form.manualOpeningValue);
    const stocktake = {
      id: form.id || uid(),
      date: form.date,
      department: form.department,
      entryMode: form.entryMode,
      openingStockMode: "Manual",
      manualOpeningType: form.manualOpeningType,
      manualOpeningValue: numberValue(form.manualOpeningValue),
      openingLines: normalizedOpeningLines,
      openingStockValue: savedOpeningValue,
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
      manualOpeningType: stocktake.manualOpeningType || "Manual Total Value",
      manualOpeningValue: numberValue(stocktake.manualOpeningValue ?? stocktake.openingStockValue),
      openingProductSearch: "",
      openingLines: (stocktake.openingLines || []).map((line) => ({ ...line, id: line.id || uid(), stockValue: numberValue(line.quantity) * numberValue(line.unitCost) })),
      productSearch: "",
      lines: (stocktake.lines || []).map((line) => ({ ...line, id: line.id || uid(), stockValue: numberValue(line.quantity) * numberValue(line.unitCost) })),
    });
    setStatus(`Editing stocktake from ${stocktake.date}.`);
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
        <div className="radio-section compact">
          <strong>Opening stock</strong>
          <div className="radio-row">
            {["Manual Total Value", "Opening Product List", "CSV Import"].map((mode) => (
              <label key={mode}><input checked={form.manualOpeningType === mode} onChange={() => setForm({ ...form, manualOpeningType: mode })} type="radio" />{mode === "CSV Import" ? "Opening CSV Import" : mode}</label>
            ))}
          </div>
        </div>
        {form.manualOpeningType === "Manual Total Value" ? (
          <div className="form-grid six">
            <label>Opening Stock<input min="0" step="0.01" type="number" value={form.manualOpeningValue} onChange={(event) => setForm({ ...form, manualOpeningValue: event.target.value })} /></label>
          </div>
        ) : (
          <>
            {form.manualOpeningType === "Opening Product List" && (
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
              </>
            )}
            {form.manualOpeningType === "CSV Import" && (
              <div className="form-grid six">
                <label>Opening CSV Import<input accept=".csv,text/csv" onChange={(event) => importOpeningCsv(event.target.files?.[0])} type="file" /></label>
              </div>
            )}
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
                      <td><button className="icon danger" onClick={() => requestDelete({ title: "Delete opening stock line", message: "Are you sure you want to delete this opening stock line?", onConfirm: () => setForm((current) => ({ ...current, openingLines: (current.openingLines || []).filter((item) => item.id !== line.id) })) })} type="button"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="stocktake-summary slim"><span>Opening Stock Total</span><strong>{money(openingStockValue)}</strong></div>
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
        <div className="radio-section compact">
          <strong>Current / Closing stock</strong>
        </div>
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
                  <td><button className="icon danger" onClick={() => requestDelete({ title: "Delete stocktake line", message: "Are you sure you want to delete this stocktake line?", onConfirm: () => setForm((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) })) })} type="button"><Trash2 size={15} /></button></td>
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
            { key: "openingStockValue", label: "Opening stock value", render: (value) => money(value) },
            { key: "totalValue", label: "Closing stock value", render: (value) => money(value) },
            { key: "lines", label: "Lines", render: (lines) => lines.length },
            { key: "status", label: "Status", render: (value) => <Badge tone="green">{value || "Saved"}</Badge> },
            { key: "actions", label: "Actions", render: (_, row) => (
              <div className="row-actions">
                <button className="ghost" onClick={() => setViewingStocktake(row)} type="button"><Eye size={15} />View</button>
                <button className="ghost" onClick={() => editStocktake(row)} type="button"><Edit3 size={15} />Edit</button>
                <button className="ghost danger" onClick={() => requestDelete({ title: "Delete stocktake", message: "Are you sure you want to delete this stocktake?", onConfirm: () => { setStocktakes((current) => current.filter((stocktake) => stocktake.id !== row.id)); setStatus("Stocktake deleted."); } })} type="button"><Trash2 size={15} />Delete</button>
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
              <span>{viewingStocktake.manualOpeningType || "Manual Total Value"}</span>
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
    </div>
  );
}

function Recipes({ departmentNames, products, recipes, requestDelete, setProducts, setRecipes, suppliers }) {
  const blankIngredient = () => ({ id: uid(), productId: "", productName: "", supplier: "", quantity: 1, unit: "", unitCost: 0, lineCost: 0 });
  const empty = { name: "", yieldQuantity: 1, yieldUnit: "portions", notes: "", method: "", ingredients: [blankIngredient(), blankIngredient()] };
  const emptyProduct = { name: "", supplier: suppliers[0]?.name || "", packSize: "", quantity: 1, unitCost: 0, department: departmentNames[0] || "Kitchen Made", aliases: "" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [createProductForIngredientId, setCreateProductForIngredientId] = useState("");
  const [productForm, setProductForm] = useState(emptyProduct);

  const ingredientFromProduct = (ingredient, product) => {
    const cheapest = cheapestOffer(product, products);
    const quantity = numberValue(ingredient.quantity, 1);
    const unitCost = numberValue(cheapest.price, product.unitCost);
    return {
      ...ingredient,
      productId: product.id,
      productName: product.name,
      supplier: cheapest.supplier || product.supplier || "",
      unit: ingredient.unit || product.packSize || "",
      unitCost,
      lineCost: quantity * unitCost,
    };
  };

  const updateIngredient = (id, field, value) => {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) => {
        if (ingredient.id !== id) return ingredient;
        let updated = { ...ingredient, [field]: ["quantity", "unitCost"].includes(field) ? numberValue(value) : value };
        if (field === "productName") {
          const product = products.find((candidate) => candidate.name.toLowerCase() === String(value).trim().toLowerCase());
          updated = product ? ingredientFromProduct(updated, product) : { ...updated, productId: "", supplier: "", unitCost: 0, lineCost: 0 };
        }
        if (field === "quantity" || field === "unitCost") {
          updated.lineCost = numberValue(updated.quantity) * numberValue(updated.unitCost);
        }
        return updated;
      }),
    }));
  };

  const openCreateProduct = (ingredient) => {
    setCreateProductForIngredientId(ingredient.id);
    setProductForm({
      ...emptyProduct,
      name: ingredient.productName || "",
      unitCost: ingredient.unitCost || 0,
      packSize: ingredient.unit || "",
    });
  };

  const saveCreatedProduct = () => {
    if (!productForm.name.trim()) return;
    const aliases = String(productForm.aliases || "").split(",").map((alias) => alias.trim()).filter(Boolean);
    const unitCost = numberValue(productForm.unitCost);
    const product = {
      ...productForm,
      id: uid(),
      aliases,
      quantity: numberValue(productForm.quantity, 1),
      unitCost,
      supplierPrices: [{ supplier: productForm.supplier, price: unitCost, date: today() }],
      priceHistory: [{ date: today(), supplier: productForm.supplier, price: unitCost }],
    };
    setProducts((current) => [product, ...current]);
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) => (
        ingredient.id === createProductForIngredientId
          ? ingredientFromProduct({ ...ingredient, productName: product.name, unit: ingredient.unit || product.packSize }, product)
          : ingredient
      )),
    }));
    setCreateProductForIngredientId("");
    setProductForm(emptyProduct);
  };

  const saveRecipe = () => {
    if (!form.name.trim()) return;
    const ingredients = form.ingredients
      .filter((ingredient) => ingredient.productName.trim())
      .map((ingredient) => ({
        ...ingredient,
        quantity: numberValue(ingredient.quantity, 1),
        unitCost: numberValue(ingredient.unitCost),
        lineCost: numberValue(ingredient.quantity, 1) * numberValue(ingredient.unitCost),
      }));
    const batchCost = ingredients.reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost), 0);
    const yieldQuantity = numberValue(form.yieldQuantity, 1);
    const payload = {
      id: editingId || uid(),
      name: form.name,
      yieldQuantity,
      yieldUnit: form.yieldUnit,
      notes: form.notes,
      method: form.method,
      ingredients,
      batchCost,
      unitCost: yieldQuantity ? batchCost / yieldQuantity : 0,
    };
    if (editingId) setRecipes((current) => current.map((recipe) => (recipe.id === editingId ? payload : recipe)));
    else setRecipes((current) => [payload, ...current]);
    setForm(empty);
    setEditingId("");
    setModalOpen(false);
  };

  const openRecipeModal = (row = null) => {
    if (row) {
      const ingredients = (row.ingredients || []).map((ingredient) => ({
        id: ingredient.id || uid(),
        productId: ingredient.productId || "",
        productName: ingredient.productName || ingredient.name || "",
        supplier: ingredient.supplier || "",
        quantity: numberValue(ingredient.quantity, 1),
        unit: ingredient.unit || "",
        unitCost: numberValue(ingredient.unitCost),
        lineCost: numberValue(ingredient.lineCost, numberValue(ingredient.quantity, 1) * numberValue(ingredient.unitCost)),
      }));
      setForm({ name: row.name, yieldQuantity: row.yieldQuantity, yieldUnit: row.yieldUnit, notes: row.notes || "", method: row.method || "", ingredients: ingredients.length ? ingredients : [blankIngredient(), blankIngredient()] });
      setEditingId(row.id);
    } else {
      setForm(empty);
      setEditingId("");
    }
    setCreateProductForIngredientId("");
    setModalOpen(true);
  };

  const rows = recipes.map((recipe) => ({
    ...recipe,
    yieldLabel: `${recipe.yieldQuantity} ${recipe.yieldUnit}`,
    batchCost: recipeBatchCost(recipe),
    unitCost: recipeUnitCost(recipe),
    linked: recipe.ingredients.length,
  }));
  const currentBatchCost = form.ingredients.reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost, numberValue(ingredient.quantity) * numberValue(ingredient.unitCost)), 0);
  const currentUnitCost = numberValue(form.yieldQuantity, 1) ? currentBatchCost / numberValue(form.yieldQuantity, 1) : 0;

  return (
    <div className="page-grid">
      <Panel title="Recipe costing">
        <DataTable
          columns={[
            { key: "name", label: "Recipe" },
            { key: "yieldLabel", label: "Yield" },
            { key: "batchCost", label: "Batch cost", render: (value) => money(value) },
            { key: "unitCost", label: "Unit cost", render: (value) => money(value) },
            { key: "linked", label: "Ingredients" },
          ]}
          onDelete={(id) => requestDelete({ title: "Delete recipe", message: "Are you sure you want to delete this recipe?", onConfirm: () => setRecipes((current) => current.filter((recipe) => recipe.id !== id)) })}
          onEdit={openRecipeModal}
          rows={rows}
          toolbarAction={<button onClick={() => openRecipeModal()} type="button"><Plus size={16} />Add Recipe</button>}
        />
      </Panel>
      {modalOpen && (
        <EditModal title={editingId ? "Edit recipe" : "Create recipe"} onCancel={() => setModalOpen(false)} onSave={saveRecipe} saveLabel="Save Recipe">
          <div className="form-grid six">
            <Field label="Recipe name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <Field label="Yield quantity" type="number" value={form.yieldQuantity} onChange={(value) => setForm({ ...form, yieldQuantity: value })} />
            <Field label="Yield unit" value={form.yieldUnit} onChange={(value) => setForm({ ...form, yieldUnit: value })} />
            <label>Recipe notes<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <label className="wide-field">Method<textarea rows={7} placeholder="large text box" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} /></label>
          </div>
          <div className="table-wrap bulk-entry-table recipe-builder-table">
            <table>
              <thead><tr>{["Search ingredient", "Product", "Supplier", "Unit cost", "Quantity", "Unit", "Cost", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {form.ingredients.map((ingredient) => {
                  const productFound = products.some((product) => product.name.toLowerCase() === ingredient.productName.trim().toLowerCase());
                  const needsProduct = ingredient.productName.trim() && !productFound;
                  return (
                    <tr key={ingredient.id}>
                      <td>
                        <input list={`recipe-product-${ingredient.id}`} value={ingredient.productName} onChange={(event) => updateIngredient(ingredient.id, "productName", event.target.value)} />
                        <datalist id={`recipe-product-${ingredient.id}`}>
                          {productAutocomplete(products, ingredient.productName).map((product) => <option key={product.id} value={product.name} />)}
                        </datalist>
                        {needsProduct && <button className="match-hint" onClick={() => openCreateProduct(ingredient)} type="button"><Plus size={13} />Create Product</button>}
                      </td>
                      <td>{ingredient.productId ? ingredient.productName : "-"}</td>
                      <td>{ingredient.supplier || "-"}</td>
                      <td>{money(ingredient.unitCost)}</td>
                      <td><input min="0" step="0.01" type="number" value={ingredient.quantity} onChange={(event) => updateIngredient(ingredient.id, "quantity", event.target.value)} /></td>
                      <td><input value={ingredient.unit} onChange={(event) => updateIngredient(ingredient.id, "unit", event.target.value)} /></td>
                      <td>{money(numberValue(ingredient.lineCost, numberValue(ingredient.quantity) * numberValue(ingredient.unitCost)))}</td>
                      <td><button className="icon danger" onClick={() => requestDelete({ title: "Delete ingredient", message: "Are you sure you want to delete this ingredient?", onConfirm: () => setForm((current) => ({ ...current, ingredients: current.ingredients.length > 1 ? current.ingredients.filter((item) => item.id !== ingredient.id) : current.ingredients })) })} type="button"><Trash2 size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="button-row left tight">
            <button className="ghost" onClick={() => setForm((current) => ({ ...current, ingredients: [...current.ingredients, blankIngredient()] }))} type="button"><Plus size={16} />Add Ingredient Row</button>
          </div>
          <div className="metric-grid compact">
            <Metric label="Batch cost" value={money(currentBatchCost)} delta={`${form.ingredients.filter((ingredient) => ingredient.productName.trim()).length} ingredient(s)`} />
            <Metric label="Unit cost" value={money(currentUnitCost)} delta={`Per ${form.yieldUnit || "unit"}`} />
          </div>
        </EditModal>
      )}
      {createProductForIngredientId && (
        <EditModal title="Create product" onCancel={() => setCreateProductForIngredientId("")} onSave={saveCreatedProduct} saveLabel="Save Product">
          <div className="form-grid six">
            <Field label="Product name" value={productForm.name} onChange={(value) => setProductForm({ ...productForm, name: value })} />
            <label>Supplier<select value={productForm.supplier} onChange={(event) => setProductForm({ ...productForm, supplier: event.target.value })}>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></label>
            <Field label="Pack size" value={productForm.packSize} onChange={(value) => setProductForm({ ...productForm, packSize: value })} />
            <Field label="Quantity" type="number" value={productForm.quantity} onChange={(value) => setProductForm({ ...productForm, quantity: value })} />
            <Field label="Unit cost" type="number" value={productForm.unitCost} onChange={(value) => setProductForm({ ...productForm, unitCost: value })} />
            <label>Department<select value={productForm.department} onChange={(event) => setProductForm({ ...productForm, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
            <Field label="Aliases" value={productForm.aliases} onChange={(value) => setProductForm({ ...productForm, aliases: value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

function MenuCosting({ financialSettings, menuSettings, menus, products, recipes, requestDelete, setMenus }) {
  const defaultTarget = numberValue(menuSettings.defaultMenuTargetGp, financialSettings.targetGp);
  const [menuForm, setMenuForm] = useState({ name: "", season: "", startDate: today(), endDate: today(), targetGp: defaultTarget, status: "Draft" });
  const [activeMenuId, setActiveMenuId] = useState(menus[0]?.id || "");
  const [menuSubcategoryRows, setMenuSubcategoryRows] = useState([{ id: uid(), name: "" }, { id: uid(), name: "" }]);
  const [dishForm, setDishForm] = useState({ menuId: menus[0]?.id || "", subcategoryId: menus[0]?.subcategories[0]?.id || "", name: "", sellingPrice: 0, status: "Draft" });
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const blankDishIngredient = () => ({ id: uid(), type: "Product", name: "", quantity: 1, unit: "each", unitCost: 0, lineCost: 0, sourceId: "" });
  const [dishIngredientRows, setDishIngredientRows] = useState([blankDishIngredient(), blankDishIngredient()]);
  const activeMenu = menus.find((menu) => menu.id === activeMenuId) || menus[0];
  const subcategories = activeMenu?.subcategories || [];
  const dishMenu = menus.find((menu) => menu.id === dishForm.menuId) || activeMenu;
  const dishSubcategories = dishMenu?.subcategories || [];
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
    const subcategories = menuSubcategoryRows
      .map((row) => row.name.trim())
      .filter(Boolean)
      .map((name) => ({ id: uid(), name, targetGp: numberValue(menuForm.targetGp, defaultTarget), dishes: [] }));
    const menu = { ...menuForm, id: uid(), targetGp: numberValue(menuForm.targetGp, defaultTarget), subcategories };
    setMenus((current) => [menu, ...current]);
    setActiveMenuId(menu.id);
    setMenuForm({ name: "", season: "", startDate: today(), endDate: today(), targetGp: defaultTarget, status: "Draft" });
    setMenuSubcategoryRows([{ id: uid(), name: "" }, { id: uid(), name: "" }]);
    setMenuModalOpen(false);
  };

  const addDish = () => {
    const selectedMenu = menus.find((menu) => menu.id === dishForm.menuId) || activeMenu;
    if (!selectedMenu || !dishForm.subcategoryId || !dishForm.name.trim()) return;
    const dishIngredients = dishIngredientRows
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) => ({ ...ingredient, lineCost: numberValue(ingredient.quantity) * numberValue(ingredient.unitCost) }));
    const ingredientCost = dishIngredients.reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost), 0);
    const dish = {
      id: uid(),
      name: dishForm.name,
      sellingPrice: numberValue(dishForm.sellingPrice),
      recipeIds: [],
      ingredients: dishIngredients,
      manualCost: 0,
      targetGp: "",
      status: dishForm.status,
    };
    setMenus((current) => current.map((menu) => {
      if (menu.id !== selectedMenu.id) return menu;
      return {
        ...menu,
        subcategories: menu.subcategories.map((subcategory) => (subcategory.id === dishForm.subcategoryId ? { ...subcategory, dishes: [...subcategory.dishes, dish] } : subcategory)),
      };
    }));
    setActiveMenuId(selectedMenu.id);
    setDishForm({ menuId: selectedMenu.id, subcategoryId: dishForm.subcategoryId, name: "", sellingPrice: 0, status: "Draft" });
    setDishIngredientRows([blankDishIngredient(), blankDishIngredient()]);
    setDishModalOpen(false);
  };

  const updateDishIngredient = (id, field, value) => {
    setDishIngredientRows((current) => current.map((ingredient) => {
      if (ingredient.id !== id) return ingredient;
      const updated = { ...ingredient, [field]: ["quantity", "unitCost"].includes(field) ? numberValue(value) : value };
      if (field === "name") {
        if (updated.type === "Product") {
          const product = matchProduct(value, products)?.product;
          if (product) {
            updated.name = product.name;
            updated.sourceId = product.id;
            updated.unitCost = numberValue(product.unitCost);
            updated.unit = product.packSize || updated.unit;
          }
        }
        if (updated.type === "Recipe") {
          const recipe = recipes.find((item) => item.name.toLowerCase() === String(value).trim().toLowerCase()) || recipes.find((item) => item.name.toLowerCase().includes(String(value).toLowerCase()));
          if (recipe) {
            updated.name = recipe.name;
            updated.sourceId = recipe.id;
            updated.unitCost = recipeUnitCost(recipe);
            updated.unit = recipe.yieldUnit || updated.unit;
          }
        }
      }
      updated.lineCost = numberValue(updated.quantity) * numberValue(updated.unitCost);
      return updated;
    }));
  };

  const deleteMenu = () => {
    if (!activeMenu) return;
    requestDelete({
      title: "Delete menu",
      message: "Are you sure you want to delete this menu?",
      onConfirm: () => {
        setMenus((current) => current.filter((menu) => menu.id !== activeMenu.id));
        const nextMenu = menus.find((menu) => menu.id !== activeMenu.id);
        setActiveMenuId(nextMenu?.id || "");
      },
    });
  };

  const deleteSubcategory = (subcategoryId) => {
    requestDelete({
      title: "Delete subcategory",
      message: "Are you sure you want to delete this subcategory?",
      onConfirm: () => setMenus((current) => current.map((menu) => (
        menu.id === activeMenu?.id
          ? { ...menu, subcategories: menu.subcategories.filter((subcategory) => subcategory.id !== subcategoryId) }
          : menu
      ))),
    });
  };

  const deleteDish = (dishId) => {
    requestDelete({
      title: "Delete menu dish",
      message: "Are you sure you want to delete this menu dish?",
      onConfirm: () => setMenus((current) => current.map((menu) => ({
        ...menu,
        subcategories: menu.subcategories.map((subcategory) => ({ ...subcategory, dishes: subcategory.dishes.filter((dish) => dish.id !== dishId) })),
      }))),
    });
  };

  return (
    <div className="page-grid">
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
            </div>
            <div className="button-row left">
              <button onClick={() => setMenuModalOpen(true)} type="button"><Plus size={16} />Create Menu</button>
              <button onClick={() => { setDishForm({ menuId: activeMenu.id, subcategoryId: subcategories[0]?.id || "", name: "", sellingPrice: 0, status: "Draft" }); setDishIngredientRows([blankDishIngredient(), blankDishIngredient()]); setDishModalOpen(true); }} type="button"><Plus size={16} />Add Dish</button>
              <button className="ghost danger" onClick={deleteMenu} type="button"><Trash2 size={16} />Delete Menu</button>
            </div>
          </Panel>
          <Panel title="Subcategory summary">
            <div className="stack-list">
              {subcategories.map((subcategory) => {
                const rows = dishRows.filter((dish) => dish.subcategory === subcategory.name);
                const gp = average(rows.map((dish) => dish.gp));
                const target = numberValue(subcategory.targetGp, menuTarget);
                return <div className="compact-row" key={subcategory.id}><span>{subcategory.name}</span><strong>{percent(gp)}</strong><span>Target {percent(target)}</span><Badge tone={gp >= target ? "green" : "amber"}>{percent(gp - target)}</Badge><span>{rows.length} dishes</span><button className="icon danger" onClick={() => deleteSubcategory(subcategory.id)} type="button"><Trash2 size={15} /></button></div>;
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
              onDelete={deleteDish}
              rows={dishRows}
            />
          </Panel>
        </>
      )}
      {!activeMenu && <Panel title="Menu costing"><div className="button-row left"><button onClick={() => setMenuModalOpen(true)} type="button"><Plus size={16} />Create Menu</button></div></Panel>}
      {menuModalOpen && (
        <EditModal title="Create menu" onCancel={() => setMenuModalOpen(false)} onSave={createMenu} saveLabel="Save Menu">
          <div className="form-grid six">
            <Field label="Menu name" value={menuForm.name} onChange={(value) => setMenuForm({ ...menuForm, name: value })} />
            <Field label="Season / type" value={menuForm.season} onChange={(value) => setMenuForm({ ...menuForm, season: value })} />
            <Field label="Start date" type="date" value={menuForm.startDate} onChange={(value) => setMenuForm({ ...menuForm, startDate: value })} />
            <Field label="End date" type="date" value={menuForm.endDate} onChange={(value) => setMenuForm({ ...menuForm, endDate: value })} />
            <Field label="Target GP %" type="number" value={menuForm.targetGp} onChange={(value) => setMenuForm({ ...menuForm, targetGp: value })} readOnly={!menuSettings.allowMenuTargetOverride} />
            <label>Status<select value={menuForm.status} onChange={(event) => setMenuForm({ ...menuForm, status: event.target.value })}><option>Draft</option><option>Active</option><option>Archived</option></select></label>
          </div>
          <div className="stack-list tight">
            {menuSubcategoryRows.map((row) => (
              <div className="compact-row" key={row.id}>
                <input placeholder="Subcategory name" value={row.name} onChange={(event) => setMenuSubcategoryRows((current) => current.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
              </div>
            ))}
          </div>
          <div className="button-row left tight">
            <button className="ghost" onClick={() => setMenuSubcategoryRows((current) => [...current, { id: uid(), name: "" }])} type="button"><Plus size={16} />Add Subcategory</button>
          </div>
        </EditModal>
      )}
      {dishModalOpen && (
        <EditModal title="Add dish" onCancel={() => setDishModalOpen(false)} onSave={addDish} saveLabel="Save Dish">
          <div className="form-grid six">
            <Field label="Dish name" value={dishForm.name} onChange={(value) => setDishForm({ ...dishForm, name: value })} />
            <label>Menu<select value={dishForm.menuId} onChange={(event) => {
              const nextMenu = menus.find((menu) => menu.id === event.target.value);
              setDishForm({ ...dishForm, menuId: event.target.value, subcategoryId: nextMenu?.subcategories?.[0]?.id || "" });
            }}>{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></label>
            <label>Subcategory<select value={dishForm.subcategoryId} onChange={(event) => setDishForm({ ...dishForm, subcategoryId: event.target.value })}>{dishSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label>
            <Field label="Selling price" type="number" value={dishForm.sellingPrice} onChange={(value) => setDishForm({ ...dishForm, sellingPrice: value })} />
            <label>Status<select value={dishForm.status} onChange={(event) => setDishForm({ ...dishForm, status: event.target.value })}><option>Draft</option><option>Active</option><option>Archived</option></select></label>
          </div>
          <div className="table-wrap compact-table dish-builder-table">
            <table>
              <thead><tr>{["Type", "Search", "Quantity", "Unit", "Cost auto", "Line cost", ""].map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {dishIngredientRows.map((ingredient) => {
                  const productMatches = ingredient.type === "Product" ? productAutocomplete(products, ingredient.name, 5) : [];
                  const recipeMatches = ingredient.type === "Recipe" ? recipeAutocomplete(recipes, ingredient.name, 5) : [];
                  return (
                  <tr key={ingredient.id}>
                    <td><select value={ingredient.type} onChange={(event) => updateDishIngredient(ingredient.id, "type", event.target.value)}><option>Product</option><option>Recipe</option></select></td>
                    <td>
                      <input value={ingredient.name} onChange={(event) => updateDishIngredient(ingredient.id, "name", event.target.value)} />
                      {Boolean(productMatches.length || recipeMatches.length) && (
                        <div className="inline-suggestion-list">
                          {productMatches.map((product) => (
                            <button key={product.id} onClick={() => updateDishIngredient(ingredient.id, "name", product.name)} type="button">
                              {product.name}<span>{product.supplier || "No supplier"} · {money(product.unitCost)}</span>
                            </button>
                          ))}
                          {recipeMatches.map((recipe) => (
                            <button key={recipe.id} onClick={() => updateDishIngredient(ingredient.id, "name", recipe.name)} type="button">
                              {recipe.name}<span>Recipe · {money(recipeUnitCost(recipe))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><input min="0" step="0.01" type="number" value={ingredient.quantity} onChange={(event) => updateDishIngredient(ingredient.id, "quantity", event.target.value)} /></td>
                    <td><input value={ingredient.unit} onChange={(event) => updateDishIngredient(ingredient.id, "unit", event.target.value)} /></td>
                    <td>{money(ingredient.unitCost)}</td>
                    <td>{money(ingredient.lineCost)}</td>
                    <td><button className="icon danger" onClick={() => setDishIngredientRows((current) => current.length > 1 ? current.filter((item) => item.id !== ingredient.id) : current)} type="button"><Trash2 size={15} /></button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="button-row left tight">
            <button className="ghost" onClick={() => setDishIngredientRows((current) => [...current, blankDishIngredient()])} type="button"><Plus size={16} />Add Ingredient Row</button>
          </div>
          <div className="metric-grid compact">
            <Metric label="Dish cost" value={money(dishIngredientRows.reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost), 0))} delta="Sum all ingredients" />
            <Metric label="GP" value={percent(gpFor(dishIngredientRows.reduce((sum, ingredient) => sum + numberValue(ingredient.lineCost), 0), dishForm.sellingPrice))} delta="Selling price vs cost" />
          </div>
        </EditModal>
      )}
    </div>
  );
}

function Waste({ department, departmentNames, products, requestDelete, wasteItems, setWasteItems }) {
  const visibleWaste = wasteItems.filter((item) => departmentMatches(item.department, department)).map((item) => ({ ...item, cost: wasteCost(item) }));
  const emptyWaste = { date: today(), department: department === "All departments" ? departmentNames[0] || "Kitchen Made" : department, productName: "", quantity: 1, unitCost: 0, reason: "Spoiled", notes: "" };
  const [form, setForm] = useState(emptyWaste);
  const [editingWasteId, setEditingWasteId] = useState("");
  const [wasteModalOpen, setWasteModalOpen] = useState(false);

  const updateProduct = (value) => {
    const match = matchProduct(value, products);
    setForm({ ...form, productName: value, unitCost: match?.product?.unitCost ?? form.unitCost });
  };

  const addWaste = () => {
    if (!form.productName.trim()) return;
    const payload = { ...form, id: editingWasteId || uid(), cost: wasteCost(form) };
    setWasteItems((current) => editingWasteId ? current.map((item) => (item.id === editingWasteId ? payload : item)) : [payload, ...current]);
    setForm({ ...emptyWaste, department: form.department });
    setEditingWasteId("");
    setWasteModalOpen(false);
  };

  const openWasteModal = (row = null) => {
    setForm(row || emptyWaste);
    setEditingWasteId(row?.id || "");
    setWasteModalOpen(true);
  };

  return (
    <div className="page-grid">
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
          onEdit={openWasteModal}
          onDelete={(id) => requestDelete({ title: "Delete waste record", message: "Are you sure you want to delete this waste record?", onConfirm: () => setWasteItems((current) => current.filter((item) => item.id !== id)) })}
          rows={visibleWaste}
          toolbarAction={<button onClick={() => openWasteModal()} type="button"><Plus size={16} />Add Waste</button>}
        />
      </Panel>
      {wasteModalOpen && (
        <EditModal title={editingWasteId ? "Edit waste" : "Add waste"} onCancel={() => { setWasteModalOpen(false); setEditingWasteId(""); setForm(emptyWaste); }} onSave={addWaste} saveLabel="Save Waste">
          <div className="form-grid six">
            <Field label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
            <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
            <label>Product<input value={form.productName} onChange={(event) => updateProduct(event.target.value)} /></label>
            {productAutocomplete(products, form.productName, 5).length > 0 && (
              <div className="inline-suggestion-list wide-field">
                {productAutocomplete(products, form.productName, 5).map((product) => (
                  <button key={product.id} onClick={() => updateProduct(product.name)} type="button">
                    {product.name}<span>{product.supplier || "No supplier"} · {money(product.unitCost)}</span>
                  </button>
                ))}
              </div>
            )}
            <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
            <Field label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
            <label>Reason<select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}>{["Spoiled", "Overproduction", "FOH mistake", "Kitchen mistake", "Expired", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            <Field label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          </div>
        </EditModal>
      )}
    </div>
  );
}

function SalesManager({ financialSettings, departmentNames, requestDelete, sales, setSales }) {
  const defaultVatRate = financialSettings.defaultVat;
  const empty = { date: today(), department: "Total", grossSales: 0, sales: 0, vatRate: defaultVatRate, discounts: 0, refunds: 0, serviceCharge: 0 };
  const [form, setForm] = useState(empty);
  const [salesMode, setSalesMode] = useState(financialSettings.salesInputMethod === "Auto-calculate Net Sales from VAT %" ? "Calculate Net from VAT" : "Gross + Net");
  const [editingId, setEditingId] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingImport, setPendingImport] = useState([]);
  const [importFileKey, setImportFileKey] = useState(0);
  const departmentOptions = ["Total", ...departmentNames];
  const formVatAmount = vatAmountFromGrossNet(form.grossSales, form.sales);
  const formEffectiveVat = effectiveVatRate(form.grossSales, form.sales);

  const updateGross = (value) => {
    const grossSales = numberValue(value);
    setForm((current) => ({
      ...current,
      grossSales,
      sales: salesMode === "Calculate Net from VAT" ? netFromGross(grossSales, current.vatRate) : current.sales,
    }));
  };

  const updateVatRate = (value) => {
    const vatRate = numberValue(value, defaultVatRate);
    setForm((current) => ({
      ...current,
      vatRate,
      sales: salesMode === "Calculate Net from VAT" ? netFromGross(current.grossSales, vatRate) : current.sales,
    }));
  };

  const saveSale = () => {
    if (!form.date || !numberValue(form.grossSales) || !numberValue(form.sales)) {
      setStatus("Gross Sales and Net Sales are required.");
      return;
    }
    const grossSales = numberValue(form.grossSales);
    const netSales = numberValue(form.sales);
    const vatRate = numberValue(form.vatRate, defaultVatRate);
    const payload = {
      ...form,
      id: editingId || uid(),
      day: new Date(`${form.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
      grossSales,
      sales: netSales,
      vatRate,
      vatAmount: vatAmountFromGrossNet(grossSales, netSales),
      effectiveVatRate: effectiveVatRate(grossSales, netSales),
      discounts: numberValue(form.discounts),
      refunds: numberValue(form.refunds),
      serviceCharge: numberValue(form.serviceCharge),
    };
    setSales((current) => editingId ? current.map((row) => (row.id === editingId ? payload : row)) : [payload, ...current]);
    setForm(empty);
    setEditingId("");
    setEditModalOpen(false);
    setAddModalOpen(false);
    setStatus("Sales saved");
  };

  const importSales = async (file) => {
    if (!file) return;
    const imported = parseSalesCsv(await file.text(), departmentNames, defaultVatRate, financialSettings.salesInputMethod);
    if (!imported.length) {
      setStatus("CSV import found no sales rows. Use date,gross,net or date,department,gross,net.");
      return;
    }
    const missingNet = imported.filter((row) => !numberValue(row.sales)).length;
    setPendingImport(imported);
    setStatus(missingNet ? `${imported.length} sales row(s) ready for review. ${missingNet} line(s) need Net Sales entered before GP is accurate.` : `${imported.length} sales row(s) ready for review.`);
  };

  const confirmImport = () => {
    setSales((current) => [...pendingImport, ...current]);
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setStatus("Sales import confirmed.");
  };

  const cancelImport = () => {
    setPendingImport([]);
    setImportFileKey((current) => current + 1);
    setStatus("Sales import cancelled.");
  };

  return (
    <Panel title="Sales input" action="Manual or CSV">
      <div className="button-row left">
        <button onClick={() => { setForm(empty); setEditingId(""); setAddModalOpen(true); }} type="button"><Plus size={16} />Add Sales</button>
        <label className="file-button secondary">CSV Import<input accept=".csv,text/csv" key={importFileKey} onChange={(event) => importSales(event.target.files?.[0])} type="file" /></label>
      </div>
      {status && <div className="invoice-status info">{status}</div>}
      {pendingImport.length > 0 && (
        <div className="import-review">
          <div className="panel-head"><h2>Review sales import</h2><span>{pendingImport.length} row(s)</span></div>
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "department", label: "Sales type" },
              { key: "grossSales", label: "Gross", render: money },
              { key: "sales", label: "Net", render: money },
              { key: "vatAmount", label: "VAT", render: (_, row) => money(vatAmountFromGrossNet(row.grossSales, row.sales)) },
            ]}
            rows={pendingImport}
          />
          <div className="button-row left">
            <button onClick={confirmImport} type="button"><Save size={16} />Confirm Import</button>
            <button className="ghost danger" onClick={cancelImport} type="button"><X size={16} />Cancel Import</button>
          </div>
        </div>
      )}
      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "department", label: "Sales type" },
          { key: "grossSales", label: "Gross Sales", render: (value) => money(value) },
          { key: "sales", label: "Net Sales", render: (_, row) => money(netSalesForRow(row)) },
          { key: "vatAmount", label: "VAT Amount", render: (_, row) => money(vatAmountFromGrossNet(row.grossSales, row.sales)) },
          { key: "effectiveVatRate", label: "Effective VAT %", render: (_, row) => percent(effectiveVatRate(row.grossSales, row.sales)) },
          { key: "serviceCharge", label: "Service Charge", render: (value) => money(value) },
          { key: "discounts", label: "Discounts", render: (value) => money(value) },
          { key: "refunds", label: "Refunds", render: (value) => money(value) },
        ]}
        onDelete={(id) => requestDelete({ title: "Delete sales record", message: "Are you sure you want to delete this sales record?", onConfirm: () => setSales((current) => current.filter((row) => row.id !== id)) })}
        onEdit={(row) => {
          setForm({ date: row.date, department: row.department || "Total", grossSales: row.grossSales ?? row.sales, sales: row.sales ?? 0, vatRate: row.vatRate ?? defaultVatRate, discounts: row.discounts ?? 0, refunds: row.refunds ?? 0, serviceCharge: row.serviceCharge ?? 0 });
          setEditingId(row.id);
          setEditModalOpen(true);
        }}
        rows={sales}
      />
      {addModalOpen && (
        <SalesEditModal departmentOptions={departmentOptions} form={form} formEffectiveVat={formEffectiveVat} formVatAmount={formVatAmount} onCancel={() => { setAddModalOpen(false); setForm(empty); }} onSave={saveSale} salesMode={salesMode} setForm={setForm} setSalesMode={setSalesMode} title="Add sales" updateGross={updateGross} updateVatRate={updateVatRate} />
      )}
      {editModalOpen && (
        <SalesEditModal departmentOptions={departmentOptions} form={form} formEffectiveVat={formEffectiveVat} formVatAmount={formVatAmount} onCancel={() => { setEditModalOpen(false); setEditingId(""); setForm(empty); }} onSave={saveSale} salesMode={salesMode} setForm={setForm} setSalesMode={setSalesMode} title="Edit sales record" updateGross={updateGross} updateVatRate={updateVatRate} />
      )}
    </Panel>
  );
}

function GpAnalysis({ dateRange, dateRangeState, departmentNames, financialSettings, requestDelete, sales, setDateRangeState, setSales }) {
  const salesTotals = totalSalesRows(sales, dateRange);

  return (
    <>
      <Panel title="Sales date range" action={rangeLabel(dateRangeState, dateRange)}>
        <DateRangeControls dateRangeState={dateRangeState} setDateRangeState={setDateRangeState} />
      </Panel>
      <div className="metric-grid compact">
        <Metric label="Gross Sales" value={money(salesTotals.grossSales)} delta={rangeLabel(dateRangeState, dateRange)} />
        <Metric label="Net Sales" value={money(salesTotals.netSales)} delta="Stored from POS/manual entry" />
        <Metric label="VAT Amount" value={money(salesTotals.vat)} delta={percent(effectiveVatRate(salesTotals.grossSales, salesTotals.netSales))} />
        <Metric label="Average daily sales" value={money(salesTotals.averageDailySales)} delta={`${dateRangeLength(dateRange)} day(s)`} />
      </div>
      <SalesManager financialSettings={financialSettings} departmentNames={departmentNames} requestDelete={requestDelete} sales={sales} setSales={setSales} />
      <SalesComparison financialSettings={financialSettings} sales={sales} />
    </>
  );
}

function SalesComparison({ financialSettings, sales }) {
  const [mode, setMode] = useState("Today vs Yesterday");
  const [currentCustom, setCurrentCustom] = useState(resolveDateRange({ preset: "This Week" }, financialSettings.weekStartsOn));
  const [previousCustom, setPreviousCustom] = useState(resolveDateRange({ preset: "Last Week" }, financialSettings.weekStartsOn));
  const { current, previous } = salesComparisonRanges(mode, currentCustom, previousCustom, financialSettings.weekStartsOn);
  const currentTotals = totalSalesRows(sales, current);
  const previousTotals = totalSalesRows(sales, previous);
  const hasData = currentTotals.rows.length || previousTotals.rows.length;

  return (
    <Panel title="Sales comparison" action={`${formatRangeDate(current.start)} - ${formatRangeDate(current.end)}`}>
      <div className="form-grid six compact-form">
        <label>Compare<select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option>Today vs Yesterday</option>
          <option>Today vs Last Week</option>
          <option>This Week vs Last Week</option>
          <option>This Month vs Last Month</option>
          <option>Custom Period vs Custom Period</option>
        </select></label>
        {mode === "Custom Period vs Custom Period" && (
          <>
            <Field label="Current from" type="date" value={currentCustom.start} onChange={(value) => setCurrentCustom((range) => ({ ...range, start: value }))} />
            <Field label="Current to" type="date" value={currentCustom.end} onChange={(value) => setCurrentCustom((range) => ({ ...range, end: value }))} />
            <Field label="Compare from" type="date" value={previousCustom.start} onChange={(value) => setPreviousCustom((range) => ({ ...range, start: value }))} />
            <Field label="Compare to" type="date" value={previousCustom.end} onChange={(value) => setPreviousCustom((range) => ({ ...range, end: value }))} />
          </>
        )}
      </div>
      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <div className="metric-grid compact">
            <Metric label="Gross Sales difference" value={percent(changePercent(currentTotals.grossSales, previousTotals.grossSales))} delta={`${money(currentTotals.grossSales)} vs ${money(previousTotals.grossSales)}`} tone={currentTotals.grossSales >= previousTotals.grossSales ? "good" : "warn"} />
            <Metric label="Net Sales difference" value={percent(changePercent(currentTotals.netSales, previousTotals.netSales))} delta={`${money(currentTotals.netSales)} vs ${money(previousTotals.netSales)}`} tone={currentTotals.netSales >= previousTotals.netSales ? "good" : "warn"} />
            <Metric label="Average daily sales" value={money(currentTotals.averageDailySales)} delta={`${money(previousTotals.averageDailySales)} comparison`} tone={currentTotals.averageDailySales >= previousTotals.averageDailySales ? "good" : "warn"} />
            <Metric label="VAT difference" value={percent(changePercent(currentTotals.vat, previousTotals.vat))} delta={`${money(currentTotals.vat)} vs ${money(previousTotals.vat)}`} tone={currentTotals.vat <= previousTotals.vat ? "good" : "warn"} />
          </div>
          <div className="dashboard-layout secondary">
            <SalesComparisonBars title="Gross Sales comparison" current={currentTotals.grossSales} previous={previousTotals.grossSales} currentRange={current} previousRange={previous} />
            <SalesComparisonBars title="Net Sales comparison" current={currentTotals.netSales} previous={previousTotals.netSales} currentRange={current} previousRange={previous} />
          </div>
        </>
      )}
    </Panel>
  );
}

function SalesComparisonBars({ title, current, previous, currentRange, previousRange }) {
  const max = Math.max(numberValue(current), numberValue(previous), 1);
  return (
    <div className="comparison-chart" aria-label={title}>
      <div className="comparison-title">{title}</div>
      <div className="comparison-bars">
        <div className="comparison-bar">
          <span style={{ height: `${(numberValue(previous) / max) * 100}%` }} title={`${formatRangeDate(previousRange.start)} - ${formatRangeDate(previousRange.end)}: ${money(previous)}`} />
          <strong>{money(previous)}</strong>
          <small>Comparison</small>
        </div>
        <div className="comparison-bar current">
          <span style={{ height: `${(numberValue(current) / max) * 100}%` }} title={`${formatRangeDate(currentRange.start)} - ${formatRangeDate(currentRange.end)}: ${money(current)}`} />
          <strong>{money(current)}</strong>
          <small>Selected</small>
        </div>
      </div>
    </div>
  );
}

function SalesEditModal({ departmentOptions, form, formEffectiveVat, formVatAmount, onCancel, onSave, salesMode, setForm, setSalesMode, title, updateGross, updateVatRate }) {
  const changeMode = (mode) => {
    setSalesMode(mode);
    if (mode === "Calculate Net from VAT") {
      setForm((current) => ({ ...current, sales: netFromGross(current.grossSales, current.vatRate) }));
    }
  };

  return (
    <EditModal title={title} onCancel={onCancel} onSave={onSave} saveLabel="Save Sales">
      <div className="form-grid six">
        <label>Mode<select value={salesMode} onChange={(event) => changeMode(event.target.value)}><option>Gross + Net</option><option>Calculate Net from VAT</option><option>Manual Net</option></select></label>
        <Field label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <label>Sales type<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departmentOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <Field label="Gross sales" type="number" value={form.grossSales} onChange={updateGross} />
        <Field label="VAT %" type="number" value={form.vatRate} onChange={updateVatRate} />
        <Field label="Net sales" type="number" value={form.sales} onChange={(value) => setForm({ ...form, sales: value })} readOnly={salesMode === "Calculate Net from VAT"} />
        <Field label="VAT amount" type="number" readOnly value={formVatAmount} />
        <Field label="Effective VAT %" type="number" readOnly value={formEffectiveVat.toFixed(2)} />
        <Field label="Service charge" type="number" value={form.serviceCharge} onChange={(value) => setForm({ ...form, serviceCharge: value })} />
        <Field label="Discounts" type="number" value={form.discounts} onChange={(value) => setForm({ ...form, discounts: value })} />
        <Field label="Refunds" type="number" value={form.refunds} onChange={(value) => setForm({ ...form, refunds: value })} />
      </div>
    </EditModal>
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
  requestDelete,
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

  const departmentCsv = ["Department,Type,Target GP,Active", ...departmentSettings.map((department) => `${department.name},${department.type},${department.targetGp},${department.active ? "Active" : "Inactive"}`)].join("\n");
  const genericSalesTemplate = "Date,Sales Type,Gross Sales,Net Sales,VAT Amount,Service Charge,Discounts,Refunds\n2026-06-10,Kitchen Made,2053.75,1821.49,232.26,0,0,0";
  const squareSalesTemplate = "Date,Category,Gross Sales,Net Sales,Tax,Service Charge,Discounts,Refunds\n2026-06-10,Square Food - Make in,2053.75,1821.49,232.26,0,0,0";
  const lightspeedSalesTemplate = "Date,Category,Gross,Net,Tax,Service Charge,Discounts,Refunds\n2026-06-10,Food,2053.75,1821.49,232.26,0,0,0";

  const exportFullBackup = () => {
    const payload = buildFullBackupPayload();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadJsonFile(`marginflow-full-backup-${stamp}.json`, payload);
    setDataStatus(`Exported ${Object.keys(payload.localStorage).length} MarginFlow localStorage key(s).`);
  };

  const importFullBackup = async (file) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const backupStorage = extractBackupLocalStorage(payload);
      const entries = Object.entries(backupStorage).filter(([key]) => key.startsWith("marginflow."));
      if (!entries.length) {
        setDataStatus("Import failed. This file does not contain MarginFlow localStorage keys.");
        return;
      }
      const confirmed = window.confirm(`Import Full Backup will replace ${entries.length} existing MarginFlow browser data key(s) with values from this file. This does not clear other browser data. Continue?`);
      if (!confirmed) {
        setDataStatus("Full backup import cancelled.");
        return;
      }
      entries.forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      setDataStatus(`Imported ${entries.length} MarginFlow localStorage key(s). Reloading app...`);
      window.setTimeout(() => window.location.reload(), 350);
    } catch {
      setDataStatus("Import failed. Choose a valid MarginFlow full backup JSON file.");
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

      <Panel title="POS & Sales Setup">
        <div className="form-grid six">
          <label>POS Provider<select value={financialSettings.posProvider || defaultFinancialSettings.posProvider} onChange={(event) => updateFinancial("posProvider", event.target.value)}>{["Square", "Lightspeed", "EPOS Now", "Toast", "Zettle", "Other / Manual"].map((provider) => <option key={provider}>{provider}</option>)}</select></label>
          <label>Sales input method<select value={financialSettings.salesInputMethod || defaultFinancialSettings.salesInputMethod} onChange={(event) => updateFinancial("salesInputMethod", event.target.value)}><option>Manual Gross + Net Sales</option><option>Auto-calculate Net Sales from VAT %</option><option>CSV/POS import</option></select></label>
          <label>Sales Data Mode<select value={financialSettings.salesDataMode || defaultFinancialSettings.salesDataMode} onChange={(event) => updateFinancial("salesDataMode", event.target.value)}><option>Gross + Net from POS</option><option>Calculate Net from VAT %</option><option>Manual Net Sales</option></select></label>
          <label>GP calculation base<select value={financialSettings.gpCalculationBase || defaultFinancialSettings.gpCalculationBase} onChange={(event) => updateFinancial("gpCalculationBase", event.target.value)}><option>Net Sales</option><option>Gross Sales</option></select></label>
          <label>Date column<input value={financialSettings.csvDateColumn || "Date"} onChange={(event) => updateFinancial("csvDateColumn", event.target.value)} /></label>
          <label>Category / Sales type column<input value={financialSettings.csvCategoryColumn || "Category"} onChange={(event) => updateFinancial("csvCategoryColumn", event.target.value)} /></label>
          <label>Gross Sales column<input value={financialSettings.csvGrossColumn || "Gross Sales"} onChange={(event) => updateFinancial("csvGrossColumn", event.target.value)} /></label>
          <label>Net Sales column<input value={financialSettings.csvNetColumn || "Net Sales"} onChange={(event) => updateFinancial("csvNetColumn", event.target.value)} /></label>
          <label>VAT / Tax column<input value={financialSettings.csvVatColumn || "Tax"} onChange={(event) => updateFinancial("csvVatColumn", event.target.value)} /></label>
          <label>Service Charge column<input value={financialSettings.csvServiceColumn || "Service Charge"} onChange={(event) => updateFinancial("csvServiceColumn", event.target.value)} /></label>
          <label>Discounts column<input value={financialSettings.csvDiscountColumn || "Discounts"} onChange={(event) => updateFinancial("csvDiscountColumn", event.target.value)} /></label>
          <label>Refunds column<input value={financialSettings.csvRefundColumn || "Refunds"} onChange={(event) => updateFinancial("csvRefundColumn", event.target.value)} /></label>
          <label>Food category maps to<select value={financialSettings.foodCategoryDepartment || "Kitchen Made"} onChange={(event) => updateFinancial("foodCategoryDepartment", event.target.value)}>{defaultDepartments.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
          <label>Drinks category maps to<select value={financialSettings.drinksCategoryDepartment || "Bar"} onChange={(event) => updateFinancial("drinksCategoryDepartment", event.target.value)}>{defaultDepartments.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
        </div>
      </Panel>

      <Panel title="CSV Templates / Import Guide">
        <div className="button-row left">
          <a className="file-button secondary" download="marginflow-sales-generic-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(genericSalesTemplate)}`}>Generic CSV Template</a>
          <a className="file-button secondary" download="marginflow-square-sales-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(squareSalesTemplate)}`}>Square CSV Template</a>
          <a className="file-button secondary" download="marginflow-lightspeed-sales-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(lightspeedSalesTemplate)}`}>Lightspeed CSV Template</a>
        </div>
        <div className="code-card">
          <p>Required columns: Date, Sales Type or Category, Gross Sales and Net Sales. Optional columns: VAT/Tax, Service Charge, Discounts, Refunds and Quantity or Items Sold.</p>
          <p>Accepted dates should use ISO format such as 2026-06-10. POS categories can be mapped to MarginFlow departments in POS & Sales Setup.</p>
          <p>CSV imports load into a review state first. Use Confirm Import to save, or Cancel Import to clear temporary rows without changing saved records.</p>
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
          onDelete={(id) => requestDelete({ title: "Delete department", message: "Are you sure you want to delete this department?", onConfirm: () => setDepartmentSettings(departmentSettings.filter((department) => department.id !== id)) })}
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
          <button onClick={exportFullBackup} type="button"><Save size={16} />Export Full Backup</button>
          <label className="file-button secondary">Import Full Backup<input accept="application/json,.json" onChange={(event) => importFullBackup(event.target.files?.[0])} type="file" /></label>
          <a className="file-button secondary" download="marginflow-departments.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(departmentCsv)}`}>Export CSV</a>
          <button className="ghost" onClick={resetDemoSettings} type="button">Reset demo data</button>
        </div>
        {dataStatus && <div className="invoice-status info">{dataStatus}</div>}
      </Panel>
    </div>
  );
}

function DataTable({ columns, rows, onEdit, onDelete, toolbarAction }) {
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
        {toolbarAction}
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

function DeleteConfirmationModal({ title, message, onCancel, onDelete }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="split-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p>{message}</p>
          </div>
          <button className="icon" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        <div className="button-row left">
          <button className="ghost" onClick={onCancel} type="button">Cancel</button>
          <button className="ghost danger" onClick={onDelete} type="button">Delete</button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ title, children, onCancel, onSave, saveLabel = "Save Changes" }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="split-modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p>Review details before saving changes.</p>
          </div>
          <button className="icon" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        {children}
        <div className="button-row left">
          <button className="ghost" onClick={onCancel} type="button">Cancel</button>
          <button onClick={onSave} type="button"><Save size={16} />{saveLabel}</button>
        </div>
      </div>
    </div>
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

function EmptyState() {
  return <div className="empty-state">No data available for this selected period.</div>;
}

function DailyGpChart({ rows, targetGp }) {
  const validRows = rows.filter((row) => row.netSales || row.purchases || row.waste);
  if (!validRows.length) return <EmptyState />;
  const values = validRows.flatMap((row) => [row.invoiceGp, targetGp]);
  const min = Math.min(0, ...values);
  const max = Math.max(100, ...values);
  const y = (value) => 90 - (((numberValue(value) - min) / Math.max(max - min, 1)) * 78);
  const x = (index) => 8 + (index / Math.max(validRows.length - 1, 1)) * 84;
  const points = validRows.map((row, index) => ({ x: x(index), y: y(row.invoiceGp) }));
  const smoothPath = points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlOffset = (point.x - previous.x) / 2;
    return `${path} C ${previous.x + controlOffset} ${previous.y}, ${point.x - controlOffset} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const areaPath = points.length
    ? `${smoothPath} L ${points.at(-1).x} 92 L ${points[0].x} 92 Z`
    : "";
  const targetY = y(targetGp);

  return (
    <div className="performance-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gpLineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <linearGradient id="gpAreaGradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path className="gp-area" d={areaPath} fill="url(#gpAreaGradient)" />}
        <line className="target-line" x1="8" x2="92" y1={targetY} y2={targetY} />
        <path className="actual-line smooth-line" d={smoothPath} stroke="url(#gpLineGradient)" />
        {validRows.map((row, index) => (
          <circle className="chart-point" cx={x(index)} cy={y(row.invoiceGp)} key={row.id} r="1.6">
            <title>{`${row.date}\nGross Sales: ${money(row.grossSales)}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nGP: ${percent(row.invoiceGp)}\nVariance vs target: ${percent(row.invoiceGp - targetGp)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-legend"><span><i className="legend-actual" />Actual GP %</span><span><i className="legend-target" />Target GP %</span></div>
      <div className="chart-labels dynamic" style={{ gridTemplateColumns: `repeat(${validRows.length}, 1fr)` }}>{validRows.map((row) => <span key={row.id}>{formatRangeDate(row.date)}</span>)}</div>
    </div>
  );
}

function SalesPurchasesChart({ rows }) {
  const validRows = rows.filter((row) => row.netSales || row.purchases);
  if (!validRows.length) return <EmptyState />;
  const max = Math.max(...validRows.flatMap((row) => [row.netSales, row.purchases]), 1);

  return (
    <div className="grouped-bars">
      {validRows.map((row) => (
        <div className="grouped-bar" key={row.id}>
          <div className="group-track">
            <span className="sales-bar" style={{ height: `${(row.netSales / max) * 100}%` }} title={`${row.date}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nDifference: ${money(row.netSales - row.purchases)}`} />
            <span className="purchase-bar" style={{ height: `${(row.purchases / max) * 100}%` }} title={`${row.date}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nDifference: ${money(row.netSales - row.purchases)}`} />
          </div>
          <small>{formatRangeDate(row.date)}</small>
        </div>
      ))}
      <div className="chart-legend"><span><i className="legend-sales" />Net Sales</span><span><i className="legend-purchases" />Purchases</span></div>
    </div>
  );
}

function DepartmentBreakdown({ rows }) {
  const visibleRows = rows.filter((row) => row.grossSales || row.netSales || row.purchases || row.waste);
  const chartRows = visibleRows.length ? visibleRows : rows;
  const max = Math.max(...chartRows.map((row) => Math.abs(row.gp)), 1);
  if (!visibleRows.length) return <EmptyState />;

  return (
    <div className="breakdown-layout">
      <div className="donut-list compact">
        {chartRows.map((row) => (
          <div key={row.department} title={`${displayDepartmentName(row.department)}: GP ${percent(row.gp)}, target ${percent(row.targetGp)}, variance ${percent(row.variance)}`}>
            <span>{displayDepartmentName(row.department)}</span>
            <strong>{percent(row.gp)}</strong>
            <i style={{ width: `${Math.min(100, (Math.abs(row.gp) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="table-wrap compact-table">
        <table>
          <thead><tr>{["Department", "Gross Sales", "Net Sales", "Purchases", "Waste", "GP %", "Target GP %", "Variance"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.department}>
                <td>{displayDepartmentName(row.department)}</td>
                <td>{money(row.grossSales)}</td>
                <td>{money(row.netSales)}</td>
                <td>{money(row.purchases)}</td>
                <td>{money(row.waste)}</td>
                <td>{percent(row.gp)}</td>
                <td>{percent(row.targetGp)}</td>
                <td><Badge tone={row.variance >= 0 ? "green" : row.variance > -5 ? "amber" : "red"}>{percent(row.variance)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierSpendChart({ rows, total }) {
  const visibleRows = rows.filter((row) => row.spend > 0);
  if (!visibleRows.length) return <EmptyState />;
  const max = Math.max(...visibleRows.map((row) => row.spend), 1);
  return (
    <div className="donut-list">
      {visibleRows.map((row) => {
        const share = total ? (row.spend / total) * 100 : 0;
        return (
          <div key={row.id || row.name} title={`${row.name}\nSpend: ${money(row.spend)}\n${percent(share)} of total purchases`}>
            <span>{row.name}</span>
            <strong>{money(row.spend)} · {percent(share)}</strong>
            <i style={{ width: `${(row.spend / max) * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function DailyGpTable({ rows }) {
  const visibleRows = rows.filter((row) => row.grossSales || row.netSales || row.purchases || row.waste);
  if (!visibleRows.length) return <EmptyState />;
  return (
    <DataTable
      columns={[
        { key: "date", label: "Date" },
        { key: "grossSales", label: "Gross Sales", render: (value) => money(value) },
        { key: "netSales", label: "Net Sales", render: (value) => money(value) },
        { key: "purchases", label: "Purchases", render: (value) => money(value) },
        { key: "waste", label: "Waste", render: (value) => money(value) },
        { key: "invoiceGp", label: "Invoice GP %", render: (value) => percent(value) },
        { key: "stocktakeGp", label: "Stocktake GP %", render: (value) => percent(value) },
        { key: "realGp", label: "Real GP including waste", render: (value) => percent(value) },
      ]}
      rows={visibleRows}
    />
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
