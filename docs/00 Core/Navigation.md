# MarginFlow - Navigation

## Document Information

| Field    | Value              |
| -------- | ------------------ |
| Document | Navigation         |
| Version  | 1.0                |
| Status   | Approved           |
| Owner    | MarginFlow         |
| Category | Core Documentation |

---

# 1. Purpose

This document defines the navigation structure of MarginFlow.

Its objective is to ensure that every user can move through the platform in a logical, predictable and efficient manner while maintaining consistency across all modules.

Navigation should reflect operational workflows rather than technical implementation.

---

# 2. Navigation Philosophy

MarginFlow is designed around the daily workflow of hospitality businesses.

Users should navigate the application following their operational responsibilities rather than learning complex software structures.

Every section of the application should answer one operational question.

Examples include:

* How much have we sold?
* What did we buy?
* What does this recipe cost?
* What is today's GP?
* Which supplier is cheapest?
* How much labour did we spend?

Navigation should always minimise the number of clicks required to complete common operational tasks.

---

# 3. Primary Navigation

The primary navigation contains the core operational modules of MarginFlow.

The order of these modules reflects the logical operational flow of the platform rather than the order in which they were developed.

The primary navigation consists of:

* Dashboard
* Sales
* Invoices
* Suppliers
* Products
* Recipes
* Stock
* Labour
* Reports
* Settings

Each module has a clearly defined responsibility and should never duplicate the purpose of another module.

---

# 4. Dashboard

The Dashboard provides a high-level operational summary of the business.

It is intended to answer the question:

> "How is my business performing today?"

The Dashboard should never replace detailed analysis pages.

Instead, it provides quick access to key operational indicators and direct navigation to relevant modules.

---

# 5. Module Navigation

Each module follows the same internal navigation pattern whenever applicable.

Users should expect to find:

* Overview
* Search
* Filters
* Table or List View
* Details
* Actions

This consistency reduces learning time and improves usability across the platform.

---

# 6. Operational Workflow

Although every module can be accessed independently, MarginFlow follows a logical operational flow.

```text
Suppliers
      ↓
Invoices
      ↓
Products
      ↓
Recipes
      ↓
Sales
      ↓
Stock
      ↓
Labour
      ↓
Reports
```

Users are free to access modules in any order, but the platform is designed around this operational lifecycle.

---

# 7. Global Navigation Elements

The following interface elements should remain accessible throughout the application where appropriate:

* Main navigation
* Search
* Notifications
* User profile
* Organisation selector (future)
* Site selector (future)
* Global settings

Global elements should behave consistently across every module.

---

# 8. Navigation Principles

Every navigation decision should follow these principles.

## Simplicity

Users should never wonder where information is located.

---

## Consistency

Similar pages should use similar layouts.

---

## Predictability

Actions should always appear in familiar locations.

---

## Minimal Clicks

Frequently used workflows should require the minimum practical number of interactions.

---

## Context Preservation

Whenever possible, filters, search terms and selected date ranges should remain active while navigating between related pages.

---

# 9. Future Expansion

New modules should integrate into the existing navigation without disrupting the established user experience.

Navigation should grow through logical extension rather than restructuring.

Existing user workflows should remain familiar after future updates.

---

# 10. Related Documents

* Project Overview
* Architecture
* Dashboard
* Business Rules
* UI Guidelines

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
