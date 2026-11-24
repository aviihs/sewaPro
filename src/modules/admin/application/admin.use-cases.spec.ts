import { beforeEach, describe, expect, it } from 'vitest';
import { aBookingDetail } from '../../../../test/unit/fixtures/bookings.js';
import { aProvider } from '../../../../test/unit/fixtures/providers.js';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Cache } from '../../../common/ports/cache.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { RefreshTokenRepository } from '../../auth/domain/refresh-token.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { type UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import {
  CannotChangeOwnStatusError,
  InvalidStatusChangeError,
  UserNotFoundError,
} from '../../users/domain/users.errors.js';
import { AdminStatsReader } from '../domain/admin-stats.js';
import { GetBookingForAdminUseCase, ListAllBookingsUseCase } from './admin-bookings.use-cases.js';
import {
  GetAdminDashboardUseCase,
  GetBookingReportUseCase,
  GetGrowthReportUseCase,
} from './admin-reports.use-cases.js';
import {
  ListUsersUseCase,
  ReactivateUserUseCase,
  SuspendUserUseCase,
  UserStatusChanger,
} from './admin-users.use-cases.js';

const admin = actorOf('ADMIN', 'adm-1');
const page = { page: 1, limit: 20 };
const totals = {
  customers: 3,
  providers: 2,
  verifiedProviders: 1,
  pendingVerification: 1,
  suspendedUsers: 0,
  bookingsByStatus: { PENDING: 1 },
  openDisputes: 0,
};

describe('admin reports', () => {
  const stats = mockOf<AdminStatsReader>();

  it('builds the dashboard with six zero-filled Nepal months', async () => {
    stats.totals.mockResolvedValue(totals);
    stats.growth.mockResolvedValue([
      { period: '2030-01', newCustomers: 2, newProviders: 1, newBookings: 4 },
    ]);
    stats.recentActivity.mockResolvedValue([]);
    const dashboard = await new GetAdminDashboardUseCase(
      stats,
      new FixedClock(new Date('2030-01-15T00:00:00Z')),
    ).execute();
    expect(dashboard.monthlyGrowth.map((g) => g.period)).toEqual([
      '2029-08',
      '2029-09',
      '2029-10',
      '2029-11',
      '2029-12',
      '2030-01',
    ]);
    expect(dashboard.monthlyGrowth.at(-1)).toMatchObject({ newBookings: 4 });
    expect(stats.growth).toHaveBeenCalledWith({
      from: '2029-08-01',
      to: '2030-01-15',
      unit: 'month',
    });
    expect(stats.recentActivity).toHaveBeenCalledWith(10);
  });

  it('fills booking and growth reports for every period', async () => {
    stats.bookingReport.mockResolvedValue([
      { period: '2030-01-02', created: 2, completed: 1, cancelled: 0, completedAmount: 1500 },
    ]);
    stats.growth.mockResolvedValue([]);
    const range = { from: '2030-01-01', to: '2030-01-03', unit: 'day' as const };
    const report = await new GetBookingReportUseCase(stats).execute(range);
    expect(report.map((r) => r.created)).toEqual([0, 2, 0]);
    expect(await new GetGrowthReportUseCase(stats).execute(range)).toHaveLength(3);
  });
});

describe('admin users', () => {
  const users = mockOf<UserRepository>();
  const tokens = mockOf<RefreshTokenRepository>();
  const audit = mockOf<AuditTrail>();
  const cache = mockOf<Cache>();
  const providers = mockOf<ProviderRepository>();
  const clock = new FixedClock();
  const changer = new UserStatusChanger(users, tokens, audit, cache, clock, new FakeUnitOfWork());

  beforeEach(() => {
    users.findById.mockResolvedValue(aUser({ id: 'u-1' }));
    users.setStatus.mockImplementation((id: string, status: UserStatus) =>
      Promise.resolve(aUser({ id, status })),
    );
    providers.findByUserId.mockResolvedValue(null);
  });

  it('lists users with filters', async () => {
    users.list.mockResolvedValue(PaginatedResult.of([], 0, page));
    await new ListUsersUseCase(users).execute({ role: 'PROVIDER' }, page);
    expect(users.list).toHaveBeenCalledWith({ role: 'PROVIDER' }, page);
  });

  it('suspends: revokes sessions, audits, and clears the status cache', async () => {
    const result = await new SuspendUserUseCase(changer).execute(admin, 'u-1', 'Fake bookings');
    expect(result.status).toBe('SUSPENDED');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u-1', clock.now());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.suspended',
        after: { status: 'SUSPENDED', reason: 'Fake bookings' },
      }),
    );
    expect(cache.delete).toHaveBeenCalledWith({ name: 'auth:user-status:u-1' });
  });

  it('refuses self-suspension, double suspension and unknown users', async () => {
    const suspend = new SuspendUserUseCase(changer);
    await expect(suspend.execute(admin, 'adm-1', 'x')).rejects.toBeInstanceOf(
      CannotChangeOwnStatusError,
    );
    users.findById.mockResolvedValueOnce(aUser({ status: 'SUSPENDED' }));
    await expect(suspend.execute(admin, 'u-1', 'x')).rejects.toBeInstanceOf(
      InvalidStatusChangeError,
    );
    users.findById.mockResolvedValueOnce(null);
    await expect(suspend.execute(admin, 'u-1', 'x')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('reactivates to ACTIVE, or PENDING for unverified providers', async () => {
    const reactivate = new ReactivateUserUseCase(changer, providers);
    users.findById.mockResolvedValue(aUser({ id: 'u-1', status: 'SUSPENDED' }));
    await expect(reactivate.execute(admin, 'u-1', 'Appeal accepted')).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();

    users.findById.mockResolvedValue(aUser({ id: 'u-1', role: 'PROVIDER', status: 'SUSPENDED' }));
    providers.findByUserId.mockResolvedValue(aProvider());
    await expect(reactivate.execute(admin, 'u-1', 'Appeal accepted')).resolves.toMatchObject({
      status: 'PENDING',
    });

    users.findById.mockResolvedValue(aUser({ id: 'u-1', status: 'ACTIVE' }));
    await expect(reactivate.execute(admin, 'u-1', 'x')).rejects.toBeInstanceOf(
      InvalidStatusChangeError,
    );
  });
});

describe('admin bookings', () => {
  const bookings = mockOf<BookingRepository>();

  it('lists all bookings and returns details', async () => {
    bookings.listAll.mockResolvedValue(PaginatedResult.of([], 0, page));
    await new ListAllBookingsUseCase(bookings).execute({ status: 'DISPUTED' }, page);
    expect(bookings.listAll).toHaveBeenCalledWith({ status: 'DISPUTED' }, page);

    bookings.findDetail.mockResolvedValueOnce(aBookingDetail()).mockResolvedValueOnce(null);
    const get = new GetBookingForAdminUseCase(bookings);
    await expect(get.execute('bk-1')).resolves.toBeDefined();
    await expect(get.execute('x')).rejects.toBeInstanceOf(BookingNotFoundError);
  });
});
