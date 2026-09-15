-- Synthetic SQL-only authorization checks. No file bytes. Entire fixture rolls back.
BEGIN;
INSERT INTO public.plans(slug,name) VALUES ('pro','Synthetic schema contract test') ON CONFLICT (slug) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
 ('11000000-0000-4000-8000-000000000001','archive-owner@example.test'),
 ('11000000-0000-4000-8000-000000000002','archive-outsider@example.test');
INSERT INTO public.profiles(id) VALUES
 ('11000000-0000-4000-8000-000000000001'),('11000000-0000-4000-8000-000000000002');
INSERT INTO public.companies(id,name) VALUES ('21000000-0000-4000-8000-000000000001','Synthetic archive tenant');
INSERT INTO public.locations(id,company_id,name) VALUES
 ('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Synthetic location');
INSERT INTO public.company_members(company_id,user_id,role_label,status) VALUES
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Owner','active');
INSERT INTO public.invoices(id,company_id,location_id) VALUES
 ('71000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF NOT public.can_invoice_original_scope('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',true) THEN RAISE EXCEPTION 'Owner should archive'; END IF;
 IF NOT has_table_privilege(current_user,'public.marginflow_cloud_state','SELECT') THEN RAISE EXCEPTION 'Snapshot read grant missing'; END IF;
 IF has_table_privilege(current_user,'public.legacy_invoice_archive','TRUNCATE') THEN RAISE EXCEPTION 'Archive gained TRUNCATE'; END IF;
END $$;
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('marginflow-invoice-originals','21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000001');
INSERT INTO public.invoice_files(id,invoice_id,company_id,location_id,storage_path,original_name,mime_type,file_size_bytes,checksum,metadata) VALUES
 ('81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',
 '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000001','synthetic.txt','text/plain',0,repeat('0',64),'{"bucket":"marginflow-invoice-originals"}');
DO $$ DECLARE n integer; BEGIN
 IF (SELECT count(*) FROM storage.objects) <> 1 OR (SELECT count(*) FROM public.invoice_files) <> 1 THEN RAISE EXCEPTION 'Owner read failed'; END IF;
 UPDATE storage.objects SET name=name WHERE bucket_id='marginflow-invoice-originals'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Archive object mutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='invoice_original_no_delete' AND permissive='RESTRICTIVE' AND cmd='DELETE') THEN RAISE EXCEPTION 'Restrictive archive delete policy missing'; END IF;
 UPDATE public.invoice_files SET original_name='changed'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Archive association mutable'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects) OR EXISTS(SELECT 1 FROM public.invoice_files) THEN RAISE EXCEPTION 'Cross-tenant archive read'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('marginflow-invoice-originals','21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'Cross-tenant archive write succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
