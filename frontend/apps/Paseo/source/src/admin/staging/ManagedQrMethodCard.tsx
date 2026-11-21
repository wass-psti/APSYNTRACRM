import { useEffect, useRef, useState } from 'react';
import { backendAdminFetch, sharedSupabaseAdminEnabled } from './StagingAdminGate';

export type ManagedPaymentMethod = 'gcash' | 'maya' | 'bpi';
export interface ManagedMethod {
  method: ManagedPaymentMethod;
  recipient: string;
  imageUrl: string | null;
}

export const managedPaymentMethods: { method: ManagedPaymentMethod; label: string }[] = [
  { method: 'gcash', label: 'GCash' },
  { method: 'maya', label: 'Maya' },
  { method: 'bpi', label: 'BPI' },
];

const maxQrBytes = 2 * 1024 * 1024;

export function validateQrImage(file: File): string | null {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Select a JPG or PNG QR image.';
  if (file.size < 8) return 'The QR image is empty or invalid.';
  if (file.size > maxQrBytes) return 'The QR image must be 2 MB or smaller.';
  return null;
}

export async function validateQrImageSignature(file: File): Promise<string | null> {
  const problem = validateQrImage(file);
  if (problem) return problem;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte);
  return ((file.type === 'image/jpeg' && jpeg) || (file.type === 'image/png' && png))
    ? null : 'The selected file is not a valid JPG or PNG image.';
}

export function ManagedQrMethodCard({
  method, label, configured, onSaved,
}: {
  method: ManagedPaymentMethod;
  label: string;
  configured: ManagedMethod | undefined;
  onSaved: () => Promise<ManagedMethod[]>;
}) {
  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [validation, setValidation] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const fileInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (configured) setRecipient(configured.recipient === 'UNVERIFIED' ? '' : configured.recipient);
  }, [configured?.recipient, configured?.imageUrl]);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => { sequence.current += 1; }, []);

  useEffect(() => { setImageState('loading'); }, [previewUrl, configured?.imageUrl, revision]);

  async function chooseImage(candidate: File | null) {
    const current = ++sequence.current;
    setValidation('');
    setMessage('');
    setFile(null);
    if (!candidate) return;
    const problem = validateQrImage(candidate);
    if (problem) { setValidation(problem); if (fileInput.current) fileInput.current.value = ''; return; }
    setChecking(true);
    try {
      const signatureError = await validateQrImageSignature(candidate);
      if (current !== sequence.current) return;
      if (signatureError) {
        setValidation(signatureError);
        if (fileInput.current) fileInput.current.value = '';
      } else setFile(candidate);
    } catch {
      if (current === sequence.current) setValidation('Unable to read this QR image.');
    } finally {
      if (current === sequence.current) setChecking(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || saving || !file || recipient.trim().length < 2 || validation) return;
    setSaving(true);
    setMessage('Saving QR image…');
    try {
      const payload = new FormData();
      payload.set('recipient', recipient.trim());
      payload.set('image', file, file.name);
      const response = await backendAdminFetch(`/v1/admin/payment-methods/${method}`, {
        method: 'PUT', body: payload,
      });
      if (!response.ok) throw new Error(`Could not save ${label} QR image. Existing saved images were not changed.`);
      const updated = await onSaved();
      const saved = updated.find(item => item.method === method);
      if (!saved || saved.recipient !== recipient.trim() || !saved.imageUrl) {
        throw new Error(`${label} QR image save could not be confirmed. Refresh before trying again.`);
      }
      // New revision forces the actual stored asset URL to reload.
      setRevision(value => value + 1);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage(`${label} QR image saved for this payment method.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'QR image update failed.');
    } finally { setSaving(false); }
  }

  const storedUrl = configured?.imageUrl
    ? `${configured.imageUrl}${configured.imageUrl.includes('?') ? '&' : '?'}revision=${revision}`
    : '';

  const activeUrl = previewUrl || storedUrl;
  const previewIsUnsaved = Boolean(previewUrl);

  return (
    <form className="managed-qr-method booking-panel" aria-label={`${label} QR configuration`}
      onSubmit={event => { void save(event); }}>
      <div className="managed-qr-heading">
        <div><span className="managed-qr-eyebrow">PAYMENT METHOD</span><h3>{label}</h3></div>
        <span className="managed-qr-status">{previewUrl ? 'Unsaved preview' : storedUrl && imageState === 'error' ? 'Image unavailable' : storedUrl ? 'Saved configuration' : 'Not configured'}</span>
      </div>
      <label htmlFor={`admin-qr-recipient-${method}`}>{label} recipient name</label>
      <input id={`admin-qr-recipient-${method}`} value={recipient} required minLength={2} maxLength={100}
        onChange={event => setRecipient(event.target.value)} placeholder={`Recipient for ${label}`} />
      <label htmlFor={`admin-qr-image-${method}`}>{label} QR image (JPG/PNG, up to 2 MB)</label>
      <input id={`admin-qr-image-${method}`} ref={fileInput} type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        onChange={event => { void chooseImage(event.target.files?.[0] ?? null); }} />
      {checking && <p role="status">Checking {label} image format…</p>}
      {validation && <p role="alert" className="form-error">{validation}</p>}
      <div className="managed-qr-preview" aria-label={`${label} QR image preview`}>
        <div className="managed-qr-preview-heading">
          <span>{previewIsUnsaved ? 'New image preview' : 'Saved QR image'}</span>
          <span>{previewIsUnsaved ? 'NOT YET SAVED' : storedUrl && imageState === 'error' ? 'NEEDS ATTENTION' : storedUrl ? 'ON FILE' : 'NO IMAGE'}</span>
        </div>
        <div className="managed-qr-media">
          {activeUrl && imageState !== 'error' && (
            <img key={activeUrl} src={activeUrl} alt={`${label} payment QR code`}
              onLoad={() => setImageState('ready')}
              onError={() => setImageState('error')}
              className={imageState === 'ready' ? 'managed-qr-image-ready' : 'managed-qr-image-loading'} />
          )}
          {activeUrl && imageState === 'loading' && (
            <div className="managed-qr-placeholder" role="status">
              <span className="managed-qr-placeholder-icon" aria-hidden="true">▦</span>
              <span>Loading QR image…</span>
            </div>
          )}
          {(!activeUrl || imageState === 'error') && (
            <div className="managed-qr-placeholder" role="status">
              <span className="managed-qr-placeholder-icon" aria-hidden="true">▦</span>
              <strong>{imageState === 'error' && activeUrl ? 'QR image unavailable' : 'No QR image uploaded'}</strong>
              <span>{imageState === 'error' && activeUrl
                ? 'The saved image could not be displayed. Select a replacement image below.'
                : 'Choose a JPG or PNG image to configure this payment method.'}</span>
            </div>
          )}
        </div>
        <p className="managed-qr-preview-note">{previewIsUnsaved
          ? 'Preview only — save to update the stored image.'
          : imageState === 'error' && activeUrl
            ? 'The saved image reference exists, but the preview failed to load.'
            : 'QR images are displayed without cropping.'}</p>
      </div>
      <button type="submit" className="button button-primary"
        disabled={checking || saving || !file || recipient.trim().length < 2 || Boolean(validation)}>
        {saving ? 'Saving…' : `Save ${label} QR configuration`}
      </button>
      <p role="status" aria-live="polite">{message}</p>
      {!sharedSupabaseAdminEnabled && <p className="booking-help">Test workspace only.</p>}
    </form>
  );
}
