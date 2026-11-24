import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import {
  type Dispute,
  type DisputeListFilter,
  DisputeRepository,
  type DisputeStatus,
} from '../domain/dispute.js';
import { DisputeNotFoundError } from '../domain/disputes.errors.js';

/** Parties see disputes on their bookings; admins see all (optionally by status). */
@Injectable()
export class ListDisputesUseCase {
  constructor(private readonly disputes: DisputeRepository) {}

  execute(
    user: AuthenticatedUser,
    status: DisputeStatus | undefined,
    page: PageRequest,
  ): Promise<PaginatedResult<Dispute>> {
    const filter: DisputeListFilter =
      user.role === Role.ADMIN ? { status } : { status, partyUserId: user.id };
    return this.disputes.list(filter, page);
  }
}

/** A dispute visible to admins and to the booking's two parties; 404 for anyone else. */
@Injectable()
export class GetDisputeUseCase {
  constructor(
    private readonly disputes: DisputeRepository,
    private readonly bookings: BookingRepository,
  ) {}

  async execute(user: AuthenticatedUser, disputeId: string): Promise<Dispute> {
    const dispute = await this.disputes.findById(disputeId);
    if (!dispute) throw new DisputeNotFoundError();
    if (user.role === Role.ADMIN) return dispute;
    const booking = await this.bookings.findById(dispute.bookingId);
    const isParty = booking?.isCustomer(user.id) === true || booking?.isProvider(user.id) === true;
    if (!isParty) throw new DisputeNotFoundError();
    return dispute;
  }
}
