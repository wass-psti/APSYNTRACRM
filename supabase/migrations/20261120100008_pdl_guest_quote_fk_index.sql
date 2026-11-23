-- PDL only. Cover the quote->court foreign key and court/day quote lookup.
create index if not exists quotes_court_date_idx on pdl_booking.quotes(court_code,reservation_date);;
