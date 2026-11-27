import Foundation
import PDFKit

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let data = try Data(contentsOf: root.appendingPathComponent("expected.json"))
let records = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
precondition(records.count == 18, "Expected exactly 18 company/module PDFs")

for record in records {
    let file = record["file"] as! String
    let company = record["company"] as! String
    let type = record["type"] as! String
    let title = record["title"] as! String
    let documentNumber = record["documentNumber"] as! String
    let marker = record["marker"] as! String
    let termsMarker = record["termsMarker"] as! String
    let remarksMarker = record["remarksMarker"] as! String
    let pageSize = record["pageSize"] as! String

    guard let pdf = PDFDocument(url: URL(fileURLWithPath: file)) else {
        fatalError("PDFKit could not open " + file)
    }
    let minimumPages = record["minPages"] as? Int ?? 1
    precondition(pdf.pageCount >= minimumPages,
                 "Expected at least " + String(minimumPages) + " pages: " + file)
    let pages = (0..<pdf.pageCount).compactMap { pdf.page(at: $0) }
    precondition(pages.count == pdf.pageCount, "PDF page retrieval failed: " + file)

    for page in pages {
        let bounds = page.bounds(for: .mediaBox)
        if pageSize == "letter" {
            precondition(abs(bounds.width - 612) < 1 && abs(bounds.height - 792) < 1,
                         "Expected US Letter for " + file)
        } else {
            precondition(abs(bounds.width - 595.28) < 1 && abs(bounds.height - 841.89) < 1,
                         "Expected A4 for " + file)
        }
    }

    let text = pages.map { $0.string ?? "" }.joined(separator: "\n")
    func compact(_ value: String) -> String {
        return String(value.uppercased().filter { !$0.isWhitespace })
    }
    let searchableText = compact(text)
    let firstContentMarker = record["firstContentMarker"] as! String
    let lastContentMarker = record["lastContentMarker"] as! String
    var requiredTokens = [company, title, documentNumber, marker, termsMarker, remarksMarker,
                          firstContentMarker, lastContentMarker, "APPROVED",
                          "Electronic PDF approval and issuance have NOT been verified",
                          "CP-TL-OPT-04B Acceptance Creator"]
    if let total = record["total"] as? String {
        requiredTokens.append(total)
    }
    if let cashTotal = record["cashTotal"] as? String {
        requiredTokens.append(cashTotal)
    }
    if let chequeTotal = record["chequeTotal"] as? String {
        requiredTokens.append(chequeTotal)
    }
    if let currency = record["currency"] as? String {
        requiredTokens.append(currency)
    }
    if type != "quotation" {
        requiredTokens.append(contentsOf: ["WORKFLOW APPROVED", "PDF NOT ISSUED", "Approved revision"])
    }
    for token in requiredTokens {
        let normalizedToken = compact(token)
        if !searchableText.contains(normalizedToken) {
            fatalError("PDFKit could not find " + token + " in " + file +
                       ". Extracted text: " + String(text.prefix(2000)))
        }
    }
    print("VERIFIED PDFKit " + (record["profile"] as! String) + " / " + type +
          " pages=" + String(pdf.pageCount) + " size=" + pageSize +
          " content=" + firstContentMarker + ".." + lastContentMarker)
}
print("PASS: PDFKit verified all 18 immutable TradeLink company/module PDFs.")
