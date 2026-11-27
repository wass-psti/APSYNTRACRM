// Server-side only. Never import this module or a database credential into a browser bundle.
import {
  mapMaterialRow,
  type MaterialReadRow,
  type MaterialRepository,
} from "../src/api/materialRepository.ts";

export interface MaterialSqlExecutor {
  query(
    sql: string,
    values: (string | number)[],
  ): Promise<{ rows: MaterialReadRow[] }>;
}

const listSql = `
with page as (
  select c.*,g.position as group_position
  from material_sourcing.material_costs c
  join material_sourcing.material_groups g on g.id=c.group_id
  where c.archived_at is null and (
    $2 = '' or strpos(lower(c.part_number),lower($2)) > 0
    or strpos(lower(c.description),lower($2)) > 0
    or strpos(lower(c.brand),lower($2)) > 0
    or strpos(lower(c.vendor),lower($2)) > 0
  )
  order by g.position,c.created_date desc,c.created_at desc,c.id
  limit $3 offset $4
)
select p.updated_at::text as revision,p.id,p.group_name,p.part_number,p.source_type,p.description,p.brand,p.quantity,p.buying_price,
  p.currency,p.shipping_cost,p.shipping_currency,p.usd,p.eur,p.lead_weeks,p.required_date::text,
  p.vendor,p.rfq_ref,p.account_ref,p.supplier_po_ref,p.requestor,p.created_date::text,
  p.php_equivalent,p.shipping_php,p.landed,p.total_landed,p.selling,p.vat_in,
  exists(select 1 from material_sourcing.starred_materials s where s.actor_ref=$1 and s.material_id=p.id) as starred,
  coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status) order by t.position,t.id)
    from material_sourcing.tasks t where t.material_id=p.id),'[]'::jsonb) as tasks,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'body',a.body,'at',a.occurred_at,
    'author_ref',a.author_ref,'parent_id',a.parent_id,'edited_at',a.edited_at,'mentions',a.mentions,'deleted',a.deleted)
    order by a.occurred_at desc,a.id)
    from material_sourcing.activity a where a.material_id=p.id),'[]'::jsonb) as activity
from page p order by p.group_position,p.created_date desc,p.created_at desc,p.id
`;

// The actor reference is supplied by a trusted server caller in a later integration phase.
// It is not an authentication or access-control decision in this foundation.
export function createMaterialRepository(
  db: MaterialSqlExecutor,
): MaterialRepository {
  return {
    async list(request) {
      const offset = request.offset ?? 0;
      const limit = request.limit ?? 100;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1000
      )
        throw new RangeError("Invalid page offset or limit.");
      const { rows } = await db.query(listSql, [
        request.actorRef,
        request.search?.trim() ?? "",
        limit + 1,
        offset,
      ]);
      return {
        records: rows.slice(0, limit).map(mapMaterialRow),
        nextOffset: rows.length > limit ? offset + limit : null,
      };
    },
  };
}
