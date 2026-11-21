import type { Court } from '../types/domain';

/** Display helpers keep presentation decisions out of page components. */
export function getCourtById(courts: readonly Court[], courtId: string | undefined) {
  return courts.find((court) => court.id === courtId);
}

export function getCourtNumber(courtId: string) {
  const match = courtId.match(/^court-(\d+)$/);
  const digits = match?.[1];
  return digits ? digits.padStart(2, '0') : '--';
}

export function matchesCourtSearch(court: Court, searchText: string) {
  const search = searchText.trim().toLowerCase();
  if (!search) return true;
  const searchableText = [court.name, court.description, ...court.features].join(' ').toLowerCase();
  return searchableText.includes(search);
}
