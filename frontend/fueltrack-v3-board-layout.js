/** FuelTrack+ v3 board table projection.
 * Presentation only: the eight authoritative FuelTrack integration columns,
 * their immutable IDs, values and synchronization contracts remain intact.
 * The built-in item status backs Status; the existing Event Date column backs
 * Date. Never manufacture records or rewrite domain reconciliation status.
 */
export const FUELTRACK_V3_BOARD_ID='7af78b3f-67bf-4600-9aa1-9006d19d486e';
export const FUELTRACK_V3_WORKSPACE_ID='00000000-0000-4000-8000-000000000001';
const MARKER='[APSYNTRA:MODULE:fueltrack:v1]';
const DATE_COLUMN='Event Date';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFuelTrackV3Board(board){
 return board?.id===FUELTRACK_V3_BOARD_ID&&
  board.workspace_id===FUELTRACK_V3_WORKSPACE_ID&&
  board.name==='FuelTrack+ v3'&&board.status==='active'&&
  !board.archived_at&&!board.trashed_at&&
  String(board.description||'').startsWith(MARKER);
}

/** Return null to leave existing rendering unchanged if an expected backend
 * column is missing or ambiguous. Do not substitute a different date field. */
export function fuelTrackV3GridColumns(detail){
 if(!isFuelTrackV3Board(detail?.board))return null;
 const dates=(Array.isArray(detail.columns)?detail.columns:[]).filter(c=>
  UUID.test(c?.id||'')&&c.name===DATE_COLUMN&&
  c.data_type==='date'&&c.system_key==null&&c.visible!==false);
 if(dates.length!==1)return null;
 return [
  {key:'record',title:'Item'},
  {key:'status',title:'Status'},
  {key:'col:'+dates[0].id,title:'Date'}
 ];
}
