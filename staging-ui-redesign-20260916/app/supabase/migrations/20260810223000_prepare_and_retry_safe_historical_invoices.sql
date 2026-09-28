-- Production-specific safe historical invoice recovery retry marker.
--
-- The data operation was executed on 2026-08-10 after supplier-scoped catalog
-- identity was aligned with the existing schema contract. It created 59 reviewed
-- catalog products, then retried the 88 still-absent invoices through
-- public.recover_legacy_invoice_v1. Production result: inserted 85, failed 3.
-- The three failures were duplicate-guarded and reclassified as candidate variants;
-- they remain only in the preserved legacy snapshot. The production payload is
-- intentionally excluded from source control because it contains invoice data.

select 1;
