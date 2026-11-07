-- CP-TL-03E / Phase 4: metadata-only backup/Storage assurance preflight.
-- This is SELECT-only. Execute against the EXISTING WatchdogWorkspace project
-- only as a read-only inspection; it is not a restore, dump or object export.
-- No object keys, user identifiers, bucket names or file bodies are returned.
SELECT
  clock_timestamp() AT TIME ZONE 'UTC' AS inspected_at_utc,
  current_database() AS database_name,
  (SELECT count(*)::bigint FROM storage.buckets) AS storage_bucket_count,
  (SELECT count(*)::bigint FROM storage.objects) AS storage_object_metadata_count,
  (SELECT count(*)::bigint FROM storage.buckets WHERE public IS TRUE)
    AS public_bucket_count,
  (SELECT count(*)::bigint FROM storage.buckets WHERE public IS FALSE)
    AS private_bucket_count,
  (SELECT max(updated_at) FROM storage.objects)
    AS latest_object_metadata_update_at;
