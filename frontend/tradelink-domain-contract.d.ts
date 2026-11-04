/** CP-TL-03A — Type contract for the existing ES-module/domain RPC adapter.
 * Describes the staged draft subset, not a complete TradeLink 0.1.74 DocumentRecord.
 * No new SDK runtime, bundler or second backend is introduced.
 */
export type TradeLinkDocumentType =
  'esi' | 'packing' | 'delivery' | 'payment' | 'quotation' | 'po';
export type TradeLinkWorkflowState =
  'draft' | 'submitted' | 'under-review' | 'revision-required' |
  'approved' | 'rejected' | 'completed' | 'cancelled';
export type TradeLinkCurrency =
  'PHP' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'SGD' | 'AUD' | 'SAR';
export type TradeLinkVatCode = '15_tkm' | '15_ksa' | '12' | 'exempt' | 'zero';
export type TradeLinkQuoteStage =
  'Working on it' | 'Sent' | 'Client Review' | 'Accepted' |
  'Declined' | 'On Hold' | 'Closed';
export interface TradeLinkDraftLine {
  id: string;
  kind: 'item' | 'note';
  description?: string;
  quantity?: number;
  unitPrice?: number;
  unit?: string;
  serialNumber?: string;
}
export interface TradeLinkDraftInput {
  documentType: TradeLinkDocumentType;
  documentNumber: string;
  date?: string;
  vendorId?: string;
  templateId?: string;
  customerName?: string;
  customerAddress?: string;
  customerTin?: string;
  customerContact?: string;
  customerEmail?: string;
  customerPhone?: string;
  dueDate?: string;
  referenceNumber?: string;
  poNumber?: string;
  paymentTerms?: string;
  paymentTermsCustom?: string;
  validity?: string;
  validityCustom?: string;
  deliveryCommitment?: string;
  deliveryCommitmentCustom?: string;
  targetDeliveryDate?: string;
  remarks?: string;
  terms?: string;
  currency?: TradeLinkCurrency;
  exchangeRate?: number;
  vatType?: TradeLinkVatCode;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountReason?: string;
  items?: TradeLinkDraftLine[];
  quoteStatus?: TradeLinkQuoteStage;
  verifiedBy?: string;
  verifiedByEmail?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  paymentForm?: 'cash' | 'cheque';
  cashAmount?: number;
  bankName?: string;
  chequeAmount?: number;
  chequeNumber?: string;
  paymentParticulars?: string;
  receivedBy?: string;
  drIncludePricing?: boolean;
  checkedBy?: string;
  deliveredBy?: string;
}
export type TradeLinkDocumentCommand='create'|'update'|'archive'|'restore';
export interface TradeLinkDocumentReceipt {
  documentId: string;
  boardItemId: string;
  revision: number;
  state: 'draft';
  operation: TradeLinkDocumentCommand;
  idempotent: boolean;
}
export interface TradeLinkDocumentSummary {
  documentId: string;
  boardItemId: string;
  documentType: TradeLinkDocumentType;
  documentNumber: string;
  revision: number;
  workflowState: TradeLinkWorkflowState;
  archived: boolean;
  updatedAt: string;
}
export interface TradeLinkDocumentRow {
  id: string;
  board_id: string;
  workspace_id: string;
  board_item_id: string;
  document_type: TradeLinkDocumentType;
  document_number: string;
  workflow_state: TradeLinkWorkflowState;
  revision: number;
  content: TradeLinkDraftInput;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}
