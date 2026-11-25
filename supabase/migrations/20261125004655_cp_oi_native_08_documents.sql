-- Reconstructed from the applied production migration ledger statements.
-- CP08: bounded atomic document storage, without rewriting original orders or CP07 receipts.
BEGIN;
CREATE TABLE public.order_intake_documents (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 order_id uuid NOT NULL, record_kind text NOT NULL CHECK(record_kind IN ('native','legacy')),
 order_revision integer NOT NULL CHECK(order_revision>0),
 category text NOT NULL CHECK(category IN ('generated_confirmation','client_po','uploaded_confirmation','supporting')),
 filename text NOT NULL CHECK(char_length(filename) BETWEEN 1 AND 240 AND filename=btrim(filename) AND filename !~ '[[:cntrl:]/]' AND position(chr(92) in filename)=0),
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/png','image/jpeg')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 5 AND 5242880),
 byte_count integer GENERATED ALWAYS AS (octet_length(content)) STORED,
 sha256 text GENERATED ALWAYS AS (encode(sha256(content),'hex')) STORED,
 audit_id uuid UNIQUE REFERENCES public.order_intake_confirmation_audit(id),
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((category='generated_confirmation' AND audit_id IS NOT NULL AND audit_id=id AND mime_type='application/pdf') OR
       (category<>'generated_confirmation' AND audit_id IS NULL)),
 CHECK(CASE mime_type WHEN 'application/pdf' THEN substring(content from 1 for 5)=decode('255044462d','hex')
 WHEN 'image/png' THEN substring(content from 1 for 8)=decode('89504e470d0a1a0a','hex')
 WHEN 'image/jpeg' THEN substring(content from 1 for 3)=decode('ffd8ff','hex') ELSE false END)
);
CREATE INDEX oi08_documents_order ON public.order_intake_documents(workspace_id,order_id,record_kind,created_at DESC,id DESC);
CREATE INDEX oi08_documents_workspace ON public.order_intake_documents(workspace_id,created_at DESC,id DESC);
ALTER TABLE public.order_intake_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_intake_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_intake_documents TO authenticated;
GRANT INSERT(id,workspace_id,order_id,record_kind,order_revision,category,filename,mime_type,content,audit_id) ON public.order_intake_documents TO authenticated;
CREATE POLICY oi08_read ON public.order_intake_documents FOR SELECT TO authenticated USING (
 workspace_id=(SELECT public.current_workspace_id((SELECT auth.uid()))) AND (SELECT public.has_module_access('order-intake',(SELECT auth.uid()))));
CREATE POLICY oi08_append ON public.order_intake_documents FOR INSERT TO authenticated WITH CHECK (
 created_by=(SELECT auth.uid()) AND workspace_id=(SELECT public.current_workspace_id((SELECT auth.uid()))) AND (SELECT public.has_module_access('order-intake',(SELECT auth.uid())))
 AND EXISTS(SELECT 1 FROM public.order_intake_operational_registry r WHERE r.workspace_id=order_intake_documents.workspace_id AND r.id=order_intake_documents.order_id
 AND r.record_kind=order_intake_documents.record_kind AND r.revision=order_intake_documents.order_revision)
 AND (audit_id IS NULL OR EXISTS(SELECT 1 FROM public.order_intake_confirmation_audit a WHERE a.id=order_intake_documents.audit_id
 AND a.workspace_id=order_intake_documents.workspace_id AND a.order_id=order_intake_documents.order_id AND a.record_kind=order_intake_documents.record_kind
 AND a.order_revision=order_intake_documents.order_revision AND a.pdf_sha256=encode(sha256(order_intake_documents.content),'hex') AND a.generated_by=order_intake_documents.created_by)));
CREATE VIEW public.order_intake_document_registry WITH(security_invoker=true) AS
SELECT d.id,d.workspace_id,d.order_id,d.record_kind,d.order_revision,d.category,d.filename,d.mime_type,d.byte_count,d.sha256,d.audit_id,d.created_by,d.created_at,true AS stored,r.po_number
FROM public.order_intake_documents d JOIN public.order_intake_operational_registry r ON r.workspace_id=d.workspace_id AND r.id=d.order_id AND r.record_kind=d.record_kind
UNION ALL
SELECT a.id,a.workspace_id,a.order_id,a.record_kind,a.order_revision,'generated_confirmation'::text,
 'Previously generated confirmation'::text,'application/pdf'::text,NULL::integer,a.pdf_sha256,a.id,a.generated_by,a.generated_at,false,r.po_number
FROM public.order_intake_confirmation_audit a JOIN public.order_intake_operational_registry r ON r.workspace_id=a.workspace_id AND r.id=a.order_id AND r.record_kind=a.record_kind WHERE NOT EXISTS(SELECT 1 FROM public.order_intake_documents d WHERE d.audit_id=a.id AND d.workspace_id=a.workspace_id);
REVOKE ALL ON public.order_intake_document_registry FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_intake_document_registry TO authenticated;
CREATE FUNCTION public.order_intake_save_document(p_id uuid,p_order_id uuid,p_kind text,p_revision integer,p_category text,p_filename text,p_mime text,p_base64 text,p_sha256 text,p_metadata jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE w uuid:=public.current_workspace_id(auth.uid()); bytes bytea; d public.order_intake_documents%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR w IS NULL THEN RAISE EXCEPTION 'ORDER_INTAKE_CONTEXT_REQUIRED'; END IF;
 IF p_base64 IS NULL OR length(p_base64)>6990510 THEN RAISE EXCEPTION 'ORDER_INTAKE_DOCUMENT_SIZE'; END IF;
 bytes:=decode(p_base64,'base64');
 IF octet_length(bytes) NOT BETWEEN 5 AND 5242880 OR encode(sha256(bytes),'hex') IS DISTINCT FROM p_sha256 THEN RAISE EXCEPTION 'ORDER_INTAKE_DOCUMENT_DIGEST_OR_SIZE'; END IF;
 IF p_category='generated_confirmation' THEN
  PERFORM public.order_intake_record_confirmation(p_id,p_order_id,p_kind,p_revision,p_sha256,p_metadata);
 ELSIF p_metadata IS NOT NULL THEN RAISE EXCEPTION 'ORDER_INTAKE_DOCUMENT_METADATA'; END IF;
 SELECT * INTO d FROM public.order_intake_documents WHERE id=p_id;
 IF NOT FOUND THEN
  INSERT INTO public.order_intake_documents(id,workspace_id,order_id,record_kind,order_revision,category,filename,mime_type,content,audit_id)
  VALUES(p_id,w,p_order_id,p_kind,p_revision,p_category,p_filename,p_mime,bytes,CASE WHEN p_category='generated_confirmation' THEN p_id END)
  ON CONFLICT(id) DO NOTHING;
  SELECT * INTO d FROM public.order_intake_documents WHERE id=p_id;
 END IF;
 IF NOT FOUND OR d.workspace_id IS DISTINCT FROM w OR d.created_by IS DISTINCT FROM auth.uid() OR d.order_id IS DISTINCT FROM p_order_id
 OR d.record_kind IS DISTINCT FROM p_kind OR d.order_revision IS DISTINCT FROM p_revision OR d.category IS DISTINCT FROM p_category
 OR d.filename IS DISTINCT FROM p_filename OR d.mime_type IS DISTINCT FROM p_mime OR d.sha256 IS DISTINCT FROM p_sha256
 THEN RAISE EXCEPTION 'ORDER_INTAKE_DOCUMENT_RECEIPT_CONFLICT'; END IF;
 RETURN jsonb_build_object('id',d.id,'sha256',d.sha256,'byteCount',d.byte_count,'createdAt',d.created_at);
END $$;
CREATE FUNCTION public.order_intake_read_document(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',id,'filename',filename,'mimeType',mime_type,'sha256',sha256,'byteCount',byte_count,'base64',encode(content,'base64'))
 FROM public.order_intake_documents WHERE id=p_id AND workspace_id=public.current_workspace_id(auth.uid())
$$;
CREATE FUNCTION public.order_intake_document_coverage() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 WITH orders AS (SELECT id,record_kind,po_file_reference,confirmation_reference FROM public.order_intake_operational_registry WHERE workspace_id=public.current_workspace_id(auth.uid())),
 files AS (SELECT order_id,record_kind,category,byte_count FROM public.order_intake_documents WHERE workspace_id=public.current_workspace_id(auth.uid()))
 SELECT jsonb_build_object('orders',(SELECT count(*) FROM orders),'withFiles',(SELECT count(*) FROM orders o WHERE EXISTS(SELECT 1 FROM files f WHERE f.order_id=o.id AND f.record_kind=o.record_kind)),
 'withClientPO',(SELECT count(*) FROM orders o WHERE EXISTS(SELECT 1 FROM files f WHERE f.order_id=o.id AND f.record_kind=o.record_kind AND f.category='client_po')),
 'withConfirmation',(SELECT count(*) FROM orders o WHERE EXISTS(SELECT 1 FROM files f WHERE f.order_id=o.id AND f.record_kind=o.record_kind AND f.category IN ('generated_confirmation','uploaded_confirmation'))),
 'storedFiles',(SELECT count(*) FROM files),'storedBytes',(SELECT coalesce(sum(byte_count),0) FROM files),
 'historicalPOReferences',(SELECT count(*) FROM orders WHERE record_kind='legacy' AND nullif(btrim(po_file_reference),'') IS NOT NULL),
 'historicalConfirmationReferences',(SELECT count(*) FROM orders WHERE record_kind='legacy' AND nullif(btrim(confirmation_reference),'') IS NOT NULL),
 'auditOnly',(SELECT count(*) FROM public.order_intake_document_registry WHERE workspace_id=public.current_workspace_id(auth.uid()) AND NOT stored))
$$;
REVOKE ALL ON FUNCTION public.order_intake_save_document(uuid,uuid,text,integer,text,text,text,text,text,jsonb),public.order_intake_read_document(uuid),public.order_intake_document_coverage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_intake_save_document(uuid,uuid,text,integer,text,text,text,text,text,jsonb),public.order_intake_read_document(uuid),public.order_intake_document_coverage() TO authenticated;
COMMIT;
