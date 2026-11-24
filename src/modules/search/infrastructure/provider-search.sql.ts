import { toOffset } from '../../../common/utils/pagination.js';
import { Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { type ProviderSearchFilter, SearchSort } from '../domain/search.js';

type Sql = Prisma.Sql;

/** `ST_MakePoint` takes longitude first. Geography distances are in metres. */
const pointOf = (filter: ProviderSearchFilter): Sql | null =>
  filter.origin
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${filter.origin.longitude}, ${filter.origin.latitude}), 4326)::geography`
    : null;

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Rules every publicly listed provider must pass. */
function providerConditions(filter: ProviderSearchFilter, point: Sql | null): Sql[] {
  const conditions: Sql[] = [
    Prisma.sql`p.verification_status = 'VERIFIED'`,
    Prisma.sql`p.is_available`,
    Prisma.sql`p.deleted_at IS NULL`,
    Prisma.sql`u.status <> 'SUSPENDED'`,
    Prisma.sql`u.deleted_at IS NULL`,
  ];
  if (point) {
    // The first predicate uses the GiST index; the second keeps the customer inside
    // the provider's own travel radius.
    conditions.push(Prisma.sql`ST_DWithin(p.location, ${point}, ${filter.radiusKm * 1000})`);
    conditions.push(Prisma.sql`ST_DWithin(p.location, ${point}, p.service_radius_km * 1000)`);
  }
  if (filter.minRating !== undefined) {
    conditions.push(Prisma.sql`p.rating_average >= ${filter.minRating}`);
  }
  if (filter.minExperience !== undefined) {
    conditions.push(Prisma.sql`p.experience_years >= ${filter.minExperience}`);
  }
  if (filter.availableOn) {
    const { date, dayOfWeek } = filter.availableOn;
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM availability_rules ar
      WHERE ar.provider_id = p.id AND ar.day_of_week = ${dayOfWeek})`);
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM blocked_dates bd
      WHERE bd.provider_id = p.id AND bd.date = ${date}::date)`);
  }
  return conditions;
}

/** Rules for each offering row; a provider is listed when at least one row passes. */
function offeringConditions(filter: ProviderSearchFilter): Sql[] {
  const conditions: Sql[] = [];
  if (filter.serviceId) conditions.push(Prisma.sql`s.id = ${filter.serviceId}::uuid`);
  if (filter.categoryId) conditions.push(Prisma.sql`c.id = ${filter.categoryId}::uuid`);
  if (filter.minPrice !== undefined) conditions.push(Prisma.sql`ps.price >= ${filter.minPrice}`);
  if (filter.maxPrice !== undefined) conditions.push(Prisma.sql`ps.price <= ${filter.maxPrice}`);
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`;
    conditions.push(Prisma.sql`(p.business_name ILIKE ${pattern} OR s.name ILIKE ${pattern})`);
  }
  return conditions;
}

/** Providers joined to their live offerings, filtered. Shared by the page and the count. */
function fromWhere(filter: ProviderSearchFilter, point: Sql | null): Sql {
  const conditions = [...providerConditions(filter, point), ...offeringConditions(filter)];
  return Prisma.sql`
    FROM providers p
    JOIN users u ON u.id = p.user_id
    JOIN provider_services ps ON ps.provider_id = p.id AND ps.is_active
    JOIN services s ON s.id = ps.service_id AND s.is_active AND s.deleted_at IS NULL
    JOIN categories c ON c.id = s.category_id AND c.is_active AND c.deleted_at IS NULL
    WHERE ${Prisma.join(conditions, ' AND ')}`;
}

/**
 * One row per matching provider, with its matching offerings aggregated as JSON,
 * so the page needs no follow-up queries.
 */
function matchesCte(filter: ProviderSearchFilter): Sql {
  const point = pointOf(filter);
  const distance = point ? Prisma.sql`ST_Distance(p.location, ${point})` : Prisma.sql`NULL::float8`;
  return Prisma.sql`
    WITH matches AS (
      SELECT
        p.id,
        COALESCE(p.business_name, u.full_name) AS display_name,
        p.rating_average::float8 AS rating_average,
        p.rating_count,
        p.experience_years,
        p.completed_jobs,
        MIN(ps.price)::float8 AS min_price,
        ${distance} AS distance_m,
        json_agg(json_build_object(
          'serviceId', s.id, 'serviceName', s.name,
          'categoryId', c.id, 'categoryName', c.name,
          'pricingType', ps.pricing_type, 'price', ps.price::float8
        ) ORDER BY s.name, s.id) AS services
      ${fromWhere(filter, point)}
      GROUP BY p.id, u.full_name
    )`;
}

/** Every sort ends with `id` so pages are stable. */
const ORDER_BY: Readonly<Record<SearchSort, Sql>> = {
  [SearchSort.DISTANCE]: Prisma.sql`distance_m ASC, rating_average DESC, id ASC`,
  [SearchSort.RATING]: Prisma.sql`rating_average DESC, rating_count DESC, id ASC`,
  [SearchSort.PRICE]: Prisma.sql`min_price ASC NULLS LAST, rating_average DESC, id ASC`,
};

export function searchPageSql(filter: ProviderSearchFilter): Sql {
  const { skip, take } = toOffset(filter.page);
  return Prisma.sql`${matchesCte(filter)}
    SELECT id, display_name, rating_average, rating_count, experience_years, completed_jobs,
           min_price, distance_m, services
    FROM matches
    ORDER BY ${ORDER_BY[filter.sortBy]}
    LIMIT ${take} OFFSET ${skip}`;
}

export function searchCountSql(filter: ProviderSearchFilter): Sql {
  return Prisma.sql`SELECT COUNT(DISTINCT p.id)::int AS total ${fromWhere(filter, pointOf(filter))}`;
}
