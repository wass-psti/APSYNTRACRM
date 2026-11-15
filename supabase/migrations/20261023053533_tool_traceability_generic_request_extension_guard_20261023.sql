CREATE OR REPLACE FUNCTION private.tool_traceability_borrowed_deadline_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','private','pg_temp' AS $guard$
BEGIN
 IF OLD.request_status='Borrowed' THEN
  IF NEW.borrow_from IS DISTINCT FROM OLD.borrow_from THEN
   RAISE EXCEPTION 'borrowing start date cannot change while borrowed' USING ERRCODE='22023';
  END IF;
  IF NEW.borrow_to IS DISTINCT FROM OLD.borrow_to THEN
   IF NOT (OLD.extension_state='Extension Requested' AND NEW.extension_state='Extension Approved'
      AND NEW.request_status='Borrowed' AND OLD.borrow_to IS NOT NULL AND NEW.borrow_to IS NOT NULL AND NEW.borrow_to>OLD.borrow_to) THEN
    RAISE EXCEPTION 'borrowed return deadline may only increase on extension approval' USING ERRCODE='22023';
   END IF;
  ELSIF OLD.extension_state='Extension Requested' AND NEW.extension_state='Extension Approved' THEN
   RAISE EXCEPTION 'extension approval must extend the return deadline' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END; $guard$;
DROP TRIGGER IF EXISTS tt_borrowed_deadline_guard ON public.tool_traceability_requests;
CREATE TRIGGER tt_borrowed_deadline_guard
BEFORE UPDATE OF borrow_from,borrow_to,request_status,extension_state
ON public.tool_traceability_requests FOR EACH ROW
EXECUTE FUNCTION private.tool_traceability_borrowed_deadline_guard();;
