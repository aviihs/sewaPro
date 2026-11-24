import {
  Quotation,
  type QuotationProps,
} from '../../../src/modules/quotations/domain/quotation.js';

export const aQuotation = (overrides: Partial<QuotationProps> = {}): Quotation =>
  Quotation.restore({
    id: 'q-1',
    bookingId: 'bk-1',
    providerId: 'prov-1',
    labourCost: 1500,
    materialCost: 500,
    total: 2000,
    note: null,
    status: 'SENT',
    expiresAt: new Date('2030-01-08T10:00:00Z'),
    sentAt: new Date('2030-01-06T09:00:00Z'),
    respondedAt: null,
    createdAt: new Date('2030-01-06T09:00:00Z'),
    updatedAt: new Date('2030-01-06T09:00:00Z'),
    ...overrides,
  });
