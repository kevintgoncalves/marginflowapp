-- Proposed policy, applied only to the named fictional lab bucket.
-- Requires a separate review/generalization before any production migration.
CREATE POLICY safety_lab_linked_invoice_attachment_read ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'safety-invoice-attachments' AND EXISTS (
  SELECT 1 FROM public.invoice_files f JOIN public.invoices i
    ON i.id = f.invoice_id AND i.company_id = f.company_id
      AND i.location_id IS NOT DISTINCT FROM f.location_id
  WHERE f.storage_path = storage.objects.name
    AND f.metadata->>'bucket' = storage.objects.bucket_id
));
