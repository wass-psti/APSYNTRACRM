-- Disposable only: production's only Approved Quotation predates company assignment.
UPDATE public.tradelink_documents
 SET content=content-'vendorId'-'templateId'
 WHERE id='99999999-9999-4999-8999-999999999992'
   AND revision=1;
