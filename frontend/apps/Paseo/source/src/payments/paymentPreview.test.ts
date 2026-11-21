import { describe, expect, it } from 'vitest';
import { getMethodName } from './paymentPreview';

describe('payment method display labels', () => {
  it('retains the supported method names without fake payment-status data', () => {
    expect(getMethodName(null)).toBe('Not selected');
    expect(getMethodName('gcash')).toBe('GCash');
    expect(getMethodName('maya')).toBe('Maya');
    expect(getMethodName('bpi')).toBe('BPI');
  });
});
