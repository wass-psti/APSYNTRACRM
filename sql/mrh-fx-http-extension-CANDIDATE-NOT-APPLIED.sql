-- CP-MS-CRM-04B.5 candidate only; NOT APPLIED. Dedicated non-exposed transport.
-- The production catalog offers http 1.6 but it is NOT installed.
-- Run only after explicit production activation approval, with an owner that can install http.
begin;
create schema mrh_fx_http;
revoke all on schema mrh_fx_http from public,anon,authenticated;
create extension http with schema mrh_fx_http version '1.6';
-- New extension only: no arbitrary outbound HTTP privileges for application clients.
revoke all on all functions in schema mrh_fx_http from public,anon,authenticated;
commit;
