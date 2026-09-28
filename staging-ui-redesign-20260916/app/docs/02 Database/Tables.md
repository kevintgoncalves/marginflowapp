# MarginFlow - Database: Tables

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Tables               |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Database             |

---

# 1. Purpose

This document lists every data table (or localStorage module) used by MarginFlow, with its purpose and key fields.

It is the authoritative reference for the application's data model.

---

# 2. Storage Model

MarginFlow stores data in localStorage by default, with optional Supabase cloud sync.

Every module listed below corresponds to a localStorage key following the pattern `marginflow.<module>` and, when cloud sync is enabled, to data within the `marginflow_cloud_state` Supabase table.

---

# 3. Settings Tables

| Module Key | Storage Key | Purpose |
|---|---|---|
| `companySettings` | `marginflow.companySettings` | Business identity information |
| `financialSettings` | `marginflow.financialSettings` | Currency, GP targets, VAT, sales method |
| `departmentSettings` | `marginflow.departmentSettings` | Department list, types, GP targets |
| `labourSettings` | `marginflow.labourSettings` | Labour targets, service charge config |
| `menuSettings` | `marginflow.menuSettings` | Menu and recipe GP target configuration |
| `invoiceSettings` | `marginflow.invoiceSettings` | Invoice approval and default behaviour |
| `aiSettings` | `marginflow.aiSettings` | AI reading and matching configuration |
| `departmentSelection` | `marginflow.department` | Currently selected department context (UI state) |

See `docs/01 Modules/Settings.md` for field-level detail of each settings object.

---

# 4. Operational Tables

### suppliers

`marginflow.suppliers`

Supplier directory.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Canonical supplier name |
| `address`, `phone`, `email`, `website` | string | Contact details |
| `accountNumber` | string | Account reference |
| `notes` | string | Free text |
| `status` | string | Active / Inactive |

---

### supplierDeliverySchedules

`marginflow.supplierDeliverySchedules`

Delivery day configuration per supplier.

| Field | Type | Description |
|---|---|---|
| `supplierId` | string | Reference to suppliers.id |
| `days` | array | Days of the week the supplier delivers |

---

### products

`marginflow.products`

Product catalogue.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Product name |
| `unit` | string | Unit of measure |
| `department` | string | Default department |
| `supplierPrices` | array | Per-supplier price entries |

---

### invoices

`marginflow.invoices`

Purchasing invoices.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `supplierId` | string | Reference to suppliers.id |
| `invoiceNumber` | string | Supplier's reference |
| `date` | string (ISO) | Invoice date |
| `status` | string | Draft / Processing / Review Required / Approved / Archived |
| `lines` | array | Line items (see Invoice Lines below) |
| `total` | number | Invoice total |
| `vatRate` | number | VAT percentage applied |
| `entryMethod` | string | AI Reading / Standard Reading / Manual Entry |

#### Invoice Lines (embedded)

| Field | Type | Description |
|---|---|---|
| `productId` | string | Reference to products.id |
| `productName` | string | Display name at time of entry |
| `quantity` | number | Quantity purchased |
| `unitPrice` | number | Price per unit |
| `lineTotal` | number | Quantity × Unit Price |
| `department` | string / array | Department allocation (single or split) |
| `matchConfidence` | number | AI matching confidence (0–1) |
| `matchStatus` | string | Matching outcome status |

---

### invoiceDayStatusOverrides

`marginflow.invoiceDayStatusOverrides`

Manual overrides to invoice status calculations for specific days, used for edge-case corrections.

---

### creditNotes

`marginflow.creditNotes`

Credit notes issued against suppliers, structurally similar to invoices but representing negative adjustments.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `supplierId` | string | Reference to suppliers.id |
| `linkedInvoiceId` | string | Optional reference to invoices.id |
| `date` | string (ISO) | Credit note date |
| `lines` | array | Credited line items |

---

### sales

`marginflow.sales`

Daily sales records by department.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `date` | string (ISO) | Sales date |
| `department` | string | Department name |
| `grossSales` | number | Revenue including VAT |
| `netSales` | number | Revenue excluding VAT |
| `covers` | number | Number of covers (optional) |

---

### labourData

`marginflow.labour`

Daily labour cost records.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `date` | string (ISO) | Labour date |
| `department` | string | Department name |
| `cost` | number | Labour cost |
| `hours` | number | Hours worked (optional) |

---

### recipes

`marginflow.recipes`

Recipe definitions with ingredients and costing.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Recipe name |
| `portions` | number | Number of portions |
| `ingredients` | array | Linked products with quantities |
| `sellingPrice` | number | Price per portion |

---

### menus

`marginflow.menus`

Menus grouping recipes.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Menu name |
| `recipeIds` | array | Recipes included in the menu |

---

### stocktakes

`marginflow.stocktakes`

Physical stock counts.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `date` | string (ISO) | Stocktake date |
| `department` | string | Department scope |
| `items` | array | Product ID, quantity, calculated value |

---

### wasteItems

`marginflow.waste`

Waste records.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `date` | string (ISO) | Waste date |
| `productId` | string | Reference to products.id |
| `quantity` | number | Quantity wasted |
| `reason` | string | Optional reason |
| `department` | string | Department |

---

# 5. Cloud Storage

When Supabase is configured, all tables above are synchronised into a single Supabase table: `marginflow_cloud_state`.

This table stores serialised JSON per module key, keyed by company/organisation, rather than using individual relational tables per entity.

A fully relational Supabase schema is a future consideration — see `docs/07 Roadmap/Roadmap.md`.

---

# 6. Related Documents

* Relationships.md
* Data Flow.md
* docs/01 Modules/ (per-module field detail)

---

# 7. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version, based on cloudModuleDefinitions |
