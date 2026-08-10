-- Default table privileges include capabilities that bypass row-level policies.
-- Archive writes remain available only through archive_legacy_recovery_v1.
revoke all on table public.legacy_invoice_archive from public, anon, authenticated;
revoke all on table public.legacy_product_archive from public, anon, authenticated;

grant select on table public.legacy_invoice_archive to authenticated;
grant select on table public.legacy_product_archive to authenticated;

notify pgrst, 'reload schema';
