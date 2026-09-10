-- Give atomic batch invoice persistence enough time for documents with many lines.
-- The migration only changes function configuration; it does not modify invoice data.
do $$
begin
  if to_regprocedure('public.persist_invoice_document_v3(uuid,uuid,jsonb,text,uuid,bigint)') is not null then
    execute 'alter function public.persist_invoice_document_v3(uuid, uuid, jsonb, text, uuid, bigint) set statement_timeout = ''60s''';
  end if;

  if to_regprocedure('public.persist_invoice_document_v2_legacy(uuid,uuid,jsonb)') is not null then
    execute 'alter function public.persist_invoice_document_v2_legacy(uuid, uuid, jsonb) set statement_timeout = ''60s''';
  end if;

  if to_regprocedure('public.persist_invoice_document_v2(uuid,uuid,jsonb)') is not null then
    execute 'alter function public.persist_invoice_document_v2(uuid, uuid, jsonb) set statement_timeout = ''60s''';
  end if;
end;
$$;

notify pgrst, 'reload schema';
