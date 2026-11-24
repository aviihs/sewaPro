import { beforeEach, describe, expect, it } from 'vitest';
import { aBooking, aBookingDetail } from '../../../../test/unit/fixtures/bookings.js';
import { aProvider } from '../../../../test/unit/fixtures/providers.js';
import { FakeUnitOfWork, FixedClock, mockOf, userOf } from '../../../../test/unit/mock.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { type Booking } from '../domain/booking.js';
import { BookingRepository } from '../domain/booking.repository.js';
import { BookingNotFoundError, InvalidBookingTransitionError } from '../domain/bookings.errors.js';
import {
  AcceptBookingUseCase,
  CancelBookingUseCase,
  CompleteJobUseCase,
  MarkOnTheWayUseCase,
  RejectBookingUseCase,
  StartJobUseCase,
} from './booking-actions.use-cases.js';
import {
  GetBookingDetailUseCase,
  ListMyBookingsUseCase,
  ListProviderBookingsUseCase,
} from './booking-queries.use-cases.js';
import { BookingTransitionService } from './booking-transitions.js';

const customer = userOf('CUSTOMER', 'cust-1');
const provider = userOf('PROVIDER', 'user-p1');
const page = { page: 1, limit: 20 };

describe('booking actions', () => {
  const bookings = mockOf<BookingRepository>();
  const providers = mockOf<ProviderRepository>();
  const events = mockOf<DomainEventPublisher>();
  const uow = new FakeUnitOfWork();
  const transitions = new BookingTransitionService(
    bookings,
    providers,
    events,
    new FixedClock(),
    uow,
  );

  const stored = (status: Booking['status']) => {
    bookings.findById.mockResolvedValue(aBooking({ status }));
    bookings.saveTransition.mockImplementation((b: Booking) => Promise.resolve(b));
    bookings.findDetail.mockImplementation(() => Promise.resolve(aBookingDetail()));
  };

  beforeEach(() => {
    stored('PENDING');
  });

  it('lets the provider accept, persisting history and publishing the change', async () => {
    await new AcceptBookingUseCase(transitions).execute(provider, 'bk-1');
    expect(bookings.saveTransition).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACCEPTED' }),
      expect.objectContaining({ from: 'PENDING', to: 'ACCEPTED', actorId: 'user-p1' }),
    );
    const [event] = events.publish.mock.calls[0] ?? [];
    expect(event).toMatchObject({
      name: 'booking.status-changed',
      data: { from: 'PENDING', to: 'ACCEPTED' },
    });
  });

  it('runs the whole provider lifecycle and counts the completed job', async () => {
    await new RejectBookingUseCase(transitions).execute(provider, 'bk-1', 'Busy');
    stored('ACCEPTED');
    await new MarkOnTheWayUseCase(transitions).execute(provider, 'bk-1');
    stored('ON_THE_WAY');
    await new StartJobUseCase(transitions).execute(provider, 'bk-1');
    stored('IN_PROGRESS');
    await new CompleteJobUseCase(transitions).execute(provider, 'bk-1', 1800);
    expect(providers.incrementCompletedJobs).toHaveBeenCalledWith('prov-1');
    expect(uow.runs).toBeGreaterThanOrEqual(4);
  });

  it('lets the customer cancel their own booking', async () => {
    await new CancelBookingUseCase(transitions).execute(customer, 'bk-1', 'Changed plans');
    expect(bookings.saveTransition.mock.calls[0]?.[0].cancelReason).toBe('Changed plans');
    await new CancelBookingUseCase(transitions).execute(customer, 'bk-1', null);
  });

  it('hides bookings of other parties and missing ones (404)', async () => {
    await expect(
      new AcceptBookingUseCase(transitions).execute(userOf('PROVIDER', 'other'), 'bk-1'),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(
      new CancelBookingUseCase(transitions).execute(userOf('CUSTOMER', 'other'), 'bk-1', null),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
    bookings.findById.mockResolvedValue(null);
    await expect(new StartJobUseCase(transitions).execute(provider, 'x')).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
  });

  it('refuses illegal moves without saving', async () => {
    await expect(new StartJobUseCase(transitions).execute(provider, 'bk-1')).rejects.toBeInstanceOf(
      InvalidBookingTransitionError,
    );
    expect(bookings.saveTransition).not.toHaveBeenCalled();
  });

  it('fails if the booking disappears before the detail is read', async () => {
    bookings.findDetail.mockResolvedValue(null);
    await expect(
      new AcceptBookingUseCase(transitions).execute(provider, 'bk-1'),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });
});

describe('booking queries', () => {
  const bookings = mockOf<BookingRepository>();
  const providers = mockOf<ProviderRepository>();

  it('lists the customer and provider bookings', async () => {
    bookings.listForCustomer.mockResolvedValue(PaginatedResult.of([], 0, page));
    bookings.listForProvider.mockResolvedValue(PaginatedResult.of([], 0, page));
    await new ListMyBookingsUseCase(bookings).execute(customer, { status: 'PENDING' }, page);
    expect(bookings.listForCustomer).toHaveBeenCalledWith('cust-1', { status: 'PENDING' }, page);

    providers.findByUserId.mockResolvedValueOnce(aProvider()).mockResolvedValueOnce(null);
    const useCase = new ListProviderBookingsUseCase(bookings, providers);
    await useCase.execute(provider, {}, page);
    expect(bookings.listForProvider).toHaveBeenCalledWith('prov-1', {}, page);
    expect((await useCase.execute(provider, {}, page)).items).toEqual([]);
  });

  it('returns detail only to the parties', async () => {
    bookings.findDetail.mockResolvedValue(aBookingDetail());
    const useCase = new GetBookingDetailUseCase(bookings);
    await expect(useCase.execute(customer, 'bk-1', 'customer')).resolves.toBeDefined();
    await expect(useCase.execute(provider, 'bk-1', 'provider')).resolves.toBeDefined();
    await expect(useCase.execute(provider, 'bk-1', 'customer')).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
    bookings.findDetail.mockResolvedValue(null);
    await expect(useCase.execute(customer, 'x', 'customer')).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
  });
});
