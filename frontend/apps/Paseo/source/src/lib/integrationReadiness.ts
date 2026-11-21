// FE-09 integration boundary: these services are NOT connected.
// Keep the UI honest until a real backend contract and runtime acceptance exist.
export type ServiceName = 'availability' | 'reservations' | 'payments' | 'customerLookup' | 'adminOperations';

export interface IntegrationStatus {
  service: ServiceName;
  connected: false;
  reason: string;
}

export const integrationReadiness: readonly IntegrationStatus[] = [
  { service: 'availability', connected: false, reason: 'Live court inventory is not configured.' },
  { service: 'reservations', connected: false, reason: 'A booking API and persistent database are not configured.' },
  { service: 'payments', connected: false, reason: 'No payment provider or trusted transaction verification exists.' },
  { service: 'customerLookup', connected: false, reason: 'No verified customer reservation lookup exists.' },
  { service: 'adminOperations', connected: false, reason: 'Admin settings are local frontend demonstrations only.' },
];

export function isServiceConnected(service: ServiceName): boolean {
  return integrationReadiness.find((item) => item.service === service)?.connected ?? false;
}
