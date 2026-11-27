import { newMaterial, type Material } from '../utils/material.ts'
const rows = [
  ['VFD4A8ME23ANNAA','VFD4A8ME23ANNAA (ME300 Series)','Delta',4,120.36,20,'','2026-11-25'],
  ['6ES7131-4BB01-0AB0','SIMATIC DP, 5 electronic modules','Siemens',1,191.67,15,'','2026-11-23'],
  ['6ES7131-4BB00-0AB0','SIMATIC DP electronic module','Siemens',2,167.27,15,'Hytech','2026-11-23'],
  ['6ES7215-1AG40-0XB0','SIMATIC S7-1200, CPU 1215C','Siemens',1,522.73,15,'Hytech','2026-11-23'],
  ['6ES7315-2AH14-0AB0','SIMATIC S7-300, CPU 315-2DP','Siemens',2,2083.33,15,'Hytech','2026-11-23'],
  ['BMXP3420102','Modicon M340 processor','Schneider Electric',1,460,15,'Demo supplier','2026-11-23']
] as const
export function demoItems(): Material[] {
  const engineering = rows.map(([name,description,brand,quantity,buyingPrice,shipping,vendor,created], i): Material => ({
    ...newMaterial(), id:'demo-'+i, name,description,brand,quantity,buyingPrice,shipping,vendor,created,source:'Import',currency:'USD',shipCurrency:'USD',leadWeeks:4
  }))
  return [...engineering, {...newMaterial(), id:'demo-local', name:'DEMO-CABLE-01',description:'Industrial control cable (sample)',brand:'Demo brand',group:'Items for Quotation',source:'Local',quantity:10,buyingPrice:250,shipping:15,leadWeeks:2}]
}
