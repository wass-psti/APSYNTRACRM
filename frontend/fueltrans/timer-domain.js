/**
 * FuelTrans v0.5.0 source-derived elapsed timer projections.
 * Port of src/generated/utils/ticketTimerCalcs.js, adapted to the Supabase
 * fueltrans_tickets row and with a testable clock. No fabricated SLA limits.
 * Timers are presentation projections, NOT server-attested SLA or audit facts.
 */
function time(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}
function duration(start, end) {
  return start === null || end === null ? null : Math.max(0, end - start);
}
function result(ms, status) {return {ms, status};}
export function formatDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const seconds = Math.max(0,Math.floor(Number(value)/1000));
  const days = Math.floor(seconds/86400), hours = Math.floor((seconds%86400)/3600), minutes=Math.floor((seconds%3600)/60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds%60}s`;
  return `${seconds}s`;
}
export function projectTicketTimers(row, now = Date.now()) {
  if (!row || !Number.isFinite(Number(now))) throw Error('Invalid ticket/clock.');
  const p = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  const status = row.status || p.ticketStatus || 'Open';
  const resolved = status === 'Resolved' || status === 'Closed';
  const created = time(p.createdAt || row.created_at);
  // Original source: created -> closure when present; created -> now otherwise.
  const closure = time(p.closureDate);
  const ends = closure; // Do not invent a closure event from a later row update.
  const age = created === null ? result(null,'not_started') : result(duration(created,ends ?? Number(now)),ends !== null?'stopped':'running');
  const responseStarted = time(p.responseStartedAt);
  let response = result(null,'not_started');
  if (!resolved && responseStarted !== null) {
    response = result(duration(responseStarted,Number(now)),'running');
  } else if (resolved && p.lastResponseDurationMs !== null && p.lastResponseDurationMs !== undefined && Number.isFinite(Number(p.lastResponseDurationMs)) && Number(p.lastResponseDurationMs)>=0) {
    response = result(Number(p.lastResponseDurationMs),'stopped');
  } else if (!resolved && status === 'Under L1 Review') {
    const fallback = time(p.claimedL1At) ?? time(p.l1ResponseDate);
    if (fallback !== null) response = result(duration(fallback,Number(now)),'running');
  } else if (!resolved && status === 'Under L2 Review') {
    const fallback = time(p.claimedL2At);
    if (fallback !== null) response = result(duration(fallback,Number(now)),'running');
  }
  // First response: createdAt -> l1ResponseDate, only if both verified timestamps.
  const firstL1 = time(p.l1ResponseDate);
  const firstResponse = (created !== null && firstL1 !== null && firstL1 >= created)
    ? result(firstL1-created,'stopped') : result(null,'not_started');
  const resolution = created === null ? result(null,'not_started') : result(duration(created,ends ?? Number(now)),ends !== null?'stopped':'running');
  return {age,response,firstResponse,resolution};
}
