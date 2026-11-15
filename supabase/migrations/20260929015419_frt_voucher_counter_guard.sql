alter table public.frt_voucher_counters enable row level security;
revoke select,insert,update,delete on public.frt_voucher_counters from anon,authenticated;;
