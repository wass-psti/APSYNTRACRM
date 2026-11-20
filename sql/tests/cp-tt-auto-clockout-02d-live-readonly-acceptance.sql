-- CP-TT-AUTO-CLOCKOUT-02D — production-safe, read-only acceptance.
-- Run as an authorized database inspector. No attendance, OT, audit, Board,
-- permission, migration or scheduler writes. Aggregate counts only.
-- A successful SELECT before the natural threshold does NOT certify expiry.
WITH source AS (
  SELECT e.workspace_id, (r->>'id')::uuid AS record_id,
    substring(r->>'ownerId' FROM 7)::uuid AS employee_id,
    (r#>>'{clockIn,timestamp}')::timestamptz AS clock_in_at,
    (r#>>'{clockOut,timestamp}')::timestamptz AS clock_out_at,
    r#>>'{clockOut,automatic}' AS auto_flag,
    r#>>'{clockOut,reason}' AS clock_out_reason,
    r#>>'{clockOut,geo,status}' AS gps_status,
    r#>>'{clockOut,geo,source}' AS gps_source
  FROM public.module_state_entries e
  CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
  WHERE e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*'
), lifecycle AS (
  SELECT s.*, t.board_id, t.status AS scheduler_status,
    t.threshold_at, t.grace_deadline_at, t.overtime_cutoff_at,
    t.completed_at, t.clock_out_reason AS scheduler_reason,
    t.last_error, p.board_item_id, p.clock_in_at AS projected_in,
    p.clock_out_at AS projected_out, p.credited_ms AS projected_credited_ms,
    p.clock_out_geo AS projected_out_geo, i.status AS board_item_status,
    (SELECT count(*) FROM public.timetracker_attendance_mutation_audit a
     WHERE a.workspace_id=s.workspace_id AND a.record_id=s.record_id::text
       AND a.action='clock-out' AND a.source='automatic') AS auto_audit_count,
    (SELECT count(*) FROM public.timetracker_attendance_mutation_audit a
     WHERE a.workspace_id=s.workspace_id AND a.record_id=s.record_id::text
       AND a.action='clock-out') AS total_out_audits,
    (SELECT v.value FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE v.item_id=p.board_item_id AND c.name='Attendance Status'
     LIMIT 1) AS typed_status,
    (SELECT to_jsonb(label->>'id')
     FROM public.work_board_columns c
     CROSS JOIN LATERAL jsonb_array_elements(c.config->'labels') label
     WHERE c.board_id=t.board_id
       AND c.name='Attendance Status'
       AND label->>'name'='Done'
     LIMIT 1) AS expected_done_status,
    (SELECT v.value FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE v.item_id=p.board_item_id AND c.name='Hours Total'
     LIMIT 1) AS typed_hours
  FROM source s
  LEFT JOIN private.tt_auto_clockout_sessions t
    ON t.workspace_id=s.workspace_id AND t.record_id=s.record_id
  LEFT JOIN private.tt_attendance_board_projection p
    ON p.workspace_id=s.workspace_id AND p.record_id=s.record_id
  LEFT JOIN public.work_board_items i ON i.id=p.board_item_id
), outcome AS (
SELECT clock_timestamp() AT TIME ZONE 'Asia/Manila' AS inspected_at_pht,
  count(*) FILTER (WHERE scheduler_status IS NOT NULL) AS registered_sessions,
  count(*) FILTER (WHERE scheduler_status IS NOT NULL
                   AND clock_out_at IS NULL) AS monitored_active,
  count(*) FILTER (WHERE scheduler_status IS NOT NULL
                   AND clock_out_at IS NULL
                   AND board_item_id IS NULL) AS active_missing_board,
  count(*) FILTER (WHERE scheduler_status IS NOT NULL AND last_error IS NOT NULL)
    AS scheduler_errors,
  count(*) FILTER (WHERE scheduler_status='GRACE') AS grace_sessions,
  count(*) FILTER (WHERE scheduler_status='OVERTIME') AS overtime_sessions,
  count(*) FILTER (WHERE scheduler_status='COMPLETED'
                   AND auto_flag='true') AS completed_automatic_sessions,
  count(*) FILTER (WHERE scheduler_status='COMPLETED'
                   AND auto_flag='true'
                   AND scheduler_reason='nine_hour_threshold_grace_expired')
    AS natural_grace_expirations,
  count(*) FILTER (WHERE scheduler_status='COMPLETED'
                   AND auto_flag='true'
                   AND scheduler_reason='approved_overtime_ended')
    AS natural_approved_overtime_expirations,
  count(*) FILTER (WHERE auto_flag='true' AND (
       scheduler_status IS DISTINCT FROM 'COMPLETED'
       OR auto_audit_count<>1
       OR total_out_audits<>1
       OR projected_out IS DISTINCT FROM clock_out_at
       OR projected_in IS DISTINCT FROM clock_in_at
       OR projected_out_geo->>'source' IS DISTINCT FROM 'server-auto-clockout'
       OR projected_out_geo->>'status' IS DISTINCT FROM 'not_captured'
       OR gps_source IS DISTINCT FROM 'server-auto-clockout'
       OR gps_status IS DISTINCT FROM 'not_captured'
       OR board_item_status IS DISTINCT FROM 'done'
       OR projected_credited_ms IS DISTINCT FROM
          private.tt_attendance_credited_ms(clock_in_at,clock_out_at)
       OR typed_hours IS DISTINCT FROM
          to_jsonb(round(projected_credited_ms::numeric/3600000,2))
       OR typed_status IS DISTINCT FROM expected_done_status
       OR scheduler_reason IS DISTINCT FROM clock_out_reason
    )) AS automatic_closeout_integrity_errors,
  count(*) FILTER (WHERE scheduler_status='COMPLETED'
                   AND auto_flag IS DISTINCT FROM 'true'
                   AND scheduler_reason IS NOT NULL)
     AS scheduler_closures_without_auto_record,
  (SELECT count(*) FROM public.timetracker_ot_requests o
    WHERE o.status='Approved'
      AND o.ot_date=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date)
    AS approved_overtime_requests_today,
  min(threshold_at) FILTER (WHERE scheduler_status='MONITORING')
    AT TIME ZONE 'Asia/Manila' AS next_threshold_pht,
  count(*) FILTER (WHERE scheduler_status IN ('MONITORING','GRACE','OVERTIME')
                   AND clock_out_at IS NOT NULL) AS monitored_but_closed
FROM lifecycle
)
SELECT outcome.*,
  CASE
    WHEN monitored_active>0 AND active_missing_board>0
      THEN 'FAILED_ACTIVE_BOARD_SYNC'
    WHEN scheduler_errors>0 OR automatic_closeout_integrity_errors>0
       OR scheduler_closures_without_auto_record>0 OR monitored_but_closed>0
      THEN 'FAILED_INTEGRITY'
    WHEN completed_automatic_sessions=0 THEN 'PENDING_NATURAL_EXPIRATION'
    ELSE 'VERIFIED_AUTOMATIC_CLOSEOUT'
  END AS natural_closeout_acceptance,
  CASE WHEN natural_approved_overtime_expirations>0
            AND automatic_closeout_integrity_errors=0
       THEN 'VERIFIED_OVERTIME_ENDPOINT'
       ELSE 'PENDING_APPROVED_OVERTIME_ENDPOINT'
  END AS overtime_closeout_acceptance
FROM outcome;
