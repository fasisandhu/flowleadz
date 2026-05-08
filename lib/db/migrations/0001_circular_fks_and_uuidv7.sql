-- pgcrypto provides gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Polyfill uuidv7() for Postgres 16. Postgres 17+ has it built in.
-- Layout: 48 bits unix-millis | 4 bits version (7) | 12 bits random | 2 bits variant (10) | 62 bits random
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  -- Set version 7 in byte 6 (high nibble = 0x7)
  uuid_bytes := set_byte(uuid_bytes, 6, (112 | (get_byte(uuid_bytes, 6) & 15)));
  -- Set RFC 4122 variant in byte 8 (top two bits = 10)
  uuid_bytes := set_byte(uuid_bytes, 8, (128 | (get_byte(uuid_bytes, 8) & 63)));
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Add the circular FKs after both tables exist.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_source_request_id_fk
  FOREIGN KEY (source_request_id) REFERENCES work_requests(id) ON DELETE SET NULL;

ALTER TABLE work_requests
  ADD CONSTRAINT work_requests_resolved_task_id_fk
  FOREIGN KEY (resolved_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
