import Foundation
import PDFKit

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let data = try Data(contentsOf: root.appendingPathComponent("expected.json"))
let records = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
precondition(records.count == 3, "Expected two historical revision renders and one current revision render")

func compact(_ value: String) -> String {
    return String(value.uppercased().filter { !$0.isWhitespace })
}

var extracted: [String: String] = [:]
var pageCounts: [String: Int] = [:]

for record in records {
    let file = record["file"] as! String
    let filename = URL(fileURLWithPath: file).lastPathComponent
    let revision = record["revision"] as! Int
    let company = record["company"] as! String
    let title = record["title"] as! String
    let documentNumber = record["documentNumber"] as! String
    let marker = record["marker"] as! String
    let termsMarker = record["termsMarker"] as! String
    let itemMarker = record["itemMarker"] as! String
    let remarksMarker = record["remarksMarker"] as! String
    let total = record["total"] as! String
    let forbiddenMarkers = record["forbiddenMarkers"] as! [String]

    guard let pdf = PDFDocument(url: URL(fileURLWithPath: file)) else {
        fatalError("PDFKit could not open " + filename)
    }
    precondition(pdf.pageCount >= 1, "Historical PDF has no pages: " + filename)
    let pages = (0..<pdf.pageCount).compactMap { pdf.page(at: $0) }
    precondition(pages.count == pdf.pageCount, "PDF page retrieval failed: " + filename)

    for page in pages {
        let bounds = page.bounds(for: .mediaBox)
        precondition(abs(bounds.width - 612) < 1 && abs(bounds.height - 792) < 1,
                     "Historical quotation must remain US Letter: " + filename)
    }

    let text = pages.map { $0.string ?? "" }.joined(separator: "\n")
    let searchableText = compact(text)
    let requiredTokens = [
        company, title, documentNumber, "Revision " + String(revision),
        marker, termsMarker, itemMarker, remarksMarker, total,
        record["currency"] as! String,
        "APPROVED", "CP-TL-OPT-04B Historical Acceptance Creator"
    ]
    for token in requiredTokens {
        precondition(searchableText.contains(compact(token)),
                     "Missing historical token " + token + " in " + filename)
    }
    for token in forbiddenMarkers {
        precondition(!searchableText.contains(compact(token)),
                     "Historical output contains another revision's content: " + token)
    }
    for token in ["WORKFLOW APPROVED", "PDF NOT ISSUED", "Approved revision"] {
        precondition(!searchableText.contains(compact(token)),
                     "Quotation approval presentation changed: " + token)
    }

    extracted[filename] = searchableText
    pageCounts[filename] = pdf.pageCount
    print("VERIFIED PDFKit historical revision " + String(revision) +
          " pages=" + String(pdf.pageCount) + " file=" + filename)
}

let revision4Before = extracted["revision-4-before.pdf"]!
let revision4After = extracted["revision-4-after.pdf"]!
let revision5Current = extracted["revision-5-current.pdf"]!
precondition(revision4Before == revision4After,
             "Historical revision 4 text changed after revision 5 was rendered")
precondition(pageCounts["revision-4-before.pdf"] == pageCounts["revision-4-after.pdf"],
             "Historical revision 4 page count changed after revision 5 was rendered")
precondition(revision4Before != revision5Current,
             "Revision 5 must remain distinct from historical revision 4")

print("PASS: PDFKit confirms exact revision 4 reproduction before and after revision 5, with no cross-revision content leakage.")
