#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$PGDATABASE" != "workspace_disposable" || "$PGHOST" != "127.0.0.1" || "$PGUSER" != "postgres" ]]; then
 echo "Refusing to run against a non-disposable database." >&2
 exit 1
fi
psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-ws01b-disposable-setup.sql
psql -X -v ON_ERROR_STOP=1 -f sql/cp-ws01b-lifecycle-contract-candidate.sql
psql -X -v ON_ERROR_STOP=1 -f sql/cp-ws01-discovery-activation-candidate.sql
psql -X -v ON_ERROR_STOP=1 -f sql/cp-ws01c-b3-create-contract-candidate.sql
psql -X -v ON_ERROR_STOP=1 -f sql/cp-ws01-atomic-functional-selection-CANDIDATE-NOT-APPLIED.sql
psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-ws01-atomic-functional-disposable.sql
psql -X -v ON_ERROR_STOP=1 -f sql/cp-ws01-switch-emergency-disable-CANDIDATE-NOT-APPLIED.sql
psql -X -v ON_ERROR_STOP=1 -Atqc \
  "select (select count(*)=0 from private.ws01_session_choices) AND
     (select selection_enabled=false from private.ws01_lifecycle_flags where id) AND
     NOT has_function_privilege('authenticated',
       'public.wm_ws01_select(uuid,uuid)','EXECUTE')" | grep -Fx t
echo WS01_ATOMIC_FUNCTIONAL_DISPOSABLE_PASS
