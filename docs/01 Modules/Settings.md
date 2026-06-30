# MarginFlow - Settings

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Settings             |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Settings module contains all configuration options for the MarginFlow platform.

It allows each business to adapt the platform to their operational structure, financial preferences and team configuration without requiring custom development.

Settings changes affect how the entire platform behaves. They should only be modified by users with appropriate permissions.

---

# 2. Objectives

* Allow businesses to configure MarginFlow without technical assistance.
* Ensure calculations and workflows reflect each business's operational reality.
* Provide a single place for all platform configuration.

---

# 3. Settings Categories

### Company Settings

General business information used across the platform.

| Setting | Description |
|---|---|
| Company Name | Legal company name |
| Trading Name | Name displayed in the platform |
| Address | Business address |
| Postcode | Postcode |
| Country | Country of operation |
| VAT Number | VAT registration number |
| Email | Business contact email |
| Phone | Business phone number |
| Website | Business website |

---

### Financial Settings

Controls how financial calculations are performed.

| Setting | Default | Description |
|---|---|---|
| Currency | GBP | Currency used throughout the platform |
| Week Starts On | Monday | First day of the operational week |
| Target GP | 75% | Business-wide GP target |
| Default VAT Rate | 20% | Applied to invoices when not specified |
| Sales Input Method | Manual Gross + Net Sales | How sales figures are entered |
| GP Calculation Base | Net Sales | Whether GP is calculated on gross or net revenue |
| POS Provider | Square | POS system used for CSV import mapping |
| Fiscal Year Start Month | April | Start of the financial year |
| Timezone | Europe/London | Business timezone for date calculations |

---

### Department Settings

Manages operational departments used for cost and revenue allocation.

Per department:

| Setting | Default | Description |
|---|---|---|
| Name | (see defaults) | Department display name |
| Type | Food / Bar / etc. | Determines GP calculation treatment |
| Target GP | 75–78% | Per-department GP target |
| Active | Yes | Whether the department appears in the platform |

Default departments:

* Kitchen Made (Food, 75% target)
* Bought In (Bought In, 72% target)
* Bar (Bar, 78% target)
* Non-food (Non-food, 0% target)

---

### Labour Settings

Controls how labour costs are tracked and reported.

| Setting | Default | Description |
|---|---|---|
| Target Labour % | 32% | Business-wide labour target |
| Weekly View | Enabled | Display labour grouped by week |
| BOH Service Charge % | 40% | Portion of service charge allocated to BOH |
| FOH Service Charge % | 60% | Portion of service charge allocated to FOH |
| Include Service Charge in Labour Cost | No | Add service charge to labour cost for % calculation |
| Exclude Freelance from Tronc | Yes | Freelancers excluded from tronc |
| Default Holiday Entitlement | 28 days | Statutory holiday entitlement |
| Holiday Year Start Month | November | Start of the holiday year |

---

### Invoice Settings

Controls how invoices are processed and approved.

| Setting | Default | Description |
|---|---|---|
| Require Approval Before GP | Yes | Unapproved invoices excluded from GP |
| Default Invoice Department | Kitchen Made | Pre-selected department for new invoice lines |
| Default VAT Rate | 20% | Applied when VAT is not detected on an invoice |
| Allow Unknown Suppliers | Yes | Allow invoice processing without a matched supplier |
| Auto-Create Products After Approval | Yes | Automatically add new products from approved invoices |

---

### AI Settings

Controls the behaviour of AI-assisted invoice processing.

| Setting | Default | Description |
|---|---|---|
| Enable AI Invoice Reading | Yes | Use AI to extract invoice data |
| Enable AI Product Matching | Yes | Use AI to match invoice lines to existing products |
| Auto-Match Confidence Threshold | 90% | Confidence above which a match is applied automatically |
| Require Manual Approval Below Threshold | Yes | Flag low-confidence matches for user review |
| Product Matching Sensitivity | Medium | Controls how strictly product names must match |

---

### Menu Settings

Controls how recipe and menu GP targets are applied.

| Setting | Default | Description |
|---|---|---|
| Default Menu Target GP | 75% | GP target applied to all menus |
| Allow Menu Target Override | Yes | Individual menus can have their own target |
| Allow Subcategory Target Override | Yes | Menu subcategories can have their own target |
| Allow Dish Target Override | Yes | Individual dishes can have their own target |

---

# 4. Business Rules

* Changes to financial settings (currency, GP base, VAT) affect all historical calculations immediately.
* Departments cannot be deleted if they are referenced by approved invoice lines.
* Deactivating a department hides it from the platform but preserves historical data.
* AI settings changes apply from the next invoice processed; they do not retroactively change existing invoices.

---

# 5. Permissions

Settings changes should be restricted to users with a Manager or Owner role.

The specific permission model is defined in the Authentication module.

---

# 6. Dependencies

Settings data is consumed by every module in MarginFlow.

Changes to Settings propagate immediately throughout the platform.

---

# 7. Future Improvements

* Multi-site settings with site-level overrides.
* Role-based access control for individual settings sections.
* Settings audit log.
* Import/export settings for onboarding new businesses.

---

# 8. Related Documents

* Authentication
* Department Rules
* Business Rules
* Labour
* Invoices

---

# 9. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
