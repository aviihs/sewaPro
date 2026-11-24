import { InvalidVerificationTransitionError } from './providers.errors.js';

export const VerificationStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export interface ProviderProps {
  readonly id: string;
  readonly userId: string;
  readonly businessName: string | null;
  readonly bio: string | null;
  readonly experienceYears: number;
  readonly verificationStatus: VerificationStatus;
  readonly rejectionReason: string | null;
  readonly submittedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly serviceRadiusKm: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedJobs: number;
  readonly isAvailable: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProviderProfileChanges {
  readonly businessName?: string;
  readonly bio?: string;
  readonly experienceYears?: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly serviceRadiusKm?: number;
  readonly isAvailable?: boolean;
}

export type NewProvider = Pick<
  ProviderProps,
  | 'userId'
  | 'businessName'
  | 'bio'
  | 'experienceYears'
  | 'latitude'
  | 'longitude'
  | 'serviceRadiusKm'
> & { readonly submittedAt: Date };

/**
 * A service provider and its verification lifecycle:
 * PENDING_VERIFICATION → VERIFIED | REJECTED; REJECTED → PENDING_VERIFICATION (resubmit);
 * VERIFIED → SUSPENDED; SUSPENDED → VERIFIED (reinstate).
 */
export class Provider implements ProviderProps {
  readonly id: string;
  readonly userId: string;
  readonly businessName: string | null;
  readonly bio: string | null;
  readonly experienceYears: number;
  readonly verificationStatus: VerificationStatus;
  readonly rejectionReason: string | null;
  readonly submittedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly serviceRadiusKm: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedJobs: number;
  readonly isAvailable: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ProviderProps) {
    Object.assign(this, props);
  }

  static restore(props: ProviderProps): Provider {
    return new Provider(props);
  }

  /** Visible in search and able to receive bookings. */
  get isBookable(): boolean {
    return this.verificationStatus === VerificationStatus.VERIFIED && this.isAvailable;
  }

  verify(at: Date): Provider {
    this.assertStatus(
      'verify',
      VerificationStatus.PENDING_VERIFICATION,
      VerificationStatus.SUSPENDED,
    );
    return this.with({
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: at,
      rejectionReason: null,
    });
  }

  reject(reason: string): Provider {
    this.assertStatus('reject', VerificationStatus.PENDING_VERIFICATION);
    return this.with({ verificationStatus: VerificationStatus.REJECTED, rejectionReason: reason });
  }

  suspend(): Provider {
    this.assertStatus('suspend', VerificationStatus.VERIFIED);
    return this.with({ verificationStatus: VerificationStatus.SUSPENDED });
  }

  resubmit(at: Date): Provider {
    this.assertStatus('resubmit', VerificationStatus.REJECTED);
    return this.with({
      verificationStatus: VerificationStatus.PENDING_VERIFICATION,
      rejectionReason: null,
      submittedAt: at,
    });
  }

  private assertStatus(action: string, ...allowed: VerificationStatus[]): void {
    if (!allowed.includes(this.verificationStatus)) {
      throw new InvalidVerificationTransitionError(this.verificationStatus, action);
    }
  }

  private with(changes: Partial<ProviderProps>): Provider {
    return new Provider(Object.assign({}, this, changes));
  }
}
