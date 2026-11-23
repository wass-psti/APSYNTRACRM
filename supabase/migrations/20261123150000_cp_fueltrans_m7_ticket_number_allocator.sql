-- CP-FUELTRANS-M7-02: allocate client/year ticket references in the database.
-- Format: [CLIENT PREFIX]-[PHILIPPINE LOCAL YEAR]-[SEQUENCE, MINIMUM 3 DIGITS].
-- Existing ticket identifiers are preserved. Counters are seeded from any matching
-- references already present before the insert trigger is activated.

CREATE TABLE IF NOT EXISTS private.fueltrans_ticket_number_counters (
  client_code text NOT NULL
    CHECK (client_code IN ('UNIOIL', 'ARAMCO', 'REPHIL', 'PETRON')),
  ticket_year integer NOT NULL
    CHECK (ticket_year BETWEEN 2000 AND 9999),
  last_value bigint NOT NULL DEFAULT 0
    CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (client_code, ticket_year)
);

ALTER TABLE private.fueltrans_ticket_number_counters
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.fueltrans_ticket_number_counters
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.fueltrans_ticket_number_counters IS
  'Internal transactional counters for FuelTrans client/year ticket references.';

-- Keep existing references intact while guaranteeing that all nonblank references
-- remain unique across FuelTrans workspaces.
CREATE UNIQUE INDEX IF NOT EXISTS fueltrans_tickets_ticket_number_uq
  ON public.fueltrans_tickets (ticket_number)
  WHERE nullif(btrim(ticket_number), '') IS NOT NULL;

-- Preserve the high-water mark if a client/year formatted reference already exists.
INSERT INTO private.fueltrans_ticket_number_counters (
  client_code,
  ticket_year,
  last_value
)
SELECT
  t.client_code,
  substring(t.ticket_number FROM '^[A-Z]{3}-([0-9]{4})-')::integer,
  max(substring(t.ticket_number FROM '-([0-9]{3,})$')::bigint)
FROM public.fueltrans_tickets AS t
WHERE t.ticket_number ~ '^(UNI|ARA|REP|PET)-[0-9]{4}-[0-9]{3,}$'
  AND (
    (t.client_code = 'UNIOIL' AND t.ticket_number LIKE 'UNI-%')
    OR (t.client_code = 'ARAMCO' AND t.ticket_number LIKE 'ARA-%')
    OR (t.client_code = 'REPHIL' AND t.ticket_number LIKE 'REP-%')
    OR (t.client_code = 'PETRON' AND t.ticket_number LIKE 'PET-%')
  )
GROUP BY
  t.client_code,
  substring(t.ticket_number FROM '^[A-Z]{3}-([0-9]{4})-')::integer
ON CONFLICT (client_code, ticket_year)
DO UPDATE SET
  last_value = greatest(
    private.fueltrans_ticket_number_counters.last_value,
    EXCLUDED.last_value
  ),
  updated_at = clock_timestamp();

CREATE OR REPLACE FUNCTION private.fueltrans_assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_client_code text;
  v_prefix text;
  v_ticket_year integer;
  v_sequence bigint;
  v_activity jsonb;
BEGIN
  -- This trigger is an internal part of authenticated ticket creation, not a
  -- separately callable ticket-creation endpoint.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated FuelTrans session is required to create a ticket'
      USING ERRCODE = '28000';
  END IF;

  v_client_code := upper(btrim(coalesce(NEW.client_code, '')));

  v_prefix := CASE v_client_code
    WHEN 'UNIOIL' THEN 'UNI'
    WHEN 'ARAMCO' THEN 'ARA'
    WHEN 'REPHIL' THEN 'REP'
    WHEN 'PETRON' THEN 'PET'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unsupported FuelTrans client code: %', v_client_code
      USING ERRCODE = '22023';
  END IF;

  -- Browser timestamps are draft metadata, not authoritative creation time.
  -- Capture the database clock once and use it for the row, payload and creation event.
  NEW.created_at := clock_timestamp();
  NEW.updated_at := NEW.created_at;

  -- The reference year follows the Philippine business calendar, not UTC or the
  -- browser's clock. The same database timestamp is used for both year and readback.
  v_ticket_year := extract(
    year FROM (NEW.created_at AT TIME ZONE 'Asia/Manila')
  )::integer;

  -- The row-level upsert serializes competing inserts for the same client/year.
  -- The counter update and ticket insert share one transaction and roll back
  -- together if any later ticket insert step fails.
  INSERT INTO private.fueltrans_ticket_number_counters (
    client_code,
    ticket_year,
    last_value,
    updated_at
  )
  VALUES (v_client_code, v_ticket_year, 1, clock_timestamp())
  ON CONFLICT (client_code, ticket_year)
  DO UPDATE SET
    last_value = private.fueltrans_ticket_number_counters.last_value + 1,
    updated_at = clock_timestamp()
  RETURNING last_value INTO v_sequence;

  NEW.ticket_number := v_prefix || '-' || v_ticket_year::text || '-' ||
    lpad(v_sequence::text, 3, '0');

  -- Keep the ticket's database columns and JSON payload on the same timestamp
  -- and synchronize the authoritative ticket reference.
  NEW.payload := jsonb_set(
    coalesce(NEW.payload, '{}'::jsonb),
    '{ticketId}',
    to_jsonb(NEW.ticket_number),
    true
  );
  NEW.payload := jsonb_set(
    NEW.payload,
    '{createdAt}',
    to_jsonb(NEW.created_at),
    true
  );
  NEW.payload := jsonb_set(
    NEW.payload,
    '{updatedAt}',
    to_jsonb(NEW.updated_at),
    true
  );

  IF jsonb_typeof(NEW.payload -> 'activity') = 'array' THEN
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(entry.value -> 'metadata') = 'object' THEN
          jsonb_set(
            CASE
              WHEN entry.value ->> 'type' = 'ticket_created' THEN
                jsonb_set(
                  entry.value,
                  '{timestamp}',
                  to_jsonb(NEW.created_at),
                  true
                )
              ELSE entry.value
            END,
            '{metadata,ticketId}',
            to_jsonb(NEW.ticket_number),
            true
          )
        WHEN entry.value ->> 'type' = 'ticket_created' THEN
          jsonb_set(
            entry.value,
            '{timestamp}',
            to_jsonb(NEW.created_at),
            true
          )
        ELSE entry.value
      END
      ORDER BY entry.ordinality
    )
    INTO v_activity
    FROM jsonb_array_elements(NEW.payload -> 'activity')
      WITH ORDINALITY AS entry(value, ordinality);

    IF v_activity IS NOT NULL THEN
      NEW.payload := jsonb_set(NEW.payload, '{activity}', v_activity, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.fueltrans_assign_ticket_number()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fueltrans_ticket_number_before_insert
  ON public.fueltrans_tickets;

CREATE TRIGGER fueltrans_ticket_number_before_insert
  BEFORE INSERT ON public.fueltrans_tickets
  FOR EACH ROW
  EXECUTE FUNCTION private.fueltrans_assign_ticket_number();

COMMENT ON FUNCTION private.fueltrans_assign_ticket_number() IS
  'Assigns unique client/year FuelTrans ticket references and database-authoritative creation timestamps atomically on ticket insert.';
