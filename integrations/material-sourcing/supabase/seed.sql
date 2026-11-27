-- Synthetic local fixtures. Never use this file to import historical data.
begin;
insert into material_sourcing.fx_snapshots(id,usd,eur,observed_at,provider,is_demo)
values ('demo-rates',64.45,71,'2026-11-25T00:00:00+08:00','reference snapshot',true);
insert into material_sourcing.materials
(id,group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,fx_snapshot_id,lead_weeks,vendor,requestor,created_date)
values
('demo-0','new_group','VFD4A8ME23ANNAA','Import','VFD4A8ME23ANNAA (ME300 Series)','Delta',4,120.36,'USD',20,'USD','demo-rates',4,'','Demo user','2026-11-25'),
('demo-1','new_group','6ES7131-4BB01-0AB0','Import','SIMATIC DP, 5 electronic modules','Siemens',1,191.67,'USD',15,'USD','demo-rates',4,'','Demo user','2026-11-23'),
('demo-2','new_group','6ES7131-4BB00-0AB0','Import','SIMATIC DP electronic module','Siemens',2,167.27,'USD',15,'USD','demo-rates',4,'Hytech','Demo user','2026-11-23'),
('demo-3','new_group','6ES7215-1AG40-0XB0','Import','SIMATIC S7-1200, CPU 1215C','Siemens',1,522.73,'USD',15,'USD','demo-rates',4,'Hytech','Demo user','2026-11-23'),
('demo-4','new_group','6ES7315-2AH14-0AB0','Import','SIMATIC S7-300, CPU 315-2DP','Siemens',2,2083.33,'USD',15,'USD','demo-rates',4,'Hytech','Demo user','2026-11-23'),
('demo-5','new_group','BMXP3420102','Import','Modicon M340 processor','Schneider Electric',1,460,'USD',15,'USD','demo-rates',4,'Demo supplier','Demo user','2026-11-23'),
('demo-local','topics','DEMO-CABLE-01','Local','Industrial control cable (sample)','Demo brand',10,250,'PHP',15,'PHP','demo-rates',2,'','Demo user','2026-11-25');
commit;
