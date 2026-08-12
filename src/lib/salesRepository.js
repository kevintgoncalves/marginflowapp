import { deterministicRecoveryUuid, isCanonicalUuid } from "./invoiceRepository.js";

function validScope({ companyId = "", locationId = "" } = {}) {
  return isCanonicalUuid(companyId) && (!locationId || isCanonicalUuid(locationId));
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function weekdayShortLabel(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function salesDepartments(row = {}) {
  return row.departments || row.departmentSales || row.departmentBreakdown || {};
}

function departmentLineName(line = {}, departmentById = new Map()) {
  return departmentById.get(line.department_id)?.name
    || line.metadata?.marginflow_snapshot?.department
    || line.metadata?.department
    || line.metadata?.departmentName
    || "";
}

function marginflowSnapshot(row = {}) {
  return row.metadata?.marginflow_snapshot && typeof row.metadata.marginflow_snapshot === "object"
    ? row.metadata.marginflow_snapshot
    : {};
}

export function relationalSalesEntryToAppRow(row = {}, lines = [], departmentById = new Map()) {
  const snapshot = marginflowSnapshot(row);
  const departments = {};
  lines.forEach((line) => {
    const department = departmentLineName(line, departmentById);
    if (!department) return;
    departments[department] = {
      departmentId: line.department_id || "",
      grossSales: numberValue(line.gross_sales),
      netSales: numberValue(line.net_sales),
      sales: numberValue(line.net_sales),
      vatAmount: numberValue(line.vat_amount),
      serviceCharge: numberValue(line.service_charge),
    };
  });

  const grossSales = numberValue(row.gross_sales, numberValue(snapshot.grossSales));
  const netSales = numberValue(row.net_sales, numberValue(snapshot.netSales, numberValue(snapshot.sales)));
  const date = row.sales_date || snapshot.date || "";
  return {
    ...snapshot,
    id: row.id,
    relationalId: row.id,
    companyId: row.company_id,
    locationId: row.location_id || "",
    date,
    day: snapshot.day || weekdayShortLabel(date),
    department: snapshot.department || "Total",
    grossSales,
    sales: netSales,
    netSales,
    vatAmount: numberValue(row.vat_amount, Math.max(0, grossSales - netSales)),
    serviceCharge: numberValue(row.service_charge),
    discounts: numberValue(row.discounts),
    refunds: numberValue(row.refunds),
    source: row.source || snapshot.source || "manual",
    departments,
    syncStatus: "synced",
    syncError: "",
    persistenceSource: "relational",
    syncedAt: row.updated_at || row.created_at || "",
  };
}

export async function loadRelationalSalesDepartments(client, scope = {}) {
  if (!client || !validScope(scope)) return { byId: new Map(), byName: new Map() };
  let query = client
    .from("departments")
    .select("id,company_id,location_id,name,sort_order")
    .eq("company_id", scope.companyId);
  if (scope.locationId) query = query.or(`location_id.is.null,location_id.eq.${scope.locationId}`);
  const { data, error } = await query.order("sort_order", { ascending: true });
  if (error) throw error;
  const byId = new Map();
  const byName = new Map();
  (data || []).forEach((department) => {
    byId.set(department.id, department);
    const key = normalizeName(department.name);
    if (key && (!byName.has(key) || department.location_id === scope.locationId)) byName.set(key, department);
  });
  return { byId, byName };
}

export async function loadRelationalSales(client, scope = {}, { startDate = "", endDate = "" } = {}) {
  if (!client || !validScope(scope)) return [];
  let query = client
    .from("sales_entries")
    .select("id,company_id,location_id,sales_date,gross_sales,net_sales,vat_amount,service_charge,discounts,refunds,source,metadata,created_at,updated_at")
    .eq("company_id", scope.companyId);
  if (scope.locationId) query = query.eq("location_id", scope.locationId);
  if (startDate) query = query.gte("sales_date", startDate);
  if (endDate) query = query.lte("sales_date", endDate);
  const { data: entries, error } = await query.order("sales_date", { ascending: true });
  if (error) throw error;
  if (!entries?.length) return [];

  const entryIds = entries.map((entry) => entry.id);
  const [departments, lineResult] = await Promise.all([
    loadRelationalSalesDepartments(client, scope),
    client
      .from("sales_department_lines")
      .select("id,company_id,location_id,sales_entry_id,department_id,gross_sales,net_sales,vat_amount,service_charge,metadata,created_at,updated_at")
      .eq("company_id", scope.companyId)
      .in("sales_entry_id", entryIds),
  ]);
  if (lineResult.error) throw lineResult.error;

  const linesByEntryId = new Map();
  (lineResult.data || []).forEach((line) => {
    const current = linesByEntryId.get(line.sales_entry_id) || [];
    current.push(line);
    linesByEntryId.set(line.sales_entry_id, current);
  });
  return entries.map((entry) => relationalSalesEntryToAppRow(entry, linesByEntryId.get(entry.id) || [], departments.byId));
}

async function ensureSalesEntryId(sale = {}, scope = {}) {
  const existingId = sale.relationalId || sale.id || "";
  if (isCanonicalUuid(existingId)) return existingId;
  const seed = [
    scope.companyId,
    scope.locationId || "company",
    sale.date || "undated",
    sale.source || "manual",
    existingId,
  ].join("|");
  return deterministicRecoveryUuid(`sales-entry|${seed}`);
}

function topLevelSalesTotals(sale = {}) {
  const departments = Object.values(salesDepartments(sale));
  const departmentGross = departments.reduce((sum, row) => sum + numberValue(row.grossSales, numberValue(row.netSales, numberValue(row.sales))), 0);
  const departmentNet = departments.reduce((sum, row) => sum + numberValue(row.netSales, numberValue(row.sales, numberValue(row.grossSales))), 0);
  const netSales = numberValue(sale.netSales, numberValue(sale.sales, departmentNet));
  const grossSales = numberValue(sale.grossSales, departmentGross || netSales);
  return { grossSales, netSales };
}

function salesEntryPayload(sale = {}, scope = {}, entryId) {
  const { grossSales, netSales } = topLevelSalesTotals(sale);
  return {
    id: entryId,
    company_id: scope.companyId,
    location_id: scope.locationId || null,
    sales_date: sale.date,
    gross_sales: grossSales,
    net_sales: netSales,
    vat_amount: numberValue(sale.vatAmount, Math.max(0, grossSales - netSales)),
    service_charge: numberValue(sale.serviceCharge),
    discounts: numberValue(sale.discounts),
    refunds: numberValue(sale.refunds),
    source: sale.source || "manual",
    metadata: {
      ...(sale.metadata || {}),
      marginflow_snapshot: {
        id: sale.id || entryId,
        date: sale.date,
        day: sale.day || weekdayShortLabel(sale.date),
        department: sale.department || "Total",
        source: sale.source || "manual",
      },
    },
  };
}

function departmentLinePayloads(sale = {}, scope = {}, entryId, departmentByName = new Map()) {
  const departments = salesDepartments(sale);
  const rows = Object.entries(departments).map(([department, values]) => ({ department, values }));
  if (!rows.length && sale.department && !["Total", "All departments"].includes(sale.department)) {
    rows.push({ department: sale.department, values: { grossSales: sale.grossSales, netSales: sale.netSales ?? sale.sales, sales: sale.sales } });
  }
  return rows
    .map(({ department, values }) => {
      const grossSales = numberValue(values.grossSales, numberValue(values.netSales, numberValue(values.sales)));
      const netSales = numberValue(values.netSales, numberValue(values.sales, grossSales));
      if (!grossSales && !netSales && !numberValue(values.serviceCharge)) return null;
      const departmentRecord = departmentByName.get(normalizeName(department));
      return {
        company_id: scope.companyId,
        location_id: scope.locationId || null,
        sales_entry_id: entryId,
        department_id: departmentRecord?.id || null,
        gross_sales: grossSales,
        net_sales: netSales,
        vat_amount: numberValue(values.vatAmount, Math.max(0, grossSales - netSales)),
        service_charge: numberValue(values.serviceCharge),
        metadata: {
          department,
          marginflow_snapshot: { department },
        },
      };
    })
    .filter(Boolean);
}

export async function persistRelationalSalesEntry(client, sale = {}, scope = {}) {
  if (!client || !validScope(scope)) throw new Error("Relational sales persistence needs canonical company and location scope.");
  if (!sale.date) throw new Error("Relational sales persistence needs a sales date.");
  const entryId = await ensureSalesEntryId(sale, scope);
  const departments = await loadRelationalSalesDepartments(client, scope);
  const payload = salesEntryPayload(sale, scope, entryId);
  const { data: savedEntry, error } = await client
    .from("sales_entries")
    .upsert(payload, { onConflict: "id" })
    .select("id,company_id,location_id,sales_date,gross_sales,net_sales,vat_amount,service_charge,discounts,refunds,source,metadata,created_at,updated_at")
    .single();
  if (error) throw error;

  const deleteResult = await client
    .from("sales_department_lines")
    .delete()
    .eq("company_id", scope.companyId)
    .eq("sales_entry_id", entryId);
  if (deleteResult.error) throw deleteResult.error;

  const linePayloads = departmentLinePayloads(sale, scope, entryId, departments.byName);
  let savedLines = [];
  if (linePayloads.length) {
    const insertResult = await client
      .from("sales_department_lines")
      .insert(linePayloads)
      .select("id,company_id,location_id,sales_entry_id,department_id,gross_sales,net_sales,vat_amount,service_charge,metadata,created_at,updated_at");
    if (insertResult.error) throw insertResult.error;
    savedLines = insertResult.data || [];
  }

  return relationalSalesEntryToAppRow(savedEntry || payload, savedLines, departments.byId);
}

export async function deleteRelationalSalesEntry(client, saleOrId = {}, scope = {}) {
  if (!client || !validScope(scope)) return { deleted: false };
  const entryId = typeof saleOrId === "string" ? saleOrId : saleOrId.relationalId || saleOrId.id || "";
  if (!isCanonicalUuid(entryId)) return { deleted: false };
  const { error } = await client
    .from("sales_entries")
    .delete()
    .eq("company_id", scope.companyId)
    .eq("id", entryId);
  if (error) throw error;
  return { deleted: true };
}
