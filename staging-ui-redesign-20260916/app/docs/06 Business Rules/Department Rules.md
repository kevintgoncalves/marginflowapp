# MarginFlow - Department Rules

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Department Rules     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Business Rules       |

---

# 1. Purpose

This document defines the business rules that govern departments within MarginFlow.

Departments are used to allocate costs and revenues to operational areas, enabling accurate GP analysis per business area.

---

# 2. What is a Department?

A department is an operational area of the business.

Departments are used to:

* allocate invoice line costs;
* group sales by area;
* calculate GP per business area;
* filter dashboard and report views.

---

# 3. Default Departments

MarginFlow ships with four default departments.

| Department | Typical Use |
|---|---|
| Kitchen Made | Food items produced in-house |
| Bought In | Packaged food or goods not produced on site |
| Bar | Beverages and bar items |
| Non-food | Cleaning products, packaging, non-consumables |

Departments are configurable in Settings. Businesses may rename or add departments.

---

# 4. Department Types

Every department has a type that determines how it is treated in GP calculations.

| Type | Behaviour |
|---|---|
| Food | Included in food GP calculations |
| Bar | Included in bar GP calculations |
| Bought In | Included in food GP calculations |
| Non-food | Included in total cost; excluded from food GP |
| Excluded | Excluded from all GP calculations |

The Excluded type is used for items that should not affect any operational metric (e.g. capital equipment purchased through an invoice).

---

# 5. Invoice Line Allocation

Every invoice line must be allocated to one or more departments before the invoice can be approved.

### Single Department Allocation

The full cost of the invoice line is assigned to one department.

### Split Allocation

The cost of an invoice line may be split across multiple departments.

Rules for split allocation:

* The sum of all department allocations must equal exactly 100%.
* A minimum split percentage per line is 1%.
* A maximum of [configurable] departments per line.
* If the total does not equal 100%, the invoice cannot be approved.

---

# 6. Department Context in Reporting

Many screens in MarginFlow support a department context selector.

When a department is selected, all visible metrics and data are filtered to that department.

Modules that respect department context:

* Dashboard
* Stocktake
* Waste
* GP Reports

---

# 7. GP Calculation by Department

GP is calculated independently per department type.

### Food GP

```
Food GP % = ((Food Revenue - Food COGS) / Food Revenue) × 100
```

Food COGS includes invoice lines allocated to Food and Bought In departments.

### Bar GP

```
Bar GP % = ((Bar Revenue - Bar COGS) / Bar Revenue) × 100
```

Bar COGS includes invoice lines allocated to the Bar department.

### Total GP

```
Total GP % = ((Total Revenue - Total COGS) / Total Revenue) × 100
```

Total COGS includes all departments except those marked as Excluded.

---

# 8. Rules Summary

* Every invoice line must have a department allocation before approval.
* All department allocations per line must sum to exactly 100%.
* Departments marked as Excluded do not appear in GP reports.
* Changing a department type affects how historical data is reported.
* Departments cannot be deleted if they are referenced by existing invoice lines.

---

# 9. Related Documents

* Stock Rules
* Invoices — Department Allocation
* Settings
* Business Rules (AI Foundation)
* Reports

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
