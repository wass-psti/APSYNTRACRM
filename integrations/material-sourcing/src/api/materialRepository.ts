import type {
  Activity,
  CostValues,
  DecimalInputs,
  Currency,
  Group,
  Material,
  Source,
  Task,
} from "../utils/material.ts";

type Decimal = string | number;
export type MaterialReadRow = {
  revision: string;
  id: string;
  group_name: Group;
  part_number: string;
  source_type: Source;
  description: string;
  brand: string;
  quantity: Decimal;
  buying_price: Decimal;
  currency: Currency;
  shipping_cost: Decimal;
  shipping_currency: Currency;
  usd: Decimal;
  eur: Decimal;
  lead_weeks: Decimal | null;
  required_date: string | null;
  vendor: string;
  rfq_ref: string;
  account_ref: string;
  supplier_po_ref: string;
  requestor: string;
  created_date: string;
  starred: boolean;
  tasks: Task[];
  activity: {
    id: string;
    kind: "comment" | "event";
    author_ref?: string | null;
    body: string;
    at: string;
    parent_id: string | null;
    edited_at: string | null;
    mentions: string[];
    deleted: boolean;
  }[];
  php_equivalent: Decimal;
  shipping_php: Decimal;
  landed: Decimal;
  total_landed: Decimal;
  selling: Decimal | null;
  vat_in: Decimal | null;
};

export type MaterialRecord = {
  material: Material;
  revision: string;
  costs: CostValues;
  inputs: DecimalInputs;
};

export type MaterialPageRequest = {
  actorRef: string;
  search?: string;
  offset?: number;
  limit?: number;
};
export type MaterialPage = {
  records: MaterialRecord[];
  nextOffset: number | null;
};
export interface MaterialRepository {
  list(request: MaterialPageRequest): Promise<MaterialPage>;
}
function numeric(value: Decimal): number {
  const result = Number(value);
  if (!Number.isFinite(result))
    throw new Error("Database returned a non-finite material number.");
  return result;
}

export function mapMaterialRow(row: MaterialReadRow): MaterialRecord {
  const activity: Activity[] = row.activity.map((a) => ({
    id: a.id,
    text: a.kind === "comment" && !a.deleted ? "Comment: " + a.body : a.body,
    at: a.at,
    ...(a.author_ref ? { authorRef: a.author_ref } : {}),
    ...(a.kind === "comment"
      ? { kind: "comment" as const, mentions: a.mentions, deleted: a.deleted }
      : {}),
    ...(a.parent_id === null ? {} : { parentId: a.parent_id }),
    ...(a.edited_at === null ? {} : { editedAt: a.edited_at }),
  }));
  return {
    revision: row.revision,
    material: {
      id: row.id,
      group: row.group_name,
      name: row.part_number,
      source: row.source_type,
      description: row.description,
      brand: row.brand,
      quantity: numeric(row.quantity),
      buyingPrice: numeric(row.buying_price),
      currency: row.currency,
      shipping: numeric(row.shipping_cost),
      shipCurrency: row.shipping_currency,
      usd: numeric(row.usd),
      eur: numeric(row.eur),
      leadWeeks: row.lead_weeks === null ? null : numeric(row.lead_weeks),
      requiredDate: row.required_date ?? "",
      vendor: row.vendor,
      rfq: row.rfq_ref,
      account: row.account_ref,
      supplierPo: row.supplier_po_ref,
      requestor: row.requestor,
      created: row.created_date,
      starred: row.starred,
      tasks: row.tasks,
      activity,
    },
    inputs: {
      quantity: String(row.quantity),
      buyingPrice: String(row.buying_price),
      shipping: String(row.shipping_cost),
      usd: String(row.usd),
      eur: String(row.eur),
      ...(row.lead_weeks === null ? {} : { leadWeeks: String(row.lead_weeks) }),
    },
    costs: {
      php: String(row.php_equivalent),
      shipPhp: String(row.shipping_php),
      landed: String(row.landed),
      totalLanded: String(row.total_landed),
      selling: row.selling === null ? null : String(row.selling),
      vatIn: row.vat_in === null ? null : String(row.vat_in),
    },
  };
}
