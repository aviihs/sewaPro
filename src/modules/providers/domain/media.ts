export const DocumentType = {
  CITIZENSHIP: 'CITIZENSHIP',
  NATIONAL_ID: 'NATIONAL_ID',
  PASSPORT: 'PASSPORT',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  PAN_CERTIFICATE: 'PAN_CERTIFICATE',
  SKILL_CERTIFICATE: 'SKILL_CERTIFICATE',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const MAX_DOCUMENTS = 10;
export const MAX_PORTFOLIO_IMAGES = 20;

/** KYC document. Stored privately; only reachable through signed URLs. */
export interface ProviderDocument {
  readonly id: string;
  readonly providerId: string;
  readonly type: DocumentType;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly originalName: string | null;
  readonly status: DocumentStatus;
  readonly reviewNote: string | null;
  readonly createdAt: Date;
}

export type NewProviderDocument = Pick<
  ProviderDocument,
  'providerId' | 'type' | 'storageKey' | 'mimeType' | 'sizeBytes' | 'originalName'
>;

/** Public work sample shown on the provider profile. */
export interface PortfolioImage {
  readonly id: string;
  readonly providerId: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly caption: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
}

export type NewPortfolioImage = Omit<PortfolioImage, 'id' | 'createdAt'>;
