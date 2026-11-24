import { describe, expect, it } from 'vitest';
import { mockOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { BookingStatusChangedEvent } from '../../bookings/domain/booking.events.js';
import { DisputeOpenedEvent } from '../../disputes/domain/dispute.js';
import { QuotationRespondedEvent } from '../../quotations/domain/quotation.events.js';
import { AuditLogReader } from '../domain/audit-log.js';
import {
  ListAuditLogsUseCase,
  RecordAuditUseCase,
  bookingAudit,
  disputeAudit,
  eventActor,
  quotationAudit,
} from './audit.use-cases.js';

const at = new Date();
const parties = {
  bookingId: 'bk-1',
  customerId: 'cust-1',
  providerId: 'prov-1',
  providerUserId: 'user-p1',
};

describe('audit from events', () => {
  it('audits sensitive booking transitions only', () => {
    const event = (to: 'CANCELLED' | 'ACCEPTED') =>
      new BookingStatusChangedEvent(
        {
          ...parties,
          from: 'PENDING',
          to,
          actorId: 'cust-1',
          actorRole: 'CUSTOMER',
          reason: 'Plans changed',
          finalAmount: null,
        },
        at,
      );
    expect(bookingAudit(event('CANCELLED'))).toMatchObject({
      action: 'booking.cancelled',
      entityType: 'Booking',
      entityId: 'bk-1',
      actor: { id: 'cust-1', role: 'CUSTOMER', context: { ipAddress: null } },
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED', reason: 'Plans changed' },
    });
    expect(bookingAudit(event('ACCEPTED'))).toBeNull();
  });

  it('maps system actors to null', () => {
    expect(eventActor(null, 'SYSTEM')).toBeNull();
    expect(eventActor('x', 'SYSTEM')).toBeNull();
  });

  it('audits opened disputes and declined quotations', () => {
    const dispute = new DisputeOpenedEvent(
      {
        disputeId: 'd',
        bookingId: 'bk-1',
        customerId: 'c',
        providerUserId: 'p',
        raisedByRole: 'CUSTOMER',
        reason: 'r',
      },
      at,
    );
    expect(disputeAudit(dispute)).toMatchObject({ action: 'dispute.opened', entityId: 'd' });
    const quote = {
      quotationId: 'q',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      providerUserId: 'p',
      total: 10,
    };
    expect(
      quotationAudit(new QuotationRespondedEvent({ ...quote, accepted: false }, at)),
    ).toMatchObject({ action: 'quotation.declined' });
    expect(
      quotationAudit(new QuotationRespondedEvent({ ...quote, accepted: true }, at)),
    ).toBeNull();
  });

  it('records non-null entries and lists with filters', async () => {
    const trail = mockOf<AuditTrail>();
    const record = new RecordAuditUseCase(trail);
    await record.execute(null);
    await record.execute({ actor: null, action: 'a.b', entityType: 'X', entityId: null });
    expect(trail.record).toHaveBeenCalledOnce();

    const reader = mockOf<AuditLogReader>();
    const page = { page: 1, limit: 20 };
    reader.list.mockResolvedValue(PaginatedResult.of([], 0, page));
    await new ListAuditLogsUseCase(reader).execute({ action: 'provider.verified' }, page);
    expect(reader.list).toHaveBeenCalledWith({ action: 'provider.verified' }, page);
  });
});
