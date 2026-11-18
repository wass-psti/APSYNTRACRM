-- Real production role rank compatibility fixture; overrides simplified 02B mock.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_module_role_rank(p_module text, p_role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE
 WHEN p_module='time-tracker' AND p_role IN ('Employee','OJT') THEN 1
 WHEN p_module='time-tracker' AND p_role IN ('Supervisor','HR','Finance') THEN 2
 WHEN p_module='time-tracker' AND p_role IN ('System Admin','IT Administrator') THEN 3
 WHEN p_module='fueltrack-plus' AND p_role='User' THEN 1
 WHEN p_module='fueltrack-plus' AND p_role='Pump Attendant' THEN 2
 WHEN p_module='fueltrack-plus' AND p_role='Admin' THEN 3
 WHEN p_module='tradelink' AND p_role='User' THEN 1
 WHEN p_module='tradelink' AND p_role='Sales Supervisor' THEN 2
 WHEN p_module='tradelink' AND p_role='General Manager' THEN 3
 WHEN p_module='fund-released-tracker' AND p_role='REQUESTOR' THEN 1
 WHEN p_module='fund-released-tracker' AND p_role IN ('FINANCE_APPROVER','FINANCE_MANAGER') THEN 2
 WHEN p_module='fund-released-tracker' AND p_role='GENERAL_MANAGER' THEN 3
 WHEN p_module='tool-traceability' AND p_role='VIEWER' THEN 0
 WHEN p_module='tool-traceability' AND p_role='USER' THEN 1
 WHEN p_module='tool-traceability' AND p_role='LOGISTICS' THEN 2
 WHEN p_module='tool-traceability' AND p_role='ADMIN' THEN 3
 WHEN p_module='toolbox-issues' AND p_role='viewer' THEN 0
 WHEN p_module='toolbox-issues' AND p_role='employee' THEN 1
 WHEN p_module='toolbox-issues' AND p_role='supervisor' THEN 2
 WHEN p_module='toolbox-issues' AND p_role='admin' THEN 3
 WHEN p_module IN ('fueltrans','order-intake','charter-navigator') AND p_role='Viewer' THEN 0
 WHEN p_module IN ('fueltrans','order-intake') AND p_role='User' THEN 1
 WHEN p_module='charter-navigator' AND p_role='Employee' THEN 1
 WHEN p_module='charter-navigator' AND p_role='Supervisor' THEN 2
 WHEN p_module IN ('fueltrans','order-intake','charter-navigator') AND p_role='Admin' THEN 3
 WHEN p_module='material-request-hub' AND p_role='VIEWER' THEN 0
 WHEN p_module='material-request-hub' AND p_role='REQUESTOR' THEN 1
 WHEN p_module='material-request-hub' AND p_role IN ('APPROVER','WAREHOUSE') THEN 2
 WHEN p_module='material-request-hub' AND p_role='ADMIN' THEN 3
 WHEN p_module='aps-aims' AND p_role='Viewer' THEN 0
 WHEN p_module='aps-aims' AND p_role='Custodian' THEN 1
 WHEN p_module='aps-aims' AND p_role='AssetManager' THEN 2
 WHEN p_module='aps-aims' AND p_role='Administrator' THEN 3
 WHEN p_module='employee-eval' AND p_role='employee' THEN 1
 WHEN p_module='employee-eval' AND p_role='supervisor' THEN 2
 WHEN p_module='employee-eval' AND p_role='admin' THEN 3
 ELSE NULL END;
$function$
;
