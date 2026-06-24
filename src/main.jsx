import React, { useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  ChefHat,
  Edit3,
  Eye,
  Gauge,
  Home,
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
  Users,
  X,
} from "lucide-react";
import { labourImportedSeed } from "./labourSeedData.js";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const invoiceLineStatuses = ["Received", "Missing", "Damaged", "Sent back", "Not ordered", "Credit note received"];
const creditNoteStatuses = ["To chase", "Chased", "Credit received", "Rejected"];
const emptyInvoiceDraft = () => ({
  files: [],
  invoiceText: "",
  items: [],
  supplier: "",
  date: today(),
  invoiceNumber: "",
  subtotalBeforeDiscount: 0,
  discountAmount: 0,
  discountPercent: 0,
  finalInvoiceTotal: 0,
  status: "Idle",
  editingInvoiceId: "",
});
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
  appMode: "Work Edition: Non-AI",
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

const defaultLabourSettings = {
  targetLabourPercent: 32,
  weeklyView: true,
  bohServiceChargePercent: 40,
  fohServiceChargePercent: 60,
  includeServiceChargeInLabourCost: false,
  excludeFreelanceFromTronc: true,
  defaultHolidayEntitlementDays: 28,
  holidayYearStartMonth: "November",
};

const defaultMatchingSettings = {
  enableProductMatching: true,
  autoMatchConfidenceThreshold: 90,
  requireManualApprovalBelowThreshold: true,
  productMatchingSensitivity: "Medium",
};

const defaultAiSettings = {
  enableAiInvoiceReading: true,
  enableAiProductMatching: true,
  autoMatchConfidenceThreshold: 90,
  requireManualApprovalBelowThreshold: true,
  productMatchingSensitivity: "Medium",
};

const appModes = ["Work Edition: Non-AI", "Pro Edition: AI optional"];

const supplierParserCatalog = [
  { name: "TG Fruits", aliases: ["tg fruits"], status: "Supported" },
  { name: "Coburn & Baker", aliases: ["coburn", "coburn baker"], status: "Supported" },
  { name: "Albion Fine Foods", aliases: ["albion fine foods", "albion"], status: "Supported" },
  { name: "Woods", aliases: ["woods foodservice", "woods"], status: "Supported" },
  { name: "BNFS", aliases: ["bnfs", "brighton newhaven fish", "brighton & newhaven fish"], status: "Supported" },
  { name: "Cheeseman", aliases: ["cheeseman", "cheese man"], status: "Supported" },
  { name: "Ashley James Meat Co", aliases: ["ashley james"], status: "Supported" },
  { name: "Real Patisserie", aliases: ["real patisserie"], status: "Supported" },
  { name: "Lady of the Cakes", aliases: ["lady of the cakes"], status: "Supported" },
  { name: "Brighton Sausage Co", aliases: ["brighton sausage"], status: "Supported" },
];

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
  { id: "labour", label: "Labour", icon: Users },
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

function canonicalDepartmentName(value, fallback = "Kitchen Made") {
  const raw = String(value || fallback || "").trim();
  if (!raw) return fallback;
  const key = raw.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  if (["alldepartments", "all"].includes(key)) return "All departments";
  if (["total", "totalsales", "allvenue", "venue"].includes(key)) return "Total";
  if (key.includes("nonfood") || key.includes("excluded") || key.includes("cleaning") || key.includes("supplies")) return "Non-food";
  if (key.includes("boughtin") || key.includes("buyin") || key.includes("retail") || key.includes("grabandgo")) return "Bought In";
  if (
    key.includes("bar") ||
    key.includes("drink") ||
    key.includes("beverage") ||
    key.includes("beer") ||
    key.includes("wine") ||
    key.includes("cocktail") ||
    key.includes("spirit") ||
    key.includes("liquor") ||
    key.includes("softdrink") ||
    key.includes("juice") ||
    key.includes("coffee") ||
    key.includes("tea")
  ) return "Bar";
  if (key.includes("kitchenmade") || key.includes("kitchen") || key.includes("food") || key.includes("brunch") || key.includes("breakfast") || key.includes("lunch") || key.includes("dinner")) return "Kitchen Made";
  return raw;
}

function canonicalSalesDepartmentName(value) {
  const department = canonicalDepartmentName(value, "Total");
  return ["Kitchen Made", "Bought In", "Bar", "Non-food", "Total"].includes(department) ? department : "Total";
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

function hasDepartmentSpecificSalesRows(salesRows) {
  return salesRows.some((row) => {
    const department = canonicalSalesDepartmentName(row.department);
    return department && department !== "Total";
  });
}

function grossLineTotal(item) {
  return (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
}

function lineTotal(item) {
  const original = grossLineTotal(item);
  const amount = numberValue(item.lineDiscountAmount ?? item.discountAmount, 0);
  const percent = numberValue(item.lineDiscountPercent ?? item.discountPercent, 0);
  if (amount > 0) return Math.max(0, original - Math.min(amount, original));
  if (percent > 0) return Math.max(0, original - Math.min((original * percent) / 100, original));
  return original;
}

function invoiceLineStatus(item) {
  const status = item?.lineStatus || item?.status;
  return invoiceLineStatuses.includes(status) ? status : "Received";
}

function isReceivedInvoiceLine(item) {
  return invoiceLineStatus(item) === "Received";
}

function originalLineTotal(item) {
  return grossLineTotal(item);
}

function lineLevelDiscount(item) {
  const original = originalLineTotal(item);
  const amount = numberValue(item.lineDiscountAmount ?? item.discountAmount, 0);
  const percentAmount = original * (numberValue(item.lineDiscountPercent ?? item.discountPercent, 0) / 100);
  const discount = amount > 0 ? amount : percentAmount;
  return Number(Math.min(original, Math.max(0, discount)).toFixed(2));
}

function lineAfterLineDiscount(item) {
  return Math.max(0, originalLineTotal(item) - lineLevelDiscount(item));
}

function receivedLineSubtotal(items = []) {
  return items.filter(isReceivedInvoiceLine).reduce((sum, item) => sum + lineAfterLineDiscount(item), 0);
}

function invoiceDiscountAmount(invoice = {}) {
  const subtotal = receivedLineSubtotal(invoice.items || []);
  const explicitAmount = numberValue(invoice.discountAmount, 0);
  const percentAmount = subtotal * (numberValue(invoice.discountPercent, 0) / 100);
  const discount = explicitAmount > 0 ? explicitAmount : percentAmount;
  return Number(Math.min(subtotal, Math.max(0, discount)).toFixed(2));
}

function invoiceSubtotalBeforeDiscount(invoice = {}) {
  return (invoice.items || []).filter(isReceivedInvoiceLine).reduce((sum, item) => sum + originalLineTotal(item), 0);
}

function proportionalInvoiceDiscount(item, invoice = {}) {
  if (!isReceivedInvoiceLine(item)) return 0;
  const subtotalAfterLineDiscount = receivedLineSubtotal(invoice.items || []);
  if (!subtotalAfterLineDiscount) return 0;
  const share = lineAfterLineDiscount(item) / subtotalAfterLineDiscount;
  return Number((invoiceDiscountAmount(invoice) * share).toFixed(2));
}

function discountAppliedToLine(item, invoice = {}) {
  return Number((lineLevelDiscount(item) + proportionalInvoiceDiscount(item, invoice)).toFixed(2));
}

function netLineTotal(item, invoice = {}) {
  if (!isReceivedInvoiceLine(item)) return 0;
  const net = originalLineTotal(item) - discountAppliedToLine(item, invoice);
  return Number(Math.max(0, net).toFixed(2));
}

function invoiceFinalTotal(invoice = {}) {
  return (invoice.items || []).reduce((sum, item) => sum + netLineTotal(item, invoice), 0);
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
  const packPattern = /\b(?:(?:x|\*)\s*\d+|\d+(?:[.,]\d+)?\s?(?:x|\*)\s*\d+(?:[.,]\d+)?\s?(?:KG|G|M|CM|LTR|L|ML|CL|OZ|LB)|X?\d+(?:[.,]\d+)?\s?(?:KG|G|M|CM|LTR|L|ML|CL|OZ|LB)|KILO|BOX(?:\s+[A-Z0-9]+)?|BAG|PUNNET|PNT(?:\s+SINGLE)?|SINGLE(?:\s+(?:KG|MED))?|BUNCH(?:\s*\([^)]+\))?|CASE|EACH|PACK|TRAY|BTL|TIN|CAN)\b/i;
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

function cleanInvoicePackSize(packSize = "") {
  return packSize.replace(/\s+\d+(?:\s+\d+)*$/g, "").replace(/\s+/g, " ").trim();
}

function cleanInvoiceProductName(productName = "") {
  return productName
    .replace(/^web\s+ref\.?\s*\d*\s*/i, "")
    .replace(/^(?:ambient|chilled|frozen|fresh produce)\s+/i, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCurrencyProductRow(rowText) {
  const row = rowText.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  const match = row.match(/^(.+?)\s+£?\s*(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+£?\s*(\d+(?:[.,]\d{2}))(?:\s|$)/i);
  if (!match) return null;
  const [, descriptionRaw, unitRaw, orderQtyRaw, invoicedQtyRaw, totalRaw] = match;
  const unitCost = numberValue(unitRaw.replace(",", "."), 0);
  const quantity = numberValue(invoicedQtyRaw.replace(",", "."), numberValue(orderQtyRaw.replace(",", "."), 1));
  const lineTotalValue = numberValue(totalRaw.replace(",", "."), 0);
  if (!unitCost || !quantity || !lineTotalValue || !amountsAlmostEqual(quantity * unitCost, lineTotalValue)) return null;
  const { productName, packSize } = splitInvoiceProductAndPack(descriptionRaw);
  const cleanProduct = cleanInvoiceProductName(productName);
  if (!/[A-Za-z]{2}/.test(cleanProduct)) return null;
  return {
    productName: cleanProduct,
    packSize: cleanInvoicePackSize(packSize),
    quantity,
    unitCost,
    lineTotal: lineTotalValue,
  };
}

function parseCodeLeadingInvoiceRow(rowText) {
  const row = rowText.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  const match = row.match(/^[A-Z0-9/.-]{3,}\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  if (!match) return null;
  const quantity = numberValue(match[1].replace(",", "."), 0);
  const body = match[2];
  const moneyMatches = [...body.matchAll(/(?:^|\s)(\d+(?:[.,]\d{2}))(?=\s|$)/g)];
  if (!quantity || moneyMatches.length < 2) return null;
  const unitCost = numberValue(moneyMatches[moneyMatches.length - 2][1].replace(",", "."), 0);
  const lineTotalValue = numberValue(moneyMatches[moneyMatches.length - 1][1].replace(",", "."), 0);
  if (!unitCost || !lineTotalValue || !amountsAlmostEqual(quantity * unitCost, lineTotalValue)) return null;
  const descriptionRaw = body.slice(0, moneyMatches[moneyMatches.length - 2].index).trim();
  const { productName, packSize } = splitInvoiceProductAndPack(descriptionRaw);
  const cleanProduct = cleanInvoiceProductName(productName);
  if (!/[A-Za-z]{2}/.test(cleanProduct) || /^(invoice|total|account|payment|operator)$/i.test(cleanProduct)) return null;
  return {
    productName: cleanProduct,
    packSize: cleanInvoicePackSize(packSize),
    quantity,
    unitCost,
    lineTotal: lineTotalValue,
  };
}

function parseAlbionOrderRows(invoiceText) {
  const normalized = invoiceText
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+Albion Fine Foods.*?\b\d+\/\d+\b/gi, " ")
    .replace(/Web Ref\.?\s*\d+\s*Invoice No\.?\s*\d+/gi, " ")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+Albion Fine Foods/gi, " ")
    .replace(/\b\d+\/\d+\b/g, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const headerMatch = normalized.match(/PRODUCT\s+UNIT PRICE\s+ORDER QTY\s+INVOICED QTY\s+SUBTOTAL\s+(.+)/i);
  const tableText = headerMatch?.[1] || normalized;
  const beforeFooter = tableText.split(/\s+SUBTOTAL\s+£?\d/i)[0] || tableText;
  const rowPattern = /([A-Za-z][A-Za-z0-9 '&(),./+-]{2,}?)\s+((?:x|\*)\s*\d+|\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL|OZ|LB)|EACH|EA)\s+£?\s*(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+£?\s*(\d+(?:[.,]\d{2}))/gi;
  const rows = [];
  let match;

  while ((match = rowPattern.exec(beforeFooter))) {
    const [, productRaw, packRaw, unitRaw, , invoicedQtyRaw, totalRaw] = match;
    const quantity = numberValue(invoicedQtyRaw.replace(",", "."), 0);
    const unitCost = numberValue(unitRaw.replace(",", "."), 0);
    const lineTotalValue = numberValue(totalRaw.replace(",", "."), 0);
    const productName = cleanInvoiceProductName(productRaw);
    if (!productName || !quantity || !unitCost || !lineTotalValue || !amountsAlmostEqual(quantity * unitCost, lineTotalValue)) continue;
    rows.push({
      productName,
      packSize: cleanInvoicePackSize(packRaw),
      quantity,
      unitCost,
      lineTotal: lineTotalValue,
    });
  }

  return rows;
}

function extractGenericInvoiceRows(invoiceText) {
  const text = invoiceText.replace(/\r/g, "\n");
  const normalized = text.replace(/\s+/g, " ");
  const candidates = new Set();

  text.split(/\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed) candidates.add(trimmed);
  });

  const currencyPattern = /([A-Za-z][A-Za-z0-9 '&().,/+-]{3,}?\s+£?\s*\d+(?:[.,]\d{2})\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s+£?\s*\d+(?:[.,]\d{2}))/g;
  [...normalized.matchAll(currencyPattern)].forEach((match) => candidates.add(match[1].trim()));

  const codePattern = /(?:^|\s)([A-Z0-9/.-]{3,}\s+\d+(?:[.,]\d+)?\s+[A-Za-z][A-Za-z0-9 '&().,/+-]{4,}?\s+\d+(?:[.,]\d{2})\s+\d+(?:[.,]\d{2}))(?=\s+[A-Z0-9/.-]{3,}\s+\d+(?:[.,]\d+)?\s+[A-Za-z]|$)/g;
  [...normalized.matchAll(codePattern)].forEach((match) => candidates.add(match[1].trim()));

  const rows = [...candidates]
    .map((candidate) => parseCurrencyProductRow(candidate) || parseCodeLeadingInvoiceRow(candidate))
    .filter(Boolean);
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.productName}|${row.packSize}|${row.quantity}|${row.unitCost}|${row.lineTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  return [{ id: uid(), department: canonicalDepartmentName(department, "Kitchen Made"), percentage: 100 }];
}

function normalizeDepartmentSplits(item, fallbackDepartment = "Kitchen Made") {
  const source = Array.isArray(item.departmentSplits) && item.departmentSplits.length
    ? item.departmentSplits
    : defaultDepartmentSplits(item.department || fallbackDepartment);

  return source.map((split) => ({
    id: split.id || uid(),
    department: canonicalDepartmentName(split.department, fallbackDepartment),
    percentage: numberValue(split.percentage, 0),
  }));
}

function departmentSplitTotal(item) {
  return normalizeDepartmentSplits(item, item.department).reduce((sum, split) => sum + numberValue(split.percentage), 0);
}

function splitIsValid(item) {
  return Math.abs(departmentSplitTotal(item) - 100) < 0.01;
}

function normalizedDepartmentSplits(item, departmentNames = defaultDepartments) {
  const netTotal = netLineTotal(
    { ...item, lineDiscountAmount: item.lineDiscountAmount ?? item.discountAmount, lineDiscountPercent: item.lineDiscountPercent ?? item.discountPercent },
    { items: [item], discountAmount: 0, discountPercent: 0 }
  );
  const source = Array.isArray(item.departmentSplits) && item.departmentSplits.length
    ? item.departmentSplits
    : [{ department: item.department || departmentNames[0] || "Kitchen Made", percentage: 100 }];
  return source.map((split) => {
    const percentage = numberValue(split.percentage, 0);
    return {
      department: split.department || departmentNames[0] || "Kitchen Made",
      percentage,
      amount: (netTotal * percentage) / 100,
    };
  });
}

function invoiceEditorNetLineTotal(item) {
  return lineTotal(item);
}

function clampLineDiscountAmount(amount, grossTotal) {
  return Number(Math.min(Math.max(numberValue(amount, 0), 0), Math.max(numberValue(grossTotal, 0), 0)).toFixed(2));
}

function clampLineDiscountPercent(percent) {
  return Number(Math.min(Math.max(numberValue(percent, 0), 0), 100).toFixed(2));
}

function syncInvoiceLineDiscounts(item, changedField = "") {
  const grossTotal = grossLineTotal(item);
  let discountAmount = numberValue(item.lineDiscountAmount ?? item.discountAmount, 0);
  let discountPercent = numberValue(item.lineDiscountPercent ?? item.discountPercent, 0);

  if (changedField === "lineDiscountAmount" || changedField === "discountAmount") {
    discountAmount = clampLineDiscountAmount(discountAmount, grossTotal);
    discountPercent = grossTotal ? Number(((discountAmount / grossTotal) * 100).toFixed(2)) : 0;
  } else if (changedField === "lineDiscountPercent" || changedField === "discountPercent") {
    discountPercent = clampLineDiscountPercent(discountPercent);
    discountAmount = Number((grossTotal * (discountPercent / 100)).toFixed(2));
  } else if (discountPercent > 0) {
    discountPercent = clampLineDiscountPercent(discountPercent);
    discountAmount = Number((grossTotal * (discountPercent / 100)).toFixed(2));
  } else {
    discountAmount = clampLineDiscountAmount(discountAmount, grossTotal);
    discountPercent = grossTotal ? Number(((discountAmount / grossTotal) * 100).toFixed(2)) : 0;
  }

  return {
    ...item,
    discountAmount,
    discountPercent,
    lineDiscountAmount: discountAmount,
    lineDiscountPercent: discountPercent,
  };
}

function withCalculatedSplitAmounts(item, departmentNames = defaultDepartments) {
  const netTotal = invoiceEditorNetLineTotal(item);
  const splits = normalizedDepartmentSplits(item, departmentNames).map((split) => ({
    ...split,
    amount: Number(((netTotal * numberValue(split.percentage, 0)) / 100).toFixed(2)),
  }));
  return {
    ...item,
    department: splits[0]?.department || item.department || departmentNames[0] || "Kitchen Made",
    departmentMode: splits.length > 1 ? "Split" : "Single",
    departmentSplits: splits,
  };
}

function normalizeInvoiceLineForEditor(item, departmentNames = defaultDepartments) {
  const status = invoiceLineStatus(item);
  const grossTotal = grossLineTotal(item);
  return withCalculatedSplitAmounts(syncInvoiceLineDiscounts({
    ...item,
    id: item.id || uid(),
    quantity: numberValue(item.quantity, 1),
    unitCost: numberValue(item.unitCost, 0),
    lineTotal: grossTotal,
    status,
    lineStatus: status,
  }), departmentNames);
}

function updateInvoiceLineForEditor(item, field, value, { products = [], matchingSettings = defaultMatchingSettings, departmentNames = defaultDepartments } = {}) {
  const numericFields = ["quantity", "unitCost", "discountAmount", "discountPercent", "lineDiscountAmount", "lineDiscountPercent"];
  const nextValue = numericFields.includes(field) ? numberValue(value, 0) : value;
  let updated = { ...item, [field]: nextValue };

  if (field === "quantity" || field === "unitCost") {
    updated.lineTotal = numberValue(updated.quantity, 0) * numberValue(updated.unitCost, 0);
  }

  if (field === "status" || field === "lineStatus") {
    updated.status = value;
    updated.lineStatus = value;
    updated.creditReason = value === "Received" ? "" : (updated.creditReason || value);
  }

  if (field === "department") {
    updated.department = value;
    updated.departmentMode = "Single";
    updated.departmentSplits = [{ id: uid(), department: value, percentage: 100 }];
  }

  if (field === "productName") {
    const enriched = enrichInvoiceLine(updated, products, matchingSettings);
    updated = { ...enriched, productName: value };
  }

  return normalizeInvoiceLineForEditor(syncInvoiceLineDiscounts(updated, field), departmentNames);
}

function setInvoiceLineDepartmentMode(item, mode, departmentNames = defaultDepartments, fallbackDepartment = "Kitchen Made") {
  if (mode === "Split") {
    const first = item.department || fallbackDepartment || departmentNames[0] || "Kitchen Made";
    const second = departmentNames.find((dept) => dept !== first) || first;
    return withCalculatedSplitAmounts({ ...item, departmentMode: "Split", departmentSplits: [
      { id: uid(), department: first, percentage: 50 },
      { id: uid(), department: second, percentage: 50 },
    ] }, departmentNames);
  }

  const department = item.department || normalizeDepartmentSplits(item, fallbackDepartment)[0]?.department || fallbackDepartment || departmentNames[0] || "Kitchen Made";
  return withCalculatedSplitAmounts({ ...item, departmentMode: "Single", department, departmentSplits: [{ id: uid(), department, percentage: 100 }] }, departmentNames);
}

function updateInvoiceLineSplit(item, splitIndex, field, value, departmentNames = defaultDepartments) {
  const splits = normalizedDepartmentSplits(item, departmentNames).map((split, index) => (
    index === splitIndex ? { ...split, [field]: field === "percentage" ? numberValue(value, 0) : value } : split
  ));
  return withCalculatedSplitAmounts({ ...item, departmentMode: "Split", departmentSplits: splits }, departmentNames);
}

function addInvoiceLineSplit(item, departmentNames = defaultDepartments) {
  const splits = [...normalizedDepartmentSplits(item, departmentNames), { id: uid(), department: departmentNames[0] || "Kitchen Made", percentage: 0 }];
  return withCalculatedSplitAmounts({ ...item, departmentMode: "Split", departmentSplits: splits }, departmentNames);
}

function removeInvoiceLineSplit(item, splitIndex, departmentNames = defaultDepartments, fallbackDepartment = "Kitchen Made") {
  const splits = normalizedDepartmentSplits(item, departmentNames).filter((_, index) => index !== splitIndex);
  if (splits.length <= 1) {
    const department = splits[0]?.department || item.department || fallbackDepartment || departmentNames[0] || "Kitchen Made";
    return setInvoiceLineDepartmentMode({ ...item, department }, "Single", departmentNames, department);
  }
  return withCalculatedSplitAmounts({ ...item, departmentMode: "Split", departmentSplits: splits }, departmentNames);
}

function emptyInvoiceLine(supplier = "", department = "Kitchen Made") {
  return {
    id: uid(),
    productName: "",
    packSize: "",
    quantity: 1,
    unitCost: 0,
    discountAmount: 0,
    discountPercent: 0,
    supplier,
    department,
    departmentMode: "Single",
    departmentSplits: [{ id: uid(), department, percentage: 100, amount: 0 }],
    status: "Received",
    lineStatus: "Received",
  };
}

function lineTotalForDepartment(item, selectedDepartment, invoice = {}) {
  const total = netLineTotal(item, invoice.items ? invoice : { items: [item], discountAmount: 0, discountPercent: 0 });
  if (selectedDepartment === "All departments") return total;
  return normalizeDepartmentSplits(item, item.department)
    .filter((split) => split.department === selectedDepartment)
    .reduce((sum, split) => sum + total * (numberValue(split.percentage) / 100), 0);
}

function primaryDepartment(item) {
  return normalizeDepartmentSplits(item, item.department)[0]?.department || item.department || "Kitchen Made";
}

function invoiceTotal(invoice) {
  return invoiceFinalTotal(invoice);
}

function departmentMatches(rowDepartment, selectedDepartment) {
  const selected = canonicalDepartmentName(selectedDepartment, "All departments");
  return selected === "All departments" || canonicalDepartmentName(rowDepartment, "") === selected;
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
  return { product: best.product, confidence: Math.min(0.89, 0.55 + best.score * 0.42), method: "Similarity match" };
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

function enrichInvoiceLine(line, products, matchingSettings = defaultMatchingSettings) {
  const matchingEnabled = matchingSettings.enableProductMatching ?? matchingSettings.enableAiProductMatching ?? true;
  if (!matchingEnabled) {
    return { ...line, matchConfidence: 0, matchStatus: "Product matching disabled", matchedProductId: "", suggestedProductId: "", suggestedProductName: "" };
  }
  const match = matchProduct(line.productName, products);
  if (!match) {
    return { ...line, matchConfidence: 0, matchStatus: "Create new product", matchedProductId: "", suggestedProductId: "", suggestedProductName: "" };
  }
  const autoMatchThreshold = Math.max(0, Math.min(1, numberValue(matchingSettings.autoMatchConfidenceThreshold, 90) / 100));
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
  const requireManualApproval = matchingSettings.requireManualApprovalBelowThreshold ?? true;
  if (match.confidence < 0.6 || !requireManualApproval) {
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

function isoDateFromInvoiceToken(value = "") {
  const token = String(value).trim();
  let match = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const [, day, month, yearRaw] = match;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  match = token.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

function extractAlbionDeliveryDate(invoiceText = "") {
  const normalized = invoiceText.replace(/\s+/g, " ");
  const patterns = [
    /delivery\s+date\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /deliver(?:y|ed)?\s*(?:on|date)?\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /date\s+of\s+delivery\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const iso = match?.[1] ? isoDateFromInvoiceToken(match[1]) : "";
    if (iso) return iso;
  }
  return "";
}

function preferredInvoiceDateForSupplier(supplier = "", invoiceText = "", fallbackDate = "") {
  if (supplier.toLowerCase().includes("albion")) {
    const deliveryDate = extractAlbionDeliveryDate(invoiceText);
    if (deliveryDate) return deliveryDate;
  }
  return fallbackDate || today();
}

async function invoiceFilesForAi(files) {
  const supported = Array.from(files || []).filter(isImageInvoiceFile);
  const encoded = await Promise.all(supported.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
  return encoded;
}

function parseCurrencyCell(value) {
  return numberValue(String(value || "").replace(/[£$,]/g, ""));
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvText(text) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < String(text || "").length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      current.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      current.push(cell.trim());
      if (current.some(Boolean)) rows.push(current);
      current = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  current.push(cell.trim());
  if (current.some(Boolean)) rows.push(current);
  return rows;
}

function findHeaderIndex(headers, names) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => names.includes(header));
}

function salesCsvTemplateKey(name) {
  return `marginflow.salesCsvTemplate.${normalizeHeader(name || "manual")}`;
}

function defaultSalesCsvMapping(headers = []) {
  return {
    date: findHeaderIndex(headers, ["date", "businessdate", "tradingdate", "day"]),
    department: findHeaderIndex(headers, ["department", "salestype", "type", "category", "itemcategory", "reportingcategory"]),
    grossSales: findHeaderIndex(headers, ["grosssales", "gross", "totalsales", "totalgross", "grossamount"]),
    netSales: findHeaderIndex(headers, ["netsales", "net", "netrevenue", "netamount", "nettotal"]),
    vatAmount: findHeaderIndex(headers, ["vat", "vatamount", "tax", "taxamount", "taxes"]),
    vatRate: findHeaderIndex(headers, ["vatrate", "vatpercent", "taxrate", "taxpercent"]),
    serviceCharge: findHeaderIndex(headers, ["servicecharge", "servicecharges", "gratuity", "tips"]),
    discounts: findHeaderIndex(headers, ["discounts", "discount"]),
    refunds: findHeaderIndex(headers, ["refunds", "refund", "returns"]),
  };
}

function loadSalesCsvTemplate(name, headers) {
  try {
    const stored = localStorage.getItem(salesCsvTemplateKey(name));
    return stored ? { ...defaultSalesCsvMapping(headers), ...JSON.parse(stored) } : defaultSalesCsvMapping(headers);
  } catch {
    return defaultSalesCsvMapping(headers);
  }
}

function saveSalesCsvTemplate(name, mapping) {
  try {
    localStorage.setItem(salesCsvTemplateKey(name), JSON.stringify(mapping));
  } catch {
    // best effort only
  }
}

function normalizeImportDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const uk = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
}

function salesRowsFromCsvMapping(rawRows, mapping, defaultVatRate = 20, salesInputMethod = "Manual Gross + Net Sales") {
  const errors = [];
  const rows = rawRows.map((cells, index) => {
    const at = (field) => Number(mapping[field]) >= 0 ? cells[Number(mapping[field])] : "";
    const date = normalizeImportDate(at("date"));
    const department = canonicalSalesDepartmentName(at("department") || "Total");
    const grossSales = parseCurrencyCell(at("grossSales"));
    const vatRate = numberValue(at("vatRate"), defaultVatRate);
    const importedNet = parseCurrencyCell(at("netSales"));
    const vatAmount = parseCurrencyCell(at("vatAmount"));
    const sales = importedNet || (vatAmount ? grossSales - vatAmount : (salesInputMethod === "Auto-calculate Net Sales from VAT %" ? netFromGross(grossSales, vatRate) : 0));
    const rowErrors = [];
    if (!date) rowErrors.push("missing date");
    if (!grossSales) rowErrors.push("missing gross sales");
    if (!sales) rowErrors.push("missing net sales");
    if (rowErrors.length) errors.push(`Row ${index + 2}: ${rowErrors.join(", ")}`);
    return {
      id: uid(),
      date,
      day: date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }) : "",
      department,
      grossSales,
      sales,
      vatRate,
      vatAmount: sales ? vatAmountFromGrossNet(grossSales, sales) : vatAmount,
      effectiveVatRate: effectiveVatRate(grossSales, sales),
      discounts: parseCurrencyCell(at("discounts")),
      refunds: parseCurrencyCell(at("refunds")),
      serviceCharge: parseCurrencyCell(at("serviceCharge")),
      importStatus: rowErrors.length ? `Needs review: ${rowErrors.join(", ")}` : "Ready",
    };
  });
  return { rows, validRows: rows.filter((row) => row.date && row.grossSales > 0), errors };
}

function parseSalesCsv(text, departmentNames = [], defaultVatRate = 20, salesInputMethod = "Manual Gross + Net Sales") {
  const rows = parseCsvText(text);
  if (!rows.length) return [];
  const header = rows[0];
  const mapping = defaultSalesCsvMapping(header);
  const hasHeader = Object.values(mapping).some((index) => index >= 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallbackMapping = hasHeader ? mapping : {
    date: 0,
    department: rows[0]?.length >= 4 ? 1 : -1,
    grossSales: rows[0]?.length >= 4 ? 2 : 1,
    netSales: rows[0]?.length >= 4 ? 3 : 2,
    vatRate: rows[0]?.length >= 5 ? 4 : -1,
    vatAmount: -1,
    serviceCharge: -1,
    discounts: -1,
    refunds: -1,
  };
  return salesRowsFromCsvMapping(dataRows, fallbackMapping, defaultVatRate, salesInputMethod).validRows;
}

function filenameDateInfo(fileName) {
  const dates = [...String(fileName || "").matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (dates.length >= 2 && dates[0] !== dates[1]) return { date: "", dateRange: { start: dates[0], end: dates[1] } };
  if (dates.length) return { date: dates[0], dateRange: null };
  return { date: "", dateRange: null };
}

function smartImportDateLabel(importPreview) {
  if (importPreview?.dateRange?.start && importPreview?.dateRange?.end) {
    return `${formatRangeDate(importPreview.dateRange.start)} - ${formatRangeDate(importPreview.dateRange.end)}`;
  }
  return importPreview?.date ? formatRangeDate(importPreview.date) : "Not detected";
}

function displayReportType(value) {
  const raw = String(value || "Generic CSV").replace(/[_-]+/g, " ").trim();
  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Generic CSV";
}

function squareCategoryDepartment(category) {
  const key = normalizeHeader(category);
  if (key.includes("drink") || key.includes("bar") || key.includes("beverage")) return "Bar";
  if (key.includes("boughtin") || key.includes("buyin") || key.includes("resale") || key.includes("retail")) return "Bought In";
  if (key.includes("makein") || key.includes("madein") || key.includes("kitchen") || key.includes("foodmake")) return "Kitchen Made";
  if (key.includes("other") || key.includes("excluded") || key.includes("nonfood")) return "Non-food";
  return canonicalSalesDepartmentName(category);
}

function salesImportRow({
  date,
  department,
  sourceCategory = "",
  grossSales,
  netSales,
  vatAmount,
  discounts = 0,
  refunds = 0,
  serviceCharge = 0,
  importStatus = "Ready",
}, defaultVatRate = 20) {
  const gross = Number(numberValue(grossSales, 0).toFixed(2));
  const net = Number(numberValue(netSales, 0).toFixed(2));
  const vat = Number(numberValue(vatAmount, gross - net).toFixed(2));
  const vatRate = net ? Number(((vat / net) * 100).toFixed(2)) : defaultVatRate;
  return {
    id: uid(),
    date,
    day: date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }) : "",
    department: canonicalSalesDepartmentName(department),
    sourceCategory,
    grossSales: gross,
    sales: net,
    vatRate,
    vatAmount: vat,
    effectiveVatRate: effectiveVatRate(gross, net),
    discounts: Number(Math.abs(numberValue(discounts, 0)).toFixed(2)),
    refunds: Number(Math.abs(numberValue(refunds, 0)).toFixed(2)),
    serviceCharge: Number(numberValue(serviceCharge, 0).toFixed(2)),
    importStatus,
  };
}

function squareCategoryRollupPreview(fileName, csvRowsRaw, defaultVatRate = 20) {
  const headers = csvRowsRaw[0] || [];
  const dataRows = csvRowsRaw.slice(1);
  const categoryIndex = findHeaderIndex(headers, ["categoryrollup"]);
  const netIndex = findHeaderIndex(headers, ["netsales"]);
  const grossIndex = findHeaderIndex(headers, ["grosssales"]);
  const taxesIndex = findHeaderIndex(headers, ["taxes", "tax", "vat", "vatamount"]);
  const discountsIndex = findHeaderIndex(headers, ["discountsandcomps", "discountscomps", "discounts", "discount"]);
  const refundsIndex = findHeaderIndex(headers, ["refunds", "refund"]);
  const dateIndex = findHeaderIndex(headers, ["date", "businessdate", "tradingdate", "day"]);
  const requiredFields = [categoryIndex, netIndex, grossIndex];
  if (requiredFields.some((index) => index < 0)) return null;

  const dateInfo = filenameDateInfo(fileName);
  const warnings = [];
  if (dateIndex < 0 && !dateInfo.date && !dateInfo.dateRange) {
    warnings.push("No date was detected in the CSV or filename. Review the import date before confirming.");
  }
  if (dateInfo.dateRange) {
    warnings.push(`This file covers ${dateInfo.dateRange.start} to ${dateInfo.dateRange.end}. Rows will be posted against the range start date for dashboard filtering.`);
  }

  const fallbackDate = dateInfo.date || dateInfo.dateRange?.start || today();
  const rows = dataRows
    .map((cells) => {
      const sourceCategory = cells[categoryIndex] || "Uncategorised";
      const rowDate = dateIndex >= 0 ? normalizeImportDate(cells[dateIndex]) : fallbackDate;
      return salesImportRow({
        date: rowDate || fallbackDate,
        department: squareCategoryDepartment(sourceCategory),
        sourceCategory,
        grossSales: parseCurrencyCell(cells[grossIndex]),
        netSales: parseCurrencyCell(cells[netIndex]),
        vatAmount: taxesIndex >= 0 ? parseCurrencyCell(cells[taxesIndex]) : undefined,
        discounts: discountsIndex >= 0 ? parseCurrencyCell(cells[discountsIndex]) : 0,
        refunds: refundsIndex >= 0 ? parseCurrencyCell(cells[refundsIndex]) : 0,
      }, defaultVatRate);
    })
    .filter((row) => row.department !== "Total" && (row.grossSales || row.sales || row.vatAmount));

  if (!rows.length) return null;

  const optionalHits = [taxesIndex, discountsIndex, refundsIndex].filter((index) => index >= 0).length;
  const confidence = Math.min(0.98, 0.9 + (optionalHits * 0.025));
  return {
    fileName,
    source: "Square",
    reportType: "Category roll-up",
    reportTypeCode: "category_rollup",
    confidence,
    date: dateInfo.date || (dateInfo.dateRange ? "" : fallbackDate),
    dateRange: dateInfo.dateRange,
    departments: [...new Set(rows.map((row) => row.department))],
    categories: [...new Set(rows.map((row) => row.sourceCategory).filter(Boolean))],
    grossSalesTotal: rows.reduce((sum, row) => sum + row.grossSales, 0),
    netSalesTotal: rows.reduce((sum, row) => sum + row.sales, 0),
    vatTotal: rows.reduce((sum, row) => sum + row.vatAmount, 0),
    rows,
    warnings,
    headers,
    rawRows: dataRows,
    csvRowsRaw,
  };
}

function analyzeSalesCsvLocally(fileName, text, defaultVatRate = 20) {
  const csvRowsRaw = parseCsvText(text);
  if (!csvRowsRaw.length) return { csvRowsRaw, preview: null };
  const headers = csvRowsRaw[0] || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const hasSquareCategoryRollup = ["categoryrollup", "netsales", "grosssales"].every((header) => normalizedHeaders.includes(header));
  if (hasSquareCategoryRollup) return { csvRowsRaw, preview: squareCategoryRollupPreview(fileName, csvRowsRaw, defaultVatRate) };
  return { csvRowsRaw, preview: null };
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
      department: canonicalSalesDepartmentName(row.department),
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

function removeInvoiceProductHistory(products, invoiceId) {
  if (!invoiceId) return products;
  return products.map((product) => {
    const priceHistory = (product.priceHistory || []).filter((entry) => entry.invoiceId !== invoiceId);
    const supplierPrices = (product.supplierPrices || []).filter((entry) => entry.invoiceId !== invoiceId);
    return { ...product, priceHistory, supplierPrices };
  });
}

function mergeInvoiceProducts(products, items, invoiceDate, invoiceContext = { items }) {
  const next = [...products];

  items.filter(isReceivedInvoiceLine).forEach((item) => {
    const quantity = numberValue(item.quantity, 1);
    const invoiceUnitCost = quantity > 0 ? Number((netLineTotal(item, invoiceContext) / quantity).toFixed(4)) : normalizeInvoiceUnitCost(item);
    const match = item.matchedProductId
      ? { product: next.find((product) => product.id === item.matchedProductId), confidence: 1 }
      : matchProduct(item.productName, next);
    const index = match?.product ? next.findIndex((product) => product.id === match.product.id) : -1;
    const historyEntry = { date: invoiceDate, supplier: item.supplier, price: invoiceUnitCost, source: "Invoice", invoiceId: invoiceContext.id, lineId: item.id };
    const supplierEntry = { supplier: item.supplier, price: invoiceUnitCost, date: invoiceDate, source: "Invoice", invoiceId: invoiceContext.id, lineId: item.id };

    if (index >= 0 && match.confidence > 0.9) {
      const aliases = new Set([...(next[index].aliases || [])]);
      if (item.productName && item.productName.toLowerCase() !== next[index].name.toLowerCase()) aliases.add(item.productName);
      const supplierPrices = [
        ...(next[index].supplierPrices || []).filter((entry) => entry.supplier !== item.supplier && !(entry.invoiceId === invoiceContext.id && entry.lineId === item.id)),
        supplierEntry,
      ];
      const priceHistory = [
        ...(next[index].priceHistory || []).filter((entry) => !(entry.invoiceId === invoiceContext.id && entry.lineId === item.id)),
        historyEntry,
      ];
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
        priceHistory,
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

function normalizeInvoiceDiscountFields(invoice) {
  const subtotalAfterLineDiscount = receivedLineSubtotal(invoice.items || []);
  const discountAmountValue = invoiceDiscountAmount(invoice);
  const discountPercentValue = subtotalAfterLineDiscount ? (discountAmountValue / subtotalAfterLineDiscount) * 100 : 0;
  return {
    subtotalBeforeDiscount: invoiceSubtotalBeforeDiscount(invoice),
    discountAmount: Number(discountAmountValue.toFixed(2)),
    discountPercent: Number(discountPercentValue.toFixed(2)),
    finalInvoiceTotal: Number(invoiceFinalTotal({ ...invoice, discountAmount: discountAmountValue, discountPercent: discountPercentValue }).toFixed(2)),
  };
}

function prepareApprovedInvoice(invoice) {
  const discountFields = normalizeInvoiceDiscountFields(invoice);
  const context = { ...invoice, ...discountFields };
  const items = (invoice.items || []).map((item) => ({
    ...item,
    lineStatus: invoiceLineStatus(item),
    creditReason: invoiceLineStatus(item) === "Received" ? "" : (item.creditReason || invoiceLineStatus(item)),
    lineDiscountAmount: Number(lineLevelDiscount(item).toFixed(2)),
    lineDiscountPercent: originalLineTotal(item) ? Number(((lineLevelDiscount(item) / originalLineTotal(item)) * 100).toFixed(2)) : 0,
    originalLineTotal: Number(originalLineTotal(item).toFixed(2)),
    discountApplied: Number(discountAppliedToLine(item, context).toFixed(2)),
    netLineTotal: Number(netLineTotal(item, context).toFixed(2)),
  }));
  const finalContext = { ...invoice, ...discountFields, items };
  return {
    ...invoice,
    ...normalizeInvoiceDiscountFields(finalContext),
    items: items.map((item) => ({
      ...item,
      discountApplied: Number(discountAppliedToLine(item, finalContext).toFixed(2)),
      netLineTotal: Number(netLineTotal(item, finalContext).toFixed(2)),
    })),
  };
}

function normalizeInvoiceLineForSave(item, supplier, fallbackDepartment = "Kitchen Made") {
  const status = invoiceLineStatus(item);
  const quantity = numberValue(item.quantity, 1);
  const unitCost = normalizeInvoiceUnitCost({ ...item, quantity });
  const discounted = syncInvoiceLineDiscounts({
    ...item,
    id: item.id || uid(),
    quantity,
    unitCost,
    supplier: item.supplier || supplier,
    lineTotal: quantity * unitCost,
    status,
    lineStatus: status,
    creditReason: status === "Received" ? "" : (item.creditReason || status),
  });
  const departmentSplits = normalizeDepartmentSplits(discounted, item.department || fallbackDepartment);
  return {
    ...discounted,
    department: departmentSplits[0]?.department || item.department || fallbackDepartment,
    departmentMode: departmentSplits.length > 1 ? "Split" : "Single",
    departmentSplits,
  };
}

function creditNotesForInvoice(invoice) {
  return (invoice.items || [])
    .filter((item) => !isReceivedInvoiceLine(item))
    .map((item) => {
      const status = invoiceLineStatus(item);
      const resolved = status === "Credit note received";
      return {
        id: uid(),
        invoiceId: invoice.id,
        lineId: item.id,
        supplier: item.supplier || invoice.supplier,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.date,
        product: item.productName,
        quantity: numberValue(item.quantity, 0),
        value: lineAfterLineDiscount(item),
        grossValue: originalLineTotal(item),
        netValue: lineAfterLineDiscount(item),
        reason: item.creditReason || status,
        status: resolved ? "Credit received" : "To chase",
        notes: "",
      };
    });
}

function issueValue(note) {
  return numberValue(note.netValue, numberValue(note.grossValue, numberValue(note.value, 0)));
}

function isOpenSupplierIssue(note) {
  return ["To chase", "Chased"].includes(note.status || "To chase");
}

function supplierIssueSummary(creditNotes, supplierName) {
  const issues = creditNotes.filter((note) => note.supplier === supplierName);
  const openIssues = issues.filter(isOpenSupplierIssue);
  return {
    issues,
    openIssues: openIssues.length,
    valueToChase: openIssues.reduce((sum, note) => sum + issueValue(note), 0),
  };
}

function syncCreditNotesForInvoice(current, invoice) {
  const existingForInvoice = current.filter((note) => note.invoiceId === invoice.id);
  const generated = creditNotesForInvoice(invoice).map((note) => {
    const existing = existingForInvoice.find((candidate) => candidate.lineId === note.lineId);
    if (!existing) return note;
    return {
      ...note,
      id: existing.id,
      status: note.status === "Credit received" ? "Credit received" : existing.status,
      notes: existing.notes,
    };
  });
  return [...current.filter((note) => note.invoiceId !== invoice.id), ...generated];
}

function combinedSupplierIssues(creditNotes = [], invoices = []) {
  const keyed = new Map();
  const add = (note) => {
    const key = `${note.invoiceId || note.invoiceNumber || ""}::${note.lineId || note.product || ""}::${note.supplier || ""}`;
    keyed.set(key, { ...note, id: note.id || key });
  };
  creditNotes.forEach(add);
  invoices.flatMap(creditNotesForInvoice).forEach((generated) => {
    const key = `${generated.invoiceId || generated.invoiceNumber || ""}::${generated.lineId || generated.product || ""}::${generated.supplier || ""}`;
    const existing = keyed.get(key);
    keyed.set(key, existing ? { ...generated, ...existing, status: existing.status || generated.status, notes: existing.notes || generated.notes } : generated);
  });
  return Array.from(keyed.values());
}

function extractInvoiceTotals(invoiceText = "") {
  const normalized = invoiceText.replace(/\s+/g, " ");
  const pickAmount = (patterns) => {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) return numberValue(String(match[1]).replace(",", "."), 0);
    }
    return 0;
  };
  return {
    subtotalBeforeDiscount: pickAmount([/(?:subtotal|sub total|goods|net value)\s*[:£]?\s*([0-9,]+\.\d{2})/i]),
    discountAmount: pickAmount([/(?:discount|disc)\s*[:£]?\s*-?\s*([0-9,]+\.\d{2})/i]),
    finalInvoiceTotal: pickAmount([/(?:invoice total|ticket total|grand total|total)\s*[:£]?\s*([0-9,]+\.\d{2})/i]),
  };
}

function extractInvoiceNumberFromText(invoiceText = "") {
  const normalized = invoiceText.replace(/\s+/g, " ");
  const patterns = [
    /Invoice No\.?\s*[:#]?\s*(\d{4,})/i,
    /Invoice Number\s*[:#]?\s*(\d{4,})/i,
    /Invoice no\s*[:#]?\s*(\d{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractInvoiceDateFromText(invoiceText = "") {
  const normalized = invoiceText.replace(/\s+/g, " ");
  const match = normalized.match(/(?:DELIVERY DATE|Date\/Tax Point|Invoice date|ORDER DATE)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!match) return "";
  const [, day, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function detectSupplierFromInvoiceText(invoiceText = "", fallback = "") {
  const key = `${fallback} ${invoiceText}`.toLowerCase().replace(/&/g, "and");
  const match = supplierParserCatalog.find((parser) => parser.aliases.some((alias) => key.includes(alias.replace(/&/g, "and"))));
  return match?.name || fallback || "";
}

function supplierParserStatus(supplierName = "") {
  const key = supplierName.toLowerCase().replace(/&/g, "and");
  const match = supplierParserCatalog.find((parser) => (
    parser.name.toLowerCase().replace(/&/g, "and") === key ||
    parser.aliases.some((alias) => key.includes(alias.replace(/&/g, "and")) || alias.replace(/&/g, "and").includes(key))
  ));
  return match?.status || "Manual only";
}

function parseInvoiceWithSupplierParsers(invoiceText = "", fallbackSupplier = "") {
  const text = invoiceText || "";
  const key = text.toLowerCase();
  const detectedSupplier = detectSupplierFromInvoiceText(text, fallbackSupplier);
  let parserName = detectedSupplier || "Generic parser";
  let lines = [];

  if (key.includes("tg fruits")) {
    parserName = "TG Fruits parser";
    lines = extractTgFruitsInvoiceRows(text);
  } else if (key.includes("albion")) {
    parserName = "Albion Fine Foods parser";
    lines = parseAlbionOrderRows(text);
  } else if (key.includes("elite fine foods") || key.includes("elite sales")) {
    parserName = "Elite Fine Foods parser";
    lines = parseEliteInvoiceRows(text);
  } else {
    const supported = supplierParserStatus(detectedSupplier) === "Supported";
    parserName = supported && detectedSupplier ? `${detectedSupplier} parser` : "Generic parser";
    lines = extractGenericInvoiceRows(text);
  }

  if (!lines.length && !["TG Fruits parser", "Albion Fine Foods parser", "Elite Fine Foods parser"].includes(parserName)) {
    lines = extractGenericInvoiceRows(text);
  }

  const totals = extractInvoiceTotals(text);
  const subtotal = totals.subtotalBeforeDiscount || lines.reduce((sum, line) => sum + numberValue(line.lineTotal, numberValue(line.quantity, 1) * numberValue(line.unitCost)), 0);
  const inferredDiscountAmount = totals.discountAmount || (
    subtotal > 0 && totals.finalInvoiceTotal > 0 && subtotal > totals.finalInvoiceTotal
      ? Number((subtotal - totals.finalInvoiceTotal).toFixed(2))
      : 0
  );

  return {
    supplier: detectedSupplier || fallbackSupplier,
    parserName,
    invoiceNumber: extractInvoiceNumberFromText(text),
    invoiceDate: extractInvoiceDateFromText(text),
    subtotalBeforeDiscount: subtotal,
    discountAmount: inferredDiscountAmount,
    discountPercent: subtotal ? Number(((inferredDiscountAmount / subtotal) * 100).toFixed(2)) : 0,
    finalInvoiceTotal: totals.finalInvoiceTotal || Number((subtotal - inferredDiscountAmount).toFixed(2)),
    lines,
  };
}

function spendBySupplier(invoices, suppliers, dateRange = { start: "0000-01-01", end: "9999-12-31" }, selectedDepartment = "All departments") {
  return suppliers.map((supplier) => {
    const spend = invoices
      .filter((invoice) => invoice.supplier === supplier.name && dateInRange(invoice.date, dateRange))
      .reduce((sum, invoice) => sum + (invoice.items || []).reduce((lineSum, item) => lineSum + lineTotalForDepartment(item, selectedDepartment, invoice), 0), 0);
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
  return salesRows.reduce((sum, row) => {
    const amount = gpCalculationBase === "Gross Sales" ? salesGrossForRow(row, selectedDepartment) : salesNetForRow(row, selectedDepartment);
    return sum + amount;
  }, 0);
}

function grossSalesForDepartment(salesRows, selectedDepartment) {
  return salesRows.reduce((sum, row) => sum + salesGrossForRow(row, selectedDepartment), 0);
}

function vatForDepartment(salesRows, selectedDepartment) {
  return salesRows.reduce((sum, row) => {
    const gross = salesGrossForRow(row, selectedDepartment);
    const net = salesNetForRow(row, selectedDepartment);
    return sum + Math.max(0, gross - net);
  }, 0);
}

function purchasesForDepartment(invoices, selectedDepartment) {
  return invoices
    .reduce((sum, invoice) => sum + (invoice.items || []).reduce((lineSum, item) => lineSum + lineTotalForDepartment(item, selectedDepartment, invoice), 0), 0);
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
  const netSales = salesForDepartment(salesRows, selectedDepartment, "Net Sales");
  const salesTotal = netSales;
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

function parseBackupValue(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyStorageValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function recordCompletenessScore(record) {
  if (!record || typeof record !== "object") return 0;
  return Object.values(record).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null && value !== "";
  }).length + JSON.stringify(record).length / 1000;
}

function mergeArrayById(current = [], imported = [], fallbackKey = null) {
  const rows = [];
  const indexByKey = new Map();
  const stats = { added: 0, merged: 0, skipped: 0 };
  const keyFor = (item) => {
    if (item?.id) return `id:${item.id}`;
    return fallbackKey ? `fallback:${fallbackKey(item)}` : "";
  };
  const addCurrent = (item) => {
    const key = keyFor(item);
    if (key) indexByKey.set(key, rows.length);
    rows.push(item);
  };
  current.forEach(addCurrent);

  imported.forEach((item) => {
    const key = keyFor(item);
    const existingIndex = key ? indexByKey.get(key) : -1;
    if (existingIndex === undefined || existingIndex < 0) {
      addCurrent(item);
      stats.added += 1;
      return;
    }
    const existing = rows[existingIndex];
    const merged = mergeRecords(existing, item);
    const changed = JSON.stringify(merged) !== JSON.stringify(existing);
    rows[existingIndex] = merged;
    if (changed) stats.merged += 1;
    else stats.skipped += 1;
  });

  return { rows, stats };
}

function mergeUniqueArray(current = [], imported = [], keyFn = (item) => JSON.stringify(item)) {
  const byKey = new Map();
  [...current, ...imported].forEach((item) => {
    const key = keyFn(item);
    if (!byKey.has(key)) byKey.set(key, item);
    else byKey.set(key, mergeRecords(byKey.get(key), item));
  });
  return [...byKey.values()];
}

function mergeRecords(current, imported) {
  if (!current || typeof current !== "object") return imported;
  if (!imported || typeof imported !== "object") return current;
  const preferImported = recordCompletenessScore(imported) > recordCompletenessScore(current);
  const base = preferImported ? { ...current, ...imported } : { ...imported, ...current };
  const merged = { ...base };

  ["aliases"].forEach((field) => {
    if (Array.isArray(current[field]) || Array.isArray(imported[field])) {
      merged[field] = [...new Set([...(current[field] || []), ...(imported[field] || [])])];
    }
  });
  ["priceHistory", "supplierPrices", "departmentSplits", "items", "lines", "openingLines", "ingredients", "subcategories"].forEach((field) => {
    if (Array.isArray(current[field]) || Array.isArray(imported[field])) {
      merged[field] = mergeUniqueArray(current[field] || [], imported[field] || [], (item) => item?.id || JSON.stringify(item));
    }
  });
  return merged;
}

function invoiceFallbackKey(invoice) {
  return [invoice?.supplier || "", invoice?.invoiceNumber || "", invoice?.date || ""].join("|").toLowerCase();
}

function mergeMarginFlowStorage(currentStorage, importedStorage, useImportedSettings = false) {
  const nextStorage = { ...currentStorage };
  const summary = {
    invoicesAdded: 0,
    invoicesSkipped: 0,
    productsAdded: 0,
    productsMerged: 0,
    suppliersAdded: 0,
    suppliersSkipped: 0,
  };
  const arrayKeys = {
    "marginflow.invoices": invoiceFallbackKey,
    "marginflow.products": null,
    "marginflow.suppliers": null,
    "marginflow.recipes": null,
    "marginflow.menus": null,
    "marginflow.stocktakes": null,
    "marginflow.waste": null,
    "marginflow.sales": null,
    "marginflow.creditNotes": null,
  };
  const settingsKeys = new Set([
    "marginflow.companySettings",
    "marginflow.financialSettings",
    "marginflow.departmentSettings",
    "marginflow.menuSettings",
    "marginflow.invoiceSettings",
    "marginflow.department",
  ]);

  Object.entries(importedStorage).forEach(([key, value]) => {
    if (!key.startsWith("marginflow.") || key === "marginflow.preImportBackup") return;
    if (arrayKeys.hasOwnProperty(key)) {
      const currentRows = parseBackupValue(currentStorage[key], []);
      const importedRows = parseBackupValue(value, []);
      if (!Array.isArray(currentRows) || !Array.isArray(importedRows)) return;
      const { rows, stats } = mergeArrayById(currentRows, importedRows, arrayKeys[key]);
      nextStorage[key] = JSON.stringify(rows);
      if (key === "marginflow.invoices") {
        summary.invoicesAdded = stats.added;
        summary.invoicesSkipped = stats.skipped;
      }
      if (key === "marginflow.products") {
        summary.productsAdded = stats.added;
        summary.productsMerged = stats.merged;
      }
      if (key === "marginflow.suppliers") {
        summary.suppliersAdded = stats.added;
        summary.suppliersSkipped = stats.skipped;
      }
      return;
    }
    if (settingsKeys.has(key)) {
      if (useImportedSettings) nextStorage[key] = stringifyStorageValue(value);
      return;
    }
    if (!currentStorage[key]) nextStorage[key] = stringifyStorageValue(value);
  });

  return { nextStorage, summary };
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function salesDepartments(row = {}) {
  return row.departments || row.departmentSales || row.departmentBreakdown || {};
}

function salesAmountForRow(row = {}, selectedDepartment = "All departments", amountKey = "netSales") {
  const departments = salesDepartments(row);
  const departmentNames = Object.keys(departments);
  const rowFallback = amountKey === "grossSales"
    ? numberValue(row.grossSales, numberValue(row.netSales, numberValue(row.sales, 0)))
    : numberValue(row.netSales, numberValue(row.sales, 0));

  if (selectedDepartment === "All departments") {
    if (departmentNames.length) {
      const total = departmentNames.reduce((sum, departmentName) => {
        const values = departments[departmentName] || {};
        const amount = amountKey === "grossSales"
          ? numberValue(values.grossSales, numberValue(values.netSales, 0))
          : numberValue(values.netSales, numberValue(values.sales, 0));
        return sum + amount;
      }, 0);
      return total || rowFallback;
    }
    return rowFallback;
  }

  if (departments[selectedDepartment]) {
    const values = departments[selectedDepartment] || {};
    return amountKey === "grossSales"
      ? numberValue(values.grossSales, numberValue(values.netSales, 0))
      : numberValue(values.netSales, numberValue(values.sales, 0));
  }
  if (row.department && row.department !== selectedDepartment) return 0;
  return rowFallback;
}

function salesNetForRow(row, selectedDepartment = "All departments") {
  return salesAmountForRow(row, selectedDepartment, "netSales");
}

function salesGrossForRow(row, selectedDepartment = "All departments") {
  return salesAmountForRow(row, selectedDepartment, "grossSales");
}

function daysBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function shiftDate(date, days) {
  return toIsoDate(addDays(parseDate(date), days));
}

function shiftDateByYears(date, years) {
  const next = parseDate(date);
  next.setFullYear(next.getFullYear() + years);
  return toIsoDate(next);
}

function shiftRangeByDays(range, days) {
  return { start: shiftDate(range.start, days), end: shiftDate(range.end, days) };
}

function shiftRangeByYears(range, years) {
  return { start: shiftDateByYears(range.start, years), end: shiftDateByYears(range.end, years) };
}

function rangeFromStartAndLength(startDate, lengthDays) {
  return { start: startDate, end: shiftDate(startDate, Math.max(1, lengthDays) - 1) };
}

function salesRowsForRange(sales, range, department = "All departments") {
  return sales
    .filter((row) => dateInRange(row.date, range))
    .map((row) => ({
      ...row,
      day: row.day || formatRangeDate(row.date),
      grossSales: salesGrossForRow(row, department),
      netSales: salesNetForRow(row, department),
      sales: salesNetForRow(row, department),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function salesTotalsForRange(sales, range, department = "All departments") {
  const rows = salesRowsForRange(sales, range, department);
  const netSales = rows.reduce((sum, row) => sum + numberValue(row.netSales, row.sales), 0);
  const grossSales = rows.reduce((sum, row) => sum + numberValue(row.grossSales, row.netSales), 0);
  const serviceCharge = rows.reduce((sum, row) => sum + numberValue(row.serviceCharge, 0), 0);
  const dayCount = daysBetween(range.start, range.end);
  return {
    rows,
    netSales,
    grossSales,
    serviceCharge,
    vat: Math.max(0, grossSales - netSales),
    dayCount,
    averageDailyNet: netSales / dayCount,
  };
}

function salesByDepartment(sales, range, departmentNames = defaultDepartments) {
  return departmentNames.map((departmentName) => {
    const rows = sales.filter((row) => dateInRange(row.date, range));
    const totals = rows.reduce((sum, row) => {
      const departments = salesDepartments(row);
      const hasDepartmentBreakdown = Object.keys(departments).length > 0;
      const includeLegacyRow = !hasDepartmentBreakdown && (!row.department || row.department === departmentName) && departmentName === departmentNames[0];
      const includeSingleDepartmentRow = !hasDepartmentBreakdown && row.department === departmentName;
      const netSales = hasDepartmentBreakdown
        ? salesNetForRow(row, departmentName)
        : (includeLegacyRow || includeSingleDepartmentRow ? salesNetForRow(row, "All departments") : 0);
      const grossSales = hasDepartmentBreakdown
        ? salesGrossForRow(row, departmentName)
        : (includeLegacyRow || includeSingleDepartmentRow ? salesGrossForRow(row, "All departments") : 0);
      return {
        netSales: sum.netSales + netSales,
        grossSales: sum.grossSales + grossSales,
      };
    }, { netSales: 0, grossSales: 0 });
    return {
      id: departmentName,
      department: departmentName,
      netSales: totals.netSales,
      grossSales: totals.grossSales,
      vat: Math.max(0, totals.grossSales - totals.netSales),
    };
  });
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

const labourHolidayAccrualRate = 0.1207;
const labourFiscalYearStart = "2025-11-01";
const labourFiscalYearEnd = "2026-10-31";
const labourBasisLabels = {
  foodSales: "Food sales",
  totalSales: "Total sales",
  serviceCharge: "Service charge",
};

function stableLabourId(prefix, value) {
  const token = normalizeHeader(value).slice(0, 70);
  return token ? `${prefix}-${token}` : uid();
}

function labourDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((parseDate(endDate) - parseDate(startDate)) / 86400000));
}

function labourWeeksBetween(startDate, endDate) {
  return Math.max(1, labourDaysBetween(startDate, endDate) / 7);
}

function labourEntryInRange(startDate, endDate, range) {
  const start = startDate || endDate;
  const end = endDate || startDate;
  if (!start && !end) return false;
  return end >= range.start && start <= range.end;
}

function labourSameText(left, right) {
  return normalizeHeader(left) === normalizeHeader(right);
}

function labourPersonTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && token.length > 1);
}

function labourFindEmployeeByName(employees = [], name = "") {
  const targetTokens = labourPersonTokens(name);
  if (!targetTokens.length) return null;
  const targetKey = targetTokens.join(" ");
  return employees.find((employee) => labourSameText(employee.name, name))
    || employees.find((employee) => {
      const employeeTokens = labourPersonTokens(employee.name);
      const employeeKey = employeeTokens.join(" " );
      if (!employeeTokens.length) return false;
      if (employeeKey.includes(targetKey) || targetKey.includes(employeeKey)) return true;
      const matched = targetTokens.filter((token) => employeeTokens.includes(token)).length;
      return matched >= Math.min(2, targetTokens.length, employeeTokens.length);
    })
    || null;
}

function labourSum(rows, key) {
  return rows.reduce((sum, row) => sum + numberValue(row[key], 0), 0);
}

function labourRatio(value, total) {
  return total ? (numberValue(value, 0) / numberValue(total, 0)) * 100 : 0;
}

function createInitialLabourData() {
  const departments = (labourImportedSeed.departments || []).map((department) => ({ ...department }));
  const departmentIdForName = (name) => (departments.find((department) => labourSameText(department.name, name)) || departments[0])?.id || "";
  const employees = (labourImportedSeed.employees || []).map((employee) => ({
    id: stableLabourId("emp", employee.name),
    name: employee.name,
    departmentId: departmentIdForName(employee.departmentName),
    payType: employee.payType || "hourly",
    rate: numberValue(employee.rate, 0),
    contractedHours: numberValue(employee.contractedHours, 0),
    manualAverageWeeklyHours: numberValue(employee.manualAverageWeeklyHours, 0),
    startDate: employee.startDate || "",
    status: employee.status || "left",
    holidayType: employee.holidayType || "zero-hours",
    holidayEntitlementDays: numberValue(employee.holidayEntitlementDays, 28),
  }));
  const employeeByName = new Map(employees.map((employee) => [normalizeHeader(employee.name), employee]));
  const labour = (labourImportedSeed.labour || []).map((row, index) => {
    const employee = employeeByName.get(normalizeHeader(row.employeeName));
    return {
      id: stableLabourId("lab", `${row.date}-${row.employeeName}-${index}`),
      source: "csv-shifts",
      date: row.date,
      dateTo: row.dateTo || row.date,
      employeeId: employee?.id || "",
      employeeName: row.employeeName,
      departmentId: employee?.departmentId || departmentIdForName(row.departmentName),
      departmentName: row.departmentName,
      hours: numberValue(row.hours, 0),
      wages: numberValue(row.wages, 0),
      serviceCharge: numberValue(row.serviceCharge, 0),
      tronc: numberValue(row.tronc ?? row.serviceCharge, 0),
      rate: numberValue(row.rate, 0),
    };
  });

  return {
    departments,
    employees,
    sales: (labourImportedSeed.sales || []).map((row) => ({
      id: stableLabourId("sales", row.dateFrom),
      source: "csv-items",
      ...row,
      bohServiceCharge: numberValue(row.serviceCharge, 0) * 0.4,
      fohServiceCharge: numberValue(row.serviceCharge, 0) * 0.6,
    })),
    labour,
    holidays: [],
    rateHistory: (labourImportedSeed.rateHistory || []).map((row) => ({
      id: stableLabourId("rate", `${row.employeeName}-${row.effectiveDate}-${row.rate}`),
      ...row,
      employeeId: employeeByName.get(normalizeHeader(row.employeeName))?.id || "",
    })),
    foodCategories: labourImportedSeed.foodCategories || [],
  };
}

function normalizeLabourData(data = {}) {
  const fallback = createInitialLabourData();
  return {
    ...fallback,
    ...data,
    departments: Array.isArray(data.departments) ? data.departments : fallback.departments,
    employees: Array.isArray(data.employees) ? data.employees : fallback.employees,
    sales: Array.isArray(data.sales) ? data.sales : fallback.sales,
    labour: Array.isArray(data.labour) ? data.labour : fallback.labour,
    holidays: Array.isArray(data.holidays) ? data.holidays : [],
    rateHistory: Array.isArray(data.rateHistory) ? data.rateHistory : fallback.rateHistory,
    foodCategories: Array.isArray(data.foodCategories) ? data.foodCategories : fallback.foodCategories,
  };
}

function labourDepartmentName(data, departmentId, fallback = "") {
  return data.departments.find((department) => department.id === departmentId)?.name || fallback;
}

function labourEmployeeAverageWeeklyHours(data, employee) {
  if (!employee) return 0;
  if (numberValue(employee.manualAverageWeeklyHours, 0)) return numberValue(employee.manualAverageWeeklyHours, 0);
  const rows = data.labour.filter((row) => labourSameText(row.employeeName, employee.name));
  const hours = labourSum(rows, "hours");
  return hours / labourWeeksBetween(employee.startDate || labourFiscalYearStart, today());
}

function labourRateLabel(employee) {
  if (employee.payType === "annual") return `${money(employee.rate)}/year (${money(employee.rate / 52)}/week)`;
  return `${money(employee.rate)}/h`;
}

function labourServiceChargePoints(employee = {}) {
  if (employee.excludeFromServiceCharge) return 0;
  return numberValue(employee.serviceChargePoints ?? employee.scWeight ?? employee.serviceChargeWeight, 1);
}

function labourEmployeeRate(employee = {}) {
  return numberValue(employee.rate, 0);
}

function labourSalesInRange(data, range) {
  return data.sales.filter((row) => labourEntryInRange(row.dateFrom, row.dateTo || row.dateFrom, range));
}

function labourRowsInRange(data, range) {
  return data.labour.filter((row) => labourEntryInRange(row.date, row.dateTo || row.date, range));
}

function labourSalesTotals(rows) {
  return {
    totalSales: labourSum(rows, "totalSales"),
    netSales: labourSum(rows, "netSales"),
    foodSales: labourSum(rows, "foodSales"),
    serviceCharge: labourSum(rows, "serviceCharge"),
  };
}

function labourTotals(rows) {
  return {
    hours: labourSum(rows, "hours"),
    wages: labourSum(rows, "wages"),
    serviceCharge: labourSum(rows, "serviceCharge"),
  };
}

function aggregateLabourByEmployee(data, rows, salesTotalsForAllocation = null) {
  const map = new Map();
  rows.forEach((row) => {
    const employee = data.employees.find((item) => item.id === row.employeeId) || labourFindEmployeeByName(data.employees, row.employeeName) || {};
    const key = row.employeeId || employee.id || normalizeHeader(row.employeeName);
    const departmentName = labourDepartmentName(data, row.departmentId || employee.departmentId, row.departmentName || "-");
    const hours = numberValue(row.hours, 0);
    const rate = labourEmployeeRate(employee) || numberValue(row.rate, 0);
    const wages = numberValue(row.wages, 0) || hours * rate;
    const serviceChargePoints = numberValue(row.serviceChargePoints ?? row.serviceChargeWeight ?? labourServiceChargePoints(employee), 1);
    const serviceChargeHours = numberValue(row.serviceChargeHours, hours * serviceChargePoints);
    const current = map.get(key) || {
      id: key || uid(),
      employeeId: row.employeeId || employee.id || "",
      employeeName: row.employeeName || employee.name,
      departmentName,
      hours: 0,
      wages: 0,
      serviceCharge: 0,
      serviceChargePoints,
      serviceChargeHours: 0,
    };
    current.hours += hours;
    current.wages += wages;
    current.serviceCharge += numberValue(row.serviceCharge ?? row.tronc, 0);
    current.serviceChargeHours += serviceChargeHours;
    current.serviceChargePoints = serviceChargePoints;
    current.departmentName = departmentName || current.departmentName;
    map.set(key, current);
  });
  const grouped = [...map.values()];
  const hasAllocatedServiceCharge = grouped.some((row) => numberValue(row.serviceCharge, 0));
  const pool = numberValue(salesTotalsForAllocation?.serviceCharge, 0);
  if (!hasAllocatedServiceCharge && pool > 0) {
    const poolForGroup = (groupName) => {
      if (groupName === "BOH") return numberValue(salesTotalsForAllocation?.bohServiceCharge, pool * 0.4);
      if (groupName === "FOH") return numberValue(salesTotalsForAllocation?.fohServiceCharge, pool * 0.6);
      return 0;
    };
    const rowGroup = (row) => ["BOH", "KP"].includes(row.departmentName) ? "BOH" : "FOH";
    ["BOH", "FOH"].forEach((groupName) => {
      const groupRows = grouped.filter((row) => rowGroup(row) === groupName && numberValue(row.serviceChargeHours, 0) > 0);
      const totalScHours = labourSum(groupRows, "serviceChargeHours");
      const groupPool = poolForGroup(groupName);
      groupRows.forEach((row) => {
        row.serviceCharge = totalScHours ? groupPool * numberValue(row.serviceChargeHours, 0) / totalScHours : 0;
      });
    });
  }
  return grouped.map((row) => ({
    ...row,
    serviceChargePerHour: numberValue(row.hours, 0) ? numberValue(row.serviceCharge, 0) / numberValue(row.hours, 0) : 0,
    total: numberValue(row.wages, 0) + numberValue(row.serviceCharge, 0),
  }));
}

function labourDepartmentBreakdownRows(data, labourRows, salesTotals) {
  return data.departments.map((department) => {
    const rows = labourRows.filter((row) => {
      const departmentName = labourDepartmentName(data, row.departmentId, row.departmentName);
      return row.departmentId === department.id || labourSameText(departmentName, department.name);
    });
    const wages = labourSum(rows, "wages");
    const basis = department.basis || "totalSales";
    const basisValue = numberValue(salesTotals[basis], 0);
    const actual = labourRatio(wages, basisValue);
    return {
      id: department.id,
      department: department.name,
      basis: labourBasisLabels[basis] || basis,
      hours: labourSum(rows, "hours"),
      wages,
      totalSales: salesTotals.totalSales,
      foodSales: salesTotals.foodSales,
      actual,
      target: numberValue(department.targetPercent, 0),
      status: department.targetPercent && actual > department.targetPercent ? "Above" : "OK",
    };
  });
}

function labourHolidayRow(data, employee) {
  const rows = data.labour.filter((row) => labourSameText(row.employeeName, employee.name));
  const hours = labourSum(rows, "hours");
  const wages = labourSum(rows, "wages");
  const avgWeekly = labourEmployeeAverageWeeklyHours(data, employee);
  const avgDaily = avgWeekly / 5;
  const used = data.holidays.filter((holiday) => holiday.employeeId === employee.id || labourSameText(holiday.employeeName, employee.name));
  const usedHours = labourSum(used, "hours");
  const usedDays = labourSum(used, "days") || (avgDaily ? usedHours / avgDaily : 0);
  const isAnnual = employee.payType === "annual";
  if (isAnnual) {
    const elapsedDays = labourDaysBetween([employee.startDate || labourFiscalYearStart, labourFiscalYearStart].sort().at(-1), today());
    const yearDays = labourDaysBetween(labourFiscalYearStart, labourFiscalYearEnd) + 1;
    const accruedDays = numberValue(employee.holidayEntitlementDays, 28) * (elapsedDays / yearDays);
    const remainingDays = accruedDays - usedDays;
    return {
      id: employee.id,
      name: employee.name,
      type: "Annual salary",
      hoursWorked: hours,
      avgWeekly,
      avgDaily,
      accrued: `${numberValue(accruedDays).toFixed(1)} days`,
      used: `${numberValue(usedDays).toFixed(1)} days`,
      remaining: `${numberValue(remainingDays).toFixed(1)} days`,
      projectedHours: 0,
      projectedAccrued: `${numberValue(employee.holidayEntitlementDays, 28).toFixed(1)} days`,
      projectedRemaining: `${numberValue(numberValue(employee.holidayEntitlementDays, 28) - usedDays).toFixed(1)} days`,
      liability: (numberValue(employee.rate, 0) / 260) * (numberValue(employee.holidayEntitlementDays, 28) - usedDays),
      notes: "Holiday tracked in days",
    };
  }

  const accruedHours = hours * labourHolidayAccrualRate;
  const projectedHours = avgWeekly * labourWeeksBetween(today(), labourFiscalYearEnd);
  const projectedAccruedHours = (hours + projectedHours) * labourHolidayAccrualRate;
  const remainingHours = accruedHours - usedHours;
  const projectedRemainingHours = projectedAccruedHours - usedHours;
  const averageRate = wages / hours || employee.rate || 0;
  return {
    id: employee.id,
    name: employee.name,
    type: "Zero-hours",
    hoursWorked: hours,
    avgWeekly,
    avgDaily,
    accrued: `${numberValue(accruedHours).toFixed(2)}h / ${avgDaily ? (accruedHours / avgDaily).toFixed(1) : "0.0"} days`,
    used: `${numberValue(usedHours).toFixed(2)}h / ${numberValue(usedDays).toFixed(1)} days`,
    remaining: `${numberValue(remainingHours).toFixed(2)}h / ${avgDaily ? (remainingHours / avgDaily).toFixed(1) : "0.0"} days`,
    projectedHours,
    projectedAccrued: `${numberValue(projectedAccruedHours).toFixed(2)}h / ${avgDaily ? (projectedAccruedHours / avgDaily).toFixed(1) : "0.0"} days`,
    projectedRemaining: `${numberValue(projectedRemainingHours).toFixed(2)}h / ${avgDaily ? (projectedRemainingHours / avgDaily).toFixed(1) : "0.0"} days`,
    liability: averageRate * projectedRemainingHours,
    notes: "12.07% of hours",
  };
}

function labourHolidaySummary(data) {
  const rows = data.employees.filter((employee) => employee.holidayType !== "freelance").map((employee) => labourHolidayRow(data, employee));
  return {
    rows,
    totalLiability: labourSum(rows, "liability"),
    totalRemainingHours: rows.reduce((sum, row) => {
      const match = String(row.projectedRemaining).match(/-?\d+(?:\.\d+)?h/);
      return sum + (match ? numberValue(match[0].replace("h", ""), 0) : 0);
    }, 0),
  };
}

function parseLabourSalesCsv(text) {
  const rows = parseCsvText(text);
  if (!rows.length) return [];
  const headers = rows[0] || [];
  const mapping = {
    date: findHeaderIndex(headers, ["date", "businessdate", "tradingdate", "day", "datefrom"]),
    dateTo: findHeaderIndex(headers, ["dateto", "enddate", "periodto"]),
    totalSales: findHeaderIndex(headers, ["totalsales", "total", "grosssales", "nettotal"]),
    netSales: findHeaderIndex(headers, ["netsales", "net", "sales"]),
    foodSales: findHeaderIndex(headers, ["foodsales", "food", "kitchensales"]),
    serviceCharge: findHeaderIndex(headers, ["servicecharge", "servicecharges", "tips", "gratuity"]),
  };
  const hasHeader = Object.values(mapping).some((index) => index >= 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallback = hasHeader ? mapping : { date: 0, dateTo: -1, totalSales: 1, netSales: 1, foodSales: 2, serviceCharge: 3 };
  return dataRows.map((cells, index) => {
    const at = (field) => Number(fallback[field]) >= 0 ? cells[Number(fallback[field])] : "";
    const date = normalizeImportDate(at("date"));
    const serviceCharge = parseCurrencyCell(at("serviceCharge"));
    const totalSales = parseCurrencyCell(at("totalSales"));
    const netSales = parseCurrencyCell(at("netSales")) || totalSales;
    return {
      id: uid(),
      source: "csv-upload",
      dateFrom: date,
      dateTo: normalizeImportDate(at("dateTo")) || date,
      totalSales,
      netSales,
      foodSales: parseCurrencyCell(at("foodSales")),
      serviceCharge,
      bohServiceCharge: serviceCharge * 0.4,
      fohServiceCharge: serviceCharge * 0.6,
      importStatus: date ? "Imported" : `Skipped row ${index + 1}`,
    };
  }).filter((row) => row.dateFrom && (row.totalSales || row.netSales || row.foodSales || row.serviceCharge));
}

function parseLabourCsv(text, fallbackDate = today()) {
  const rows = parseCsvText(text);
  if (!rows.length) return [];
  const headers = rows[0] || [];
  const mapping = {
    date: findHeaderIndex(headers, ["date", "shiftdate", "weekstart", "datefrom", "businessdate"]),
    dateTo: findHeaderIndex(headers, ["dateto", "enddate", "weekend", "periodto"]),
    employeeName: findHeaderIndex(headers, ["employee", "employeename", "name", "staff", "worker"]),
    firstName: findHeaderIndex(headers, ["firstname", "first name", "first"]),
    lastName: findHeaderIndex(headers, ["lastname", "last name", "surname", "last"]),
    departmentName: findHeaderIndex(headers, ["department", "dept", "role", "team"]),
    hours: findHeaderIndex(headers, ["totalpaidhours", "total paid hours", "hours", "hourstotal", "time", "paidhours"]),
    regularHours: findHeaderIndex(headers, ["regularhours", "regular hours"]),
    overtimeHours: findHeaderIndex(headers, ["overtimehours", "overtime hours"]),
    doubleTimeHours: findHeaderIndex(headers, ["doubletimehours", "double-time hours", "double time hours"]),
    wages: findHeaderIndex(headers, ["totallabourcost", "total labour cost", "wages", "wage", "pay", "labourcost", "cost"]),
    serviceCharge: findHeaderIndex(headers, ["servicecharge", "tronc", "transactiontips", "transaction tips", "tips", "gratuity"]),
    rate: findHeaderIndex(headers, ["rate", "hourlyrate", "payrate"]),
  };
  const hasHeader = Object.values(mapping).some((index) => index >= 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallback = hasHeader ? mapping : { date: 0, dateTo: -1, employeeName: 1, firstName: -1, lastName: -1, departmentName: 2, hours: 3, regularHours: -1, overtimeHours: -1, doubleTimeHours: -1, wages: 4, serviceCharge: 5, rate: 6 };
  return dataRows.map((cells) => {
    const at = (field) => Number(fallback[field]) >= 0 ? cells[Number(fallback[field])] : "";
    const date = normalizeImportDate(at("date")) || fallbackDate;
    const firstName = at("firstName");
    const lastName = at("lastName");
    const employeeName = (at("employeeName") || `${firstName || ""} ${lastName || ""}`.trim() || "Unknown employee").trim();
    const regularHours = parseCurrencyCell(at("regularHours"));
    const overtimeHours = parseCurrencyCell(at("overtimeHours"));
    const doubleTimeHours = parseCurrencyCell(at("doubleTimeHours"));
    const hours = parseCurrencyCell(at("hours")) || regularHours + overtimeHours + doubleTimeHours;
    const wages = parseCurrencyCell(at("wages"));
    const rate = parseCurrencyCell(at("rate")) || (hours && wages ? wages / hours : 0);
    return {
      id: uid(),
      source: "square-hours-csv",
      date,
      dateTo: normalizeImportDate(at("dateTo")) || date,
      employeeName,
      departmentName: at("departmentName") || "",
      hours,
      wages,
      serviceCharge: parseCurrencyCell(at("serviceCharge")),
      tronc: parseCurrencyCell(at("serviceCharge")),
      rate,
      importStatus: "Imported from hours CSV",
    };
  }).filter((row) => row.date && row.employeeName && row.employeeName !== "Unknown employee" && (row.hours || row.wages || row.serviceCharge));
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
  const [wasteItems, setWasteItemsState] = useState(() => safeReadLocalStorageArray("marginflow.waste", initialWaste));
  const [creditNotes, setCreditNotesState] = useState(() => safeReadLocalStorageArray("marginflow.creditNotes", []));
  const [recipes, setRecipesState] = useState(() => safeReadLocalStorageArray("marginflow.recipes", initialRecipes));
  const [menus, setMenusState] = useState(() => safeReadLocalStorageArray("marginflow.menus", initialMenus));
  const [companySettings, setCompanySettingsState] = useState(() => safeReadLocalStorage("marginflow.companySettings", defaultCompanySettings));
  const [financialSettings, setFinancialSettingsState] = useState(() => ({ ...defaultFinancialSettings, ...safeReadLocalStorage("marginflow.financialSettings", defaultFinancialSettings) }));
  const [menuSettings, setMenuSettingsState] = useState(() => safeReadLocalStorage("marginflow.menuSettings", defaultMenuSettings));
  const [invoiceSettings, setInvoiceSettingsState] = useState(() => safeReadLocalStorage("marginflow.invoiceSettings", defaultInvoiceSettings));
  const [aiSettings, setAiSettingsState] = useState(() => safeReadLocalStorage("marginflow.aiSettings", defaultAiSettings));
  const [dateRangeState, setDateRangeState] = useState({ preset: "This Month", startDate: "2026-06-01", endDate: today() });
  const [labourDateRangeState, setLabourDateRangeState] = useState({ preset: "This Week", startDate: "2026-06-01", endDate: today() });
  const [labourData, setLabourDataState] = useState(() => normalizeLabourData(safeReadLocalStorage("marginflow.labour", createInitialLabourData())));
  const [draft, setDraft] = useState(() => emptyInvoiceDraft());
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const setProducts = storedStateUpdater(setProductsState, "marginflow.products");
  const setSuppliers = storedStateUpdater(setSuppliersState, "marginflow.suppliers");
  const setInvoices = storedStateUpdater(setInvoicesState, "marginflow.invoices");
  const setSales = storedStateUpdater(setSalesState, "marginflow.sales");
  const setStocktakes = storedStateUpdater(setStocktakesState, "marginflow.stocktakes");
  const setWasteItems = storedStateUpdater(setWasteItemsState, "marginflow.waste");
  const setCreditNotes = storedStateUpdater(setCreditNotesState, "marginflow.creditNotes");
  const setRecipes = storedStateUpdater(setRecipesState, "marginflow.recipes");
  const setMenus = storedStateUpdater(setMenusState, "marginflow.menus");
  const setLabourData = storedStateUpdater(setLabourDataState, "marginflow.labour");

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

  const appMode = companySettings.appMode || defaultCompanySettings.appMode;
  const isWorkEdition = appMode === "Work Edition: Non-AI";
  const visibleNavItems = navItems.filter((item) => !(isWorkEdition && item.id === "ai"));
  const dateRange = useMemo(() => resolveDateRange(dateRangeState, financialSettings.weekStartsOn), [dateRangeState, financialSettings.weekStartsOn]);
  const labourDateRange = useMemo(() => resolveDateRange(labourDateRangeState, financialSettings.weekStartsOn), [labourDateRangeState, financialSettings.weekStartsOn]);
  const metrics = useMemo(() => calculateMetrics(invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings), [invoices, sales, department, stocktakes, wasteItems, dateRange, departmentNames, financialSettings]);
  const supplierSpend = useMemo(() => spendBySupplier(invoices, suppliers, dateRange), [invoices, suppliers, dateRange]);
  const departmentSupplierSpend = useMemo(() => spendBySupplier(invoices, suppliers, dateRange, department), [invoices, suppliers, dateRange, department]);
  const gpTarget = targetForDepartment(departmentSettings, department, financialSettings.targetGp);
  const ActiveIcon = visibleNavItems.find((item) => item.id === active)?.icon || Home;
  const hasDepartmentContext = departmentContextPages.includes(active);

  useEffect(() => {
    if (isWorkEdition && active === "ai") setActive("dashboard");
  }, [active, isWorkEdition]);

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
    const normalizedItems = draft.items.map((item) => normalizeInvoiceLineForSave(item, supplier, invoiceSettings.defaultInvoiceDepartment));
    const invoice = prepareApprovedInvoice({
      id: draft.editingInvoiceId || uid(),
      invoiceNumber: draft.invoiceNumber || `MF-${String(invoices.length + 1).padStart(4, "0")}`,
      supplier,
      date: draft.date || today(),
      status: "Approved",
      discountAmount: numberValue(draft.discountAmount, 0),
      discountPercent: numberValue(draft.discountPercent, 0),
      items: normalizedItems,
    });
    setInvoices((current) => (
      draft.editingInvoiceId
        ? current.map((item) => (item.id === draft.editingInvoiceId ? invoice : item))
        : [invoice, ...current]
    ));
    setCreditNotes((current) => syncCreditNotesForInvoice(current, invoice));
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(removeInvoiceProductHistory(current, invoice.id), invoice.items, invoice.date, invoice));
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
          {visibleNavItems.map((item) => {
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
          <strong>Work Edition workflows</strong>
          <p>Invoices use manual entry, CSV import and supplier parsers with review steps before changes affect GP.</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MarginFlow v3</p>
            <h1>{visibleNavItems.find((item) => item.id === active)?.label}</h1>
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
            supplierSpend={departmentSupplierSpend}
            wasteItems={wasteItems}
          />
        )}
        {active === "invoices" && (
          <Invoices
            aiSettings={aiSettings}
            creditNotes={creditNotes}
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
            setCreditNotes={setCreditNotes}
            setInvoices={setInvoices}
          />
        )}
        {active === "products" && <Products departmentNames={departmentNames} products={products} requestDelete={requestDelete} setProducts={setProducts} suppliers={suppliers} />}
        {active === "suppliers" && <Suppliers creditNotes={creditNotes} invoices={invoices} products={products} requestDelete={requestDelete} setCreditNotes={setCreditNotes} suppliers={suppliers} setSuppliers={setSuppliers} supplierSpend={supplierSpend} />}
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
          <SalesAnalysis
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
            weekStartsOn={financialSettings.weekStartsOn}
            stocktakes={stocktakes}
            suppliers={suppliers}
            supplierSpend={departmentSupplierSpend}
            wasteItems={wasteItems}
          />
        )}
        {active === "labour" && (
          <LabourPage
            dateRange={labourDateRange}
            dateRangeState={labourDateRangeState}
            financialSettings={financialSettings}
            labourData={labourData}
            requestDelete={requestDelete}
            sales={sales}
            setDateRangeState={setLabourDateRangeState}
            setLabourData={setLabourData}
          />
        )}
        {active === "settings" && (
          <SettingsPanel
            aiSettings={aiSettings}
            companySettings={companySettings}
            departmentSettings={departmentSettings}
            financialSettings={financialSettings}
            invoiceSettings={invoiceSettings}
            menuSettings={menuSettings}
            suppliers={suppliers}
            requestDelete={requestDelete}
            setCompanySettings={setCompanySettings}
            setDepartmentSettings={setDepartmentSettings}
            setFinancialSettings={setFinancialSettings}
            setAiSettings={setAiSettings}
            setInvoiceSettings={setInvoiceSettings}
            setMenuSettings={setMenuSettings}
          />
        )}
        {deleteConfirmation && (
          <ConfirmDeleteModal
            open={Boolean(deleteConfirmation)}
            message={deleteConfirmation.message}
            onCancel={() => setDeleteConfirmation(null)}
            onConfirm={confirmDelete}
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

function PerformanceSummaryCards({ metrics, dateRangeState, dateRange, department, gpTarget }) {
  return (
    <div className="metric-grid performance-grid">
      <Metric label="Gross Sales" value={money(metrics.grossSales)} delta={rangeLabel(dateRangeState, dateRange)} />
      <Metric label="Net Sales" value={money(metrics.netSales)} delta="Used for GP" />
      <Metric label="Purchases" value={money(metrics.purchases)} delta={department} />
      <Metric label="Invoice GP %" value={percent(metrics.invoiceGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.invoiceGp >= gpTarget ? "good" : "warn"} />
      <Metric label="Stocktake GP %" value={percent(metrics.stocktakeGp)} delta="Opening + purchases - closing" tone={metrics.stocktakeGp >= gpTarget ? "good" : "warn"} />
      <Metric label="Waste Cost" value={money(metrics.waste)} delta={`${percent(metrics.wastePercent)} of GP base`} tone="warn" />
      <Metric label="Real GP incl. waste" value={percent(metrics.realGp)} delta={`Target ${percent(gpTarget)}`} tone={metrics.realGp >= gpTarget ? "good" : "warn"} />
    </div>
  );
}

function dashboardChartGranularity(rows, range) {
  const periodDays = range?.start && range?.end ? dateRangeLength(range) : rows.length;
  if (periodDays <= 7) return "Day";
  if (periodDays <= 120) return "Week";
  return "Month";
}

function dashboardWeekLabel(date) {
  const start = startOfWeek(parseDate(date));
  const end = addDays(start, 6);
  return `${formatRangeDate(toIsoDate(start))} - ${formatRangeDate(toIsoDate(end))}`;
}

function chartTitlePrefix(granularity) {
  if (granularity === "Month") return "Monthly";
  if (granularity === "Week") return "Weekly";
  return "Daily";
}

function dashboardMonthLabel(date) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(parseDate(date));
}

function aggregateDashboardRows(rows, range) {
  const granularity = dashboardChartGranularity(rows, range);
  if (granularity === "Day") return { granularity, rows: rows.map((row) => ({ ...row, label: row.day || formatRangeDate(row.date) })) };

  const buckets = new Map();
  rows.forEach((row) => {
    const parsed = parseDate(row.date);
    const key = granularity === "Month"
      ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`
      : toIsoDate(startOfWeek(parsed));
    const label = granularity === "Month" ? dashboardMonthLabel(row.date) : dashboardWeekLabel(row.date);
    const existing = buckets.get(key) || {
      id: key,
      date: key,
      day: label,
      label,
      grossSales: 0,
      netSales: 0,
      purchases: 0,
      waste: 0,
    };
    existing.grossSales += numberValue(row.grossSales);
    existing.netSales += numberValue(row.netSales);
    existing.purchases += numberValue(row.purchases);
    existing.waste += numberValue(row.waste);
    buckets.set(key, existing);
  });

  const groupedRows = [...buckets.values()].map((row) => ({
    ...row,
    invoiceGp: row.netSales ? ((row.netSales - row.purchases) / row.netSales) * 100 : 0,
    stocktakeGp: row.netSales ? ((row.netSales - row.purchases) / row.netSales) * 100 : 0,
    realGp: row.netSales ? ((row.netSales - row.purchases - row.waste) / row.netSales) * 100 : 0,
  }));

  return { granularity, rows: groupedRows };
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
          <Metric label="Net Sales change" value={percent(changePercent(metrics.netSales, comparisonMetrics.netSales))} delta={`${money(comparisonMetrics.netSales)} comparison`} tone={metrics.netSales >= comparisonMetrics.netSales ? "good" : "warn"} />
          <Metric label="Purchases change" value={percent(changePercent(metrics.purchases, comparisonMetrics.purchases))} delta={`${money(comparisonMetrics.purchases)} comparison`} tone={metrics.purchases <= comparisonMetrics.purchases ? "good" : "warn"} />
          <Metric label="GP change" value={percent(metrics.invoiceGp - comparisonMetrics.invoiceGp)} delta={`${percent(comparisonMetrics.invoiceGp)} comparison`} tone={metrics.invoiceGp >= comparisonMetrics.invoiceGp ? "good" : "warn"} />
          <Metric label="Waste change" value={percent(changePercent(metrics.waste, comparisonMetrics.waste))} delta={`${money(comparisonMetrics.waste)} comparison`} tone={metrics.waste <= comparisonMetrics.waste ? "good" : "warn"} />
        </div>
      )}
    </Panel>
  );
}

function PerformanceCharts({ dateRange, departmentRows, dailyRows, gpTarget, metrics, supplierSpend }) {
  const hasData = Boolean(metrics.sales || metrics.purchases || metrics.waste || supplierSpend.some((row) => row.spend));
  const sortedSuppliers = [...supplierSpend].sort((a, b) => b.spend - a.spend);
  const totalSupplierSpend = sortedSuppliers.reduce((sum, row) => sum + numberValue(row.spend), 0);
  const chartData = aggregateDashboardRows(dailyRows, dateRange);
  const chartPrefix = chartTitlePrefix(chartData.granularity);

  if (!hasData) return <EmptyState />;

  return (
    <>
      <div className="dashboard-layout">
        <Panel title={`${chartPrefix} GP trend`} action={`${chartData.granularity} view`}>
          <DailyGpChart rows={chartData.rows} targetGp={gpTarget} />
        </Panel>
        <Panel title={`${chartPrefix} sales vs purchases`} action={`${chartData.granularity} totals`}>
          <SalesPurchasesChart rows={chartData.rows} />
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
      <PerformanceSummaryCards metrics={metrics} dateRangeState={dateRangeState} dateRange={dateRange} department={department} gpTarget={gpTarget} />
      <PerformanceCharts dateRange={dateRange} departmentRows={departmentRows} dailyRows={dailyRows} gpTarget={gpTarget} metrics={metrics} supplierSpend={supplierSpend} suppliers={suppliers} />
      <ComparisonCards comparisonMode={comparisonMode} setComparisonMode={setComparisonMode} comparisonMetrics={comparisonMetrics} metrics={metrics} />
      {showSalesManager && <SalesManager financialSettings={financialSettings} departmentNames={departmentNames} requestDelete={requestDelete} sales={sales} setSales={setSales} />}
    </>
  );
}

function Dashboard({ dateRange, dateRangeState, department, departmentNames, departmentSettings, financialSettings, gpTarget, invoices, metrics, sales, setDateRangeState, stocktakes, suppliers, supplierSpend, wasteItems }) {
  const allDepartmentMetrics = useMemo(
    () => calculateMetrics(invoices, sales, "All departments", stocktakes, wasteItems, dateRange, departmentNames, financialSettings),
    [invoices, sales, stocktakes, wasteItems, dateRange, departmentNames, financialSettings]
  );
  const selectedHasGpBase = numberValue(metrics.netSales) > 0;
  const shouldUseAllDepartments = department !== "All departments" && !selectedHasGpBase && numberValue(allDepartmentMetrics.netSales) > 0;
  const dashboardDepartment = shouldUseAllDepartments ? "All departments" : department;
  const dashboardMetrics = shouldUseAllDepartments ? allDepartmentMetrics : metrics;
  const dashboardTarget = shouldUseAllDepartments ? numberValue(financialSettings.targetGp, gpTarget) : gpTarget;
  const dashboardSupplierSpend = shouldUseAllDepartments ? supplierSpend : spendBySupplier(invoices, suppliers, dateRange, dashboardDepartment);
  const recentInvoices = [...dashboardMetrics.invoices]
    .map((invoice) => ({ ...invoice, departmentTotal: (invoice.items || []).reduce((sum, item) => sum + lineTotalForDepartment(item, dashboardDepartment, invoice), 0) }))
    .filter((invoice) => dashboardDepartment === "All departments" || invoice.departmentTotal > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {shouldUseAllDepartments && (
        <div className="notice-card">
          Dashboard is showing all departments because {department} has no sales in this date range.
        </div>
      )}
      <PerformanceSections dateRange={dateRange} dateRangeState={dateRangeState} department={dashboardDepartment} departmentNames={departmentNames} departmentSettings={departmentSettings} financialSettings={financialSettings} gpTarget={dashboardTarget} invoices={invoices} metrics={dashboardMetrics} sales={sales} setDateRangeState={setDateRangeState} stocktakes={stocktakes} suppliers={suppliers} supplierSpend={dashboardSupplierSpend} wasteItems={wasteItems} />
      <div className="dashboard-layout secondary">
        <Panel title="Recent invoices">
          <DataTable
            columns={[
              { key: "invoiceNumber", label: "Invoice" },
              { key: "supplier", label: "Supplier" },
              { key: "date", label: "Date" },
              { key: "total", label: "Total", render: (_, row) => money(row.departmentTotal) },
            ]}
            rows={recentInvoices}
          />
        </Panel>
        <Panel title="Cost alerts">
          <InsightList metrics={dashboardMetrics} />
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

function Invoices({ aiSettings, departmentNames, draft, setDraft, invoiceSettings, invoices, suppliers, setSuppliers, products, setProducts, approveInvoice, setCreditNotes, setInvoices }) {
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMode, setManualMode] = useState("Simple Mode");
  const [cancelUploadOpen, setCancelUploadOpen] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const defaultManualSupplier = suppliers[0]?.name || draft.supplier || "";
  const defaultManualDepartment = invoiceSettings.defaultInvoiceDepartment || departmentNames[0] || "Kitchen Made";
  const createManualDraft = () => ({
    supplier: defaultManualSupplier,
    invoiceNumber: "",
    date: today(),
    total: "",
    department: defaultManualDepartment,
    invoiceDiscountAmount: 0,
    invoiceDiscountPercent: 0,
    items: [
      emptyInvoiceLine(defaultManualSupplier, defaultManualDepartment),
      emptyInvoiceLine(defaultManualSupplier, defaultManualDepartment),
      emptyInvoiceLine(defaultManualSupplier, defaultManualDepartment),
    ],
  });
  const [manualDraft, setManualDraft] = useState(createManualDraft);
  const isReading = draft.status === "Reading invoice with AI...";
  const statusTone = draft.status.startsWith("AI failed") ? "error" : draft.status.startsWith("AI extracted") ? "success" : "info";
  const showCreateSupplier = draft.supplier.trim() && !supplierExists(suppliers, draft.supplier);
  const hasUploadDraft = Boolean(draft.files.length || draft.items.length || draft.invoiceText || draft.status !== "Idle" || draft.supplier || draft.invoiceNumber);

  const resetUploadDraft = () => {
    setDraft({ files: [], invoiceText: "", items: [], supplier: "", date: today(), invoiceNumber: "", status: "Idle" });
    setUploadInputKey((current) => current + 1);
    setCancelUploadOpen(false);
  };

  const requestCancelUpload = () => {
    if (!hasUploadDraft) {
      resetUploadDraft();
      return;
    }
    setCancelUploadOpen(true);
  };

  const addFiles = async (files) => {
    const uploaded = Array.from(files || []);
    if (!uploaded.length) return;
    setDraft((current) => ({ ...current, files: [...current.files, ...uploaded], status: `${uploaded.length} file(s) uploaded. Ready for AI reading.` }));
    const uploadedText = await textFromInvoiceFiles(uploaded);
    if (uploadedText) {
      setDraft((current) => ({
        ...current,
        invoiceText: [current.invoiceText, uploadedText].filter(Boolean).join("\n\n"),
        status: `${uploaded.length} file(s) uploaded. Ready for AI reading.`,
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
    const aiFiles = await invoiceFilesForAi(draft.files);

    if (!invoiceText && !aiFiles.length) {
      setDraft((current) => ({ ...current, status: "AI failed. Please upload a PDF/photo or enter the invoice manually." }));
      return;
    }

    setDraft((current) => ({ ...current, invoiceText, status: "Reading invoice with AI..." }));

    try {
      const response = await fetch("/.netlify/functions/read-invoice-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceText,
          files: aiFiles,
          suppliers,
          products: products.map((product) => ({
            name: product.productName || product.name,
            supplier: product.supplier,
            packSize: product.packSize,
            aliases: product.aliases || [],
          })),
        }),
      });
      const payload = await response.json().catch(() => ({ error: "AI returned an invalid response" }));
      if (!response.ok) throw new Error(payload.detail || payload.error || "AI failed");

      const supplier = payload.supplier || draft.supplier || "Unknown Supplier";
      const items = (payload.lines || []).map((line) => {
        const quantity = numberValue(line.quantity, 1);
        const unitCost = numberValue(line.unitCost, 0);
        return enrichInvoiceLine(
          {
            id: uid(),
            productName: line.productName || "Unknown product",
            packSize: line.packSize || "",
            quantity,
            unitCost,
            supplier,
            department: line.department || line.suggested_department || departmentForProduct(line.productName, departmentNames, invoiceSettings.defaultInvoiceDepartment),
            source: "OpenAI",
          },
          products,
          aiSettings
        );
      });

      setDraft((current) => ({
        ...current,
        supplier,
        invoiceNumber: payload.invoiceNumber || current.invoiceNumber,
        date: preferredInvoiceDateForSupplier(supplier, invoiceText, payload.invoiceDate || current.date || today()),
        items,
        status: `AI extracted ${items.length} lines. Please review before approving.`,
      }));
    } catch (error) {
      setDraft((current) => ({ ...current, status: `AI could not read this invoice. Please try a clearer photo, upload a PDF, or enter it manually. ${error.message}` }));
    }
  };

  const updateDraftItem = (id, field, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? updateInvoiceLineForEditor(item, field, value, { products, matchingSettings: aiSettings, departmentNames }) : item),
    }));
  };

  const setDraftDepartmentMode = (id, mode) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? setInvoiceLineDepartmentMode(item, mode, departmentNames, invoiceSettings.defaultInvoiceDepartment) : item),
    }));
  };

  const updateDraftSplit = (id, splitIndex, field, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? updateInvoiceLineSplit(item, splitIndex, field, value, departmentNames) : item),
    }));
  };

  const addDraftSplit = (id) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? addInvoiceLineSplit(item, departmentNames) : item),
    }));
  };

  const removeDraftSplit = (id, splitIndex) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? removeInvoiceLineSplit(item, splitIndex, departmentNames, invoiceSettings.defaultInvoiceDepartment) : item),
    }));
  };

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

  const openManualInvoice = () => {
    const supplier = draft.supplier || suppliers[0]?.name || "";
    const department = invoiceSettings.defaultInvoiceDepartment || departmentNames[0] || "Kitchen Made";
    setManualMode("Simple Mode");
    setManualDraft({
      supplier,
      invoiceNumber: "",
      date: today(),
      total: "",
      department,
      invoiceDiscountAmount: 0,
      invoiceDiscountPercent: 0,
      items: [emptyInvoiceLine(supplier, department), emptyInvoiceLine(supplier, department), emptyInvoiceLine(supplier, department)],
    });
    setManualOpen(true);
  };

  const updateManualField = (field, value) => {
    setManualDraft((current) => ({ ...current, [field]: value }));
  };

  const updateManualLine = (id, field, value) => {
    setManualDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? updateInvoiceLineForEditor(item, field, value, { products, matchingSettings: aiSettings, departmentNames }) : item),
    }));
  };

  const setManualDepartmentMode = (id, mode) => {
    setManualDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? setInvoiceLineDepartmentMode(item, mode, departmentNames, current.department || defaultManualDepartment) : item),
    }));
  };

  const updateManualSplit = (id, splitIndex, field, value) => {
    setManualDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? updateInvoiceLineSplit(item, splitIndex, field, value, departmentNames) : item),
    }));
  };

  const addManualSplit = (id) => {
    setManualDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? addInvoiceLineSplit(item, departmentNames) : item),
    }));
  };

  const removeManualSplit = (id, splitIndex) => {
    setManualDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? removeInvoiceLineSplit(item, splitIndex, departmentNames, current.department || defaultManualDepartment) : item),
    }));
  };

  const addManualInvoiceLine = () => {
    setManualDraft((current) => ({
      ...current,
      items: [...current.items, emptyInvoiceLine(current.supplier, current.department || defaultManualDepartment)],
    }));
  };

  const removeManualInvoiceLine = (id) => {
    setManualDraft((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
  };

  const saveManualInvoice = () => {
    const supplier = manualDraft.supplier?.trim() || "Unknown Supplier";
    const date = manualDraft.date || today();
    let items = [];

    if (manualMode === "Simple Mode") {
      const total = numberValue(manualDraft.total, 0);
      if (total <= 0) return;
      items = [{
        id: uid(),
        productName: "Manual invoice total",
        packSize: "",
        quantity: 1,
        unitCost: total,
        discountAmount: 0,
        discountPercent: 0,
        supplier,
        department: manualDraft.department || defaultManualDepartment,
        status: "Received",
        lineStatus: "Received",
        matchStatus: "Manual invoice",
        matchConfidence: 1,
      }];
    } else {
      items = manualDraft.items
        .filter((item) => item.productName?.trim() && invoiceEditorNetLineTotal(item) > 0)
        .map((item) => normalizeInvoiceLineForSave(item, supplier, manualDraft.department || defaultManualDepartment));
      if (!items.length) return;
    }

    items = items.map((item) => normalizeInvoiceLineForSave(item, supplier, manualDraft.department || defaultManualDepartment));
    if (items.some((item) => !splitIsValid(item))) return;

    const invoice = prepareApprovedInvoice({
      id: uid(),
      invoiceNumber: manualDraft.invoiceNumber?.trim() || `MAN-${String(invoices.length + 1).padStart(4, "0")}`,
      supplier,
      date,
      status: "Approved",
      source: "Manual invoice",
      discountAmount: numberValue(manualDraft.invoiceDiscountAmount, 0),
      discountPercent: numberValue(manualDraft.invoiceDiscountPercent, 0),
      items,
    });

    setInvoices((current) => [invoice, ...current]);
    setCreditNotes((current) => syncCreditNotesForInvoice(current, invoice));
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(removeInvoiceProductHistory(current, invoice.id), invoice.items, date, invoice));
    setManualOpen(false);
  };

  const openEditInvoice = (invoice) => {
    setEditDraft({
      ...invoice,
      items: (invoice.items || []).map((item) => ({ ...item, id: item.id || uid() })),
    });
  };

  const updateEditInvoice = (field, value) => {
    setEditDraft((current) => ({ ...current, [field]: value }));
  };

  const updateEditLine = (id, field, value) => {
    setEditDraft((current) => ({
      ...current,
      items: (current.items || []).map((item) => item.id === id ? updateInvoiceLineForEditor(item, field, value, { products, matchingSettings: aiSettings, departmentNames }) : item),
    }));
  };

  const setEditDepartmentMode = (id, mode) => {
    setEditDraft((current) => ({
      ...current,
      items: (current.items || []).map((item) => item.id === id ? setInvoiceLineDepartmentMode(item, mode, departmentNames, invoiceSettings.defaultInvoiceDepartment) : item),
    }));
  };

  const updateEditSplit = (id, splitIndex, field, value) => {
    setEditDraft((current) => ({
      ...current,
      items: (current.items || []).map((item) => item.id === id ? updateInvoiceLineSplit(item, splitIndex, field, value, departmentNames) : item),
    }));
  };

  const addEditSplit = (id) => {
    setEditDraft((current) => ({
      ...current,
      items: (current.items || []).map((item) => item.id === id ? addInvoiceLineSplit(item, departmentNames) : item),
    }));
  };

  const removeEditSplit = (id, splitIndex) => {
    setEditDraft((current) => ({
      ...current,
      items: (current.items || []).map((item) => item.id === id ? removeInvoiceLineSplit(item, splitIndex, departmentNames, invoiceSettings.defaultInvoiceDepartment) : item),
    }));
  };

  const addEditLine = () => {
    const supplier = editDraft?.supplier || suppliers[0]?.name || "Unknown Supplier";
    setEditDraft((current) => ({
      ...current,
      items: [
        ...(current.items || []),
        emptyInvoiceLine(supplier, invoiceSettings.defaultInvoiceDepartment),
      ],
    }));
  };

  const saveEditInvoice = () => {
    if (!editDraft) return;
    const supplier = editDraft.supplier || editDraft.items?.[0]?.supplier || "Unknown Supplier";
    const items = (editDraft.items || []).map((item) => normalizeInvoiceLineForSave(item, supplier, invoiceSettings.defaultInvoiceDepartment));
    if (items.some((item) => !splitIsValid(item))) return;
    const cleaned = prepareApprovedInvoice({
      ...editDraft,
      supplier,
      status: editDraft.status || "Approved",
      items,
    });
    setInvoices((current) => current.map((invoice) => invoice.id === cleaned.id ? cleaned : invoice));
    setCreditNotes((current) => syncCreditNotesForInvoice(current, cleaned));
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(removeInvoiceProductHistory(current, cleaned.id), cleaned.items, cleaned.date, cleaned));
    setEditDraft(null);
  };

  const confirmDeleteInvoice = () => {
    if (!deleteTarget) return;
    setInvoices((current) => current.filter((invoice) => invoice.id !== deleteTarget.id));
    setCreditNotes((current) => current.filter((note) => note.invoiceId !== deleteTarget.id));
    setProducts((current) => removeInvoiceProductHistory(current, deleteTarget.id));
    setDeleteTarget(null);
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
            <input key={uploadInputKey} accept="image/*,.pdf,.txt,.csv,.tsv,text/plain,text/csv" multiple onChange={(event) => addFiles(event.target.files)} type="file" />
          </label>
        </div>
        <div className="invoice-meta">
          <SupplierSelector id="supplier-list" suppliers={suppliers} value={draft.supplier} onChange={(value) => setDraft({ ...draft, supplier: value })} />
          <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label>Invoice number<input value={draft.invoiceNumber} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} /></label>
        </div>
        {showCreateSupplier && (
          <div className="button-row left tight">
            <button className="ghost" onClick={createSupplier} type="button"><Plus size={16} />Create supplier</button>
          </div>
        )}
        <div className="file-list">
          {draft.files.map((file, index) => (
            <span key={`${file.name}-${index}`}>{file.name}<button onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><X size={14} /></button></span>
          ))}
        </div>
        {draft.status !== "Idle" && <div className={`invoice-status ${statusTone}`}>{draft.status}</div>}
        <div className="button-row left">
          <button disabled={isReading} onClick={readInvoice} type="button"><Sparkles size={16} />Read Invoice</button>
          <button className="ghost" onClick={openManualInvoice} type="button"><Plus size={16} />Add Manual Invoice</button>
          <button disabled={!draft.items.length || isReading} onClick={approveInvoice} type="button"><Save size={16} />Confirm Invoice</button>
          {hasUploadDraft && (
            <button className="danger-button" disabled={isReading} onClick={requestCancelUpload} type="button"><X size={16} />Cancel Upload</button>
          )}
        </div>
      </Panel>

      <Panel title="Review invoice lines" action={`${draft.items.length} line(s)`}>
        <InvoiceLineEditor
          addSplit={addDraftSplit}
          applySuggestion={applySuggestion}
          departmentNames={departmentNames}
          items={draft.items}
          removeLine={(id) => setDraft((current) => ({ ...current, items: current.items.filter((line) => line.id !== id) }))}
          removeSplit={removeDraftSplit}
          setDepartmentMode={setDraftDepartmentMode}
          updateLine={updateDraftItem}
          updateSplit={updateDraftSplit}
        />
      </Panel>

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
          onDelete={(id) => setDeleteTarget(invoices.find((invoice) => invoice.id === id))}
          onEdit={(row) => openEditInvoice(row)}
          rows={invoices}
        />
      </Panel>

      <AppModal
        title="Cancel upload?"
        open={cancelUploadOpen}
        onClose={() => setCancelUploadOpen(false)}
        footer={(
          <>
            <button className="ghost" onClick={() => setCancelUploadOpen(false)} type="button">Keep editing</button>
            <button className="danger-button" onClick={resetUploadDraft} type="button"><X size={16} />Cancel upload</button>
          </>
        )}
      >
        <p className="modal-copy">This will clear the uploaded file, extracted invoice lines and current review draft. Approved invoices will not be deleted.</p>
      </AppModal>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Delete invoice?"
        message={<span>This will remove invoice <strong>{deleteTarget?.invoiceNumber}</strong> from supplier spend, GP calculations, product history and price history.</span>}
        confirmLabel="Delete invoice"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteInvoice}
        confirmIcon={<Trash2 size={16} />}
        dangerButtonClassName="danger-button"
      />

      <AppModal
        title="View / Edit invoice"
        open={Boolean(editDraft)}
        onClose={() => { setEditDraft(null); }}
        wide
        footer={(
          <>
            <button className="ghost" onClick={() => { setEditDraft(null); }} type="button">Cancel</button>
            <button onClick={saveEditInvoice} type="button"><Save size={16} />Save changes</button>
          </>
        )}
      >
        {editDraft && (
          <div className="modal-stack">
            <div className="form-grid six">
              <SupplierSelector id="supplier-list-edit" suppliers={suppliers} value={editDraft.supplier || ""} onChange={(value) => updateEditInvoice("supplier", value)} />
              <label>Invoice number<input value={editDraft.invoiceNumber || ""} onChange={(event) => updateEditInvoice("invoiceNumber", event.target.value)} /></label>
              <label>Date<input type="date" value={editDraft.date || today()} onChange={(event) => updateEditInvoice("date", event.target.value)} /></label>
              <Field label="Invoice total" readOnly value={money(invoiceTotal(editDraft))} />
            </div>
            <InvoiceLineEditor
              addSplit={addEditSplit}
              departmentNames={departmentNames}
              items={editDraft.items || []}
              removeLine={(id) => setEditDraft((current) => ({ ...current, items: (current.items || []).filter((line) => line.id !== id) }))}
              removeSplit={removeEditSplit}
              setDepartmentMode={setEditDepartmentMode}
              updateLine={updateEditLine}
              updateSplit={updateEditSplit}
              wrapClassName="table-wrap modal-table invoice-review-table-wrap"
            />
            <div className="button-row left tight"><button className="ghost" onClick={addEditLine} type="button"><Plus size={16} />Add line</button></div>
          </div>
        )}
      </AppModal>

      <AppModal
        title="Add Manual Invoice"
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        wide
        footer={(
          <>
            <button className="ghost" onClick={() => setManualOpen(false)} type="button">Cancel</button>
            <button onClick={saveManualInvoice} type="button"><Save size={16} />Save Invoice</button>
          </>
        )}
      >
        <div className="modal-stack">
          <div className="mode-tabs">
            {['Simple Mode', 'Complete Mode'].map((mode) => (
              <button className={manualMode === mode ? 'active' : ''} key={mode} onClick={() => setManualMode(mode)} type="button">{mode}</button>
            ))}
          </div>

          {manualMode === "Simple Mode" ? (
            <div className="form-grid five">
              <SupplierSelector id="supplier-list-manual" suppliers={suppliers} value={manualDraft.supplier} onChange={(value) => updateManualField("supplier", value)} />
              <label>Invoice number<input value={manualDraft.invoiceNumber} onChange={(event) => updateManualField("invoiceNumber", event.target.value)} /></label>
              <label>Date<input type="date" value={manualDraft.date} onChange={(event) => updateManualField("date", event.target.value)} /></label>
              <label>Total price<input min="0" step="0.01" type="number" value={manualDraft.total} onChange={(event) => updateManualField("total", event.target.value)} /></label>
              <label>Department<select value={manualDraft.department} onChange={(event) => updateManualField("department", event.target.value)}>{departmentNames.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
            </div>
          ) : (
            <>
              <div className="form-grid five">
                <SupplierSelector id="supplier-list-manual-complete" suppliers={suppliers} value={manualDraft.supplier} onChange={(value) => updateManualField("supplier", value)} />
                <label>Invoice number<input value={manualDraft.invoiceNumber} onChange={(event) => updateManualField("invoiceNumber", event.target.value)} /></label>
                <label>Date<input type="date" value={manualDraft.date} onChange={(event) => updateManualField("date", event.target.value)} /></label>
                <DiscountEditor
                  amount={manualDraft.invoiceDiscountAmount}
                  percent={manualDraft.invoiceDiscountPercent}
                  amountLabel="Invoice discount £"
                  percentLabel="Invoice discount %"
                  onAmountChange={(value) => updateManualField("invoiceDiscountAmount", value)}
                  onPercentChange={(value) => updateManualField("invoiceDiscountPercent", value)}
                />
              </div>
              <InvoiceLineEditor
                addSplit={addManualSplit}
                departmentNames={departmentNames}
                items={manualDraft.items}
                removeLine={removeManualInvoiceLine}
                removeSplit={removeManualSplit}
                setDepartmentMode={setManualDepartmentMode}
                updateLine={updateManualLine}
                updateSplit={updateManualSplit}
                wrapClassName="table-wrap modal-table manual-invoice-table invoice-review-table-wrap"
              />
              <div className="button-row left tight"><button className="ghost" onClick={addManualInvoiceLine} type="button"><Plus size={16} />Add line</button></div>
            </>
          )}
        </div>
      </AppModal>
    </div>
  );
}


function SupplierSelector({ id, label = "Supplier", suppliers, value, onChange }) {
  return (
    <label>
      {label}
      <input list={id} value={value || ""} onChange={(event) => onChange(event.target.value)} />
      <datalist id={id}>
        {suppliers.map((supplier) => <option key={supplier.id || supplier.name} value={supplier.name} />)}
      </datalist>
    </label>
  );
}

function DiscountEditor({ amount, percent, onAmountChange, onPercentChange, amountLabel = "Discount £", percentLabel = "Discount %", asCells = false }) {
  const amountInput = <input min="0" step="0.01" type="number" value={amount ?? 0} onChange={(event) => onAmountChange(event.target.value)} />;
  const percentInput = <input min="0" max="100" step="0.01" type="number" value={percent ?? 0} onChange={(event) => onPercentChange(event.target.value)} />;

  if (asCells) {
    return (
      <>
        <td>{amountInput}</td>
        <td>{percentInput}</td>
      </>
    );
  }

  return (
    <>
      <label>{amountLabel}{amountInput}</label>
      <label>{percentLabel}{percentInput}</label>
    </>
  );
}

function InvoiceLineEditor({
  addSplit,
  applySuggestion,
  departmentNames,
  items,
  removeLine,
  removeSplit,
  setDepartmentMode,
  updateLine,
  updateSplit,
  wrapClassName = "table-wrap invoice-review-table-wrap",
}) {
  const headers = ["Product", "Pack size", "Quantity", "Unit cost", "Discount £", "Discount %", "Department / split", "Status", "Supplier", "Net line total", ""];

  return (
    <div className={wrapClassName}>
      <table className="invoice-review-table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = invoiceLineStatus(item);
            const netTotal = invoiceEditorNetLineTotal(item);
            return (
              <tr key={item.id}>
                <td>
                  <input title={item.productName || ""} value={item.productName || ""} onChange={(event) => updateLine(item.id, "productName", event.target.value)} />
                  {item.suggestedProductName && applySuggestion && (
                    <button className="match-hint" onClick={() => applySuggestion(item.id)} type="button">
                      Did you mean: {item.suggestedProductName}?
                    </button>
                  )}
                  {!item.suggestedProductName && item.matchStatus && <small className="line-note">{item.matchStatus}</small>}
                </td>
                <td><input value={item.packSize || ""} onChange={(event) => updateLine(item.id, "packSize", event.target.value)} /></td>
                <td><input min="0" step="0.01" type="number" value={item.quantity ?? 0} onChange={(event) => updateLine(item.id, "quantity", event.target.value)} /></td>
                <td><input min="0" step="0.01" type="number" value={item.unitCost ?? 0} onChange={(event) => updateLine(item.id, "unitCost", event.target.value)} /></td>
                <DiscountEditor
                  amount={item.lineDiscountAmount ?? item.discountAmount ?? 0}
                  percent={item.lineDiscountPercent ?? item.discountPercent ?? 0}
                  onAmountChange={(value) => updateLine(item.id, "lineDiscountAmount", value)}
                  onPercentChange={(value) => updateLine(item.id, "lineDiscountPercent", value)}
                  asCells
                />
                <td>
                  <DepartmentSplitEditor
                    addSplit={() => addSplit(item.id)}
                    departmentNames={departmentNames}
                    item={item}
                    lineTotalValue={netTotal}
                    removeSplit={(splitIndex) => removeSplit(item.id, splitIndex)}
                    setMode={(mode) => setDepartmentMode(item.id, mode)}
                    updateDepartment={(value) => updateLine(item.id, "department", value)}
                    updateSplit={(splitIndex, field, value) => updateSplit(item.id, splitIndex, field, value)}
                  />
                </td>
                <td>
                  <select value={status} onChange={(event) => updateLine(item.id, "lineStatus", event.target.value)}>
                    {invoiceLineStatuses.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </td>
                <td><input value={item.supplier || ""} onChange={(event) => updateLine(item.id, "supplier", event.target.value)} /></td>
                <td>{money(netTotal)}</td>
                <td><button className="icon danger" onClick={() => removeLine(item.id)} type="button"><Trash2 size={15} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function DepartmentSplitEditor({ item, departmentNames, lineTotalValue, setMode, updateDepartment, updateSplit, addSplit, removeSplit }) {
  const mode = item.departmentMode === "Split" || (Array.isArray(item.departmentSplits) && item.departmentSplits.length > 1) ? "Split" : "Single";
  const splits = normalizedDepartmentSplits(item, departmentNames);
  const percentTotal = splits.reduce((sum, split) => sum + numberValue(split.percentage, 0), 0);
  if (mode === "Single") {
    return (
      <div className="department-split-editor compact">
        <select value="Single" onChange={(event) => setMode(event.target.value)}>
          <option value="Single">Single</option>
          <option value="Split">Split</option>
        </select>
        <select value={item.department || splits[0]?.department || departmentNames[0]} onChange={(event) => updateDepartment(event.target.value)}>
          {departmentNames.map((dept) => <option key={dept}>{dept}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="department-split-editor">
      <div className="split-mode-row">
        <select value="Split" onChange={(event) => setMode(event.target.value)}>
          <option value="Single">Single</option>
          <option value="Split">Split</option>
        </select>
        <span className={Math.abs(percentTotal - 100) < 0.01 ? "split-total ok" : "split-total warn"}>{percentTotal.toFixed(0)}%</span>
      </div>
      <div className="split-lines">
        {splits.map((split, index) => (
          <div className="split-line" key={`${item.id}-split-${index}`}>
            <select value={split.department} onChange={(event) => updateSplit(index, "department", event.target.value)}>
              {departmentNames.map((dept) => <option key={dept}>{dept}</option>)}
            </select>
            <input min="0" max="100" step="1" type="number" value={split.percentage} onChange={(event) => updateSplit(index, "percentage", event.target.value)} />
            <span>{money((lineTotalValue * numberValue(split.percentage, 0)) / 100)}</span>
            {splits.length > 1 && <button className="icon small" onClick={() => removeSplit(index)} type="button"><X size={12} /></button>}
          </div>
        ))}
      </div>
      <button className="ghost mini-button" onClick={addSplit} type="button"><Plus size={12} />Add split</button>
      {Math.abs(percentTotal - 100) >= 0.01 && <small className="line-note warn-text">Split must total 100%</small>}
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

function Suppliers({ creditNotes, invoices, products, requestDelete, setCreditNotes, suppliers, setSuppliers, supplierSpend }) {
  const empty = { name: "", category: "", contact: "", email: "", phone: "", active: true };
  const emptyBulkRow = () => ({ ...empty, id: uid() });
  const [form, setForm] = useState(empty);
  const [bulkRows, setBulkRows] = useState([emptyBulkRow(), emptyBulkRow()]);
  const [pendingImport, setPendingImport] = useState([]);
  const [status, setStatus] = useState("");
  const [importFileKey, setImportFileKey] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSupplierTab, setActiveSupplierTab] = useState("Details");
  const supplierIssues = combinedSupplierIssues(creditNotes, invoices);
  const supplierRows = supplierSpend.map((supplier) => {
    const summary = supplierIssueSummary(supplierIssues, supplier.name);
    return { ...supplier, openIssues: summary.openIssues, valueToChase: summary.valueToChase };
  });
  const supplierTabs = ["Details", "Invoices", "Products", "Credit Notes / Issues", "Price History"];
  const selectedSupplierName = form.name;
  const selectedSupplierIssues = supplierIssues.filter((note) => note.supplier === selectedSupplierName);
  const selectedSupplierInvoices = invoices
    .filter((invoice) => invoice.supplier === selectedSupplierName)
    .map((invoice) => ({ ...invoice, issueCount: supplierIssues.filter((note) => note.invoiceId === invoice.id).length }));
  const selectedSupplierProducts = products.filter((product) => product.supplier === selectedSupplierName);
  const selectedSupplierPriceHistory = products.flatMap((product) => (
    (product.priceHistory || [])
      .filter((entry) => entry.supplier === selectedSupplierName)
      .map((entry, index) => ({
        id: `${product.id}-${entry.date}-${index}`,
        product: product.name,
        date: entry.date,
        supplier: entry.supplier,
        price: entry.price,
      }))
  ));

  const saveSupplier = () => {
    if (!form.name.trim()) return;
    const payload = {
      id: editingId,
      name: form.name,
      category: form.category,
      contact: form.contact,
      email: form.email,
      phone: form.phone,
      active: Boolean(form.active),
    };
    setSuppliers((current) => current.map((supplier) => (supplier.id === editingId ? { ...supplier, ...payload } : supplier)));
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
      setForm({ ...empty, ...row });
      setEditingId(row.id);
      setActiveSupplierTab("Details");
      setModalOpen(true);
      return;
    }
    setBulkRows([emptyBulkRow(), emptyBulkRow()]);
    setPendingImport([]);
    setStatus("");
    setEditingId("");
    setActiveSupplierTab("Details");
    setModalOpen(true);
  };

  const updateIssue = (id, patch) => {
    setCreditNotes((current) => current.map((note) => (note.id === id ? { ...note, ...patch } : note)));
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
            { key: "openIssues", label: "Open issues", render: (value) => value > 0 ? <Badge tone="amber">{value} open</Badge> : <Badge tone="green">0</Badge> },
            { key: "valueToChase", label: "Value to chase", render: (value, row) => row.openIssues > 0 ? <Badge tone="amber">{money(value)}</Badge> : money(0) },
            { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "amber"}>{value ? "Active" : "Inactive"}</Badge> },
          ]}
          onDelete={(id) => requestDelete({ title: "Delete supplier", message: "Are you sure you want to delete this supplier?", onConfirm: () => setSuppliers((current) => current.filter((supplier) => supplier.id !== id)) })}
          onEdit={openSupplierModal}
          rows={supplierRows}
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
          <div className="modal-tabs">
            {supplierTabs.map((tab) => (
              <button className={activeSupplierTab === tab ? "active" : ""} key={tab} onClick={() => setActiveSupplierTab(tab)} type="button">{tab}</button>
            ))}
          </div>
          {activeSupplierTab === "Details" && (
            <div className="form-grid six">
              <Field label="Supplier name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
              <Field label="Contact" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
              <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
              <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <label>Status<select value={form.active ? "Active" : "Inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
            </div>
          )}
          {activeSupplierTab === "Invoices" && (
            <DataTable
              columns={[
                { key: "invoiceNumber", label: "Invoice" },
                { key: "date", label: "Date" },
                { key: "items", label: "Lines", render: (items) => items.length },
                { key: "total", label: "Total", render: (_, row) => money(invoiceTotal(row)) },
                { key: "issueCount", label: "Issues", render: (value) => value > 0 ? <Badge tone="amber">{value}</Badge> : <Badge tone="green">0</Badge> },
              ]}
              rows={selectedSupplierInvoices}
            />
          )}
          {activeSupplierTab === "Products" && (
            <DataTable
              columns={[
                { key: "name", label: "Product" },
                { key: "packSize", label: "Pack size" },
                { key: "quantity", label: "Quantity" },
                { key: "unitCost", label: "Unit cost", render: (value) => money(value) },
                { key: "department", label: "Department" },
              ]}
              rows={selectedSupplierProducts}
            />
          )}
          {activeSupplierTab === "Credit Notes / Issues" && (
            <DataTable
              columns={[
                { key: "invoiceNumber", label: "Invoice" },
                { key: "date", label: "Invoice date" },
                { key: "product", label: "Product" },
                { key: "quantity", label: "Quantity" },
                { key: "value", label: "Value", render: (_, row) => money(issueValue(row)) },
                { key: "reason", label: "Reason" },
                { key: "status", label: "Status", render: (_, row) => (
                  <select value={row.status || "To chase"} onChange={(event) => updateIssue(row.id, { status: event.target.value })}>
                    {creditNoteStatuses.map((statusOption) => <option key={statusOption}>{statusOption}</option>)}
                  </select>
                ) },
                { key: "notes", label: "Notes", render: (_, row) => <input value={row.notes || ""} onChange={(event) => updateIssue(row.id, { notes: event.target.value })} /> },
                { key: "actions", label: "Actions", render: (_, row) => (
                  <div className="row-actions">
                    <button className="ghost" onClick={() => updateIssue(row.id, { status: "Chased" })} type="button">Chased</button>
                    <button className="ghost" onClick={() => updateIssue(row.id, { status: "Credit received" })} type="button">Received</button>
                    <button className="ghost danger" onClick={() => updateIssue(row.id, { status: "Rejected" })} type="button">Reject</button>
                  </div>
                ) },
              ]}
              rows={selectedSupplierIssues}
            />
          )}
          {activeSupplierTab === "Price History" && (
            <DataTable
              columns={[
                { key: "date", label: "Date" },
                { key: "product", label: "Product" },
                { key: "price", label: "Price", render: (value) => money(value) },
              ]}
              rows={selectedSupplierPriceHistory}
            />
          )}
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
  const [csvWizard, setCsvWizard] = useState(null);
  const [smartSalesImport, setSmartSalesImport] = useState(null);
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
      department: canonicalSalesDepartmentName(form.department),
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

  const openCsvWizardFromRows = (fileName, csvRowsRaw, statusPrefix = "CSV") => {
    if (!csvRowsRaw.length) {
      setStatus("CSV import found no readable rows.");
      return;
    }
    const headers = csvRowsRaw[0] || [];
    const mapping = loadSalesCsvTemplate("Manual CSV", headers);
    const dataRows = csvRowsRaw.slice(1);
    const preview = salesRowsFromCsvMapping(dataRows, mapping, defaultVatRate, financialSettings.salesInputMethod);
    setCsvWizard({
      fileName,
      headers,
      rows: dataRows,
      mapping,
      templateName: "Manual CSV",
      previewRows: preview.rows,
      errors: preview.errors,
      saveTemplate: false,
    });
    setStatus(preview.validRows.length
      ? `${preview.validRows.length} ${statusPrefix} row(s) detected. Review mapping before import.`
      : `CSV headers detected: ${headers.join(", ") || "No headers"}. Map the columns manually.`);
  };

  const importSales = async (file) => {
    if (!file) return;
    setCsvWizard(null);
    setSmartSalesImport(null);
    setStatus("Analysing sales CSV...");
    const text = await file.text();
    const { csvRowsRaw, preview } = analyzeSalesCsvLocally(file.name, text, defaultVatRate);
    if (!csvRowsRaw.length) {
      setStatus("CSV import found no readable rows.");
      return;
    }

    if (preview?.confidence >= 0.85 && preview.rows.length) {
      setSmartSalesImport(preview);
      setStatus(`${preview.source} ${preview.reportType.toLowerCase()} detected. Review the clean preview before confirming.`);
      return;
    }

    openCsvWizardFromRows(file.name, csvRowsRaw, "CSV");
  };

  const updateCsvMapping = (field, value) => {
    setCsvWizard((current) => {
      if (!current) return current;
      const mapping = { ...current.mapping, [field]: Number(value) };
      const preview = salesRowsFromCsvMapping(current.rows, mapping, defaultVatRate, financialSettings.salesInputMethod);
      return { ...current, mapping, previewRows: preview.rows, errors: preview.errors };
    });
  };

  const updateCsvTemplate = (templateName) => {
    setCsvWizard((current) => {
      if (!current) return current;
      const mapping = loadSalesCsvTemplate(templateName, current.headers);
      const preview = salesRowsFromCsvMapping(current.rows, mapping, defaultVatRate, financialSettings.salesInputMethod);
      return { ...current, templateName, mapping, previewRows: preview.rows, errors: preview.errors };
    });
  };

  const confirmCsvWizard = () => {
    if (!csvWizard) return;
    const preview = salesRowsFromCsvMapping(csvWizard.rows, csvWizard.mapping, defaultVatRate, financialSettings.salesInputMethod);
    if (!preview.validRows.length) {
      setStatus("No valid sales rows yet. Check the column mapping.");
      return;
    }
    if (csvWizard.saveTemplate) saveSalesCsvTemplate(csvWizard.templateName || "Manual CSV", csvWizard.mapping);
    setPendingImport(preview.validRows);
    setCsvWizard(null);
    const invalidCount = preview.rows.length - preview.validRows.length;
    setStatus(invalidCount
      ? `${preview.validRows.length} sales row(s) ready. ${invalidCount} row(s) were skipped because date/gross sales were missing.`
      : `${preview.validRows.length} sales row(s) ready for review.`);
  };

  const openAdvancedOptions = () => {
    if (!smartSalesImport) return;
    openCsvWizardFromRows(smartSalesImport.fileName, smartSalesImport.csvRowsRaw || [smartSalesImport.headers, ...smartSalesImport.rawRows], "CSV");
    setSmartSalesImport(null);
  };

  const confirmSmartSalesImport = () => {
    if (!smartSalesImport?.rows?.length) {
      setStatus("No smart import rows are ready yet.");
      return;
    }
    const rowsToImport = smartSalesImport.rows.map((row) => ({ ...row, id: uid() }));
    setSales((current) => [...rowsToImport, ...current]);
    setSmartSalesImport(null);
    setImportFileKey((current) => current + 1);
    setStatus(`${rowsToImport.length} sales row(s) imported from ${smartSalesImport.source}.`);
  };

  const cancelSmartSalesImport = () => {
    setSmartSalesImport(null);
    setImportFileKey((current) => current + 1);
    setStatus("Sales import cancelled.");
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
        <label className="file-button secondary">Smart CSV Import<input accept=".csv,text/csv" key={importFileKey} onChange={(event) => importSales(event.target.files?.[0])} type="file" /></label>
      </div>
      {status && <div className="invoice-status info">{status}</div>}
      {smartSalesImport && (
        <SmartSalesImportPreview
          onAdvanced={openAdvancedOptions}
          onCancel={cancelSmartSalesImport}
          onConfirm={confirmSmartSalesImport}
          preview={smartSalesImport}
        />
      )}
      {csvWizard && (
        <SalesCsvImportWizard
          defaultVatRate={defaultVatRate}
          financialSettings={financialSettings}
          onCancel={() => { setCsvWizard(null); setImportFileKey((current) => current + 1); setStatus("CSV import cancelled."); }}
          onConfirm={confirmCsvWizard}
          updateCsvMapping={updateCsvMapping}
          updateCsvTemplate={updateCsvTemplate}
          wizard={csvWizard}
          setWizard={setCsvWizard}
        />
      )}
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
  const currentRangeLabel = formatComparisonRange(current);
  const previousRangeLabel = formatComparisonRange(previous);

  return (
    <Panel title="Sales comparison" action={`${currentRangeLabel} vs ${previousRangeLabel}`}>
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
          <div className="comparison-period-summary">
            <div>
              <span>Selected period</span>
              <strong>{currentRangeLabel}</strong>
            </div>
            <div>
              <span>Compared with</span>
              <strong>{previousRangeLabel}</strong>
            </div>
          </div>
          <div className="metric-grid compact">
            <Metric label="Gross Sales difference" value={percent(changePercent(currentTotals.grossSales, previousTotals.grossSales))} delta={`${currentRangeLabel}: ${money(currentTotals.grossSales)} vs ${previousRangeLabel}: ${money(previousTotals.grossSales)}`} tone={currentTotals.grossSales >= previousTotals.grossSales ? "good" : "warn"} />
            <Metric label="Net Sales difference" value={percent(changePercent(currentTotals.netSales, previousTotals.netSales))} delta={`${currentRangeLabel}: ${money(currentTotals.netSales)} vs ${previousRangeLabel}: ${money(previousTotals.netSales)}`} tone={currentTotals.netSales >= previousTotals.netSales ? "good" : "warn"} />
            <Metric label="Average daily sales" value={money(currentTotals.averageDailySales)} delta={`${previousRangeLabel}: ${money(previousTotals.averageDailySales)}`} tone={currentTotals.averageDailySales >= previousTotals.averageDailySales ? "good" : "warn"} />
            <Metric label="VAT difference" value={percent(changePercent(currentTotals.vat, previousTotals.vat))} delta={`${currentRangeLabel}: ${money(currentTotals.vat)} vs ${previousRangeLabel}: ${money(previousTotals.vat)}`} tone={currentTotals.vat <= previousTotals.vat ? "good" : "warn"} />
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

function formatComparisonRange(range) {
  if (!range?.start || !range?.end) return "Selected dates";
  return `${formatRangeDate(range.start)} - ${formatRangeDate(range.end)}`;
}

function SalesComparisonBars({ title, current, previous, currentRange, previousRange }) {
  const max = Math.max(numberValue(current), numberValue(previous), 1);
  const currentRangeLabel = formatComparisonRange(currentRange);
  const previousRangeLabel = formatComparisonRange(previousRange);
  return (
    <div className="comparison-chart" aria-label={title}>
      <div className="comparison-title">{title}</div>
      <div className="comparison-bars">
        <div className="comparison-bar">
          <span style={{ height: `${(numberValue(previous) / max) * 100}%` }} title={`${previousRangeLabel}: ${money(previous)}`} />
          <small className="comparison-period">Compared period</small>
          <small className="comparison-date">{previousRangeLabel}</small>
          <strong>{money(previous)}</strong>
        </div>
        <div className="comparison-bar current">
          <span style={{ height: `${(numberValue(current) / max) * 100}%` }} title={`${currentRangeLabel}: ${money(current)}`} />
          <small className="comparison-period">Selected period</small>
          <small className="comparison-date">{currentRangeLabel}</small>
          <strong>{money(current)}</strong>
        </div>
      </div>
    </div>
  );
}

function SmartSalesImportPreview({ onAdvanced, onCancel, onConfirm, preview }) {
  const confidence = Math.round(numberValue(preview.confidence, 0) * 100);
  return (
    <div className="import-review smart-import-preview">
      <div className="panel-head">
        <h2>Smart sales import preview</h2>
        <span>{confidence}% confidence</span>
      </div>
      <div className="wizard-summary">
        <div><span>Detected source</span><strong>{preview.source}</strong></div>
        <div><span>Report type</span><strong>{displayReportType(preview.reportType)}</strong></div>
        <div><span>Date / range</span><strong>{smartImportDateLabel(preview)}</strong></div>
        <div><span>Rows ready</span><strong>{preview.rows.length}</strong></div>
        <div><span>Gross sales</span><strong>{money(preview.grossSalesTotal)}</strong></div>
        <div><span>Net sales</span><strong>{money(preview.netSalesTotal)}</strong></div>
        <div><span>VAT / tax</span><strong>{money(preview.vatTotal)}</strong></div>
        <div><span>Departments</span><strong>{preview.departments.join(", ") || "None"}</strong></div>
      </div>
      {preview.categories?.length > 0 && (
        <div className="stocktake-summary">
          <span>Categories detected</span>
          <strong>{preview.categories.join(", ")}</strong>
        </div>
      )}
      {preview.warnings?.length > 0 && <div className="invoice-status warn">{preview.warnings.join(" ")}</div>}
      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "department", label: "Department" },
          { key: "sourceCategory", label: "Source category" },
          { key: "grossSales", label: "Gross", render: money },
          { key: "sales", label: "Net", render: money },
          { key: "vatAmount", label: "VAT", render: money },
          { key: "discounts", label: "Discounts", render: money },
          { key: "refunds", label: "Refunds", render: money },
        ]}
        rows={preview.rows.slice(0, 50)}
      />
      <div className="button-row left">
        <button onClick={onConfirm} type="button"><Save size={16} />Confirm Import</button>
        <button className="secondary" onClick={onAdvanced} type="button"><Settings size={16} />Advanced options</button>
        <button className="ghost danger" onClick={onCancel} type="button"><X size={16} />Cancel</button>
      </div>
    </div>
  );
}

function SalesCsvImportWizard({ financialSettings, onCancel, onConfirm, setWizard, updateCsvMapping, updateCsvTemplate, wizard }) {
  const mappingFields = [
    ["date", "Date"],
    ["department", "Department / sales type"],
    ["grossSales", "Gross sales"],
    ["netSales", "Net sales"],
    ["vatAmount", "VAT amount"],
    ["vatRate", "VAT %"],
    ["serviceCharge", "Service charge"],
    ["discounts", "Discounts"],
    ["refunds", "Refunds"],
  ];
  const validRows = wizard.previewRows.filter((row) => row.date && row.grossSales > 0);
  const templates = ["Manual CSV", "Square", "Lightspeed", "EPOS Now", "Toast", "Zettle"];
  return (
    <EditModal title="CSV Import Wizard" onCancel={onCancel} onSave={onConfirm} saveLabel="Use these mapped rows">
      <div className="wizard-summary">
        <div><span>File</span><strong>{wizard.fileName}</strong></div>
        <div><span>Headers detected</span><strong>{wizard.headers.length}</strong></div>
        <div><span>Rows ready</span><strong>{validRows.length}</strong></div>
        <div><span>Rows needing review</span><strong>{Math.max(0, wizard.previewRows.length - validRows.length)}</strong></div>
      </div>
      <div className="form-grid six compact-form">
        <label>Template
          <select value={wizard.templateName} onChange={(event) => updateCsvTemplate(event.target.value)}>
            {templates.map((template) => <option key={template}>{template}</option>)}
          </select>
        </label>
        <CheckboxField checked={wizard.saveTemplate} label="Save this mapping for next time" onChange={(value) => setWizard((current) => ({ ...current, saveTemplate: value }))} />
      </div>
      <Panel title="Map CSV columns" action="Change any wrong matches before importing">
        <div className="form-grid six compact-form">
          {mappingFields.map(([field, label]) => (
            <label key={field}>{label}
              <select value={wizard.mapping[field] ?? -1} onChange={(event) => updateCsvMapping(field, event.target.value)}>
                <option value={-1}>Not used</option>
                {wizard.headers.map((header, index) => <option key={`${field}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Panel>
      {wizard.errors.length > 0 && (
        <div className="invoice-status warn">
          {wizard.errors.slice(0, 5).join(" · ")}{wizard.errors.length > 5 ? ` · ${wizard.errors.length - 5} more` : ""}
        </div>
      )}
      <Panel title="Import preview" action={`${validRows.length} ready`}>
        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "department", label: "Sales type" },
            { key: "grossSales", label: "Gross", render: money },
            { key: "sales", label: "Net", render: money },
            { key: "vatAmount", label: "VAT", render: (_, row) => money(vatAmountFromGrossNet(row.grossSales, row.sales)) },
            { key: "importStatus", label: "Status" },
          ]}
          rows={wizard.previewRows.slice(0, 50)}
        />
      </Panel>
      <div className="button-row left tight">
        <button className="ghost" onClick={onCancel} type="button">Cancel</button>
        <button onClick={onConfirm} type="button"><Save size={16} />Confirm Mapping</button>
      </div>
    </EditModal>
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

function LabourPage({ dateRange, dateRangeState, labourData, requestDelete, sales = [], setDateRangeState, setLabourData }) {
  const data = normalizeLabourData(labourData);
  const labourRows = useMemo(() => labourRowsInRange(data, dateRange), [data, dateRange]);
  const salesRows = useMemo(() => labourSalesInRange(data, dateRange), [data, dateRange]);
  const marginFlowSalesTotals = useMemo(() => {
    const totals = salesTotalsForRange(sales || [], dateRange, "All departments");
    const serviceCharge = totals.rows.reduce((sum, row) => sum + numberValue(row.serviceCharge, 0), 0);
    return {
      rows: totals.rows,
      totalSales: totals.grossSales || totals.netSales,
      netSales: totals.netSales,
      foodSales: totals.netSales,
      serviceCharge,
    };
  }, [sales, dateRange]);
  const importedLabourSalesTotals = useMemo(() => labourSalesTotals(salesRows), [salesRows]);
  const salesTotals = marginFlowSalesTotals.rows.length ? marginFlowSalesTotals : importedLabourSalesTotals;
  const salesSourceLabel = marginFlowSalesTotals.rows.length ? "Using Sales page data" : "Using Labour sales import fallback";
  const labourSummary = useMemo(() => labourTotals(labourRows), [labourRows]);
  const departmentRows = useMemo(() => labourDepartmentBreakdownRows(data, labourRows, salesTotals), [data, labourRows, salesTotals]);
  const employeeRows = useMemo(() => [...data.employees].sort((a, b) => a.name.localeCompare(b.name)), [data.employees]);
  const employeeOptions = useMemo(() => employeeRows.map((employee) => ({ id: employee.id, name: employee.name })), [employeeRows]);
  const holidaySummary = useMemo(() => labourHolidaySummary(data), [data]);
  const [status, setStatus] = useState("");
  const [employeeModal, setEmployeeModal] = useState(null);
  const [departmentModal, setDepartmentModal] = useState(null);
  const [salesModal, setSalesModal] = useState(null);
  const [holidayModal, setHolidayModal] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const [weeklyModal, setWeeklyModal] = useState(null);
  const [activeLabourModal, setActiveLabourModal] = useState(null);
  const [salesImportKey, setSalesImportKey] = useState(0);
  const [labourImportKey, setLabourImportKey] = useState(0);
  const [weeklyFilters, setWeeklyFilters] = useState({ search: "", department: "All", showInactive: false });
  const [labourFilters, setLabourFilters] = useState({ search: "", department: "All", active: "active" });
  const [earningsFilters, setEarningsFilters] = useState({ period: "week", weekStart: dateRange.start || today(), month: today().slice(0, 7), year: today().slice(0, 4), from: dateRange.start || today(), to: dateRange.end || today(), search: "", department: "All" });

  const saveData = (updater) => {
    setLabourData((current) => normalizeLabourData(typeof updater === "function" ? updater(normalizeLabourData(current)) : updater));
  };

  const blankEmployee = () => ({
    id: "",
    name: "",
    departmentId: data.departments[0]?.id || "",
    payType: "hourly",
    rate: 0,
    contractedHours: 0,
    manualAverageWeeklyHours: 0,
    startDate: today(),
    status: "active",
    holidayType: "zero-hours",
    holidayEntitlementDays: 28,
  });
  const blankDepartment = () => ({
    id: "",
    name: "",
    group: "FOH",
    targetPercent: 30,
    basis: "totalSales",
    serviceChargeShare: 1,
    active: true,
  });
  const blankSales = () => ({
    id: "",
    dateFrom: today(),
    dateTo: today(),
    totalSales: 0,
    netSales: 0,
    foodSales: 0,
    serviceCharge: 0,
    bohServiceCharge: 0,
    fohServiceCharge: 0,
    source: "manual",
  });
  const blankHoliday = () => ({
    id: "",
    employeeId: data.employees[0]?.id || "",
    employeeName: data.employees[0]?.name || "",
    dateFrom: today(),
    dateTo: today(),
    days: 1,
    hours: 0,
    status: "Booked",
  });
  const blankRate = () => ({
    id: "",
    employeeId: data.employees[0]?.id || "",
    employeeName: data.employees[0]?.name || "",
    effectiveDate: today(),
    rate: 0,
    payType: "hourly",
  });

  const replaceById = (rows, row) => {
    const id = row.id || uid();
    const next = { ...row, id };
    return rows.some((item) => item.id === id) ? rows.map((item) => (item.id === id ? next : item)) : [next, ...rows];
  };

  const deleteFromCollection = (collection, id, label) => {
    requestDelete({
      title: `Delete ${label}`,
      message: `Remove this ${label.toLowerCase()} from Labour? Existing historical rows are left untouched.`,
      onConfirm: () => saveData((current) => ({ ...current, [collection]: current[collection].filter((row) => row.id !== id) })),
    });
  };

  const salesTotalsForLabourWeek = (weekStart) => salesTotalsForRange(sales || [], { start: weekStart, end: shiftDate(weekStart, 6) }, "All departments");

  const openWeeklyInput = () => {
    const activeEmployees = data.employees.filter((employee) => employee.status !== "left");
    const weekStart = dateRange.start || today();
    const weekSales = salesTotalsForLabourWeek(weekStart);
    setWeeklyModal({
      mode: "weekly",
      date: weekStart,
      weekStart,
      serviceCharge: weekSales.serviceCharge || 0,
      salesTotal: weekSales.grossSales || weekSales.netSales || 0,
      netSales: weekSales.netSales || 0,
      foodSales: weekSales.netSales || 0,
      rows: activeEmployees.map((employee) => ({
        employeeId: employee.id,
        employeeName: employee.name,
        departmentId: employee.departmentId,
        departmentName: labourDepartmentName(data, employee.departmentId, "FOH"),
        hours: 0,
        rate: employee.payType === "annual" ? 0 : labourEmployeeRate(employee),
        wages: 0,
        serviceChargePoints: labourServiceChargePoints(employee),
        serviceChargeHours: 0,
        include: true,
      })),
    });
  };

  const saveEmployee = () => {
    const previousEmployee = data.employees.find((item) => item.id === employeeModal.id);
    const previousRate = numberValue(previousEmployee?.rate, 0);
    const nextRate = numberValue(employeeModal.rate, 0);
    const localRateHistory = Array.isArray(employeeModal.rateHistory) ? employeeModal.rateHistory : [];
    const rateChanged = previousEmployee && previousRate !== nextRate;
    const employee = {
      ...employeeModal,
      id: employeeModal.id || uid(),
      rate: nextRate,
      contractedHours: numberValue(employeeModal.contractedHours, 0),
      manualAverageWeeklyHours: numberValue(employeeModal.manualAverageWeeklyHours, 0),
      holidayEntitlementDays: numberValue(employeeModal.holidayEntitlementDays, 28),
      serviceChargePoints: numberValue(employeeModal.serviceChargePoints, 1),
      excludeFromServiceCharge: Boolean(employeeModal.excludeFromServiceCharge),
      rateHistory: rateChanged
        ? [{ id: uid(), effectiveDate: today(), oldRate: previousRate, newRate: nextRate, notes: "Rate updated in Employees" }, ...localRateHistory]
        : localRateHistory,
    };
    if (!employee.name.trim()) return;
    saveData((current) => ({
      ...current,
      employees: replaceById(current.employees, employee),
      rateHistory: rateChanged
        ? [{ id: uid(), employeeId: employee.id, employeeName: employee.name, effectiveDate: today(), payType: employee.payType, rate: nextRate, oldRate: previousRate }, ...current.rateHistory]
        : current.rateHistory,
    }));
    setEmployeeModal(null);
  };

  const saveDepartment = () => {
    const department = {
      ...departmentModal,
      id: departmentModal.id || uid(),
      targetPercent: numberValue(departmentModal.targetPercent, 0),
      serviceChargeShare: numberValue(departmentModal.serviceChargeShare, 1),
      active: departmentModal.active !== false && departmentModal.active !== "false",
    };
    if (!department.name.trim()) return;
    saveData((current) => ({ ...current, departments: replaceById(current.departments, department) }));
    setDepartmentModal(null);
  };

  const saveSales = () => {
    const serviceCharge = numberValue(salesModal.serviceCharge, 0);
    const sales = {
      ...salesModal,
      id: salesModal.id || uid(),
      dateTo: salesModal.dateTo || salesModal.dateFrom,
      totalSales: numberValue(salesModal.totalSales, 0),
      netSales: numberValue(salesModal.netSales, 0),
      foodSales: numberValue(salesModal.foodSales, 0),
      serviceCharge,
      bohServiceCharge: numberValue(salesModal.bohServiceCharge, serviceCharge * 0.4),
      fohServiceCharge: numberValue(salesModal.fohServiceCharge, serviceCharge * 0.6),
      source: salesModal.source || "manual",
    };
    if (!sales.dateFrom) return;
    saveData((current) => ({ ...current, sales: replaceById(current.sales, sales).sort((a, b) => String(b.dateFrom).localeCompare(String(a.dateFrom))) }));
    setSalesModal(null);
  };

  const saveHoliday = () => {
    const employee = data.employees.find((item) => item.id === holidayModal.employeeId);
    const holiday = {
      ...holidayModal,
      id: holidayModal.id || uid(),
      employeeName: employee?.name || holidayModal.employeeName,
      days: numberValue(holidayModal.days, 0),
      hours: numberValue(holidayModal.hours, 0),
    };
    saveData((current) => ({ ...current, holidays: replaceById(current.holidays, holiday) }));
    setHolidayModal(null);
  };

  const saveRate = () => {
    const employee = data.employees.find((item) => item.id === rateModal.employeeId);
    const rate = {
      ...rateModal,
      id: rateModal.id || uid(),
      employeeName: employee?.name || rateModal.employeeName,
      rate: numberValue(rateModal.rate, 0),
    };
    saveData((current) => ({
      ...current,
      rateHistory: replaceById(current.rateHistory, rate),
      employees: current.employees.map((employeeRow) => (
        employeeRow.id === rate.employeeId ? { ...employeeRow, rate: rate.rate, payType: rate.payType || employeeRow.payType } : employeeRow
      )),
    }));
    setRateModal(null);
  };

  const updateWeeklyWeekStart = (value) => {
    const weekStart = value || today();
    const weekSales = salesTotalsForLabourWeek(weekStart);
    setWeeklyModal((current) => ({
      ...current,
      weekStart,
      serviceCharge: weekSales.serviceCharge || 0,
      salesTotal: weekSales.grossSales || weekSales.netSales || 0,
      netSales: weekSales.netSales || 0,
      foodSales: weekSales.netSales || 0,
    }));
  };

  const updateWeeklyRow = (index, key, value) => {
    setWeeklyModal((current) => {
      const rows = current.rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [key]: ["hours", "wages", "serviceChargePoints"].includes(key) ? numberValue(value, 0) : value };
        if (key === "hours") next.wages = numberValue(next.hours, 0) * numberValue(next.rate, 0);
        next.serviceChargeHours = numberValue(next.hours, 0) * numberValue(next.serviceChargePoints, 1);
        return next;
      });
      return { ...current, rows };
    });
  };

  const allocateServiceCharge = (rows, pool) => {
    const weightedHours = rows.reduce((sum, row) => sum + numberValue(row.hours, 0) * numberValue(row.serviceChargePoints, 1), 0);
    return new Map(rows.map((row) => [
      row.employeeId,
      weightedHours ? (pool * numberValue(row.hours, 0) * numberValue(row.serviceChargePoints, 1)) / weightedHours : 0,
    ]));
  };

  const saveWeeklyInput = () => {
    const isDailyMode = weeklyModal.mode === "daily";
    const labourStartDate = isDailyMode ? (weeklyModal.date || weeklyModal.weekStart || today()) : (weeklyModal.weekStart || weeklyModal.date || today());
    const labourEndDate = isDailyMode ? labourStartDate : shiftDate(labourStartDate, 6);
    const rows = weeklyModal.rows.filter((row) => row.include && (numberValue(row.hours, 0) || numberValue(row.wages, 0)));
    const serviceCharge = numberValue(weeklyModal.serviceCharge, 0);
    const bohRows = rows.filter((row) => ["BOH", "KP"].includes(labourDepartmentName(data, row.departmentId, row.departmentName)));
    const fohRows = rows.filter((row) => labourDepartmentName(data, row.departmentId, row.departmentName) === "FOH");
    const bohPool = serviceCharge * 0.4;
    const fohPool = serviceCharge * 0.6;
    const bohAllocation = allocateServiceCharge(bohRows, bohPool);
    const fohAllocation = allocateServiceCharge(fohRows, fohPool);
    const labour = rows.map((row) => ({
      id: uid(),
      source: "manual-week",
      date: labourStartDate,
      dateTo: labourEndDate,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      departmentId: row.departmentId,
      departmentName: labourDepartmentName(data, row.departmentId, row.departmentName),
      hours: numberValue(row.hours, 0),
      rate: numberValue(row.rate, 0),
      wages: numberValue(row.wages, 0),
      serviceChargePoints: numberValue(row.serviceChargePoints, 1),
      serviceChargeHours: numberValue(row.hours, 0) * numberValue(row.serviceChargePoints, 1),
      serviceCharge: numberValue(bohAllocation.get(row.employeeId) || fohAllocation.get(row.employeeId), 0),
      tronc: numberValue(bohAllocation.get(row.employeeId) || fohAllocation.get(row.employeeId), 0),
    }));
    saveData((current) => ({
      ...current,
      labour: [...labour, ...current.labour],
      sales: current.sales,
    }));
    setWeeklyModal(null);
  };

  const importSalesFile = async (file) => {
    if (!file) return;
    const rows = parseLabourSalesCsv(await file.text());
    saveData((current) => ({ ...current, sales: [...rows, ...current.sales] }));
    setStatus(`Imported ${rows.length} Labour sales row(s).`);
    setSalesImportKey((key) => key + 1);
  };

  const importLabourFile = async (file) => {
    if (!file) return;
    const importedRows = parseLabourCsv(await file.text(), dateRange.start || today());
    saveData((current) => {
      const departments = [...current.departments];
      const employees = [...current.employees];
      const ensureDepartment = (name) => {
        let department = departments.find((item) => labourSameText(item.name, name));
        if (!department) {
          department = { ...blankDepartment(), id: uid(), name: name || "FOH" };
          departments.push(department);
        }
        return department;
      };
      const ensureEmployee = (row, department) => {
        let employee = labourFindEmployeeByName(employees, row.employeeName);
        if (!employee) {
          employee = {
            ...blankEmployee(),
            id: uid(),
            name: row.employeeName,
            departmentId: department.id,
            rate: numberValue(row.rate, 0),
          };
          employees.push(employee);
        }
        return employee;
      };
      const labour = importedRows.map((row) => {
        const department = ensureDepartment(row.departmentName);
        const employee = ensureEmployee(row, department);
        const hours = numberValue(row.hours, 0);
        const rate = labourEmployeeRate(employee) || numberValue(row.rate, 0);
        return {
          ...row,
          employeeId: employee.id,
          departmentId: department.id,
          departmentName: department.name,
          rate,
          wages: numberValue(row.wages, 0) || hours * rate,
          serviceChargePoints: labourServiceChargePoints(employee),
          serviceChargeHours: hours * labourServiceChargePoints(employee),
        };
      });
      return { ...current, departments, employees, labour: [...labour, ...current.labour] };
    });
    setStatus(`Imported ${importedRows.length} Labour row(s).`);
    setLabourImportKey((key) => key + 1);
  };

  const importWeeklyHoursFile = async (file) => {
    if (!file || !weeklyModal) return;
    const importedRows = parseLabourCsv(await file.text(), (weeklyModal.mode === "daily" ? weeklyModal.date : weeklyModal.weekStart) || dateRange.start || today());
    const matchedNames = [];
    const unmatchedNames = [];
    setWeeklyModal((current) => {
      if (!current) return current;
      const rows = current.rows.map((row) => ({ ...row }));
      importedRows.forEach((imported) => {
        const employee = labourFindEmployeeByName(data.employees, imported.employeeName);
        if (!employee) {
          unmatchedNames.push(imported.employeeName);
          return;
        }
        const rowIndex = rows.findIndex((row) => row.employeeId === employee.id);
        if (rowIndex < 0) {
          unmatchedNames.push(imported.employeeName);
          return;
        }
        const departmentId = employee.departmentId || rows[rowIndex].departmentId;
        const rate = labourEmployeeRate(employee);
        const hours = numberValue(imported.hours, 0);
        const serviceChargePoints = labourServiceChargePoints(employee);
        rows[rowIndex] = {
          ...rows[rowIndex],
          include: true,
          employeeId: employee.id,
          employeeName: employee.name,
          departmentId,
          departmentName: labourDepartmentName(data, departmentId, rows[rowIndex].departmentName),
          hours,
          rate,
          wages: hours * rate,
          serviceChargePoints,
          serviceChargeHours: hours * serviceChargePoints,
        };
        matchedNames.push(employee.name);
      });
      return { ...current, rows };
    });
    const uniqueUnmatched = [...new Set(unmatchedNames)].filter(Boolean);
    setStatus(uniqueUnmatched.length
      ? `Imported hours for ${matchedNames.length} employee(s). Unmatched: ${uniqueUnmatched.join(", ")}. Add or match them in Employees.`
      : `Imported hours for ${matchedNames.length} employee(s) from Square CSV.`);
    setLabourImportKey((key) => key + 1);
  };

  const resetLabourData = () => {
    requestDelete({
      title: "Reset Labour data",
      message: "Replace Labour data with the imported Labour Cost seed data?",
      onConfirm: () => {
        saveData(createInitialLabourData());
        setStatus("Labour data reset to imported seed data.");
      },
    });
  };

  const weeklyTotals = weeklyModal ? {
    hours: labourSum(weeklyModal.rows.filter((row) => row.include), "hours"),
    wages: labourSum(weeklyModal.rows.filter((row) => row.include), "wages"),
    serviceChargeHours: weeklyModal.rows.filter((row) => row.include).reduce((sum, row) => sum + numberValue(row.hours, 0) * numberValue(row.serviceChargePoints, 1), 0),
  } : { hours: 0, wages: 0, serviceChargeHours: 0 };

  const departmentFilterOptions = useMemo(() => {
    const values = new Set(["All", "BOH", "FOH", "Manager", "KP"]);
    data.departments.forEach((department) => {
      if (department.group) values.add(department.group);
      if (department.name) values.add(department.name);
    });
    return [...values];
  }, [data.departments]);

  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);
  const normaliseText = (value) => String(value || "").trim().toLowerCase();
  const employeeIsActive = (employee) => !employee || !employee.status || employee.status === "active";
  const rowEmployee = (row) => employeeById.get(row.employeeId) || labourFindEmployeeByName(data.employees, row.employeeName);
  const rowDepartmentName = (row) => labourDepartmentName(data, row.departmentId || rowEmployee(row)?.departmentId, row.departmentName || "-");
  const rowDepartmentGroup = (row) => data.departments.find((department) => department.id === (row.departmentId || rowEmployee(row)?.departmentId))?.group || rowDepartmentName(row);
  const matchesText = (text, query) => !normaliseText(query) || normaliseText(text).includes(normaliseText(query));
  const matchesDepartment = (row, filter) => {
    if (!filter || filter === "All") return true;
    const name = normaliseText(rowDepartmentName(row));
    const group = normaliseText(rowDepartmentGroup(row));
    const target = normaliseText(filter);
    return name === target || group === target || name.includes(target) || group.includes(target);
  };
  const matchesActive = (row, filter = "all") => {
    const employee = rowEmployee(row) || row;
    if (filter === "all") return true;
    if (filter === "inactive") return !employeeIsActive(employee);
    return employeeIsActive(employee);
  };
  const filterEmployeeRows = (rows, filters = labourFilters) => rows.filter((row) => (
    matchesText(row.name || row.employeeName, filters.search)
    && matchesDepartment(row, filters.department)
    && matchesActive(row, filters.active || (filters.showInactive ? "all" : "active"))
  ));
  const labourFilterControls = (filters, setFilters, options = {}) => (
    <div className="form-grid four labour-filter-bar">
      <Field label="Search employee" value={filters.search || ""} onChange={(value) => setFilters({ ...filters, search: value })} />
      <label>Department<select value={filters.department || "All"} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>{departmentFilterOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      {options.activeToggle ? (
        <label>Employees<select value={filters.active || "active"} onChange={(event) => setFilters({ ...filters, active: event.target.value })}><option value="active">Active only</option><option value="all">Active + inactive</option><option value="inactive">Inactive only</option></select></label>
      ) : null}
    </div>
  );
  const weeklyVisibleRows = weeklyModal ? weeklyModal.rows.map((row, index) => ({ ...row, index })).filter((row) => (
    matchesText(row.employeeName, weeklyFilters.search)
    && matchesDepartment(row, weeklyFilters.department)
    && (weeklyFilters.showInactive || employeeIsActive(rowEmployee(row)))
  )) : [];
  const earningsRange = (() => {
    if (earningsFilters.period === "month") {
      const start = `${earningsFilters.month || today().slice(0, 7)}-01`;
      const endDate = new Date(parseDate(start));
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      return { start, end: toIsoDate(endDate) };
    }
    if (earningsFilters.period === "year") return { start: `${earningsFilters.year || today().slice(0, 4)}-01-01`, end: `${earningsFilters.year || today().slice(0, 4)}-12-31` };
    if (earningsFilters.period === "custom") return { start: earningsFilters.from || dateRange.start, end: earningsFilters.to || dateRange.end };
    return { start: earningsFilters.weekStart || dateRange.start || today(), end: shiftDate(earningsFilters.weekStart || dateRange.start || today(), 6) };
  })();
  const earningsRowsRaw = labourRowsInRange(data, earningsRange);
  const earningsSalesRows = labourSalesInRange(data, earningsRange);
  const earningsImportedSalesTotals = labourSalesTotals(earningsSalesRows);
  const earningsMarginFlowSalesTotals = salesTotalsForRange(sales || [], earningsRange, "All departments");
  const earningsServiceCharge = earningsMarginFlowSalesTotals.rows.length
    ? earningsMarginFlowSalesTotals.rows.reduce((sum, row) => sum + numberValue(row.serviceCharge, 0), 0)
    : earningsImportedSalesTotals.serviceCharge;
  const earningsRows = filterEmployeeRows(aggregateLabourByEmployee(data, earningsRowsRaw, {
    serviceCharge: earningsServiceCharge,
    bohServiceCharge: earningsServiceCharge * 0.4,
    fohServiceCharge: earningsServiceCharge * 0.6,
  }), { ...earningsFilters, active: "all" });
  const activeHolidayRows = holidaySummary.rows.filter((row) => matchesActive(row, labourFilters.active || "active") && matchesText(row.name, labourFilters.search) && matchesDepartment(row, labourFilters.department));
  const activeHolidayBookings = data.holidays.filter((row) => matchesText(row.employeeName, labourFilters.search) && matchesDepartment(row, labourFilters.department) && matchesActive(row, labourFilters.active || "active"));
  const filteredEmployees = filterEmployeeRows(employeeRows, labourFilters);
  const filteredDepartments = data.departments.filter((department) => {
    const query = normaliseText(labourFilters.search);
    const departmentMatches = !query || normaliseText(department.name).includes(query) || normaliseText(department.group).includes(query);
    const filterMatches = !labourFilters.department || labourFilters.department === "All" || normaliseText(department.name) === normaliseText(labourFilters.department) || normaliseText(department.group) === normaliseText(labourFilters.department);
    return departmentMatches && filterMatches;
  });
  const filteredDepartmentRows = departmentRows.filter((row) => {
    const department = data.departments.find((item) => item.id === row.id) || { name: row.department, group: row.department };
    const query = normaliseText(labourFilters.search);
    const departmentMatches = !query || normaliseText(row.department).includes(query) || normaliseText(department.group).includes(query);
    const filterMatches = !labourFilters.department || labourFilters.department === "All" || normaliseText(row.department) === normaliseText(labourFilters.department) || normaliseText(department.group) === normaliseText(labourFilters.department);
    return departmentMatches && filterMatches;
  });
  const filteredRateRows = [...data.rateHistory].sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate))).filter((row) => matchesText(row.employeeName, labourFilters.search) && matchesDepartment(row, labourFilters.department) && matchesActive(row, labourFilters.active || "active"));

  return (
    <div className="page-grid">
      <Panel title="Weekly labour control" action={`${formatRangeDate(dateRange.start)} - ${formatRangeDate(dateRange.end)}`}>
        <DateRangeControls dateRangeState={dateRangeState} setDateRangeState={setDateRangeState} />
        <div className="button-row left labour-hub-actions">
          <button onClick={openWeeklyInput} type="button"><Plus size={16} />Input labour</button>
          <button className="ghost" onClick={() => setActiveLabourModal("imports")} type="button">Staff Earnings</button>
          <button className="ghost" onClick={() => setActiveLabourModal("employees")} type="button">Employees</button>
          <button className="ghost" onClick={() => setActiveLabourModal("departments")} type="button">Departments & breakdown</button>
          <button className="ghost" onClick={() => setActiveLabourModal("holidays")} type="button">Holidays</button>
          <button className="ghost" onClick={() => setActiveLabourModal("bookings")} type="button">Holiday bookings</button>
        </div>
        <div className="helper-text">{salesSourceLabel}. This page is designed to be managed weekly. Sales are pulled from the Sales page when available; use Input labour week for staff hours and wages.</div>
        {status && <div className="invoice-status">{status}</div>}
      </Panel>

      <div className="metric-grid">
        <Metric label="Food sales" value={money(salesTotals.foodSales)} delta={salesSourceLabel} tone="good" />
        <Metric label="Total sales" value={money(salesTotals.totalSales || salesTotals.netSales)} delta={`${salesRows.length} labour import row(s)`} />
        <Metric label="Labour cost" value={money(labourSummary.wages)} delta={`${numberValue(labourSummary.hours).toFixed(1)} hours`} />
        <Metric label="Labour %" value={percent(labourRatio(labourSummary.wages, salesTotals.totalSales || salesTotals.netSales))} delta="Cost / sales" tone={labourRatio(labourSummary.wages, salesTotals.totalSales || salesTotals.netSales) > 32 ? "warn" : "good"} />
        <Metric label="Target" value="32%" delta={labourRatio(labourSummary.wages, salesTotals.totalSales || salesTotals.netSales) > 32 ? "Above target" : "On/under target"} tone={labourRatio(labourSummary.wages, salesTotals.totalSales || salesTotals.netSales) > 32 ? "warn" : "good"} />
        <Metric label="Service charge" value={money(labourSummary.serviceCharge || salesTotals.serviceCharge)} delta="Allocated / sales page" />
        <Metric label="Holiday liability" value={money(holidaySummary.totalLiability)} delta={`${numberValue(holidaySummary.totalRemainingHours).toFixed(1)}h owed`} />
      </div>

      {activeLabourModal === "imports" && (
        <AppModal title="Staff Earnings" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            <div className="button-row left">
              <button className="ghost danger" onClick={resetLabourData} type="button">Reset Labour seed</button>
            </div>
            <div className="form-grid six labour-filter-bar">
              <label>Period<select value={earningsFilters.period} onChange={(event) => setEarningsFilters({ ...earningsFilters, period: event.target.value })}><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option><option value="custom">Custom dates</option></select></label>
              {earningsFilters.period === "week" && <Field label="Week start" type="date" value={earningsFilters.weekStart} onChange={(value) => setEarningsFilters({ ...earningsFilters, weekStart: value })} />}
              {earningsFilters.period === "month" && <Field label="Month" type="month" value={earningsFilters.month} onChange={(value) => setEarningsFilters({ ...earningsFilters, month: value })} />}
              {earningsFilters.period === "year" && <Field label="Year" type="number" value={earningsFilters.year} onChange={(value) => setEarningsFilters({ ...earningsFilters, year: value })} />}
              {earningsFilters.period === "custom" && <Field label="From" type="date" value={earningsFilters.from} onChange={(value) => setEarningsFilters({ ...earningsFilters, from: value })} />}
              {earningsFilters.period === "custom" && <Field label="To" type="date" value={earningsFilters.to} onChange={(value) => setEarningsFilters({ ...earningsFilters, to: value })} />}
              <Field label="Search employee" value={earningsFilters.search} onChange={(value) => setEarningsFilters({ ...earningsFilters, search: value })} />
              <label>Department<select value={earningsFilters.department} onChange={(event) => setEarningsFilters({ ...earningsFilters, department: event.target.value })}>{departmentFilterOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            </div>
            <div className="helper-text">Showing {formatRangeDate(earningsRange.start)} - {formatRangeDate(earningsRange.end)}. Gross pay uses locked employee rates. Service charge is allocated by hours × service charge points.</div>
            <DataTable
              columns={[
                { key: "employeeName", label: "Employee" },
                { key: "departmentName", label: "Department" },
                { key: "hours", label: "Hours", render: (value) => numberValue(value).toFixed(1) },
                { key: "wages", label: "Gross pay", render: money },
                { key: "serviceChargePoints", label: "SC points", render: (value) => numberValue(value, 0).toFixed(2) },
                { key: "serviceChargeHours", label: "SC hours", render: (value) => numberValue(value, 0).toFixed(1) },
                { key: "serviceCharge", label: "Service charge", render: money },
                { key: "serviceChargePerHour", label: "SC / h", render: money },
                { key: "total", label: "Total earned", render: (_, row) => money(numberValue(row.wages) + numberValue(row.serviceCharge)) },
              ]}
              rows={earningsRows}
            />
          </div>
        </AppModal>
      )}

      {activeLabourModal === "employees" && (
        <AppModal title="Employees" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            {labourFilterControls(labourFilters, setLabourFilters, { activeToggle: true })}
            <DataTable
              columns={[
                { key: "name", label: "Employee" },
                { key: "departmentId", label: "Department", render: (value) => labourDepartmentName(data, value, "-") },
                { key: "payType", label: "Pay type" },
                { key: "rate", label: "Rate", render: (_, row) => labourRateLabel(row) },
                { key: "serviceChargePoints", label: "SC points", render: (_, row) => row.excludeFromServiceCharge ? "Excluded" : numberValue(row.serviceChargePoints, 1).toFixed(2) },
                { key: "manualAverageWeeklyHours", label: "Avg hours", render: (value, row) => (numberValue(value) || labourEmployeeAverageWeeklyHours(data, row)).toFixed(1) },
                { key: "status", label: "Status", render: (value) => <Badge tone={value === "active" ? "green" : "orange"}>{value}</Badge> },
              ]}
              onDelete={(id) => deleteFromCollection("employees", id, "Employee")}
              onEdit={(row) => setEmployeeModal(row)}
              rows={filteredEmployees}
              toolbarAction={<button className="ghost" onClick={() => setEmployeeModal(blankEmployee())} type="button"><Plus size={16} />Add Employee</button>}
            />
          </div>
        </AppModal>
      )}

      {activeLabourModal === "departments" && (
        <AppModal title="Departments & breakdown" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            {labourFilterControls(labourFilters, setLabourFilters, { activeToggle: false })}
            <Panel title="Department breakdown" action="Actual vs target">
              <DataTable
                columns={[
                  { key: "department", label: "Department" },
                  { key: "basis", label: "Basis" },
                  { key: "hours", label: "Hours", render: (value) => numberValue(value).toFixed(1) },
                  { key: "wages", label: "Labour", render: money },
                  { key: "actual", label: "Actual %", render: percent },
                  { key: "target", label: "Target %", render: percent },
                  { key: "status", label: "Status", render: (value) => <Badge tone={value === "OK" ? "green" : "orange"}>{value}</Badge> },
                ]}
                rows={filteredDepartmentRows}
              />
            </Panel>
            <Panel title="Departments" action={`${data.departments.length} department(s)`}>
              <DataTable
                columns={[
                  { key: "name", label: "Department" },
                  { key: "group", label: "Group" },
                  { key: "basis", label: "Target basis", render: (value) => labourBasisLabels[value] || value },
                  { key: "targetPercent", label: "Target %", render: percent },
                  { key: "serviceChargeShare", label: "Service weight" },
                  { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "orange"}>{value ? "Active" : "Inactive"}</Badge> },
                ]}
                onDelete={(id) => deleteFromCollection("departments", id, "Department")}
                onEdit={(row) => setDepartmentModal(row)}
                rows={filteredDepartments}
                toolbarAction={<button className="ghost" onClick={() => setDepartmentModal(blankDepartment())} type="button"><Plus size={16} />Add Department</button>}
              />
            </Panel>
          </div>
        </AppModal>
      )}

      {activeLabourModal === "holidays" && (
        <AppModal title="Holidays" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            {labourFilterControls(labourFilters, setLabourFilters, { activeToggle: true })}
            <DataTable
              columns={[
                { key: "name", label: "Employee" },
                { key: "type", label: "Type" },
                { key: "avgWeekly", label: "Avg weekly", render: (value) => numberValue(value).toFixed(1) },
                { key: "accrued", label: "Accrued" },
                { key: "used", label: "Used" },
                { key: "projectedRemaining", label: "Projected left" },
                { key: "liability", label: "Liability", render: money },
                { key: "notes", label: "Notes" },
              ]}
              rows={activeHolidayRows}
              toolbarAction={<button className="ghost" onClick={() => setHolidayModal(blankHoliday())} type="button"><Plus size={16} />Add Holiday Booking</button>}
            />
          </div>
        </AppModal>
      )}

      {activeLabourModal === "bookings" && (
        <AppModal title="Holiday bookings" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            {labourFilterControls(labourFilters, setLabourFilters, { activeToggle: true })}
            <DataTable
              columns={[
                { key: "employeeName", label: "Employee" },
                { key: "dateFrom", label: "From" },
                { key: "dateTo", label: "To" },
                { key: "days", label: "Days" },
                { key: "hours", label: "Hours" },
                { key: "status", label: "Status" },
              ]}
              onDelete={(id) => deleteFromCollection("holidays", id, "Holiday")}
              onEdit={(row) => setHolidayModal(row)}
              rows={activeHolidayBookings}
              toolbarAction={<button className="ghost" onClick={() => setHolidayModal(blankHoliday())} type="button"><Plus size={16} />Add Booking</button>}
            />
          </div>
        </AppModal>
      )}

      {activeLabourModal === "rates" && (
        <AppModal title="Rate history" open onClose={() => setActiveLabourModal(null)} wide footer={<button className="ghost" onClick={() => setActiveLabourModal(null)} type="button">Close</button>}>
          <div className="modal-stack">
            {labourFilterControls(labourFilters, setLabourFilters, { activeToggle: true })}
            <DataTable
              columns={[
                { key: "employeeName", label: "Employee" },
                { key: "effectiveDate", label: "Effective" },
                { key: "payType", label: "Pay type" },
                { key: "rate", label: "Rate", render: money },
              ]}
              onDelete={(id) => deleteFromCollection("rateHistory", id, "Rate history row")}
              onEdit={(row) => setRateModal(row)}
              rows={filteredRateRows}
              toolbarAction={<button className="ghost" onClick={() => setRateModal(blankRate())} type="button"><Plus size={16} />Add Rate</button>}
            />
          </div>
        </AppModal>
      )}

      {employeeModal && (
        <EditModal title={employeeModal.id ? "Edit Employee" : "Add Employee"} onCancel={() => setEmployeeModal(null)} onSave={saveEmployee} saveLabel="Save Employee">
          <div className="form-grid six">
            <Field label="Name" value={employeeModal.name} onChange={(value) => setEmployeeModal({ ...employeeModal, name: value })} />
            <label>Department<select value={employeeModal.departmentId} onChange={(event) => setEmployeeModal({ ...employeeModal, departmentId: event.target.value })}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label>Pay type<select value={employeeModal.payType} onChange={(event) => setEmployeeModal({ ...employeeModal, payType: event.target.value })}><option value="hourly">Hourly</option><option value="annual">Annual salary</option></select></label>
            <Field label="Rate" type="number" value={employeeModal.rate} onChange={(value) => setEmployeeModal({ ...employeeModal, rate: value })} />
            <Field label="Service charge points" type="number" value={employeeModal.serviceChargePoints ?? 1} onChange={(value) => setEmployeeModal({ ...employeeModal, serviceChargePoints: value })} />
            <label>Service charge<select value={employeeModal.excludeFromServiceCharge ? "excluded" : "included"} onChange={(event) => setEmployeeModal({ ...employeeModal, excludeFromServiceCharge: event.target.value === "excluded" })}><option value="included">Included</option><option value="excluded">Excluded</option></select></label>
            <Field label="Contracted hours" type="number" value={employeeModal.contractedHours} onChange={(value) => setEmployeeModal({ ...employeeModal, contractedHours: value })} />
            <Field label="Average weekly hours" type="number" value={employeeModal.manualAverageWeeklyHours} onChange={(value) => setEmployeeModal({ ...employeeModal, manualAverageWeeklyHours: value })} />
            <Field label="Start date" type="date" value={employeeModal.startDate} onChange={(value) => setEmployeeModal({ ...employeeModal, startDate: value })} />
            <label>Status<select value={employeeModal.status} onChange={(event) => setEmployeeModal({ ...employeeModal, status: event.target.value })}><option value="active">Active</option><option value="left">Left</option></select></label>
            <label>Holiday type<select value={employeeModal.holidayType} onChange={(event) => setEmployeeModal({ ...employeeModal, holidayType: event.target.value })}><option value="zero-hours">Zero-hours</option><option value="annual">Annual</option><option value="freelance">Freelance</option></select></label>
            <Field label="Holiday entitlement days" type="number" value={employeeModal.holidayEntitlementDays} onChange={(value) => setEmployeeModal({ ...employeeModal, holidayEntitlementDays: value })} />
          </div>
          <Panel title="Rate history" action="Stored inside employee profile">
            <DataTable
              columns={[
                { key: "effectiveDate", label: "Effective" },
                { key: "oldRate", label: "Old rate", render: money },
                { key: "newRate", label: "New rate", render: money },
                { key: "notes", label: "Notes" },
              ]}
              rows={Array.isArray(employeeModal.rateHistory) ? employeeModal.rateHistory : []}
            />
          </Panel>
        </EditModal>
      )}

      {departmentModal && (
        <EditModal title={departmentModal.id ? "Edit Department" : "Add Department"} onCancel={() => setDepartmentModal(null)} onSave={saveDepartment} saveLabel="Save Department">
          <div className="form-grid six">
            <Field label="Department" value={departmentModal.name} onChange={(value) => setDepartmentModal({ ...departmentModal, name: value })} />
            <label>Group<select value={departmentModal.group} onChange={(event) => setDepartmentModal({ ...departmentModal, group: event.target.value })}><option>BOH</option><option>FOH</option><option>KP</option><option>Other</option></select></label>
            <label>Target basis<select value={departmentModal.basis} onChange={(event) => setDepartmentModal({ ...departmentModal, basis: event.target.value })}>{Object.entries(labourBasisLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <Field label="Target %" type="number" value={departmentModal.targetPercent} onChange={(value) => setDepartmentModal({ ...departmentModal, targetPercent: value })} />
            <Field label="Service charge weight" type="number" value={departmentModal.serviceChargeShare} onChange={(value) => setDepartmentModal({ ...departmentModal, serviceChargeShare: value })} />
            <label>Status<select value={departmentModal.active ? "true" : "false"} onChange={(event) => setDepartmentModal({ ...departmentModal, active: event.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></select></label>
          </div>
        </EditModal>
      )}

      {salesModal && (
        <EditModal title={salesModal.id ? "Edit Labour Sales" : "Add Labour Sales"} onCancel={() => setSalesModal(null)} onSave={saveSales} saveLabel="Save Sales">
          <div className="form-grid six">
            <Field label="From" type="date" value={salesModal.dateFrom} onChange={(value) => setSalesModal({ ...salesModal, dateFrom: value })} />
            <Field label="To" type="date" value={salesModal.dateTo} onChange={(value) => setSalesModal({ ...salesModal, dateTo: value })} />
            <Field label="Total sales" type="number" value={salesModal.totalSales} onChange={(value) => setSalesModal({ ...salesModal, totalSales: value })} />
            <Field label="Net sales" type="number" value={salesModal.netSales} onChange={(value) => setSalesModal({ ...salesModal, netSales: value })} />
            <Field label="Food sales" type="number" value={salesModal.foodSales} onChange={(value) => setSalesModal({ ...salesModal, foodSales: value })} />
            <Field label="Service charge" type="number" value={salesModal.serviceCharge} onChange={(value) => setSalesModal({ ...salesModal, serviceCharge: value, bohServiceCharge: numberValue(value) * 0.4, fohServiceCharge: numberValue(value) * 0.6 })} />
            <Field label="BOH service charge" type="number" value={salesModal.bohServiceCharge} onChange={(value) => setSalesModal({ ...salesModal, bohServiceCharge: value })} />
            <Field label="FOH service charge" type="number" value={salesModal.fohServiceCharge} onChange={(value) => setSalesModal({ ...salesModal, fohServiceCharge: value })} />
          </div>
        </EditModal>
      )}

      {holidayModal && (
        <EditModal title={holidayModal.id ? "Edit Holiday" : "Add Holiday"} onCancel={() => setHolidayModal(null)} onSave={saveHoliday} saveLabel="Save Holiday">
          <div className="form-grid six">
            <label>Employee<select value={holidayModal.employeeId} onChange={(event) => {
              const employee = data.employees.find((item) => item.id === event.target.value);
              setHolidayModal({ ...holidayModal, employeeId: event.target.value, employeeName: employee?.name || "" });
            }}>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <Field label="From" type="date" value={holidayModal.dateFrom} onChange={(value) => setHolidayModal({ ...holidayModal, dateFrom: value })} />
            <Field label="To" type="date" value={holidayModal.dateTo} onChange={(value) => setHolidayModal({ ...holidayModal, dateTo: value })} />
            <Field label="Days" type="number" value={holidayModal.days} onChange={(value) => setHolidayModal({ ...holidayModal, days: value })} />
            <Field label="Hours" type="number" value={holidayModal.hours} onChange={(value) => setHolidayModal({ ...holidayModal, hours: value })} />
            <label>Status<select value={holidayModal.status} onChange={(event) => setHolidayModal({ ...holidayModal, status: event.target.value })}><option>Booked</option><option>Taken</option><option>Cancelled</option><option>Paid</option></select></label>
          </div>
        </EditModal>
      )}

      {rateModal && (
        <EditModal title={rateModal.id ? "Edit Rate" : "Add Rate"} onCancel={() => setRateModal(null)} onSave={saveRate} saveLabel="Save Rate">
          <div className="form-grid six">
            <label>Employee<select value={rateModal.employeeId} onChange={(event) => {
              const employee = data.employees.find((item) => item.id === event.target.value);
              setRateModal({ ...rateModal, employeeId: event.target.value, employeeName: employee?.name || "" });
            }}>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <Field label="Effective date" type="date" value={rateModal.effectiveDate} onChange={(value) => setRateModal({ ...rateModal, effectiveDate: value })} />
            <label>Pay type<select value={rateModal.payType} onChange={(event) => setRateModal({ ...rateModal, payType: event.target.value })}><option value="hourly">Hourly</option><option value="annual">Annual salary</option></select></label>
            <Field label="Rate" type="number" value={rateModal.rate} onChange={(value) => setRateModal({ ...rateModal, rate: value })} />
          </div>
        </EditModal>
      )}

      {weeklyModal && (
        <AppModal
          footer={(
            <>
              <button className="ghost" onClick={() => setWeeklyModal(null)} type="button">Cancel</button>
              <button onClick={saveWeeklyInput} type="button"><Save size={16} />Save Labour</button>
            </>
          )}
          onClose={() => setWeeklyModal(null)}
          open={Boolean(weeklyModal)}
          title="Input labour"
          wide
        >
          <div className="modal-stack">
            <div className="form-grid six">
              <label>Input mode<select value={weeklyModal.mode || "weekly"} onChange={(event) => {
                const mode = event.target.value;
                const baseDate = weeklyModal.date || weeklyModal.weekStart || today();
                const nextWeekStart = mode === "weekly" ? baseDate : weeklyModal.weekStart || baseDate;
                const nextRange = mode === "daily" ? salesTotalsForRange(sales || [], { start: baseDate, end: baseDate }, "All departments") : salesTotalsForLabourWeek(nextWeekStart);
                setWeeklyModal({
                  ...weeklyModal,
                  mode,
                  date: baseDate,
                  weekStart: nextWeekStart,
                  serviceCharge: nextRange.serviceCharge || 0,
                  salesTotal: nextRange.grossSales || nextRange.netSales || 0,
                  netSales: nextRange.netSales || 0,
                  foodSales: nextRange.netSales || 0,
                });
              }}><option value="weekly">Weekly</option><option value="daily">Daily</option></select></label>
              {weeklyModal.mode === "daily" ? (
                <Field label="Date" type="date" value={weeklyModal.date || weeklyModal.weekStart} onChange={(value) => {
                  const daySales = salesTotalsForRange(sales || [], { start: value, end: value }, "All departments");
                  setWeeklyModal({ ...weeklyModal, date: value, weekStart: value, serviceCharge: daySales.serviceCharge || 0, salesTotal: daySales.grossSales || daySales.netSales || 0, netSales: daySales.netSales || 0, foodSales: daySales.netSales || 0 });
                }} />
              ) : (
                <Field label="Week start" type="date" value={weeklyModal.weekStart} onChange={updateWeeklyWeekStart} />
              )}
              <Field label="Gross sales" type="number" readOnly value={numberValue(weeklyModal.salesTotal, 0).toFixed(2)} />
              <Field label="Net sales" type="number" readOnly value={numberValue(weeklyModal.netSales, 0).toFixed(2)} />
              <Field label="Service charge from Sales" type="number" readOnly value={numberValue(weeklyModal.serviceCharge, 0).toFixed(2)} />
              <Field label="Total wages" type="number" readOnly value={weeklyTotals.wages.toFixed(2)} />
            </div>
            <p className="helper-text">Only enter employee hours here. Sales and service charge come from the Sales page for the selected {weeklyModal.mode === "daily" ? "day" : "week"}.</p>
            <div className="button-row left">
              <label className="file-button secondary">Import Hours CSV<input accept=".csv,text/csv" key={`weekly-${labourImportKey}`} onChange={(event) => importWeeklyHoursFile(event.target.files?.[0])} type="file" /></label>
            </div>
            <div className="form-grid four labour-filter-bar">
              <Field label="Search employee" value={weeklyFilters.search} onChange={(value) => setWeeklyFilters({ ...weeklyFilters, search: value })} />
              <label>Department<select value={weeklyFilters.department} onChange={(event) => setWeeklyFilters({ ...weeklyFilters, department: event.target.value })}>{departmentFilterOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
              <label>Employees<select value={weeklyFilters.showInactive ? "all" : "active"} onChange={(event) => setWeeklyFilters({ ...weeklyFilters, showInactive: event.target.value === "all" })}><option value="active">Active only</option><option value="all">Active + inactive</option></select></label>
            </div>
            <div className="helper-text">Showing {weeklyVisibleRows.length} employee(s). Search by name or filter by BOH, FOH, Manager, KP or department.</div>
            <div className="table-wrap modal-table">
              <table>
                <thead>
                  <tr>
                    {["Use", "Employee", "Department", "Hours", "Rate", "Wages", "SC points", "SC hours"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {weeklyVisibleRows.map((row) => (
                    <tr key={row.employeeId}>
                      <td><input checked={row.include} onChange={(event) => updateWeeklyRow(row.index, "include", event.target.checked)} type="checkbox" /></td>
                      <td>{row.employeeName}</td>
                      <td>
                        <select value={row.departmentId} onChange={(event) => updateWeeklyRow(row.index, "departmentId", event.target.value)}>
                          {data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                        </select>
                      </td>
                      <td><input min="0" step="0.01" type="number" value={row.hours} onChange={(event) => updateWeeklyRow(row.index, "hours", event.target.value)} /></td>
                      <td><input min="0" readOnly step="0.01" type="number" value={row.rate} title="Rate is locked. Change it in Employees." /></td>
                      <td><input min="0" readOnly step="0.01" type="number" value={numberValue(row.wages, 0).toFixed(2)} title="Gross pay is calculated from hours × employee rate." /></td>
                      <td><input min="0" readOnly step="0.01" type="number" value={row.serviceChargePoints} title="Service charge points are managed in Employees." /></td>
                      <td>{(numberValue(row.hours, 0) * numberValue(row.serviceChargePoints, 1)).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="metric-grid compact">
              <Metric label="Hours" value={weeklyTotals.hours.toFixed(1)} delta="Selected employees" />
              <Metric label="SC hours" value={weeklyTotals.serviceChargeHours.toFixed(1)} delta="Hours × points" />
              <Metric label="Wages" value={money(weeklyTotals.wages)} delta="Before service charge" />
              <Metric label="BOH service charge" value={money(numberValue(weeklyModal.serviceCharge) * 0.4)} delta="40% pool" />
              <Metric label="FOH service charge" value={money(numberValue(weeklyModal.serviceCharge) * 0.6)} delta="60% pool" />
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
}

function SalesAnalysis({ dateRange, dateRangeState, department, departmentNames, sales, setDateRangeState, setSales, weekStartsOn }) {
  const makeSalesDraft = (date = today()) => {
    const existing = sales.find((row) => row.date === date);
    const departments = salesDepartments(existing);
    const hasDepartmentBreakdown = Object.keys(departments).length > 0;
    return {
      date,
      grossSales: existing?.grossSales ?? existing?.totalSales ?? "",
      netSales: existing?.netSales ?? existing?.sales ?? "",
      serviceCharge: existing?.serviceCharge ?? "",
      rows: departmentNames.map((departmentName, index) => {
        const existingDepartment = departments[departmentName] || {};
        const legacyValues = existing && !hasDepartmentBreakdown && index === 0 ? existing : {};
        return {
          department: departmentName,
          grossSales: existingDepartment.grossSales ?? legacyValues.grossSales ?? legacyValues.sales ?? "",
          netSales: existingDepartment.netSales ?? legacyValues.netSales ?? legacyValues.sales ?? "",
        };
      }),
    };
  };
  const defaultCompareStart = toIsoDate(addDays(startOfWeek(parseDate(dateRange.start), weekStartsOn), -7));
  const [inputOpen, setInputOpen] = useState(false);
  const [salesDraft, setSalesDraft] = useState(() => makeSalesDraft(today()));
  const [compareWeekStart, setCompareWeekStart] = useState(defaultCompareStart);
  const selectedTotals = salesTotalsForRange(sales, dateRange, department);
  const periodLength = daysBetween(dateRange.start, dateRange.end);
  const customWeekRange = rangeFromStartAndLength(compareWeekStart, 7);
  const comparisonRows = [
    { id: "previous-day", period: "Previous day", range: shiftRangeByDays(dateRange, -1) },
    { id: "previous-week", period: "Previous week", range: shiftRangeByDays(dateRange, -7) },
    { id: "previous-year", period: "Previous year", range: shiftRangeByYears(dateRange, -1) },
    { id: "chosen-week", period: "Chosen week", range: customWeekRange },
  ].map((row) => {
    const totals = salesTotalsForRange(sales, row.range, department);
    const variance = selectedTotals.netSales - totals.netSales;
    return {
      ...row,
      rangeText: `${formatRangeDate(row.range.start)} - ${formatRangeDate(row.range.end)}`,
      netSales: totals.netSales,
      grossSales: totals.grossSales,
      variance,
      change: totals.netSales ? (variance / totals.netSales) * 100 : 0,
    };
  });
  const dailyRows = selectedTotals.rows.map((row) => ({
    id: row.id || row.date,
    date: row.date,
    day: row.day || formatRangeDate(row.date),
    netSales: row.netSales,
    grossSales: row.grossSales,
    vat: Math.max(0, numberValue(row.grossSales, row.netSales) - numberValue(row.netSales)),
  }));
  const departmentRows = salesByDepartment(sales, dateRange, departmentNames);
  const salesChartData = aggregateDashboardRows(dailyRows.map((row) => ({ ...row, purchases: 0, waste: 0 })), dateRange);
  const salesChartPrefix = chartTitlePrefix(salesChartData.granularity);

  const openInputSales = () => {
    setSalesDraft(makeSalesDraft(today()));
    setInputOpen(true);
  };
  const updateDraftDate = (date) => setSalesDraft(makeSalesDraft(date || today()));
  const updateDraftTop = (field, value) => setSalesDraft((current) => ({ ...current, [field]: value }));
  const updateDraftLine = (departmentName, field, value) => {
    setSalesDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.department === departmentName ? { ...row, [field]: value } : row)),
    }));
  };
  const saveSalesDraft = () => {
    const departments = {};
    salesDraft.rows.forEach((row) => {
      const grossSales = numberValue(row.grossSales, 0);
      const netSales = numberValue(row.netSales, 0);
      if (!grossSales && !netSales) return;
      departments[row.department] = {
        grossSales: grossSales || netSales,
        netSales: netSales || grossSales,
      };
    });
    const departmentValues = Object.values(departments);
    const departmentNetSales = departmentValues.reduce((sum, row) => sum + numberValue(row.netSales), 0);
    const departmentGrossSales = departmentValues.reduce((sum, row) => sum + numberValue(row.grossSales), 0);
    const netSales = numberValue(salesDraft.netSales, 0) || departmentNetSales;
    const grossSales = numberValue(salesDraft.grossSales, 0) || departmentGrossSales || netSales;
    const serviceCharge = numberValue(salesDraft.serviceCharge, 0);
    if (!netSales && !grossSales && !serviceCharge && !departmentValues.length) return;
    const existing = sales.find((row) => row.date === salesDraft.date);
    const nextRow = {
      id: existing?.id || uid(),
      date: salesDraft.date,
      day: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(parseDate(salesDraft.date)),
      sales: netSales,
      netSales,
      grossSales,
      serviceCharge,
      departments,
    };
    setSales((current) => [nextRow, ...current.filter((row) => row.date !== salesDraft.date)].sort((a, b) => a.date.localeCompare(b.date)));
    setInputOpen(false);
  };

  return (
    <>
      <Panel title="Sales controls" action={`${formatRangeDate(dateRange.start)} - ${formatRangeDate(dateRange.end)}`}>
        <div className="form-grid six">
          <label>Period<select value={dateRangeState.preset} onChange={(event) => setDateRangeState({ ...dateRangeState, preset: event.target.value })}>{rangePresets.map((preset) => <option key={preset}>{preset}</option>)}</select></label>
          <Field label="Start date" type="date" value={dateRangeState.startDate} onChange={(value) => setDateRangeState({ ...dateRangeState, preset: "Custom range", startDate: value })} />
          <Field label="End date" type="date" value={dateRangeState.endDate} onChange={(value) => setDateRangeState({ ...dateRangeState, preset: "Custom range", endDate: value })} />
          <Field label="Compare week start" type="date" value={compareWeekStart} onChange={setCompareWeekStart} />
        </div>
        <div className="button-row left">
          <button onClick={openInputSales} type="button"><Plus size={16} />Input sales</button>
        </div>
      </Panel>

      <div className="metric-grid">
        <Metric label="Net sales" value={money(selectedTotals.netSales)} delta={`${selectedTotals.rows.length} sales day(s)`} tone="good" />
        <Metric label="Gross sales" value={money(selectedTotals.grossSales)} delta={department} />
        <Metric label="Service charge" value={money(selectedTotals.serviceCharge)} delta="Feeds Labour" />
        <Metric label="VAT / tax" value={money(selectedTotals.vat)} delta="Gross - net" />
        <Metric label="Daily average" value={money(selectedTotals.averageDailyNet)} delta={`${periodLength} day period`} />
        <Metric label="Entries" value={selectedTotals.rows.length} delta="Days with sales input" />
      </div>

      <div className="dashboard-layout secondary">
        <Panel title={`${salesChartPrefix} net sales`} action={`${salesChartData.granularity} view`}><LineSeries rows={salesChartData.rows} valueKey="netSales" /></Panel>
        <Panel title="Comparison">
          <DataTable
            columns={[
              { key: "period", label: "Compare" },
              { key: "rangeText", label: "Period" },
              { key: "netSales", label: "Net sales", render: money },
              { key: "grossSales", label: "Gross sales", render: money },
              { key: "variance", label: "Variance", render: (value) => money(value) },
              { key: "change", label: "Change", render: percent },
            ]}
            rows={comparisonRows}
          />
        </Panel>
      </div>

      <div className="dashboard-layout secondary">
        <Panel title="Department sales">
          <DataTable
            columns={[
              { key: "department", label: "Department" },
              { key: "netSales", label: "Net sales", render: money },
              { key: "grossSales", label: "Gross sales", render: money },
              { key: "serviceCharge", label: "Service charge", render: money },
              { key: "vat", label: "VAT / tax", render: money },
            ]}
            rows={departmentRows}
          />
        </Panel>
        <Panel title="Daily sales">
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "netSales", label: "Net sales", render: money },
              { key: "grossSales", label: "Gross sales", render: money },
              { key: "vat", label: "VAT / tax", render: money },
            ]}
            rows={dailyRows}
          />
        </Panel>
      </div>

      <AppModal
        footer={(
          <>
            <button className="ghost" onClick={() => setInputOpen(false)} type="button">Cancel</button>
            <button onClick={saveSalesDraft} type="button"><Save size={16} />Save sales</button>
          </>
        )}
        onClose={() => setInputOpen(false)}
        open={inputOpen}
        title="Input sales"
        wide
      >
        <div className="modal-stack">
          <div className="form-grid six">
            <Field label="Sales date" type="date" value={salesDraft.date} onChange={updateDraftDate} />
            <Field label="Gross sales" type="number" value={salesDraft.grossSales} onChange={(value) => updateDraftTop("grossSales", value)} />
            <Field label="Net sales" type="number" value={salesDraft.netSales} onChange={(value) => updateDraftTop("netSales", value)} />
            <Field label="Service charge" type="number" value={salesDraft.serviceCharge} onChange={(value) => updateDraftTop("serviceCharge", value)} />
          </div>
          <p className="helper-text">Department sales are optional but recommended. They use the active departments created in Settings.</p>
          <div className="table-wrap modal-table sales-input-table">
            <table>
              <thead>
                <tr>{["Department sales", "Gross sales", "Net sales"].map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {salesDraft.rows.map((row) => (
                  <tr key={row.department}>
                    <td>{row.department}</td>
                    <td><input min="0" step="0.01" type="number" value={row.grossSales} onChange={(event) => updateDraftLine(row.department, "grossSales", event.target.value)} /></td>
                    <td><input min="0" step="0.01" type="number" value={row.netSales} onChange={(event) => updateDraftLine(row.department, "netSales", event.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AppModal>
    </>
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
  suppliers,
  setCompanySettings,
  setDepartmentSettings,
  setFinancialSettings,
  setAiSettings,
  setInvoiceSettings,
  setMenuSettings,
}) {
  const departmentEmpty = { name: "", type: "Food", targetGp: financialSettings.targetGp, active: true };
  const [departmentForm, setDepartmentForm] = useState(departmentEmpty);
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState("");
  const [pendingFullBackup, setPendingFullBackup] = useState(null);
  const [backupImportSettingsMode, setBackupImportSettingsMode] = useState("Keep current settings");
  const [backupInputKey, setBackupInputKey] = useState(0);
  const [importSummary, setImportSummary] = useState(null);
  const [parserSampleText, setParserSampleText] = useState("");
  const [parserSampleResult, setParserSampleResult] = useState(null);
  const [labourSettings, setLabourSettingsState] = useState(() => ({
    ...defaultLabourSettings,
    ...safeReadLocalStorage("marginflow.labourSettings", defaultLabourSettings),
  }));

  const updateCompany = (field, value) => setCompanySettings({ ...companySettings, [field]: value });
  const updateFinancial = (field, value) => setFinancialSettings({ ...financialSettings, [field]: value });
  const updateMenu = (field, value) => setMenuSettings({ ...menuSettings, [field]: value });
  const updateInvoice = (field, value) => setInvoiceSettings({ ...invoiceSettings, [field]: value });
  const updateAi = (field, value) => setAiSettings({ ...aiSettings, [field]: value });
  const updateLabourSettings = (field, value) => {
    const next = { ...labourSettings, [field]: value };
    setLabourSettingsState(next);
    localStorage.setItem("marginflow.labourSettings", JSON.stringify(next));
  };

  const resetDataSection = (label, keys) => {
    requestDelete({
      title: `Reset ${label}?`,
      message: `This will permanently remove saved ${label.toLowerCase()} data from this browser. Export a full backup first if you may need it later.`,
      onConfirm: () => {
        keys.forEach((key) => localStorage.removeItem(key));
        setDataStatus(`${label} reset. Reloading app...`);
        window.setTimeout(() => window.location.reload(), 600);
      },
    });
  };
  const savedSupplierParserRows = useMemo(() => {
    const rows = suppliers.map((supplier) => ({
      id: supplier.id || supplier.name,
      name: supplier.name,
      status: supplierParserStatus(supplier.name),
    }));
    supplierParserCatalog.forEach((parser) => {
      if (!rows.some((row) => row.name.toLowerCase() === parser.name.toLowerCase())) {
        rows.push({ id: `catalog-${parser.name}`, name: parser.name, status: parser.status });
      }
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers]);

  const testSupplierParser = () => {
    const parsed = parseInvoiceWithSupplierParsers(parserSampleText);
    setParserSampleResult(parsed.lines.length ? parsed : { ...parsed, error: "Could not read this invoice automatically. Please enter manually or import CSV." });
  };

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
    setDepartmentModalOpen(false);
  };

  const openDepartmentModal = (row = null) => {
    setDepartmentForm(row || departmentEmpty);
    setEditingDepartmentId(row?.id || "");
    setDepartmentModalOpen(true);
  };

  const closeDepartmentModal = () => {
    setDepartmentForm(departmentEmpty);
    setEditingDepartmentId("");
    setDepartmentModalOpen(false);
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
      setPendingFullBackup({ payload, storage: Object.fromEntries(entries), keyCount: entries.length });
      setImportSummary(null);
      setDataStatus("");
    } catch {
      setDataStatus("Import failed. Choose a valid MarginFlow full backup JSON file.");
    } finally {
      setBackupInputKey((current) => current + 1);
    }
  };

  const savePreImportBackup = () => {
    const preImportBackup = buildFullBackupPayload();
    localStorage.setItem("marginflow.preImportBackup", JSON.stringify(preImportBackup));
  };

  const replaceFullBackup = () => {
    if (!pendingFullBackup) return;
    savePreImportBackup();
    Object.entries(pendingFullBackup.storage).forEach(([key, value]) => {
      if (key !== "marginflow.preImportBackup") localStorage.setItem(key, stringifyStorageValue(value));
    });
    setPendingFullBackup(null);
    setDataStatus(`Replaced ${pendingFullBackup.keyCount} MarginFlow localStorage key(s). Reloading app...`);
    window.setTimeout(() => window.location.reload(), 500);
  };

  const mergeFullBackup = () => {
    if (!pendingFullBackup) return;
    savePreImportBackup();
    const { nextStorage, summary } = mergeMarginFlowStorage(readMarginFlowLocalStorage(), pendingFullBackup.storage, backupImportSettingsMode === "Use imported settings");
    Object.entries(nextStorage).forEach(([key, value]) => {
      if (key !== "marginflow.preImportBackup") localStorage.setItem(key, stringifyStorageValue(value));
    });
    setImportSummary(summary);
    setPendingFullBackup(null);
    setDataStatus("Merged full backup. Reloading app...");
    window.setTimeout(() => window.location.reload(), 1200);
  };

  const resetDemoSettings = () => {
    setCompanySettings(defaultCompanySettings);
    setFinancialSettings(defaultFinancialSettings);
    setDepartmentSettings(defaultDepartmentSettings);
    setMenuSettings(defaultMenuSettings);
    setInvoiceSettings(defaultInvoiceSettings);
    setDepartmentForm(departmentEmpty);
    setEditingDepartmentId("");
    setDepartmentModalOpen(false);
    setDataStatus("Demo settings restored.");
  };

  return (
    <div className="settings-grid">
      <Panel title="Company settings">
        <div className="form-grid six">
          <label>App mode<select value={companySettings.appMode || defaultCompanySettings.appMode} onChange={(event) => updateCompany("appMode", event.target.value)}>{appModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
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

      <Panel title="Labour settings">
        <div className="form-grid six">
          <Field label="Target labour %" type="number" value={labourSettings.targetLabourPercent} onChange={(value) => updateLabourSettings("targetLabourPercent", numberValue(value))} />
          <CheckboxField checked={labourSettings.weeklyView} label="Use weekly labour control by default" onChange={(value) => updateLabourSettings("weeklyView", value)} />
          <Field label="BOH service charge %" type="number" value={labourSettings.bohServiceChargePercent} onChange={(value) => updateLabourSettings("bohServiceChargePercent", numberValue(value))} />
          <Field label="FOH service charge %" type="number" value={labourSettings.fohServiceChargePercent} onChange={(value) => updateLabourSettings("fohServiceChargePercent", numberValue(value))} />
          <CheckboxField checked={labourSettings.includeServiceChargeInLabourCost} label="Include service charge in labour cost" onChange={(value) => updateLabourSettings("includeServiceChargeInLabourCost", value)} />
          <CheckboxField checked={labourSettings.excludeFreelanceFromTronc} label="Exclude freelance/agency from tronc" onChange={(value) => updateLabourSettings("excludeFreelanceFromTronc", value)} />
          <Field label="Default holiday entitlement days" type="number" value={labourSettings.defaultHolidayEntitlementDays} onChange={(value) => updateLabourSettings("defaultHolidayEntitlementDays", numberValue(value))} />
          <label>Holiday year starts<select value={labourSettings.holidayYearStartMonth} onChange={(event) => updateLabourSettings("holidayYearStartMonth", event.target.value)}>{["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => <option key={month}>{month}</option>)}</select></label>
        </div>
        <p className="helper-text">Labour is controlled weekly. Sales and service charge should normally come from the Sales page, while Labour keeps staff hours, departments, rates and holiday rules.</p>
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
        <DataTable
          columns={[
            { key: "name", label: "Department" },
            { key: "type", label: "Department type" },
            { key: "targetGp", label: "Target GP %", render: (value) => percent(value) },
            { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "amber"}>{value ? "Active" : "Inactive"}</Badge> },
          ]}
          onDelete={(id) => requestDelete({ title: "Delete department", message: "Are you sure you want to delete this department?", onConfirm: () => setDepartmentSettings(departmentSettings.filter((department) => department.id !== id)) })}
          onEdit={openDepartmentModal}
          rows={departmentSettings}
          toolbarAction={<button onClick={() => openDepartmentModal()} type="button"><Plus size={16} />Add Department</button>}
        />
      </Panel>

      {departmentModalOpen && (
        <EditModal title={editingDepartmentId ? "Edit department" : "Add department"} onCancel={closeDepartmentModal} onSave={saveDepartment} saveLabel={editingDepartmentId ? "Save Department" : "Add Department"}>
          <div className="form-grid six">
            <Field label="Department" value={departmentForm.name} onChange={(value) => setDepartmentForm({ ...departmentForm, name: value })} />
            <label>Department type<select value={departmentForm.type} onChange={(event) => setDepartmentForm({ ...departmentForm, type: event.target.value })}>{departmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <Field label="Department target GP %" type="number" value={departmentForm.targetGp} onChange={(value) => setDepartmentForm({ ...departmentForm, targetGp: value })} />
            <label>Status<select value={departmentForm.active ? "Active" : "Inactive"} onChange={(event) => setDepartmentForm({ ...departmentForm, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
          </div>
        </EditModal>
      )}

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

      <Panel title="Supplier Parser Settings" action="Work Edition">
        <DataTable
          columns={[
            { key: "name", label: "Supplier" },
            { key: "status", label: "Parser status", render: (value) => <Badge tone={value === "Supported" ? "green" : "amber"}>{value}</Badge> },
          ]}
          rows={savedSupplierParserRows}
        />
        <div className="form-grid two">
          <label>Sample invoice text<textarea rows={8} value={parserSampleText} onChange={(event) => setParserSampleText(event.target.value)} placeholder="Paste supplier invoice text here..." /></label>
          <div className="code-card">
            <p>Use this to test a supplier parser before saving an invoice.</p>
            <p>Supported suppliers: {supplierParserCatalog.map((parser) => parser.name).join(", ")}.</p>
            <label className="file-button secondary">Upload sample text<input accept=".txt,.csv,.tsv,text/plain,text/csv" onChange={async (event) => setParserSampleText(await event.target.files?.[0]?.text() || "")} type="file" /></label>
            <button onClick={testSupplierParser} type="button"><Search size={16} />Test Parser</button>
          </div>
        </div>
        {parserSampleResult && (
          <div className={`invoice-status ${parserSampleResult.error ? "error" : "success"}`}>
            {parserSampleResult.error || `${parserSampleResult.parserName} found ${parserSampleResult.lines.length} line(s). Supplier: ${parserSampleResult.supplier || "Unknown"}. Invoice: ${parserSampleResult.invoiceNumber || "Not found"}. Date: ${parserSampleResult.invoiceDate || "Not found"}. Total: ${money(parserSampleResult.finalInvoiceTotal)}.`}
          </div>
        )}
      </Panel>

      <Panel title="Reset data by page">
        <p className="helper-text">Use these only when you want to clear one module. Each reset asks for confirmation and only affects this browser until Supabase/cloud sync is added.</p>
        <div className="button-row left wrap">
          <button className="ghost danger" onClick={() => resetDataSection("Invoices", ["marginflow.invoices", "marginflow.creditNotes"])} type="button">Reset invoices</button>
          <button className="ghost danger" onClick={() => resetDataSection("Products", ["marginflow.products"])} type="button">Reset products</button>
          <button className="ghost danger" onClick={() => resetDataSection("Suppliers", ["marginflow.suppliers", "marginflow.creditNotes"])} type="button">Reset suppliers</button>
          <button className="ghost danger" onClick={() => resetDataSection("Sales", ["marginflow.sales"])} type="button">Reset sales</button>
          <button className="ghost danger" onClick={() => resetDataSection("Labour", ["marginflow.labour"])} type="button">Reset labour</button>
          <button className="ghost danger" onClick={() => resetDataSection("Stocktake", ["marginflow.stocktakes"])} type="button">Reset stocktake</button>
          <button className="ghost danger" onClick={() => resetDataSection("Recipes", ["marginflow.recipes"])} type="button">Reset recipes</button>
          <button className="ghost danger" onClick={() => resetDataSection("Menu costing", ["marginflow.menus", "marginflow.menuSettings"])} type="button">Reset menu costing</button>
          <button className="ghost danger" onClick={() => resetDataSection("Waste", ["marginflow.waste"])} type="button">Reset waste</button>
          <button className="ghost danger" onClick={() => resetDataSection("Settings", ["marginflow.companySettings", "marginflow.financialSettings", "marginflow.departmentSettings", "marginflow.invoiceSettings", "marginflow.aiSettings", "marginflow.menuSettings", "marginflow.labourSettings"])} type="button">Reset settings</button>
        </div>
      </Panel>

      <Panel title="Data settings">
        <div className="button-row left">
          <button onClick={exportFullBackup} type="button"><Save size={16} />Export Full Backup</button>
          <label className="file-button secondary">Import Full Backup<input accept="application/json,.json" key={backupInputKey} onChange={(event) => importFullBackup(event.target.files?.[0])} type="file" /></label>
          <a className="file-button secondary" download="marginflow-departments.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(departmentCsv)}`}>Export CSV</a>
          <button className="ghost" onClick={resetDemoSettings} type="button">Reset demo data</button>
        </div>
        {dataStatus && <div className="invoice-status info">{dataStatus}</div>}
        {importSummary && (
          <div className="code-card">
            <p>Invoices added: {importSummary.invoicesAdded}</p>
            <p>Invoices skipped as duplicates: {importSummary.invoicesSkipped}</p>
            <p>Products added: {importSummary.productsAdded}</p>
            <p>Products merged: {importSummary.productsMerged}</p>
            <p>Suppliers added: {importSummary.suppliersAdded}</p>
            <p>Suppliers skipped: {importSummary.suppliersSkipped}</p>
          </div>
        )}
      </Panel>
      {pendingFullBackup && (
        <div className="modal-backdrop" role="presentation">
          <div className="split-modal" role="dialog" aria-modal="true" aria-label="Import full backup">
            <div className="modal-header">
              <div>
                <h3>How do you want to import this backup?</h3>
                <p>{pendingFullBackup.keyCount} MarginFlow localStorage key(s) found.</p>
              </div>
              <button className="icon" onClick={() => setPendingFullBackup(null)} type="button"><X size={16} /></button>
            </div>
            <div className="code-card">
              <p><strong>Replace existing data</strong></p>
              <p>Warning: this replaces MarginFlow browser data for the keys included in the backup. A pre-import backup will be saved first.</p>
              <p><strong>Merge with existing data</strong></p>
              <p>Merges imported invoices, products, suppliers and other saved arrays with current browser data. Existing records are not deleted.</p>
            </div>
            <div className="form-grid six">
              <label>Settings during merge<select value={backupImportSettingsMode} onChange={(event) => setBackupImportSettingsMode(event.target.value)}><option>Keep current settings</option><option>Use imported settings</option></select></label>
            </div>
            <div className="button-row left">
              <button className="ghost danger" onClick={replaceFullBackup} type="button">Replace</button>
              <button onClick={mergeFullBackup} type="button">Merge</button>
              <button className="ghost" onClick={() => { setPendingFullBackup(null); setDataStatus("Full backup import cancelled."); }} type="button">Cancel</button>
            </div>
          </div>
        </div>
      )}
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

function ConfirmDeleteModal({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Delete",
  confirmIcon = null,
  dangerButtonClassName = "ghost danger",
}) {
  if (!open) return null;
  return (
    <AppModal
      title={title}
      open={open}
      onClose={onCancel}
      footer={(
        <>
          <button className="ghost" onClick={onCancel} type="button">Cancel</button>
          <button className={dangerButtonClassName} onClick={onConfirm} type="button">{confirmIcon}{confirmLabel}</button>
        </>
      )}
    >
      <p className="modal-copy">{message}</p>
    </AppModal>
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

function AppModal({ title, open, onClose, footer, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className={`app-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} type="button"><X size={17} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
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
  // GP is only meaningful on days with sales. Purchases-only days used to create a flat 0% line with large-looking markers.
  const validRows = rows.filter((row) => numberValue(row.netSales) > 0);
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
  const targetY = y(targetGp);

  return (
    <div className="performance-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gpLineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
        <line className="target-line" x1="8" x2="92" y1={targetY} y2={targetY} />
        <path className="actual-line smooth-line" d={smoothPath} stroke="url(#gpLineGradient)" />
        {validRows.map((row, index) => (
          <line className="chart-hover-line" key={row.id} x1={x(index)} x2={x(index)} y1="8" y2="92">
            <title>{`${row.label || formatRangeDate(row.date)}\nGross Sales: ${money(row.grossSales)}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nGP: ${percent(row.invoiceGp)}\nVariance vs target: ${percent(row.invoiceGp - targetGp)}`}</title>
          </line>
        ))}
      </svg>
      <div className="chart-legend"><span><i className="legend-actual" />Actual GP %</span><span><i className="legend-target" />Target GP %</span></div>
      <div className="chart-labels dynamic" style={{ gridTemplateColumns: `repeat(${validRows.length}, 1fr)` }}>{validRows.map((row) => <span key={row.id}>{row.label || formatRangeDate(row.date)}</span>)}</div>
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
            <span className="sales-bar" style={{ height: `${(row.netSales / max) * 100}%` }} title={`${row.label || formatRangeDate(row.date)}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nDifference: ${money(row.netSales - row.purchases)}`} />
            <span className="purchase-bar" style={{ height: `${(row.purchases / max) * 100}%` }} title={`${row.label || formatRangeDate(row.date)}\nNet Sales: ${money(row.netSales)}\nPurchases: ${money(row.purchases)}\nDifference: ${money(row.netSales - row.purchases)}`} />
          </div>
          <small>{row.label || formatRangeDate(row.date)}</small>
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
  const visibleRows = rows.filter((row) => Number(row[valueKey]) || row.grossSales || row.netSales);
  if (!visibleRows.length) return <EmptyState />;
  const max = Math.max(...visibleRows.map((row) => Number(row[valueKey]) || 0), 1);
  const points = visibleRows.map((row, index) => `${(index / Math.max(visibleRows.length - 1, 1)) * 100},${100 - ((Number(row[valueKey]) || 0) / max) * 88}`).join(" ");
  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points} />
      </svg>
      <div className="chart-labels dynamic" style={{ gridTemplateColumns: `repeat(${visibleRows.length}, 1fr)` }}>{visibleRows.map((row) => <span key={row.id || row.date}>{row.label || row.day || formatRangeDate(row.date)}</span>)}</div>
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

const rootElement = document.getElementById("root");
const root = rootElement._marginFlowRoot || createRoot(rootElement);
rootElement._marginFlowRoot = root;
root.render(<App />);
