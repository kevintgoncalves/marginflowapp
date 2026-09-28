# MarginFlow - Database: Relationships

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Relationships        |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Database             |

---

# 1. Purpose

This document defines the relationships between MarginFlow's data tables.

Understanding these relationships is essential before modifying the data model, since most modules share data with at least one other module.

---

# 2. Entity Relationship Overview

```text
suppliers ─────┬──── invoices ──── invoice_lines ──── products
               │           │                              │
               └──── credit_notes                          │
                                                             │
products ───────────────────────────────────────────────────┘
   │
   ├──── recipe_ingredients ──── recipes ──── menus
   │
   └──── stocktake_items ──── stocktakes
   │
   └──── waste_items

sales ──── (referenced by) ──── reports
labour_data ──── (referenced by) ──── reports
```

---

# 3. Core Relationships

### Suppliers → Invoices

One supplier has many invoices.

`invoices.supplierId` references `suppliers.id`.

A supplier cannot be deleted if it has associated invoices.

---

### Suppliers → Credit Notes

One supplier has many credit notes.

`creditNotes.supplierId` references `suppliers.id`.

---

### Invoices → Invoice Lines

One invoice has many invoice lines (embedded array, not a separate table).

Each line references a product via `productId`.

---

### Invoice Lines → Products

Many invoice lines reference one product.

`invoiceLine.productId` references `products.id`.

If no match exists, a new product is created and the line is updated to reference it upon confirmation.

---

### Products → Supplier Prices

One product has many supplier prices (one per supplier that has sold it).

Stored as an embedded array within the product record: `product.supplierPrices`.

Each entry references the supplier via `supplierId` and is updated when a new invoice for that supplier/product combination is approved.

---

### Products → Recipe Ingredients

One product can be used in many recipes.

`recipe.ingredients[].productId` references `products.id`.

A product cannot be deleted if it is referenced by any recipe.

---

### Recipes → Menus

Many recipes belong to many menus (many-to-many).

`menu.recipeIds` is an array of `recipes.id`.

---

### Products → Stocktake Items

One product appears in many stocktakes over time.

`stocktake.items[].productId` references `products.id`.

---

### Products → Waste Items

One product can have many waste records.

`wasteItem.productId` references `products.id`.

---

### Credit Notes → Invoices

A credit note may optionally reference the original invoice it corrects.

`creditNote.linkedInvoiceId` references `invoices.id`. This relationship is optional.

---

# 4. Department Relationships

Departments are not stored as a separate referenced table with foreign keys in the current implementation; they are configured as a list in `departmentSettings` and referenced by name across:

* `invoiceLine.department`
* `sales.department`
* `labourData.department`
* `stocktake.department`
* `wasteItem.department`
* `recipe` (via product department inheritance)

Because departments are referenced by name rather than ID, renaming a department requires updating all historical references to maintain consistency. This is a known constraint of the current data model.

---

# 5. Settings Relationships

Settings tables (`financialSettings`, `departmentSettings`, `labourSettings`, etc.) are not directly referenced by foreign keys but are read by calculation functions across nearly every module.

Changing settings values affects calculations immediately for all historical and future data — settings are not versioned over time.

---

# 6. Cardinality Summary

| Relationship | Cardinality |
|---|---|
| Supplier → Invoices | 1 to many |
| Supplier → Credit Notes | 1 to many |
| Invoice → Invoice Lines | 1 to many (embedded) |
| Invoice Line → Product | many to 1 |
| Product → Supplier Prices | 1 to many (embedded) |
| Product → Recipe Ingredients | 1 to many |
| Recipe → Menus | many to many |
| Product → Stocktake Items | 1 to many |
| Product → Waste Items | 1 to many |
| Credit Note → Invoice | many to 1 (optional) |

---

# 7. Known Limitations

* Departments are referenced by name, not ID — a known fragility if renaming is required.
* No formal foreign key enforcement exists since data is stored in localStorage/JSON rather than a relational database by default.
* Supabase cloud sync currently stores data as serialised JSON blobs rather than normalised relational tables.

These are documented as conscious trade-offs of the current architecture, not oversights. See `docs/07 Roadmap/Roadmap.md` for planned improvements.

---

# 8. Related Documents

* Tables.md
* Data Flow.md
* Department Rules

---

# 9. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
