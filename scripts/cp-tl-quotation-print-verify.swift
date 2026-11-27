import Foundation
import PDFKit
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let records=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("expected.json"))) as! [[String:Any]]
for record in records {
 let file=record["file"] as! String
 let count=record["count"] as! Int
 let doc=PDFDocument(url:URL(fileURLWithPath:file))!
 let pages=(0..<doc.pageCount).map{doc.page(at:$0)!}
 for page in pages {
  let b=page.bounds(for:.mediaBox)
  precondition(abs(b.width-612)<1 && abs(b.height-792)<1,"Unexpected paper size")
 }
 let text=pages.map{$0.string ?? ""}.joined(separator:"\n")
 for i in 1...count {
  let token=String(format:"ITEMTOKEN%03d",i)
  precondition(text.components(separatedBy:token).count==2,"Missing or duplicated "+token)
 }
 for token in record["notes"] as! [String] {
  precondition(text.components(separatedBy:token).count==2,"Missing or duplicated "+token)
 }
 for token in [record["total"] as! String,"TERMSENDTOKEN","Accepted by: (Client)","Synthetic creator","APPROVED"] {
  precondition(text.contains(token),"Missing printed "+token)
 }
 for token in ["WORKFLOW APPROVED","PDF NOT ISSUED","Approved revision"] {
  precondition(!text.contains(token),"Unexpected approval banner subtitle: "+token)
 }
 if count>=26 {precondition(doc.pageCount>=2 && pages.filter{($0.string ?? "").contains("MATERIAL DESCRIPTION")}.count>=2,"Missing repeated table headings")}
 print("VERIFIED \(record["profile"]!) rows=\(count) pages=\(doc.pageCount) total=\(record["total"]!) all printed tokens intact")
}
