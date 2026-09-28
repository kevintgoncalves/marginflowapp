-- PROPOSAL ONLY. Apply only after review; validated solely in the named fictional lab.
-- Additive objects/policies; no changes to the 44 historical migrations.
BEGIN;
INSERT INTO storage.buckets(id,name,public) VALUES('marginflow-invoice-originals','marginflow-invoice-originals',false)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='marginflow-invoice-originals' AND public) THEN RAISE EXCEPTION 'Archive bucket must already be private'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.can_invoice_original_scope(c uuid,l uuid,w boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND l IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.company_members m WHERE m.user_id=auth.uid() AND m.company_id=c AND m.status='active'
 AND (m.location_id IS NULL OR m.location_id=l)
 AND EXISTS(SELECT 1 FROM public.locations WHERE id=l AND company_id=c)
 AND (lower(m.role_label)='owner' OR EXISTS(SELECT 1 FROM public.user_page_permissions p WHERE p.user_id=auth.uid() AND p.company_id=c AND (p.location_id IS NULL OR p.location_id=l) AND p.page_key='invoices' AND p.access_level::text IN ('view','edit','full') AND (NOT w OR p.access_level::text IN ('edit','full'))))
 AND NOT EXISTS(SELECT 1 FROM public.user_page_permissions p WHERE p.user_id=auth.uid() AND p.company_id=c AND (p.location_id IS NULL OR p.location_id=l) AND p.page_key='invoices' AND (p.access_level::text='no_access' OR (w AND p.access_level::text='view')))
 AND (NOT w OR ((lower(m.role_label)='owner' OR EXISTS(SELECT 1 FROM public.user_action_permissions a WHERE a.user_id=auth.uid() AND a.company_id=c AND (a.location_id IS NULL OR a.location_id=l) AND a.action_key::text='import' AND a.allowed)) AND NOT EXISTS(SELECT 1 FROM public.user_action_permissions a WHERE a.user_id=auth.uid() AND a.company_id=c AND (a.location_id IS NULL OR a.location_id=l) AND a.action_key::text='import' AND NOT a.allowed)))
 );
$$;
REVOKE ALL ON FUNCTION public.can_invoice_original_scope(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_invoice_original_scope(uuid,uuid,boolean) TO authenticated;
CREATE POLICY invoice_original_object_read ON storage.objects FOR SELECT TO authenticated USING (
 (bucket_id='marginflow-invoice-originals' AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.company_id::text=split_part(name,'/',1) AND i.location_id::text=split_part(name,'/',2) AND i.id::text=split_part(name,'/',3) AND public.can_invoice_original_scope(i.company_id,i.location_id,false)))
 OR (bucket_id='safety-invoice-attachments' AND EXISTS(SELECT 1 FROM public.invoice_files f JOIN public.invoices i ON i.id=f.invoice_id AND i.company_id=f.company_id AND i.location_id=f.location_id WHERE f.storage_path=name AND f.metadata->>'bucket'=bucket_id AND public.can_invoice_original_scope(i.company_id,i.location_id,false)))
);
CREATE POLICY invoice_original_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='marginflow-invoice-originals' AND array_length(string_to_array(name,'/'),1)=4
 AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.company_id::text=split_part(name,'/',1) AND i.location_id::text=split_part(name,'/',2) AND i.id::text=split_part(name,'/',3) AND public.can_invoice_original_scope(i.company_id,i.location_id,true))
);
-- Defense against other permissive Storage policies: new archive objects are immutable.
CREATE POLICY invoice_original_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id<>'marginflow-invoice-originals') WITH CHECK (bucket_id<>'marginflow-invoice-originals');
CREATE POLICY invoice_original_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id<>'marginflow-invoice-originals');
CREATE POLICY invoice_original_metadata_insert ON public.invoice_files AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 coalesce(metadata->>'bucket','')<>'marginflow-invoice-originals' OR (
 public.can_invoice_original_scope(company_id,location_id,true)
 AND storage_path=company_id::text||'/'||location_id::text||'/'||invoice_id::text||'/'||id::text
 AND checksum ~ '^[0-9a-f]{64}$' AND file_size_bytes>=0 AND original_name IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.company_id=invoice_files.company_id AND i.location_id=invoice_files.location_id)
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='marginflow-invoice-originals' AND o.name=storage_path))
);
CREATE POLICY invoice_original_metadata_read ON public.invoice_files AS RESTRICTIVE FOR SELECT TO authenticated USING (
 coalesce(metadata->>'bucket','') NOT IN ('marginflow-invoice-originals','safety-invoice-attachments') OR public.can_invoice_original_scope(company_id,location_id,false)
);
CREATE POLICY invoice_original_metadata_no_update ON public.invoice_files AS RESTRICTIVE FOR UPDATE TO authenticated USING (coalesce(metadata->>'bucket','')<>'marginflow-invoice-originals') WITH CHECK (coalesce(metadata->>'bucket','')<>'marginflow-invoice-originals');
CREATE POLICY invoice_original_metadata_no_delete ON public.invoice_files AS RESTRICTIVE FOR DELETE TO authenticated USING (coalesce(metadata->>'bucket','')<>'marginflow-invoice-originals');
GRANT SELECT,INSERT ON public.invoice_files TO authenticated;
COMMIT;
