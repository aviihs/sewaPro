import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import {
  type ProviderSearchFilter,
  type ProviderSearchHit,
  ProviderSearchReader,
  type PublicProviderProfile,
} from '../domain/search.js';
import { InvalidSearchQueryError } from '../domain/search.errors.js';
import {
  GetPublicProviderUseCase,
  type SearchProvidersQuery,
  SearchProvidersUseCase,
} from './search.use-cases.js';

// FixedClock: 2030-01-07T04:15Z = Monday 2030-01-07 10:00 in Nepal.
const page = { page: 1, limit: 20 };
const KTM = { lat: 27.7172, lng: 85.324 };

const aHit = (overrides: Partial<ProviderSearchHit> = {}): ProviderSearchHit => ({
  providerId: 'prov-1',
  displayName: 'Thapa Electricals',
  ratingAverage: 4.5,
  ratingCount: 10,
  experienceYears: 6,
  completedJobs: 12,
  minPrice: 1500,
  distanceKm: 1.2,
  services: [],
  ...overrides,
});

describe('SearchProvidersUseCase', () => {
  const reader = mockOf<ProviderSearchReader>();
  const useCase = new SearchProvidersUseCase(reader, new FixedClock());

  beforeEach(() => {
    reader.search.mockReset();
    reader.search.mockResolvedValue({ items: [aHit()], totalItems: 21 });
  });

  const run = (query: Partial<SearchProvidersQuery>): Promise<unknown> =>
    useCase.execute({ ...page, ...query });
  const lastFilter = (): ProviderSearchFilter => reader.search.mock.calls[0][0];

  it('defaults to nearest first within 10 km when a location is given', async () => {
    const result = await useCase.execute({ ...page, ...KTM });
    expect(lastFilter()).toMatchObject({
      origin: { latitude: KTM.lat, longitude: KTM.lng },
      radiusKm: 10,
      sortBy: 'distance',
      page,
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta).toMatchObject({ totalItems: 21, totalPages: 2, hasNextPage: true });
  });

  it('defaults to best rated without a location', async () => {
    await run({});
    expect(lastFilter().origin).toBeUndefined();
    expect(lastFilter().sortBy).toBe('rating');
  });

  it('passes the other filters through and drops a blank q', async () => {
    await run({
      ...KTM,
      radiusKm: 25,
      categoryId: 'cat-1',
      serviceId: 'svc-1',
      minRating: 4,
      minPrice: 500,
      maxPrice: 500,
      minExperience: 3,
      q: '   ',
      sortBy: 'price',
    });
    expect(lastFilter()).toMatchObject({
      radiusKm: 25,
      categoryId: 'cat-1',
      serviceId: 'svc-1',
      minRating: 4,
      minPrice: 500,
      maxPrice: 500,
      minExperience: 3,
      sortBy: 'price',
    });
    expect(lastFilter().q).toBeUndefined();
  });

  it('trims q', async () => {
    await run({ q: '  wiring ' });
    expect(lastFilter().q).toBe('wiring');
  });

  it('resolves availableOn to its weekday, accepting today and the horizon', async () => {
    await run({ availableOn: '2030-01-07' });
    expect(lastFilter().availableOn).toEqual({ date: '2030-01-07', dayOfWeek: 1 });
    reader.search.mockClear();
    await run({ availableOn: '2031-01-07' });
    expect(lastFilter().availableOn).toEqual({ date: '2031-01-07', dayOfWeek: 2 });
  });

  it.each([
    [{ lat: KTM.lat }, 'LOCATION_INCOMPLETE'],
    [{ lng: KTM.lng }, 'LOCATION_INCOMPLETE'],
    [{ radiusKm: 5 }, 'RADIUS_NEEDS_LOCATION'],
    [{ sortBy: 'distance' as const }, 'DISTANCE_SORT_NEEDS_LOCATION'],
    [{ minPrice: 2000, maxPrice: 1000 }, 'PRICE_RANGE_INVERTED'],
    [{ availableOn: '2030-01-06' }, 'AVAILABLE_ON_OUT_OF_RANGE'],
    [{ availableOn: '2031-01-08' }, 'AVAILABLE_ON_OUT_OF_RANGE'],
    [{ availableOn: '2030-02-30' }, 'AVAILABLE_ON_OUT_OF_RANGE'],
  ])('rejects %o with %s', async (query, reason) => {
    const error = await run(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSearchQueryError);
    expect((error as InvalidSearchQueryError).details).toEqual({ reason });
    expect(reader.search).not.toHaveBeenCalled();
  });
});

describe('GetPublicProviderUseCase', () => {
  const reader = mockOf<ProviderSearchReader>();
  const storage = mockOf<FileStorage>();
  const useCase = new GetPublicProviderUseCase(reader, storage);

  const profile: PublicProviderProfile = {
    id: 'prov-1',
    displayName: 'Thapa Electricals',
    bio: null,
    experienceYears: 6,
    ratingAverage: 4.5,
    ratingCount: 10,
    completedJobs: 12,
    serviceRadiusKm: 10,
    isAvailable: true,
    verifiedAt: new Date('2030-01-01T00:00:00Z'),
    memberSince: new Date('2029-12-01T00:00:00Z'),
    services: [],
    portfolio: [{ id: 'img-1', storageKey: 'portfolio/a.jpg', caption: 'Panel' }],
    weeklyHours: [{ dayOfWeek: 1, startMinute: 360, endMinute: 1200 }],
  };

  it('returns the profile with public portfolio URLs', async () => {
    reader.findPublic.mockResolvedValue(profile);
    storage.publicUrl.mockImplementation((key: string) => `https://cdn/${key}`);
    const view = await useCase.execute('prov-1');
    expect(reader.findPublic).toHaveBeenCalledWith('prov-1');
    expect(view.profile).toBe(profile);
    expect(view.portfolio).toEqual([
      { id: 'img-1', url: 'https://cdn/portfolio/a.jpg', caption: 'Panel' },
    ]);
  });

  it('throws not found for providers that are not public', async () => {
    reader.findPublic.mockResolvedValue(null);
    await expect(useCase.execute('prov-x')).rejects.toBeInstanceOf(ProviderNotFoundError);
  });
});
