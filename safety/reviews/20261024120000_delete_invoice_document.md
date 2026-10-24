# Review: 20261024120000_delete_invoice_document.sql

Date: 24 Oct 2026. Requested by Kevin: "Delete document" did not remove documents (24/10).

## Why
- The app only removed documents from browser state; the relational row stayed and came back.
  Commit 0a3742a made the client delete the row, but documents created by the historical recovery
  (e.g. MF-0069..MF-0072) have an `invoice_financial_repairs` row with `on delete restrict`, and that
  table has no delete policy, so the owner still could not delete them.

## What it does
- Adds `public.delete_invoice_document_v1(company, invoice)`, security definer, one transaction:
  deletes the document's `invoice_financial_repairs` rows, its `product_price_history` rows, then the
  invoice (lines and splits cascade as before). Returns the number of invoices deleted (0 or 1).

## Data preservation
- No table, column, policy or existing function changes. Only rows of the one document the owner
  chose to delete are removed, scoped by company id; another company's document id returns 0.
- The repair audit row only describes a header repair of the deleted document; it is removed with it.

## Access
- Company owner only (`is_company_owner`, same rule as the existing `_delete_owner` RLS policies);
  others get SQLSTATE 42501. `execute` revoked from public, granted to `authenticated`.

## Tests
- `supabase/tests/delete_invoice_document_test.sql` (self-contained, throwaway Postgres 16): manager
  refused with nothing changed; owner deletes a recovered document with lines, price history and a
  repair row; cross-company id untouched. Passed locally 24/10.
- `src/domain/invoicePersistence.test.js`: client uses the function and falls back to the direct
  delete only when the function does not exist yet.
