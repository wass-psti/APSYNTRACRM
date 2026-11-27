-- Development scratch database only. Removing receipts loses retry history.
begin;
drop table material_sourcing.bulk_operation_receipts;
commit;
