# MarginFlow - Project Principles

## Document Information

| Field    | Value              |
| -------- | ------------------ |
| Document | Project Principles |
| Version  | 1.0                |
| Status   | Approved           |
| Owner    | MarginFlow         |
| Category | AI Foundation      |

---

# 1. Purpose

This document defines the fundamental principles that govern every decision made during the design, development and evolution of MarginFlow.

These principles are considered permanent. Every feature, workflow, architectural decision and user interface should comply with the principles defined in this document.

If a future decision conflicts with one or more of these principles, the decision should be reconsidered before implementation.

---

# 2. Core Philosophy

MarginFlow exists to simplify hospitality operations.

The platform should eliminate unnecessary administration, centralise operational information and allow hospitality professionals to spend more time managing their business instead of managing spreadsheets.

Technology is not the product.

Operational efficiency is the product.

---

# 3. Product Principles

## Simplicity

The user experience must remain simple regardless of the complexity of the underlying business logic.

Complexity belongs inside the system, never inside the interface.

Users should require minimal training to operate the platform.

---

## Business First

Every feature must solve a genuine hospitality problem.

Features should never exist simply because they are technically possible.

Business value always takes priority over technical novelty.

---

## Accuracy

Operational and financial information must always be reliable.

Whenever there is a conflict between speed and accuracy, accuracy takes priority.

Every calculation must be reproducible, explainable and auditable.

---

## Single Source of Truth

Each piece of operational information should exist only once within the system.

Modules must share data rather than duplicate it.

Every workflow should contribute to one consistent operational dataset.

---

## User Control

Automation assists users.

Automation never replaces users.

Users remain responsible for approving operational and financial decisions.

MarginFlow should support decision-making, not make decisions on behalf of the business.

---

## Transparency

Users should always understand:

* where data originated;
* how calculations were performed;
* why recommendations were generated;
* what actions were performed automatically.

The platform must never hide uncertainty.

---

## Consistency

Identical interactions should behave consistently throughout the application.

Buttons, terminology, workflows and validation should follow the same design language across every module.

---

## Scalability

Every feature should support future business growth.

Architectural decisions should accommodate both independent businesses and multi-site organisations without requiring fundamental redesign.

---

## Modularity

Each module should have a clearly defined responsibility.

Modules should remain loosely coupled while sharing a common operational data model.

---

# 4. Artificial Intelligence Principles

Artificial Intelligence is a productivity tool.

Its purpose is to:

* reduce repetitive work;
* extract structured information;
* identify operational patterns;
* automate low-value administrative tasks;
* assist operational decision-making.

Artificial Intelligence must never:

* approve invoices automatically;
* modify financial information without confirmation;
* invent missing business data;
* conceal uncertainty from the user.

Whenever confidence is insufficient, the user must review and approve the result.

---

# 5. Documentation Principles

Documentation is the official specification of MarginFlow.

Source code implements the documentation.

Documentation should always describe the intended behaviour of the platform rather than the current implementation.

Approved documentation takes precedence over assumptions.

---

# 6. Development Principles

Every new feature should:

1. solve a real operational problem;
2. integrate naturally with existing workflows;
3. minimise additional complexity;
4. preserve consistency across the platform;
5. remain maintainable over time;
6. be fully documented before or alongside implementation.

Temporary solutions should be avoided whenever a sustainable alternative exists.

---

# 7. Decision Framework

Before implementing any new feature, the following questions should always be answered:

* Does this solve a real hospitality problem?
* Does it reduce manual work?
* Does it improve operational visibility?
* Does it preserve data integrity?
* Is it consistent with the rest of the platform?
* Will it remain maintainable in the future?
* Can it scale without redesign?

If the answer to any of these questions is no, the solution should be reconsidered.

---

# 8. Definition of Success

MarginFlow succeeds when hospitality businesses can:

* operate with fewer manual processes;
* trust every operational metric;
* understand the financial impact of every decision;
* reduce administrative workload;
* improve profitability through better operational insight.

The platform should become the central operational system of the business without increasing operational complexity.

---

# 9. Related Documents

* Project Overview
* Project Context
* Business Rules
* Coding Rules
* UI Guidelines

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
