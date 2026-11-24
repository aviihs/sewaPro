import { type ProviderDocument } from '../../../src/modules/providers/domain/media.js';
import { Provider, type ProviderProps } from '../../../src/modules/providers/domain/provider.js';

const at = new Date('2030-01-01T00:00:00Z');

export const aProvider = (overrides: Partial<ProviderProps> = {}): Provider =>
  Provider.restore({
    id: 'prov-1',
    userId: 'user-p1',
    businessName: 'Thapa Electricals',
    bio: null,
    experienceYears: 5,
    verificationStatus: 'PENDING_VERIFICATION',
    rejectionReason: null,
    submittedAt: at,
    verifiedAt: null,
    latitude: 27.7,
    longitude: 85.3,
    serviceRadiusKm: 10,
    ratingAverage: 0,
    ratingCount: 0,
    completedJobs: 0,
    isAvailable: true,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aDocument = (overrides: Partial<ProviderDocument> = {}): ProviderDocument => ({
  id: 'doc-1',
  providerId: 'prov-1',
  type: 'CITIZENSHIP',
  storageKey: 'providers/prov-1/documents/doc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  originalName: 'citizenship.pdf',
  status: 'PENDING',
  reviewNote: null,
  createdAt: at,
  ...overrides,
});
