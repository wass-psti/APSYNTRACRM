import type { Material } from "./material";
const fields = [
  "name",
  "group",
  "source",
  "description",
  "brand",
  "quantity",
  "buyingPrice",
  "currency",
  "shipping",
  "shipCurrency",
  "leadWeeks",
  "requiredDate",
  "vendor",
  "rfq",
  "account",
  "supplierPo",
] as const;
type Draft = Pick<Material, (typeof fields)[number]> & {
  id?: string;
  dbRevision?: string;
  decimalInputs?: Material["decimalInputs"];
};
const prefix = "material-sourcing.v1.draft.";
export function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(prefix + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveDraft(id: string, item: Material) {
  const draft = Object.fromEntries(
    fields.map((k) => [k, item[k]]),
  ) as unknown as Draft;
  if (id === "database.new") draft.id = item.id;
  if (id.startsWith("database.") && item.dbRevision)
    draft.dbRevision = item.dbRevision;
  if (item.decimalInputs) draft.decimalInputs = item.decimalInputs;
  localStorage.setItem(prefix + id, JSON.stringify(draft));
}
export function clearDraft(id: string) {
  localStorage.removeItem(prefix + id);
}
