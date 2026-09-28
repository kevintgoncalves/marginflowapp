import { numberValue } from "./numberUtils.js";

const DEFAULT_DEPARTMENT = "Kitchen Made";
const SPLIT_TOLERANCE = 0.01;

export function canonicalDepartmentName(value = "", fallback = DEFAULT_DEPARTMENT, departmentNames = []) {
  const text = String(value || "").trim();
  const fallbackText = String(fallback || DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
  const options = Array.isArray(departmentNames) ? departmentNames : [];
  const matched = options.find((department) => department.toLowerCase() === text.toLowerCase());
  return matched || text || fallbackText;
}

function splitKey(split = {}) {
  return split.departmentId || split.department_id || canonicalDepartmentName(split.department || "", "", []).toLowerCase();
}

export function normalizeDepartmentSplitRows(splits = [], {
  departmentNames = [],
  fallbackDepartment = DEFAULT_DEPARTMENT,
  combineDuplicates = true,
} = {}) {
  const rows = (Array.isArray(splits) ? splits : [])
    .map((split) => ({
      id: split.id || "",
      departmentId: split.departmentId || split.department_id || "",
      department: canonicalDepartmentName(split.department || "", fallbackDepartment, departmentNames),
      percentage: numberValue(split.percentage, 0),
      amount: numberValue(split.amount, 0),
    }))
    .filter((split) => split.department || split.departmentId);

  if (!combineDuplicates) return rows;

  const byDepartment = new Map();
  rows.forEach((split) => {
    const key = splitKey(split);
    if (!key) return;
    const existing = byDepartment.get(key);
    if (!existing) {
      byDepartment.set(key, split);
      return;
    }
    byDepartment.set(key, {
      ...existing,
      percentage: numberValue(existing.percentage, 0) + numberValue(split.percentage, 0),
      amount: numberValue(existing.amount, 0) + numberValue(split.amount, 0),
    });
  });
  return [...byDepartment.values()];
}

export function departmentSplitTotal(splits = []) {
  return (Array.isArray(splits) ? splits : []).reduce((sum, split) => sum + numberValue(split.percentage, 0), 0);
}

export function validDepartmentSplitRows(splits = [], options = {}) {
  const rows = normalizeDepartmentSplitRows(splits, options);
  if (rows.length < 2) return false;
  if (rows.some((split) => !String(split.department || split.departmentId || "").trim() || numberValue(split.percentage, 0) <= 0)) return false;
  const uniqueDepartments = new Set(rows.map(splitKey).filter(Boolean));
  if (uniqueDepartments.size !== rows.length) return false;
  return Math.abs(departmentSplitTotal(rows) - 100) < SPLIT_TOLERANCE;
}

function hasOnlyDuplicateDepartmentRows(splits = [], options = {}) {
  const rows = normalizeDepartmentSplitRows(splits, { ...options, combineDuplicates: false });
  if (rows.length < 2) return false;
  const uniqueDepartments = new Set(rows.map(splitKey).filter(Boolean));
  return uniqueDepartments.size === 1;
}

export function lineUsesSplitDepartmentMode(line = {}, options = {}) {
  const mode = String(line.departmentMode || line.department_mode || line.allocationMode || line.allocation_mode || "").trim().toLowerCase();
  const explicitSplit = mode === "split";
  const explicitSingle = ["single", "department"].includes(mode);
  if (explicitSplit) {
    if (validDepartmentSplitRows(line.departmentSplits, options)) return true;
    if (hasOnlyDuplicateDepartmentRows(line.departmentSplits, options) && line.allocationSource !== "user_selected") return false;
    return true;
  }
  if (explicitSingle) return false;
  return validDepartmentSplitRows(line.departmentSplits, options);
}

export function departmentAssignmentForLine(line = {}, {
  departmentNames = [],
  fallbackDepartment = DEFAULT_DEPARTMENT,
} = {}) {
  const options = { departmentNames, fallbackDepartment };
  const splitRows = normalizeDepartmentSplitRows(line.departmentSplits, options);
  if (lineUsesSplitDepartmentMode(line, options)) {
    return {
      departmentMode: "Split",
      department: splitRows[0]?.department || canonicalDepartmentName(line.department, fallbackDepartment, departmentNames),
      departmentId: "",
      departmentSplits: splitRows,
    };
  }

  return {
    departmentMode: "Single",
    department: canonicalDepartmentName(line.department || splitRows[0]?.department, fallbackDepartment, departmentNames),
    departmentId: line.departmentId || line.department_id || "",
    departmentSplits: [],
  };
}

export function departmentAssignmentForResolvedLine({
  line = {},
  product = {},
  match = {},
  departmentNames = [],
  fallbackDepartment = DEFAULT_DEPARTMENT,
} = {}) {
  const options = { departmentNames, fallbackDepartment };
  const lineAllocationSource = String(line.allocationSource || "").toLowerCase();
  const lineHasCommittedAllocation = ["user_selected", "learned_mapping", "learned_split_rule"].includes(lineAllocationSource);

  if (lineHasCommittedAllocation) {
    return departmentAssignmentForLine(line, options);
  }

  if (validDepartmentSplitRows(match.departmentSplits, options)) {
    return departmentAssignmentForLine({ ...line, departmentMode: "Split", departmentSplits: match.departmentSplits }, options);
  }

  const learnedDepartment = match.department || match.departmentName || match.destination || "";
  if (learnedDepartment) {
    return departmentAssignmentForLine({
      ...line,
      department: learnedDepartment,
      departmentId: match.departmentId || match.department_id || "",
      departmentMode: "Single",
      departmentSplits: [],
    }, options);
  }

  if (validDepartmentSplitRows(product.departmentSplits, options)) {
    return departmentAssignmentForLine({ ...line, departmentMode: "Split", departmentSplits: product.departmentSplits }, options);
  }

  const productDepartment = product.department || product.departmentName || product.defaultDepartment || "";
  return departmentAssignmentForLine({
    ...line,
    department: productDepartment || line.department || fallbackDepartment,
    departmentId: product.departmentId || product.department_id || line.departmentId || "",
    departmentMode: "Single",
    departmentSplits: [],
  }, options);
}

export function departmentAllocationRows(line = {}, options = {}) {
  const assignment = departmentAssignmentForLine(line, options);
  if (assignment.departmentMode === "Split") return assignment.departmentSplits;
  return [{
    id: "",
    departmentId: assignment.departmentId || "",
    department: assignment.department,
    percentage: 100,
    amount: numberValue(line.netLineTotal ?? line.lineTotal, 0),
  }];
}

export function departmentAssignmentIsValid(line = {}, options = {}) {
  const assignment = departmentAssignmentForLine(line, options);
  if (assignment.departmentMode !== "Split") {
    return Boolean(String(assignment.department || assignment.departmentId || "").trim());
  }
  return validDepartmentSplitRows(assignment.departmentSplits, options);
}
