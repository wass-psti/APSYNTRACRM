import { describe, expect, it } from 'vitest';
import { formatPeso, maxReceiptBytes, validatePaymentProof, validatePaymentProofSignature } from './guestReservation';

describe('guest QR proof validation', () => {
  it('requires a nonempty proof', () => {
    expect(validatePaymentProof(null)).toMatch(/Upload/);
    expect(validatePaymentProof(new File([], 'blank.jpg', { type: 'image/jpeg' }))).toMatch(/empty/);
  });
  it('allows only supported images and PDF within size limit', () => {
    expect(validatePaymentProof(new File(['abc'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(validatePaymentProof(new File(['abc'], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(validatePaymentProof(new File(['abc'], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(validatePaymentProof(new File(['abc'], 'bad.svg', { type: 'image/svg+xml' }))).toMatch(/JPG/);
    expect(validatePaymentProof(new File([new Uint8Array(maxReceiptBytes + 1)], 'big.pdf', { type: 'application/pdf' }))).toMatch(/5 MB/);
  });
  it('rejects file types spoofed through the MIME header', async () => {
    const pngHeader = [137,80,78,71,13,10,26,10];
    const valid = new File([new Uint8Array(pngHeader)], 'receipt.png', { type: 'image/png' });
    const spoofed = new File(['not really a png'], 'receipt.png', { type: 'image/png' });
    expect(await validatePaymentProofSignature(valid)).toBeNull();
    expect(await validatePaymentProofSignature(spoofed)).toMatch(/signature/);
  });
  it('uses integer centavos for PHP formatting', () => {
    expect(formatPeso(125050)).toContain('1,250.50');
  });
});
