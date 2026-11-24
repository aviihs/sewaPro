import { type PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { slugify } from '../../../common/utils/slugify.js';
import { type PrismaClient, type UserRole, type UserStatus } from '../generated/client.js';
import { SEED_CATEGORIES } from './seed-catalog.js';
import { SEED_CUSTOMERS, SEED_PROVIDERS, type SeedProvider } from './seed-data.js';

export interface SeedOptions {
  readonly admin: { readonly email: string; readonly phone: string; readonly password: string };
  /** Password for sample providers and customers; sample data is skipped when absent. */
  readonly samplePassword?: string;
}

export interface SeedSummary {
  readonly categories: number;
  readonly services: number;
  readonly providers: number;
  readonly customers: number;
}

/** Sunday to Friday, 09:00 to 18:00 Nepal time (Saturday is the weekly holiday). */
const WORKING_DAYS = [0, 1, 2, 3, 4, 5];
const DAY_START = 9 * 60;
const DAY_END = 18 * 60;

interface UserInput {
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
  readonly password: string;
}

/** Creates the user once; re-running never resets an existing password or profile. */
async function ensureUser(prisma: PrismaClient, hasher: PasswordHasher, input: UserInput) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) return existing;
  const { password, ...data } = input;
  return prisma.user.create({
    data: { ...data, passwordHash: await hasher.hash(password), phoneVerifiedAt: new Date() },
  });
}

async function seedCatalog(prisma: PrismaClient): Promise<number> {
  let services = 0;
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const slug = slugify(category.name);
    const row = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name: category.name, slug, description: category.description, sortOrder: index },
    });
    for (const name of category.services) {
      const serviceSlug = slugify(name);
      await prisma.service.upsert({
        where: { slug: serviceSlug },
        update: {},
        create: { categoryId: row.id, name, slug: serviceSlug },
      });
      services += 1;
    }
  }
  return services;
}

async function seedProvider(
  prisma: PrismaClient,
  hasher: PasswordHasher,
  sample: SeedProvider,
  password: string,
): Promise<void> {
  const user = await ensureUser(prisma, hasher, {
    role: 'PROVIDER',
    status: 'ACTIVE',
    fullName: sample.fullName,
    phone: sample.phone,
    email: sample.email,
    password,
  });
  const now = new Date();
  const provider = await prisma.provider.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      businessName: sample.businessName,
      bio: `${sample.businessName}, serving ${sample.area} and nearby areas.`,
      experienceYears: sample.experienceYears,
      verificationStatus: 'VERIFIED',
      submittedAt: now,
      verifiedAt: now,
      latitude: sample.latitude,
      longitude: sample.longitude,
      serviceRadiusKm: 10,
      settings: { create: {} },
    },
  });
  for (const offer of sample.offers) {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: slugify(offer.service) },
    });
    await prisma.providerService.upsert({
      where: { providerId_serviceId: { providerId: provider.id, serviceId: service.id } },
      update: {},
      create: {
        providerId: provider.id,
        serviceId: service.id,
        pricingType: offer.pricingType,
        price: offer.price,
      },
    });
  }
  const hasRules = await prisma.availabilityRule.count({ where: { providerId: provider.id } });
  if (hasRules === 0) {
    await prisma.availabilityRule.createMany({
      data: WORKING_DAYS.map((dayOfWeek) => ({
        providerId: provider.id,
        dayOfWeek,
        startMinute: DAY_START,
        endMinute: DAY_END,
      })),
    });
  }
}

/** Idempotent: safe to run any number of times against the same database. */
export async function seed(
  prisma: PrismaClient,
  hasher: PasswordHasher,
  options: SeedOptions,
): Promise<SeedSummary> {
  await ensureUser(prisma, hasher, {
    role: 'ADMIN',
    status: 'ACTIVE',
    fullName: 'SewaPro Admin',
    ...options.admin,
  });
  const services = await seedCatalog(prisma);
  const { samplePassword } = options;
  if (samplePassword === undefined) {
    return { categories: SEED_CATEGORIES.length, services, providers: 0, customers: 0 };
  }
  for (const sample of SEED_PROVIDERS) {
    await seedProvider(prisma, hasher, sample, samplePassword);
  }
  for (const customer of SEED_CUSTOMERS) {
    await ensureUser(prisma, hasher, {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      ...customer,
      password: samplePassword,
    });
  }
  return {
    categories: SEED_CATEGORIES.length,
    services,
    providers: SEED_PROVIDERS.length,
    customers: SEED_CUSTOMERS.length,
  };
}
