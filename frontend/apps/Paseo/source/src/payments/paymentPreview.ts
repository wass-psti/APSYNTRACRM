import type { PaymentMethod } from '../types/domain';

/** Display-only names; the authoritative enabled methods are returned by the backend. */
const methodNames: Record<PaymentMethod, string> = { gcash: 'GCash', maya: 'Maya', bpi: 'BPI' };
export function getMethodName(method: PaymentMethod | null) {
  return method ? methodNames[method] : 'Not selected';
}
