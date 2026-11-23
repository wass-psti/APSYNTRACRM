// Client-only operational PDF summary. No cross-client rows are accepted.
import {CLIENTS,STATUS} from './ticket-domain.js';

const number=value=>Number.isFinite(Number(value))?Number(value):0;
export function buildClientSummaryPdfDefinition({client,summary,generatedAt=new Date().toISOString(),range='All recorded operational dates'}={}){
 if(!CLIENTS.includes(client)||!summary||typeof summary!=='object')throw Error('A single client summary is required.');
 const populatedClients=(summary.clients||[]).filter(item=>number(item.tickets)>0);
 if(populatedClients.some(item=>item.name!==client))throw Error('Client PDF must contain exactly one client.');
 const total=number(summary.unarchived);
 const resolved=number(summary.resolved);
 const resolutionRate=total?Math.round((resolved/total)*1000)/10:0;
 const statusRows=STATUS.map(status=>[status,String(number(summary.statuses?.[status]))]);
 const categoryRows=(summary.categories||[]).map(item=>[String(item.name||'Unspecified'),String(number(item.tickets)),String(number(item.resolved))]);
 const downtimeRows=(summary.systems||[]).map(item=>[String(item.name||'Unspecified'),String(number(item.tickets)),String(number(item.minutes))]);
 return {
  pageSize:'A4',pageMargins:[40,48,40,48],defaultStyle:{font:'Roboto',fontSize:9,color:'#243447'},
  header:()=>({margin:[40,18,40,0],columns:[{text:'FUELTRANS SUPPORT PORTAL',bold:true,color:'#52657A',fontSize:8},{text:client,alignment:'right',bold:true,color:'#52657A',fontSize:8}]}),
  footer:(page,pageCount)=>({margin:[40,0,40,18],columns:[{text:'Client-confidential operational summary',fontSize:8,color:'#64748B'},{text:'Page '+page+' of '+pageCount,alignment:'right',fontSize:8,color:'#64748B'}]}),
  content:[
   {text:'Client Support Summary',style:'title'},
   {text:client,style:'subtitle'},
   {text:'Generated '+generatedAt+' · '+range,style:'meta'},
   {text:'Operational overview',style:'section'},
   {table:{widths:['*','*','*','*'],body:[
    [{text:'Tickets',style:'kpiLabel'},{text:'Active',style:'kpiLabel'},{text:'Resolved',style:'kpiLabel'},{text:'Resolution rate',style:'kpiLabel'}],
    [{text:String(total),style:'kpiValue'},{text:String(number(summary.active)),style:'kpiValue'},{text:String(resolved),style:'kpiValue'},{text:resolutionRate+'%',style:'kpiValue'}]
   ]},layout:'lightHorizontalLines'},
   {text:'Ticket status distribution',style:'section'},
   {table:{headerRows:1,widths:['*','auto'],body:[[{text:'Status',style:'tableHeader'},{text:'Tickets',style:'tableHeader'},],...statusRows]},layout:'lightHorizontalLines'},
   {text:'Category distribution',style:'section'},
   {table:{headerRows:1,widths:['*','auto','auto'],body:[[{text:'Category',style:'tableHeader'},{text:'Tickets',style:'tableHeader'},{text:'Resolved',style:'tableHeader'}],...(categoryRows.length?categoryRows:[['Unspecified','0','0']])]},layout:'lightHorizontalLines'},
   {text:'Recorded downtime by system',style:'section'},
   {table:{headerRows:1,widths:['*','auto','auto'],body:[[{text:'System',style:'tableHeader'},{text:'Tickets',style:'tableHeader'},{text:'Minutes',style:'tableHeader'}],...(downtimeRows.length?downtimeRows:[['No recorded downtime','0','0']])]},layout:'lightHorizontalLines'},
   {text:'Data notes',style:'section'},
   {ul:[
    'Only tickets visible in the authenticated workspace snapshot are included.',
    'Archived tickets are excluded from operational KPI totals.',
    'Downtime totals include explicitly recorded numeric values only.',
    'Category values not recorded on a ticket are reported as Unspecified.'
   ],fontSize:8,color:'#52657A'}
  ],
  styles:{
   title:{fontSize:22,bold:true,color:'#18324B',margin:[0,12,0,4]},
   subtitle:{fontSize:14,bold:true,color:'#315A7D',margin:[0,0,4,0]},
   meta:{fontSize:8,color:'#64748B',margin:[0,0,12,0]},
   section:{fontSize:12,bold:true,color:'#18324B',margin:[0,14,0,6]},
   tableHeader:{bold:true,color:'#FFFFFF',fillColor:'#24415E',margin:[5,5,5,5]},
   kpiLabel:{bold:true,color:'#52657A',fillColor:'#EEF3F7',alignment:'center',margin:[6,6,6,4]},
   kpiValue:{bold:true,fontSize:16,color:'#18324B',alignment:'center',margin:[6,4,6,8]}
  }
 };
}
