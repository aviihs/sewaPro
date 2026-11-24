import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import {
  type Prisma,
  type Review as ReviewRow,
} from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type NewReview,
  type RatingAggregate,
  type Review,
  type ReviewModerationFilter,
  ReviewRepository,
  type ReviewView,
} from '../domain/review.js';
import { ReviewAlreadyExistsError } from '../domain/reviews.errors.js';

const toReview = (row: ReviewRow): Review => ({
  id: row.id,
  bookingId: row.bookingId,
  customerId: row.customerId,
  providerId: row.providerId,
  overall: row.overall,
  serviceQuality: row.serviceQuality,
  professionalism: row.professionalism,
  punctuality: row.punctuality,
  communication: row.communication,
  comment: row.comment,
  hiddenAt: row.hiddenAt,
  hiddenReason: row.hiddenReason,
  createdAt: row.createdAt,
});

const withAuthor = { customer: { select: { fullName: true } } } satisfies Prisma.ReviewInclude;
type ViewRow = Prisma.ReviewGetPayload<{ include: typeof withAuthor }>;
const toView = (row: ViewRow): ReviewView => ({
  review: toReview(row),
  customerName: row.customer.fullName,
});

@Injectable()
export class PrismaReviewRepository extends ReviewRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async create(review: NewReview): Promise<Review> {
    try {
      return toReview(await this.db.review.create({ data: review }));
    } catch (error) {
      if (isUniqueViolation(error, 'booking_id')) throw new ReviewAlreadyExistsError();
      throw error;
    }
  }

  async findById(id: string): Promise<Review | null> {
    const row = await this.db.review.findUnique({ where: { id } });
    return row ? toReview(row) : null;
  }

  async findView(id: string): Promise<ReviewView | null> {
    const row = await this.db.review.findUnique({ where: { id }, include: withAuthor });
    return row ? toView(row) : null;
  }

  async hide(id: string, by: string, reason: string, at: Date): Promise<Review> {
    const row = await this.db.review.update({
      where: { id },
      data: { hiddenAt: at, hiddenById: by, hiddenReason: reason },
    });
    return toReview(row);
  }

  async lockProvider(providerId: string): Promise<void> {
    await this.db.$queryRaw`SELECT 1 FROM providers WHERE id = ${providerId}::uuid FOR UPDATE`;
  }

  async aggregateVisible(providerId: string): Promise<RatingAggregate> {
    const result = await this.db.review.aggregate({
      where: { providerId, hiddenAt: null },
      _avg: { overall: true },
      _count: { _all: true },
    });
    return { average: result._avg.overall ?? 0, count: result._count._all };
  }

  async listVisibleForProvider(
    providerId: string,
    page: PageRequest,
  ): Promise<PaginatedResult<ReviewView>> {
    return this.page({ providerId, hiddenAt: null }, page);
  }

  async listForModeration(
    filter: ReviewModerationFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<ReviewView>> {
    const hidden =
      filter.hidden === undefined ? {} : { hiddenAt: filter.hidden ? { not: null } : null };
    return this.page(
      {
        ...hidden,
        providerId: filter.providerId,
        ...(filter.maxOverall ? { overall: { lte: filter.maxOverall } } : {}),
      },
      page,
    );
  }

  private async page(
    where: Prisma.ReviewWhereInput,
    page: PageRequest,
  ): Promise<PaginatedResult<ReviewView>> {
    const [rows, total] = await Promise.all([
      this.db.review.findMany({
        where,
        include: withAuthor,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toOffset(page),
      }),
      this.db.review.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toView), total, page);
  }
}
