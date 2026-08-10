-- Production-specific safe historical invoice recovery marker.
--
-- The data operation was executed on 2026-08-10 from a fresh, hashed production
-- backup through public.recover_legacy_invoice_v1, one transaction per invoice.
-- Production result: attempted 105, inserted 17, already existing 0, failed 88.
-- Every failed invoice rolled back independently. The production payload is
-- intentionally excluded from source control because it contains invoice data.

select 1;
