import Decimal from "decimal.js";
import {currencies,newMaterial,validate,type FxReference,type Material} from "./material.ts";

// Spreadsheet TSV: preserve empty columns and quoted tabs/newlines, including CRLF.
export function splitTsv(raw:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false,closed=false;
  function pushField(){row.push(field.trim());field="";closed=false;}
  function pushRow(){pushField();if(row.some(Boolean))rows.push(row);row=[];}
  for(let i=0;i<raw.length;i++){
    const char=raw[i];
    if(quoted){
      if(char==='"'&&raw[i+1]==='"'){field+='"';i++;}
      else if(char==='"'){quoted=false;closed=true;}
      else field+=char;
    }else if(char==="\t")pushField();
    else if(char==="\r"||char==="\n"){if(char==="\r"&&raw[i+1]==="\n")i++;pushRow();}
    else if(char==='"'&&!field&&!closed)quoted=true;
    else if(closed&&char.trim())throw new Error("Invalid quoted field near row "+(rows.length+1)+".");
    else field+=char;
  }
  if(quoted)throw new Error("Unclosed quoted field.");
  pushRow();
  return rows;
}
export function parseBulkImport(raw:string,reference?:FxReference|null):Material[]{
  const rows=splitTsv(raw);
  if(!rows.length||rows.length>5000)throw new Error("Paste between 1 and 5,000 rows.");
  return rows.map((row,index)=>{
    const fail=(reason:string):never=>{throw new Error("Row "+(index+1)+": "+reason);};
    if(row.length<7||row.length>10)fail("Expected 7 to 10 columns.");
    const [name,description,brand,source,qty,price,currency,shipping="",shipCurrency="",vendor=""]=row;
    const numeric=(raw:string,positive=false)=>{
      if(raw.length>80||!(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).test(raw))fail("Invalid decimal value.");
      const d=new Decimal(raw);
      if(!d.isFinite()||d.decimalPlaces()>6||d.gte("100000000000000")||(positive?d.lte(0):d.lt(0)))fail("Invalid quantity or cost (maximum six decimal places).");
      return d.toNumber();
    };
    if(!currencies.includes(currency as Material["currency"])||!currencies.includes((shipCurrency||"PHP") as Material["currency"]))fail("Invalid currency.");
    if(!["Local","Import"].includes(source))fail("Select Local or Import.");
    const item:Material={...newMaterial(),name,description,brand,source:source as Material["source"],quantity:numeric(qty,true),buyingPrice:numeric(price),currency:currency as Material["currency"],shipping:numeric(shipping||"0"),shipCurrency:(shipCurrency||"PHP") as Material["currency"],vendor,decimalInputs:{quantity:qty,buyingPrice:price,shipping:shipping||"0",...(reference?{usd:reference.usd,eur:reference.eur}:{})},...(reference?{expectedFxId:reference.id,usd:Number(reference.usd),eur:Number(reference.eur)}:{})};
    const problem=validate(item);if(problem)fail(problem);
    return item;
  });
}
