/^CREATE OR REPLACE FUNCTION public[.]apsyntra_role_manage_user_access[(]/ { emit=1 }
emit { print }
emit && /^\$rpc\$;/ { exit }
