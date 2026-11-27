import Decimal from "decimal.js";

export type Currency = "PHP" | "USD" | "EUR";
export type Source = "Local" | "Import" | "Unknown";
export type Group = "Engineering Services" | "Items for Quotation";
export type Task = {
  id: string;
  title: string;
  status: "Working on it" | "Done" | "Stuck";
};
export type Activity = {
  id: string;
  text: string;
  at: string;
  kind?: "comment";
  authorRef?: string;
  parentId?: string;
  editedAt?: string;
  mentions?: string[];
  deleted?: boolean;
};
export type CostValues = {
  php: string;
  shipPhp: string;
  landed: string;
  totalLanded: string;
  selling: string | null;
  vatIn: string | null;
};
export type DecimalField =
  | "quantity"
  | "buyingPrice"
  | "shipping"
  | "usd"
  | "eur"
  | "leadWeeks";
export type DecimalInputs = Partial<Record<DecimalField, string>>;
export type FxReference = {
  id: string;
  usd: string;
  eur: string;
  observedAt: string;
  provider: string;
  isDemo: boolean;
};
export type Material = {
  savedCosts?: CostValues;
  decimalInputs?: DecimalInputs;
  expectedFxId?: string;
  id: string;
  dbRevision?: string;
  name: string;
  group: Group;
  source: Source;
  description: string;
  brand: string;
  quantity: number;
  buyingPrice: number;
  currency: Currency;
  shipping: number;
  shipCurrency: Currency;
  usd: number;
  eur: number;
  leadWeeks: number | null;
  requiredDate: string;
  vendor: string;
  rfq: string;
  account: string;
  supplierPo: string;
  requestor: string;
  created: string;
  starred: boolean;
  tasks: Task[];
  activity: Activity[];
};
export const rates = { usd: 64.45, eur: 71 };
export const groups: Group[] = ["Engineering Services", "Items for Quotation"];
export const currencies: Currency[] = ["PHP", "USD", "EUR"];
export const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};
// Match PostgreSQL numeric rounding for the positive monetary domain.
const MoneyDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
});
function cents(value: Decimal) {
  return value.toDecimalPlaces(2);
}
export function roundMoney(value: number) {
  return cents(new MoneyDecimal(value)).toNumber();
}
// The number model is retained for compatibility; exact decimal strings carry database precision.
export function decimalInput(
  item: Material,
  key: DecimalField,
): string | number | null {
  const raw = item.decimalInputs?.[key];
  return raw !== undefined && item[key] !== null && Number(raw) === item[key]
    ? raw
    : item[key];
}
export function withDecimalInput(
  item: Material,
  key: DecimalField,
  raw: string,
): Material {
  const next = {
    ...item,
    [key]: raw === "" && key === "leadWeeks" ? null : Number(raw),
  };
  const decimalInputs = { ...item.decimalInputs };
  if (raw === "" && key === "leadWeeks") delete decimalInputs[key];
  else decimalInputs[key] = raw === "" ? "0" : raw;
  return { ...next, decimalInputs };
}
export function previewCosts(item: Material): CostValues {
  const input = (key: DecimalField) =>
    new MoneyDecimal(decimalInput(item, key) ?? 0);
  const convert = (key: DecimalField, currency: Currency) =>
    input(key).times(
      currency === "USD" ? input("usd") : currency === "EUR" ? input("eur") : 1,
    );
  const php = cents(convert("buyingPrice", item.currency));
  const shipPhp = cents(convert("shipping", item.shipCurrency));
  const landed = php.plus(shipPhp);
  const selling =
    item.source === "Unknown"
      ? null
      : cents(landed.times(item.source === "Import" ? "1.69" : "1.30"));
  return {
    php: php.toFixed(2),
    shipPhp: shipPhp.toFixed(2),
    landed: landed.toFixed(2),
    totalLanded: cents(landed.times(input("quantity"))).toFixed(2),
    selling: selling?.toFixed(2) ?? null,
    vatIn:
      selling === null
        ? null
        : cents(selling.times(input("quantity")).times("1.12")).toFixed(2),
  };
}
export function calculate(item: Material) {
  const c = previewCosts(item);
  return {
    php: Number(c.php),
    shipPhp: Number(c.shipPhp),
    landed: Number(c.landed),
    totalLanded: Number(c.totalLanded),
    selling: c.selling === null ? null : Number(c.selling),
    vatIn: c.vatIn === null ? null : Number(c.vatIn),
  };
}
// Saved views must never use preview arithmetic when database costs are available.
export function committedCosts(item: Material) {
  return item.savedCosts ?? previewCosts(item);
}
export function money(n: string | number | null) {
  if (n === null) return "—";
  const [whole, fraction] = cents(new MoneyDecimal(n)).toFixed(2).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
}
export function exactSum(values: (string | number)[], scale?: number) {
  const sum = values.reduce<Decimal>(
    (total, value) => total.plus(value),
    new MoneyDecimal(0),
  );
  return scale === undefined ? sum.toFixed() : sum.toFixed(scale);
}
export function compareDecimal(a: string | number, b: string | number) {
  return new MoneyDecimal(a).cmp(b);
}
export function percentOf(part: string, total: string) {
  return new MoneyDecimal(total).isZero()
    ? 0
    : new MoneyDecimal(part).div(total).times(100).toNumber();
}
// Excel numeric cells support only 15 significant digits. Preserve larger values as exact text.
export function spreadsheetDecimal(
  value: string | number | null,
): string | number | null {
  if (value === null) return null;
  const d = new MoneyDecimal(value),
    n = d.toNumber();
  return Number.isFinite(n) && d.precision() <= 15 && d.eq(new MoneyDecimal(n))
    ? n
    : d.toFixed();
}
export function newMaterial(): Material {
  return {
    id: crypto.randomUUID(),
    name: "",
    group: groups[0],
    source: "Unknown",
    description: "",
    brand: "",
    quantity: 0,
    buyingPrice: 0,
    currency: "PHP",
    shipping: 0,
    shipCurrency: "PHP",
    ...rates,
    leadWeeks: null,
    requiredDate: "",
    vendor: "",
    rfq: "",
    account: "",
    supplierPo: "",
    requestor: "Demo user",
    created: today(),
    starred: false,
    tasks: [],
    activity: [],
  };
}
export function validate(item: Material): string {
  if (!item.name.trim() || !item.description.trim() || !item.brand.trim())
    return "Part number, description and brand are required.";
  if (item.source === "Unknown") return "Select Local or Import.";
  if (!Number.isFinite(item.quantity) || item.quantity <= 0)
    return "Quantity must be greater than zero.";
  if (
    ![item.buyingPrice, item.shipping].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    return "Prices must be nonnegative numbers.";
  if (
    item.leadWeeks !== null &&
    (!Number.isFinite(item.leadWeeks) || item.leadWeeks < 0)
  )
    return "Lead time must be nonnegative.";
  return "";
}
export const overdue = (item: Material) =>
  !!item.requiredDate && item.requiredDate < today();
export function log(text: string): Activity {
  return { id: crypto.randomUUID(), text, at: new Date().toISOString() };
}
