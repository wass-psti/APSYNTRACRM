import {
  committedCosts,
  decimalInput,
  compareDecimal,
  money,
  type Material,
} from "./material.ts";
export const columns = [
  ["name", "Part number"],
  ["created", "Created"],
  ["selling", "Selling price (VAT-ex)"],
  ["requestor", "Requestor"],
  ["source", "Source type"],
  ["rfq", "RFQ ref no"],
  ["description", "Description"],
  ["brand", "Brand"],
  ["vendor", "Vendor"],
  ["account", "Account"],
  ["supplierPo", "Supplier PO"],
  ["quantity", "Qty"],
  ["buyingPrice", "Buying price"],
  ["currency", "Currency"],
  ["php", "PHP equiv"],
  ["usd", "Ex. USD"],
  ["eur", "Ex. EUR"],
  ["shipping", "Shipping"],
  ["shipCurrency", "Ship. cur"],
  ["shipPhp", "Ship. PHP/unit"],
  ["landed", "Landed cost"],
  ["totalLanded", "Total landed"],
  ["leadWeeks", "Lead (wks)"],
  ["requiredDate", "Date required"],
] as const;
export type Column = (typeof columns)[number][0];
export function cell(item: Material, key: Column): string | number | null {
  if (
    key === "selling" ||
    key === "php" ||
    key === "shipPhp" ||
    key === "landed" ||
    key === "totalLanded"
  )
    return committedCosts(item)[key];
  if (
    key === "quantity" ||
    key === "buyingPrice" ||
    key === "shipping" ||
    key === "usd" ||
    key === "eur" ||
    key === "leadWeeks"
  )
    return decimalInput(item, key);
  return item[key];
}
export function display(item: Material, key: Column) {
  const value = cell(item, key);
  if (value === null || value === "") return "—";
  if (
    [
      "selling",
      "buyingPrice",
      "php",
      "usd",
      "eur",
      "shipping",
      "shipPhp",
      "landed",
      "totalLanded",
    ].includes(key)
  )
    return money(value);
  if (key === "created" || key === "requiredDate")
    return new Date(String(value) + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return String(value);
}

export const numericColumns: Column[] = [
  "selling",
  "buyingPrice",
  "php",
  "usd",
  "eur",
  "shipping",
  "shipPhp",
  "landed",
  "totalLanded",
  "quantity",
  "leadWeeks",
];
export type SortRule = { key: Column; asc: boolean };
export type ColumnWidths = Partial<Record<Column, number>>;
export const defaultColumns = columns.map(([key]) => key);
export const defaultWidths: ColumnWidths = {
  name: 220,
  created: 135,
  selling: 208,
  requestor: 180,
  source: 130,
  rfq: 150,
  description: 260,
  brand: 140,
  vendor: 160,
  account: 140,
  supplierPo: 150,
  quantity: 85,
  buyingPrice: 140,
  currency: 110,
  php: 130,
  usd: 100,
  eur: 100,
  shipping: 120,
  shipCurrency: 120,
  shipPhp: 145,
  landed: 145,
  totalLanded: 150,
  leadWeeks: 115,
  requiredDate: 150,
};
export function sortMaterials(items: Material[], rules: SortRule[]) {
  if (!rules.length) return items;
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const keyed = items.map((item) => ({
    item,
    values: rules.map((rule) => cell(item, rule.key)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < rules.length; i++) {
      const x = a.values[i],
        y = b.values[i];
      if (x === y) continue;
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;
      const cmp = numericColumns.includes(rules[i].key)
        ? compareDecimal(x, y)
        : collator.compare(String(x), String(y));
      if (cmp) return rules[i].asc ? cmp : -cmp;
    }
    return 0;
  });
  return keyed.map((row) => row.item);
}
export function changeSort(
  rules: SortRule[],
  key: Column,
  multi: boolean,
): SortRule[] {
  const old = rules.find((r) => r.key === key);
  const next = { key, asc: old ? !old.asc : true };
  if (!multi) return [next];
  return old ? rules.map((r) => (r.key === key ? next : r)) : [...rules, next];
}
export function moveColumn(order: Column[], key: Column, target: Column) {
  if (key === "name" || target === "name" || key === target) return order;
  const next = order.filter((k) => k !== key);
  next.splice(order.indexOf(target), 0, key);
  return next;
}
