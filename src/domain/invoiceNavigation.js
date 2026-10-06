export function invoiceBrowserRequest(request = {}) {
  return { supplierId: request.supplierId || "", search: "", startDate: request.startDate || "", endDate: request.endDate || "", status: request.status || "All", documentType: request.type === "Credit notes" ? "credit_note" : request.type === "Invoices" ? "invoice" : "" };
}

export function invoiceNavigationRequest(page, requestId) {
  if (page === "invoices") return { id: requestId, view: "list" };
  return page === "invoiceControl" ? { id: requestId, view: "schedule" } : null;
}
