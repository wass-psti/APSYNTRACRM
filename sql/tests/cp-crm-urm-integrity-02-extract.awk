BEGIN { if (function_name == "") function_name = "apsyntra_role_manage_user_access" }
$0 ~ "^CREATE OR REPLACE FUNCTION public[.]" function_name "[(]" { emit=1 }
emit { print }
emit && (/^\$rpc\$;/ || /^\$\$;/) { exit }
