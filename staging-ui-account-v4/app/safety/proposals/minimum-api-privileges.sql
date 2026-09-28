-- PROPOSAL ONLY: tested in marginflow-permissions-lab, never production.
-- Preserve original migrations and RLS. Existing business rows are not changed.
BEGIN;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.plans TO anon;
REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
-- Ledger changes must use the atomic revision-checked RPC, not direct REST DML.
REVOKE INSERT, UPDATE, DELETE ON public.invoices, public.invoice_lines,
  public.invoice_line_department_splits FROM authenticated;
-- The v3 SECURITY DEFINER function can call its internal implementations as owner.
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('persist_invoice_document_v2','persist_invoice_document_v2_legacy') LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated, anon, PUBLIC',fn);
 END LOOP;
END $$;
-- New tables need explicit reviewed grants; avoid reintroducing platform defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated, anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated, anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated, anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated, anon, PUBLIC;
COMMIT;
