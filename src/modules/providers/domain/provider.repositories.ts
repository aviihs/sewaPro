import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  type AvailabilityWindow,
  type BlockedDate,
  type ProviderSettings,
} from './availability.js';
import {
  type DocumentStatus,
  type NewPortfolioImage,
  type NewProviderDocument,
  type PortfolioImage,
  type ProviderDocument,
} from './media.js';
import { type OfferingInput, type ProviderOffering } from './offering.js';
import {
  type NewProvider,
  type Provider,
  type ProviderProfileChanges,
  type VerificationStatus,
} from './provider.js';

/** Admin read model: provider plus the account's contact details. */
export interface ProviderAdminSummary {
  readonly provider: Provider;
  readonly fullName: string;
  readonly phone: string;
  readonly email: string | null;
  readonly documentCount: number;
}

export interface ProviderAdminFilter {
  readonly status?: VerificationStatus;
  /** Matches business name, owner name or phone. */
  readonly search?: string;
}

export abstract class ProviderRepository {
  abstract findById(id: string): Promise<Provider | null>;
  abstract findByUserId(userId: string): Promise<Provider | null>;
  /** Creates the provider together with its settings row. */
  abstract create(provider: NewProvider, settings: ProviderSettings): Promise<Provider>;
  abstract updateProfile(id: string, changes: ProviderProfileChanges): Promise<Provider>;
  /** Persists verification status, reason and timestamps. */
  abstract saveVerification(provider: Provider): Promise<Provider>;
  abstract incrementCompletedJobs(id: string): Promise<void>;
  /** Stores a freshly computed rating aggregate. */
  abstract setRating(id: string, average: number, count: number): Promise<void>;
  abstract listForAdmin(
    filter: ProviderAdminFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<ProviderAdminSummary>>;
  abstract findAdminSummary(id: string): Promise<ProviderAdminSummary | null>;
}

export abstract class OfferingRepository {
  abstract listByProvider(providerId: string): Promise<ProviderOffering[]>;
  abstract find(providerId: string, serviceId: string): Promise<ProviderOffering | null>;
  abstract upsert(
    providerId: string,
    serviceId: string,
    input: OfferingInput,
  ): Promise<ProviderOffering>;
  /** Returns false when the provider did not offer the service. */
  abstract remove(providerId: string, serviceId: string): Promise<boolean>;
}

export abstract class DocumentRepository {
  abstract list(providerId: string): Promise<ProviderDocument[]>;
  abstract count(providerId: string, status?: DocumentStatus): Promise<number>;
  abstract create(document: NewProviderDocument): Promise<ProviderDocument>;
  abstract findOwned(id: string, providerId: string): Promise<ProviderDocument | null>;
  abstract delete(id: string): Promise<void>;
  /** Marks every still-PENDING document of the provider as reviewed. */
  abstract reviewPending(
    providerId: string,
    status: DocumentStatus,
    note: string | null,
  ): Promise<void>;
}

export abstract class PortfolioRepository {
  abstract list(providerId: string): Promise<PortfolioImage[]>;
  abstract count(providerId: string): Promise<number>;
  abstract create(image: NewPortfolioImage): Promise<PortfolioImage>;
  abstract findOwned(id: string, providerId: string): Promise<PortfolioImage | null>;
  abstract delete(id: string): Promise<void>;
}

export abstract class AvailabilityRepository {
  abstract getWindows(providerId: string): Promise<AvailabilityWindow[]>;
  abstract replaceWindows(
    providerId: string,
    windows: readonly AvailabilityWindow[],
  ): Promise<void>;
  /** Blocked dates on or after `fromDate` (YYYY-MM-DD), ascending. */
  abstract listBlockedDates(providerId: string, fromDate: string): Promise<BlockedDate[]>;
  /** @throws BlockedDateConflictError when the date is already blocked. */
  abstract addBlockedDate(
    providerId: string,
    date: string,
    reason: string | null,
  ): Promise<BlockedDate>;
  abstract removeBlockedDate(id: string, providerId: string): Promise<boolean>;
  abstract getSettings(providerId: string): Promise<ProviderSettings>;
  abstract updateSettings(
    providerId: string,
    changes: Partial<ProviderSettings>,
  ): Promise<ProviderSettings>;
}

export interface BookingCounts {
  readonly pending: number;
  readonly accepted: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  readonly scheduledToday: number;
}

export interface EarningsTotals {
  readonly completedJobs: number;
  readonly totalAmount: number;
}

/** Read-only aggregates over the provider's bookings (counts and totals, no commission). */
export abstract class ProviderStatsReader {
  abstract bookingCounts(
    providerId: string,
    today: { start: Date; end: Date },
  ): Promise<BookingCounts>;
  abstract completedTotals(
    providerId: string,
    range?: { start: Date; end: Date },
  ): Promise<EarningsTotals>;
}
