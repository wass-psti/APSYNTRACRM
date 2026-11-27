import { cell, columns, numericColumns, type Column } from "./columns.ts";
import {
  committedCosts,
  decimalInput,
  exactSum,
  spreadsheetDecimal,
  money,
  type Material,
} from "./material.ts";

export function exactReportTotals(rows: Material[]) {
  const costs = rows.map(committedCosts);
  return {
    count: rows.length,
    quantity: exactSum(rows.map((i) => decimalInput(i, "quantity") ?? 0)),
    landed: exactSum(
      costs.map((c) => c.totalLanded),
      2,
    ),
    vat: exactSum(
      costs.flatMap((c) => (c.vatIn === null ? [] : [c.vatIn])),
      2,
    ),
    unknown: costs.filter((c) => c.vatIn === null).length,
  };
}
export function reportTotals(rows: Material[]) {
  const t = exactReportTotals(rows);
  return {
    ...t,
    quantity: spreadsheetDecimal(t.quantity),
    landed: spreadsheetDecimal(t.landed),
    vat: spreadsheetDecimal(t.vat),
  };
}
export async function exportXlsx(rows: Material[], visible: Column[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = (value: string) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#5144ED",
    textColor: "#FFFFFF",
  });
  // Always include core calculated fields even when hidden in the current table.
  const keys = [
    ...new Set<Column>([
      ...visible,
      "quantity",
      "landed",
      "totalLanded",
      "selling",
    ]),
  ];
  const data = [
    [
      header("Group"),
      ...keys.map((k) => header(columns.find((c) => c[0] === k)![1])),
      header("Total VAT-in (PHP)"),
    ],
    ...rows.map((i) => [
      i.group,
      ...keys.map((k) =>
        numericColumns.includes(k)
          ? spreadsheetDecimal(cell(i, k))
          : cell(i, k),
      ),
      spreadsheetDecimal(committedCosts(i).vatIn),
    ]),
  ];
  const total = reportTotals(rows);
  await writeXlsxFile([
    {
      sheet: "Materials",
      data,
      columns: [
        { width: 25 },
        ...keys.map((k) => ({
          width: k === "description" ? 44 : k === "name" ? 26 : 19,
        })),
        { width: 24 },
      ],
    },
    {
      sheet: "Summary",
      data: [
        [header("Metric"), header("Value")],
        ["Record count", total.count],
        ["Total quantity", total.quantity],
        ["Total landed buying (PHP)", total.landed],
        ["Total VAT-in (PHP, known sources)", total.vat],
        ["Unknown-source records excluded from VAT-in", total.unknown],
        ["Rates", "Stored/reference snapshots, not live"],
        ["Precision", "Values beyond Excel numeric precision are exact text"],
      ],
      columns: [{ width: 46 }, { width: 33 }],
    },
  ]).toFile("material-sourcing.xlsx");
}
export async function exportPdf(rows: Material[]) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: false,
  });
  const total = exactReportTotals(rows);
  const amount = (n: string | number | null) => (n === null ? "N/A" : money(n));
  doc.setFontSize(17);
  doc.text("Material Sourcing | Material catalog", 14, 15);
  doc.setFontSize(10);
  doc.text(
    rows.some((i) => i.savedCosts)
      ? "Database-derived costs - stored FX snapshots; amounts in PHP."
      : "Frontend demo - reference exchange rates; amounts in PHP unless stated.",
    14,
    22,
  );
  doc.text(
    "Records: " +
      total.count +
      " | Quantity: " +
      total.quantity +
      " | Landed: PHP " +
      amount(total.landed) +
      " | VAT-in (known): PHP " +
      amount(total.vat),
    14,
    28,
  );
  if (total.unknown)
    doc.text(
      "Unknown-source records excluded from VAT-in: " + total.unknown,
      14,
      34,
    );
  autoTable(doc, {
    startY: 39,
    margin: { top: 14, bottom: 14, left: 14, right: 14 },
    head: [
      [
        "Part number",
        "Group",
        "Description / brand",
        "Source",
        "Vendor",
        "Qty",
        "Landed/unit",
        "Total landed",
        "Selling/unit",
        "VAT-in total",
      ],
    ],
    body: rows.map((i) => {
      const c = committedCosts(i);
      return [
        i.name,
        i.group,
        i.description + " / " + i.brand,
        i.source,
        i.vendor || "-",
        String(decimalInput(i, "quantity")),
        amount(c.landed),
        amount(c.totalLanded),
        amount(c.selling),
        amount(c.vatIn),
      ];
    }),
    foot: [
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        total.quantity,
        "",
        amount(total.landed),
        "",
        amount(total.vat),
      ],
    ],
    showFoot: "lastPage",
    headStyles: { fillColor: [81, 68, 237] },
    footStyles: { fillColor: [45, 49, 71] },
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 29 },
      1: { cellWidth: 25 },
      2: { cellWidth: 53 },
      3: { cellWidth: 18 },
      4: { cellWidth: 25 },
      5: { halign: "right", cellWidth: 12 },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text("Page " + page + " of " + pages, 283, 203, { align: "right" });
  }
  doc.save("material-sourcing.pdf");
}
