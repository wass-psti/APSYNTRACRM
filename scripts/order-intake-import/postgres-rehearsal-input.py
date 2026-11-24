"""Generate SQL input only for a disposable PostgreSQL rehearsal.
No connection, credentials, or production mutation path.
"""
import csv
import io
import json
import sys
from pathlib import Path
from runpy import run_path

module=run_path(str(Path(__file__).with_name("legacy-local-store.py")))
manifest=json.loads(Path(sys.argv[1]).read_bytes())
rows=list(module["materialize"](manifest))
workspace=module["WORKSPACE"]
print("BEGIN;")
print("CREATE TEMP TABLE import_stage (LIKE public.order_intake_legacy_orders INCLUDING CONSTRAINTS INCLUDING DEFAULTS) ON COMMIT DROP;")
print("COPY import_stage(id,workspace_id,source_key,payload) FROM STDIN WITH (FORMAT csv);")
out=io.StringIO()
writer=csv.writer(out,lineterminator="\n")
for record_id,key,_,payload in rows:
    writer.writerow([record_id,workspace,key,payload])
print(out.getvalue(),end="")
print(r"\.")
print("""
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM import_stage s JOIN public.order_intake_orders n ON n.id=s.id)
 THEN RAISE EXCEPTION 'Native ID collision'; END IF;
 IF EXISTS (SELECT 1 FROM import_stage s JOIN public.order_intake_legacy_orders l
  ON l.workspace_id=s.workspace_id AND l.source_key=s.source_key
  WHERE l.id<>s.id OR l.payload<>s.payload)
 THEN RAISE EXCEPTION 'Changed source payload'; END IF;
END $$;
INSERT INTO public.order_intake_legacy_orders(id,workspace_id,source_key,payload)
 SELECT id,workspace_id,source_key,payload FROM import_stage
 ON CONFLICT (workspace_id,source_key) DO NOTHING;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM import_stage s LEFT JOIN public.order_intake_legacy_orders l
  ON l.id=s.id AND l.workspace_id=s.workspace_id AND l.source_key=s.source_key AND l.payload=s.payload
  WHERE l.id IS NULL) THEN RAISE EXCEPTION 'Import readback mismatch'; END IF;
END $$;
SELECT count(*) AS exact_import_readback FROM import_stage s
 JOIN public.order_intake_legacy_orders l ON l.id=s.id AND l.payload=s.payload;
COMMIT;
""")
