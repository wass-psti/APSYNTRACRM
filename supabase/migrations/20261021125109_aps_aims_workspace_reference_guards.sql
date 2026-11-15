CREATE OR REPLACE FUNCTION public.aps_aims_validate_references()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ref_id uuid; ref_type text; ref_field text; field_value text; campaign public.aps_aims_entities%ROWTYPE;
BEGIN
 IF NEW.entity_type='incident' THEN
   IF nullif(btrim(coalesce(NEW.payload->>'description','')),'') IS NULL THEN RAISE EXCEPTION 'Incident description required'; END IF;
   IF NEW.payload->>'status' NOT IN ('Open','Resolved') THEN RAISE EXCEPTION 'Invalid incident status'; END IF;
 ELSIF NEW.entity_type='inventory_campaign' THEN
   IF nullif(btrim(coalesce(NEW.payload->>'name','')),'') IS NULL THEN RAISE EXCEPTION 'Campaign name required'; END IF;
   IF NEW.payload->>'status' NOT IN ('Draft','InProgress','Completed') THEN RAISE EXCEPTION 'Invalid campaign status'; END IF;
 ELSIF NEW.entity_type='inventory_count' THEN
   IF nullif(btrim(coalesce(NEW.payload->>'barcodeValue','')),'') IS NULL THEN RAISE EXCEPTION 'Inventory barcode required'; END IF;
 END IF;
 IF NEW.entity_type='incident' THEN
   ref_field:='assetId'; ref_type:='asset';
 ELSIF NEW.entity_type='inventory_campaign' THEN
   ref_field:='branchId'; ref_type:='branch';
 ELSIF NEW.entity_type='inventory_count' THEN
   ref_field:='campaignId'; ref_type:='inventory_campaign';
 ELSE
   RETURN NEW;
 END IF;
 field_value:=NEW.payload->>ref_field;
 IF field_value IS NULL OR field_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid % reference',ref_field; END IF;
 ref_id:=field_value::uuid;
 SELECT * INTO campaign FROM public.aps_aims_entities
 WHERE id=ref_id AND workspace_id=NEW.workspace_id AND entity_type=ref_type AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Referenced % does not exist in this workspace',ref_type; END IF;
 IF NEW.entity_type='inventory_count' THEN
   IF campaign.payload->>'status'<>'InProgress' THEN RAISE EXCEPTION 'Inventory campaign must be in progress'; END IF;
   field_value:=NEW.payload->>'observedLocationId';
   IF field_value IS NULL OR field_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid observed location'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.aps_aims_entities WHERE id=field_value::uuid AND workspace_id=NEW.workspace_id AND entity_type='location' AND NOT archived) THEN
    RAISE EXCEPTION 'Inventory location not found in this workspace';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_validate_references() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aps_aims_validate_references_trigger ON public.aps_aims_entities;
CREATE TRIGGER aps_aims_validate_references_trigger BEFORE INSERT OR UPDATE OF payload ON public.aps_aims_entities FOR EACH ROW WHEN (NEW.entity_type IN ('incident','inventory_campaign','inventory_count')) EXECUTE FUNCTION public.aps_aims_validate_references();;
